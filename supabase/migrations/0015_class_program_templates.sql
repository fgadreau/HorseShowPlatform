create table if not exists public.sanctioning_bodies (
  code text primary key,
  name text not null,
  back_number_policy text not null default 'horse' check (back_number_policy in ('horse', 'horse_rider_team', 'entry', 'custom')),
  rule_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.sanctioning_bodies (code, name, back_number_policy, rule_notes)
values
  ('NRHA', 'National Reining Horse Association', 'horse', 'Default reining flow: back numbers generally follow the horse.'),
  ('AQHA', 'American Quarter Horse Association', 'horse', 'Default stock horse show flow: back numbers generally follow the horse.'),
  ('NSBA', 'National Snaffle Bit Association', 'horse', 'Default flow: back numbers generally follow the horse unless the show overrides it.'),
  ('CHEVAL_QUEBEC', 'Cheval Quebec', 'horse_rider_team', 'Default Quebec flow: back numbers can follow the horse/rider team.'),
  ('OTHER', 'Other', 'custom', 'Use a custom policy for local or special sanctioning rules.')
on conflict (code) do update
set
  name = excluded.name,
  back_number_policy = excluded.back_number_policy,
  rule_notes = excluded.rule_notes,
  updated_at = now();

create table if not exists public.class_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  block_label text,
  category text,
  default_pattern text,
  default_entry_fee numeric(10, 2),
  sanctioning_body_codes text[] not null default '{}'::text[],
  back_number_policy text not null default 'horse' check (back_number_policy in ('horse', 'horse_rider_team', 'entry', 'custom')),
  eligibility_rules jsonb not null default '{}'::jsonb,
  sort_order integer not null default 1,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.class_template_divisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  class_template_id uuid not null references public.class_templates(id) on delete cascade,
  name text not null,
  code text,
  level smallint,
  default_entry_fee numeric(10, 2),
  sanctioning_body_codes text[] not null default '{}'::text[],
  eligibility_rules jsonb not null default '{}'::jsonb,
  sort_order integer not null default 1,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_template_id, name)
);

alter table public.classes
add column if not exists class_template_id uuid references public.class_templates(id) on delete set null,
add column if not exists block_label text,
add column if not exists sanctioning_body_codes text[] not null default '{}'::text[],
add column if not exists back_number_policy text not null default 'horse' check (back_number_policy in ('horse', 'horse_rider_team', 'entry', 'custom')),
add column if not exists eligibility_rules jsonb not null default '{}'::jsonb;

alter table public.divisions
add column if not exists class_template_division_id uuid references public.class_template_divisions(id) on delete set null,
add column if not exists sanctioning_body_codes text[] not null default '{}'::text[],
add column if not exists eligibility_rules jsonb not null default '{}'::jsonb;

create index if not exists idx_class_templates_org_sort
on public.class_templates(organization_id, sort_order, name);

create index if not exists idx_class_template_divisions_template_sort
on public.class_template_divisions(class_template_id, sort_order, name);

create index if not exists idx_classes_template_id
on public.classes(class_template_id);

create or replace function public.set_class_template_division_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  template_org_id uuid;
begin
  select organization_id
  into template_org_id
  from public.class_templates
  where id = new.class_template_id;

  if template_org_id is null then
    raise exception 'Class template % does not exist', new.class_template_id using errcode = 'foreign_key_violation';
  end if;

  new.organization_id := template_org_id;
  return new;
end;
$$;

drop trigger if exists class_template_divisions_set_organization on public.class_template_divisions;
create trigger class_template_divisions_set_organization
before insert or update on public.class_template_divisions
for each row execute function public.set_class_template_division_organization();

drop trigger if exists sanctioning_bodies_touch_updated_at on public.sanctioning_bodies;
create trigger sanctioning_bodies_touch_updated_at
before update on public.sanctioning_bodies
for each row execute function public.touch_updated_at();

drop trigger if exists class_templates_touch_updated_at on public.class_templates;
create trigger class_templates_touch_updated_at
before update on public.class_templates
for each row execute function public.touch_updated_at();

drop trigger if exists class_template_divisions_touch_updated_at on public.class_template_divisions;
create trigger class_template_divisions_touch_updated_at
before update on public.class_template_divisions
for each row execute function public.touch_updated_at();

alter table public.sanctioning_bodies enable row level security;
alter table public.class_templates enable row level security;
alter table public.class_template_divisions enable row level security;

drop policy if exists "Anyone can view sanctioning bodies" on public.sanctioning_bodies;
create policy "Anyone can view sanctioning bodies"
  on public.sanctioning_bodies for select
  using (true);

drop policy if exists "Platform admins manage sanctioning bodies" on public.sanctioning_bodies;
create policy "Platform admins manage sanctioning bodies"
  on public.sanctioning_bodies for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "Organization members can view class templates" on public.class_templates;
create policy "Organization members can view class templates"
  on public.class_templates for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization staff manage class templates" on public.class_templates;
create policy "Organization staff manage class templates"
  on public.class_templates for all
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

drop policy if exists "Organization members can view class template divisions" on public.class_template_divisions;
create policy "Organization members can view class template divisions"
  on public.class_template_divisions for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

drop policy if exists "Organization staff manage class template divisions" on public.class_template_divisions;
create policy "Organization staff manage class template divisions"
  on public.class_template_divisions for all
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));
