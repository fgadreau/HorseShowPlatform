\set ON_ERROR_STOP on

begin;

\ir ../seed.sql

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

delete from public.invoices
where organization_id = '30000000-0000-0000-0000-000000000001'
  and show_id = '40000000-0000-0000-0000-000000000001'
  and payer_contact_id = '70000000-0000-0000-0000-000000000001'
  and status = 'draft';

insert into public.shows (
  id,
  organization_id,
  name,
  slug,
  start_date,
  end_date,
  venue,
  location,
  status,
  timezone,
  default_currency,
  tax_rate,
  is_public,
  created_by_user_id
)
values (
  '40000000-0000-0000-0000-000000000101',
  '30000000-0000-0000-0000-000000000001',
  'Phase 1 Balance Block Classic',
  'phase-1-balance-block-classic',
  '2026-08-10',
  '2026-08-12',
  'Main Arena',
  'Ottawa, ON',
  'open',
  'America/Toronto',
  'CAD',
  13.00,
  false,
  '20000000-0000-0000-0000-000000000002'
)
on conflict (id) do update
set
  name = excluded.name,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  updated_at = now();

insert into public.stall_options (
  id,
  organization_id,
  show_id,
  name,
  description,
  price,
  total_quantity,
  available_quantity,
  duration_days,
  show_day_start_id,
  show_day_end_id,
  category
)
select
  'c0000000-0000-0000-0000-000000000101',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000101',
  'Camping',
  'Camping spot for balance blocking test.',
  95.00,
  10,
  10,
  3,
  sd.id,
  sd.id,
  'camping'
from public.show_days sd
where sd.show_id = '40000000-0000-0000-0000-000000000101'
  and sd.day_date = '2026-08-10'
limit 1
on conflict (id) do update
set
  price = excluded.price,
  total_quantity = excluded.total_quantity,
  available_quantity = excluded.available_quantity,
  show_day_start_id = excluded.show_day_start_id,
  show_day_end_id = excluded.show_day_end_id,
  updated_at = now();

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  visible_organizations integer;
  visible_shows integer;
  visible_days integer;
  visible_options integer;
begin
  select count(*) into visible_organizations
  from public.organizations
  where id = '30000000-0000-0000-0000-000000000001';

  select count(*) into visible_shows
  from public.shows
  where id = '40000000-0000-0000-0000-000000000001';

  select count(*) into visible_days
  from public.show_days
  where id = '41000000-0000-0000-0000-000000000001';

  select count(*) into visible_options
  from public.stall_options
  where id = 'c0000000-0000-0000-0000-000000000001';

  if visible_organizations <> 1 or visible_shows <> 1 or visible_days <> 1 or visible_options <> 1 then
    raise exception 'Expected owner to see organization/show/day/stall option, got %, %, %, %', visible_organizations, visible_shows, visible_days, visible_options;
  end if;
end;
$$;

insert into public.stall_bookings (
  id,
  organization_id,
  show_id,
  stall_option_id,
  horse_id,
  created_by_user_id,
  booker_contact_id,
  payer_contact_id,
  status,
  show_day_start_id,
  show_day_end_id,
  quantity,
  notes
)
values (
  'd1000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004',
  '70000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  'requested',
  '41000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  2,
  'Invoice sync test'
);

do $$
declare
  option_available integer;
  line_count integer;
  line_subtotal numeric;
  line_tax numeric;
  invoice_total numeric;
begin
  select available_quantity into option_available
  from public.stall_options
  where id = 'c0000000-0000-0000-0000-000000000001';

  if option_available <> 38 then
    raise exception 'Expected availability 38 after owner booking, got %', option_available;
  end if;

  select count(*), coalesce(sum(total_price), 0), coalesce(sum(tax_amount), 0)
  into line_count, line_subtotal, line_tax
  from public.invoice_line_items
  where item_id = 'd1000000-0000-0000-0000-000000000001'
    and item_type = 'stall';

  if line_count <> 1 or line_subtotal <> 350.00 or line_tax <> 45.50 then
    raise exception 'Expected one $350.00 stall line with $45.50 tax, got count %, subtotal %, tax %', line_count, line_subtotal, line_tax;
  end if;

  select i.total_amount into invoice_total
  from public.invoices i
  join public.invoice_line_items li on li.invoice_id = i.id
  where li.item_id = 'd1000000-0000-0000-0000-000000000001'
    and li.item_type = 'stall';

  if invoice_total <> 395.50 then
    raise exception 'Expected invoice total 395.50, got %', invoice_total;
  end if;
end;
$$;

do $$
declare
  block_error text;
begin
  begin
    insert into public.stall_bookings (
      id,
      organization_id,
      show_id,
      stall_option_id,
      created_by_user_id,
      booker_contact_id,
      payer_contact_id,
      status,
      show_day_start_id,
      show_day_end_id,
      quantity,
      notes
    )
    values (
      'd1000000-0000-0000-0000-000000000101',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000101',
      'c0000000-0000-0000-0000-000000000101',
      '20000000-0000-0000-0000-000000000004',
      '70000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001',
      'requested',
      (select id from public.show_days where show_id = '40000000-0000-0000-0000-000000000101' and day_date = '2026-08-10' limit 1),
      (select id from public.show_days where show_id = '40000000-0000-0000-0000-000000000101' and day_date = '2026-08-10' limit 1),
      1,
      'Open balance block test'
    );
  exception when others then
    block_error := sqlerrm;
  end;

  if block_error is null or block_error not like 'Solde de facture ouvert:%' then
    raise exception 'Expected open invoice balance to block another show reservation, got %', coalesce(block_error, 'no error');
  end if;
end;
$$;

update public.stall_bookings
set status = 'cancelled'
where id = 'd1000000-0000-0000-0000-000000000001';

do $$
declare
  option_available integer;
  line_subtotal numeric;
  invoice_total numeric;
begin
  select available_quantity into option_available
  from public.stall_options
  where id = 'c0000000-0000-0000-0000-000000000001';

  if option_available <> 40 then
    raise exception 'Expected availability 40 after owner cancellation, got %', option_available;
  end if;

  select total_price into line_subtotal
  from public.invoice_line_items
  where item_id = 'd1000000-0000-0000-0000-000000000001'
    and item_type = 'stall';

  if line_subtotal <> 0 then
    raise exception 'Expected cancelled stall line total 0, got %', line_subtotal;
  end if;

  select i.total_amount into invoice_total
  from public.invoices i
  join public.invoice_line_items li on li.invoice_id = i.id
  where li.item_id = 'd1000000-0000-0000-0000-000000000001'
    and li.item_type = 'stall';

  if invoice_total <> 0 then
    raise exception 'Expected cancelled invoice total 0, got %', invoice_total;
  end if;
end;
$$;

reset role;
rollback;
