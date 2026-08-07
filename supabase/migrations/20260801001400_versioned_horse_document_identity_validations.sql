-- Bloc 3 / S2: identification versionnee des documents du cheval.
-- Une lecture documente un rapprochement; elle ne modifie jamais l'identite HSP.
-- Impact ShowScore: SS-0. Aucun objet de programme, passage ou resultat n'est modifie.

create table public.horse_document_validations (
  id uuid primary key default gen_random_uuid(),
  horse_document_id uuid not null references public.horse_documents(id) on delete cascade,
  horse_id uuid not null references public.horses(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('identified', 'verified', 'mismatch', 'rejected', 'superseded')),
  source text not null check (source in ('manual', 'ocr', 'qr', 'external_api', 'import')),
  comparison_profile text not null check (comparison_profile in ('health_document_horse', 'external_horse')),
  extracted_horse_name text,
  extracted_date_of_birth date,
  extracted_birth_year smallint check (extracted_birth_year is null or extracted_birth_year between 1900 and 2200),
  extracted_age_years smallint check (extracted_age_years is null or extracted_age_years between 0 and 60),
  extracted_age_reference_date date,
  extracted_gender text,
  extracted_breed text,
  extracted_color text,
  extracted_identifier text,
  extracted_owner_name text,
  horse_identity_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(horse_identity_snapshot) = 'object'),
  comparison_result jsonb not null default '{}'::jsonb check (jsonb_typeof(comparison_result) = 'object'),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  source_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(source_payload) = 'object'),
  warnings text[] not null default '{}',
  verdict text not null check (verdict in ('match', 'possible_match', 'mismatch', 'insufficient_data')),
  score smallint not null check (score between 0 and 100),
  confidence text not null check (confidence in ('certain', 'probable', 'weak')),
  created_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  superseded_by_validation_id uuid references public.horse_document_validations(id) on delete cascade,
  superseded_at timestamptz,
  unique (horse_document_id, version),
  check (
    (status = 'superseded' and superseded_at is not null)
    or (status <> 'superseded' and superseded_at is null and superseded_by_validation_id is null)
  )
);

create unique index horse_document_validations_one_active_idx
  on public.horse_document_validations (horse_document_id)
  where status <> 'superseded';

create index horse_document_validations_horse_idx
  on public.horse_document_validations (horse_id, created_at desc);

create or replace function public.enforce_horse_document_validation_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  document_horse_id uuid;
begin
  if tg_op = 'INSERT' then
    select document.horse_id
    into document_horse_id
    from public.horse_documents document
    where document.id = new.horse_document_id;

    if document_horse_id is null or document_horse_id <> new.horse_id then
      raise exception 'Horse document validation must use the document horse'
        using errcode = 'foreign_key_violation';
    end if;

    return new;
  end if;

  if new.id is distinct from old.id
    or new.horse_document_id is distinct from old.horse_document_id
    or new.horse_id is distinct from old.horse_id
    or new.version is distinct from old.version
    or new.source is distinct from old.source
    or new.comparison_profile is distinct from old.comparison_profile
    or new.extracted_horse_name is distinct from old.extracted_horse_name
    or new.extracted_date_of_birth is distinct from old.extracted_date_of_birth
    or new.extracted_birth_year is distinct from old.extracted_birth_year
    or new.extracted_age_years is distinct from old.extracted_age_years
    or new.extracted_age_reference_date is distinct from old.extracted_age_reference_date
    or new.extracted_gender is distinct from old.extracted_gender
    or new.extracted_breed is distinct from old.extracted_breed
    or new.extracted_color is distinct from old.extracted_color
    or new.extracted_identifier is distinct from old.extracted_identifier
    or new.extracted_owner_name is distinct from old.extracted_owner_name
    or new.horse_identity_snapshot is distinct from old.horse_identity_snapshot
    or new.comparison_result is distinct from old.comparison_result
    or new.evidence is distinct from old.evidence
    or new.source_payload is distinct from old.source_payload
    or new.warnings is distinct from old.warnings
    or new.verdict is distinct from old.verdict
    or new.score is distinct from old.score
    or new.confidence is distinct from old.confidence
    or new.created_by_user_id is distinct from old.created_by_user_id
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Horse document validation evidence is immutable'
      using errcode = 'check_violation';
  end if;

  if old.status <> 'superseded'
    and new.status = 'superseded'
    and new.superseded_at is not null
    and new.superseded_by_validation_id is null
  then
    return new;
  end if;

  if old.status = 'superseded'
    and new.status = 'superseded'
    and old.superseded_by_validation_id is null
    and new.superseded_by_validation_id is not null
    and new.superseded_at is not distinct from old.superseded_at
  then
    return new;
  end if;

  raise exception 'Horse document validations can only be superseded by a new version'
    using errcode = 'check_violation';
end;
$$;

create trigger horse_document_validations_integrity
before insert or update on public.horse_document_validations
for each row execute function public.enforce_horse_document_validation_integrity();

alter table public.horse_document_validations enable row level security;

create or replace function public.can_identify_horse_document(target_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
  or public.can_manage_horse_identity(target_horse_id)
  or exists (
    select 1
    from public.directory_horses directory_horse
    join public.organization_disciplines organization_discipline
      on organization_discipline.id = directory_horse.organization_discipline_id
    where directory_horse.horse_id = target_horse_id
      and public.is_org_member(organization_discipline.organization_id, array['admin', 'secretary'])
  )
$$;

create policy "Authorized users view horse document validations"
  on public.horse_document_validations for select
  to authenticated
  using (public.can_access_horse(horse_id));

revoke all on public.horse_document_validations from anon, authenticated;
grant select on public.horse_document_validations to authenticated;

create or replace function public.create_horse_document_validation(
  p_horse_document_id uuid,
  p_validation jsonb
)
returns public.horse_document_validations
language plpgsql
security definer
set search_path = public
as $$
declare
  document_row public.horse_documents%rowtype;
  previous_validation_id uuid;
  next_version integer;
  new_validation public.horse_document_validations%rowtype;
  validation_warnings text[];
begin
  select * into document_row
  from public.horse_documents
  where id = p_horse_document_id;

  if document_row.id is null then
    raise exception 'Horse document not found' using errcode = 'no_data_found';
  end if;

  if not public.can_identify_horse_document(document_row.horse_id) then
    raise exception 'Not authorized to identify this horse document' using errcode = 'insufficient_privilege';
  end if;

  if public.current_profile_id() is null then
    raise exception 'A user profile is required to identify a horse document' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_horse_document_id::text, 0));

  select id into previous_validation_id
  from public.horse_document_validations
  where horse_document_id = p_horse_document_id
    and status not in ('superseded', 'invalidated')
  for update;

  update public.horse_document_validations
  set status = 'superseded',
      superseded_at = now()
  where id = previous_validation_id;

  select coalesce(max(version), 0) + 1
  into next_version
  from public.horse_document_validations
  where horse_document_id = p_horse_document_id;

  if jsonb_typeof(coalesce(p_validation->'warnings', '[]'::jsonb)) <> 'array' then
    raise exception 'Validation warnings must be an array' using errcode = 'invalid_parameter_value';
  end if;

  select coalesce(array_agg(value), '{}')
  into validation_warnings
  from jsonb_array_elements_text(coalesce(p_validation->'warnings', '[]'::jsonb)) warning(value);

  insert into public.horse_document_validations (
    horse_document_id,
    horse_id,
    version,
    status,
    source,
    comparison_profile,
    extracted_horse_name,
    extracted_date_of_birth,
    extracted_birth_year,
    extracted_age_years,
    extracted_age_reference_date,
    extracted_gender,
    extracted_breed,
    extracted_color,
    extracted_identifier,
    extracted_owner_name,
    horse_identity_snapshot,
    comparison_result,
    evidence,
    source_payload,
    warnings,
    verdict,
    score,
    confidence,
    created_by_user_id
  ) values (
    p_horse_document_id,
    document_row.horse_id,
    next_version,
    p_validation->>'status',
    p_validation->>'source',
    p_validation->>'comparison_profile',
    nullif(btrim(p_validation->>'extracted_horse_name'), ''),
    nullif(p_validation->>'extracted_date_of_birth', '')::date,
    nullif(p_validation->>'extracted_birth_year', '')::smallint,
    nullif(p_validation->>'extracted_age_years', '')::smallint,
    nullif(p_validation->>'extracted_age_reference_date', '')::date,
    nullif(btrim(p_validation->>'extracted_gender'), ''),
    nullif(btrim(p_validation->>'extracted_breed'), ''),
    nullif(btrim(p_validation->>'extracted_color'), ''),
    nullif(btrim(p_validation->>'extracted_identifier'), ''),
    nullif(btrim(p_validation->>'extracted_owner_name'), ''),
    coalesce(p_validation->'horse_identity_snapshot', '{}'::jsonb),
    coalesce(p_validation->'comparison_result', '{}'::jsonb),
    coalesce(p_validation->'evidence', '[]'::jsonb),
    coalesce(p_validation->'source_payload', '{}'::jsonb),
    validation_warnings,
    p_validation->>'verdict',
    (p_validation->>'score')::smallint,
    p_validation->>'confidence',
    public.current_profile_id()
  )
  returning * into new_validation;

  update public.horse_document_validations
  set superseded_by_validation_id = new_validation.id
  where id = previous_validation_id;

  return new_validation;
end;
$$;

revoke all on function public.create_horse_document_validation(uuid, jsonb) from public, anon;
grant execute on function public.create_horse_document_validation(uuid, jsonb) to authenticated;

comment on table public.horse_document_validations is
  'Immutable, versioned document-to-horse identity readings. Evidence never mutates the HSP horse identity.';
comment on function public.create_horse_document_validation(uuid, jsonb) is
  'Creates a new immutable validation version and supersedes the prior reading atomically.';
