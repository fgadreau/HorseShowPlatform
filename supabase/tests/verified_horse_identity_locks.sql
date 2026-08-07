\set ON_ERROR_STOP on

begin;

-- Donnees ciblees pour couvrir une date de naissance et un identifiant de registre.
update public.horses
set date_of_birth = '2018-05-01',
    birth_year = 2018,
    registration_status = 'registered'
where id = '80000000-0000-0000-0000-000000000001';

insert into public.horse_external_identifiers (
  id,
  horse_id,
  external_credential_issuer_id,
  identifier_type,
  identifier_value,
  status
)
values (
  '94000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  (select id from public.external_credential_issuers where code = 'AQHA'),
  'registration',
  'AQHA-LOCK-100',
  'active'
);

insert into public.horse_documents (
  id,
  horse_id,
  document_category,
  document_type,
  status,
  verification_source,
  external_credential_issuer_id,
  registration_number,
  breed_name,
  uploaded_by_organization_id,
  created_by_user_id
)
values (
  '93000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  'registration',
  'breed_registration',
  'pending_review',
  'upload',
  (select id from public.external_credential_issuers where code = 'AQHA'),
  'AQHA-LOCK-100',
  'Quarter Horse',
  '30000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Le document sante concorde sur quelques champs seulement : seuls ces champs
-- doivent etre verrouilles.
select public.create_horse_document_validation(
  '82000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'status', 'verified',
    'source', 'manual',
    'comparison_profile', 'health_document_horse',
    'extracted_horse_name', 'Phase One Whiz',
    'extracted_date_of_birth', '2018-05-01',
    'extracted_gender', 'G',
    'extracted_identifier', 'P1-A-001',
    'horse_identity_snapshot', jsonb_build_object(
      'name', 'Phase One Whiz',
      'date_of_birth', '2018-05-01',
      'birth_year', 2018,
      'gender', 'G',
      'breed', 'Quarter Horse',
      'registration_number', 'P1-A-001'
    ),
    'comparison_result', jsonb_build_object('verdict', 'match', 'score', 100),
    'evidence', jsonb_build_array(
      jsonb_build_object('field', 'name', 'outcome', 'exact', 'reason', 'same_name'),
      jsonb_build_object('field', 'date_of_birth', 'outcome', 'exact', 'reason', 'same_date_of_birth'),
      jsonb_build_object('field', 'gender', 'outcome', 'exact', 'reason', 'same_gender'),
      jsonb_build_object('field', 'identifier', 'outcome', 'exact', 'reason', 'same_identifier'),
      jsonb_build_object('field', 'breed', 'outcome', 'missing', 'reason', 'missing_breed')
    ),
    'source_payload', '{}'::jsonb,
    'warnings', '[]'::jsonb,
    'verdict', 'match',
    'score', 100,
    'confidence', 'certain'
  )
);

-- Une lecture en ecart ne cree jamais de verrou.
select public.create_horse_document_validation(
  '82000000-0000-0000-0000-000000000002',
  jsonb_build_object(
    'status', 'mismatch',
    'source', 'manual',
    'comparison_profile', 'health_document_horse',
    'extracted_horse_name', 'Another Horse',
    'extracted_breed', 'Paint Horse',
    'horse_identity_snapshot', jsonb_build_object('name', 'Phase One Whiz', 'breed', 'Quarter Horse'),
    'comparison_result', jsonb_build_object('verdict', 'mismatch', 'score', 0),
    'evidence', jsonb_build_array(
      jsonb_build_object('field', 'name', 'outcome', 'different', 'reason', 'different_name'),
      jsonb_build_object('field', 'breed', 'outcome', 'different', 'reason', 'different_breed')
    ),
    'source_payload', '{}'::jsonb,
    'warnings', '[]'::jsonb,
    'verdict', 'mismatch',
    'score', 0,
    'confidence', 'weak'
  )
);

-- Le registre concorde avec l'identifiant externe AQHA existant.
select public.create_horse_document_validation(
  '93000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'status', 'verified',
    'source', 'manual',
    'comparison_profile', 'external_horse',
    'extracted_horse_name', 'Phase One Whiz',
    'extracted_identifier', 'AQHA-LOCK-100',
    'horse_identity_snapshot', jsonb_build_object(
      'name', 'Phase One Whiz',
      'external_identifier', 'AQHA-LOCK-100',
      'registration_number', 'P1-A-001'
    ),
    'comparison_result', jsonb_build_object('verdict', 'match', 'score', 100),
    'evidence', jsonb_build_array(
      jsonb_build_object('field', 'name', 'outcome', 'exact', 'reason', 'same_name'),
      jsonb_build_object('field', 'identifier', 'outcome', 'exact', 'reason', 'same_identifier')
    ),
    'source_payload', '{}'::jsonb,
    'warnings', '[]'::jsonb,
    'verdict', 'match',
    'score', 100,
    'confidence', 'certain'
  )
);

do $$
begin
  if not exists (
    select 1 from public.get_horse_identity_locks('80000000-0000-0000-0000-000000000001')
    where lock_field = 'name'
  ) or not exists (
    select 1 from public.get_horse_identity_locks('80000000-0000-0000-0000-000000000001')
    where lock_field = 'external_identifier'
  ) then
    raise exception 'Verified evidence did not expose its field locks';
  end if;

  if exists (
    select 1 from public.get_horse_identity_locks('80000000-0000-0000-0000-000000000001')
    where lock_field = 'breed'
  ) then
    raise exception 'Missing or mismatched evidence must not lock breed';
  end if;

  raise notice 'ok - lock inventory is field-specific and ignores mismatch evidence';
end;
$$;

do $$
begin
  begin
    update public.horses set name = 'Silent rename' where id = '80000000-0000-0000-0000-000000000001';
    raise exception 'A verified horse was silently renamed';
  exception when check_violation then
    null;
  end;

  begin
    update public.horses set date_of_birth = '2019-05-01', birth_year = 2019 where id = '80000000-0000-0000-0000-000000000001';
    raise exception 'A verified horse birth date was silently changed';
  exception when check_violation then
    null;
  end;

  begin
    update public.horses set gender = 'F' where id = '80000000-0000-0000-0000-000000000001';
    raise exception 'A verified horse sex was silently changed';
  exception when check_violation then
    null;
  end;

  begin
    update public.horses set registration_number = 'REPLACED' where id = '80000000-0000-0000-0000-000000000001';
    raise exception 'A verified legacy registration number was silently changed';
  exception when check_violation then
    null;
  end;

  begin
    update public.horses set registration_status = 'grade', registration_number = null where id = '80000000-0000-0000-0000-000000000001';
    raise exception 'A verified registered horse was silently declared grade';
  exception when check_violation then
    null;
  end;

  raise notice 'ok - ordinary updates cannot change fields used by verified evidence';
end;
$$;

update public.horses
set breed = 'Quarter Horse / Appendix',
    color = 'Dark bay',
    sire_name = 'Updated sire'
where id = '80000000-0000-0000-0000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.horses
    where id = '80000000-0000-0000-0000-000000000001'
      and breed = 'Quarter Horse / Appendix'
      and color = 'Dark bay'
      and sire_name = 'Updated sire'
  ) then
    raise exception 'Unrelated or unproven horse fields were blocked';
  end if;

  raise notice 'ok - fields not used by verified evidence remain editable';
end;
$$;

update public.horse_external_identifiers
set status = 'active',
    expires_on = '2027-12-31'
where id = '94000000-0000-0000-0000-000000000001';

do $$
begin
  begin
    update public.horse_external_identifiers
    set identifier_value = 'AQHA-REPLACED'
    where id = '94000000-0000-0000-0000-000000000001';
    raise exception 'A verified external identifier was silently replaced';
  exception when check_violation then
    null;
  end;

  begin
    delete from public.horse_external_identifiers
    where id = '94000000-0000-0000-0000-000000000001';
    raise exception 'A verified external identifier was silently deleted';
  exception when check_violation then
    null;
  end;

  begin
    delete from public.horse_documents
    where id = '93000000-0000-0000-0000-000000000001';
    raise exception 'A document supporting an active validation was deleted';
  exception when check_violation then
    null;
  end;

  raise notice 'ok - verified external numbers and their source document are protected';
end;
$$;

-- Une autre association ne voit pas l'inventaire des verrous.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);

do $$
begin
  begin
    perform public.get_horse_identity_locks('80000000-0000-0000-0000-000000000001');
    raise exception 'An unrelated association read another horse identity locks';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'ok - lock inventory follows horse access authority';
end;
$$;

rollback;
