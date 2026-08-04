-- Bloc 3 / S4: correction explicite et auditee de l'identite du cheval.
-- Seuls le proprietaire/co-proprietaire, l'agent et la plateforme peuvent corriger.
-- Les validations touchees sont invalidees atomiquement avant la modification.
-- Impact ShowScore: SS-0. Aucun objet, passage, score ou payload ShowScore n'est modifie.

create table public.horse_identity_corrections (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references public.horses(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) >= 10),
  changed_fields text[] not null check (cardinality(changed_fields) > 0),
  before_identity jsonb not null check (jsonb_typeof(before_identity) = 'object'),
  after_identity jsonb not null default '{}'::jsonb check (jsonb_typeof(after_identity) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'applied')),
  created_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create index horse_identity_corrections_horse_idx
  on public.horse_identity_corrections (horse_id, created_at desc);

alter table public.horse_document_validations
  add column invalidated_by_correction_id uuid references public.horse_identity_corrections(id) on delete restrict,
  add column invalidated_at timestamptz,
  add column invalidated_fields text[];

alter table public.horse_document_validations
  drop constraint if exists horse_document_validations_status_check,
  drop constraint if exists horse_document_validations_check,
  drop constraint if exists horse_document_validations_status_verdict_check;

alter table public.horse_document_validations
  add constraint horse_document_validations_status_check
    check (status in ('identified', 'verified', 'mismatch', 'rejected', 'superseded', 'invalidated')),
  add constraint horse_document_validations_lifecycle_check
    check (
      (
        status = 'superseded'
        and superseded_at is not null
        and invalidated_by_correction_id is null
        and invalidated_at is null
        and invalidated_fields is null
      )
      or (
        status = 'invalidated'
        and superseded_at is null
        and superseded_by_validation_id is null
        and invalidated_by_correction_id is not null
        and invalidated_at is not null
        and cardinality(invalidated_fields) > 0
      )
      or (
        status not in ('superseded', 'invalidated')
        and superseded_at is null
        and superseded_by_validation_id is null
        and invalidated_by_correction_id is null
        and invalidated_at is null
        and invalidated_fields is null
      )
    ),
  add constraint horse_document_validations_status_verdict_check
    check (
      (status = 'verified' and verdict = 'match')
      or (status = 'mismatch' and verdict = 'mismatch')
      or (status = 'identified' and verdict in ('possible_match', 'insufficient_data'))
      or status in ('rejected', 'superseded', 'invalidated')
    );

drop index if exists public.horse_document_validations_one_active_idx;
create unique index horse_document_validations_one_active_idx
  on public.horse_document_validations (horse_document_id)
  where status not in ('superseded', 'invalidated');

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

  if old.status not in ('superseded', 'invalidated')
    and new.status = 'superseded'
    and new.superseded_at is not null
    and new.superseded_by_validation_id is null
    and new.invalidated_by_correction_id is null
    and new.invalidated_at is null
    and new.invalidated_fields is null
  then
    return new;
  end if;

  if old.status = 'superseded'
    and new.status = 'superseded'
    and old.superseded_by_validation_id is null
    and new.superseded_by_validation_id is not null
    and new.superseded_at is not distinct from old.superseded_at
    and new.invalidated_by_correction_id is not distinct from old.invalidated_by_correction_id
    and new.invalidated_at is not distinct from old.invalidated_at
    and new.invalidated_fields is not distinct from old.invalidated_fields
  then
    return new;
  end if;

  if old.status not in ('superseded', 'invalidated', 'rejected')
    and new.status = 'invalidated'
    and new.superseded_at is null
    and new.superseded_by_validation_id is null
    and new.invalidated_by_correction_id is not null
    and new.invalidated_at is not null
    and cardinality(new.invalidated_fields) > 0
  then
    return new;
  end if;

  raise exception 'Horse document validations can only be superseded or invalidated by controlled workflows'
    using errcode = 'check_violation';
end;
$$;

create or replace function public.can_correct_horse_identity(target_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
  or exists (
    select 1
    from public.horse_contacts horse_contact
    join public.contacts contact on contact.id = horse_contact.contact_id
    where horse_contact.horse_id = target_horse_id
      and horse_contact.role in ('owner', 'co-owner', 'agent')
      and contact.linked_user_id = public.current_profile_id()
  )
$$;

revoke all on function public.can_correct_horse_identity(uuid) from public, anon;
grant execute on function public.can_correct_horse_identity(uuid) to authenticated;

create or replace function public.horse_identity_snapshot_for(target_horse_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', horse.name,
    'date_of_birth', horse.date_of_birth,
    'birth_year', horse.birth_year,
    'gender', horse.gender,
    'breed', horse.breed,
    'registration_number', horse.registration_number,
    'registration_status', horse.registration_status,
    'external_identifiers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'external_credential_issuer_id', identifier.external_credential_issuer_id,
          'identifier_type', identifier.identifier_type,
          'identifier_value', identifier.identifier_value
        ) order by identifier.external_credential_issuer_id, identifier.identifier_type
      )
      from public.horse_external_identifiers identifier
      where identifier.horse_id = horse.id
    ), '[]'::jsonb)
  )
  from public.horses horse
  where horse.id = target_horse_id
$$;

revoke all on function public.horse_identity_snapshot_for(uuid) from public, anon, authenticated;

create or replace function public.correct_horse_identity(
  p_horse_id uuid,
  p_reason text,
  p_changes jsonb
)
returns public.horse_identity_corrections
language plpgsql
security definer
set search_path = public
as $$
declare
  horse_row public.horses%rowtype;
  correction public.horse_identity_corrections%rowtype;
  changed_fields text[] := array[]::text[];
  before_snapshot jsonb;
  after_snapshot jsonb;
  new_name text;
  new_date_of_birth date;
  new_birth_year smallint;
  new_gender text;
  new_breed text;
  new_registration_number text;
  new_registration_status text;
  external_change jsonb;
  issuer_id uuid;
  identifier_kind text;
  identifier_value text;
  existing_identifier public.horse_external_identifiers%rowtype;
  external_field_key text;
begin
  if not public.can_correct_horse_identity(p_horse_id) then
    raise exception 'HSP_HORSE_IDENTITY_CORRECTION_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'HSP_HORSE_IDENTITY_CORRECTION_REASON_REQUIRED' using errcode = 'invalid_parameter_value';
  end if;

  if jsonb_typeof(coalesce(p_changes, '{}'::jsonb)) <> 'object' then
    raise exception 'Horse identity changes must be an object' using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_changes) key
    where key not in (
      'name', 'date_of_birth', 'birth_year', 'gender', 'breed',
      'registration_number', 'registration_status', 'external_identifiers'
    )
  ) then
    raise exception 'Horse identity correction contains an unsupported field' using errcode = 'invalid_parameter_value';
  end if;

  if jsonb_typeof(coalesce(p_changes->'external_identifiers', '[]'::jsonb)) <> 'array' then
    raise exception 'External identifier corrections must be an array' using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_changes->'external_identifiers', '[]'::jsonb)) item
    group by item->>'external_credential_issuer_id', coalesce(item->>'identifier_type', 'competition_license')
    having count(*) > 1
  ) then
    raise exception 'External identifier corrections contain duplicate issuers and types' using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_horse_id::text, 1));

  select * into horse_row
  from public.horses
  where id = p_horse_id
  for update;

  if horse_row.id is null then
    raise exception 'Horse not found' using errcode = 'no_data_found';
  end if;

  before_snapshot := public.horse_identity_snapshot_for(p_horse_id);
  new_name := case when p_changes ? 'name' then nullif(btrim(p_changes->>'name'), '') else horse_row.name end;
  new_date_of_birth := case when p_changes ? 'date_of_birth' then nullif(p_changes->>'date_of_birth', '')::date else horse_row.date_of_birth end;
  new_birth_year := case
    when p_changes ? 'birth_year' then nullif(p_changes->>'birth_year', '')::smallint
    when p_changes ? 'date_of_birth' and nullif(p_changes->>'date_of_birth', '') is not null then extract(year from new_date_of_birth)::smallint
    when p_changes ? 'date_of_birth' then null
    else horse_row.birth_year
  end;
  new_gender := case when p_changes ? 'gender' then nullif(btrim(p_changes->>'gender'), '') else horse_row.gender end;
  new_breed := case when p_changes ? 'breed' then nullif(btrim(p_changes->>'breed'), '') else horse_row.breed end;
  new_registration_number := case when p_changes ? 'registration_number' then nullif(btrim(p_changes->>'registration_number'), '') else horse_row.registration_number end;
  new_registration_status := case when p_changes ? 'registration_status' then p_changes->>'registration_status' else horse_row.registration_status end;

  if new_name is null then
    raise exception 'Horse name is required' using errcode = 'not_null_violation';
  end if;

  if new_name is distinct from horse_row.name then changed_fields := array_append(changed_fields, 'name'); end if;
  if new_date_of_birth is distinct from horse_row.date_of_birth then changed_fields := array_append(changed_fields, 'date_of_birth'); end if;
  if new_birth_year is distinct from horse_row.birth_year then changed_fields := array_append(changed_fields, 'birth_year'); end if;
  if new_gender is distinct from horse_row.gender then changed_fields := array_append(changed_fields, 'gender'); end if;
  if new_breed is distinct from horse_row.breed then changed_fields := array_append(changed_fields, 'breed'); end if;
  if new_registration_number is distinct from horse_row.registration_number then changed_fields := array_append(changed_fields, 'registration_number'); end if;
  if new_registration_status is distinct from horse_row.registration_status then changed_fields := array_append(changed_fields, 'registration_status'); end if;

  for external_change in
    select value from jsonb_array_elements(coalesce(p_changes->'external_identifiers', '[]'::jsonb)) item(value)
  loop
    issuer_id := nullif(external_change->>'external_credential_issuer_id', '')::uuid;
    identifier_kind := coalesce(nullif(external_change->>'identifier_type', ''), 'competition_license');
    identifier_value := nullif(btrim(external_change->>'identifier_value'), '');

    if issuer_id is null or not exists (select 1 from public.external_credential_issuers where id = issuer_id) then
      raise exception 'External credential issuer not found' using errcode = 'foreign_key_violation';
    end if;

    select * into existing_identifier
    from public.horse_external_identifiers
    where horse_id = p_horse_id
      and external_credential_issuer_id = issuer_id
      and identifier_type = identifier_kind;

    if identifier_value is distinct from existing_identifier.identifier_value then
      external_field_key := format('external_identifier:%s:%s', issuer_id, identifier_kind);
      changed_fields := array_append(changed_fields, external_field_key);
    end if;
  end loop;

  if cardinality(changed_fields) = 0 then
    raise exception 'HSP_NO_IDENTITY_CHANGES' using errcode = 'invalid_parameter_value';
  end if;

  insert into public.horse_identity_corrections (
    horse_id,
    reason,
    changed_fields,
    before_identity,
    status,
    created_by_user_id
  ) values (
    p_horse_id,
    btrim(p_reason),
    changed_fields,
    before_snapshot,
    'pending',
    public.current_profile_id()
  )
  returning * into correction;

  with affected_validations as (
    select
      validation.id,
      array(
        select changed_field
        from unnest(changed_fields) changed_field
        where
          (changed_field = 'name' and validation.extracted_horse_name is not null)
          or (
            changed_field in ('date_of_birth', 'birth_year')
            and coalesce(
              validation.extracted_date_of_birth::text,
              validation.extracted_birth_year::text,
              validation.extracted_age_years::text
            ) is not null
          )
          or (changed_field = 'gender' and validation.extracted_gender is not null)
          or (changed_field = 'breed' and validation.extracted_breed is not null)
          or (
            changed_field = 'registration_number'
            and validation.extracted_identifier is not null
            and nullif(validation.horse_identity_snapshot->>'external_identifier', '') is null
          )
          or (
            changed_field = 'registration_status'
            and (
              validation.extracted_identifier is not null
              or validation.extracted_breed is not null
            )
          )
          or (
            validation.extracted_identifier is not null
            and document.external_credential_issuer_id is not null
            and changed_field like format(
              'external_identifier:%s:%%',
              document.external_credential_issuer_id
            )
          )
      ) as invalidated_fields
    from public.horse_document_validations validation
    join public.horse_documents document on document.id = validation.horse_document_id
    where validation.horse_id = p_horse_id
      and validation.status in ('identified', 'verified', 'mismatch')
  )
  update public.horse_document_validations validation
  set status = 'invalidated',
      invalidated_by_correction_id = correction.id,
      invalidated_at = now(),
      invalidated_fields = affected.invalidated_fields
  from affected_validations affected
  where affected.id = validation.id
    and cardinality(affected.invalidated_fields) > 0;

  perform set_config('hsp.identity_correction_id', correction.id::text, true);

  update public.horses
  set name = new_name,
      date_of_birth = new_date_of_birth,
      birth_year = new_birth_year,
      gender = new_gender,
      breed = new_breed,
      registration_number = case when new_registration_status = 'grade' then null else new_registration_number end,
      registration_status = new_registration_status
  where id = p_horse_id;

  for external_change in
    select value from jsonb_array_elements(coalesce(p_changes->'external_identifiers', '[]'::jsonb)) item(value)
  loop
    issuer_id := (external_change->>'external_credential_issuer_id')::uuid;
    identifier_kind := coalesce(nullif(external_change->>'identifier_type', ''), 'competition_license');
    identifier_value := nullif(btrim(external_change->>'identifier_value'), '');

    select * into existing_identifier
    from public.horse_external_identifiers
    where horse_id = p_horse_id
      and external_credential_issuer_id = issuer_id
      and identifier_type = identifier_kind;

    if identifier_value is not distinct from existing_identifier.identifier_value then
      continue;
    end if;

    if identifier_value is null then
      delete from public.horse_external_identifiers
      where horse_id = p_horse_id
        and external_credential_issuer_id = issuer_id
        and identifier_type = identifier_kind;
    else
      insert into public.horse_external_identifiers (
        horse_id,
        external_credential_issuer_id,
        identifier_type,
        identifier_value,
        status
      ) values (
        p_horse_id,
        issuer_id,
        identifier_kind,
        identifier_value,
        'unknown'
      )
      on conflict (horse_id, external_credential_issuer_id, identifier_type)
      do update set
        identifier_value = excluded.identifier_value,
        status = 'unknown',
        verified_at = null,
        verified_by_external_data_source_id = null,
        latest_snapshot_id = null;
    end if;
  end loop;

  if new_registration_status = 'grade' and exists (
    select 1
    from public.horse_external_identifiers identifier
    join public.external_credential_issuers issuer on issuer.id = identifier.external_credential_issuer_id
    where identifier.horse_id = p_horse_id
      and issuer.issuer_type = 'breed_registry'
  ) then
    raise exception 'A grade horse cannot retain a breed registry identifier' using errcode = 'check_violation';
  end if;

  after_snapshot := public.horse_identity_snapshot_for(p_horse_id);

  update public.horse_identity_corrections
  set after_identity = after_snapshot,
      status = 'applied',
      applied_at = now()
  where id = correction.id
  returning * into correction;

  return correction;
end;
$$;

alter table public.horse_identity_corrections enable row level security;

create policy "Authorized users view horse identity corrections"
  on public.horse_identity_corrections for select
  to authenticated
  using (public.can_access_horse(horse_id));

revoke all on public.horse_identity_corrections from anon, authenticated;
grant select on public.horse_identity_corrections to authenticated;

revoke all on function public.correct_horse_identity(uuid, text, jsonb) from public, anon;
grant execute on function public.correct_horse_identity(uuid, text, jsonb) to authenticated;

comment on table public.horse_identity_corrections is
  'Immutable audit trail of explicit horse identity corrections with before/after snapshots and reasons.';
comment on function public.correct_horse_identity(uuid, text, jsonb) is
  'Atomically invalidates affected document readings and applies an authorized, reasoned identity correction.';
