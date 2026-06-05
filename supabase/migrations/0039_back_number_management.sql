create table if not exists public.organization_back_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  number integer not null check (number > 0),
  status varchar(30) not null default 'available' check (status in ('available', 'assigned', 'reserved', 'lost', 'retired')),
  assignment_mode varchar(30) not null default 'horse' check (assignment_mode in ('horse', 'horse_rider_team')),
  assigned_horse_id uuid references public.horses(id) on delete set null,
  assigned_rider_contact_id uuid references public.contacts(id) on delete set null,
  assigned_at timestamptz,
  created_by_user_id uuid references public.user_profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number),
  check (
    status <> 'assigned'
    or (
      assigned_horse_id is not null
      and (
        assignment_mode = 'horse'
        or assigned_rider_contact_id is not null
      )
    )
  )
);

create index if not exists idx_organization_back_numbers_org_id
on public.organization_back_numbers(organization_id);

create index if not exists idx_organization_back_numbers_horse_id
on public.organization_back_numbers(assigned_horse_id);

create index if not exists idx_organization_back_numbers_rider_contact_id
on public.organization_back_numbers(assigned_rider_contact_id);

create unique index if not exists idx_unique_active_horse_back_number_assignment
on public.organization_back_numbers(organization_id, assigned_horse_id)
where status = 'assigned'
  and assignment_mode = 'horse'
  and assigned_horse_id is not null;

create unique index if not exists idx_unique_active_team_back_number_assignment
on public.organization_back_numbers(organization_id, assigned_horse_id, assigned_rider_contact_id)
where status = 'assigned'
  and assignment_mode = 'horse_rider_team'
  and assigned_horse_id is not null
  and assigned_rider_contact_id is not null;

drop trigger if exists organization_back_numbers_touch_updated_at on public.organization_back_numbers;
create trigger organization_back_numbers_touch_updated_at
before update on public.organization_back_numbers
for each row execute function public.touch_updated_at();

alter table public.organization_back_numbers enable row level security;

drop policy if exists "Staff and related users can view organization back numbers" on public.organization_back_numbers;
create policy "Staff and related users can view organization back numbers"
  on public.organization_back_numbers for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or (assigned_horse_id is not null and public.can_access_horse(assigned_horse_id))
    or (assigned_rider_contact_id is not null and public.can_access_contact(assigned_rider_contact_id))
  );

drop policy if exists "Organization staff can create organization back numbers" on public.organization_back_numbers;
create policy "Organization staff can create organization back numbers"
  on public.organization_back_numbers for insert
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
  );

drop policy if exists "Organization staff can update organization back numbers" on public.organization_back_numbers;
create policy "Organization staff can update organization back numbers"
  on public.organization_back_numbers for update
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
  )
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
  );

drop policy if exists "Organization staff can delete organization back numbers" on public.organization_back_numbers;
create policy "Organization staff can delete organization back numbers"
  on public.organization_back_numbers for delete
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
  );
