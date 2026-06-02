alter table public.stall_bookings
alter column show_day_start_id drop not null,
alter column show_day_end_id drop not null;

create or replace function public.set_stall_booking_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_org_id uuid;
  option_record record;
  horse_org_id uuid;
  booker_org_id uuid;
  payer_org_id uuid;
  start_day record;
  end_day record;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id, show_id into option_record
  from public.stall_options
  where id = new.stall_option_id;

  if not found then
    raise exception 'Stall option % does not exist', new.stall_option_id using errcode = 'foreign_key_violation';
  end if;

  if option_record.show_id is distinct from new.show_id or option_record.organization_id is distinct from show_org_id then
    raise exception 'Stall option % does not belong to booking show %', new.stall_option_id, new.show_id
      using errcode = 'check_violation';
  end if;

  if new.horse_id is not null then
    select organization_id into horse_org_id from public.horses where id = new.horse_id;
    if not found then
      raise exception 'Horse % does not exist', new.horse_id using errcode = 'foreign_key_violation';
    end if;
    if horse_org_id is distinct from show_org_id then
      raise exception 'Booking horse % does not belong to show organization %', new.horse_id, show_org_id
        using errcode = 'check_violation';
    end if;
  end if;

  select organization_id into booker_org_id from public.contacts where id = new.booker_contact_id;
  if not found then
    raise exception 'Booker contact % does not exist', new.booker_contact_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id into payer_org_id from public.contacts where id = new.payer_contact_id;
  if not found then
    raise exception 'Payer contact % does not exist', new.payer_contact_id using errcode = 'foreign_key_violation';
  end if;

  if booker_org_id is distinct from show_org_id or payer_org_id is distinct from show_org_id then
    raise exception 'Booking contacts must belong to the same organization as the show'
      using errcode = 'check_violation';
  end if;

  if (new.show_day_start_id is null and new.show_day_end_id is not null)
    or (new.show_day_start_id is not null and new.show_day_end_id is null)
  then
    raise exception 'Booking show days must both be set or both be empty'
      using errcode = 'check_violation';
  end if;

  if new.show_day_start_id is not null then
    select organization_id, show_id into start_day from public.show_days where id = new.show_day_start_id;
    if not found then
      raise exception 'Start show day % does not exist', new.show_day_start_id using errcode = 'foreign_key_violation';
    end if;

    select organization_id, show_id into end_day from public.show_days where id = new.show_day_end_id;
    if not found then
      raise exception 'End show day % does not exist', new.show_day_end_id using errcode = 'foreign_key_violation';
    end if;

    if start_day.show_id is distinct from new.show_id
      or end_day.show_id is distinct from new.show_id
      or start_day.organization_id is distinct from show_org_id
      or end_day.organization_id is distinct from show_org_id
    then
      raise exception 'Booking show days must belong to the booking show'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Booking organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
  return new;
end;
$$;
