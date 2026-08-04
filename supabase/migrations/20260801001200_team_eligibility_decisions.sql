-- Bloc 2 / I6: conserver séparément la preuve externe et la décision
-- d'admissibilité cheval-cavalier-classe-date.
-- Impact ShowScore: SS-0. Aucun bloc, passage, setup, résultat ou payload touché.

insert into public.external_data_sources (
  code,
  name,
  source_type,
  operational_status,
  capabilities,
  configuration,
  metadata
)
values (
  'NRHA_ELIGIBILITY_API',
  'NRHA eligibility calculator',
  'api',
  'available',
  '{"subjects":["team","class"],"operations":["eligibility_check"]}'::jsonb,
  '{}'::jsonb,
  '{"integration":"existing","does_not_own_identity":true}'::jsonb
)
on conflict (code) do update
set name = excluded.name,
    source_type = excluded.source_type,
    operational_status = excluded.operational_status,
    capabilities = excluded.capabilities,
    configuration = excluded.configuration,
    is_active = true,
    metadata = public.external_data_sources.metadata || excluded.metadata,
    updated_at = now();

insert into public.external_source_governing_bodies (
  external_data_source_id,
  governing_body_id,
  relationship_type,
  data_scope
)
select source.id, body.id, 'official', '{"operations":["eligibility_check"]}'::jsonb
from public.external_data_sources source
join public.governing_bodies body on body.code = 'NRHA'
where source.code = 'NRHA_ELIGIBILITY_API'
on conflict (external_data_source_id, governing_body_id) do update
set relationship_type = excluded.relationship_type,
    data_scope = excluded.data_scope,
    is_active = true,
    updated_at = now();

create table public.team_eligibility_snapshots (
  snapshot_id uuid primary key references public.external_data_snapshots(id) on delete cascade,
  horse_id uuid not null references public.horses(id) on delete cascade,
  rider_contact_id uuid not null references public.contacts(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  governing_body_id uuid not null references public.governing_bodies(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index team_eligibility_snapshots_team_idx
  on public.team_eligibility_snapshots (class_id, horse_id, rider_contact_id, show_id, governing_body_id);

comment on table public.team_eligibility_snapshots is
  'Typed team/class link for immutable external evidence. It is not the HSP eligibility decision.';

create or replace function public.validate_team_eligibility_snapshot_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  class_show_id uuid;
begin
  select block.show_id
  into class_show_id
  from public.classes class_record
  join public.blocks block on block.id = class_record.block_id
  where class_record.id = new.class_id;

  if class_show_id is null or class_show_id <> new.show_id then
    raise exception 'Eligibility snapshot class and show must share one context.';
  end if;

  if not exists (
    select 1
    from public.class_governing_bodies assignment
    where assignment.class_id = new.class_id
      and assignment.governing_body_id = new.governing_body_id
  ) then
    raise exception 'Eligibility snapshot governing body must be assigned to the class.';
  end if;

  if not exists (
    select 1
    from public.external_data_snapshots snapshot
    join public.external_source_governing_bodies source_body
      on source_body.external_data_source_id = snapshot.external_data_source_id
     and source_body.governing_body_id = new.governing_body_id
     and source_body.is_active
    where snapshot.id = new.snapshot_id
  ) then
    raise exception 'Eligibility snapshot source must be linked to the governing body.';
  end if;

  return new;
end;
$$;

create trigger team_eligibility_snapshots_validate_context
  before insert on public.team_eligibility_snapshots
  for each row execute function public.validate_team_eligibility_snapshot_context();

create table public.team_eligibility_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  governing_body_id uuid not null references public.governing_bodies(id) on delete restrict,
  horse_id uuid not null references public.horses(id) on delete cascade,
  rider_contact_id uuid not null references public.contacts(id) on delete cascade,
  reference_date date not null,
  status text not null,
  can_proceed boolean not null,
  reasons jsonb not null default '[]'::jsonb,
  input_fingerprint text not null,
  source_mode text not null,
  external_snapshot_id uuid references public.external_data_snapshots(id) on delete set null,
  checked_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by_user_id uuid default public.current_profile_id() references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (status in ('eligible', 'ineligible', 'unavailable')),
  check (source_mode in ('live_external', 'local', 'manual')),
  check (jsonb_typeof(reasons) = 'array'),
  check (btrim(input_fingerprint) <> ''),
  check (expires_at is null or expires_at > checked_at),
  check (
    (status = 'eligible' and can_proceed)
    or (status = 'ineligible' and not can_proceed)
    or status = 'unavailable'
  )
);

create index team_eligibility_decisions_cache_idx
  on public.team_eligibility_decisions (
    class_id,
    governing_body_id,
    horse_id,
    rider_contact_id,
    show_id,
    reference_date,
    input_fingerprint,
    expires_at desc,
    checked_at desc
  );

comment on table public.team_eligibility_decisions is
  'Immutable HSP decisions for one horse, rider, class, governing body and reference date. External evidence remains in external_data_snapshots.';

create or replace function public.validate_team_eligibility_decision_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  class_organization_id uuid;
  class_show_id uuid;
begin
  select block.organization_id, block.show_id
  into class_organization_id, class_show_id
  from public.classes class_record
  join public.blocks block on block.id = class_record.block_id
  where class_record.id = new.class_id;

  if class_organization_id is null
    or class_organization_id <> new.organization_id
    or class_show_id <> new.show_id then
    raise exception 'Eligibility decision class, show and organization must share one context.';
  end if;

  if not exists (
    select 1
    from public.class_governing_bodies assignment
    where assignment.class_id = new.class_id
      and assignment.governing_body_id = new.governing_body_id
  ) then
    raise exception 'Eligibility decision governing body must be assigned to the class.';
  end if;

  if new.external_snapshot_id is not null and not exists (
    select 1
    from public.team_eligibility_snapshots snapshot
    where snapshot.snapshot_id = new.external_snapshot_id
      and snapshot.horse_id = new.horse_id
      and snapshot.rider_contact_id = new.rider_contact_id
      and snapshot.show_id = new.show_id
      and snapshot.class_id = new.class_id
      and snapshot.governing_body_id = new.governing_body_id
  ) then
    raise exception 'Eligibility decision evidence must match the same team, class, show and governing body.';
  end if;

  return new;
end;
$$;

create trigger team_eligibility_decisions_validate_context
  before insert on public.team_eligibility_decisions
  for each row execute function public.validate_team_eligibility_decision_context();

alter table public.team_eligibility_snapshots enable row level security;
alter table public.team_eligibility_decisions enable row level security;

drop policy if exists "Authorized users view external data snapshots" on public.external_data_snapshots;
create policy "Authorized users view external data snapshots"
  on public.external_data_snapshots for select
  to authenticated
  using (
    public.is_platform_admin()
    or created_by_user_id = public.current_profile_id()
    or exists (
      select 1 from public.external_data_snapshot_contacts link
      where link.snapshot_id = external_data_snapshots.id
        and public.can_access_contact(link.contact_id)
    )
    or exists (
      select 1 from public.external_data_snapshot_horses link
      where link.snapshot_id = external_data_snapshots.id
        and public.can_access_horse(link.horse_id)
    )
    or exists (
      select 1 from public.team_eligibility_snapshots link
      where link.snapshot_id = external_data_snapshots.id
        and public.can_access_horse(link.horse_id)
        and public.can_access_contact(link.rider_contact_id)
    )
  );

create policy "Authorized users view team eligibility snapshots"
  on public.team_eligibility_snapshots for select
  to authenticated
  using (
    public.is_platform_admin()
    or (
      public.can_access_horse(horse_id)
      and public.can_access_contact(rider_contact_id)
    )
  );

create policy "Authorized users create team eligibility snapshots"
  on public.team_eligibility_snapshots for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or (
      public.can_access_horse(horse_id)
      and public.can_access_contact(rider_contact_id)
    )
  );

create policy "Platform admins delete team eligibility snapshots"
  on public.team_eligibility_snapshots for delete
  to authenticated
  using (public.is_platform_admin());

create policy "Authorized users view team eligibility decisions"
  on public.team_eligibility_decisions for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id)
    or created_by_user_id = public.current_profile_id()
    or (
      public.can_access_horse(horse_id)
      and public.can_access_contact(rider_contact_id)
    )
  );

create policy "Authorized users create team eligibility decisions"
  on public.team_eligibility_decisions for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or (
      coalesce(created_by_user_id, public.current_profile_id()) = public.current_profile_id()
      and public.can_access_horse(horse_id)
      and public.can_access_contact(rider_contact_id)
    )
  );

create policy "Platform admins delete team eligibility decisions"
  on public.team_eligibility_decisions for delete
  to authenticated
  using (public.is_platform_admin());

grant select, insert, delete on public.team_eligibility_snapshots to authenticated;
grant select, insert, delete on public.team_eligibility_decisions to authenticated;
