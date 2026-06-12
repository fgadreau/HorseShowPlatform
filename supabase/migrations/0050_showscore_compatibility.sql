-- ShowScore compatibility layer
-- Adds views, columns, and RPCs so ShowScore can use HSP's Supabase directly.

-- ─── 1. Columns missing from show_score_class_setups ────────────────────────
alter table public.show_score_class_setups
  add column if not exists block_classes jsonb not null default '[]'::jsonb,
  add column if not exists judge_name text,
  add column if not exists judge_signature text,
  add column if not exists judge_signed_at timestamptz;

-- ─── 2. claimed_by text on show_score_judge_sessions ────────────────────────
alter table public.show_score_judge_sessions
  add column if not exists claimed_by text;

-- ─── 3. planned_live_status on show_score_publication_states ────────────────
alter table public.show_score_publication_states
  add column if not exists planned_live_status text not null default 'live_scoring';

-- ─── 4. sponsor_logos + logo_data_url on organizations ──────────────────────
alter table public.organizations
  add column if not exists sponsor_logos jsonb not null default '[]'::jsonb;

-- logo_data_url as generated alias for logo_url
alter table public.organizations
  add column if not exists logo_data_url text generated always as (logo_url) stored;

-- ─── 5. livestream columns on shows ─────────────────────────────────────────
alter table public.shows
  add column if not exists livestream_url text,
  add column if not exists is_livestream_public boolean not null default false;

-- ─── 6. display_name on user_profiles ───────────────────────────────────────
alter table public.user_profiles
  add column if not exists display_name text;

-- ─── 7. Auto-generate show slug via trigger ──────────────────────────────────
create or replace function public.ensure_show_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := lower(regexp_replace(coalesce(new.name, ''), '[^a-zA-Z0-9]+', '-', 'g'))
                || '-' || substring(new.id::text, 1, 8);
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_show_slug_trigger on public.shows;
create trigger ensure_show_slug_trigger
  before insert or update on public.shows
  for each row execute function public.ensure_show_slug();

-- Auto-generate org slug
create or replace function public.ensure_org_slug()
returns trigger language plpgsql as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := lower(regexp_replace(coalesce(new.name, ''), '[^a-zA-Z0-9]+', '-', 'g'))
                || '-' || substring(new.id::text, 1, 8);
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_org_slug_trigger on public.organizations;
create trigger ensure_org_slug_trigger
  before insert or update on public.organizations
  for each row execute function public.ensure_org_slug();

-- ─── 8. class_result_publications table ─────────────────────────────────────
create table if not exists public.class_result_publications (
  class_id uuid primary key references public.classes(id) on delete cascade,
  status text not null default 'hidden' check (status in ('hidden', 'published')),
  published_at timestamptz,
  published_by text,
  result_groups jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.class_result_publications enable row level security;

-- ─── 9. associations VIEW over organizations ─────────────────────────────────
create or replace view public.associations as
select
  id,
  name,
  short_name,
  timezone,
  logo_url as logo_data_url,
  website_url,
  sponsor_logos,
  created_at,
  updated_at
from public.organizations;

-- INSTEAD OF triggers to make the view writable
create or replace function public.associations_insert()
returns trigger language plpgsql security definer as $$
begin
  insert into public.organizations (id, name, short_name, timezone, logo_url, website_url, sponsor_logos, created_at, updated_at)
  values (
    coalesce(new.id, gen_random_uuid()),
    new.name,
    new.short_name,
    new.timezone,
    new.logo_data_url,
    new.website_url,
    coalesce(new.sponsor_logos, '[]'::jsonb),
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now())
  );
  return new;
end;
$$;

create or replace function public.associations_update()
returns trigger language plpgsql security definer as $$
begin
  update public.organizations set
    name         = new.name,
    short_name   = new.short_name,
    timezone     = new.timezone,
    logo_url     = new.logo_data_url,
    website_url  = new.website_url,
    sponsor_logos = coalesce(new.sponsor_logos, '[]'::jsonb),
    updated_at   = now()
  where id = old.id;
  return new;
end;
$$;

create or replace function public.associations_delete()
returns trigger language plpgsql security definer as $$
begin
  delete from public.organizations where id = old.id;
  return old;
end;
$$;

drop trigger if exists associations_insert_trigger on public.associations;
create trigger associations_insert_trigger
  instead of insert on public.associations
  for each row execute function public.associations_insert();

drop trigger if exists associations_update_trigger on public.associations;
create trigger associations_update_trigger
  instead of update on public.associations
  for each row execute function public.associations_update();

drop trigger if exists associations_delete_trigger on public.associations;
create trigger associations_delete_trigger
  instead of delete on public.associations
  for each row execute function public.associations_delete();

-- ─── 10. days VIEW over show_days ────────────────────────────────────────────
create or replace view public.days as
select
  id,
  organization_id as association_id,
  show_id,
  day_name as label,
  day_date as date,
  sort_order,
  created_at,
  updated_at
from public.show_days;

create or replace function public.days_insert()
returns trigger language plpgsql security definer as $$
begin
  insert into public.show_days (id, organization_id, show_id, day_name, day_date, sort_order, created_at, updated_at)
  values (
    coalesce(new.id, gen_random_uuid()),
    new.association_id,
    new.show_id,
    new.label,
    new.date::date,
    coalesce(new.sort_order, 1),
    coalesce(new.created_at, now()),
    coalesce(new.updated_at, now())
  );
  return new;
end;
$$;

create or replace function public.days_update()
returns trigger language plpgsql security definer as $$
begin
  update public.show_days set
    organization_id = new.association_id,
    show_id         = new.show_id,
    day_name        = new.label,
    day_date        = new.date::date,
    sort_order      = coalesce(new.sort_order, 1),
    updated_at      = now()
  where id = old.id;
  return new;
end;
$$;

create or replace function public.days_delete()
returns trigger language plpgsql security definer as $$
begin
  delete from public.show_days where id = old.id;
  return old;
end;
$$;

drop trigger if exists days_insert_trigger on public.days;
create trigger days_insert_trigger
  instead of insert on public.days
  for each row execute function public.days_insert();

drop trigger if exists days_update_trigger on public.days;
create trigger days_update_trigger
  instead of update on public.days
  for each row execute function public.days_update();

drop trigger if exists days_delete_trigger on public.days;
create trigger days_delete_trigger
  instead of delete on public.days
  for each row execute function public.days_delete();

-- ─── 11. association_memberships VIEW over organization_members ───────────────
create or replace view public.association_memberships as
select
  om.id,
  up.user_id as user_id,
  om.organization_id as association_id,
  om.role,
  om.created_at,
  om.updated_at
from public.organization_members om
join public.user_profiles up on om.user_id = up.id;

create or replace function public.association_memberships_insert()
returns trigger language plpgsql security definer as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id from public.user_profiles where user_id = new.user_id::uuid;
  if v_profile_id is null then
    raise exception 'No user_profile found for user_id %', new.user_id;
  end if;
  insert into public.organization_members (user_id, organization_id, role)
  values (v_profile_id, new.association_id::uuid, new.role)
  on conflict (organization_id, user_id) do update set role = excluded.role;
  return new;
end;
$$;

create or replace function public.association_memberships_delete()
returns trigger language plpgsql security definer as $$
declare
  v_profile_id uuid;
begin
  select id into v_profile_id from public.user_profiles where user_id = old.user_id::uuid;
  if v_profile_id is not null then
    delete from public.organization_members
    where user_id = v_profile_id and organization_id = old.association_id::uuid;
  end if;
  return old;
end;
$$;

drop trigger if exists association_memberships_insert_trigger on public.association_memberships;
create trigger association_memberships_insert_trigger
  instead of insert on public.association_memberships
  for each row execute function public.association_memberships_insert();

drop trigger if exists association_memberships_delete_trigger on public.association_memberships;
create trigger association_memberships_delete_trigger
  instead of delete on public.association_memberships
  for each row execute function public.association_memberships_delete();

-- ─── 12. create_association_with_owner RPC ───────────────────────────────────
create or replace function public.create_association_with_owner(
  target_id text,
  target_name text,
  target_short_name text default '',
  target_timezone text default 'America/Toronto',
  target_logo_data_url text default null,
  target_website_url text default null,
  target_sponsor_logos jsonb default '[]'::jsonb
)
returns json
language plpgsql security definer as $$
declare
  v_org_id uuid;
  v_profile_id uuid;
  v_slug text;
  v_result json;
begin
  v_org_id := coalesce(nullif(target_id, '')::uuid, gen_random_uuid());
  v_slug := lower(regexp_replace(coalesce(target_name, ''), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substring(v_org_id::text, 1, 8);

  insert into public.organizations (id, name, short_name, timezone, logo_url, website_url, sponsor_logos, slug)
  values (v_org_id, target_name, coalesce(target_short_name,''), coalesce(target_timezone,'America/Toronto'),
          target_logo_data_url, target_website_url, coalesce(target_sponsor_logos,'[]'::jsonb), v_slug)
  on conflict (id) do update set
    name        = excluded.name,
    short_name  = excluded.short_name,
    timezone    = excluded.timezone,
    logo_url    = excluded.logo_url,
    website_url = excluded.website_url,
    updated_at  = now();

  -- Link calling user as admin member
  select id into v_profile_id from public.user_profiles where user_id = auth.uid();
  if v_profile_id is not null then
    insert into public.organization_members (user_id, organization_id, role)
    values (v_profile_id, v_org_id, 'admin')
    on conflict (organization_id, user_id) do nothing;
  end if;

  select row_to_json(o) into v_result
  from (
    select id, name, short_name, timezone, logo_url as logo_data_url, website_url, sponsor_logos, created_at, updated_at
    from public.organizations where id = v_org_id
  ) o;

  return v_result;
end;
$$;

-- ─── 13. activate_show_for_scoring RPC ───────────────────────────────────────
create or replace function public.activate_show_for_scoring(target_class_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_show_id uuid;
begin
  select show_id into v_show_id from public.classes where id = target_class_id;
  if v_show_id is not null then
    update public.shows set status = 'open', updated_at = now() where id = v_show_id;
  end if;
end;
$$;

-- ─── 14. find_user_profile_for_association RPC ───────────────────────────────
create or replace function public.find_user_profile_for_association(
  target_association_id text,
  target_email text
)
returns json
language plpgsql security definer as $$
declare
  v_result json;
begin
  select row_to_json(r) into v_result
  from (
    select up.user_id as id, up.display_name, up.first_name, up.last_name
    from public.user_profiles up
    join public.organization_members om on om.user_id = up.id
    where om.organization_id = target_association_id::uuid
      and lower(up.first_name || ' ' || up.last_name) like '%' || lower(target_email) || '%'
    limit 1
  ) r;
  return v_result;
end;
$$;

-- ─── 15. RLS for class_result_publications ───────────────────────────────────
create policy "org members can manage class_result_publications"
  on public.class_result_publications
  for all
  using (
    exists (
      select 1 from public.classes c
      join public.organization_members om on om.organization_id = c.organization_id
      join public.user_profiles up on up.id = om.user_id
      where c.id = class_result_publications.class_id
        and up.user_id = auth.uid()
    )
  );

create policy "public can read published class_result_publications"
  on public.class_result_publications
  for select
  using (status = 'published');
