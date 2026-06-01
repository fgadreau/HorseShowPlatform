alter table public.stall_bookings
add column if not exists quantity smallint not null default 1 check (quantity > 0);

create or replace function public.stall_booking_reserved_quantity(
  target_status text,
  target_quantity smallint
)
returns integer
language sql
immutable
as $$
  select case
    when target_status = 'cancelled' then 0
    else coalesce(target_quantity, 1)::integer
  end
$$;

create or replace function public.adjust_stall_option_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_reserved integer := 0;
  new_reserved integer := 0;
  current_available integer;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    old_reserved := public.stall_booking_reserved_quantity(old.status, old.quantity);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new_reserved := public.stall_booking_reserved_quantity(new.status, new.quantity);
  end if;

  if tg_op = 'INSERT' then
    select available_quantity into current_available
    from public.stall_options
    where id = new.stall_option_id
    for update;

    if current_available < new_reserved then
      raise exception 'Not enough availability for stall option %', new.stall_option_id
        using errcode = 'check_violation';
    end if;

    update public.stall_options
    set available_quantity = available_quantity - new_reserved
    where id = new.stall_option_id;

    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.stall_option_id = new.stall_option_id then
      select available_quantity into current_available
      from public.stall_options
      where id = new.stall_option_id
      for update;

      if current_available < (new_reserved - old_reserved) then
        raise exception 'Not enough availability for stall option %', new.stall_option_id
          using errcode = 'check_violation';
      end if;

      update public.stall_options
      set available_quantity = available_quantity - new_reserved + old_reserved
      where id = new.stall_option_id;
    else
      update public.stall_options
      set available_quantity = available_quantity + old_reserved
      where id = old.stall_option_id;

      select available_quantity into current_available
      from public.stall_options
      where id = new.stall_option_id
      for update;

      if current_available < new_reserved then
        raise exception 'Not enough availability for stall option %', new.stall_option_id
          using errcode = 'check_violation';
      end if;

      update public.stall_options
      set available_quantity = available_quantity - new_reserved
      where id = new.stall_option_id;
    end if;

    return new;
  end if;

  update public.stall_options
  set available_quantity = available_quantity + old_reserved
  where id = old.stall_option_id;

  return old;
end;
$$;

drop trigger if exists stall_bookings_z_adjust_availability on public.stall_bookings;
create trigger stall_bookings_z_adjust_availability
before insert or update or delete on public.stall_bookings
for each row execute function public.adjust_stall_option_availability();
