create table if not exists public.horse_health_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  horse_id uuid not null references public.horses(id) on delete cascade,
  document_type varchar(50) not null check (document_type in ('coggins_eia', 'influenza_vaccine', 'rhino_vaccine', 'combo_vaccine', 'other')),
  status varchar(50) not null default 'pending_review' check (status in ('pending_review', 'verified', 'approved', 'rejected', 'expired')),
  verification_source varchar(50) not null default 'manual' check (verification_source in ('manual', 'gvl_qr', 'gvl_url', 'gvl_api', 'upload')),
  source_url text,
  document_url text,
  certificate_number varchar(120),
  issuer_name text,
  test_or_administered_on date,
  expires_on date,
  result varchar(120),
  horse_name text,
  horse_date_of_birth date,
  horse_external_id text,
  warnings text[] not null default '{}'::text[],
  payload jsonb not null default '{}'::jsonb,
  reviewed_by_user_id uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.horse_health_documents
add column if not exists horse_date_of_birth date;

create index if not exists idx_horse_health_documents_organization_id
on public.horse_health_documents(organization_id);

create index if not exists idx_horse_health_documents_horse_id
on public.horse_health_documents(horse_id);

create index if not exists idx_horse_health_documents_type_status
on public.horse_health_documents(document_type, status);

create unique index if not exists idx_horse_health_documents_unique_certificate
on public.horse_health_documents(horse_id, document_type, certificate_number)
where certificate_number is not null;

drop trigger if exists horse_health_documents_touch_updated_at on public.horse_health_documents;
create trigger horse_health_documents_touch_updated_at
before update on public.horse_health_documents
for each row execute function public.touch_updated_at();

alter table public.horse_health_documents enable row level security;

drop policy if exists "Staff and linked users can view horse health documents" on public.horse_health_documents;
create policy "Staff and linked users can view horse health documents"
  on public.horse_health_documents for select
  using (
    public.is_platform_admin()
    or public.can_access_horse(horse_id)
    or public.is_org_member(organization_id, array['admin', 'secretary'])
  );

drop policy if exists "Staff and linked users can manage horse health documents" on public.horse_health_documents;
drop policy if exists "Staff and linked users can create horse health documents" on public.horse_health_documents;
create policy "Staff and linked users can create horse health documents"
  on public.horse_health_documents for insert
  with check (
    public.is_platform_admin()
    or public.can_access_horse(horse_id)
    or public.is_org_member(organization_id, array['admin', 'secretary'])
  );

drop policy if exists "Association managers can review horse health documents" on public.horse_health_documents;
create policy "Association managers can review horse health documents"
  on public.horse_health_documents for update
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
  )
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
  );

drop policy if exists "Linked users can refresh GVL horse health documents" on public.horse_health_documents;
create policy "Linked users can refresh GVL horse health documents"
  on public.horse_health_documents for update
  using (
    public.can_access_horse(horse_id)
    and verification_source in ('gvl_qr', 'gvl_url', 'gvl_api')
    and status in ('pending_review', 'verified')
  )
  with check (
    public.can_access_horse(horse_id)
    and verification_source in ('gvl_qr', 'gvl_url', 'gvl_api')
    and status in ('pending_review', 'verified')
    and reviewed_by_user_id is null
    and reviewed_at is null
  );

drop policy if exists "Staff and linked users can delete horse health documents" on public.horse_health_documents;
create policy "Staff and linked users can delete horse health documents"
  on public.horse_health_documents for delete
  using (
    public.is_platform_admin()
    or public.can_access_horse(horse_id)
    or public.is_org_member(organization_id, array['admin', 'secretary'])
  );
