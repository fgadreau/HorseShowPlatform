\set ON_ERROR_STOP on

begin;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

delete from public.organization_members
where user_id in (
  select id
  from public.user_profiles
  where user_id = '10640000-0000-0000-0000-000000000001'
);
delete from public.user_profiles
where user_id = '10640000-0000-0000-0000-000000000001';
delete from auth.users
where id = '10640000-0000-0000-0000-000000000001';

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  phone_change,
  phone_change_token,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '10640000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'results-payouts-admin@example.test',
  crypt('phase1-password', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do update
set email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    updated_at = now();

insert into public.user_profiles (id, user_id, first_name, last_name, type_user)
values (
  '20640000-0000-0000-0000-000000000001',
  '10640000-0000-0000-0000-000000000001',
  'Results',
  'Admin',
  'admin'
)
on conflict (user_id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    type_user = excluded.type_user,
    updated_at = now();

insert into public.organizations (
  id,
  name,
  short_name,
  slug,
  primary_contact_email,
  timezone,
  currency,
  tax_rate,
  created_by_user_id
)
values (
  '30640000-0000-0000-0000-000000000001',
  'Results Payout Test Association',
  'RPTA',
  'results-payout-test-association',
  'results-payouts-admin@example.test',
  'America/Toronto',
  'CAD',
  13.00,
  (select id from public.user_profiles where user_id = '10640000-0000-0000-0000-000000000001')
)
on conflict (id) do update
set name = excluded.name,
    short_name = excluded.short_name,
    primary_contact_email = excluded.primary_contact_email,
    timezone = excluded.timezone,
    currency = excluded.currency,
    tax_rate = excluded.tax_rate,
    updated_at = now();

insert into public.organization_members (id, organization_id, user_id, role)
values (
  '31640000-0000-0000-0000-000000000001',
  '30640000-0000-0000-0000-000000000001',
  (select id from public.user_profiles where user_id = '10640000-0000-0000-0000-000000000001'),
  'admin'
)
on conflict (organization_id, user_id) do update
set role = excluded.role;

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
  '40640000-0000-0000-0000-000000000001',
  '30640000-0000-0000-0000-000000000001',
  'Results Payout Test Show',
  'results-payout-test-show',
  '2026-06-12',
  '2026-06-14',
  'Main Arena',
  'Ottawa, ON',
  'open',
  'America/Toronto',
  'CAD',
  13.00,
  false,
  (select id from public.user_profiles where user_id = '10640000-0000-0000-0000-000000000001')
)
on conflict (id) do update
set name = excluded.name,
    status = excluded.status,
    is_public = excluded.is_public,
    updated_at = now();

insert into public.classes (
  id,
  organization_id,
  show_id,
  show_day_id,
  name,
  code,
  arena,
  pattern,
  sort_order,
  entry_fee,
  judge_name,
  status,
  is_public
)
values (
  '50640000-0000-0000-0000-000000000001',
  '30640000-0000-0000-0000-000000000001',
  '40640000-0000-0000-0000-000000000001',
  null,
  'Open Reining',
  'OR-1',
  'Main',
  '8',
  1,
  150.00,
  'Results Judge',
  'open',
  true
)
on conflict (id) do update
set name = excluded.name,
    is_public = excluded.is_public,
    updated_at = now();

insert into public.divisions (
  id,
  organization_id,
  show_id,
  class_id,
  name,
  level,
  entry_fee
)
values (
  '60640000-0000-0000-0000-000000000001',
  '30640000-0000-0000-0000-000000000001',
  '40640000-0000-0000-0000-000000000001',
  '50640000-0000-0000-0000-000000000001',
  'Open',
  1,
  150.00
)
on conflict (id) do update
set name = excluded.name,
    entry_fee = excluded.entry_fee,
    updated_at = now();

insert into public.contacts (
  id,
  organization_id,
  type,
  first_name,
  last_name,
  email,
  created_by_user_id
)
values
  ('70640000-0000-0000-0000-000000000001', '30640000-0000-0000-0000-000000000001', 'owner', 'Results', 'Owner', 'results-owner@example.test', (select id from public.user_profiles where user_id = '10640000-0000-0000-0000-000000000001')),
  ('70640000-0000-0000-0000-000000000002', '30640000-0000-0000-0000-000000000001', 'rider', 'Results', 'Rider', 'results-rider@example.test', (select id from public.user_profiles where user_id = '10640000-0000-0000-0000-000000000001'))
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    updated_at = now();

insert into public.horses (
  id,
  organization_id,
  name,
  breed,
  color,
  gender,
  registration_number,
  primary_owner_contact_id,
  created_by_user_id
)
values (
  '80640000-0000-0000-0000-000000000001',
  '30640000-0000-0000-0000-000000000001',
  'Results Test Whiz',
  'Quarter Horse',
  'Bay',
  'G',
  'RPTA-001',
  '70640000-0000-0000-0000-000000000001',
  (select id from public.user_profiles where user_id = '10640000-0000-0000-0000-000000000001')
)
on conflict (id) do update
set name = excluded.name,
    primary_owner_contact_id = excluded.primary_owner_contact_id,
    updated_at = now();

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
  result,
  horse_name,
  reviewed_by_user_id,
  reviewed_at,
  created_by_user_id
)
values
  (
    '82640000-0000-0000-0000-000000000001',
    '30640000-0000-0000-0000-000000000001',
    '80640000-0000-0000-0000-000000000001',
    'coggins_eia',
    'approved',
    'manual',
    'RPTA-COGGINS-2026',
    'Results Vet',
    '2026-01-15',
    'negative',
    'Results Test Whiz',
    (select id from public.user_profiles where user_id = '10640000-0000-0000-0000-000000000001'),
    now(),
    (select id from public.user_profiles where user_id = '10640000-0000-0000-0000-000000000001')
  ),
  (
    '82640000-0000-0000-0000-000000000002',
    '30640000-0000-0000-0000-000000000001',
    '80640000-0000-0000-0000-000000000001',
    'combo_vaccine',
    'approved',
    'manual',
    'RPTA-VACCINE-2026',
    'Results Vet',
    '2026-01-15',
    null,
    'Results Test Whiz',
    (select id from public.user_profiles where user_id = '10640000-0000-0000-0000-000000000001'),
    now(),
    (select id from public.user_profiles where user_id = '10640000-0000-0000-0000-000000000001')
  )
on conflict (id) do update
set status = excluded.status,
    test_or_administered_on = excluded.test_or_administered_on,
    reviewed_by_user_id = excluded.reviewed_by_user_id,
    reviewed_at = excluded.reviewed_at,
    updated_at = now();

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
  entry_number,
  base_fee,
  total_fees
)
values (
  '90640000-0000-0000-0000-000000000001',
  '30640000-0000-0000-0000-000000000001',
  '40640000-0000-0000-0000-000000000001',
  '80640000-0000-0000-0000-000000000001',
  '60640000-0000-0000-0000-000000000001',
  (select id from public.user_profiles where user_id = '10640000-0000-0000-0000-000000000001'),
  '70640000-0000-0000-0000-000000000001',
  '70640000-0000-0000-0000-000000000002',
  '70640000-0000-0000-0000-000000000001',
  'active',
  101,
  150.00,
  150.00
)
on conflict (id) do update
set status = excluded.status,
    entry_number = excluded.entry_number,
    updated_at = now();

create schema if not exists results_payouts_test;
grant usage on schema results_payouts_test to anon, authenticated;

create or replace function results_payouts_test.as_user(auth_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', auth_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create or replace function results_payouts_test.assert_count(
  label text,
  query text,
  expected_count bigint
)
returns void
language plpgsql
as $$
declare
  actual_count bigint;
begin
  execute query into actual_count;

  if actual_count is distinct from expected_count then
    raise exception '% expected %, got %', label, expected_count, actual_count;
  end if;

  raise notice 'ok - %', label;
end;
$$;

grant execute on all functions in schema results_payouts_test to anon, authenticated;

set local role authenticated;
select results_payouts_test.as_user('10640000-0000-0000-0000-000000000001');

insert into public.payout_calculations (
  id,
  show_id,
  division_id,
  status,
  currency,
  entry_count,
  gross_entry_fees,
  trophy_or_plaque_fee,
  base_after_trophy_fee,
  nrha_fee_amount,
  net_entry_fee,
  retainage_amount,
  final_net_entry_fee,
  added_money,
  net_purse,
  payout_schedule_id,
  source_snapshot,
  result_snapshot,
  calculated_by
)
values (
  '64640000-0000-0000-0000-000000001001',
  '40640000-0000-0000-0000-000000000001',
  '60640000-0000-0000-0000-000000000001',
  'draft',
  'CAD',
  1,
  150.00,
  0.00,
  150.00,
  7.50,
  142.50,
  0.00,
  142.50,
  0.00,
  142.50,
  '64000000-0000-0000-0000-000000000001',
  '{"test":"draft"}'::jsonb,
  '[{"entry_id":"90640000-0000-0000-0000-000000000001","rank":1,"back_number":"101","rider_name":"Test Rider","horse_name":"Test Horse","owner_name":"Test Owner","final_score":72,"status":"scored","payout_amount":142.5,"payout_percentage":100,"payee_contact_id":"70640000-0000-0000-0000-000000000001","payee_name":"Test Owner"}]'::jsonb,
  '10640000-0000-0000-0000-000000000001'
);

insert into public.payout_awards (
  id,
  calculation_id,
  entry_id,
  rank,
  percentage,
  amount,
  payee_contact_id,
  payee_name
)
values (
  '64640000-0000-0000-0000-000000001002',
  '64640000-0000-0000-0000-000000001001',
  '90640000-0000-0000-0000-000000000001',
  1,
  100,
  142.50,
  '70640000-0000-0000-0000-000000000001',
  'Test Owner'
);

select results_payouts_test.assert_count(
  'staff can persist payout calculation',
  $$select count(*) from public.payout_calculations where id = '64640000-0000-0000-0000-000000001001'$$,
  1
);

reset role;

set local role anon;
select results_payouts_test.assert_count(
  'anon cannot read draft payout calculation',
  $$select count(*) from public.payout_calculations where id = '64640000-0000-0000-0000-000000001001'$$,
  0
);
select results_payouts_test.assert_count(
  'anon cannot read draft payout award',
  $$select count(*) from public.payout_awards where id = '64640000-0000-0000-0000-000000001002'$$,
  0
);

reset role;

set local role authenticated;
select results_payouts_test.as_user('10640000-0000-0000-0000-000000000001');
update public.shows
set is_public = true
where id = '40640000-0000-0000-0000-000000000001';

update public.payout_calculations
set status = 'published',
    published_at = now()
where id = '64640000-0000-0000-0000-000000001001';
reset role;

set local role anon;
select results_payouts_test.assert_count(
  'anon can read published payout calculation for public show',
  $$select count(*) from public.payout_calculations where id = '64640000-0000-0000-0000-000000001001'$$,
  1
);
select results_payouts_test.assert_count(
  'anon can read published payout award for public show',
  $$select count(*) from public.payout_awards where id = '64640000-0000-0000-0000-000000001002'$$,
  1
);

rollback;
