alter table public.classes
add column if not exists entries_close_at timestamptz,
add column if not exists late_entries_allowed boolean not null default true,
add column if not exists late_entry_fee_percent numeric(5, 2) not null default 50,
add column if not exists draw_prepared_at timestamptz;

alter table public.entries
add column if not exists is_late boolean not null default false,
add column if not exists late_fee_percent numeric(5, 2) not null default 0,
add column if not exists late_fee_amount numeric(12, 2) not null default 0;

alter table public.classes
drop constraint if exists classes_late_entry_fee_percent_check;

alter table public.classes
add constraint classes_late_entry_fee_percent_check
check (late_entry_fee_percent >= 0 and late_entry_fee_percent <= 1000);

alter table public.entries
drop constraint if exists entries_late_fee_check;

alter table public.entries
add constraint entries_late_fee_check
check (
  late_fee_percent >= 0
  and late_fee_percent <= 1000
  and late_fee_amount >= 0
);

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
  existing_late_line record;
  line_quantity numeric(10, 2);
  line_unit_price numeric(12, 2);
  line_total numeric(12, 2);
  line_tax numeric(12, 2);
  late_line_total numeric(12, 2);
  late_line_tax numeric(12, 2);
  line_description varchar(255);
  late_line_description varchar(255);
  generated_invoice_number varchar(50);
begin
  if tg_op = 'DELETE' then
    select invoice_id into previous_invoice_id
    from public.invoice_line_items
    where item_id = old.id
      and item_type in ('entry', 'judge_fee', 'fee')
    order by created_at desc
    limit 1;

    if previous_invoice_id is not null then
      delete from public.invoice_line_items
      where item_id = old.id
        and item_type in ('entry', 'fee');

      perform public.recalculate_entry_judge_fees(previous_invoice_id);
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

  select id, invoice_id into existing_late_line
  from public.invoice_line_items
  where item_id = new.id
    and item_type = 'fee'
    and description ilike 'Late entry fee%'
  order by created_at desc
  limit 1;

  if new.status <> 'draft' and existing_line.id is null then
    return new;
  end if;

  select
    h.name as horse_name,
    c.name as class_name,
    d.name as division_name,
    coalesce(new.base_fee, d.entry_fee, c.entry_fee, 0) as entry_fee,
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

  late_line_total := case
    when new.status in ('cancelled', 'scratched') then 0
    else round(coalesce(new.late_fee_amount, 0), 2)
  end;
  late_line_tax := round(late_line_total * coalesce(entry_record.tax_rate, 0) / 100, 2);
  late_line_description := left(
    'Late entry fee - '
      || coalesce(entry_record.horse_name, 'Horse')
      || ' / '
      || coalesce(entry_record.class_name, 'Class')
      || ' / '
      || coalesce(entry_record.division_name, 'Division'),
    255
  );

  if late_line_total > 0 then
    if existing_late_line.id is null then
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
        'fee',
        new.id,
        late_line_description,
        1,
        late_line_total,
        late_line_total,
        true,
        late_line_tax
      );
    else
      previous_invoice_id := coalesce(previous_invoice_id, existing_late_line.invoice_id);

      update public.invoice_line_items
      set
        organization_id = new.organization_id,
        invoice_id = target_invoice_id,
        description = late_line_description,
        quantity = 1,
        unit_price = late_line_total,
        total_price = late_line_total,
        tax_applicable = true,
        tax_amount = late_line_tax
      where id = existing_late_line.id;
    end if;
  elsif existing_late_line.id is not null then
    previous_invoice_id := coalesce(previous_invoice_id, existing_late_line.invoice_id);

    delete from public.invoice_line_items
    where id = existing_late_line.id;
  end if;

  perform public.recalculate_entry_judge_fees(target_invoice_id);
  perform public.recalculate_invoice_totals(target_invoice_id);

  if previous_invoice_id is not null and previous_invoice_id is distinct from target_invoice_id then
    perform public.recalculate_entry_judge_fees(previous_invoice_id);
    perform public.recalculate_invoice_totals(previous_invoice_id);
  end if;

  return new;
end;
$$;

drop trigger if exists entries_invoice_sync on public.entries;
create trigger entries_invoice_sync
after insert or update or delete on public.entries
for each row execute function public.sync_entry_invoice();
