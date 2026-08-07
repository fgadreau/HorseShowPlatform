-- Phase 1 local/staging seed data.
-- This file is deterministic and safe to rerun. It is intended for local RLS
-- validation, not for production data loading.

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
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'phase1.platform@example.test', crypt('phase1-password', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'phase1.org-a-admin@example.test', crypt('phase1-password', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'phase1.org-a-secretary@example.test', crypt('phase1-password', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'phase1.org-a-owner@example.test', crypt('phase1-password', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'phase1.org-a-judge@example.test', crypt('phase1-password', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'phase1.org-b-admin@example.test', crypt('phase1-password', gen_salt('bf')), now(), '', '', '', '', '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  confirmation_token = excluded.confirmation_token,
  recovery_token = excluded.recovery_token,
  email_change_token_new = excluded.email_change_token_new,
  email_change = excluded.email_change,
  phone_change = excluded.phone_change,
  phone_change_token = excluded.phone_change_token,
  email_change_token_current = excluded.email_change_token_current,
  reauthentication_token = excluded.reauthentication_token,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

insert into public.user_profiles (id, user_id, first_name, last_name, type_user)
values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Phase1', 'Platform', 'admin'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Phase1', 'Org A Admin', 'admin'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Phase1', 'Org A Secretary', 'secretary'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'Phase1', 'Org A Owner', 'owner'),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000005', 'Phase1', 'Org A Judge', 'secretary'),
  ('20000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000006', 'Phase1', 'Org B Admin', 'admin')
on conflict (user_id) do update
set
  id = excluded.id,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  type_user = excluded.type_user,
  updated_at = now();

insert into public.platform_admins (id, user_id)
values ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')
on conflict (user_id) do nothing;

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
values
  ('30000000-0000-0000-0000-000000000001', 'Phase 1 Association A', 'P1A', 'phase-1-association-a', 'phase1.org-a-admin@example.test', 'America/Toronto', 'CAD', 13.00, '20000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000002', 'Phase 1 Association B', 'P1B', 'phase-1-association-b', 'phase1.org-b-admin@example.test', 'America/Toronto', 'CAD', 13.00, '20000000-0000-0000-0000-000000000006')
on conflict (id) do update
set
  name = excluded.name,
  short_name = excluded.short_name,
  primary_contact_email = excluded.primary_contact_email,
  timezone = excluded.timezone,
  currency = excluded.currency,
  tax_rate = excluded.tax_rate,
  updated_at = now();

insert into public.organization_members (id, organization_id, user_id, role)
values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'admin'),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'secretary'),
  ('31000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006', 'admin')
on conflict (organization_id, user_id) do update
set role = excluded.role;

insert into public.disciplines (id, code, name, description)
values
  ('32000000-0000-0000-0000-000000000001', 'REINING', 'Reining', 'Reining classes and scoring blocks.'),
  ('32000000-0000-0000-0000-000000000002', 'GYMKHANA', 'Gymkhana', 'Timed gymkhana disciplines and directories.'),
  ('32000000-0000-0000-0000-000000000003', 'PERFORMANCE', 'Performance', 'Western performance disciplines and directories.')
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    updated_at = now();

insert into public.organization_disciplines (
  id,
  organization_id,
  discipline_id,
  is_default,
  is_active,
  created_by_user_id
)
values
  ('33000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000001', true, true, '20000000-0000-0000-0000-000000000002'),
  ('33000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000001', true, true, '20000000-0000-0000-0000-000000000006'),
  ('33000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000002', false, true, '20000000-0000-0000-0000-000000000002'),
  ('33000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000003', false, true, '20000000-0000-0000-0000-000000000002'),
  ('33000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000003', false, true, '20000000-0000-0000-0000-000000000006')
on conflict (organization_id, discipline_id) do update
set is_default = excluded.is_default,
    is_active = excluded.is_active,
    updated_at = now();

insert into public.organization_deadline_policies (organization_id)
values
  ('30000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000002')
on conflict (organization_id) do nothing;

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
values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Phase 1 Spring Classic', 'phase-1-spring-classic', '2026-06-12', '2026-06-14', 'Main Arena', 'Ottawa, ON', 'open', 'America/Toronto', 'CAD', 13.00, false, false, false, false, '20000000-0000-0000-0000-000000000002'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'Phase 1 Summer Classic', 'phase-1-summer-classic', '2026-07-10', '2026-07-12', 'West Arena', 'Kingston, ON', 'open', 'America/Toronto', 'CAD', 13.00, false, false, false, false, '20000000-0000-0000-0000-000000000006')
on conflict (id) do update
set
  name = excluded.name,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  venue = excluded.venue,
  location = excluded.location,
  status = excluded.status,
  updated_at = now();

insert into public.show_roles (id, organization_id, show_id, user_id, role)
values
  ('42000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'secretary'),
  ('42000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'judge')
on conflict (show_id, user_id, role) do update
set organization_id = excluded.organization_id;

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
values
  ('41000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2026-06-12', 'Friday', 1, 1, '08:00'),
  ('41000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '2026-07-10', 'Friday', 1, 1, '08:00')
on conflict (show_id, day_date) do update
set
  id = excluded.id,
  organization_id = excluded.organization_id,
  day_date = excluded.day_date,
  day_name = excluded.day_name,
  day_number = excluded.day_number,
  sort_order = excluded.sort_order,
  start_time = excluded.start_time,
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
  category,
  notes
)
values
  ('c0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Stall', 'Standard show stall for the event.', 175.00, 40, 40, 3, '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'stall', null),
  ('c0000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Tack stall', 'Extra stall for tack and equipment.', 150.00, 12, 12, 3, '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'stall', null),
  ('c0000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Ripe / shavings', 'Bedding bags available on site.', 10.00, 120, 120, null, '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'extra', null),
  ('c0000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Foin / hay', 'Hay bales available on site.', 14.00, 80, 80, null, '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'extra', null),
  ('c0000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Camping', 'Weekend camping spot.', 95.00, 25, 25, 3, '41000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'camping', null),
  ('c0000000-0000-0000-0000-000000000006', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'Stall', 'Standard show stall for the event.', 170.00, 30, 30, 3, '41000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'stall', null)
on conflict (id) do update
set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  total_quantity = excluded.total_quantity,
  available_quantity = excluded.available_quantity,
  duration_days = excluded.duration_days,
  show_day_start_id = excluded.show_day_start_id,
  show_day_end_id = excluded.show_day_end_id,
  category = excluded.category,
  notes = excluded.notes,
  updated_at = now();

insert into public.blocks (
  id,
  organization_id,
  show_id,
  show_day_id,
  name,
  arena,
  pattern,
  sort_order,
  judge_display_name,
  schedule_status,
  schedule_is_public
)
values
  ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Open Reining', 'Main', '8', 1, 'Phase1 Judge', 'open', true),
  ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'Novice Reining', 'Main', '5', 2, 'Phase1 Judge', 'open', true),
  ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'Org B Open Reining', 'West', '6', 1, null, 'open', true)
on conflict (id) do update
set
  name = excluded.name,
  arena = excluded.arena,
  pattern = excluded.pattern,
  sort_order = excluded.sort_order,
  judge_display_name = excluded.judge_display_name,
  schedule_status = excluded.schedule_status,
  schedule_is_public = excluded.schedule_is_public,
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
  sort_order
)
values
  ('60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', 'Open', 'OR-1', 1, 150.00, 1),
  ('60000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000001', 'Novice Horse', 'NR-1', 2, 125.00, 1),
  ('60000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000002', 'Open', 'BOR-1', 1, 145.00, 1)
on conflict (id) do update
set
  name = excluded.name,
  code = excluded.code,
  level = excluded.level,
  entry_fee = excluded.entry_fee,
  organization_discipline_id = excluded.organization_discipline_id,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into public.organization_governing_bodies (
  organization_id,
  governing_body_id,
  is_active,
  settings
)
select
  mapping.organization_id::uuid,
  body.id,
  true,
  '{}'::jsonb
from (
  values
    ('30000000-0000-0000-0000-000000000001', 'NRHA'),
    ('30000000-0000-0000-0000-000000000001', 'AQR'),
    ('30000000-0000-0000-0000-000000000002', 'AQR')
) mapping(organization_id, body_code)
join public.governing_bodies body on body.code = mapping.body_code
on conflict (organization_id, governing_body_id) do update
set is_active = true,
    settings = excluded.settings,
    updated_at = now();

insert into public.class_governing_bodies (
  class_id,
  governing_body_id,
  reporting_class_code,
  eligibility_profile_code,
  sanction_metadata
)
select
  mapping.class_id::uuid,
  body.id,
  mapping.reporting_class_code,
  mapping.eligibility_profile_code,
  mapping.sanction_metadata::jsonb
from (
  values
    ('60000000-0000-0000-0000-000000000001', 'NRHA', '1100', 'category_1_ancillary_year_end', '{"seed_scenario":"multi_body","eligibility_cache_ttl_hours":6,"source_unavailable_policy":"block"}'),
    ('60000000-0000-0000-0000-000000000001', 'AQR', 'OR-1', null, '{"seed_scenario":"multi_body"}'),
    ('60000000-0000-0000-0000-000000000002', 'AQR', 'NR-1', null, '{}'),
    ('60000000-0000-0000-0000-000000000003', 'AQR', 'BOR-1', null, '{}')
) mapping(class_id, body_code, reporting_class_code, eligibility_profile_code, sanction_metadata)
join public.governing_bodies body on body.code = mapping.body_code
on conflict (class_id, governing_body_id) do update
set reporting_class_code = excluded.reporting_class_code,
    eligibility_profile_code = excluded.eligibility_profile_code,
    sanction_metadata = excluded.sanction_metadata,
    updated_at = now();

insert into public.contacts (
  id,
  type,
  first_name,
  last_name,
  email,
  linked_user_id,
  barn_name,
  created_by_user_id
)
values
  ('70000000-0000-0000-0000-000000000001', 'owner', 'Phase1', 'Owner A', 'phase1.owner-a@example.test', '20000000-0000-0000-0000-000000000004', 'North Barn', '20000000-0000-0000-0000-000000000004'),
  ('70000000-0000-0000-0000-000000000002', 'rider', 'Phase1', 'Rider A', 'phase1.rider-a@example.test', '20000000-0000-0000-0000-000000000004', 'North Barn', '20000000-0000-0000-0000-000000000002'),
  ('70000000-0000-0000-0000-000000000003', 'owner', 'Phase1', 'Owner B', 'phase1.owner-b@example.test', null, 'West Barn', '20000000-0000-0000-0000-000000000006'),
  ('70000000-0000-0000-0000-000000000004', 'rider', 'Phase1', 'Rider B', 'phase1.rider-b@example.test', '20000000-0000-0000-0000-000000000004', 'North Barn', '20000000-0000-0000-0000-000000000004')
on conflict (id) do update
set
  type = excluded.type,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  email = excluded.email,
  linked_user_id = excluded.linked_user_id,
  barn_name = excluded.barn_name,
  updated_at = now();

insert into public.horses (
  id,
  name,
  breed,
  color,
  gender,
  registration_number,
  primary_owner_contact_id,
  created_by_user_id
)
values
  ('80000000-0000-0000-0000-000000000001', 'Phase One Whiz', 'Quarter Horse', 'Bay', 'G', 'P1-A-001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004'),
  ('80000000-0000-0000-0000-000000000002', 'Phase One Slide', 'Quarter Horse', 'Sorrel', 'M', 'P1-B-001', '70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000006')
on conflict (id) do update
set
  name = excluded.name,
  breed = excluded.breed,
  color = excluded.color,
  gender = excluded.gender,
  registration_number = excluded.registration_number,
  primary_owner_contact_id = excluded.primary_owner_contact_id,
  updated_at = now();

insert into public.horse_contacts (
  id,
  horse_id,
  contact_id,
  role,
  can_create_entries,
  can_modify_entries,
  can_book_stalls,
  can_pay_invoices
)
values
  ('81000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'owner', true, true, true, true),
  ('81000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003', 'owner', true, true, true, true)
on conflict (horse_id, contact_id, role) do update
set
  can_create_entries = excluded.can_create_entries,
  can_modify_entries = excluded.can_modify_entries,
  can_book_stalls = excluded.can_book_stalls,
  can_pay_invoices = excluded.can_pay_invoices;

-- Scenario multidisciplinaire: les mêmes fiches globales vivent dans plusieurs répertoires.
insert into public.directory_contacts (
  id,
  organization_discipline_id,
  contact_id,
  source,
  created_by_user_id
)
values
  ('83000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', 'manual', '20000000-0000-0000-0000-000000000002'),
  ('83000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000003', '70000000-0000-0000-0000-000000000001', 'manual', '20000000-0000-0000-0000-000000000002'),
  ('83000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001', 'manual', '20000000-0000-0000-0000-000000000002')
on conflict (organization_discipline_id, contact_id) do nothing;

insert into public.directory_horses (
  id,
  organization_discipline_id,
  horse_id,
  source,
  created_by_user_id
)
values
  ('84000000-0000-0000-0000-000000000001', '33000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'manual', '20000000-0000-0000-0000-000000000002'),
  ('84000000-0000-0000-0000-000000000002', '33000000-0000-0000-0000-000000000003', '80000000-0000-0000-0000-000000000001', 'manual', '20000000-0000-0000-0000-000000000002'),
  ('84000000-0000-0000-0000-000000000003', '33000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'manual', '20000000-0000-0000-0000-000000000006')
on conflict (organization_discipline_id, horse_id) do nothing;

insert into public.horse_documents (
  id,
  uploaded_by_organization_id,
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
  ('82000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'coggins_eia', 'approved', 'manual', 'P1-A-COGGINS-2026', 'Phase 1 Vet', '2026-01-15', 'negative', 'Phase One Whiz', '20000000-0000-0000-0000-000000000002', now(), '20000000-0000-0000-0000-000000000004'),
  ('82000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'combo_vaccine', 'approved', 'manual', 'P1-A-VACCINE-2026', 'Phase 1 Vet', '2026-01-15', null, 'Phase One Whiz', '20000000-0000-0000-0000-000000000002', now(), '20000000-0000-0000-0000-000000000004'),
  ('82000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'coggins_eia', 'approved', 'manual', 'P1-B-COGGINS-2026', 'Phase 1 Vet', '2026-01-15', 'negative', 'Phase One Slide', '20000000-0000-0000-0000-000000000006', now(), '20000000-0000-0000-0000-000000000006'),
  ('82000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', 'combo_vaccine', 'approved', 'manual', 'P1-B-VACCINE-2026', 'Phase 1 Vet', '2026-01-15', null, 'Phase One Slide', '20000000-0000-0000-0000-000000000006', now(), '20000000-0000-0000-0000-000000000006')
on conflict (id) do update
set
  status = excluded.status,
  verification_source = excluded.verification_source,
  certificate_number = excluded.certificate_number,
  issuer_name = excluded.issuer_name,
  test_or_administered_on = excluded.test_or_administered_on,
  result = excluded.result,
  horse_name = excluded.horse_name,
  reviewed_by_user_id = excluded.reviewed_by_user_id,
  reviewed_at = excluded.reviewed_at,
  updated_at = now();

-- Les documents fictifs du seed precedent les lectures d'identite S2. Le
-- scenario de base accepte donc leur identite manuelle; les tests S2/S6
-- creent ensuite leurs propres versions sans alterer ce point de depart.
update public.organization_health_policies
set identity_validation_requirement = 'none'
where organization_id in (
    '30000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002'
  )
  and effective_from = '1900-01-01';

insert into public.entries (
  id,
  organization_id,
  show_id,
  horse_id,
  class_id,
  created_by_user_id,
  owner_contact_id,
  rider_contact_id,
  payer_contact_id,
  status,
  entry_number,
  base_fee,
  total_fees
)
values
  ('90000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', '70000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', 'active', 101, 150.00, 150.00),
  ('90000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '80000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000006', '70000000-0000-0000-0000-000000000003', null, '70000000-0000-0000-0000-000000000003', 'active', 201, 145.00, 145.00)
on conflict (id) do update
set
  status = excluded.status,
  entry_number = excluded.entry_number,
  base_fee = excluded.base_fee,
  total_fees = excluded.total_fees,
  updated_at = now();

insert into public.invoices (
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
values
  ('a0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '0001', '70000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'sent', 150.00, 19.50, 169.50, 0.00),
  ('a0000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '0001', '70000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000006', 'sent', 145.00, 18.85, 163.85, 0.00)
on conflict (id) do update
set
  invoice_number = excluded.invoice_number,
  status = excluded.status,
  subtotal = excluded.subtotal,
  tax_amount = excluded.tax_amount,
  total_amount = excluded.total_amount,
  total_paid = excluded.total_paid,
  updated_at = now();

insert into public.invoice_line_items (
  id,
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
values
  ('b0000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'entry', '90000000-0000-0000-0000-000000000001', 'Open Reining entry', 1, 150.00, 150.00, true, 19.50),
  ('b0000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'entry', '90000000-0000-0000-0000-000000000002', 'Org B Open Reining entry', 1, 145.00, 145.00, true, 18.85)
on conflict (id) do update
set
  description = excluded.description,
  quantity = excluded.quantity,
  unit_price = excluded.unit_price,
  total_price = excluded.total_price,
  tax_amount = excluded.tax_amount;

insert into public.show_score_block_setups (
  block_id,
  organization_id,
  show_id,
  show_day_id,
  pattern,
  runs,
  judges,
  is_draw_imported
)
values (
  '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  '8',
  '[{"id":"90000000-0000-0000-0000-000000000001","entryId":"90000000-0000-0000-0000-000000000001","draw":1,"backNumber":"101","rider":"Phase1 Rider A","horse":"Phase One Whiz","owner":"Phase1 Owner A"}]'::jsonb,
  '[{"id":"judge-1","name":"Phase1 Judge","order":1}]'::jsonb,
  true
)
on conflict (block_id) do update
set
  pattern = excluded.pattern,
  runs = excluded.runs,
  judges = excluded.judges,
  is_draw_imported = excluded.is_draw_imported,
  updated_at = now();
