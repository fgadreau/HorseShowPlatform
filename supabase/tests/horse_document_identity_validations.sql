\set ON_ERROR_STOP on

begin;

-- Une secretaire de l'association peut identifier un document d'un cheval
-- present dans son repertoire, sans obtenir le droit de modifier le cheval.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.create_horse_document_validation(
  '82000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'status', 'verified',
    'source', 'manual',
    'comparison_profile', 'health_document_horse',
    'extracted_horse_name', 'Phase One Whiz',
    'extracted_birth_year', 2018,
    'extracted_gender', 'G',
    'extracted_breed', 'Quarter Horse',
    'horse_identity_snapshot', jsonb_build_object('name', 'Phase One Whiz', 'registration_number', 'P1-A-001'),
    'comparison_result', jsonb_build_object('verdict', 'match', 'score', 100),
    'evidence', jsonb_build_array(jsonb_build_object('field', 'name', 'outcome', 'exact', 'reason', 'same_name')),
    'source_payload', '{}'::jsonb,
    'warnings', '[]'::jsonb,
    'verdict', 'match',
    'score', 100,
    'confidence', 'certain'
  )
);

select public.create_horse_document_validation(
  '82000000-0000-0000-0000-000000000001',
  jsonb_build_object(
    'status', 'mismatch',
    'source', 'ocr',
    'comparison_profile', 'health_document_horse',
    'extracted_horse_name', 'Phase One Wiz',
    'extracted_birth_year', 2019,
    'extracted_gender', 'M',
    'extracted_breed', 'Quarter Horse',
    'horse_identity_snapshot', jsonb_build_object('name', 'Phase One Whiz', 'registration_number', 'P1-A-001'),
    'comparison_result', jsonb_build_object('verdict', 'mismatch', 'score', 20),
    'evidence', jsonb_build_array(jsonb_build_object('field', 'birth_year', 'outcome', 'different', 'reason', 'different_birth_year')),
    'source_payload', jsonb_build_object('ocr_engine', 'test'),
    'warnings', jsonb_build_array('manual_review_required'),
    'verdict', 'mismatch',
    'score', 20,
    'confidence', 'weak'
  )
);

do $$
begin
  if (select count(*) from public.horse_document_validations where horse_document_id = '82000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Every document identification must create a retained version';
  end if;

  if not exists (
    select 1
    from public.horse_document_validations previous
    join public.horse_document_validations current
      on current.id = previous.superseded_by_validation_id
    where previous.horse_document_id = '82000000-0000-0000-0000-000000000001'
      and previous.version = 1
      and previous.status = 'superseded'
      and current.version = 2
      and current.status = 'mismatch'
  ) then
    raise exception 'A new reading must atomically supersede and link the prior version';
  end if;

  if (select count(*) from public.horse_document_validations where horse_document_id = '82000000-0000-0000-0000-000000000001' and status <> 'superseded') <> 1 then
    raise exception 'A document must have exactly one active validation version';
  end if;

  if not exists (
    select 1 from public.horses
    where id = '80000000-0000-0000-0000-000000000001'
      and name = 'Phase One Whiz'
      and registration_number = 'P1-A-001'
  ) then
    raise exception 'Document identification must never change the HSP horse identity';
  end if;

  raise notice 'ok - document readings are versioned and do not mutate horse identity';
end;
$$;

do $$
begin
  begin
    insert into public.horse_document_validations (
      horse_document_id, horse_id, version, status, source, comparison_profile,
      verdict, score, confidence, created_by_user_id
    ) values (
      '82000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      99, 'identified', 'manual', 'health_document_horse',
      'insufficient_data', 0, 'weak', '20000000-0000-0000-0000-000000000003'
    );
    raise exception 'Authenticated clients bypassed the versioning function';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'ok - clients cannot insert or rewrite validation evidence directly';
end;
$$;

-- Un admin d'une autre association ne peut ni voir ni identifier ce document.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);

do $$
begin
  if exists (
    select 1 from public.horse_document_validations
    where horse_document_id = '82000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'An unrelated association read another horse validation';
  end if;

  begin
    perform public.create_horse_document_validation(
      '82000000-0000-0000-0000-000000000001',
      jsonb_build_object(
        'status', 'identified', 'source', 'manual', 'comparison_profile', 'health_document_horse',
        'horse_identity_snapshot', '{}'::jsonb, 'comparison_result', '{}'::jsonb,
        'evidence', '[]'::jsonb, 'source_payload', '{}'::jsonb, 'warnings', '[]'::jsonb,
        'verdict', 'insufficient_data', 'score', 0, 'confidence', 'weak'
      )
    );
    raise exception 'An unrelated association identified another horse document';
  exception when insufficient_privilege then
    null;
  end;

  raise notice 'ok - validation visibility and creation follow horse directory authority';
end;
$$;

reset role;

do $$
declare
  target_id uuid;
begin
  select id into target_id
  from public.horse_document_validations
  where horse_document_id = '82000000-0000-0000-0000-000000000001'
    and version = 2;

  begin
    update public.horse_document_validations
    set extracted_horse_name = 'Rewritten evidence'
    where id = target_id;
    raise exception 'Stored document evidence was rewritten';
  exception when check_violation then
    null;
  end;

  raise notice 'ok - stored validation evidence is immutable';
end;
$$;

delete from public.horse_documents
where id = '82000000-0000-0000-0000-000000000001';

do $$
begin
  if exists (
    select 1 from public.horse_document_validations
    where horse_document_id = '82000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Deleting a horse document left orphan validation history';
  end if;

  raise notice 'ok - deleting a document removes its private validation history without orphan rows';
end;
$$;

rollback;
