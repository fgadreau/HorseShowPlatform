\set ON_ERROR_STOP on

begin;

do $$
declare
  body_count integer;
  nrha_record record;
begin
  select count(*) into body_count
  from public.class_governing_bodies link
  join public.governing_bodies body on body.id = link.governing_body_id
  where link.class_id = '60000000-0000-0000-0000-000000000001'
    and body.code in ('NRHA', 'AQR');

  select
    link.reporting_class_code,
    link.eligibility_profile_code,
    link.sanction_metadata ->> 'seed_scenario' as seed_scenario
  into nrha_record
  from public.class_governing_bodies link
  join public.governing_bodies body on body.id = link.governing_body_id
  where link.class_id = '60000000-0000-0000-0000-000000000001'
    and body.code = 'NRHA';

  if body_count <> 2
    or nrha_record.reporting_class_code <> '1100'
    or nrha_record.eligibility_profile_code <> 'category_1_ancillary_year_end'
    or nrha_record.seed_scenario <> 'multi_body' then
    raise exception 'Expected one HSP class with independent NRHA and AQR governing-body metadata';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'blocks'
      and column_name in ('governing_body_id', 'sanctioning_body_codes', 'eligibility_rules')
  ) then
    raise exception 'A block must not carry class governing-body or eligibility data';
  end if;

  if (select eligibility_rules ? 'nrha_class_type' from public.classes where id = '60000000-0000-0000-0000-000000000001') then
    raise exception 'NRHA class type must live on the NRHA link, not in generic eligibility rules';
  end if;

  raise notice 'ok - one class has independent multi-body reporting and eligibility metadata';
end;
$$;

insert into public.block_templates (
  id,
  organization_id,
  name,
  code,
  block_type,
  sort_order
)
values (
  '51000000-0000-0000-0000-000000000087',
  '30000000-0000-0000-0000-000000000001',
  'I5 governing-body template',
  'I5-BLOCK',
  'competition',
  87
);

insert into public.class_templates (
  id,
  organization_id,
  block_template_id,
  organization_discipline_id,
  name,
  code,
  sort_order
)
values (
  '61000000-0000-0000-0000-000000000087',
  '30000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000087',
  '33000000-0000-0000-0000-000000000001',
  'I5 recurring NRHA class',
  '1700',
  1
);

insert into public.class_template_governing_bodies (
  class_template_id,
  governing_body_id,
  reporting_class_code,
  eligibility_profile_code,
  sanction_metadata
)
select
  '61000000-0000-0000-0000-000000000087',
  body.id,
  '1700',
  'category_1_ancillary_year_end',
  '{"copied_by":"class_template"}'::jsonb
from public.governing_bodies body
where body.code = 'NRHA';

do $$
begin
  if not exists (
    select 1
    from public.class_template_governing_bodies link
    join public.governing_bodies body on body.id = link.governing_body_id
    where link.class_template_id = '61000000-0000-0000-0000-000000000087'
      and body.code = 'NRHA'
      and link.reporting_class_code = '1700'
      and link.eligibility_profile_code = 'category_1_ancillary_year_end'
  ) then
    raise exception 'Expected recurring class template to retain governing-body defaults';
  end if;

  begin
    update public.class_template_governing_bodies
    set sanction_metadata = '[]'::jsonb
    where class_template_id = '61000000-0000-0000-0000-000000000087';
    raise exception 'Expected non-object sanction metadata to be refused';
  exception
    when check_violation then
      null;
  end;

  raise notice 'ok - class templates retain typed governing-body defaults and object metadata';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  nrha_id uuid;
begin
  select id into nrha_id from public.governing_bodies where code = 'NRHA';

  begin
    insert into public.class_governing_bodies (class_id, governing_body_id)
    values ('60000000-0000-0000-0000-000000000002', nrha_id);
    raise exception 'Expected another association admin to be refused';
  exception
    when insufficient_privilege then
      null;
  end;

  raise notice 'ok - another association cannot manage class governing bodies';
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

do $$
begin
  update public.class_governing_bodies link
  set sanction_metadata = link.sanction_metadata || '{"reviewed_by":"org_a_secretary"}'::jsonb
  from public.governing_bodies body
  where link.governing_body_id = body.id
    and link.class_id = '60000000-0000-0000-0000-000000000001'
    and body.code = 'AQR';

  if not exists (
    select 1
    from public.class_governing_bodies link
    join public.governing_bodies body on body.id = link.governing_body_id
    where link.class_id = '60000000-0000-0000-0000-000000000001'
      and body.code = 'AQR'
      and link.sanction_metadata ->> 'reviewed_by' = 'org_a_secretary'
  ) then
    raise exception 'Expected organization secretary to manage its class governing-body metadata';
  end if;

  raise notice 'ok - authorized staff manages only its class governing-body metadata';
end;
$$;

rollback;
