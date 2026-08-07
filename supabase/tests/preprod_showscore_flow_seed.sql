-- Synthetic PREPROD-only scenario. Never add this file to the migration chain.

insert into public.organizations (
  id,
  name,
  short_name,
  slug,
  primary_contact_email,
  timezone,
  currency,
  tax_rate
)
values (
  'e1000000-0000-0000-0000-000000000001',
  'PREPROD Reining Association',
  'PREPROD',
  'preprod-reining-association',
  'fgadreau@gmail.com',
  'America/Toronto',
  'CAD',
  13
)
on conflict (id) do update
set
  name = excluded.name,
  short_name = excluded.short_name,
  primary_contact_email = excluded.primary_contact_email,
  updated_at = now();

insert into public.organization_members (organization_id, user_id, role)
select
  'e1000000-0000-0000-0000-000000000001',
  profile.id,
  'admin'
from public.user_profiles profile
where lower(profile.email) = 'fgadreau@gmail.com'
on conflict (organization_id, user_id) do update set role = excluded.role;

insert into public.disciplines (code, name, description)
values ('REINING', 'Reining', 'Synthetic PREPROD reining discipline.')
on conflict (code) do update set name = excluded.name, is_active = true;

insert into public.organization_disciplines (
  id,
  organization_id,
  discipline_id,
  is_default,
  is_active,
  settings
)
select
  'e1100000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  discipline.id,
  true,
  true,
  '{"synthetic_preprod":true}'::jsonb
from public.disciplines discipline
where discipline.code = 'REINING'
on conflict (organization_id, discipline_id) do update
set is_default = true, is_active = true, settings = excluded.settings;

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
  is_public,
  show_schedule_public,
  show_draw_public,
  show_results_public
)
values (
  'e2000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'PREPROD End-to-End Classic',
  'preprod-end-to-end-classic',
  '2026-09-12',
  '2026-09-13',
  'Synthetic Main Arena',
  'Ottawa, ON',
  'open',
  'America/Toronto',
  'CAD',
  true,
  true,
  true,
  true
)
on conflict (id) do update
set
  name = excluded.name,
  status = excluded.status,
  is_public = true,
  show_schedule_public = true,
  show_draw_public = true,
  show_results_public = true,
  updated_at = now();

delete from public.show_days
where show_id = 'e2000000-0000-0000-0000-000000000001'
  and id <> 'e2100000-0000-0000-0000-000000000001';

insert into public.show_days (
  id,
  organization_id,
  show_id,
  day_date,
  day_name,
  day_number,
  sort_order
)
values (
  'e2100000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001',
  '2026-09-12',
  'PREPROD Saturday',
  1,
  1
)
on conflict (id) do update set day_name = excluded.day_name, sort_order = 1;

insert into public.blocks (
  id,
  organization_id,
  show_id,
  show_day_id,
  name,
  display_label,
  block_type,
  arena,
  pattern,
  judge_display_name,
  schedule_start_mode,
  scheduled_time,
  sort_order,
  schedule_status,
  schedule_is_public,
  results_are_public
)
values (
  'e3000000-0000-0000-0000-000000000001',
  'e1000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001',
  'e2100000-0000-0000-0000-000000000001',
  'Open Reining — synthetic flow',
  'Block PRE-01',
  'competition',
  'Synthetic Main',
  '8',
  'Judge PREPROD',
  'fixed',
  '09:00',
  1,
  'running',
  true,
  true
)
on conflict (id) do update
set
  name = excluded.name,
  display_label = excluded.display_label,
  block_type = excluded.block_type,
  pattern = excluded.pattern,
  judge_display_name = excluded.judge_display_name,
  schedule_status = excluded.schedule_status,
  schedule_is_public = true,
  results_are_public = true,
  updated_at = now();

insert into public.classes (
  id,
  organization_id,
  show_id,
  block_id,
  organization_discipline_id,
  name,
  code,
  level,
  entry_fee,
  sort_order,
  registration_status,
  is_public
)
values
  (
    'e3100000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000001',
    'e3000000-0000-0000-0000-000000000001',
    'e1100000-0000-0000-0000-000000000001',
    'Open Level 1',
    'OL1',
    1,
    125,
    1,
    'open',
    true
  ),
  (
    'e3100000-0000-0000-0000-000000000002',
    'e1000000-0000-0000-0000-000000000001',
    'e2000000-0000-0000-0000-000000000001',
    'e3000000-0000-0000-0000-000000000001',
    'e1100000-0000-0000-0000-000000000001',
    'Open Level 2',
    'OL2',
    2,
    150,
    2,
    'open',
    true
  )
on conflict (id) do update
set name = excluded.name, code = excluded.code, entry_fee = excluded.entry_fee, sort_order = excluded.sort_order;

insert into public.show_score_block_setups (
  block_id,
  pattern,
  runs,
  judges,
  block_classes,
  is_draw_imported,
  live_data_source,
  live_display_mode
)
values (
  'e3000000-0000-0000-0000-000000000001',
  '8',
  '[
    {"id":"synthetic-run-1","draw":1,"backNumber":"101","rider":"Alex PREPROD","horse":"Synthetic Whiz","owner":"PREPROD Owner","classCodes":["OL1","OL2"]},
    {"id":"synthetic-run-2","draw":2,"backNumber":"102","rider":"Sam PREPROD","horse":"Synthetic Slide","owner":"PREPROD Owner","classCodes":["OL1"]}
  ]'::jsonb,
  '[{"id":"judge-preprod","name":"Judge PREPROD","order":1}]'::jsonb,
  '[
    {"id":"e3100000-0000-0000-0000-000000000001","code":"OL1","name":"Open Level 1","classNumber":"101"},
    {"id":"e3100000-0000-0000-0000-000000000002","code":"OL2","name":"Open Level 2","classNumber":"102"}
  ]'::jsonb,
  true,
  'scribe',
  'full'
)
on conflict (block_id) do update
set
  pattern = excluded.pattern,
  runs = excluded.runs,
  judges = excluded.judges,
  block_classes = excluded.block_classes,
  is_draw_imported = true,
  live_data_source = excluded.live_data_source,
  live_display_mode = excluded.live_display_mode,
  updated_at = now();

insert into public.show_score_scoring_sessions (block_id, runs, started_at)
values (
  'e3000000-0000-0000-0000-000000000001',
  '[
    {"id":"synthetic-run-1","draw":1,"backNumber":"101","rider":"Alex PREPROD","horse":"Synthetic Whiz","classCodes":["OL1","OL2"],"scoreTotal":72.5,"status":"scored"},
    {"id":"synthetic-run-2","draw":2,"backNumber":"102","rider":"Sam PREPROD","horse":"Synthetic Slide","classCodes":["OL1"],"scoreTotal":70,"status":"scored"}
  ]'::jsonb,
  now() - interval '15 minutes'
)
on conflict (block_id) do update set runs = excluded.runs, started_at = excluded.started_at, updated_at = now();

insert into public.show_score_official_results (
  block_id,
  judge_name,
  finalized,
  finalized_at,
  secretariat_validated_at,
  official_runs
)
values (
  'e3000000-0000-0000-0000-000000000001',
  'Judge PREPROD',
  true,
  now() - interval '5 minutes',
  now() - interval '4 minutes',
  '[
    {"id":"synthetic-run-1","draw":1,"backNumber":"101","rider":"Alex PREPROD","horse":"Synthetic Whiz","classCodes":["OL1","OL2"],"scoreTotal":72.5,"status":"scored"},
    {"id":"synthetic-run-2","draw":2,"backNumber":"102","rider":"Sam PREPROD","horse":"Synthetic Slide","classCodes":["OL1"],"scoreTotal":70,"status":"scored"}
  ]'::jsonb
)
on conflict (block_id) do update
set finalized = true, finalized_at = excluded.finalized_at, secretariat_validated_at = excluded.secretariat_validated_at, official_runs = excluded.official_runs;

insert into public.show_score_publication_states (
  block_id,
  status,
  published_at,
  published_by,
  planned_live_status
)
values (
  'e3000000-0000-0000-0000-000000000001',
  'published',
  now(),
  'PREPROD synthetic seed',
  'live_scoring'
)
on conflict (block_id) do update
set status = 'published', published_at = excluded.published_at, published_by = excluded.published_by;

insert into public.block_result_publications (
  block_id,
  status,
  published_at,
  published_by,
  result_groups
)
values (
  'e3000000-0000-0000-0000-000000000001',
  'published',
  now(),
  'PREPROD synthetic seed',
  '[
    {"id":"OL1","code":"OL1","classCode":"OL1","className":"Open Level 1","results":[{"runId":"synthetic-run-1","place":1,"score":72.5},{"runId":"synthetic-run-2","place":2,"score":70}]},
    {"id":"OL2","code":"OL2","classCode":"OL2","className":"Open Level 2","results":[{"runId":"synthetic-run-1","place":1,"score":72.5}]}
  ]'::jsonb
)
on conflict (block_id) do update
set status = 'published', published_at = excluded.published_at, published_by = excluded.published_by, result_groups = excluded.result_groups;
