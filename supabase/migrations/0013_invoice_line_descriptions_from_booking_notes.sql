create or replace function public.stall_booking_invoice_description(target_booking_id uuid)
returns varchar
language sql
stable
set search_path = public
as $$
  select left(
    case when sb.status = 'cancelled' then 'Cancelled - ' else '' end
      || coalesce(
        nullif(trim(sb.notes), ''),
        coalesce(so.name, 'Stall booking')
          || case when h.name is not null then ' / ' || h.name else '' end
      ),
    255
  )::varchar
  from public.stall_bookings sb
  join public.stall_options so on so.id = sb.stall_option_id
  left join public.horses h on h.id = sb.horse_id
  where sb.id = target_booking_id
$$;

create or replace function public.sync_stall_booking_invoice_description()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line_description varchar(255);
  split_quantity numeric(10, 2);
  regular_unit_price numeric(12, 2);
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  if not coalesce(new.billable, true) then
    return new;
  end if;

  line_description := public.stall_booking_invoice_description(new.id);

  if line_description is null then
    return new;
  end if;

  select so.price into regular_unit_price
  from public.stall_options so
  where so.id = new.stall_option_id;

  split_quantity := case
    when coalesce(new.affects_inventory, true) = false
      and coalesce(regular_unit_price, 0) > 0
      then case
        when new.status = 'cancelled' then 0
        else round(coalesce(new.total_price, 0) / regular_unit_price, 2)
      end
    else null
  end;

  update public.invoice_line_items
  set
    description = line_description,
    quantity = coalesce(split_quantity, quantity),
    unit_price = case when split_quantity is not null then regular_unit_price else unit_price end
  where item_id = new.id
    and item_type in ('stall', 'extra');

  return new;
end;
$$;

drop trigger if exists stall_bookings_zz_invoice_description_sync on public.stall_bookings;
create trigger stall_bookings_zz_invoice_description_sync
after insert or update on public.stall_bookings
for each row execute function public.sync_stall_booking_invoice_description();

update public.invoice_line_items li
set
  description = public.stall_booking_invoice_description(sb.id),
  quantity = case
    when coalesce(sb.affects_inventory, true) = false
      and coalesce(so.price, 0) > 0
      then case
        when sb.status = 'cancelled' then 0
        else round(coalesce(sb.total_price, 0) / so.price, 2)
      end
    else li.quantity
  end,
  unit_price = case
    when coalesce(sb.affects_inventory, true) = false
      and coalesce(so.price, 0) > 0
      then so.price
    else li.unit_price
  end
from public.stall_bookings sb
join public.stall_options so on so.id = sb.stall_option_id
where li.item_id = sb.id
  and li.item_type in ('stall', 'extra')
  and public.stall_booking_invoice_description(sb.id) is not null;
