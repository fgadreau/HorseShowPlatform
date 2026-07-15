-- Bloc 3 / S1: les documents appartiennent au cheval, jamais a une association.
-- Le meme depot accepte les documents de sante et les enregistrements de race.
-- Impact ShowScore: SS-0. Aucun objet, passage, score ou payload ShowScore n'est modifie.

drop policy if exists "Staff and linked users can view horse health documents" on public.horse_health_documents;
drop policy if exists "Staff and linked users can create horse health documents" on public.horse_health_documents;
drop policy if exists "Association managers can review horse health documents" on public.horse_health_documents;
drop policy if exists "Linked users can refresh GVL horse health documents" on public.horse_health_documents;
drop policy if exists "Staff and linked users can delete horse health documents" on public.horse_health_documents;

alter table public.horse_health_documents rename to horse_documents;

alter table public.horse_documents
  drop constraint if exists horse_health_documents_document_type_check;

alter table public.horse_documents
  add column document_category text not null default 'health',
  add column external_credential_issuer_id uuid references public.external_credential_issuers(id) on delete restrict,
  add column registration_number text,
  add column breed_name text,
  add column original_file_name text,
  add column mime_type text,
  add column file_size_bytes bigint,
  add column content_sha256 text,
  add column metadata jsonb not null default '{}'::jsonb,
  add column uploaded_by_organization_id uuid references public.organizations(id) on delete set null;

update public.horse_documents
set uploaded_by_organization_id = organization_id;

alter table public.horse_documents
  drop column organization_id,
  add constraint horse_documents_category_check
    check (document_category in ('health', 'registration', 'other')),
  add constraint horse_documents_type_check
    check (document_type in (
      'coggins_eia',
      'influenza_vaccine',
      'rhino_vaccine',
      'combo_vaccine',
      'breed_registration',
      'breed_pedigree',
      'ownership_certificate',
      'other'
    )),
  add constraint horse_documents_category_type_check
    check (
      (document_category = 'health' and document_type in ('coggins_eia', 'influenza_vaccine', 'rhino_vaccine', 'combo_vaccine', 'other'))
      or (document_category = 'registration' and document_type in ('breed_registration', 'breed_pedigree', 'ownership_certificate', 'other'))
      or document_category = 'other'
    ),
  add constraint horse_documents_file_size_check
    check (file_size_bytes is null or file_size_bytes >= 0),
  add constraint horse_documents_sha256_check
    check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint horse_documents_registration_context_check
    check (
      document_type <> 'breed_registration'
      or (
        document_category = 'registration'
        and external_credential_issuer_id is not null
        and nullif(btrim(registration_number), '') is not null
      )
    );

alter table public.horses
  add column registration_status text not null default 'unknown';

update public.horses horse
set registration_status = case
  when nullif(btrim(horse.registration_number), '') is not null
    or exists (
      select 1
      from public.horse_external_identifiers identifier
      where identifier.horse_id = horse.id
        and identifier.identifier_type = 'registration'
        and identifier.status not in ('revoked', 'inactive')
    )
  then 'registered'
  else 'unknown'
end;

alter table public.horses
  add constraint horses_registration_status_check
    check (registration_status in ('registered', 'grade', 'unknown')),
  add constraint horses_grade_has_no_legacy_registration_check
    check (registration_status <> 'grade' or registration_number is null);

create or replace function public.enforce_horse_document_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.horse_id is distinct from old.horse_id
    or new.document_category is distinct from old.document_category
    or new.document_type is distinct from old.document_type
    or new.external_credential_issuer_id is distinct from old.external_credential_issuer_id
    or new.registration_number is distinct from old.registration_number
    or new.breed_name is distinct from old.breed_name
  then
    raise exception 'Horse document identity and classification are immutable'
      using errcode = 'check_violation';
  end if;

  if old.document_url is not null and new.document_url is distinct from old.document_url then
    raise exception 'Horse document file path is immutable'
      using errcode = 'check_violation';
  end if;

  if old.content_sha256 is not null and new.content_sha256 is distinct from old.content_sha256 then
    raise exception 'Horse document checksum is immutable'
      using errcode = 'check_violation';
  end if;

  if old.original_file_name is not null and new.original_file_name is distinct from old.original_file_name then
    raise exception 'Horse document file name is immutable'
      using errcode = 'check_violation';
  end if;

  if old.mime_type is not null and new.mime_type is distinct from old.mime_type then
    raise exception 'Horse document MIME type is immutable'
      using errcode = 'check_violation';
  end if;

  if old.file_size_bytes is not null and new.file_size_bytes is distinct from old.file_size_bytes then
    raise exception 'Horse document file size is immutable'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists horse_health_documents_touch_updated_at on public.horse_documents;
drop trigger if exists horse_documents_touch_updated_at on public.horse_documents;
create trigger horse_documents_touch_updated_at
before update on public.horse_documents
for each row execute function public.touch_updated_at();

drop trigger if exists horse_documents_enforce_immutability on public.horse_documents;
create trigger horse_documents_enforce_immutability
before update on public.horse_documents
for each row execute function public.enforce_horse_document_immutability();

drop index if exists public.idx_horse_health_documents_organization_id;
drop index if exists public.idx_horse_health_documents_horse_id;
drop index if exists public.idx_horse_health_documents_type_status;
drop index if exists public.idx_horse_health_documents_unique_certificate;

create index idx_horse_documents_horse_id
  on public.horse_documents(horse_id);
create index idx_horse_documents_category_type_status
  on public.horse_documents(document_category, document_type, status);
create index idx_horse_documents_issuer_registration
  on public.horse_documents(external_credential_issuer_id, registration_number)
  where external_credential_issuer_id is not null and registration_number is not null;
create unique index idx_horse_documents_unique_certificate
  on public.horse_documents(horse_id, document_type, certificate_number)
  where certificate_number is not null;
create unique index idx_horse_documents_content_sha256
  on public.horse_documents(horse_id, content_sha256)
  where content_sha256 is not null;

alter table public.horse_documents enable row level security;

create policy "Authorized users view horse documents"
  on public.horse_documents for select
  to authenticated
  using (public.can_access_horse(horse_id));

create policy "Authorized users create horse documents"
  on public.horse_documents for insert
  to authenticated
  with check (
    public.can_access_horse(horse_id)
    and (created_by_user_id is null or created_by_user_id = public.current_profile_id() or public.is_platform_admin())
  );

create policy "Authorized users update horse document review data"
  on public.horse_documents for update
  to authenticated
  using (public.can_access_horse(horse_id))
  with check (public.can_access_horse(horse_id));

create policy "Identity managers delete unverified horse documents"
  on public.horse_documents for delete
  to authenticated
  using (
    public.is_platform_admin()
    or (public.can_manage_horse_identity(horse_id) and status = 'pending_review')
  );

grant select, insert, update, delete on public.horse_documents to authenticated;

drop policy if exists "Authenticated users can upload MVP files" on storage.objects;
create policy "Authenticated users can upload MVP files"
  on storage.objects for insert
  with check (
    auth.uid() is not null
    and bucket_id in ('organization-logos', 'show-documents', 'invoices')
  );

drop policy if exists "Staff and linked users can view health document files" on storage.objects;
drop policy if exists "Authorized users can view horse document files" on storage.objects;
create policy "Authorized users can view horse document files"
  on storage.objects for select
  using (
    bucket_id = 'horse-documents'
    and auth.uid() is not null
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.can_access_horse(split_part(name, '/', 1)::uuid)
  );

drop policy if exists "Authorized users can upload horse document files" on storage.objects;
create policy "Authorized users can upload horse document files"
  on storage.objects for insert
  with check (
    bucket_id = 'horse-documents'
    and auth.uid() is not null
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.can_access_horse(split_part(name, '/', 1)::uuid)
  );

comment on table public.horse_documents is
  'Immutable horse-owned source documents. Association context records provenance only and never owns the document.';
comment on column public.horses.registration_status is
  'registered = one or more registries may apply; grade = explicitly unregistered; unknown = not yet declared.';

-- Adaptateur de lecture temporaire pour les fonctions Coggins/vaccins creees
-- avant la table canonique. Il sera retire lorsque ces fonctions seront
-- reecrites dans les etapes de conformite par association.
create view public.horse_health_documents
with (security_invoker = true)
as
select
  id,
  uploaded_by_organization_id as organization_id,
  horse_id,
  document_type,
  status,
  verification_source,
  source_url,
  document_url,
  certificate_number,
  issuer_name,
  test_or_administered_on,
  expires_on,
  result,
  horse_name,
  horse_date_of_birth,
  horse_external_id,
  warnings,
  payload,
  reviewed_by_user_id,
  reviewed_at,
  review_notes,
  created_by_user_id,
  created_at,
  updated_at
from public.horse_documents
where document_category = 'health';

grant select on public.horse_health_documents to authenticated;

comment on view public.horse_health_documents is
  'Read-only compatibility view for legacy health functions; horse_documents is canonical.';
