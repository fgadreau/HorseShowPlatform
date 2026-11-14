begin;

create table public.show_horse_fees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  name_fr text not null,
  name_en text not null,
  amount numeric(12, 2) not null check (amount > 0 and amount = round(amount, 2)),
  taxable boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_by_user_id uuid not null references public.user_profiles(id),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint show_horse_fees_names_check check (
    length(btrim(name_fr)) between 1 and 120
    and length(btrim(name_en)) between 1 and 120
  ),
  unique (show_id, id),
  foreign key (organization_id, show_id) references public.shows(organization_id, id)
);

create index show_horse_fees_show_order
  on public.show_horse_fees(show_id, is_active desc, sort_order, created_at, id);

alter table public.show_horse_fees enable row level security;
revoke all on table public.show_horse_fees from public, anon, authenticated, service_role;

create function public.show_horse_fee_staff(p_show uuid)
returns public.shows
language plpgsql
stable
security definer
set search_path = ''
as $$
declare target public.shows;
begin
  select * into target from public.shows where id = p_show;
  if not found or not (
    public.is_platform_admin()
    or public.is_org_member(target.organization_id, array['admin', 'secretary'])
    or public.has_show_role(target.id, array['secretary'])
  ) then
    raise exception 'SHOW_HORSE_FEE_FORBIDDEN' using errcode = '42501';
  end if;
  return target;
end;
$$;

create function public.list_show_horse_fees(p_show uuid)
returns setof public.show_horse_fees
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.show_horse_fee_staff(p_show);
  return query
    select fee.*
    from public.show_horse_fees fee
    where fee.show_id = p_show
    order by fee.is_active desc, fee.sort_order, fee.created_at, fee.id;
end;
$$;

create function public.sync_account_show_horse_fees(
  p_org uuid,
  p_show uuid,
  p_payer uuid,
  p_horse uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fee public.show_horse_fees;
  selected record;
  v_line_key text;
  charge uuid;
  folio_state text;
begin
  if not public.reservation_uses_accounts(p_show) then return; end if;

  select e.owner_contact_id, h.name as horse_name
  into selected
  from public.entries e
  join public.horses h on h.id = e.horse_id
  where e.organization_id = p_org
    and e.show_id = p_show
    and e.payer_contact_id = p_payer
    and e.horse_id = p_horse
    and e.status not in ('draft', 'cancelled')
  order by e.created_at, e.id
  limit 1;

  select f.state into folio_state
  from public.reservation_billing_contexts link
  join public.billing_folios f on f.billing_context_id = link.context_id
  join public.billing_customer_accounts account on account.id = f.payer_customer_account_id
  where link.show_id = p_show and account.payer_contact_id = p_payer;

  -- A final invoice is immutable. A later configuration change applies only to
  -- open accounts and future invoices.
  if folio_state is not null and folio_state <> 'open' then return; end if;

  for fee in
    select * from public.show_horse_fees
    where show_id = p_show
    order by sort_order, created_at, id
  loop
    v_line_key := 'horse-fee:' || fee.id || ':' || p_show || ':' || p_payer || ':' || p_horse;
    perform public.event_billing_set_line(
      v_line_key,
      p_org,
      p_show,
      p_payer,
      coalesce(selected.owner_contact_id, p_payer),
      p_horse,
      'horse_fee',
      fee.name_fr || ' / ' || fee.name_en || ' — ' || coalesce(selected.horse_name, ''),
      1,
      fee.amount,
      fee.taxable,
      fee.is_active and selected.owner_contact_id is not null
    );

    select line.charge_id into charge
    from public.event_billing_lines line
    where line.line_key = v_line_key;

    if charge is not null and not exists (
      select 1 from public.billing_charge_presentation presentation where presentation.charge_id = charge
    ) then
      insert into public.billing_charge_presentation(charge_id, presentation)
      values (charge, jsonb_build_object('section', 'other', 'fee_kind', 'horse_fee'));
    end if;
  end loop;
end;
$$;

create function public.sync_show_horse_fee_scope(
  p_org uuid,
  p_show uuid,
  p_payer uuid,
  p_horse uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_org is null or p_show is null or p_payer is null or p_horse is null then return; end if;
  if public.reservation_uses_accounts(p_show) then
    perform public.sync_account_show_horse_fees(p_org, p_show, p_payer, p_horse);
  end if;
end;
$$;

create function public.sync_entry_show_horse_fees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    old.organization_id, old.show_id, old.payer_contact_id, old.horse_id
  ) is distinct from (
    new.organization_id, new.show_id, new.payer_contact_id, new.horse_id
  ) then
    perform public.sync_show_horse_fee_scope(old.organization_id, old.show_id, old.payer_contact_id, old.horse_id);
  end if;

  if tg_op = 'DELETE' then
    perform public.sync_show_horse_fee_scope(old.organization_id, old.show_id, old.payer_contact_id, old.horse_id);
    return old;
  end if;

  perform public.sync_show_horse_fee_scope(new.organization_id, new.show_id, new.payer_contact_id, new.horse_id);
  return new;
end;
$$;

create trigger entries_show_horse_fee_sync
after insert or update or delete on public.entries
for each row execute function public.sync_entry_show_horse_fees();

create function public.save_show_horse_fee(
  p_show uuid,
  p_fee uuid,
  p_name_fr text,
  p_name_en text,
  p_amount numeric,
  p_taxable boolean,
  p_is_active boolean,
  p_sort_order integer default 0
)
returns public.show_horse_fees
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_show public.shows;
  saved public.show_horse_fees;
  scope record;
  actor uuid := public.current_profile_id();
begin
  target_show := public.show_horse_fee_staff(p_show);
  if actor is null then raise exception 'SHOW_HORSE_FEE_FORBIDDEN' using errcode = '42501'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'SHOW_HORSE_FEE_INVALID_AMOUNT';
  end if;
  if length(btrim(coalesce(p_name_fr, ''))) not between 1 and 120
     or length(btrim(coalesce(p_name_en, ''))) not between 1 and 120 then
    raise exception 'SHOW_HORSE_FEE_INVALID_NAME';
  end if;

  if p_fee is null then
    insert into public.show_horse_fees(
      organization_id, show_id, name_fr, name_en, amount,
      taxable, is_active, sort_order, created_by_user_id
    ) values (
      target_show.organization_id, target_show.id, btrim(p_name_fr), btrim(p_name_en),
      p_amount, coalesce(p_taxable, true), coalesce(p_is_active, true),
      coalesce(p_sort_order, 0), actor
    ) returning * into saved;
  else
    update public.show_horse_fees
    set name_fr = btrim(p_name_fr),
        name_en = btrim(p_name_en),
        amount = p_amount,
        taxable = coalesce(p_taxable, true),
        is_active = coalesce(p_is_active, true),
        sort_order = coalesce(p_sort_order, 0),
        updated_at = clock_timestamp()
    where id = p_fee and show_id = target_show.id
    returning * into saved;
    if not found then raise exception 'SHOW_HORSE_FEE_NOT_FOUND'; end if;
  end if;

  for scope in
    select distinct entry.organization_id, entry.show_id, entry.payer_contact_id, entry.horse_id
    from public.entries entry
    where entry.show_id = target_show.id
      and entry.status not in ('draft', 'cancelled')
    order by entry.organization_id, entry.show_id, entry.payer_contact_id, entry.horse_id
  loop
    perform public.sync_show_horse_fee_scope(
      scope.organization_id, scope.show_id, scope.payer_contact_id, scope.horse_id
    );
  end loop;

  return saved;
end;
$$;

-- Payment activation includes every per-horse fee on the same show account.
create or replace function public.entry_activate_paid_folio(p_folio uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare e record; required_ids uuid[]; b uuid; judge_key text;
begin
  for e in
    select en.*
    from public.entries en
    join public.reservation_billing_contexts ctx on ctx.show_id = en.show_id
    join public.billing_folios f on f.billing_context_id = ctx.context_id
    join public.billing_customer_accounts ca
      on ca.id = f.payer_customer_account_id and ca.payer_contact_id = en.payer_contact_id
    where f.id = p_folio and en.status = 'pending_checkout'
    order by en.id
  loop
    select block_id into b from public.classes where id = e.class_id;
    judge_key := 'judge:' || e.show_id || ':' || e.payer_contact_id || ':' || e.horse_id || ':'
      || coalesce(e.rider_contact_id::text, 'none') || ':' || b;
    select array_agg(line.charge_id) into required_ids
    from public.event_billing_lines line
    where line.line_key in ('entry:' || e.id, 'late:' || e.id, judge_key)
       or line.line_key like 'horse-fee:%:' || e.show_id || ':' || e.payer_contact_id || ':' || e.horse_id;

    if ((cardinality(required_ids) > 0 and not exists (
      select 1 from public.billing_charges charge
      where charge.id = any(required_ids)
        and charge.total > coalesce((
          select sum(allocation.amount)
          from public.billing_payment_allocations allocation
          where allocation.charge_id = charge.id
        ), 0)
    )) or (coalesce(cardinality(required_ids), 0) = 0
      and (public.billing_snapshot(p_folio)->>'balance')::numeric <= 0
      and exists(select 1 from public.billing_payments where folio_id = p_folio))) then
      insert into public.entry_activation_events(entry_id, kind, provider_reference)
      values(e.id, 'payment', 'folio:' || p_folio)
      on conflict do nothing;
      update public.entries set status = 'active'
      where id = e.id and status = 'pending_checkout';
    end if;
  end loop;
end;
$$;

create or replace function public.entry_submission_activation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare c public.classes; f uuid; free boolean; ctx public.billing_contexts; customer uuid;
begin
  if new.status <> 'pending_checkout' or new.submitted_at is null then return new; end if;
  select * into c from public.classes where id = new.class_id;
  select bc.* into ctx
  from public.reservation_billing_contexts link
  join public.billing_contexts bc on bc.id = link.context_id
  where link.show_id = new.show_id;
  select fol.id into f
  from public.billing_folios fol
  join public.reservation_billing_contexts link on link.context_id = fol.billing_context_id
  join public.billing_customer_accounts ca on ca.id = fol.payer_customer_account_id
  where link.show_id = new.show_id and ca.payer_contact_id = new.payer_contact_id;
  if f is null and ctx.id is not null and public.billing6_cap(ctx.id, 'engine') and public.billing6_cap(ctx.id, 'personal') then
    insert into public.billing_customer_accounts(organization_id, payer_contact_id)
    values(new.organization_id, new.payer_contact_id) on conflict do nothing;
    select id into customer from public.billing_customer_accounts
    where organization_id = new.organization_id and payer_contact_id = new.payer_contact_id;
    insert into public.billing_folios(
      organization_id, billing_context_id, payer_customer_account_id,
      currency, public_number, created_by
    ) values (
      new.organization_id, ctx.id, customer, ctx.currency,
      public.billing_number(new.organization_id, 'account', ctx.config->>'account_prefix'),
      public.current_profile_id()
    ) returning id into f;
  end if;
  free := coalesce(new.base_fee, c.entry_fee, 0) = 0
    and coalesce(new.late_fee_amount, 0) = 0
    and coalesce(c.judge_fee, 0) = 0
    and not exists (
      select 1 from public.show_horse_fees fee
      where fee.show_id = new.show_id and fee.is_active and fee.amount > 0
    );
  if free and f is not null then
    free := (public.billing_snapshot(f)->>'balance')::numeric <= 0;
  elsif free then
    free := not exists (
      select 1 from public.invoices
      where show_id = new.show_id and payer_contact_id = new.payer_contact_id
        and status <> 'void' and balance_due > 0
    );
  end if;
  if free then
    insert into public.entry_activation_events(entry_id, kind, provider_reference)
    values(new.id, 'free', 'free:' || new.id) on conflict do nothing;
    update public.entries set status = 'active'
    where id = new.id and status = 'pending_checkout';
  elsif f is not null then
    perform public.entry_activate_paid_folio(f);
  end if;
  return new;
end;
$$;

revoke all on function public.show_horse_fee_staff(uuid),
  public.sync_account_show_horse_fees(uuid, uuid, uuid, uuid),
  public.sync_show_horse_fee_scope(uuid, uuid, uuid, uuid),
  public.sync_entry_show_horse_fees()
from public, anon, authenticated, service_role;

revoke all on function public.list_show_horse_fees(uuid),
  public.save_show_horse_fee(uuid, uuid, text, text, numeric, boolean, boolean, integer)
from public, anon, authenticated, service_role;
grant execute on function public.list_show_horse_fees(uuid),
  public.save_show_horse_fee(uuid, uuid, text, text, numeric, boolean, boolean, integer)
to authenticated;

notify pgrst, 'reload schema';
commit;
