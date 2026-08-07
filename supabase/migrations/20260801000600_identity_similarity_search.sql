-- Bloc 1 / F7: recherche anti-doublon explicable pour contacts et chevaux.
-- Aucun rapprochement n'effectue une fusion automatique.
-- Impact ShowScore: SS-0.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function public.identity_search_key(target_value text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select regexp_replace(
    lower(extensions.unaccent(coalesce(target_value, ''))),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

create or replace function public.contact_identity_name(
  first_name text,
  middle_name text,
  last_name text
)
returns text
language sql
immutable
as $$
  select btrim(coalesce(first_name, '') || ' ' || coalesce(middle_name, '') || ' ' || coalesce(last_name, ''));
$$;

create index contacts_identity_name_trgm_idx
  on public.contacts using gin (
    public.identity_search_key(public.contact_identity_name(first_name, middle_name, last_name)) extensions.gin_trgm_ops
  );

create index contacts_identity_phone_idx
  on public.contacts (regexp_replace(coalesce(phone, ''), '[^0-9]+', '', 'g'))
  where phone is not null;

create index horses_identity_name_trgm_idx
  on public.horses using gin (public.identity_search_key(name) extensions.gin_trgm_ops);

create index horses_identity_registration_idx
  on public.horses (public.identity_search_key(registration_number))
  where registration_number is not null;

create table public.contact_similarity_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  existing_contact_id uuid not null references public.contacts(id) on delete cascade,
  candidate_signature text not null,
  reason text,
  algorithm_version text not null default 'identity-v1',
  dismissed_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, existing_contact_id, candidate_signature, algorithm_version)
);

create table public.horse_similarity_dismissals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  existing_horse_id uuid not null references public.horses(id) on delete cascade,
  candidate_signature text not null,
  reason text,
  algorithm_version text not null default 'identity-v1',
  dismissed_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, existing_horse_id, candidate_signature, algorithm_version)
);

alter table public.contact_similarity_dismissals enable row level security;
alter table public.horse_similarity_dismissals enable row level security;

create or replace function public.can_search_global_identities(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or public.is_org_member(target_organization_id, array['admin', 'secretary']);
$$;

create or replace function public.search_contact_identity_candidates(
  target_organization_id uuid,
  target_first_name text,
  target_middle_name text,
  target_last_name text,
  target_email text,
  target_phone text,
  target_date_of_birth date,
  result_limit integer default 5
)
returns table (
  contact_id uuid,
  first_name text,
  middle_name text,
  last_name text,
  date_of_birth date,
  email_hint text,
  phone_hint text,
  email_exact boolean,
  phone_exact boolean,
  name_similarity real,
  already_linked boolean,
  search_signature text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_name text := public.identity_search_key(public.contact_identity_name(target_first_name, target_middle_name, target_last_name));
  normalized_email text := lower(nullif(btrim(target_email), ''));
  normalized_phone text := regexp_replace(coalesce(target_phone, ''), '[^0-9]+', '', 'g');
  identity_signature text;
  returned_count integer;
begin
  if not public.can_search_global_identities(target_organization_id) then
    raise exception 'Global identity search is reserved for association staff.'
      using errcode = 'insufficient_privilege';
  end if;

  identity_signature := md5(concat_ws('|', normalized_name, normalized_email, normalized_phone, coalesce(target_date_of_birth::text, '')));

  return query
  select
    contact.id,
    contact.first_name::text,
    contact.middle_name::text,
    contact.last_name::text,
    contact.date_of_birth,
    case
      when contact.email is null then null
      when position('@' in contact.email) > 1 then left(contact.email, 1) || '***@' || split_part(contact.email, '@', 2)
      else left(contact.email, 1) || '***'
    end,
    case when contact.phone is null then null else '***' || right(regexp_replace(contact.phone, '[^0-9]+', '', 'g'), 4) end,
    normalized_email is not null and lower(btrim(coalesce(contact.email, ''))) = normalized_email,
    length(normalized_phone) >= 7 and regexp_replace(coalesce(contact.phone, ''), '[^0-9]+', '', 'g') = normalized_phone,
    extensions.similarity(
      public.identity_search_key(public.contact_identity_name(contact.first_name, contact.middle_name, contact.last_name)),
      normalized_name
    ),
    public.contact_is_linked_to_org(contact.id, target_organization_id),
    identity_signature
  from public.contacts contact
  where not exists (
      select 1
      from public.contact_similarity_dismissals dismissal
      where dismissal.organization_id = target_organization_id
        and dismissal.existing_contact_id = contact.id
        and dismissal.candidate_signature = identity_signature
        and dismissal.algorithm_version = 'identity-v1'
    )
    and (
      (normalized_email is not null and lower(btrim(coalesce(contact.email, ''))) = normalized_email)
      or (length(normalized_phone) >= 7 and regexp_replace(coalesce(contact.phone, ''), '[^0-9]+', '', 'g') = normalized_phone)
      or (
        normalized_name <> ''
        and extensions.similarity(
          public.identity_search_key(public.contact_identity_name(contact.first_name, contact.middle_name, contact.last_name)),
          normalized_name
        ) >= 0.35
      )
    )
  order by
    (normalized_email is not null and lower(btrim(coalesce(contact.email, ''))) = normalized_email) desc,
    (length(normalized_phone) >= 7 and regexp_replace(coalesce(contact.phone, ''), '[^0-9]+', '', 'g') = normalized_phone) desc,
    extensions.similarity(
      public.identity_search_key(public.contact_identity_name(contact.first_name, contact.middle_name, contact.last_name)),
      normalized_name
    ) desc,
    contact.created_at
  limit least(greatest(coalesce(result_limit, 5), 1), 10);

  get diagnostics returned_count = row_count;
  insert into public.app_events (event_type, event_name, association_id, actor_user_id, metadata)
  values ('audit', 'global_contact_similarity_search', target_organization_id::text, auth.uid(), jsonb_build_object('candidate_count', returned_count, 'signature', identity_signature));
end;
$$;

create or replace function public.search_horse_identity_candidates(
  target_organization_id uuid,
  target_name text,
  target_registration_number text,
  target_date_of_birth date,
  target_birth_year integer,
  target_gender text,
  target_owner_contact_id uuid,
  result_limit integer default 5
)
returns table (
  horse_id uuid,
  name text,
  registration_number text,
  date_of_birth date,
  birth_year integer,
  gender text,
  primary_owner_contact_id uuid,
  name_similarity real,
  registration_exact boolean,
  already_linked boolean,
  search_signature text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized_name text := public.identity_search_key(target_name);
  normalized_registration text := public.identity_search_key(target_registration_number);
  identity_signature text;
  returned_count integer;
begin
  if not public.can_search_global_identities(target_organization_id) then
    raise exception 'Global identity search is reserved for association staff.'
      using errcode = 'insufficient_privilege';
  end if;

  identity_signature := md5(concat_ws(
    '|',
    normalized_name,
    normalized_registration,
    coalesce(target_date_of_birth::text, target_birth_year::text, ''),
    coalesce(target_gender, ''),
    coalesce(target_owner_contact_id::text, '')
  ));

  return query
  select
    horse.id,
    horse.name::text,
    horse.registration_number::text,
    horse.date_of_birth,
    horse.birth_year::integer,
    horse.gender::text,
    horse.primary_owner_contact_id,
    extensions.similarity(public.identity_search_key(horse.name), normalized_name),
    normalized_registration <> '' and public.identity_search_key(horse.registration_number) = normalized_registration,
    public.horse_is_linked_to_org(horse.id, target_organization_id),
    identity_signature
  from public.horses horse
  where not exists (
      select 1
      from public.horse_similarity_dismissals dismissal
      where dismissal.organization_id = target_organization_id
        and dismissal.existing_horse_id = horse.id
        and dismissal.candidate_signature = identity_signature
        and dismissal.algorithm_version = 'identity-v1'
    )
    and (
      (normalized_registration <> '' and public.identity_search_key(horse.registration_number) = normalized_registration)
      or (
        normalized_name <> ''
        and extensions.similarity(public.identity_search_key(horse.name), normalized_name) >= 0.35
      )
    )
  order by
    (normalized_registration <> '' and public.identity_search_key(horse.registration_number) = normalized_registration) desc,
    extensions.similarity(public.identity_search_key(horse.name), normalized_name) desc,
    horse.created_at
  limit least(greatest(coalesce(result_limit, 5), 1), 10);

  get diagnostics returned_count = row_count;
  insert into public.app_events (event_type, event_name, association_id, actor_user_id, metadata)
  values ('audit', 'global_horse_similarity_search', target_organization_id::text, auth.uid(), jsonb_build_object('candidate_count', returned_count, 'signature', identity_signature));
end;
$$;

create or replace function public.dismiss_contact_identity_candidate(
  target_organization_id uuid,
  target_contact_id uuid,
  target_signature text,
  target_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_search_global_identities(target_organization_id) then
    raise exception 'Only association staff can dismiss identity candidates.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.contact_similarity_dismissals (
    organization_id, existing_contact_id, candidate_signature, reason, dismissed_by_user_id
  ) values (
    target_organization_id, target_contact_id, target_signature, nullif(btrim(target_reason), ''), public.current_profile_id()
  )
  on conflict (organization_id, existing_contact_id, candidate_signature, algorithm_version) do update
  set reason = excluded.reason,
      dismissed_by_user_id = excluded.dismissed_by_user_id,
      created_at = now();
end;
$$;

create or replace function public.dismiss_horse_identity_candidate(
  target_organization_id uuid,
  target_horse_id uuid,
  target_signature text,
  target_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_search_global_identities(target_organization_id) then
    raise exception 'Only association staff can dismiss identity candidates.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.horse_similarity_dismissals (
    organization_id, existing_horse_id, candidate_signature, reason, dismissed_by_user_id
  ) values (
    target_organization_id, target_horse_id, target_signature, nullif(btrim(target_reason), ''), public.current_profile_id()
  )
  on conflict (organization_id, existing_horse_id, candidate_signature, algorithm_version) do update
  set reason = excluded.reason,
      dismissed_by_user_id = excluded.dismissed_by_user_id,
      created_at = now();
end;
$$;

grant execute on function public.can_search_global_identities(uuid) to authenticated;
grant execute on function public.search_contact_identity_candidates(uuid, text, text, text, text, text, date, integer) to authenticated;
grant execute on function public.search_horse_identity_candidates(uuid, text, text, date, integer, text, uuid, integer) to authenticated;
grant execute on function public.dismiss_contact_identity_candidate(uuid, uuid, text, text) to authenticated;
grant execute on function public.dismiss_horse_identity_candidate(uuid, uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
