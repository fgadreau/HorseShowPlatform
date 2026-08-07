do $$
declare
  preserved_count integer;
begin
  select count(*) into preserved_count
  from public.organizations
  where id = '80000000-0000-0000-0000-000000000001';
  if preserved_count <> 1 then raise exception 'Legacy organization was not preserved'; end if;

  select count(*) into preserved_count
  from public.blocks
  where id = '84000000-0000-0000-0000-000000000001'
    and display_label = 'Block 12'
    and judge_display_name = 'Legacy Judge'
    and block_type = 'competition'
    and slate_id is not null;
  if preserved_count <> 1 then raise exception 'Legacy scored block was not preserved'; end if;

  select count(*) into preserved_count
  from public.classes
  where block_id = '84000000-0000-0000-0000-000000000001'
    and organization_discipline_id is not null
    and minimum_entries = 4
    and entry_fee in (75, 125)
    and eligibility_rules ? 'legacy_block_rule';
  if preserved_count <> 2 then raise exception 'Legacy classes were not preserved and backfilled'; end if;

  select count(*) into preserved_count
  from public.classes
  where block_id = '84000000-0000-0000-0000-000000000001'
    and sort_order in (1, 2);
  if preserved_count <> 2 then raise exception 'Legacy class order was not rebuilt'; end if;

  select count(*) into preserved_count
  from public.show_score_block_setups
  where block_id = '84000000-0000-0000-0000-000000000001';
  if preserved_count <> 1 then raise exception 'ShowScore setup was not preserved'; end if;

  select count(*) into preserved_count
  from public.show_score_scoring_sessions
  where block_id = '84000000-0000-0000-0000-000000000001';
  if preserved_count <> 1 then raise exception 'ShowScore scoring was not preserved'; end if;

  select count(*) into preserved_count
  from public.show_score_official_results
  where block_id = '84000000-0000-0000-0000-000000000001';
  if preserved_count <> 1 then raise exception 'ShowScore official result was not preserved'; end if;

  select count(*) into preserved_count
  from public.show_score_publication_states
  where block_id = '84000000-0000-0000-0000-000000000001';
  if preserved_count <> 1 then raise exception 'ShowScore publication was not preserved'; end if;

  select count(*) into preserved_count
  from public.block_result_publications
  where block_id = '84000000-0000-0000-0000-000000000001';
  if preserved_count <> 1 then raise exception 'Published results were not preserved'; end if;

  select count(*) into preserved_count
  from public.show_score_paid_warmups warmup
  join public.blocks block on block.id = warmup.block_id
  where warmup.id = '86000000-0000-0000-0000-000000000001'
    and block.block_type = 'paid_warmup'
    and block.scheduled_time = '08:30'::time;
  if preserved_count <> 1 then raise exception 'Legacy paid warmup was not converted to a block'; end if;

  select count(*) into preserved_count
  from public.block_judge_assignments
  where block_id = '84000000-0000-0000-0000-000000000001'
    and display_name = 'Legacy Judge';
  if preserved_count <> 1 then raise exception 'Legacy judge was not preserved'; end if;

  select count(*) into preserved_count
  from public.class_governing_bodies
  where class_id in (
    '85000000-0000-0000-0000-000000000001',
    '85000000-0000-0000-0000-000000000002'
  );
  if preserved_count < 2 then raise exception 'Legacy governing bodies were not preserved'; end if;
end;
$$;
