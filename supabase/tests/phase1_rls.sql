\set ON_ERROR_STOP on

begin;

-- Load deterministic data inside this transaction so the test can be run
-- repeatedly without polluting a shared staging database.
\ir ../seed.sql

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

create schema if not exists phase1_test;
grant usage on schema phase1_test to anon, authenticated;

create or replace function phase1_test.as_user(auth_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', auth_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create or replace function phase1_test.assert_count(
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

create or replace function phase1_test.assert_succeeds(label text, statement text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise notice 'ok - %', label;
exception
  when others then
    raise exception '% expected success, got [%] %', label, sqlstate, sqlerrm;
end;
$$;

create or replace function phase1_test.assert_denied(label text, statement text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception
    when insufficient_privilege or check_violation then
      raise notice 'ok - %', label;
      return;
    when others then
      raise exception '% expected RLS/check denial, got [%] %', label, sqlstate, sqlerrm;
  end;

  raise exception '% expected RLS/check denial, but statement succeeded', label;
end;
$$;

grant execute on all functions in schema phase1_test to anon, authenticated;

set local role anon;
select phase1_test.assert_count(
  'anon cannot see private shows',
  'select count(*) from public.shows',
  0
);
select phase1_test.assert_count(
  'anon cannot see private ShowScore setups',
  'select count(*) from public.show_score_class_setups',
  0
);
reset role;

set local role authenticated;
select phase1_test.as_user('10000000-0000-0000-0000-000000000001');
select phase1_test.assert_count(
  'platform admin sees both organizations',
  'select count(*) from public.organizations',
  2
);
select phase1_test.assert_count(
  'platform admin sees both entries',
  'select count(*) from public.entries',
  2
);
reset role;

set local role authenticated;
select phase1_test.as_user('10000000-0000-0000-0000-000000000002');
select phase1_test.assert_count(
  'org A admin sees only org A',
  'select count(*) from public.organizations',
  1
);
select phase1_test.assert_count(
  'org A admin cannot see org B directly',
  $$select count(*) from public.organizations where id = '30000000-0000-0000-0000-000000000002'$$,
  0
);
select phase1_test.assert_count(
  'org A admin sees org A contacts',
  'select count(*) from public.contacts',
  3
);
select phase1_test.assert_count(
  'org A admin sees org A invoices',
  'select count(*) from public.invoices',
  1
);
reset role;

set local role authenticated;
select phase1_test.as_user('10000000-0000-0000-0000-000000000003');
select phase1_test.assert_count(
  'org A secretary sees org A entries',
  'select count(*) from public.entries',
  1
);
select phase1_test.assert_succeeds(
  'org A secretary can create an org A invoice',
  $$insert into public.invoices (
      id,
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
      'a0000000-0000-0000-0000-000000000101',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '9999',
      '70000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000003',
      'draft',
      0,
      0,
      0,
      0
    )$$
);
reset role;

set local role authenticated;
select phase1_test.as_user('10000000-0000-0000-0000-000000000004');
select phase1_test.assert_count(
  'owner sees no organization membership rows',
  'select count(*) from public.organization_members',
  0
);
select phase1_test.assert_count(
  'owner sees own linked contacts',
  'select count(*) from public.contacts',
  3
);
select phase1_test.assert_count(
  'owner sees own horse',
  'select count(*) from public.horses',
  1
);
select phase1_test.assert_count(
  'owner sees own entry',
  'select count(*) from public.entries',
  1
);
select phase1_test.assert_count(
  'owner sees own invoices',
  'select count(*) from public.invoices',
  2
);
select phase1_test.assert_succeeds(
  'owner can create a second draft entry for own horse',
  $$insert into public.entries (
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
      total_fees
    )
    values (
      '90000000-0000-0000-0000-000000000101',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000004',
      '70000000-0000-0000-0000-000000000001',
      null,
      '70000000-0000-0000-0000-000000000001',
      'draft',
      125,
      125
    )$$
);
select phase1_test.assert_denied(
  'owner cannot create an entry for org B horse',
  $$insert into public.entries (
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
      total_fees
    )
    values (
      '90000000-0000-0000-0000-000000000102',
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000002',
      '80000000-0000-0000-0000-000000000002',
      '60000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000004',
      '70000000-0000-0000-0000-000000000003',
      null,
      '70000000-0000-0000-0000-000000000003',
      'draft',
      145,
      145
    )$$
);
reset role;

set local role authenticated;
select phase1_test.as_user('10000000-0000-0000-0000-000000000005');
select phase1_test.assert_count(
  'show judge can view ShowScore setup for assigned show',
  'select count(*) from public.show_score_class_setups',
  1
);
select phase1_test.assert_count(
  'show judge cannot update ShowScore class setup',
  $$with updated as (
      update public.show_score_class_setups
      set drag_duration_minutes = 9
      where class_id = '50000000-0000-0000-0000-000000000001'
      returning 1
    )
    select count(*) from updated$$,
  0
);
select phase1_test.assert_succeeds(
  'show judge can create a scoring session',
  $$insert into public.show_score_scoring_sessions (
      class_id,
      organization_id,
      show_id,
      runs
    )
    values (
      '50000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '[]'::jsonb
    )$$
);
reset role;

set local role authenticated;
select phase1_test.as_user('10000000-0000-0000-0000-000000000006');
select phase1_test.assert_count(
  'org B admin sees only org B',
  'select count(*) from public.organizations',
  1
);
select phase1_test.assert_count(
  'org B admin cannot see org A invoice',
  $$select count(*) from public.invoices where id = 'a0000000-0000-0000-0000-000000000001'$$,
  0
);
select phase1_test.assert_count(
  'org B admin sees org B entry',
  'select count(*) from public.entries',
  1
);
reset role;

rollback;
