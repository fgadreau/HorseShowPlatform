begin;

alter table public.blocks
  add column draw_version integer not null default 0,
  add column draw_published_version integer,
  add column draw_published_at timestamptz,
  add column draw_published_by_user_id uuid references public.user_profiles(id) on delete set null,
  add constraint blocks_draw_version_check check (draw_version >= 0),
  add constraint blocks_draw_published_version_check check (
    draw_published_version is null
    or (draw_published_version > 0 and draw_published_version <= draw_version)
  );

alter table public.entries
  add column late_draw_placement text not null default 'negative'
    check (late_draw_placement in ('negative', 'end'));

alter table public.entries drop constraint if exists entries_activation_basis_check;
alter table public.entries
  add constraint entries_activation_basis_check
  check (activation_basis in ('manual', 'payment', 'preauthorization', 'free', 'staff_confirmation'));

update public.blocks b
set draw_version = 1
where b.draw_prepared_at is not null
   or exists (
     select 1 from public.show_score_block_setups setup
     where setup.block_id = b.id and jsonb_array_length(setup.runs) > 0
   );

create table public.block_draw_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  block_id uuid not null references public.blocks(id) on delete cascade,
  version integer not null check (version > 0),
  runs jsonb not null check (jsonb_typeof(runs) = 'array'),
  judges jsonb not null default '[]'::jsonb check (jsonb_typeof(judges) = 'array'),
  published_by_user_id uuid not null references public.user_profiles(id),
  published_at timestamptz not null default clock_timestamp(),
  superseded_at timestamptz,
  unique (block_id, version)
);

create unique index block_draw_publications_current
  on public.block_draw_publications(block_id)
  where superseded_at is null;

create index block_draw_publications_show
  on public.block_draw_publications(show_id, block_id, version desc);

alter table public.block_draw_publications enable row level security;
revoke all on table public.block_draw_publications from public, anon, authenticated, service_role;
grant select on table public.block_draw_publications to anon, authenticated;

create policy "Current published draws are public"
  on public.block_draw_publications for select
  to anon, authenticated
  using (
    superseded_at is null
    or public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.has_show_role(show_id, array['secretary'])
  );

-- A public schedule does not make a draft draw public. ShowScore receives a
-- block setup only after this control room has published the draw, or while a
-- block is explicitly live through the existing ShowScore publication state.
create or replace function public.showscore_public_class_exists(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks target_block
    where target_block.id = target_class_id
      and target_block.schedule_is_public = true
      and public.showscore_public_show_exists(target_block.show_id)
      and (
        exists (
          select 1
          from public.block_draw_publications publication
          where publication.block_id = target_block.id
            and publication.superseded_at is null
        )
        or exists (
          select 1
          from public.show_score_publication_states publication_state
          where publication_state.block_id = target_block.id
            and publication_state.status in (
              'live', 'live_no_score', 'live_scoring', 'live_finished', 'official', 'published'
            )
        )
      )
  );
$$;

create function public.mark_block_draw_generated(p_block uuid)
returns public.blocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.blocks;
begin
  select * into target from public.blocks where id = p_block for update;
  if not found or not (
    public.is_platform_admin()
    or public.is_org_member(target.organization_id, array['admin', 'secretary'])
    or public.has_show_role(target.show_id, array['secretary'])
  ) then
    raise exception 'CONTROL_ROOM_FORBIDDEN' using errcode = '42501';
  end if;

  perform public.entry_draw_assert_ready(target.id);

  update public.blocks
  set draw_prepared_at = coalesce(draw_prepared_at, clock_timestamp()),
      draw_version = draw_version + 1
  where id = target.id
  returning * into target;

  return target;
end;
$$;

create function public.publish_block_draw(p_block uuid)
returns public.block_draw_publications
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.blocks;
  setup public.show_score_block_setups;
  publication public.block_draw_publications;
  actor uuid := public.current_profile_id();
begin
  select * into target from public.blocks where id = p_block for update;
  if actor is null or not found or not (
    public.is_platform_admin()
    or public.is_org_member(target.organization_id, array['admin', 'secretary'])
    or public.has_show_role(target.show_id, array['secretary'])
  ) then
    raise exception 'CONTROL_ROOM_FORBIDDEN' using errcode = '42501';
  end if;

  select * into setup
  from public.show_score_block_setups
  where block_id = target.id
  for update;

  if not found or jsonb_array_length(setup.runs) = 0 or target.draw_version <= 0 then
    raise exception 'CONTROL_ROOM_DRAW_NOT_READY';
  end if;

  select * into publication
  from public.block_draw_publications
  where block_id = target.id and version = target.draw_version;

  if not found then
    update public.block_draw_publications
    set superseded_at = clock_timestamp()
    where block_id = target.id and superseded_at is null;

    insert into public.block_draw_publications(
      organization_id,
      show_id,
      block_id,
      version,
      runs,
      judges,
      published_by_user_id
    ) values (
      target.organization_id,
      target.show_id,
      target.id,
      target.draw_version,
      setup.runs,
      coalesce(setup.judges, '[]'::jsonb),
      actor
    )
    returning * into publication;
  end if;

  update public.blocks
  set draw_published_version = draw_version,
      draw_published_at = publication.published_at,
      draw_published_by_user_id = publication.published_by_user_id,
      schedule_is_public = true
  where id = target.id;

  update public.shows
  set status = 'open',
      show_draw_public = true
  where id = target.show_id;

  -- Re-broadcast the exact setup now that public visibility is authorized.
  update public.show_score_block_setups
  set updated_at = clock_timestamp()
  where block_id = target.id;

  return publication;
end;
$$;

create or replace function public.entry_account_quote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.classes;
  b public.blocks;
  s public.shows;
  staff boolean;
  drawn boolean;
begin
  if not public.reservation_uses_accounts(new.show_id) then return new; end if;
  select * into c from public.classes where id = new.class_id;
  select * into b from public.blocks where id = c.block_id;
  select * into s from public.shows where id = new.show_id;
  staff := public.is_platform_admin() or public.is_org_member(s.organization_id, array['admin', 'secretary']) or public.has_show_role(s.id, array['secretary']);
  drawn := public.entry_draw_generated(b.id);

  if tg_op = 'INSERT' or new.class_id is distinct from old.class_id then
    new.base_fee := case when staff then coalesce(new.base_fee, c.entry_fee, 0) else coalesce(c.entry_fee, 0) end;
    new.is_late := (staff and coalesce(new.is_late, false))
      or drawn
      or (b.entries_close_at is not null and clock_timestamp() > b.entries_close_at);
    if new.is_late and not coalesce(s.late_entries_allowed, true) and not staff then
      raise exception 'Les inscriptions sont fermées pour ce bloc.';
    end if;
    new.late_fee_percent := case
      when not new.is_late then 0
      when staff then greatest(coalesce(new.late_fee_percent, 0), 0)
      else coalesce(s.late_entry_fee_percent, 50)
    end;
    new.late_draw_placement := case when new.is_late and staff then coalesce(new.late_draw_placement, 'negative') else 'negative' end;
    new.late_fee_amount := round(new.base_fee * new.late_fee_percent / 100, 2);
  else
    if not staff then new.base_fee := old.base_fee; end if;
    new.is_late := old.is_late;
    new.late_fee_percent := old.late_fee_percent;
    new.late_draw_placement := old.late_draw_placement;
    new.late_fee_amount := round(coalesce(new.base_fee, 0) * coalesce(old.late_fee_percent, 0) / 100, 2);
  end if;

  new.total_fees := coalesce(new.base_fee, 0) + coalesce(new.late_fee_amount, 0);
  if new.base_fee < 0 then raise exception 'BILLING_INVALID_AMOUNT'; end if;
  return new;
end;
$$;

create or replace function public.entry_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  b uuid;
  manual boolean;
  staff boolean;
  drawn boolean;
begin
  if tg_op = 'DELETE' then
    if not exists(select 1 from public.shows where id = old.show_id) then return old; end if;
    if old.status <> 'draft' then raise exception 'ENTRY_USE_CANCELLATION_REQUEST'; end if;
    return old;
  end if;

  select block_id into b from public.classes where id = new.class_id;
  staff := public.entry_lifecycle_staff(new.organization_id, new.show_id);
  drawn := public.entry_draw_generated(b);
  perform public.billing6_lock(new.organization_id);
  perform public.billing_lock_scope(new.organization_id, new.show_id);
  perform public.entry_draw_lock(b);

  if tg_op = 'UPDATE' and old.class_id is distinct from new.class_id then
    perform public.entry_draw_lock((select block_id from public.classes where id = old.class_id));
    if public.entry_draw_generated(b) or public.entry_draw_generated((select block_id from public.classes where id = old.class_id)) then
      raise exception 'ENTRY_DRAW_GENERATED_USE_LATE_ENTRY';
    end if;
  end if;

  if tg_op = 'INSERT' and drawn and not staff then
    raise exception 'ENTRY_DRAW_GENERATED_STAFF_ONLY';
  end if;
  if tg_op = 'INSERT' and drawn and not new.is_late then
    raise exception 'ENTRY_DRAW_GENERATED_USE_LATE_ENTRY';
  end if;

  if tg_op = 'UPDATE' and drawn and not staff then
    if old.status not in ('active', 'pending_checkout')
      or new.status <> 'scratched'
      or (new.class_id, new.horse_id, new.owner_contact_id, new.rider_contact_id, new.payer_contact_id, new.entry_number, new.base_fee, new.total_fees, new.is_late, new.late_fee_percent, new.late_fee_amount, new.late_draw_placement)
        is distinct from
         (old.class_id, old.horse_id, old.owner_contact_id, old.rider_contact_id, old.payer_contact_id, old.entry_number, old.base_fee, old.total_fees, old.is_late, old.late_fee_percent, old.late_fee_amount, old.late_draw_placement)
    then
      raise exception 'ENTRY_DRAW_GENERATED_SCRATCH_ONLY';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status <> 'active'
    and exists(select 1 from public.entry_cancellation_requests where old.id = any(entry_ids) and status = 'pending') then
    raise exception 'ENTRY_PENDING_CANCELLATION_LOCKED';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status in ('scratched', 'scratched_pending_refund') and not drawn then raise exception 'ENTRY_USE_CANCELLATION_REQUEST'; end if;
    if new.status = 'draft' or (new.status = 'pending_checkout' and old.status <> 'draft') then raise exception 'ENTRY_STATUS_AUTOMATIC'; end if;
    if new.status = 'completed' and (old.status <> 'active' or not staff or not drawn) then raise exception 'ENTRY_STATUS_AUTOMATIC'; end if;
  end if;
  if tg_op = 'UPDATE'
    and (new.class_id, new.horse_id, new.rider_contact_id, new.payer_contact_id) is distinct from (old.class_id, old.horse_id, old.rider_contact_id, old.payer_contact_id)
    and exists(select 1 from public.entry_cancellation_requests where old.id = any(entry_ids) and status = 'pending') then
    raise exception 'ENTRY_PENDING_CANCELLATION_LOCKED';
  end if;
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform public.entry_draw_lock(b);
    if new.status = 'cancelled' then
      if drawn then raise exception 'ENTRY_DRAW_GENERATED_USE_SCRATCH'; end if;
      if not exists(select 1 from public.entry_cancellation_requests r where new.id = any(r.entry_ids) and r.status = 'approved') then raise exception 'ENTRY_USE_CANCELLATION_REQUEST'; end if;
    end if;
    if old.status = 'cancelled' and new.status <> 'cancelled' then raise exception 'ENTRY_CANCELLATION_FINAL'; end if;
  end if;

  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    if tg_op = 'UPDATE' and old.status = 'draft' and drawn and not new.is_late then raise exception 'ENTRY_DRAW_GENERATED_USE_LATE_ENTRY'; end if;
    select entry_payment_policy = 'manual' into manual from public.shows where id = new.show_id;
    if staff and new.is_late then new.activation_basis := 'staff_confirmation';
    elsif manual then new.activation_basis := 'manual';
    elsif exists(select 1 from public.entry_activation_events where entry_id = new.id and kind = 'free') then new.activation_basis := 'free';
    elsif exists(select 1 from public.entry_activation_events where entry_id = new.id and kind = 'preauthorization') then new.activation_basis := 'preauthorization';
    elsif exists(select 1 from public.entry_activation_events where entry_id = new.id and kind = 'payment') then new.activation_basis := 'payment';
    else raise exception 'ENTRY_PAYMENT_OR_AUTHORIZATION_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;

create function public.submit_staff_late_entry(p_entry jsonb)
returns setof public.entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  target_class public.classes;
  target_show public.shows;
  inserted uuid;
  base_amount numeric;
  late_percent numeric;
  late_amount numeric;
begin
  select * into target_class from public.classes where id = (p_entry ->> 'class_id')::uuid;
  select * into target_show from public.shows where id = target_class.show_id;
  if actor is null or target_show.id is null or not (
    public.is_platform_admin()
    or public.is_org_member(target_show.organization_id, array['admin', 'secretary'])
    or public.has_show_role(target_show.id, array['secretary'])
  ) then
    raise exception 'CONTROL_ROOM_FORBIDDEN' using errcode = '42501';
  end if;
  if (p_entry ->> 'show_id')::uuid is distinct from target_show.id
    or (p_entry ->> 'organization_id')::uuid is distinct from target_show.organization_id then
    raise exception 'ENTRY_CONTEXT_CHANGED';
  end if;
  base_amount := coalesce(target_class.entry_fee, 0);
  late_percent := greatest(coalesce((p_entry ->> 'late_fee_percent')::numeric, 0), 0);
  late_amount := round(base_amount * late_percent / 100, 2);

  insert into public.entries(
    organization_id, show_id, horse_id, class_id, created_by_user_id,
    owner_contact_id, rider_contact_id, payer_contact_id, entry_number,
    back_number_choice, back_number_request_token, base_fee, total_fees,
    is_late, late_fee_percent, late_fee_amount, late_draw_placement,
    status, submitted_at
  ) values (
    target_show.organization_id,
    target_show.id,
    (p_entry ->> 'horse_id')::uuid,
    target_class.id,
    actor,
    (p_entry ->> 'owner_contact_id')::uuid,
    nullif(p_entry ->> 'rider_contact_id', '')::uuid,
    (p_entry ->> 'payer_contact_id')::uuid,
    nullif(p_entry ->> 'entry_number', '')::integer,
    coalesce(p_entry ->> 'back_number_choice', 'legacy'),
    nullif(p_entry ->> 'back_number_request_token', '')::uuid,
    base_amount,
    base_amount + late_amount,
    true,
    late_percent,
    late_amount,
    coalesce(nullif(p_entry ->> 'late_draw_placement', ''), 'negative'),
    'active',
    clock_timestamp()
  ) returning id into inserted;

  return query select * from public.entries where id = inserted;
end;
$$;

-- A scratch after the draw is operational, not a cancellation: all entry,
-- late and judge charges remain due in both billing engines.
create or replace function public.entry_account_judge_fee(p_org uuid,p_show uuid,p_payer uuid,p_horse uuid,p_rider uuid,p_block uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare selected record; key text;
begin
  key := 'judge:' || p_show || ':' || p_payer || ':' || p_horse || ':' || coalesce(p_rider::text, 'none') || ':' || p_block;
  select e.id,e.owner_contact_id,e.horse_id,e.payer_contact_id,c.judge_fee,c.name,bl.name block_name,h.name horse_name into selected
  from public.entries e
  join public.classes c on c.id = e.class_id
  join public.blocks bl on bl.id = c.block_id
  join public.horses h on h.id = e.horse_id
  where e.show_id = p_show and e.organization_id = p_org and e.payer_contact_id = p_payer and e.horse_id = p_horse
    and e.rider_contact_id is not distinct from p_rider and c.block_id = p_block
    and e.status <> 'cancelled'
  order by coalesce(e.base_fee,c.entry_fee,0) desc,e.created_at,e.id limit 1;
  perform public.event_billing_set_line(key,p_org,p_show,p_payer,coalesce(selected.owner_contact_id,p_payer),p_horse,'judge_fee',
    'Frais de juge / Judge fee — '||coalesce(selected.horse_name,'')||' / '||coalesce(selected.block_name,'')||' / '||coalesce(selected.name,''),1,coalesce(selected.judge_fee,0),true,selected.id is not null);
  if selected.id is not null then perform public.event_billing_entry_identity(key,selected.id,'judge_block'); end if;
end;
$$;

create or replace function public.sync_entry_billing_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare e public.entries; c public.classes; h text; active boolean;
begin
  if tg_op = 'DELETE' then e := old; else e := new; end if;
  if not public.reservation_uses_accounts(e.show_id) then if tg_op = 'DELETE' then return old; end if; return new; end if;
  select * into c from public.classes where id = e.class_id;
  select name into h from public.horses where id = e.horse_id;
  active := tg_op <> 'DELETE' and e.status <> 'cancelled';
  perform public.event_billing_set_line('entry:'||e.id,e.organization_id,e.show_id,e.payer_contact_id,e.owner_contact_id,e.horse_id,'entry','Inscription / Entry — '||h||' / '||c.name,1,coalesce(e.base_fee,c.entry_fee,0),true,active,coalesce(e.rider_contact_id::text,'')||':'||coalesce(e.entry_number::text,''));
  perform public.event_billing_set_line('late:'||e.id,e.organization_id,e.show_id,e.payer_contact_id,e.owner_contact_id,e.horse_id,'late_entry','Inscription tardive / Late entry — '||h||' / '||c.name,1,coalesce(e.late_fee_amount,0),true,active,coalesce(e.rider_contact_id::text,'')||':'||coalesce(e.entry_number::text,''));
  if tg_op <> 'DELETE' then
    perform public.event_billing_entry_identity('entry:'||e.id,e.id,'entry');
    perform public.event_billing_entry_identity('late:'||e.id,e.id,'entry');
  end if;
  if tg_op = 'UPDATE' then
    perform public.entry_account_judge_fee(old.organization_id,old.show_id,old.payer_contact_id,old.horse_id,old.rider_contact_id,(select block_id from public.classes where id=old.class_id));
  end if;
  perform public.entry_account_judge_fee(e.organization_id,e.show_id,e.payer_contact_id,e.horse_id,e.rider_contact_id,c.block_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$
declare source text; replacement text;
begin
  select pg_get_functiondef('public.event_legacy_entry_invoice_sync()'::regprocedure) into source;
  replacement := replace(source, 'new.status in (''cancelled'', ''scratched'')', 'new.status in (''cancelled'')');
  if replacement = source then
    raise exception 'ENTRY_LEGACY_INVOICE_CONTRACT_CHANGED';
  end if;
  execute replacement;
end;
$$;

revoke all on function public.mark_block_draw_generated(uuid), public.publish_block_draw(uuid), public.submit_staff_late_entry(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_block_draw_generated(uuid), public.publish_block_draw(uuid), public.submit_staff_late_entry(jsonb)
  to authenticated;

notify pgrst, 'reload schema';

commit;
