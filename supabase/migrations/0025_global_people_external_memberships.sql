create table if not exists public.contact_organization_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  source varchar(50) not null default 'manual' check (source in ('manual', 'created_here', 'claimed_account', 'entry', 'reservation', 'horse')),
  created_by_user_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, contact_id)
);

create table if not exists public.horse_organization_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  horse_id uuid not null references public.horses(id) on delete cascade,
  source varchar(50) not null default 'manual' check (source in ('manual', 'created_here', 'entry', 'reservation')),
  created_by_user_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, horse_id)
);

create table if not exists public.external_organizations (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) unique not null,
  name varchar(255) not null,
  verification_provider varchar(100),
  verification_url text,
  verification_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_external_membership_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_organization_id uuid not null references public.external_organizations(id) on delete cascade,
  contact_type varchar(50) not null default 'rider' check (contact_type in ('owner', 'agent', 'rider', 'payer', 'other')),
  is_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_organization_id, contact_type)
);

create table if not exists public.contact_external_memberships (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  external_organization_id uuid not null references public.external_organizations(id) on delete cascade,
  membership_number varchar(100) not null,
  status varchar(50) not null default 'active' check (status in ('active', 'pending', 'expired', 'unknown')),
  expires_on date,
  verified_at timestamptz,
  verification_source varchar(100),
  verification_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, external_organization_id)
);

create index if not exists idx_contact_organization_links_org_id
on public.contact_organization_links(organization_id);

create index if not exists idx_contact_organization_links_contact_id
on public.contact_organization_links(contact_id);

create index if not exists idx_horse_organization_links_org_id
on public.horse_organization_links(organization_id);

create index if not exists idx_horse_organization_links_horse_id
on public.horse_organization_links(horse_id);

create index if not exists idx_contact_external_memberships_contact_id
on public.contact_external_memberships(contact_id);

insert into public.contact_organization_links (organization_id, contact_id, source, created_by_user_id, created_at)
select organization_id, id, 'created_here', created_by_user_id, created_at
from public.contacts
on conflict (organization_id, contact_id) do nothing;

insert into public.horse_organization_links (organization_id, horse_id, source, created_by_user_id, created_at)
select organization_id, id, 'created_here', created_by_user_id, created_at
from public.horses
on conflict (organization_id, horse_id) do nothing;

insert into public.external_organizations (code, name)
values
  ('NRHA', 'National Reining Horse Association'),
  ('AQR', 'Association Quebec Reining'),
  ('AQHA', 'American Quarter Horse Association')
on conflict (code) do update
set name = excluded.name,
    updated_at = now();

insert into public.external_organizations (code, name)
select code, name
from public.sanctioning_bodies
on conflict (code) do update
set name = excluded.name,
    updated_at = now();

drop trigger if exists contact_organization_links_touch_updated_at on public.contact_organization_links;
create trigger contact_organization_links_touch_updated_at
before update on public.contact_organization_links
for each row execute function public.touch_updated_at();

drop trigger if exists horse_organization_links_touch_updated_at on public.horse_organization_links;
create trigger horse_organization_links_touch_updated_at
before update on public.horse_organization_links
for each row execute function public.touch_updated_at();

drop trigger if exists external_organizations_touch_updated_at on public.external_organizations;
create trigger external_organizations_touch_updated_at
before update on public.external_organizations
for each row execute function public.touch_updated_at();

drop trigger if exists organization_external_membership_requirements_touch_updated_at on public.organization_external_membership_requirements;
create trigger organization_external_membership_requirements_touch_updated_at
before update on public.organization_external_membership_requirements
for each row execute function public.touch_updated_at();

drop trigger if exists contact_external_memberships_touch_updated_at on public.contact_external_memberships;
create trigger contact_external_memberships_touch_updated_at
before update on public.contact_external_memberships
for each row execute function public.touch_updated_at();

create or replace function public.contact_is_linked_to_org(
  target_contact_id uuid,
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contacts c
    where c.id = target_contact_id
      and c.organization_id = target_organization_id
  )
  or exists (
    select 1
    from public.contact_organization_links col
    where col.contact_id = target_contact_id
      and col.organization_id = target_organization_id
  )
$$;

create or replace function public.horse_is_linked_to_org(
  target_horse_id uuid,
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.horses h
    where h.id = target_horse_id
      and h.organization_id = target_organization_id
  )
  or exists (
    select 1
    from public.horse_organization_links hol
    where hol.horse_id = target_horse_id
      and hol.organization_id = target_organization_id
  )
$$;

create or replace function public.has_linked_contact_in_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contacts c
    where c.linked_user_id = public.current_profile_id()
      and public.contact_is_linked_to_org(c.id, target_organization_id)
  )
$$;

create or replace function public.can_access_contact(target_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contacts c
    where c.id = target_contact_id
      and c.linked_user_id = public.current_profile_id()
  )
$$;

create or replace function public.can_access_horse(target_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.horse_contacts hc
    join public.contacts c on c.id = hc.contact_id
    where hc.horse_id = target_horse_id
      and c.linked_user_id = public.current_profile_id()
  )
$$;

create or replace function public.set_contact_role_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  contact_org_id uuid;
  target_org_id uuid;
begin
  select organization_id into contact_org_id
  from public.contacts
  where id = new.contact_id;

  if contact_org_id is null then
    raise exception 'Contact role contact does not exist';
  end if;

  target_org_id := coalesce(new.organization_id, contact_org_id);

  if not public.contact_is_linked_to_org(new.contact_id, target_org_id) then
    raise exception 'Contact role contact % is not linked to organization %', new.contact_id, target_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := target_org_id;
  return new;
end;
$$;

create or replace function public.set_horse_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_org_id uuid;
  target_org_id uuid;
begin
  select organization_id into owner_org_id
  from public.contacts
  where id = new.primary_owner_contact_id;

  if not found then
    raise exception 'Primary owner contact % does not exist', new.primary_owner_contact_id using errcode = 'foreign_key_violation';
  end if;

  target_org_id := coalesce(new.organization_id, owner_org_id);

  if not public.contact_is_linked_to_org(new.primary_owner_contact_id, target_org_id) then
    raise exception 'Primary owner contact % is not linked to horse organization %', new.primary_owner_contact_id, target_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := target_org_id;
  return new;
end;
$$;

create or replace function public.set_horse_contact_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  horse_org_id uuid;
begin
  select organization_id into horse_org_id
  from public.horses
  where id = new.horse_id;

  if not found then
    raise exception 'Horse % does not exist', new.horse_id using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.contacts where id = new.contact_id) then
    raise exception 'Contact % does not exist', new.contact_id using errcode = 'foreign_key_violation';
  end if;

  if not public.contact_is_linked_to_org(new.contact_id, horse_org_id) then
    raise exception 'Horse contact % is not linked to horse organization %', new.contact_id, horse_org_id
      using errcode = 'check_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from horse_org_id then
    raise exception 'Horse contact organization % does not match horse organization %', new.organization_id, horse_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := horse_org_id;
  return new;
end;
$$;

create or replace function public.set_entry_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_org_id uuid;
  division_record record;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.horses where id = new.horse_id) then
    raise exception 'Horse % does not exist', new.horse_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id, show_id into division_record
  from public.divisions
  where id = new.division_id;

  if not found then
    raise exception 'Division % does not exist', new.division_id using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.contacts where id = new.owner_contact_id) then
    raise exception 'Owner contact % does not exist', new.owner_contact_id using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.contacts where id = new.payer_contact_id) then
    raise exception 'Payer contact % does not exist', new.payer_contact_id using errcode = 'foreign_key_violation';
  end if;

  if new.rider_contact_id is not null
    and not exists (select 1 from public.contacts where id = new.rider_contact_id)
  then
    raise exception 'Rider contact % does not exist', new.rider_contact_id using errcode = 'foreign_key_violation';
  end if;

  if division_record.show_id is distinct from new.show_id
    or division_record.organization_id is distinct from show_org_id
  then
    raise exception 'Entry division must belong to the entry show'
      using errcode = 'check_violation';
  end if;

  if not public.horse_is_linked_to_org(new.horse_id, show_org_id)
    or not public.contact_is_linked_to_org(new.owner_contact_id, show_org_id)
    or not public.contact_is_linked_to_org(new.payer_contact_id, show_org_id)
    or (new.rider_contact_id is not null and not public.contact_is_linked_to_org(new.rider_contact_id, show_org_id))
  then
    raise exception 'Entry related records must be linked to the same organization as the show'
      using errcode = 'check_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Entry organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
  return new;
end;
$$;

create or replace function public.set_stall_booking_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_org_id uuid;
  option_record record;
  start_day record;
  end_day record;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id, show_id into option_record
  from public.stall_options
  where id = new.stall_option_id;

  if not found then
    raise exception 'Stall option % does not exist', new.stall_option_id using errcode = 'foreign_key_violation';
  end if;

  if option_record.show_id is distinct from new.show_id or option_record.organization_id is distinct from show_org_id then
    raise exception 'Stall option % does not belong to booking show %', new.stall_option_id, new.show_id
      using errcode = 'check_violation';
  end if;

  if new.horse_id is not null then
    if not exists (select 1 from public.horses where id = new.horse_id) then
      raise exception 'Horse % does not exist', new.horse_id using errcode = 'foreign_key_violation';
    end if;

    if not public.horse_is_linked_to_org(new.horse_id, show_org_id) then
      raise exception 'Booking horse % is not linked to show organization %', new.horse_id, show_org_id
        using errcode = 'check_violation';
    end if;
  end if;

  if not exists (select 1 from public.contacts where id = new.booker_contact_id) then
    raise exception 'Booker contact % does not exist', new.booker_contact_id using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.contacts where id = new.payer_contact_id) then
    raise exception 'Payer contact % does not exist', new.payer_contact_id using errcode = 'foreign_key_violation';
  end if;

  if not public.contact_is_linked_to_org(new.booker_contact_id, show_org_id)
    or not public.contact_is_linked_to_org(new.payer_contact_id, show_org_id)
  then
    raise exception 'Booking contacts must be linked to the same organization as the show'
      using errcode = 'check_violation';
  end if;

  select organization_id, show_id into start_day from public.show_days where id = new.show_day_start_id;
  if not found then
    raise exception 'Start show day % does not exist', new.show_day_start_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id, show_id into end_day from public.show_days where id = new.show_day_end_id;
  if not found then
    raise exception 'End show day % does not exist', new.show_day_end_id using errcode = 'foreign_key_violation';
  end if;

  if start_day.show_id is distinct from new.show_id
    or end_day.show_id is distinct from new.show_id
    or start_day.organization_id is distinct from show_org_id
    or end_day.organization_id is distinct from show_org_id
  then
    raise exception 'Booking show days must belong to the booking show'
      using errcode = 'check_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Booking organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
  return new;
end;
$$;

create or replace function public.set_invoice_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_org_id uuid;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.contacts where id = new.payer_contact_id) then
    raise exception 'Payer contact % does not exist', new.payer_contact_id using errcode = 'foreign_key_violation';
  end if;

  if not public.contact_is_linked_to_org(new.payer_contact_id, show_org_id) then
    raise exception 'Invoice payer % is not linked to show organization %', new.payer_contact_id, show_org_id
      using errcode = 'check_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Invoice organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
  return new;
end;
$$;

alter table public.contact_organization_links enable row level security;
alter table public.horse_organization_links enable row level security;
alter table public.external_organizations enable row level security;
alter table public.organization_external_membership_requirements enable row level security;
alter table public.contact_external_memberships enable row level security;

drop policy if exists "Staff and linked users can view contact organization links" on public.contact_organization_links;
create policy "Staff and linked users can view contact organization links"
  on public.contact_organization_links for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_contact(contact_id)
  );

drop policy if exists "Staff and linked users can create contact organization links" on public.contact_organization_links;
create policy "Staff and linked users can create contact organization links"
  on public.contact_organization_links for insert
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_contact(contact_id)
  );

drop policy if exists "Staff and linked users can update contact organization links" on public.contact_organization_links;
create policy "Staff and linked users can update contact organization links"
  on public.contact_organization_links for update
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_contact(contact_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_contact(contact_id)
  );

drop policy if exists "Staff and linked users can view horse organization links" on public.horse_organization_links;
create policy "Staff and linked users can view horse organization links"
  on public.horse_organization_links for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_horse(horse_id)
  );

drop policy if exists "Staff and linked users can create horse organization links" on public.horse_organization_links;
create policy "Staff and linked users can create horse organization links"
  on public.horse_organization_links for insert
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_horse(horse_id)
  );

drop policy if exists "Staff and linked users can update horse organization links" on public.horse_organization_links;
create policy "Staff and linked users can update horse organization links"
  on public.horse_organization_links for update
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_horse(horse_id)
  )
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_horse(horse_id)
  );

drop policy if exists "Authenticated users can view external organizations" on public.external_organizations;
create policy "Authenticated users can view external organizations"
  on public.external_organizations for select
  using (auth.uid() is not null);

drop policy if exists "Organization admins manage external organizations" on public.external_organizations;
create policy "Organization admins manage external organizations"
  on public.external_organizations for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "Members can view external membership requirements" on public.organization_external_membership_requirements;
create policy "Members can view external membership requirements"
  on public.organization_external_membership_requirements for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id)
    or public.has_linked_contact_in_org(organization_id)
  );

drop policy if exists "Admins manage external membership requirements" on public.organization_external_membership_requirements;
create policy "Admins manage external membership requirements"
  on public.organization_external_membership_requirements for all
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin']));

drop policy if exists "Staff and linked users can view contact external memberships" on public.contact_external_memberships;
create policy "Staff and linked users can view contact external memberships"
  on public.contact_external_memberships for select
  using (
    public.is_platform_admin()
    or public.can_access_contact(contact_id)
    or exists (
      select 1
      from public.contact_organization_links col
      where col.contact_id = public.contact_external_memberships.contact_id
        and public.is_org_member(col.organization_id, array['admin', 'secretary'])
    )
  );

drop policy if exists "Staff and linked users can manage contact external memberships" on public.contact_external_memberships;
create policy "Staff and linked users can manage contact external memberships"
  on public.contact_external_memberships for all
  using (
    public.is_platform_admin()
    or public.can_access_contact(contact_id)
    or exists (
      select 1
      from public.contact_organization_links col
      where col.contact_id = public.contact_external_memberships.contact_id
        and public.is_org_member(col.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.is_platform_admin()
    or public.can_access_contact(contact_id)
    or exists (
      select 1
      from public.contact_organization_links col
      where col.contact_id = public.contact_external_memberships.contact_id
        and public.is_org_member(col.organization_id, array['admin', 'secretary'])
    )
  );

drop policy if exists "Staff and linked users can view contacts" on public.contacts;
create policy "Staff and linked users can view contacts"
  on public.contacts for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or linked_user_id = public.current_profile_id()
    or exists (
      select 1
      from public.contact_organization_links col
      where col.contact_id = id
        and public.is_org_member(col.organization_id, array['admin', 'secretary'])
    )
  );

drop policy if exists "Staff and related users can view horses" on public.horses;
create policy "Staff and related users can view horses"
  on public.horses for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_horse(id)
    or exists (
      select 1
      from public.horse_organization_links hol
      where hol.horse_id = id
        and public.is_org_member(hol.organization_id, array['admin', 'secretary'])
    )
  );
