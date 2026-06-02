alter table public.stall_bookings
add column if not exists affects_inventory boolean not null default true,
add column if not exists billable boolean not null default true;

update public.stall_bookings
set
  affects_inventory = false,
  billable = true
where notes ilike 'Partage %';

update public.stall_bookings
set
  affects_inventory = true,
  billable = false
where notes ilike '%inventaire split%';

create or replace function public.sync_stall_booking_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  option_record record;
  target_invoice_id uuid;
  previous_invoice_id uuid;
  existing_line record;
  line_item_type text;
  line_quantity numeric(10, 2);
  line_unit_price numeric(12, 2);
  line_total numeric(12, 2);
  line_tax numeric(12, 2);
  line_description varchar(255);
  generated_invoice_number varchar(50);
begin
  if tg_op = 'DELETE' then
    select id, invoice_id into existing_line
    from public.invoice_line_items
    where item_id = old.id
      and item_type in ('stall', 'extra')
    order by created_at desc
    limit 1;

    if existing_line.id is not null then
      previous_invoice_id := existing_line.invoice_id;

      delete from public.invoice_line_items
      where id = existing_line.id;

      perform public.recalculate_invoice_totals(previous_invoice_id);
    end if;

    return old;
  end if;

  select
    so.name,
    so.category,
    so.price,
    h.name as horse_name,
    coalesce(s.tax_rate, o.tax_rate, 0) as tax_rate
  into option_record
  from public.stall_options so
  join public.shows s on s.id = new.show_id
  join public.organizations o on o.id = new.organization_id
  left join public.horses h on h.id = new.horse_id
  where so.id = new.stall_option_id;

  if not found then
    return new;
  end if;

  if not coalesce(new.billable, true) then
    select id, invoice_id into existing_line
    from public.invoice_line_items
    where item_id = new.id
      and item_type in ('stall', 'extra')
    order by created_at desc
    limit 1;

    if existing_line.id is not null then
      previous_invoice_id := existing_line.invoice_id;

      delete from public.invoice_line_items
      where id = existing_line.id;

      perform public.recalculate_invoice_totals(previous_invoice_id);
    end if;

    return new;
  end if;

  select id into target_invoice_id
  from public.invoices
  where organization_id = new.organization_id
    and show_id = new.show_id
    and payer_contact_id = new.payer_contact_id
    and status = 'draft'
  order by created_at desc
  limit 1;

  if target_invoice_id is null then
    generated_invoice_number := left(
      'HSP-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || replace(gen_random_uuid()::text, '-', ''),
      50
    );

    insert into public.invoices (
      organization_id,
      show_id,
      invoice_number,
      payer_contact_id,
      created_by_user_id,
      status,
      subtotal,
      tax_amount,
      total_amount,
      total_paid
    )
    values (
      new.organization_id,
      new.show_id,
      generated_invoice_number,
      new.payer_contact_id,
      new.created_by_user_id,
      'draft',
      0,
      0,
      0,
      0
    )
    returning id into target_invoice_id;
  end if;

  line_item_type := public.stall_booking_invoice_item_type(option_record.category);
  line_total := case
    when new.status = 'cancelled' then 0
    else round(coalesce(new.total_price, coalesce(new.unit_price, option_record.price, 0) * new.quantity, 0), 2)
  end;
  line_quantity := case
    when new.status = 'cancelled' then 0
    when coalesce(new.affects_inventory, true) = false and coalesce(option_record.price, 0) > 0
      then round(line_total / option_record.price, 2)
    else new.quantity
  end;
  line_unit_price := case
    when coalesce(new.affects_inventory, true) = false and coalesce(option_record.price, 0) > 0
      then option_record.price
    else coalesce(new.unit_price, option_record.price, 0)
  end;
  line_tax := round(line_total * coalesce(option_record.tax_rate, 0) / 100, 2);
  line_description := left(
    case when new.status = 'cancelled' then 'Cancelled - ' else '' end
      || coalesce(option_record.name, 'Stall booking')
      || case when option_record.horse_name is not null then ' / ' || option_record.horse_name else '' end,
    255
  );

  select id, invoice_id into existing_line
  from public.invoice_line_items
  where item_id = new.id
    and item_type in ('stall', 'extra')
  order by created_at desc
  limit 1;

  if existing_line.id is null then
    insert into public.invoice_line_items (
      organization_id,
      invoice_id,
      item_type,
      item_id,
      description,
      quantity,
      unit_price,
      total_price,
      tax_applicable,
      tax_amount
    )
    values (
      new.organization_id,
      target_invoice_id,
      line_item_type,
      new.id,
      line_description,
      line_quantity,
      line_unit_price,
      line_total,
      true,
      line_tax
    );
  else
    previous_invoice_id := existing_line.invoice_id;

    update public.invoice_line_items
    set
      organization_id = new.organization_id,
      invoice_id = target_invoice_id,
      item_type = line_item_type,
      description = line_description,
      quantity = line_quantity,
      unit_price = line_unit_price,
      total_price = line_total,
      tax_applicable = true,
      tax_amount = line_tax
    where id = existing_line.id;
  end if;

  perform public.recalculate_invoice_totals(target_invoice_id);

  if previous_invoice_id is not null and previous_invoice_id is distinct from target_invoice_id then
    perform public.recalculate_invoice_totals(previous_invoice_id);
  end if;

  return new;
end;
$$;

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
  line_total numeric(12, 2);
  split_quantity numeric(10, 2);
  regular_unit_price numeric(12, 2);
  tax_rate numeric(5, 2);
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

drop trigger if exists stall_bookings_zz_invoice_description_sync on public.stall_bookings;
create trigger stall_bookings_zz_invoice_description_sync
after insert or update on public.stall_bookings
for each row execute function public.sync_stall_booking_invoice_description();

do $$
declare
  invoice_record record;
begin
  with duplicate_split_groups as (
    select
      i.show_id,
      sb.stall_option_id,
      li.description,
      min(li.quantity) filter (where li.quantity > 0) as target_quantity
    from public.invoice_line_items li
    join public.invoices i on i.id = li.invoice_id
    join public.stall_bookings sb on sb.id = li.item_id
    where li.item_type in ('stall', 'extra')
      and li.description ilike 'Partage %'
      and li.quantity > 0
    group by i.show_id, sb.stall_option_id, li.description
    having min(li.quantity) filter (where li.quantity > 0) < max(li.quantity)
  )
  update public.stall_bookings sb
  set
    unit_price = round(duplicate_split_groups.target_quantity * so.price, 2),
    total_price = case
      when sb.status = 'cancelled' then 0
      else round(duplicate_split_groups.target_quantity * so.price, 2)
    end,
    affects_inventory = false,
    billable = true
  from public.invoice_line_items li
  join public.invoices i on i.id = li.invoice_id,
  public.stall_options so,
  duplicate_split_groups
  where li.item_id = sb.id
    and li.item_type in ('stall', 'extra')
    and so.id = sb.stall_option_id
    and duplicate_split_groups.show_id = i.show_id
    and duplicate_split_groups.stall_option_id = sb.stall_option_id
    and duplicate_split_groups.description = li.description
    and li.quantity > duplicate_split_groups.target_quantity;

  for invoice_record in
    with updated_lines as (
      update public.invoice_line_items li
      set
        description = coalesce(public.stall_booking_invoice_description(sb.id), li.description),
        quantity = case
          when sb.status = 'cancelled' then 0
          else round(coalesce(sb.total_price, 0) / so.price, 2)
        end,
        unit_price = so.price,
        total_price = case
          when sb.status = 'cancelled' then 0
          else round(coalesce(sb.total_price, 0), 2)
        end,
        tax_amount = case
          when sb.status = 'cancelled' then 0
          else round(coalesce(sb.total_price, 0) * coalesce(s.tax_rate, o.tax_rate, 0) / 100, 2)
        end
      from public.stall_bookings sb,
      public.stall_options so,
      public.invoices i,
      public.shows s,
      public.organizations o
      where li.item_id = sb.id
        and li.invoice_id = i.id
        and so.id = sb.stall_option_id
        and s.id = i.show_id
        and o.id = i.organization_id
        and li.item_type in ('stall', 'extra')
        and coalesce(sb.billable, true)
        and (coalesce(sb.affects_inventory, true) = false or sb.notes ilike 'Partage %')
        and coalesce(so.price, 0) > 0
      returning li.invoice_id
    )
    select distinct invoice_id from updated_lines
  loop
    perform public.recalculate_invoice_totals(invoice_record.invoice_id);
  end loop;
end;
$$;
