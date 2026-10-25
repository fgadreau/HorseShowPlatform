\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regprocedure('public.get_horse_health_compliance(uuid,uuid,date)') is null then
    raise exception 'Expected central horse health compliance function';
  end if;
end;
$$;

-- Le cheval A est rendu visible a l'association B sans dupliquer son identite.
insert into public.directory_horses (
  id, organization_discipline_id, horse_id, source, created_by_user_id
)
values (
  '84000000-0000-0000-0000-000000000098',
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
    'coggins_required', true,
    'coggins_validity_months', 12,
    'influenza_required', true,
    'rhino_required', true,
    'combo_vaccine_accepted', true,
    'vaccine_validity_months', 12,
    'identity_validation_requirement', 'identified',
    'association_review_required', false,
    'enforcement_mode', 'blocking'
  )
);

select public.create_horse_document_validation(
  document_id,
  jsonb_build_object(
    'status', 'identified',
    'source', 'manual',
    'comparison_profile', 'health_document_horse',
    'extracted_horse_name', 'Phase One Whiz',
    'horse_identity_snapshot', jsonb_build_object('name', 'Phase One Whiz'),
    'comparison_result', jsonb_build_object('name', 'match'),
    'evidence', jsonb_build_array(jsonb_build_object('field', 'horse_name')),
    'source_payload', '{}'::jsonb,
    'warnings', '[]'::jsonb,
    'verdict', 'possible_match',
    'score', 90,
    'confidence', 'probable'
  )
)
from unnest(array[
  '82000000-0000-0000-0000-000000000001'::uuid,
  '82000000-0000-0000-0000-000000000002'::uuid
]) document_id;

do $$
declare
  result record;
begin
  select * into result
  from public.get_horse_health_compliance(
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    current_date
  );

  if result.compliance_status <> 'compliant' or not result.can_proceed then
    raise exception 'Association A should accept identified, current documents: %', row_to_json(result);
  end if;

  if result.requirements->'influenza'->>'document_id' <> '82000000-0000-0000-0000-000000000002'
    or result.requirements->'rhino'->>'document_id' <> '82000000-0000-0000-0000-000000000002'
  then
    raise exception 'Accepted combo vaccine should satisfy influenza and rhino';
  end if;

  raise notice 'ok - one combo document can satisfy both accepted vaccine requirements';
end;
$$;


-- An old identity reading must not turn an unconfirmed GVL lookup into compliance.
reset role;
update public.horse_documents set status='pending_review', verification_source='gvl_qr'
where id='82000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$ declare result record; begin
 select * into result from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date);
 if result.can_proceed or result.compliance_status='compliant' or not(result.reasons @> '[{"code":"health.coggins.review_pending"}]'::jsonb) then
 raise exception 'Pending GVL must require review despite old identity: %',row_to_json(result); end if;
 raise notice 'ok - pending GVL cannot reuse older identity to pass';
end $$;
select public.create_organization_health_document_review('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','approved','Explicit association review of unconfirmed GVL');
do $$ declare result record; begin
 select * into result from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date);
 if not result.can_proceed or result.compliance_status<>'compliant' then raise exception 'Explicit association review should remain supported: %',row_to_json(result); end if;
 raise notice 'ok - explicit association approval remains supported';
end $$;
reset role;
update public.horse_documents set status='rejected' where id='82000000-0000-0000-0000-000000000001';
set local role authenticated;
do $$ declare result record; begin
 select * into result from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date);
 if result.can_proceed or result.compliance_status='compliant' then raise exception 'Rejected certificate must fail even with prior approval'; end if;
 raise notice 'ok - rejected certificate cannot reuse previous association approval';
end $$;
rollback;
