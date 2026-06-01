create or replace function public.has_linked_contact_in_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contacts c
    where c.organization_id = target_organization_id
      and c.linked_user_id = public.current_profile_id()
  )
$$;

drop policy if exists "Linked contacts can view shows" on public.shows;
create policy "Linked contacts can view shows"
  on public.shows for select
  using (public.has_linked_contact_in_org(organization_id));

drop policy if exists "Linked contacts can view organizations" on public.organizations;
create policy "Linked contacts can view organizations"
  on public.organizations for select
  using (public.has_linked_contact_in_org(id));

drop policy if exists "Linked contacts can view show days" on public.show_days;
create policy "Linked contacts can view show days"
  on public.show_days for select
  using (public.has_linked_contact_in_org(organization_id));

drop policy if exists "Linked contacts can view stall options" on public.stall_options;
create policy "Linked contacts can view stall options"
  on public.stall_options for select
  using (public.has_linked_contact_in_org(organization_id));

create index if not exists idx_invoice_line_items_item_reference
on public.invoice_line_items(item_type, item_id)
where item_id is not null;

create or replace function public.set_stall_booking_financials()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  option_price numeric(10, 2);
begin
  select price into option_price
  from public.stall_options
  where id = new.stall_option_id;

  if not found then
    return new;
  end if;

  new.quantity := coalesce(new.quantity, 1);

  if new.quantity <= 0 then
    raise exception 'Stall booking quantity must be greater than zero'
      using errcode = 'check_violation';
  end if;

  new.unit_price := coalesce(new.unit_price, option_price);
  new.total_price := case
    when new.status = 'cancelled' then 0
    else round((new.unit_price * new.quantity)::numeric, 2)
  end;

  return new;
end;
$$;

drop trigger if exists stall_bookings_y_set_financials on public.stall_bookings;
create trigger stall_bookings_y_set_financials
before insert or update on public.stall_bookings
for each row execute function public.set_stall_booking_financials();

create or replace function public.stall_booking_invoice_item_type(target_category text)
returns text
language sql
immutable
as $$
  select case
    when target_category = 'stall' then 'stall'
    else 'extra'
  end
$$;

create or replace function public.recalculate_invoice_totals(target_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  subtotal_total numeric(12, 2);
  tax_total numeric(12, 2);
begin
  select
    round(coalesce(sum(total_price), 0), 2),
    round(coalesce(sum(tax_amount), 0), 2)
  into subtotal_total, tax_total
  from public.invoice_line_items
  where invoice_id = target_invoice_id;

  update public.invoices
  set
    subtotal = subtotal_total,
    tax_amount = tax_total,
    total_amount = round(subtotal_total + tax_total - discount_amount, 2)
  where id = target_invoice_id;
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

drop trigger if exists stall_bookings_invoice_sync on public.stall_bookings;
create trigger stall_bookings_invoice_sync
after insert or update or delete on public.stall_bookings
for each row execute function public.sync_stall_booking_invoice();
