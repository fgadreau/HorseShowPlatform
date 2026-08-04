-- Bloc 1 / F2, lot 1: catalogues, repertoires, slates et echeances.
-- Impact ShowScore: SS-0. Ce lot ne modifie aucun contrat ShowScore.

create table public.disciplines (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);

create unique index disciplines_normalized_code_key
  on public.disciplines (upper(btrim(code)));

create table public.organization_disciplines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  discipline_id uuid not null references public.disciplines(id) on delete restrict,
  is_default boolean not null default false,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, discipline_id),
  unique (id, organization_id)
);

create unique index organization_disciplines_one_default_key
  on public.organization_disciplines (organization_id)
  where is_default;

create index organization_disciplines_active_idx
  on public.organization_disciplines (organization_id, is_active, discipline_id);

create table public.directory_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_discipline_id uuid not null references public.organization_disciplines(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  source text not null default 'manual'
    check (source in ('manual', 'entry', 'membership', 'relationship', 'reservation', 'import')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_discipline_id, contact_id)
);

create index directory_contacts_contact_idx
  on public.directory_contacts (contact_id, organization_discipline_id);

create table public.directory_horses (
  id uuid primary key default gen_random_uuid(),
  organization_discipline_id uuid not null references public.organization_disciplines(id) on delete cascade,
  horse_id uuid not null references public.horses(id) on delete cascade,
  source text not null default 'manual'
    check (source in ('manual', 'entry', 'membership', 'relationship', 'reservation', 'import')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_discipline_id, horse_id)
);

create index directory_horses_horse_idx
  on public.directory_horses (horse_id, organization_discipline_id);

create table public.governing_bodies (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  description text,
  default_back_number_policy text not null default 'horse'
    check (default_back_number_policy in ('horse', 'rider', 'horse_rider_team', 'entry', 'custom')),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);

create unique index governing_bodies_normalized_code_key
  on public.governing_bodies (upper(btrim(code)));

insert into public.governing_bodies (
  code,
  name,
  default_back_number_policy,
  description,
  metadata
)
select
  code,
  name,
  back_number_policy,
  rule_notes,
  metadata
from public.sanctioning_bodies
on conflict (code) do update
set
  name = excluded.name,
  default_back_number_policy = excluded.default_back_number_policy,
  description = excluded.description,
  metadata = excluded.metadata,
  updated_at = now();

create table public.organization_governing_bodies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  governing_body_id uuid not null references public.governing_bodies(id) on delete restrict,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, governing_body_id)
);

create index organization_governing_bodies_active_idx
  on public.organization_governing_bodies (organization_id, is_active, governing_body_id);

create table public.slates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  governing_body_id uuid references public.governing_bodies(id) on delete restrict,
  name text not null,
  technical_number text,
  sort_order integer not null default 1 check (sort_order > 0),
  reporting_rules jsonb not null default '{}'::jsonb,
  notes text,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (technical_number is null or governing_body_id is not null),
  unique (id, organization_id, show_id),
  unique (show_id, name)
);

create unique index slates_show_governing_body_number_key
  on public.slates (show_id, governing_body_id, upper(btrim(technical_number)))
  where technical_number is not null;

create index slates_show_sort_idx
  on public.slates (show_id, sort_order, name);

create table public.organization_deadline_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  entry_deadline_mode text not null default 'block'
    check (entry_deadline_mode in ('show', 'block')),
  entry_days_before smallint not null default 1
    check (entry_days_before >= 0),
  entry_local_time time not null default '18:00',
  reservation_days_before smallint
    check (reservation_days_before is null or reservation_days_before >= 0),
  reservation_local_time time,
  late_entries_allowed boolean not null default true,
  late_entry_fee_percent numeric(5, 2) not null default 50
    check (late_entry_fee_percent >= 0 and late_entry_fee_percent <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (reservation_days_before is null and reservation_local_time is null)
    or (reservation_days_before is not null and reservation_local_time is not null)
  )
);

alter table public.shows
  add column entry_deadline_mode text not null default 'block',
  add column entries_close_at timestamptz,
  add column reservations_close_at timestamptz,
  add column late_entries_allowed boolean not null default true,
  add column late_entry_fee_percent numeric(5, 2) not null default 50;

alter table public.shows
  add constraint shows_entry_deadline_mode_check
    check (entry_deadline_mode in ('show', 'block')),
  add constraint shows_late_entry_fee_percent_check
    check (late_entry_fee_percent >= 0 and late_entry_fee_percent <= 1000);

create index shows_entry_deadline_idx
  on public.shows (organization_id, entry_deadline_mode, entries_close_at);

create index shows_reservation_deadline_idx
  on public.shows (organization_id, reservations_close_at);

create or replace function public.validate_slate_context()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_organization_id uuid;
begin
  select organization_id
  into parent_organization_id
  from public.shows
  where id = new.show_id;

  if parent_organization_id is null then
    raise exception 'Show % does not exist', new.show_id
      using errcode = 'foreign_key_violation';
  end if;

  if new.organization_id is distinct from parent_organization_id then
    raise exception 'Slate organization must match its show organization'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger slates_validate_context
  before insert or update of organization_id, show_id on public.slates
  for each row execute function public.validate_slate_context();

create trigger disciplines_touch_updated_at
  before update on public.disciplines
  for each row execute function public.touch_updated_at();

create trigger organization_disciplines_touch_updated_at
  before update on public.organization_disciplines
  for each row execute function public.touch_updated_at();

create trigger directory_contacts_touch_updated_at
  before update on public.directory_contacts
  for each row execute function public.touch_updated_at();

create trigger directory_horses_touch_updated_at
  before update on public.directory_horses
  for each row execute function public.touch_updated_at();

create trigger governing_bodies_touch_updated_at
  before update on public.governing_bodies
  for each row execute function public.touch_updated_at();

create trigger organization_governing_bodies_touch_updated_at
  before update on public.organization_governing_bodies
  for each row execute function public.touch_updated_at();

create trigger slates_touch_updated_at
  before update on public.slates
  for each row execute function public.touch_updated_at();

create trigger organization_deadline_policies_touch_updated_at
  before update on public.organization_deadline_policies
  for each row execute function public.touch_updated_at();

alter table public.disciplines enable row level security;
alter table public.organization_disciplines enable row level security;
alter table public.directory_contacts enable row level security;
alter table public.directory_horses enable row level security;
alter table public.governing_bodies enable row level security;
alter table public.organization_governing_bodies enable row level security;
alter table public.slates enable row level security;
alter table public.organization_deadline_policies enable row level security;

create policy "Authenticated users can view active disciplines"
  on public.disciplines for select
  to authenticated
  using (is_active or public.is_platform_admin());

create policy "Platform admins manage disciplines"
  on public.disciplines for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Organization members view organization disciplines"
  on public.organization_disciplines for select
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id));

create policy "Organization staff manage organization disciplines"
  on public.organization_disciplines for all
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

create policy "Authorized users view directory contacts"
  on public.directory_contacts for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.organization_disciplines directory
      where directory.id = organization_discipline_id
        and public.is_org_member(directory.organization_id)
    )
    or public.can_access_contact(contact_id)
  );

create policy "Organization staff manage directory contacts"
  on public.directory_contacts for all
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.organization_disciplines directory
      where directory.id = organization_discipline_id
        and public.is_org_member(directory.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.organization_disciplines directory
      where directory.id = organization_discipline_id
        and directory.is_active
        and public.is_org_member(directory.organization_id, array['admin', 'secretary'])
    )
  );

create policy "Authorized users view directory horses"
  on public.directory_horses for select
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.organization_disciplines directory
      where directory.id = organization_discipline_id
        and public.is_org_member(directory.organization_id)
    )
    or public.can_access_horse(horse_id)
  );

create policy "Organization staff manage directory horses"
  on public.directory_horses for all
  to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.organization_disciplines directory
      where directory.id = organization_discipline_id
        and public.is_org_member(directory.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1
      from public.organization_disciplines directory
      where directory.id = organization_discipline_id
        and directory.is_active
        and public.is_org_member(directory.organization_id, array['admin', 'secretary'])
    )
  );

create policy "Authenticated users view active governing bodies"
  on public.governing_bodies for select
  to authenticated
  using (is_active or public.is_platform_admin());

create policy "Platform admins manage governing bodies"
  on public.governing_bodies for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Organization members view configured governing bodies"
  on public.organization_governing_bodies for select
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id));

create policy "Organization staff manage configured governing bodies"
  on public.organization_governing_bodies for all
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

create policy "Organization members view slates"
  on public.slates for select
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id));

create policy "Organization staff manage slates"
  on public.slates for all
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

create policy "Organization members view deadline policies"
  on public.organization_deadline_policies for select
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id));

create policy "Organization staff manage deadline policies"
  on public.organization_deadline_policies for all
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

grant select, insert, update, delete on public.disciplines to authenticated;
grant select, insert, update, delete on public.organization_disciplines to authenticated;
grant select, insert, update, delete on public.directory_contacts to authenticated;
grant select, insert, update, delete on public.directory_horses to authenticated;
grant select, insert, update, delete on public.governing_bodies to authenticated;
grant select, insert, update, delete on public.organization_governing_bodies to authenticated;
grant select, insert, update, delete on public.slates to authenticated;
grant select, insert, update, delete on public.organization_deadline_policies to authenticated;
