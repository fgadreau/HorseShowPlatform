create or replace function public.sync_entry_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_record record;
  target_invoice_id uuid;
  previous_invoice_id uuid;
  existing_line record;
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
      and item_type = 'entry'
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

  select id, invoice_id into existing_line
  from public.invoice_line_items
  where item_id = new.id
    and item_type = 'entry'
  order by created_at desc
  limit 1;

  if new.status <> 'draft' and existing_line.id is null then
    return new;
  end if;

  select
    h.name as horse_name,
    c.name as class_name,
    d.name as division_name,
    coalesce(new.total_fees, new.base_fee, d.entry_fee, c.entry_fee, 0) as entry_fee,
    coalesce(s.tax_rate, o.tax_rate, 0) as tax_rate
  into entry_record
  from public.divisions d
  join public.classes c on c.id = d.class_id
  join public.horses h on h.id = new.horse_id
  join public.shows s on s.id = new.show_id
  join public.organizations o on o.id = new.organization_id
  where d.id = new.division_id;

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

  line_quantity := case when new.status in ('cancelled', 'scratched') then 0 else 1 end;
  line_unit_price := coalesce(entry_record.entry_fee, 0);
  line_total := round(line_unit_price * line_quantity, 2);
  line_tax := round(line_total * coalesce(entry_record.tax_rate, 0) / 100, 2);
  line_description := left(
    case when new.status in ('cancelled', 'scratched') then 'Cancelled - ' else '' end
      || 'Entry - '
      || coalesce(entry_record.horse_name, 'Horse')
      || ' / '
      || coalesce(entry_record.class_name, 'Class')
      || ' / '
      || coalesce(entry_record.division_name, 'Division'),
    255
  );

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
      'entry',
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

drop trigger if exists entries_invoice_sync on public.entries;
create trigger entries_invoice_sync
after insert or update or delete on public.entries
for each row execute function public.sync_entry_invoice();
