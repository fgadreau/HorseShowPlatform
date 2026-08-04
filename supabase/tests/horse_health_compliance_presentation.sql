\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regprocedure('public.list_horse_health_compliance(uuid[],uuid,date)') is null then
    raise exception 'Expected grouped health compliance presentation function';
  end if;
end;
$$;

insert into public.directory_horses (
  id, organization_discipline_id, horse_id, source, created_by_user_id
)
values (
  '84000000-0000-0000-0000-000000000097',
  '33000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000001',
  'manual',
  '20000000-0000-0000-0000-000000000006'
)
on conflict (organization_discipline_id, horse_id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

select public.set_organization_health_policy(
  '30000000-0000-0000-0000-000000000001',
  current_date,
  jsonb_build_object(
    'coggins_required', false,
    'influenza_required', false,
    'rhino_required', false,
    'enforcement_mode', 'blocking'
  )
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);

select public.set_organization_health_policy(
  '30000000-0000-0000-0000-000000000002',
  current_date,
  jsonb_build_object(
    'coggins_required', true,
    'coggins_validity_months', 1,
    'influenza_required', false,
    'rhino_required', false,
    'identity_validation_requirement', 'none',
    'association_review_required', false,
    'enforcement_mode', 'blocking'
  )
);

-- L'administrateur B voit tous les chevaux autorises de B, jamais ceux de A.
do $$
begin
  if (select count(*) from public.list_horse_health_compliance(
    null,
    '30000000-0000-0000-0000-000000000002',
    current_date
  )) <> 2 then
    raise exception 'Association B should receive its two directory horses';
  end if;

  if exists (
    select 1
    from public.list_horse_health_compliance(
      null,
      '30000000-0000-0000-0000-000000000002',
      current_date
    ) result
    where result.organization_id <> '30000000-0000-0000-0000-000000000002'
      or result.organization_name is null
  ) then
    raise exception 'Organization presentation scope or labels are incorrect';
  end if;

  if (select count(*) from public.list_horse_health_compliance(
    null,
    '30000000-0000-0000-0000-000000000001',
    current_date
  )) <> 0 then
    raise exception 'Association B admin unexpectedly listed association A';
  end if;

  raise notice 'ok - organization overview is grouped and association-scoped';
end;
$$;

-- Le proprietaire voit les decisions de chaque association ou son cheval figure.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

do $$
declare
  association_a record;
  association_b record;
begin
  if (select count(*) from public.list_horse_health_compliance(
    array['80000000-0000-0000-0000-000000000001'::uuid],
    null,
    current_date
  )) <> 2 then
    raise exception 'Horse owner should receive exactly two association results';
  end if;

  select * into association_a
  from public.list_horse_health_compliance(
    array['80000000-0000-0000-0000-000000000001'::uuid],
    null,
    current_date
  ) result
  where result.organization_id = '30000000-0000-0000-0000-000000000001';

  select * into association_b
  from public.list_horse_health_compliance(
    array['80000000-0000-0000-0000-000000000001'::uuid],
    null,
    current_date
  ) result
  where result.organization_id = '30000000-0000-0000-0000-000000000002';

  if association_a.compliance_status <> 'not_required' or not association_a.can_proceed then
    raise exception 'Association A no-requirement decision was not presented';
  end if;

  if association_b.compliance_status <> 'non_compliant' or association_b.can_proceed then
    raise exception 'Association B expired Coggins decision was not presented';
  end if;

  if association_a.organization_short_name <> 'P1A'
    or association_b.organization_short_name <> 'P1B'
  then
    raise exception 'Association labels should travel with presentation results';
  end if;

  raise notice 'ok - one horse can display different named association groups';
end;
$$;

do $$
begin
  begin
    perform public.list_horse_health_compliance(null, null, current_date);
    raise exception 'Unscoped presentation query unexpectedly succeeded';
  exception when invalid_parameter_value then
    null;
  end;

  begin
    perform public.list_horse_health_compliance(
      array_fill('80000000-0000-0000-0000-000000000001'::uuid, array[101]),
      null,
      current_date
    );
    raise exception 'Oversized presentation query unexpectedly succeeded';
  exception when program_limit_exceeded then
    null;
  end;

  raise notice 'ok - presentation reads require a bounded explicit scope';
end;
$$;

rollback;
