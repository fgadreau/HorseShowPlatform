\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regclass('public.blocks') is null
    or to_regclass('public.classes') is null
    or to_regclass('public.divisions') is not null then
    raise exception 'Expected canonical blocks/classes tables and no divisions table';
  end if;

  if to_regclass('public.show_score_block_setups') is null
    or to_regclass('public.show_score_class_setups') is not null then
    raise exception 'Expected ShowScore setups to use block terminology';
  end if;

  raise notice 'ok - canonical blocks/classes and ShowScore block setup names';
end;
$$;

-- A second true class in the same block is allowed.
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
values (
  '60000000-0000-0000-0000-000000000101',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  'Intermediate Open',
  'IO-1',
  2,
  100.00,
  2
);

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
values (
  '90000000-0000-0000-0000-000000000101',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000101',
  '20000000-0000-0000-0000-000000000004',
  '70000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002',
  '70000000-0000-0000-0000-000000000001',
  'active',
  102,
  100.00,
  100.00
);

do $$
declare
  entry_count integer;
  class_count integer;
begin
  select count(*), count(distinct entry.class_id)
  into entry_count, class_count
  from public.entries entry
  join public.classes class_record on class_record.id = entry.class_id
  where entry.horse_id = '80000000-0000-0000-0000-000000000001'
    and class_record.block_id = '50000000-0000-0000-0000-000000000001';

  if entry_count <> 2 or class_count <> 2 then
    raise exception 'Expected one horse to share a physical pass across two classes';
  end if;

  raise notice 'ok - multiple class entries share one block pass';
end;
$$;

do $$
begin
  begin
    insert into public.entries (
      id, organization_id, show_id, horse_id, class_id, created_by_user_id,
      owner_contact_id, rider_contact_id, payer_contact_id, status
    ) values (
      '90000000-0000-0000-0000-000000000102',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000101',
      '20000000-0000-0000-0000-000000000004',
      '70000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000002',
      '70000000-0000-0000-0000-000000000001',
      'active'
    );
  exception
    when unique_violation or raise_exception then
      raise notice 'ok - duplicate entry in the same true class is refused';
      return;
  end;

  raise exception 'Expected duplicate class entry to be refused';
end;
$$;

-- Concurrent blocks must have the same day, arena and pattern.
insert into public.block_concurrency_groups (
  id,
  organization_id,
  show_id,
  name
)
values (
  '51000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'Friday concurrent test'
);

insert into public.block_concurrency_group_members (group_id, block_id, sort_order)
values (
  '51000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  1
);

do $$
begin
  begin
    insert into public.block_concurrency_group_members (group_id, block_id, sort_order)
    values (
      '51000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002',
      2
    );
  exception
    when check_violation then
      raise notice 'ok - different concurrent patterns are refused';
      return;
  end;

  raise exception 'Expected different concurrent patterns to be refused';
end;
$$;

update public.blocks
set pattern = '8'
where id = '50000000-0000-0000-0000-000000000002';

insert into public.block_concurrency_group_members (group_id, block_id, sort_order)
values (
  '51000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
  2
);

do $$
begin
  begin
    update public.blocks
    set pattern = '7'
    where id = '50000000-0000-0000-0000-000000000002';
  exception
    when check_violation then
      raise notice 'ok - a concurrent block pattern cannot drift later';
      return;
  end;

  raise exception 'Expected concurrent block pattern update to be refused';
end;
$$;

-- A finalized physical run fans out to every entered class.
insert into public.block_run_entries (
  block_run_id,
  run_id,
  show_id,
  block_id,
  order_of_go
)
values (
  '91000000-0000-0000-0000-000000000001',
  '92000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  1
);

insert into public.block_run_class_entries (block_run_id, entry_id)
values
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001'),
  ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000101');

insert into public.scored_runs (
  run_id,
  show_id,
  back_number,
  rider_id,
  horse_id,
  owner_id,
  status,
  final_score
)
values (
  '92000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '101',
  '70000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  'scored',
  72.5
);

do $$
declare
  result_count integer;
  class_count integer;
begin
  select count(*), count(distinct class_id)
  into result_count, class_count
  from public.entry_results
  where run_id = '92000000-0000-0000-0000-000000000001';

  if result_count <> 2 or class_count <> 2 then
    raise exception 'Expected scored run to fan out to two true classes';
  end if;

  raise notice 'ok - scored run fans out to every true class';
end;
$$;

-- A paid warmup is a block; its technical ShowScore row inherits that context.
insert into public.blocks (
  id,
  organization_id,
  show_id,
  show_day_id,
  name,
  arena,
  pattern,
  sort_order,
  block_type,
  schedule_status,
  schedule_is_public
)
values (
  '50000000-0000-0000-0000-000000000103',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  'Paid warm up test',
  'Main',
  '8',
  3,
  'paid_warmup',
  'open',
  true
);

insert into public.show_score_paid_warmups (
  id,
  organization_id,
  show_id,
  show_day_id,
  block_id,
  name,
  sort_order
)
values (
  '93000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000103',
  'Wrong legacy name',
  99
);

do $$
declare
  warmup_record record;
  policy_count integer;
  event_id uuid;
begin
  select organization_id, show_id, show_day_id, name, arena, sort_order
  into warmup_record
  from public.show_score_paid_warmups
  where id = '93000000-0000-0000-0000-000000000001';

  if warmup_record.organization_id <> '30000000-0000-0000-0000-000000000001'::uuid
    or warmup_record.show_id <> '40000000-0000-0000-0000-000000000001'::uuid
    or warmup_record.show_day_id <> '41000000-0000-0000-0000-000000000001'::uuid
    or warmup_record.name <> 'Paid warm up test'
    or warmup_record.arena <> 'Main'
    or warmup_record.sort_order <> 3 then
    raise exception 'Expected paid warmup technical row to inherit block context';
  end if;

  select count(*) into policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'class_governing_bodies',
      'class_template_governing_bodies',
      'block_judge_assignments',
      'block_concurrency_groups',
      'block_concurrency_group_members'
    );

  if policy_count <> 10 then
    raise exception 'Expected two RLS policies on each new protected relation, found %', policy_count;
  end if;

  event_id := public.record_app_event(
    target_event_type => 'audit',
    target_event_name => 'block_core_test',
    target_show_id => '40000000-0000-0000-0000-000000000001',
    target_class_id => '50000000-0000-0000-0000-000000000001'
  )::uuid;

  if not exists (
    select 1 from public.app_events
    where id = event_id
      and block_id = '50000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Expected ShowScore app event compatibility RPC to store block_id';
  end if;

  raise notice 'ok - paid warmup, RLS policies and ShowScore event block reference';
end;
$$;

rollback;
