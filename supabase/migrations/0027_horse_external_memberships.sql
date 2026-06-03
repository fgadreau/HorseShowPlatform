create table if not exists public.horse_external_memberships (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references public.horses(id) on delete cascade,
  external_organization_id uuid not null references public.external_organizations(id) on delete cascade,
  reference_type varchar(100) not null default 'competition_license' check (reference_type in ('competition_license', 'registration', 'membership', 'other')),
  reference_number varchar(100) not null,
  status varchar(50) not null default 'unknown' check (status in ('active', 'pending', 'expired', 'unknown')),
  expires_on date,
  verified_at timestamptz,
  verification_source varchar(100),
  verification_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (horse_id, external_organization_id, reference_type)
);

create index if not exists idx_horse_external_memberships_horse_id
on public.horse_external_memberships(horse_id);

create index if not exists idx_horse_external_memberships_external_org_id
on public.horse_external_memberships(external_organization_id);

drop trigger if exists horse_external_memberships_touch_updated_at on public.horse_external_memberships;
create trigger horse_external_memberships_touch_updated_at
before update on public.horse_external_memberships
for each row execute function public.touch_updated_at();

alter table public.horse_external_memberships enable row level security;

drop policy if exists "Staff and linked users can view horse external memberships" on public.horse_external_memberships;
create policy "Staff and linked users can view horse external memberships"
  on public.horse_external_memberships for select
  using (
    public.is_platform_admin()
    or public.can_access_horse(horse_id)
    or exists (
      select 1
      from public.horse_organization_links hol
      where hol.horse_id = public.horse_external_memberships.horse_id
        and public.is_org_member(hol.organization_id, array['admin', 'secretary'])
    )
  );

drop policy if exists "Staff and linked users can manage horse external memberships" on public.horse_external_memberships;
create policy "Staff and linked users can manage horse external memberships"
  on public.horse_external_memberships for all
  using (
    public.is_platform_admin()
    or public.can_access_horse(horse_id)
    or exists (
      select 1
      from public.horse_organization_links hol
      where hol.horse_id = public.horse_external_memberships.horse_id
        and public.is_org_member(hol.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.is_platform_admin()
    or public.can_access_horse(horse_id)
    or exists (
      select 1
      from public.horse_organization_links hol
      where hol.horse_id = public.horse_external_memberships.horse_id
        and public.is_org_member(hol.organization_id, array['admin', 'secretary'])
    )
  );
