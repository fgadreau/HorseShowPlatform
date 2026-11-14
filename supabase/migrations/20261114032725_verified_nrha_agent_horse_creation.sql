begin;

-- Creating a horse for another owner must start with the horse's verified NRHA
-- record. A manually declared registration number remains unverified.
create or replace function public.create_horse_agent_record(
  p_org uuid,
  p_directory uuid,
  p_owner uuid,
  p_creator uuid,
  p_details jsonb
) returns public.horses
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.horses;
  agent uuid;
  horse_name text := nullif(btrim(p_details->>'name'), '');
  registration text := nullif(btrim(p_details->>'registration_number'), '');
  horse_date date;
  horse_birth_year integer;
  verification jsonb := p_details->'nrha_verification';
  verified_nrha boolean := coalesce(p_details->>'verification_source', '') = 'nrha_api'
    and jsonb_typeof(p_details->'nrha_verification') = 'object';
  nrha_issuer uuid;
  nrha_source uuid;
  snapshot uuid;
  identifier uuid;
begin
  if not exists (
    select 1 from public.organization_disciplines
    where id = p_directory and organization_id = p_org and is_active
  ) or not exists (select 1 from public.contacts where id = p_owner) then
    raise exception 'Propriétaire ou répertoire invalide.';
  end if;
  if horse_name is null or length(horse_name) > 200 then
    raise exception 'Le nom du cheval est requis (200 caractères maximum).';
  end if;
  if length(coalesce(registration, '')) > 100
    or (nullif(p_details->>'gender', '') is not null and p_details->>'gender' not in ('M', 'F', 'G')) then
    raise exception 'Numéro ou sexe du cheval invalide.';
  end if;
  if nullif(p_details->>'date_of_birth', '') is not null then
    if p_details->>'date_of_birth' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Date de naissance invalide.';
    end if;
    horse_date := (p_details->>'date_of_birth')::date;
    horse_birth_year := extract(year from horse_date)::integer;
  elsif nullif(p_details->>'birth_year', '') is not null then
    if p_details->>'birth_year' !~ '^[0-9]{4}$' then raise exception 'Année de naissance invalide.'; end if;
    horse_birth_year := (p_details->>'birth_year')::integer;
  end if;
  if horse_birth_year is not null and horse_birth_year not between 1900 and extract(year from current_date)::integer + 1 then
    raise exception 'Année de naissance invalide.';
  end if;
  if verified_nrha then
    if verification->>'status' not in ('found', 'verified')
      or coalesce(verification#>>'{horse,licenseNumber}', verification->>'licenseNumber', '') <> registration
      or public.identity_search_key(coalesce(verification#>>'{horse,horseName}', verification->>'officialHorseName', ''))
        <> public.identity_search_key(horse_name) then
      raise exception 'La preuve NRHA ne correspond pas au cheval à créer.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('horse-owner-creation:' || p_owner, 0));
  if exists (
    select 1 from public.horses h
    where (h.primary_owner_contact_id = p_owner and public.identity_search_key(h.name) = public.identity_search_key(horse_name))
      or (registration is not null and public.identity_search_key(h.registration_number) = public.identity_search_key(registration))
  ) then
    raise exception 'Ce cheval existe déjà. Recherche-le et demande à devenir son agent.';
  end if;

  agent := public.horse_agent_contact_for_profile(p_creator);
  insert into public.horses (
    name,
    primary_owner_contact_id,
    created_by_user_id,
    registration_number,
    registration_status,
    gender,
    date_of_birth,
    birth_year,
    sire_name,
    dam_name
  ) values (
    horse_name,
    p_owner,
    p_creator,
    registration,
    case when verified_nrha then 'registered' else 'unknown' end,
    nullif(p_details->>'gender', ''),
    horse_date,
    horse_birth_year,
    nullif(btrim(p_details->>'sire_name'), ''),
    nullif(btrim(p_details->>'dam_name'), '')
  ) returning * into result;

  insert into public.directory_contacts (organization_discipline_id, contact_id, source, created_by_user_id)
  values (p_directory, p_owner, 'relationship', p_creator)
  on conflict (organization_discipline_id, contact_id) do nothing;
  insert into public.directory_horses (organization_discipline_id, horse_id, source, created_by_user_id)
  values (p_directory, result.id, case when verified_nrha then 'import' else 'manual' end, p_creator)
  on conflict (organization_discipline_id, horse_id) do nothing;
  insert into public.horse_contacts (horse_id, contact_id, role, can_create_entries, can_modify_entries, can_book_stalls, can_pay_invoices)
  values (result.id, p_owner, 'owner', true, true, true, true)
  on conflict (horse_id, contact_id, role) do nothing;
  if not exists (select 1 from public.contacts where id = p_owner and linked_user_id = p_creator) then
    insert into public.horse_contacts (horse_id, contact_id, role, can_create_entries, can_modify_entries, can_book_stalls, can_pay_invoices)
    values (result.id, agent, 'agent', true, true, true, false)
    on conflict (horse_id, contact_id, role) do nothing;
    insert into public.directory_contacts (organization_discipline_id, contact_id, source, created_by_user_id)
    values (p_directory, agent, 'relationship', p_creator)
    on conflict (organization_discipline_id, contact_id) do nothing;
    insert into public.contact_roles (organization_id, contact_id, role, source)
    values (p_org, agent, 'agent', 'horse')
    on conflict (organization_id, contact_id, role) do nothing;
  end if;
  insert into public.contact_roles (organization_id, contact_id, role, source)
  values (p_org, p_owner, 'owner', 'horse')
  on conflict (organization_id, contact_id, role) do nothing;

  if verified_nrha then
    select id into nrha_issuer from public.external_credential_issuers where upper(code) = 'NRHA' and is_active limit 1;
    select id into nrha_source from public.external_data_sources where upper(code) = 'NRHA_MEMBER_LOOKUP' and is_active limit 1;
    if nrha_issuer is null or nrha_source is null then
      raise exception 'Le catalogue NRHA requis pour enregistrer la preuve est incomplet.';
    end if;
    insert into public.external_data_snapshots (
      external_data_source_id,
      source_record_key,
      status,
      payload,
      created_by_user_id
    ) values (nrha_source, registration, 'verified', verification, p_creator)
    returning id into snapshot;
    insert into public.external_data_snapshot_horses (snapshot_id, horse_id, relationship_type)
    values (snapshot, result.id, 'subject');
    insert into public.horse_external_identifiers (
      horse_id,
      external_credential_issuer_id,
      identifier_type,
      identifier_value,
      status,
      verified_at,
      verified_by_external_data_source_id,
      latest_snapshot_id,
      metadata
    ) values (
      result.id,
      nrha_issuer,
      'competition_license',
      registration,
      'active',
      now(),
      nrha_source,
      snapshot,
      jsonb_build_object('verification_source', 'nrha_api', 'verification_payload', verification)
    ) returning id into identifier;
  end if;
  return result;
end;
$$;

create function public.create_verified_nrha_horse_for_owner(
  p_org uuid,
  p_directory uuid,
  p_horse_number text,
  p_details jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  verification jsonb := p_details->'nrha_verification';
  horse_name text;
  owner_name text;
  owner_first_name text;
  owner_last_name text;
  owner_number text;
  owner uuid;
  matches integer := 0;
  horse public.horses;
  request_id uuid;
begin
  if auth.uid() is null or actor is null then
    raise exception 'Connecte-toi pour créer un cheval.' using errcode = '42501';
  end if;
  if not public.can_request_horse_access_in_org(p_org) then
    raise exception 'Cette association n’est pas accessible depuis ton compte.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.organization_disciplines
    where id = p_directory and organization_id = p_org and is_active
  ) then
    raise exception 'Répertoire invalide.' using errcode = '42501';
  end if;
  if p_horse_number is null or btrim(p_horse_number) !~ '^[0-9]{1,20}$'
    or jsonb_typeof(p_details) <> 'object'
    or jsonb_typeof(verification) <> 'object'
    or pg_column_size(p_details) > 8192 then
    raise exception 'Preuve NRHA du cheval invalide.';
  end if;
  horse_name := nullif(btrim(coalesce(verification#>>'{horse,horseName}', verification->>'officialHorseName')), '');
  owner_name := nullif(btrim(coalesce(verification#>>'{horse,ownerName}', verification->>'officialOwnerName')), '');
  owner_number := nullif(btrim(verification#>>'{horse,ownerMemberNumber}'), '');
  if verification->>'status' not in ('found', 'verified')
    or coalesce(verification#>>'{checks,name,matched}', '') <> 'true'
    or coalesce(verification#>>'{horse,licenseNumber}', verification->>'licenseNumber', '') <> btrim(p_horse_number)
    or horse_name is null
    or owner_name is null
    or public.identity_search_key(p_details->>'name') <> public.identity_search_key(horse_name)
    or nullif(btrim(p_details->>'registration_number'), '') <> btrim(p_horse_number)
    or coalesce(p_details->>'verification_source', '') <> 'nrha_api' then
    raise exception 'La preuve NRHA ne correspond pas au cheval à créer.';
  end if;
  if owner_number is not null and owner_number !~ '^[0-9]{1,20}$' then
    raise exception 'Le numéro NRHA du propriétaire retourné par NRHA est invalide.';
  end if;

  owner_last_name := regexp_replace(owner_name, '^.*\s+', '');
  owner_first_name := nullif(btrim(left(owner_name, greatest(length(owner_name) - length(owner_last_name), 0))), '');
  if owner_first_name is null then
    owner_first_name := owner_name;
    owner_last_name := 'Owner';
  end if;
  p_details := p_details || jsonb_build_object(
    'name', horse_name,
    'registration_number', btrim(p_horse_number),
    'owner_name', owner_name,
    'owner_first_name', owner_first_name,
    'owner_last_name', owner_last_name,
    'owner_nrha_number', coalesce(owner_number, '')
  );

  if owner_number is not null then
    select count(*), min(candidate.contact_id::text)::uuid
    into matches, owner
    from public.find_horse_owner_by_nrha(p_org, owner_number) candidate;
  end if;
  if matches = 1 and (public.can_access_contact(owner) or public.can_read_managed_horse_owner(owner, p_org)) then
    horse := public.create_horse_agent_record(p_org, p_directory, owner, actor, p_details);
    return jsonb_build_object('status', 'created', 'horse', to_jsonb(horse));
  end if;

  request_id := public.request_horse_owner_confirmation(
    p_org,
    p_directory,
    owner_first_name,
    owner_last_name,
    p_details,
    case when matches = 1 then owner_number else null end
  );
  update public.horse_owner_creation_requests
  set owner_nrha_number = owner_number
  where id = request_id;
  return jsonb_build_object('status', 'pending_owner_confirmation', 'request_id', request_id);
end;
$$;

-- The legacy function accepted only the owner's member number and could create
-- an unverified horse. Keep it for migration compatibility but remove app access.
revoke execute on function public.create_horse_for_nrha_owner(uuid, uuid, text, jsonb) from authenticated;
revoke all on function public.create_verified_nrha_horse_for_owner(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_verified_nrha_horse_for_owner(uuid, uuid, text, jsonb) to authenticated;

comment on function public.create_verified_nrha_horse_for_owner(uuid, uuid, text, jsonb) is
  'Creates or requests approval for an agent-managed horse from compact NRHA horse lookup evidence.';

commit;
