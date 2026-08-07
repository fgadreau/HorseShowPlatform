-- Run after resetting through 20260801000100. These rows model production data
-- that must survive 20260801000200_blocks_classes_core_rebuild.sql.

insert into public.organizations (
  id,
  name,
  slug,
  primary_contact_email,
  timezone,
  currency,
  tax_rate
)
values (
  '80000000-0000-0000-0000-000000000001',
  'Legacy Preservation Association',
  'legacy-preservation-association',
  'legacy@example.test',
  'America/Toronto',
  'CAD',
  13
);

insert into public.shows (
  id,
  organization_id,
  name,
  slug,
  start_date,
  end_date,
  status,
  timezone,
  default_currency,
  is_public
)
values (
  '81000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  'Legacy Preservation Show',
  'legacy-preservation-show',
  '2026-09-10',
  '2026-09-11',
  'open',
  'America/Toronto',
  'CAD',
  true
);

delete from public.show_days
where show_id = '81000000-0000-0000-0000-000000000001';

insert into public.show_days (
  id,
  organization_id,
  show_id,
  day_date,
  day_name,
  sort_order
)
values (
  '82000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  '2026-09-10',
  'Legacy day',
  1
);

insert into public.class_templates (
  id,
  organization_id,
  name,
  code,
  block_label,
  default_pattern,
  sanctioning_body_codes,
  back_number_policy,
  eligibility_rules
)
values (
  '83000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  'Legacy block template',
  'LBT',
  'Legacy template label',
  'Pattern 5',
  array['NRHA'],
  'horse',
  '{"legacy_template_rule":true}'::jsonb
);

insert into public.class_template_divisions (
  id,
  organization_id,
  class_template_id,
  name,
  code,
  sanctioning_body_codes,
  eligibility_rules,
  sort_order
)
values (
  '83100000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  'Legacy class template',
  'LCT',
  array['AQHA'],
  '{"legacy_class_template_rule":true}'::jsonb,
  1
);

insert into public.classes (
  id,
  organization_id,
  show_id,
  show_day_id,
  class_template_id,
  name,
  code,
  block_label,
  description,
  min_entries,
  entry_fee,
  ring_number,
  arena,
  pattern,
  judge_name,
  sort_order,
  sanctioning_body_codes,
  back_number_policy,
  eligibility_rules,
  nrha_slate_number,
  is_public,
  is_event_block
)
values (
  '84000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  '83000000-0000-0000-0000-000000000001',
  'Legacy scored block',
  'LSB',
  'Block 12',
  'Description that must survive',
  4,
  125,
  2,
  'Main arena',
  'Pattern 5',
  'Legacy Judge',
  1,
  array['NRHA'],
  'horse',
  '{"legacy_block_rule":true}'::jsonb,
  12,
  true,
  false
);

insert into public.divisions (
  id,
  organization_id,
  show_id,
  class_id,
  class_template_division_id,
  name,
  code,
  entry_fee,
  sanctioning_body_codes,
  eligibility_rules
)
values
  (
    '85000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000001',
    '83100000-0000-0000-0000-000000000001',
    'Legacy class A',
    'LCA',
    null,
    array['AQHA'],
    '{"legacy_class_rule":"A"}'::jsonb
  ),
  (
    '85000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000001',
    '81000000-0000-0000-0000-000000000001',
    '84000000-0000-0000-0000-000000000001',
    null,
    'Legacy class B',
    'LCB',
    75,
    array['NRHA'],
    '{"legacy_class_rule":"B"}'::jsonb
  );

insert into public.show_score_class_setups (
  class_id,
  pattern,
  runs,
  judges,
  block_classes
)
values (
  '84000000-0000-0000-0000-000000000001',
  'Pattern 5',
  '[{"id":"run-1","horse":"Synthetic Horse"}]'::jsonb,
  '[{"id":"judge-1","name":"Legacy Judge"}]'::jsonb,
  '[{"code":"LCA","name":"Legacy class A"}]'::jsonb
);

insert into public.show_score_scoring_sessions (class_id, runs)
values (
  '84000000-0000-0000-0000-000000000001',
  '[{"id":"run-1","scoreTotal":72}]'::jsonb
);

insert into public.show_score_official_results (
  class_id,
  judge_name,
  finalized,
  secretariat_validated_at,
  official_runs
)
values (
  '84000000-0000-0000-0000-000000000001',
  'Legacy Judge',
  true,
  now(),
  '[{"id":"run-1","scoreTotal":72}]'::jsonb
);

insert into public.show_score_publication_states (class_id, status, published_by)
values (
  '84000000-0000-0000-0000-000000000001',
  'published',
  'legacy-secretariat'
);

insert into public.class_result_publications (
  class_id,
  status,
  result_groups
)
values (
  '84000000-0000-0000-0000-000000000001',
  'published',
  '[{"code":"LCA","results":[{"runId":"run-1","score":72}]}]'::jsonb
);

insert into public.show_score_paid_warmups (
  id,
  organization_id,
  show_id,
  show_day_id,
  name,
  arena,
  schedule_start_mode,
  schedule_start_time,
  entries,
  sort_order
)
values (
  '86000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '81000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  'Legacy paid warm-up',
  'Main arena',
  'fixed',
  '08:30',
  '[{"id":"warmup-run-1","rider":"Synthetic Rider","status":"pending"}]'::jsonb,
  2
);
