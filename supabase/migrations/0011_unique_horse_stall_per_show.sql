create or replace function public.assert_one_horse_stall_per_show()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_horse_stall boolean;
  duplicate_booking_id uuid;
begin
  if new.horse_id is null or new.status = 'cancelled' then
    return new;
  end if;

  select so.category = 'stall' and so.requires_horse_assignment = true
  into is_horse_stall
  from public.stall_options so
  where so.id = new.stall_option_id;

  if not coalesce(is_horse_stall, false) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.show_id::text || ':' || new.horse_id::text));

  select sb.id
  into duplicate_booking_id
  from public.stall_bookings sb
  join public.stall_options so on so.id = sb.stall_option_id
  where sb.organization_id = new.organization_id
    and sb.show_id = new.show_id
    and sb.horse_id = new.horse_id
    and sb.status <> 'cancelled'
    and so.category = 'stall'
    and so.requires_horse_assignment = true
    and (tg_op <> 'UPDATE' or sb.id <> new.id)
  limit 1;

  if duplicate_booking_id is not null then
    raise exception 'Horse % already has a stall booking for show %', new.horse_id, new.show_id
      using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists stall_bookings_assert_one_horse_stall_per_show on public.stall_bookings;
create trigger stall_bookings_assert_one_horse_stall_per_show
before insert or update on public.stall_bookings
for each row execute function public.assert_one_horse_stall_per_show();
