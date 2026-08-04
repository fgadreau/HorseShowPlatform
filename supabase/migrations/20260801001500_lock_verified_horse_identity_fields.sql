-- Bloc 3 / S3: verrouillage champ par champ de l'identite du cheval.
-- Seules les preuves actives et concordantes verrouillent les champs utilises.
-- Le futur workflow de correction auditee sera ajoute en S4.
-- Impact ShowScore: SS-0. Aucun objet, passage, score ou payload ShowScore n'est modifie.

alter table public.horse_document_validations
  add constraint horse_document_validations_status_verdict_check
  check (
    (status = 'verified' and verdict = 'match')
    or (status = 'mismatch' and verdict = 'mismatch')
    or (status = 'identified' and verdict in ('possible_match', 'insufficient_data'))
    or status in ('rejected', 'superseded')
  );

create or replace function public.horse_identity_locks_for(target_horse_id uuid)
returns table (
  lock_field text,
  validation_id uuid,
  horse_document_id uuid,
  document_type text,
  external_credential_issuer_id uuid,
  validation_version integer
)
language sql
volatile
security definer
set search_path = public
as $$
  with aligned_evidence as (
    select
      validation.id as validation_id,
      validation.horse_document_id,
      validation.version,
      validation.horse_identity_snapshot,
      document.document_type,
      document.external_credential_issuer_id,
      evidence.item
    from public.horse_document_validations validation
    join public.horse_documents document
      on document.id = validation.horse_document_id
    cross join lateral jsonb_array_elements(validation.evidence) evidence(item)
    where validation.horse_id = target_horse_id
      and validation.status = 'verified'
      and evidence.item->>'outcome' in ('exact', 'similar')
  )
  select distinct
    case
      when item->>'field' = 'name' then 'name'
      when item->>'field' = 'date_of_birth' then 'date_of_birth'
      when item->>'field' = 'birth_year' then 'birth_year'
      when item->>'field' = 'gender' then 'gender'
      when item->>'field' = 'breed' then 'breed'
      when item->>'field' = 'identifier'
        and nullif(horse_identity_snapshot->>'external_identifier', '') is not null
        then 'external_identifier'
      when item->>'field' = 'identifier'
        and nullif(horse_identity_snapshot->>'external_identifier', '') is null
        and nullif(horse_identity_snapshot->>'registration_number', '') is not null
        then 'registration_number'
      else null
    end as lock_field,
    validation_id,
    horse_document_id,
    document_type,
    external_credential_issuer_id,
    version
  from aligned_evidence
  where item->>'field' in ('name', 'date_of_birth', 'birth_year', 'gender', 'breed', 'identifier')

  union

  select distinct
    'registration_status',
    validation.id,
    validation.horse_document_id,
    document.document_type,
    document.external_credential_issuer_id,
    validation.version
  from public.horse_document_validations validation
  join public.horse_documents document
    on document.id = validation.horse_document_id
  cross join lateral jsonb_array_elements(validation.evidence) evidence(item)
  where validation.horse_id = target_horse_id
    and validation.status = 'verified'
    and evidence.item->>'field' = 'identifier'
    and evidence.item->>'outcome' in ('exact', 'similar')
$$;

revoke all on function public.horse_identity_locks_for(uuid) from public, anon, authenticated;

create or replace function public.get_horse_identity_locks(p_horse_id uuid)
returns table (
  lock_field text,
  validation_id uuid,
  horse_document_id uuid,
  document_type text,
  external_credential_issuer_id uuid,
  validation_version integer
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.can_access_horse(p_horse_id) then
    raise exception 'Not authorized to read this horse identity lock'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select * from public.horse_identity_locks_for(p_horse_id);
end;
$$;

revoke all on function public.get_horse_identity_locks(uuid) from public, anon;
grant execute on function public.get_horse_identity_locks(uuid) to authenticated;

create or replace function public.enforce_verified_horse_identity_locks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  blocking_lock record;
  correction_setting text;
begin
  correction_setting := current_setting('hsp.identity_correction_id', true);
  if correction_setting is not null
    and correction_setting ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    if exists (
      select 1
      from public.horse_identity_corrections correction
      where correction.id = correction_setting::uuid
        and correction.horse_id = old.id
        and correction.status = 'pending'
        and correction.created_by_user_id = public.current_profile_id()
    ) then
      return new;
    end if;
  end if;

  if new.name is distinct from old.name then
    select * into blocking_lock from public.horse_identity_locks_for(old.id) where lock_field = 'name' limit 1;
    if found then
      raise exception 'HSP_HORSE_IDENTITY_LOCKED:name' using errcode = 'check_violation';
    end if;
  end if;

  if new.date_of_birth is distinct from old.date_of_birth
    or new.birth_year is distinct from old.birth_year
  then
    select * into blocking_lock from public.horse_identity_locks_for(old.id) where lock_field in ('date_of_birth', 'birth_year') limit 1;
    if found then
      raise exception 'HSP_HORSE_IDENTITY_LOCKED:birth' using errcode = 'check_violation';
    end if;
  end if;

  if new.gender is distinct from old.gender then
    select * into blocking_lock from public.horse_identity_locks_for(old.id) where lock_field = 'gender' limit 1;
    if found then
      raise exception 'HSP_HORSE_IDENTITY_LOCKED:gender' using errcode = 'check_violation';
    end if;
  end if;

  if new.breed is distinct from old.breed then
    select * into blocking_lock from public.horse_identity_locks_for(old.id) where lock_field = 'breed' limit 1;
    if found then
      raise exception 'HSP_HORSE_IDENTITY_LOCKED:breed' using errcode = 'check_violation';
    end if;
  end if;

  if new.registration_number is distinct from old.registration_number then
    select * into blocking_lock from public.horse_identity_locks_for(old.id) where lock_field = 'registration_number' limit 1;
    if found then
      raise exception 'HSP_HORSE_IDENTITY_LOCKED:registration_number' using errcode = 'check_violation';
    end if;
  end if;

  if new.registration_status = 'grade'
    and new.registration_status is distinct from old.registration_status
  then
    select * into blocking_lock
    from public.horse_identity_locks_for(old.id)
    where lock_field in ('registration_status', 'registration_number', 'external_identifier')
    limit 1;
    if found then
      raise exception 'HSP_HORSE_IDENTITY_LOCKED:registration_status' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

create trigger horses_enforce_verified_identity_locks
before update on public.horses
for each row execute function public.enforce_verified_horse_identity_locks();

create or replace function public.enforce_verified_horse_external_identifier_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_horse_id uuid := old.horse_id;
  normalized_old_identifier text;
  correction_setting text;
begin
  correction_setting := current_setting('hsp.identity_correction_id', true);
  if correction_setting is not null
    and correction_setting ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    if exists (
      select 1
      from public.horse_identity_corrections correction
      where correction.id = correction_setting::uuid
        and correction.horse_id = target_horse_id
        and correction.status = 'pending'
        and correction.created_by_user_id = public.current_profile_id()
    ) then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
  end if;

  normalized_old_identifier := regexp_replace(upper(coalesce(old.identifier_value, '')), '[^A-Z0-9]+', '', 'g');

  if exists (
    select 1
    from public.horse_identity_locks_for(target_horse_id) identity_lock
    join public.horse_document_validations validation
      on validation.id = identity_lock.validation_id
    where identity_lock.lock_field = 'external_identifier'
      and identity_lock.external_credential_issuer_id = old.external_credential_issuer_id
      and regexp_replace(upper(coalesce(validation.horse_identity_snapshot->>'external_identifier', '')), '[^A-Z0-9]+', '', 'g') = normalized_old_identifier
  ) then
    if tg_op = 'DELETE' then
      raise exception 'HSP_HORSE_IDENTITY_LOCKED:external_identifier' using errcode = 'check_violation';
    end if;

    if new.horse_id is distinct from old.horse_id
      or new.external_credential_issuer_id is distinct from old.external_credential_issuer_id
      or new.identifier_type is distinct from old.identifier_type
      or regexp_replace(upper(coalesce(new.identifier_value, '')), '[^A-Z0-9]+', '', 'g') <> normalized_old_identifier
    then
      raise exception 'HSP_HORSE_IDENTITY_LOCKED:external_identifier' using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger horse_external_identifiers_enforce_verified_identity_lock
before update or delete on public.horse_external_identifiers
for each row execute function public.enforce_verified_horse_external_identifier_lock();

create or replace function public.prevent_verified_horse_document_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.horse_document_validations validation
    where validation.horse_document_id = old.id
      and validation.status = 'verified'
  ) then
    raise exception 'HSP_HORSE_IDENTITY_LOCKED:document' using errcode = 'check_violation';
  end if;

  return old;
end;
$$;

create trigger horse_documents_prevent_verified_deletion
before delete on public.horse_documents
for each row execute function public.prevent_verified_horse_document_deletion();

comment on function public.get_horse_identity_locks(uuid) is
  'Lists the horse fields currently protected by active verified document evidence.';
comment on trigger horses_enforce_verified_identity_locks on public.horses is
  'Prevents ordinary edits from silently invalidating a verified document identity; S4 will provide the audited correction path.';
