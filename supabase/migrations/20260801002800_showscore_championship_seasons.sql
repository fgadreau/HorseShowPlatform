-- Persist ShowScore championship administration and its published public
-- snapshot in the shared HSP database.

create or replace function public.showscore_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.showscore_current_user_can_manage_organization(
  target_organization_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      public.is_platform_admin()
      or exists (
        select 1
        from public.organization_members membership
        where membership.organization_id::text = target_organization_id
          and membership.user_id = auth.uid()
          and membership.role in ('admin', 'secretary')
      )
    );
$$;

create table if not exists public.show_score_championship_seasons (
  id text primary key,
  organization_id text not null,
  title text not null default '',
  season_year text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'final')),
  season_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_show_score_championship_seasons_org_updated
  on public.show_score_championship_seasons (organization_id, updated_at desc);

drop trigger if exists show_score_championship_seasons_touch_updated_at
  on public.show_score_championship_seasons;
create trigger show_score_championship_seasons_touch_updated_at
  before update on public.show_score_championship_seasons
  for each row execute function public.showscore_set_updated_at();

create table if not exists public.show_score_public_championship_seasons (
  season_id text primary key,
  organization_id text not null,
  title text not null default '',
  season_year text not null default '',
  status text not null
    check (status in ('published', 'final')),
  public_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_show_score_public_championship_seasons_org_updated
  on public.show_score_public_championship_seasons (organization_id, updated_at desc);

drop trigger if exists show_score_public_championship_seasons_touch_updated_at
  on public.show_score_public_championship_seasons;
create trigger show_score_public_championship_seasons_touch_updated_at
  before update on public.show_score_public_championship_seasons
  for each row execute function public.showscore_set_updated_at();

alter table public.show_score_championship_seasons enable row level security;
alter table public.show_score_public_championship_seasons enable row level security;

drop policy if exists "ShowScore managers read championship seasons"
  on public.show_score_championship_seasons;
create policy "ShowScore managers read championship seasons"
  on public.show_score_championship_seasons for select to authenticated
  using (public.showscore_current_user_can_manage_organization(organization_id));

drop policy if exists "ShowScore managers insert championship seasons"
  on public.show_score_championship_seasons;
create policy "ShowScore managers insert championship seasons"
  on public.show_score_championship_seasons for insert to authenticated
  with check (public.showscore_current_user_can_manage_organization(organization_id));

drop policy if exists "ShowScore managers update championship seasons"
  on public.show_score_championship_seasons;
create policy "ShowScore managers update championship seasons"
  on public.show_score_championship_seasons for update to authenticated
  using (public.showscore_current_user_can_manage_organization(organization_id))
  with check (public.showscore_current_user_can_manage_organization(organization_id));

drop policy if exists "ShowScore managers delete championship seasons"
  on public.show_score_championship_seasons;
create policy "ShowScore managers delete championship seasons"
  on public.show_score_championship_seasons for delete to authenticated
  using (public.showscore_current_user_can_manage_organization(organization_id));

drop policy if exists "Anyone can read published championship seasons"
  on public.show_score_public_championship_seasons;
create policy "Anyone can read published championship seasons"
  on public.show_score_public_championship_seasons for select to anon, authenticated
  using (status in ('published', 'final'));

drop policy if exists "ShowScore managers insert public championship seasons"
  on public.show_score_public_championship_seasons;
create policy "ShowScore managers insert public championship seasons"
  on public.show_score_public_championship_seasons for insert to authenticated
  with check (
    status in ('published', 'final')
    and public.showscore_current_user_can_manage_organization(organization_id)
  );

drop policy if exists "ShowScore managers update public championship seasons"
  on public.show_score_public_championship_seasons;
create policy "ShowScore managers update public championship seasons"
  on public.show_score_public_championship_seasons for update to authenticated
  using (public.showscore_current_user_can_manage_organization(organization_id))
  with check (
    status in ('published', 'final')
    and public.showscore_current_user_can_manage_organization(organization_id)
  );

drop policy if exists "ShowScore managers delete public championship seasons"
  on public.show_score_public_championship_seasons;
create policy "ShowScore managers delete public championship seasons"
  on public.show_score_public_championship_seasons for delete to authenticated
  using (public.showscore_current_user_can_manage_organization(organization_id));

grant select, insert, update, delete
  on public.show_score_championship_seasons to authenticated;
grant select
  on public.show_score_public_championship_seasons to anon, authenticated;
grant insert, update, delete
  on public.show_score_public_championship_seasons to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'show_score_public_championship_seasons'
  ) then
    alter publication supabase_realtime
      add table public.show_score_public_championship_seasons;
  end if;
end;
$$;

notify pgrst, 'reload schema';
