create table if not exists public.show_announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  title varchar(255) not null,
  body text not null,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.show_announcements enable row level security;

create policy "show_announcements_public_read"
  on public.show_announcements for select
  using (true);

create policy "show_announcements_org_write"
  on public.show_announcements for insert
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

create policy "show_announcements_org_update"
  on public.show_announcements for update
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

create policy "show_announcements_org_delete"
  on public.show_announcements for delete
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));
