\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regclass('public.organization_health_policies') is null
    or to_regclass('public.organization_health_document_reviews') is null
  then
    raise exception 'Expected association health policies and reviews';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('organization_health_policies', 'organization_health_document_reviews')
      and column_name in ('discipline_id', 'organization_discipline_id', 'class_id', 'governing_body_id')
  ) then
    raise exception 'Health policy or review unexpectedly depends on a discipline, class or governing body';
  end if;

  if (select count(*) from public.organization_health_policies where effective_from = '1900-01-01') <> 2 then
    raise exception 'Every seeded association should receive one default health policy';
  end if;

  raise notice 'ok - every association has one discipline-independent default health policy';
end;
$$;

-- Le meme cheval est partage avec l'association B pour prouver que deux
-- associations peuvent evaluer le meme document independamment.
insert into public.directory_horses (
  id, organization_discipline_id, horse_id, source, created_by_user_id
)
values (
  '84000000-0000-0000-0000-000000000099',
  '33000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000001',
  'manual',
  '20000000-0000-0000-0000-000000000006'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.set_organization_health_policy(
  '30000000-0000-0000-0000-000000000001',
  current_date,
  jsonb_build_object(
    'coggins_required', true,
    'coggins_validity_rule', 'calendar_year',
    'coggins_validity_months', 12,
    'influenza_required', true,
    'rhino_required', false,
    'combo_vaccine_accepted', true,
    'vaccine_validity_months', 6,
    'identity_validation_requirement', 'verified',
    'association_review_required', true,
    'enforcement_mode', 'warning',
    'notes', 'Politique A distincte de toute discipline'
  )
);

do $$
begin
  if not exists (
    select 1
    from public.organization_health_policy_at(
      '30000000-0000-0000-0000-000000000001',
      current_date - 1
    ) policy
    where policy.effective_from = '1900-01-01'
      and policy.effective_until = current_date - 1
  ) then
    raise exception 'Creating a dated policy did not close the previous version';
  end if;

  if not exists (
    select 1
    from public.organization_health_policy_at(
      '30000000-0000-0000-0000-000000000001',
      current_date
    ) policy
    where policy.coggins_validity_rule = 'calendar_year'
      and policy.coggins_validity_months = 12
      and policy.vaccine_validity_months = 6
      and policy.influenza_required
      and not policy.rhino_required
      and policy.identity_validation_requirement = 'verified'
      and policy.association_review_required
      and policy.enforcement_mode = 'warning'
  ) then
    raise exception 'Association A policy did not retain its independent health choices, including calendar-year Coggins';
  end if;

  if not exists (
    select 1
    from public.organization_health_policy_at(
      '30000000-0000-0000-0000-000000000002',
      current_date
    ) policy
    where policy.rhino_required
      and policy.enforcement_mode = 'blocking'
  ) then
    raise exception 'Association A policy unexpectedly changed association B';
  end if;

  raise notice 'ok - dated policies preserve history and differ between associations';
end;
$$;

select public.create_organization_health_document_review(
  '30000000-0000-0000-0000-000000000001',
  '82000000-0000-0000-0000-000000000001',
  'approved',
  'Association A accepte ce document'
);

do $$
begin
  begin
    perform public.set_organization_health_policy(
      '30000000-0000-0000-0000-000000000001',
      '1900-01-01',
      jsonb_build_object('enforcement_mode', 'blocking')
    );
    raise exception 'Historical health policy was rewritten';
  exception when check_violation then
    null;
  end;

  raise notice 'ok - an effective historical policy is immutable';
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);

select public.create_organization_health_document_review(
  '30000000-0000-0000-0000-000000000002',
  '82000000-0000-0000-0000-000000000001',
  'rejected',
  'Association B exige une nouvelle copie'
);

do $$
begin
  if not exists (
    select 1
    from public.organization_health_document_reviews
    where organization_id = '30000000-0000-0000-0000-000000000002'
      and horse_document_id = '82000000-0000-0000-0000-000000000001'
      and status = 'rejected'
      and version = 1
  ) then
    raise exception 'Association B review was not retained independently';
  end if;

  if (select status from public.horse_documents where id = '82000000-0000-0000-0000-000000000001') <> 'approved' then
    raise exception 'Association review mutated the global horse document';
  end if;

  raise notice 'ok - associations can reach opposite review decisions without mutating the document';
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

do $$
begin
  begin
    perform public.set_organization_health_policy(
      '30000000-0000-0000-0000-000000000001',
      '2026-08-01',
      jsonb_build_object('enforcement_mode', 'blocking')
    );
    raise exception 'Horse owner unexpectedly changed association policy';
  exception when insufficient_privilege then
    null;
  end;

  begin
    insert into public.organization_health_policies (
      organization_id, effective_from
    ) values (
      '30000000-0000-0000-0000-000000000001', '2028-01-01'
    );
    raise exception 'Authenticated client inserted a policy outside the controlled RPC';
  exception when insufficient_privilege then
    null;
  end;

  if (select count(*) from public.organization_health_document_reviews where horse_document_id = '82000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Horse owner should see both association decisions for their horse';
  end if;

  raise notice 'ok - policy writes are staff-only while the horse authority sees association decisions';
end;
$$;

reset role;
set local role anon;

do $$
begin
  if (select count(*) from public.organization_health_policies) <> 3 then
    raise exception 'Published association health requirements should be readable without authentication';
  end if;

  raise notice 'ok - association health requirements are publicly readable';
end;
$$;

rollback;
