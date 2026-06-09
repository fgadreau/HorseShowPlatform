alter table public.organizations
alter column tax_rate type numeric(6, 3);

alter table public.shows
alter column tax_rate type numeric(6, 3);

alter table public.organizations
add column if not exists billing_name varchar(255),
add column if not exists billing_email varchar(255),
add column if not exists billing_phone varchar(30),
add column if not exists address_line2 varchar(255),
add column if not exists tax_name varchar(100),
add column if not exists tax_number varchar(100),
add column if not exists secondary_tax_name varchar(100),
add column if not exists secondary_tax_number varchar(100);

update public.organizations
set
  billing_name = coalesce(billing_name, name),
  billing_email = coalesce(billing_email, primary_contact_email),
  billing_phone = coalesce(billing_phone, primary_contact_phone),
  tax_name = coalesce(tax_name, case when tax_rate > 0 then 'Taxe de vente' else null end)
where billing_name is null
  or billing_email is null
  or billing_phone is null
  or tax_name is null;

create or replace function public.sync_stall_booking_invoice_description()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line_description varchar(255);
  line_total numeric(12, 2);
  split_quantity numeric(10, 2);
  regular_unit_price numeric(12, 2);
  tax_rate numeric(6, 3);
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

  select so.price, coalesce(s.tax_rate, o.tax_rate, 0)
  into regular_unit_price, tax_rate
  from public.stall_options so
  join public.shows s on s.id = new.show_id
  join public.organizations o on o.id = new.organization_id
  where so.id = new.stall_option_id;

  line_total := case
    when new.status = 'cancelled' then 0
    else round(coalesce(new.total_price, 0), 2)
  end;
  split_quantity := case
    when coalesce(new.affects_inventory, true) = false
      and coalesce(regular_unit_price, 0) > 0
      then round(line_total / regular_unit_price, 2)
    else null
  end;

  update public.invoice_line_items
  set
    description = line_description,
    quantity = coalesce(split_quantity, quantity),
    unit_price = case when split_quantity is not null then regular_unit_price else unit_price end,
    total_price = case when split_quantity is not null then line_total else total_price end,
    tax_amount = case when split_quantity is not null then round(line_total * coalesce(tax_rate, 0) / 100, 2) else tax_amount end
  where item_id = new.id
    and item_type in ('stall', 'extra');

  return new;
end;
$$;
