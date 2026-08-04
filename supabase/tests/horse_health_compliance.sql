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

-- L'association B applique une autre politique au meme cheval et aux memes documents.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);

select public.set_organization_health_policy(
  '30000000-0000-0000-0000-000000000002',
  current_date,
  jsonb_build_object(
    'coggins_required', true,
    'coggins_validity_months', 12,
    'influenza_required', true,
    'rhino_required', true,
    'combo_vaccine_accepted', true,
    'vaccine_validity_months', 12,
    'identity_validation_requirement', 'verified',
    'association_review_required', true,
    'enforcement_mode', 'warning'
  )
);

do $$
declare
  result record;
begin
  select * into result
  from public.get_horse_health_compliance(
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    current_date
  );

  if result.compliance_status <> 'pending_review' or not result.can_proceed then
    raise exception 'Association B warning policy should report pending but allow proceeding: %', row_to_json(result);
  end if;

  if result.requirements->'coggins'->>'status' <> 'identity_pending' then
    raise exception 'Association B should require verified identity before local review';
  end if;

  raise notice 'ok - the same documents produce a different explainable association result';
end;
$$;

select public.create_horse_document_validation(
  document_id,
  jsonb_build_object(
    'status', 'verified',
    'source', 'manual',
    'comparison_profile', 'health_document_horse',
    'extracted_horse_name', 'Phase One Whiz',
    'horse_identity_snapshot', jsonb_build_object('name', 'Phase One Whiz'),
    'comparison_result', jsonb_build_object('name', 'match'),
    'evidence', jsonb_build_array(jsonb_build_object('field', 'horse_name')),
    'source_payload', '{}'::jsonb,
    'warnings', '[]'::jsonb,
    'verdict', 'match',
    'score', 100,
    'confidence', 'certain'
  )
)
from unnest(array[
  '82000000-0000-0000-0000-000000000001'::uuid,
  '82000000-0000-0000-0000-000000000002'::uuid
]) document_id;

select public.create_organization_health_document_review(
  '30000000-0000-0000-0000-000000000002',
  document_id,
  'rejected',
  'Copie illisible pour cette association'
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
    '30000000-0000-0000-0000-000000000002',
    current_date
  );

  if result.compliance_status <> 'non_compliant' or not result.can_proceed then
    raise exception 'Rejected local review should be non-compliant but passable in warning mode';
  end if;

  if not (result.reasons @> '[{"code":"health.coggins.review_rejected"}]'::jsonb) then
    raise exception 'Rejected local review should produce a stable reason: %', result.reasons;
  end if;

  raise notice 'ok - a local rejection is explicit and remains association-specific';
end;
$$;

select public.create_organization_health_document_review(
  '30000000-0000-0000-0000-000000000002',
  document_id,
  'approved',
  'Document accepte pour ce repertoire'
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
    '30000000-0000-0000-0000-000000000002',
    current_date
  );

  if result.compliance_status <> 'compliant' or jsonb_array_length(result.reasons) <> 0 then
    raise exception 'Verified documents with approved local reviews should comply: %', row_to_json(result);
  end if;

  raise notice 'ok - verified identity and association reviews complete the compliance result';
end;
$$;

do $$
declare
  warning_result record;
  blocking_result record;
begin
  select * into warning_result
  from public.get_horse_health_compliance(
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    (current_date + interval '13 months')::date
  );

  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

  select * into blocking_result
  from public.get_horse_health_compliance(
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    (current_date + interval '13 months')::date
  );

  if warning_result.compliance_status <> 'non_compliant' or not warning_result.can_proceed then
    raise exception 'Expired warning result should remain passable with reasons';
  end if;

  if blocking_result.compliance_status <> 'non_compliant' or blocking_result.can_proceed then
    raise exception 'Expired blocking result should prevent proceeding';
  end if;

  if not (blocking_result.reasons @> '[{"code":"health.coggins.expired"}]'::jsonb) then
    raise exception 'Expired result should contain a stable Coggins reason code: %', blocking_result.reasons;
  end if;

  raise notice 'ok - reference date, stable reasons and enforcement mode are calculated centrally';
end;
$$;

-- Un membre d'une autre association ne peut pas sonder une association tierce.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);

do $$
begin
  begin
    perform public.get_horse_health_compliance(
      '80000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      current_date
    );
    raise exception 'Association B admin unexpectedly evaluated association A';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'ok - compliance lookup respects association and horse authority boundaries';
end;
$$;

-- Le proprietaire peut voir le resultat partout ou son cheval est repertorie.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

do $$
begin
  if (select count(*) from public.get_horse_health_compliance(
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    current_date
  )) <> 1 then
    raise exception 'Horse owner should see the shared association result';
  end if;

  raise notice 'ok - horse identity authority can view every relevant association result';
end;
$$;

-- Une association peut exiger un test effectue pendant l'annee civile du concours.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

select public.set_organization_health_policy(
  '30000000-0000-0000-0000-000000000001',
  current_date,
  jsonb_build_object(
    'coggins_required', true,
    'coggins_validity_rule', 'calendar_year',
    'influenza_required', true,
    'rhino_required', true,
    'combo_vaccine_accepted', true,
    'vaccine_validity_months', 12,
    'identity_validation_requirement', 'identified',
    'association_review_required', false,
    'enforcement_mode', 'blocking'
  )
);

do $$
declare
  same_year_result record;
  next_year_result record;
begin
  select * into same_year_result
  from public.get_horse_health_compliance(
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '2026-12-31'
  );

  select * into next_year_result
  from public.get_horse_health_compliance(
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    '2027-01-01'
  );

  if same_year_result.compliance_status <> 'compliant'
    or same_year_result.requirements->'coggins'->>'expires_on' <> '2026-12-31'
  then
    raise exception 'A 2026 Coggins should satisfy a 2026 calendar-year policy: %', row_to_json(same_year_result);
  end if;

  if next_year_result.compliance_status <> 'non_compliant'
    or next_year_result.requirements->'coggins'->>'status' <> 'expired'
  then
    raise exception 'A 2026 Coggins should not satisfy a 2027 calendar-year policy: %', row_to_json(next_year_result);
  end if;

  raise notice 'ok - calendar-year Coggins follows the show date instead of a rolling duration';
end;
$$;

-- Une politique sans exigence donne un resultat explicite, pas un faux succes ambigu.
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

  if result.compliance_status <> 'not_required' or not result.can_proceed then
    raise exception 'No-requirement policy should be explicit and passable';
  end if;

  raise notice 'ok - no-requirement policies return not_required explicitly';
end;
$$;

rollback;
