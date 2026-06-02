create table if not exists public.contact_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role varchar(50) not null check (role in ('owner', 'agent', 'rider', 'payer', 'booker', 'other')),
  source varchar(50) not null default 'manual' check (source in ('manual', 'contact_type', 'horse', 'entry', 'reservation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, contact_id, role)
);

create index if not exists idx_contact_roles_org_id on public.contact_roles(organization_id);
create index if not exists idx_contact_roles_contact_id on public.contact_roles(contact_id);
create index if not exists idx_contact_roles_role on public.contact_roles(role);

create or replace function public.set_contact_role_organization()
returns trigger
language plpgsql
as $$
declare
  contact_org_id uuid;
begin
  select organization_id into contact_org_id
  from public.contacts
  where id = new.contact_id;

  if contact_org_id is null then
    raise exception 'Contact role contact does not exist';
  end if;

  new.organization_id = contact_org_id;
  return new;
end;
$$;

drop trigger if exists contact_roles_set_organization on public.contact_roles;
create trigger contact_roles_set_organization
before insert or update on public.contact_roles
for each row execute function public.set_contact_role_organization();

drop trigger if exists contact_roles_touch_updated_at on public.contact_roles;
create trigger contact_roles_touch_updated_at
before update on public.contact_roles
for each row execute function public.touch_updated_at();

alter table public.contact_roles enable row level security;

drop policy if exists "Staff and linked users can view contact roles" on public.contact_roles;
create policy "Staff and linked users can view contact roles"
  on public.contact_roles for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_contact(contact_id)
  );

drop policy if exists "Staff and linked users can create contact roles" on public.contact_roles;
create policy "Staff and linked users can create contact roles"
  on public.contact_roles for insert
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_contact(contact_id)
  );

drop policy if exists "Staff and linked users can update contact roles" on public.contact_roles;
create policy "Staff and linked users can update contact roles"
  on public.contact_roles for update
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

drop policy if exists "Staff can delete contact roles" on public.contact_roles;
create policy "Staff can delete contact roles"
  on public.contact_roles for delete
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

insert into public.contact_roles (organization_id, contact_id, role, source)
select organization_id, id, type, 'contact_type'
from public.contacts
on conflict (organization_id, contact_id, role) do nothing;

insert into public.contact_roles (organization_id, contact_id, role, source)
select organization_id, primary_owner_contact_id, 'owner', 'horse'
from public.horses
on conflict (organization_id, contact_id, role) do nothing;

insert into public.contact_roles (organization_id, contact_id, role, source)
select organization_id, owner_contact_id, 'owner', 'entry'
from public.entries
on conflict (organization_id, contact_id, role) do nothing;

insert into public.contact_roles (organization_id, contact_id, role, source)
select organization_id, rider_contact_id, 'rider', 'entry'
from public.entries
where rider_contact_id is not null
on conflict (organization_id, contact_id, role) do nothing;

insert into public.contact_roles (organization_id, contact_id, role, source)
select organization_id, payer_contact_id, 'payer', 'entry'
from public.entries
on conflict (organization_id, contact_id, role) do nothing;

insert into public.contact_roles (organization_id, contact_id, role, source)
select organization_id, booker_contact_id, 'booker', 'reservation'
from public.stall_bookings
on conflict (organization_id, contact_id, role) do nothing;

insert into public.contact_roles (organization_id, contact_id, role, source)
select organization_id, payer_contact_id, 'payer', 'reservation'
from public.stall_bookings
on conflict (organization_id, contact_id, role) do nothing;
