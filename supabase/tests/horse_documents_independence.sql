\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regclass('public.horse_documents') is null
    or (select relkind from pg_class where oid = 'public.horse_documents'::regclass) <> 'r'
    or to_regclass('public.horse_health_documents') is not null
  then
    raise exception 'horse_documents must be canonical and the old compatibility view must be removed';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'horse_documents' and column_name = 'organization_id'
  ) then
    raise exception 'horse documents cannot have an owning organization';
  end if;

  raise notice 'ok - horse documents are global horse-owned records';
end;
$$;

update public.horses
set registration_number = null,
    registration_status = 'grade'
where id = '80000000-0000-0000-0000-000000000002';

do $$
begin
  begin
    update public.horses
    set registration_number = 'NOT-ALLOWED'
    where id = '80000000-0000-0000-0000-000000000002';
    raise exception 'grade horse accepted a legacy registration number';
  exception when check_violation then
    null;
  end;

  raise notice 'ok - grade is an explicit unregistered status';
end;
$$;

insert into public.external_credential_issuers (
  id, code, name, issuer_type, country_code, is_active
)
values (
  '91000000-0000-0000-0000-000000000001', 'APHA_TEST', 'APHA Test Registry', 'breed_registry', 'US', true
)
on conflict (id) do nothing;

update public.horses
set registration_status = 'registered'
where id = '80000000-0000-0000-0000-000000000001';

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
  document_url,
  original_file_name,
  mime_type,
  file_size_bytes,
  content_sha256,
  uploaded_by_organization_id
)
values
  (
    '92000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    'registration',
    'breed_registration',
    'pending_review',
    'upload',
    (select id from public.external_credential_issuers where code = 'AQHA'),
    'AQHA-TEST-1',
    'Quarter Horse',
    '80000000-0000-0000-0000-000000000001/aqha.pdf',
    'aqha.pdf',
    'application/pdf',
    100,
    repeat('a', 64),
    '30000000-0000-0000-0000-000000000001'
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000001',
    'registration',
    'breed_registration',
    'pending_review',
    'upload',
    '91000000-0000-0000-0000-000000000001',
    'APHA-TEST-2',
    'Paint Horse',
    '80000000-0000-0000-0000-000000000001/apha.pdf',
    'apha.pdf',
    'application/pdf',
    110,
    repeat('b', 64),
    '30000000-0000-0000-0000-000000000002'
  );

do $$
begin
  if (select count(*) from public.horse_documents where horse_id = '80000000-0000-0000-0000-000000000001' and document_category = 'registration') <> 2 then
    raise exception 'horse did not retain documents from multiple breed registries';
  end if;

  if (select count(distinct uploaded_by_organization_id) from public.horse_documents where id in ('92000000-0000-0000-0000-000000000001', '92000000-0000-0000-0000-000000000002')) <> 2 then
    raise exception 'upload provenance was not preserved';
  end if;

  raise notice 'ok - one horse supports multiple breed registration documents without association ownership';
end;
$$;

do $$
begin
  begin
    update public.horse_documents
    set document_url = '80000000-0000-0000-0000-000000000001/replaced.pdf'
    where id = '92000000-0000-0000-0000-000000000001';
    raise exception 'immutable document file was replaced';
  exception when check_violation then
    null;
  end;

  raise notice 'ok - stored horse document files and checksums are immutable';
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'horse_documents'
      and policyname = 'Authorized users view horse documents'
  ) then
    raise exception 'horse document RLS is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authorized users can upload horse document files'
  ) then
    raise exception 'horse document storage policy is missing';
  end if;

  raise notice 'ok - document table and storage paths use horse access rules';
end;
$$;

rollback;
