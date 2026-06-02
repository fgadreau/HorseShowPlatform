alter table public.stall_bookings
add column if not exists affects_inventory boolean not null default true,
add column if not exists billable boolean not null default true;

create or replace function public.stall_booking_reserved_quantity(
  target_status text,
  target_quantity smallint,
  target_affects_inventory boolean
)
returns integer
language sql
immutable
as $$
  select case
    when target_status = 'cancelled' or not coalesce(target_affects_inventory, true) then 0
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
    old_reserved := public.stall_booking_reserved_quantity(old.status, old.quantity, old.affects_inventory);
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    new_reserved := public.stall_booking_reserved_quantity(new.status, new.quantity, new.affects_inventory);
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
  line_quantity := case when new.status = 'cancelled' then 0 else new.quantity end;
  line_unit_price := coalesce(new.unit_price, option_record.price, 0);
  line_total := case
    when new.status = 'cancelled' then 0
    else round(coalesce(new.total_price, line_unit_price * new.quantity, 0), 2)
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
