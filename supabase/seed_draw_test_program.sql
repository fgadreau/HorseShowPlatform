-- Local draw-order stress seed.
-- Run after the normal Supabase migrations and supabase/seed.sql.
-- This is intentionally not production data.
--
-- Example:
-- psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/seed_draw_test_program.sql
--
-- Then sign in as phase1.org-a-secretary@example.test and use Scoring -> Sortir ordre.

begin;

delete from public.show_score_class_setups
where show_id = '4d000000-0000-0000-0000-000000000001';

delete from public.entries
where show_id = '4d000000-0000-0000-0000-000000000001';

delete from public.divisions
where show_id = '4d000000-0000-0000-0000-000000000001';

delete from public.classes
where show_id = '4d000000-0000-0000-0000-000000000001';

delete from public.show_days
where show_id = '4d000000-0000-0000-0000-000000000001';

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
  show_schedule_public,
  show_draw_public,
  show_results_public,
  created_by_user_id
)
values (
  '4d000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Draw Test Mega Classic',
  'draw-test-mega-classic',
  '2026-06-06',
  '2026-06-07',
  'Main Arena',
  'Ottawa, ON',
  'open',
  'America/Toronto',
  'CAD',
  13.00,
  false,
  false,
  false,
  false,
  '20000000-0000-0000-0000-000000000002'
)
on conflict (id) do update
set
  name = excluded.name,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  venue = excluded.venue,
  location = excluded.location,
  status = excluded.status,
  updated_at = now();

insert into public.show_days (
  id,
  organization_id,
  show_id,
  day_date,
  day_name,
  day_number,
  sort_order,
  start_time
)
values (
  '4d100000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '4d000000-0000-0000-0000-000000000001',
  '2026-06-06',
  'Saturday',
  1,
  1,
  '08:00'
)
on conflict (show_id, day_date) do update
set
  id = excluded.id,
  day_date = excluded.day_date,
  day_name = excluded.day_name,
  day_number = excluded.day_number,
  sort_order = excluded.sort_order,
  start_time = excluded.start_time,
  updated_at = now();

insert into public.classes (
  id,
  organization_id,
  show_id,
  show_day_id,
  name,
  code,
  block_label,
  arena,
  pattern,
  sanctioning_body_codes,
  back_number_policy,
  nrha_slate_number,
  entries_close_at,
  late_entries_allowed,
  late_entry_fee_percent,
  entry_fee,
  status,
  is_public,
  sort_order
)
values
  ('4dc00000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '4d000000-0000-0000-0000-000000000001', '4d100000-0000-0000-0000-000000000001', 'Draw Test 1100 Open', '1100', 'Block A', 'Main Arena', '8', array['NRHA'], 'horse', 'Slate 1', '2026-06-03 18:00:00-04', true, 50, 125.00, 'open', true, 1),
  ('4dc00000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '4d000000-0000-0000-0000-000000000001', '4d100000-0000-0000-0000-000000000001', 'Draw Test Mixed Non Pro', '5300', 'Block B', 'Main Arena', '6', array['NRHA'], 'horse', 'Slate 1', '2026-06-03 18:00:00-04', true, 50, 115.00, 'open', true, 2),
  ('4dc00000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '4d000000-0000-0000-0000-000000000001', '4d100000-0000-0000-0000-000000000001', 'Draw Test Short Edge', 'EDGE', 'Block C', 'Main Arena', '5', array['AQR'], 'horse', 'Slate 1', '2026-06-03 18:00:00-04', true, 50, 75.00, 'open', true, 3)
on conflict (id) do update
set
  name = excluded.name,
  code = excluded.code,
  block_label = excluded.block_label,
  arena = excluded.arena,
  pattern = excluded.pattern,
  sanctioning_body_codes = excluded.sanctioning_body_codes,
  back_number_policy = excluded.back_number_policy,
  nrha_slate_number = excluded.nrha_slate_number,
  entries_close_at = excluded.entries_close_at,
  late_entries_allowed = excluded.late_entries_allowed,
  late_entry_fee_percent = excluded.late_entry_fee_percent,
  entry_fee = excluded.entry_fee,
  status = excluded.status,
  is_public = excluded.is_public,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.divisions (
  id,
  organization_id,
  show_id,
  class_id,
  name,
  code,
  entry_fee,
  judge_fee,
  payout_schedule_type,
  added_money,
  retainage_percent,
  trophy_or_plaque_fee,
  sanctioning_body_codes,
  eligibility_rules
)
values
  ('4dd00000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '4d000000-0000-0000-0000-000000000001', '4dc00000-0000-0000-0000-000000000001', '1100 Open', '1100', 125.00, 10.00, 'nrha_schedule_a', 500.00, 35.00, 25.00, array['NRHA'], '{"nrha_class_type":"category_1"}'::jsonb),
  ('4dd00000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '4d000000-0000-0000-0000-000000000001', '4dc00000-0000-0000-0000-000000000002', '5300 Non Pro', '5300', 115.00, 10.00, 'nrha_schedule_a', 300.00, 35.00, 20.00, array['NRHA'], '{"nrha_class_type":"category_5"}'::jsonb),
  ('4dd00000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '4d000000-0000-0000-0000-000000000001', '4dc00000-0000-0000-0000-000000000002', '5310 Intermediate Non Pro', '5310', 95.00, 10.00, 'house_custom', 150.00, 30.00, 10.00, array['NRHA'], '{"nrha_class_type":"category_5"}'::jsonb),
  ('4dd00000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '4d000000-0000-0000-0000-000000000001', '4dc00000-0000-0000-0000-000000000003', 'Short Edge', 'EDGE', 75.00, 0.00, 'none', 0.00, null, 0.00, array['AQR'], '{}'::jsonb)
on conflict (id) do update
set
  name = excluded.name,
  code = excluded.code,
  entry_fee = excluded.entry_fee,
  judge_fee = excluded.judge_fee,
  payout_schedule_type = excluded.payout_schedule_type,
  added_money = excluded.added_money,
  retainage_percent = excluded.retainage_percent,
  trophy_or_plaque_fee = excluded.trophy_or_plaque_fee,
  sanctioning_body_codes = excluded.sanctioning_body_codes,
  eligibility_rules = excluded.eligibility_rules,
  updated_at = now();

insert into public.contacts (
  id,
  organization_id,
  type,
  first_name,
  last_name,
  email,
  phone,
  country,
  created_by_user_id
)
select
  md5('draw-test-rider-' || n)::uuid,
  '30000000-0000-0000-0000-000000000001',
  'rider',
  'Draw Rider',
  lpad(n::text, 2, '0'),
  'draw.rider.' || lpad(n::text, 2, '0') || '@example.test',
  '555-010' || lpad(n::text, 2, '0'),
  'CA',
  '20000000-0000-0000-0000-000000000002'
from generate_series(1, 30) as n
on conflict (id) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  phone = excluded.phone,
  type = excluded.type,
  updated_at = now();

insert into public.contacts (
  id,
  organization_id,
  type,
  first_name,
  last_name,
  email,
  phone,
  country,
  created_by_user_id
)
select
  md5('draw-test-owner-' || n)::uuid,
  '30000000-0000-0000-0000-000000000001',
  'owner',
  'Draw Owner',
  lpad(n::text, 2, '0'),
  'draw.owner.' || lpad(n::text, 2, '0') || '@example.test',
  '555-020' || lpad(n::text, 2, '0'),
  'CA',
  '20000000-0000-0000-0000-000000000002'
from generate_series(1, 95) as n
on conflict (id) do update
set
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  phone = excluded.phone,
  type = excluded.type,
  updated_at = now();

do $$
begin
  if to_regclass('public.contact_roles') is not null then
    insert into public.contact_roles (organization_id, contact_id, role, source)
    select '30000000-0000-0000-0000-000000000001', md5('draw-test-rider-' || n)::uuid, 'rider', 'manual'
    from generate_series(1, 30) as n
    on conflict (organization_id, contact_id, role) do update
    set source = excluded.source;

    insert into public.contact_roles (organization_id, contact_id, role, source)
    select '30000000-0000-0000-0000-000000000001', md5('draw-test-owner-' || n)::uuid, 'owner', 'manual'
    from generate_series(1, 95) as n
    on conflict (organization_id, contact_id, role) do update
    set source = excluded.source;
  end if;

  if to_regclass('public.contact_organization_links') is not null then
    insert into public.contact_organization_links (organization_id, contact_id, source, created_by_user_id)
    select '30000000-0000-0000-0000-000000000001', md5('draw-test-rider-' || n)::uuid, 'created_here', '20000000-0000-0000-0000-000000000002'
    from generate_series(1, 30) as n
    on conflict (organization_id, contact_id) do update
    set source = excluded.source;

    insert into public.contact_organization_links (organization_id, contact_id, source, created_by_user_id)
    select '30000000-0000-0000-0000-000000000001', md5('draw-test-owner-' || n)::uuid, 'created_here', '20000000-0000-0000-0000-000000000002'
    from generate_series(1, 95) as n
    on conflict (organization_id, contact_id) do update
    set source = excluded.source;
  end if;
end;
$$;

insert into public.horses (
  id,
  organization_id,
  name,
  breed,
  color,
  gender,
  birth_year,
  date_of_birth,
  registration_number,
  registration_organization,
  primary_owner_contact_id,
  created_by_user_id
)
select
  md5('draw-test-horse-' || n)::uuid,
  '30000000-0000-0000-0000-000000000001',
  'Draw Test Horse ' || lpad(n::text, 2, '0'),
  'Quarter Horse',
  case when n % 3 = 0 then 'Sorrel' when n % 3 = 1 then 'Bay' else 'Chestnut' end,
  case when n % 3 = 0 then 'G' when n % 3 = 1 then 'M' else 'F' end,
  2014 + (n % 8),
  make_date(2014 + (n % 8), ((n % 12) + 1), ((n % 20) + 1)),
  'DTH-' || lpad(n::text, 4, '0'),
  'NRHA',
  md5('draw-test-owner-' || n)::uuid,
  '20000000-0000-0000-0000-000000000002'
from generate_series(1, 95) as n
on conflict (id) do update
set
  name = excluded.name,
  breed = excluded.breed,
  color = excluded.color,
  gender = excluded.gender,
  birth_year = excluded.birth_year,
  date_of_birth = excluded.date_of_birth,
  registration_number = excluded.registration_number,
  registration_organization = excluded.registration_organization,
  primary_owner_contact_id = excluded.primary_owner_contact_id,
  updated_at = now();

do $$
begin
  if to_regclass('public.horse_organization_links') is not null then
    insert into public.horse_organization_links (organization_id, horse_id, source, created_by_user_id)
    select '30000000-0000-0000-0000-000000000001', md5('draw-test-horse-' || n)::uuid, 'created_here', '20000000-0000-0000-0000-000000000002'
    from generate_series(1, 95) as n
    on conflict (organization_id, horse_id) do update
    set source = excluded.source;
  end if;
end;
$$;

insert into public.horse_contacts (
  organization_id,
  horse_id,
  contact_id,
  role,
  can_create_entries,
  can_modify_entries,
  can_book_stalls,
  can_pay_invoices
)
select
  '30000000-0000-0000-0000-000000000001',
  md5('draw-test-horse-' || n)::uuid,
  md5('draw-test-owner-' || n)::uuid,
  'owner',
  true,
  true,
  true,
  true
from generate_series(1, 95) as n
on conflict (horse_id, contact_id, role) do update
set
  can_create_entries = excluded.can_create_entries,
  can_modify_entries = excluded.can_modify_entries,
  can_book_stalls = excluded.can_book_stalls,
  can_pay_invoices = excluded.can_pay_invoices;

insert into public.horse_health_documents (
  id,
  organization_id,
  horse_id,
  document_type,
  status,
  verification_source,
  certificate_number,
  issuer_name,
  test_or_administered_on,
  expires_on,
  result,
  horse_name,
  horse_date_of_birth,
  payload,
  reviewed_by_user_id,
  reviewed_at,
  created_by_user_id
)
select
  md5('draw-test-coggins-' || n)::uuid,
  '30000000-0000-0000-0000-000000000001',
  md5('draw-test-horse-' || n)::uuid,
  'coggins_eia',
  'verified',
  'manual',
  'DTC-' || lpad(n::text, 4, '0'),
  'Draw Test Vet',
  '2026-01-15',
  '2027-01-15',
  'Negative',
  'Draw Test Horse ' || lpad(n::text, 2, '0'),
  make_date(2014 + (n % 8), ((n % 12) + 1), ((n % 20) + 1)),
  '{"seed":"draw_test_program"}'::jsonb,
  '20000000-0000-0000-0000-000000000002',
  now(),
  '20000000-0000-0000-0000-000000000002'
from generate_series(1, 95) as n
on conflict (id) do update
set
  status = excluded.status,
  test_or_administered_on = excluded.test_or_administered_on,
  expires_on = excluded.expires_on,
  result = excluded.result,
  reviewed_by_user_id = excluded.reviewed_by_user_id,
  reviewed_at = excluded.reviewed_at;

insert into public.horse_health_documents (
  id,
  organization_id,
  horse_id,
  document_type,
  status,
  verification_source,
  certificate_number,
  issuer_name,
  test_or_administered_on,
  expires_on,
  result,
  horse_name,
  horse_date_of_birth,
  payload,
  reviewed_by_user_id,
  reviewed_at,
  created_by_user_id
)
select
  md5('draw-test-vaccine-' || n)::uuid,
  '30000000-0000-0000-0000-000000000001',
  md5('draw-test-horse-' || n)::uuid,
  'combo_vaccine',
  'approved',
  'manual',
  'DTV-' || lpad(n::text, 4, '0'),
  'Draw Test Vet',
  '2026-01-20',
  '2027-01-20',
  'Influenza/Rhino',
  'Draw Test Horse ' || lpad(n::text, 2, '0'),
  make_date(2014 + (n % 8), ((n % 12) + 1), ((n % 20) + 1)),
  '{"seed":"draw_test_program"}'::jsonb,
  '20000000-0000-0000-0000-000000000002',
  now(),
  '20000000-0000-0000-0000-000000000002'
from generate_series(1, 95) as n
on conflict (id) do update
set
  status = excluded.status,
  test_or_administered_on = excluded.test_or_administered_on,
  expires_on = excluded.expires_on,
  result = excluded.result,
  reviewed_by_user_id = excluded.reviewed_by_user_id,
  reviewed_at = excluded.reviewed_at;

with open_regular as (
  select
    n,
    n as horse_n,
    ((n - 1) % 14) + 1 as rider_n,
    false as is_late,
    'active'::varchar as status,
    '4dd00000-0000-0000-0000-000000000001'::uuid as division_id,
    125.00::numeric as base_fee,
    125.00::numeric as total_fees
  from generate_series(1, 42) as n
),
open_late as (
  select
    n,
    42 + n as horse_n,
    14 + n as rider_n,
    true as is_late,
    'active'::varchar as status,
    '4dd00000-0000-0000-0000-000000000001'::uuid as division_id,
    125.00::numeric as base_fee,
    187.50::numeric as total_fees
  from generate_series(1, 3) as n
),
open_inactive as (
  select
    n,
    45 + n as horse_n,
    n as rider_n,
    false as is_late,
    case when n = 1 then 'cancelled' else 'scratched' end::varchar as status,
    '4dd00000-0000-0000-0000-000000000001'::uuid as division_id,
    125.00::numeric as base_fee,
    125.00::numeric as total_fees
  from generate_series(1, 2) as n
),
mixed_regular as (
  select
    n,
    50 + n as horse_n,
    ((n - 1) % 10) + 1 as rider_n,
    false as is_late,
    'active'::varchar as status,
    case when n <= 15 then '4dd00000-0000-0000-0000-000000000002'::uuid else '4dd00000-0000-0000-0000-000000000003'::uuid end as division_id,
    case when n <= 15 then 115.00::numeric else 95.00::numeric end as base_fee,
    case when n <= 15 then 115.00::numeric else 95.00::numeric end as total_fees
  from generate_series(1, 30) as n
),
mixed_late as (
  select
    n,
    80 + n as horse_n,
    20 + n as rider_n,
    true as is_late,
    'active'::varchar as status,
    case when n = 1 then '4dd00000-0000-0000-0000-000000000002'::uuid else '4dd00000-0000-0000-0000-000000000003'::uuid end as division_id,
    case when n = 1 then 115.00::numeric else 95.00::numeric end as base_fee,
    case when n = 1 then 172.50::numeric else 142.50::numeric end as total_fees
  from generate_series(1, 2) as n
),
short_edge as (
  select
    n,
    82 + n as horse_n,
    case when n <= 3 then 23 else 20 + n end as rider_n,
    false as is_late,
    'active'::varchar as status,
    '4dd00000-0000-0000-0000-000000000004'::uuid as division_id,
    75.00::numeric as base_fee,
    75.00::numeric as total_fees
  from generate_series(1, 7) as n
),
planned_entries as (
  select 'open-regular-' || n as seed_key, * from open_regular
  union all
  select 'open-late-' || n as seed_key, * from open_late
  union all
  select 'open-inactive-' || n as seed_key, * from open_inactive
  union all
  select 'mixed-regular-' || n as seed_key, * from mixed_regular
  union all
  select 'mixed-late-' || n as seed_key, * from mixed_late
  union all
  select 'short-edge-' || n as seed_key, * from short_edge
)
insert into public.entries (
  id,
  organization_id,
  show_id,
  horse_id,
  division_id,
  created_by_user_id,
  owner_contact_id,
  rider_contact_id,
  payer_contact_id,
  status,
  base_fee,
  total_fees,
  is_late,
  late_fee_percent,
  late_fee_amount,
  created_at
)
select
  md5('draw-test-entry-' || seed_key)::uuid,
  '30000000-0000-0000-0000-000000000001',
  '4d000000-0000-0000-0000-000000000001',
  md5('draw-test-horse-' || horse_n)::uuid,
  division_id,
  '20000000-0000-0000-0000-000000000002',
  md5('draw-test-owner-' || horse_n)::uuid,
  md5('draw-test-rider-' || rider_n)::uuid,
  md5('draw-test-owner-' || horse_n)::uuid,
  status,
  base_fee,
  total_fees,
  is_late,
  case when is_late then 50 else 0 end,
  case when is_late then total_fees - base_fee else 0 end,
  '2026-06-04 09:00:00-04'::timestamptz + (horse_n || ' minutes')::interval
from planned_entries
on conflict (id) do update
set
  horse_id = excluded.horse_id,
  division_id = excluded.division_id,
  owner_contact_id = excluded.owner_contact_id,
  rider_contact_id = excluded.rider_contact_id,
  payer_contact_id = excluded.payer_contact_id,
  status = excluded.status,
  base_fee = excluded.base_fee,
  total_fees = excluded.total_fees,
  is_late = excluded.is_late,
  late_fee_percent = excluded.late_fee_percent,
  late_fee_amount = excluded.late_fee_amount,
  created_at = excluded.created_at;

commit;

select
  c.name as class_name,
  count(e.id) filter (where e.status not in ('cancelled', 'scratched', 'scratched_pending_refund')) as active_entries,
  count(e.id) filter (where e.is_late and e.status not in ('cancelled', 'scratched', 'scratched_pending_refund')) as late_entries
from public.classes c
join public.divisions d on d.class_id = c.id
left join public.entries e on e.division_id = d.id
where c.show_id = '4d000000-0000-0000-0000-000000000001'
group by c.id, c.name, c.sort_order
order by c.sort_order;
