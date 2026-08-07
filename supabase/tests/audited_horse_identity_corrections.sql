\set ON_ERROR_STOP on

begin;

update public.horses
set date_of_birth = '2018-05-01',
    birth_year = 2018,
    registration_status = 'registered'
where id = '80000000-0000-0000-0000-000000000001';

insert into public.horse_external_identifiers (
  id, horse_id, external_credential_issuer_id, identifier_type, identifier_value, status
)
values (
  '95000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  (select id from public.external_credential_issuers where code = 'AQHA'),
  'registration',
  'AQHA-BEFORE-100',
  'active'
);

insert into public.horse_external_identifiers (
  id, horse_id, external_credential_issuer_id, identifier_type, identifier_value, status, verified_at
)
values (
  '95000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000001',
  (select id from public.external_credential_issuers where code = 'NSBA'),
  'competition_license',
  'NSBA-UNCHANGED-300',
  'active',
  now()
);

insert into public.horse_documents (
  id, horse_id, document_category, document_type, status, verification_source,
  external_credential_issuer_id, registration_number, breed_name,
  uploaded_by_organization_id, created_by_user_id
)
values (
  '96000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  'registration',
  'breed_registration',
  'pending_review',
  'upload',
  (select id from public.external_credential_issuers where code = 'AQHA'),
  'AQHA-BEFORE-100',
  'Quarter Horse',
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.create_horse_document_validation(
  '82000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'status', 'verified', 'source', 'manual', 'comparison_profile', 'health_document_horse',
    'extracted_horse_name', 'Phase One Whiz', 'extracted_date_of_birth', '2018-05-01',
    'horse_identity_snapshot', jsonb_build_object('name', 'Phase One Whiz', 'date_of_birth', '2018-05-01'),
    'comparison_result', jsonb_build_object('verdict', 'match', 'score', 100),
    'evidence', jsonb_build_array(
      jsonb_build_object('field', 'name', 'outcome', 'exact', 'reason', 'same_name'),
      jsonb_build_object('field', 'date_of_birth', 'outcome', 'exact', 'reason', 'same_date_of_birth')
    ),
    'source_payload', '{}'::jsonb, 'warnings', '[]'::jsonb,
    'verdict', 'match', 'score', 100, 'confidence', 'certain'
  )
);

select public.create_horse_document_validation(
  '96000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'status', 'verified', 'source', 'manual', 'comparison_profile', 'external_horse',
    'extracted_horse_name', 'Phase One Whiz', 'extracted_identifier', 'AQHA-BEFORE-100',
    'horse_identity_snapshot', jsonb_build_object('name', 'Phase One Whiz', 'external_identifier', 'AQHA-BEFORE-100'),
    'comparison_result', jsonb_build_object('verdict', 'match', 'score', 100),
    'evidence', jsonb_build_array(
      jsonb_build_object('field', 'name', 'outcome', 'exact', 'reason', 'same_name'),
      jsonb_build_object('field', 'identifier', 'outcome', 'exact', 'reason', 'same_identifier')
    ),
    'source_payload', '{}'::jsonb, 'warnings', '[]'::jsonb,
    'verdict', 'match', 'score', 100, 'confidence', 'certain'
  )
);

-- Le personnel d'association peut voir le cheval et ses validations, mais ne
-- peut pas corriger son identite globale.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);

do $$
begin
  if public.can_correct_horse_identity('80000000-0000-0000-0000-000000000001') then
    raise exception 'Association secretary unexpectedly gained correction authority';
  end if;

  begin
    perform public.correct_horse_identity(
      '80000000-0000-0000-0000-000000000001',
      'Correction demandee par le secretariat',
      jsonb_build_object('name', 'Unauthorized rename')
    );
    raise exception 'Association secretary corrected global horse identity';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'ok - association staff can identify documents but cannot correct global identity';
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

do $$
begin
  begin
    perform public.correct_horse_identity(
      '80000000-0000-0000-0000-000000000001',
      'court',
      jsonb_build_object('name', 'Corrected Whiz')
    );
    raise exception 'A correction without a meaningful reason was accepted';
  exception when invalid_parameter_value then
    null;
  end;

  raise notice 'ok - a meaningful correction reason is mandatory';
end;
$$;

select public.correct_horse_identity(
  '80000000-0000-0000-0000-000000000001',
  'Erreur de saisie confirmee par le proprietaire',
  jsonb_build_object(
    'name', 'Corrected Whiz',
    'date_of_birth', '2018-05-02',
    'external_identifiers', jsonb_build_array(
      jsonb_build_object(
        'external_credential_issuer_id', (select id from public.external_credential_issuers where code = 'AQHA'),
        'identifier_type', 'registration',
        'identifier_value', 'AQHA-AFTER-200'
      ),
      jsonb_build_object(
        'external_credential_issuer_id', (select id from public.external_credential_issuers where code = 'NSBA'),
        'identifier_type', 'competition_license',
        'identifier_value', 'NSBA-UNCHANGED-300'
      )
    )
  )
);

do $$
declare
  correction_id uuid;
  invalidated_count integer;
begin
  select id into correction_id
  from public.horse_identity_corrections
  where horse_id = '80000000-0000-0000-0000-000000000001'
  order by created_at desc
  limit 1;

  if not exists (
    select 1 from public.horses
    where id = '80000000-0000-0000-0000-000000000001'
      and name = 'Corrected Whiz'
      and date_of_birth = '2018-05-02'
      and birth_year = 2018
  ) then
    raise exception 'Authorized correction did not update the horse atomically';
  end if;

  if not exists (
    select 1 from public.horse_external_identifiers
    where id = '95000000-0000-0000-0000-000000000001'
      and identifier_value = 'AQHA-AFTER-200'
      and status = 'unknown'
  ) then
    raise exception 'Authorized correction did not reset the corrected external identifier';
  end if;

  if not exists (
    select 1 from public.horse_external_identifiers
    where id = '95000000-0000-0000-0000-000000000002'
      and identifier_value = 'NSBA-UNCHANGED-300'
      and status = 'active'
      and verified_at is not null
  ) then
    raise exception 'Correction altered an unchanged external identifier';
  end if;

  if not exists (
    select 1 from public.horse_identity_corrections
    where id = correction_id
      and status = 'applied'
      and reason = 'Erreur de saisie confirmee par le proprietaire'
      and changed_fields @> array['name', 'date_of_birth']
      and before_identity->>'name' = 'Phase One Whiz'
      and after_identity->>'name' = 'Corrected Whiz'
  ) then
    raise exception 'Correction audit did not preserve reason, fields, before and after';
  end if;

  select count(*) into invalidated_count
  from public.horse_document_validations
    where horse_id = '80000000-0000-0000-0000-000000000001'
      and status = 'invalidated'
      and invalidated_by_correction_id = correction_id;

  if invalidated_count <> 2 then
    raise exception 'Affected document validations were not linked to the correction (count=%)', invalidated_count;
  end if;

  if exists (
    select 1 from public.get_horse_identity_locks('80000000-0000-0000-0000-000000000001')
  ) then
    raise exception 'Invalidated validations still locked the corrected identity';
  end if;

  raise notice 'ok - correction preserves before/after and invalidates every affected reading';
end;
$$;

-- Une lecture invalidee ne bloque pas une nouvelle version du meme document.
select public.create_horse_document_validation(
  '96000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'status', 'verified', 'source', 'manual', 'comparison_profile', 'external_horse',
    'extracted_horse_name', 'Corrected Whiz', 'extracted_identifier', 'AQHA-AFTER-200',
    'horse_identity_snapshot', jsonb_build_object('name', 'Corrected Whiz', 'external_identifier', 'AQHA-AFTER-200'),
    'comparison_result', jsonb_build_object('verdict', 'match', 'score', 100),
    'evidence', jsonb_build_array(
      jsonb_build_object('field', 'name', 'outcome', 'exact', 'reason', 'same_name'),
      jsonb_build_object('field', 'identifier', 'outcome', 'exact', 'reason', 'same_identifier')
    ),
    'source_payload', '{}'::jsonb, 'warnings', '[]'::jsonb,
    'verdict', 'match', 'score', 100, 'confidence', 'certain'
  )
);

do $$
begin
  if not exists (
    select 1 from public.horse_document_validations
    where horse_document_id = '96000000-0000-0000-0000-000000000001'
      and version = 2
      and status = 'verified'
  ) then
    raise exception 'Document could not be revalidated after an audited correction';
  end if;

  begin
    update public.horses
    set name = 'Second silent rename'
    where id = '80000000-0000-0000-0000-000000000001';
    raise exception 'Revalidation did not restore identity locks';
  exception when check_violation then
    null;
  end;

  raise notice 'ok - revalidation creates a new version and restores locks';
end;
$$;

-- Declarer le cheval grade exige de retirer le numero de registre dans la meme
-- correction auditee.
select public.correct_horse_identity(
  '80000000-0000-0000-0000-000000000001',
  'Proprietaire confirme que le cheval est finalement grade',
  jsonb_build_object(
    'registration_status', 'grade',
    'registration_number', null,
    'external_identifiers', jsonb_build_array(
      jsonb_build_object(
        'external_credential_issuer_id', (select id from public.external_credential_issuers where code = 'AQHA'),
        'identifier_type', 'registration',
        'identifier_value', ''
      )
    )
  )
);

do $$
begin
  if not exists (
    select 1 from public.horses
    where id = '80000000-0000-0000-0000-000000000001'
      and registration_status = 'grade'
      and registration_number is null
  ) or exists (
    select 1 from public.horse_external_identifiers
    where id = '95000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Grade correction did not remove breed registry identity';
  end if;

  if (select count(*) from public.horse_identity_corrections where horse_id = '80000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Correction history did not retain both applied corrections';
  end if;

  raise notice 'ok - grade transition and registry removal are one audited operation';
end;
$$;

-- Un client ne peut fabriquer ou reecrire directement l'audit.
do $$
begin
  begin
    insert into public.horse_identity_corrections (
      horse_id, reason, changed_fields, before_identity, after_identity,
      status, created_by_user_id, applied_at
    ) values (
      '80000000-0000-0000-0000-000000000001', 'Fabrication directe interdite', array['name'],
      '{}'::jsonb, '{}'::jsonb, 'applied', '20000000-0000-0000-0000-000000000004', now()
    );
    raise exception 'Authenticated client inserted a correction audit directly';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'ok - correction audit writes are restricted to the controlled RPC';
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);

do $$
begin
  if exists (
    select 1 from public.horse_identity_corrections
    where horse_id = '80000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Unrelated association read another horse correction history';
  end if;

  raise notice 'ok - correction history follows horse access RLS';
end;
$$;

rollback;
