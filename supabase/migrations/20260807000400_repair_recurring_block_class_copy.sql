-- Repair recurring-block class ordering after the canonical classes rebuild.
-- Class templates previously kept the default sort_order = 1. Since real
-- classes now enforce a unique (block_id, sort_order), only the first class
-- could be copied into a newly created recurring block.

with ranked_templates as (
  select
    class_template.id,
    row_number() over (
      partition by class_template.block_template_id
      order by class_template.created_at, class_template.id
    )::integer as sort_order
  from public.class_templates class_template
)
update public.class_templates class_template
set sort_order = ranked.sort_order
from ranked_templates ranked
where ranked.id = class_template.id
  and class_template.sort_order is distinct from ranked.sort_order;

-- The production frontend containing the faulty copy flow was deployed on
-- 2026-08-07. Complete only template-backed blocks created since that cutover;
-- older blocks may have had classes removed intentionally.
with missing_template_classes as (
  select
    block.id as block_id,
    block.organization_id,
    block.show_id,
    class_template.id as class_template_id,
    class_template.organization_discipline_id,
    class_template.name,
    class_template.code,
    class_template.level,
    class_template.default_entry_fee,
    class_template.default_judge_fee,
    class_template.default_payout_schedule_type,
    class_template.default_added_money,
    class_template.default_retainage_percent,
    class_template.default_trophy_or_plaque_fee,
    class_template.default_sanctioning_fee_percent,
    class_template.default_payout_rules,
    class_template.default_payout_notes,
    class_template.back_number_policy_override,
    class_template.eligibility_rules,
    class_template.notes,
    coalesce((
      select max(existing_class.sort_order)
      from public.classes existing_class
      where existing_class.block_id = block.id
    ), 0) + row_number() over (
      partition by block.id
      order by class_template.sort_order, class_template.created_at, class_template.id
    )::integer as next_sort_order
  from public.blocks block
  join public.class_templates class_template
    on class_template.block_template_id = block.block_template_id
  where block.created_at >= timestamptz '2026-08-07 20:13:45+00'
    and exists (
      select 1
      from public.classes copied_class
      where copied_class.block_id = block.id
        and copied_class.class_template_id is not null
    )
    and not exists (
      select 1
      from public.classes existing_class
      where existing_class.block_id = block.id
        and existing_class.class_template_id = class_template.id
    )
), inserted_classes as (
  insert into public.classes (
    organization_id,
    show_id,
    block_id,
    organization_discipline_id,
    class_template_id,
    name,
    code,
    level,
    entry_fee,
    judge_fee,
    payout_schedule_type,
    added_money,
    retainage_percent,
    trophy_or_plaque_fee,
    sanctioning_fee_percent,
    payout_rules,
    payout_notes,
    minimum_entries,
    registration_status,
    is_public,
    back_number_policy_override,
    sort_order,
    eligibility_rules,
    notes
  )
  select
    missing.organization_id,
    missing.show_id,
    missing.block_id,
    missing.organization_discipline_id,
    missing.class_template_id,
    missing.name,
    missing.code,
    missing.level,
    missing.default_entry_fee,
    missing.default_judge_fee,
    missing.default_payout_schedule_type,
    missing.default_added_money,
    missing.default_retainage_percent,
    missing.default_trophy_or_plaque_fee,
    missing.default_sanctioning_fee_percent,
    missing.default_payout_rules,
    missing.default_payout_notes,
    2,
    'open',
    true,
    missing.back_number_policy_override,
    missing.next_sort_order,
    missing.eligibility_rules,
    missing.notes
  from missing_template_classes missing
  returning id, class_template_id
)
insert into public.class_governing_bodies (
  class_id,
  governing_body_id,
  reporting_class_code,
  eligibility_profile_code,
  sanction_metadata
)
select
  inserted.id,
  template_body.governing_body_id,
  template_body.reporting_class_code,
  template_body.eligibility_profile_code,
  template_body.sanction_metadata
from inserted_classes inserted
join public.class_template_governing_bodies template_body
  on template_body.class_template_id = inserted.class_template_id
on conflict (class_id, governing_body_id) do nothing;

notify pgrst, 'reload schema';
