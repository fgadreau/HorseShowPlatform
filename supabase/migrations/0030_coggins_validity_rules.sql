alter table public.organizations
add column if not exists health_verification_required boolean not null default true;

alter table public.organizations
add column if not exists coggins_validity_months integer not null default 12;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'organizations_coggins_validity_months_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_coggins_validity_months_check
      check (coggins_validity_months in (6, 12));
  end if;
end;
$$;

create or replace function public.coggins_expires_on(
  target_test_date date,
  target_organization_id uuid
)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select case
    when target_test_date is null then null
    else (
      target_test_date
      + make_interval(months => coalesce((
        select o.coggins_validity_months
        from public.organizations o
        where o.id = target_organization_id
      ), 12))
    )::date
  end
$$;

create or replace function public.horse_coggins_valid_for_show(
  target_horse_id uuid,
  target_show_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with show_settings as (
    select
      s.organization_id,
      s.start_date as reference_date,
      coalesce(o.health_verification_required, true) as health_required,
      coalesce(o.coggins_validity_months, 12) as validity_months
    from public.shows s
    join public.organizations o on o.id = s.organization_id
    where s.id = target_show_id
  )
  select coalesce((
    select
      case
        when not ss.health_required then true
        else exists (
          select 1
          from public.horse_health_documents hhd
          where hhd.horse_id = target_horse_id
            and hhd.document_type = 'coggins_eia'
            and hhd.status in ('approved', 'verified')
            and hhd.test_or_administered_on is not null
            and (
              hhd.test_or_administered_on
              + make_interval(months => ss.validity_months)
            )::date >= ss.reference_date
        )
      end
    from show_settings ss
  ), false)
$$;

create or replace function public.assert_horse_coggins_valid_for_show(
  target_horse_id uuid,
  target_show_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  show_record record;
  latest_accepted record;
  latest_pending_id uuid;
begin
  select
    s.organization_id,
    s.start_date as reference_date,
    coalesce(o.health_verification_required, true) as health_required,
    coalesce(o.coggins_validity_months, 12) as validity_months
  into show_record
  from public.shows s
  join public.organizations o on o.id = s.organization_id
  where s.id = target_show_id;

  if not found then
    raise exception 'Show % does not exist', target_show_id using errcode = 'foreign_key_violation';
  end if;

  if not show_record.health_required then
    return;
  end if;

  select
    hhd.id,
    hhd.test_or_administered_on,
    (
      hhd.test_or_administered_on
      + make_interval(months => show_record.validity_months)
    )::date as expires_on
  into latest_accepted
  from public.horse_health_documents hhd
  where hhd.horse_id = target_horse_id
    and hhd.document_type = 'coggins_eia'
    and hhd.status in ('approved', 'verified')
    and hhd.test_or_administered_on is not null
  order by expires_on desc
  limit 1;

  if latest_accepted.id is not null and latest_accepted.expires_on >= show_record.reference_date then
    return;
  end if;

  if latest_accepted.id is not null then
    raise exception 'Le Coggins du cheval est expire pour ce show. Valide jusqu''au %, date du show %.',
      latest_accepted.expires_on,
      show_record.reference_date
      using errcode = 'check_violation';
  end if;

  select hhd.id
  into latest_pending_id
  from public.horse_health_documents hhd
  where hhd.horse_id = target_horse_id
    and hhd.document_type = 'coggins_eia'
    and hhd.status = 'pending_review'
  order by coalesce(hhd.test_or_administered_on, hhd.created_at::date) desc
  limit 1;

  if latest_pending_id is not null then
    raise exception 'Le Coggins du cheval est en revision et doit etre approuve avant de reserver ou inscrire.'
      using errcode = 'check_violation';
  end if;

  raise exception 'Le cheval doit avoir un Coggins approuve ou verifie valide pour la date du show.'
    using errcode = 'check_violation';
end;
$$;

create or replace function public.enforce_entry_coggins_health()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'scratched', 'scratched_pending_refund') then
    return new;
  end if;

  perform public.assert_horse_coggins_valid_for_show(new.horse_id, new.show_id);
  return new;
end;
$$;

drop trigger if exists entries_zz_enforce_coggins_health on public.entries;
create trigger entries_zz_enforce_coggins_health
before insert or update on public.entries
for each row execute function public.enforce_entry_coggins_health();

create or replace function public.enforce_stall_booking_coggins_health()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.horse_id is null or new.status in ('cancelled', 'completed') then
    return new;
  end if;

  perform public.assert_horse_coggins_valid_for_show(new.horse_id, new.show_id);
  return new;
end;
$$;

drop trigger if exists stall_bookings_zz_enforce_coggins_health on public.stall_bookings;
create trigger stall_bookings_zz_enforce_coggins_health
before insert or update on public.stall_bookings
for each row execute function public.enforce_stall_booking_coggins_health();
