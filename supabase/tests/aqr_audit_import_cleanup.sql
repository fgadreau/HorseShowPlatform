\set ON_ERROR_STOP on

begin;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

create schema if not exists aqr_audit_import_test;

create or replace function aqr_audit_import_test.assert_count(
  label text,
  sql text,
  expected_count integer
)
returns void
language plpgsql
as $$
declare
  actual_count integer;
begin
  execute sql into actual_count;

  if actual_count is distinct from expected_count then
    raise exception '%: expected %, got %', label, expected_count, actual_count;
  end if;

  raise notice 'ok - %', label;
end;
$$;

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
  '10650000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'aqr-audit-admin@example.test',
  crypt('aqr-audit-password', gen_salt('bf')),
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
  '20650000-0000-0000-0000-000000000001',
  '10650000-0000-0000-0000-000000000001',
  'AQR',
  'Admin',
  'admin'
)
on conflict (user_id) do update
set id = excluded.id,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    type_user = excluded.type_user;

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
  '30650000-0000-0000-0000-000000000001',
  'AQR Audit Test Association',
  'AQR',
  'aqr-audit-test-association',
  'aqr-audit@example.test',
  'America/Toronto',
  'CAD',
  0,
  '20650000-0000-0000-0000-000000000001'
)
on conflict (id) do update
set name = excluded.name,
    short_name = excluded.short_name,
    currency = excluded.currency;

insert into public.organization_members (id, organization_id, user_id, role)
values (
  '31650000-0000-0000-0000-000000000001',
  '30650000-0000-0000-0000-000000000001',
  '20650000-0000-0000-0000-000000000001',
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
  '40650000-0000-0000-0000-000000000001',
  '30650000-0000-0000-0000-000000000001',
  'AQR Audit Test Show',
  'aqr-audit-test-show',
  '2026-06-15',
  '2026-06-15',
  'Main Arena',
  'Sorel-Tracy, QC',
  'open',
  'America/Toronto',
  'CAD',
  0,
  false,
  '20650000-0000-0000-0000-000000000001'
)
on conflict (id) do update
set name = excluded.name,
    status = excluded.status;

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
  '50650000-0000-0000-0000-000000000001',
  '30650000-0000-0000-0000-000000000001',
  '40650000-0000-0000-0000-000000000001',
  null,
  'AQR Audit Open',
  'AQR-OPEN',
  'Main',
  '8',
  1,
  150,
  'AQR Judge',
  'open',
  true
)
on conflict (id) do update
set name = excluded.name,
    entry_fee = excluded.entry_fee;

insert into public.divisions (
  id,
  organization_id,
  show_id,
  class_id,
  name,
  code,
  level,
  entry_fee,
  judge_fee,
  payout_schedule_type
)
values (
  '60650000-0000-0000-0000-000000000001',
  '30650000-0000-0000-0000-000000000001',
  '40650000-0000-0000-0000-000000000001',
  '50650000-0000-0000-0000-000000000001',
  'Open',
  '1100',
  1,
  150,
  25,
  'nrha_schedule_a'
)
on conflict (id) do update
set entry_fee = excluded.entry_fee,
    judge_fee = excluded.judge_fee;

insert into public.contacts (
  id,
  organization_id,
  type,
  first_name,
  last_name,
  email,
  created_by_user_id
)
values (
  '70650000-0000-0000-0000-000000000001',
  '30650000-0000-0000-0000-000000000001',
  'owner',
  'AQR',
  'Owner',
  'aqr-owner@example.test',
  '20650000-0000-0000-0000-000000000001'
)
on conflict (id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name;

insert into public.horses (
  id,
  organization_id,
  name,
  primary_owner_contact_id,
  created_by_user_id
)
values (
  '80650000-0000-0000-0000-000000000001',
  '30650000-0000-0000-0000-000000000001',
  'AQR Audit Horse',
  '70650000-0000-0000-0000-000000000001',
  '20650000-0000-0000-0000-000000000001'
)
on conflict (id) do update
set name = excluded.name;

insert into public.show_score_class_setups (
  class_id,
  organization_id,
  show_id,
  show_day_id,
  pattern,
  runs,
  judges,
  is_draw_imported
)
values (
  '50650000-0000-0000-0000-000000000001',
  '30650000-0000-0000-0000-000000000001',
  '40650000-0000-0000-0000-000000000001',
  null,
  '8',
  '[{"id":"source-run-1","order":1,"draw":1,"backNumber":"101","rider":"AQR Rider","horse":"AQR Audit Horse","owner":"AQR Owner","status":"active","classCodes":["1100"]}]'::jsonb,
  '[]'::jsonb,
  true
)
on conflict (class_id) do update
set runs = excluded.runs,
    is_draw_imported = excluded.is_draw_imported;

insert into public.entry_import_batches (
  id,
  organization_id,
  show_id,
  source,
  status,
  created_by_user_id,
  summary,
  source_run_snapshots
)
values (
  '90650000-0000-0000-0000-000000000001',
  '30650000-0000-0000-0000-000000000001',
  '40650000-0000-0000-0000-000000000001',
  'showscore_draw_aqr_audit',
  'created',
  '10650000-0000-0000-0000-000000000001',
  '{"totalEntries":1,"createdEntryIds":["91650000-0000-0000-0000-000000000001"]}'::jsonb,
  '{"50650000-0000-0000-0000-000000000001":{"source-run-1":{"snapshot":{"presentFields":[],"values":{}},"runId":"92650000-0000-0000-0000-000000000001","blockRunId":"93650000-0000-0000-0000-000000000001","entryIds":["91650000-0000-0000-0000-000000000001"],"divisionIds":["60650000-0000-0000-0000-000000000001"]}}}'::jsonb
);

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
  total_fees,
  import_source,
  import_batch_id,
  external_source_key,
  source_payload
)
values (
  '91650000-0000-0000-0000-000000000001',
  '30650000-0000-0000-0000-000000000001',
  '40650000-0000-0000-0000-000000000001',
  '80650000-0000-0000-0000-000000000001',
  '60650000-0000-0000-0000-000000000001',
  '20650000-0000-0000-0000-000000000001',
  '70650000-0000-0000-0000-000000000001',
  '70650000-0000-0000-0000-000000000001',
  '70650000-0000-0000-0000-000000000001',
  'draft',
  101,
  150,
  150,
  'showscore_draw_aqr_audit',
  '90650000-0000-0000-0000-000000000001',
  '50650000-0000-0000-0000-000000000001:source-run-1:60650000-0000-0000-0000-000000000001',
  '{"sourceRunId":"source-run-1"}'::jsonb
);

update public.entries
set status = 'active'
where id = '91650000-0000-0000-0000-000000000001';

insert into public.block_run_entries (block_run_id, run_id, show_id, block_id, order_of_go)
values (
  '93650000-0000-0000-0000-000000000001',
  '92650000-0000-0000-0000-000000000001',
  '40650000-0000-0000-0000-000000000001',
  '50650000-0000-0000-0000-000000000001',
  1
);

insert into public.block_run_class_entries (block_run_id, entry_id)
values (
  '93650000-0000-0000-0000-000000000001',
  '91650000-0000-0000-0000-000000000001'
);

update public.show_score_class_setups
set runs = jsonb_set(
  runs,
  '{0}',
  runs->0 || jsonb_build_object(
    'runId', '92650000-0000-0000-0000-000000000001',
    'blockRunId', '93650000-0000-0000-0000-000000000001',
    'entryId', '91650000-0000-0000-0000-000000000001',
    'entryIds', jsonb_build_array('91650000-0000-0000-0000-000000000001'),
    'divisionId', '60650000-0000-0000-0000-000000000001',
    'divisionIds', jsonb_build_array('60650000-0000-0000-0000-000000000001'),
    'hspImportBatchId', '90650000-0000-0000-0000-000000000001'
  )
)
where class_id = '50650000-0000-0000-0000-000000000001';

select aqr_audit_import_test.assert_count(
  'AQR import creates one draft invoice entry line',
  $$select count(*)
    from public.invoice_line_items li
    where li.item_type = 'entry'
      and li.item_id = '91650000-0000-0000-0000-000000000001'$$,
  1
);

select aqr_audit_import_test.assert_count(
  'AQR import creates one judge fee line',
  $$select count(*)
    from public.invoice_line_items judge_fee_line
    where judge_fee_line.item_type = 'judge_fee'
      and judge_fee_line.invoice_id in (
        select entry_line.invoice_id
        from public.invoice_line_items entry_line
        where entry_line.item_type = 'entry'
          and entry_line.item_id = '91650000-0000-0000-0000-000000000001'
      )$$,
  1
);

delete from public.scored_runs
where run_id = '92650000-0000-0000-0000-000000000001';

delete from public.block_run_class_entries
where block_run_id = '93650000-0000-0000-0000-000000000001';

delete from public.block_run_entries
where block_run_id = '93650000-0000-0000-0000-000000000001';

delete from public.entries
where import_batch_id = '90650000-0000-0000-0000-000000000001';

delete from public.invoices i
where i.status = 'draft'
  and not exists (
    select 1
    from public.invoice_line_items li
    where li.invoice_id = i.id
  );

update public.show_score_class_setups
set runs = '[{"id":"source-run-1","order":1,"draw":1,"backNumber":"101","rider":"AQR Rider","horse":"AQR Audit Horse","owner":"AQR Owner","status":"active","classCodes":["1100"]}]'::jsonb
where class_id = '50650000-0000-0000-0000-000000000001';

update public.entry_import_batches
set status = 'cleaned',
    cleaned_at = now()
where id = '90650000-0000-0000-0000-000000000001';

select aqr_audit_import_test.assert_count(
  'AQR cleanup removes batch entries',
  $$select count(*)
    from public.entries
    where import_batch_id = '90650000-0000-0000-0000-000000000001'$$,
  0
);

select aqr_audit_import_test.assert_count(
  'AQR cleanup removes invoice lines tied to the batch entry',
  $$select count(*)
    from public.invoice_line_items
    where item_id = '91650000-0000-0000-0000-000000000001'$$,
  0
);

select aqr_audit_import_test.assert_count(
  'AQR cleanup restores ShowScore run metadata',
  $$select count(*)
    from public.show_score_class_setups
    where class_id = '50650000-0000-0000-0000-000000000001'
      and not (runs->0 ? 'runId')
      and not (runs->0 ? 'entryIds')
      and not (runs->0 ? 'hspImportBatchId')$$,
  1
);

rollback;
