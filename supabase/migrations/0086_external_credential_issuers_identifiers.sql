-- Bloc 2 / I2: modeliser les organismes qui emettent des adhesions,
-- licences et enregistrements sans les confondre avec les associations HSP,
-- les organismes de reglementation sportive ou les sources techniques.
-- Impact ShowScore: SS-0. Aucun objet de scoring, passage ou resultat touche.

-- Les donnees sont fictives et la reconstruction est volontairement
-- destructive: le modele cible remplace les anciennes tables ambiguës.
drop table if exists public.organization_external_membership_requirements cascade;
drop table if exists public.contact_external_memberships cascade;
drop table if exists public.horse_external_memberships cascade;
drop table if exists public.external_organizations cascade;

create table public.external_credential_issuers (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  issuer_type text not null default 'other',
  country_code text,
  subdivision_code text,
  website_url text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code),
  check (btrim(code) <> ''),
  check (btrim(name) <> ''),
  check (issuer_type in (
    'provincial_territorial_sport_organization',
    'national_sport_organization',
    'breed_registry',
    'sanctioning_organization',
    'other'
  )),
  check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  check (subdivision_code is null or subdivision_code ~ '^[A-Z0-9-]{2,10}$'),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index external_credential_issuers_normalized_code_key
  on public.external_credential_issuers (upper(btrim(code)));

comment on table public.external_credential_issuers is
  'Organizations that issue memberships, licences, registrations or comparable credentials. They are not HSP tenants or technical data sources.';

comment on column public.external_credential_issuers.issuer_type is
  'OPTS organizations use provincial_territorial_sport_organization and are scoped with country_code plus subdivision_code.';

create table public.credential_issuer_governing_bodies (
  external_credential_issuer_id uuid not null references public.external_credential_issuers(id) on delete cascade,
  governing_body_id uuid not null references public.governing_bodies(id) on delete cascade,
  relationship_type text not null default 'same_legal_entity',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (external_credential_issuer_id, governing_body_id),
  check (relationship_type in ('same_legal_entity', 'authorized_issuer', 'affiliate')),
  check (jsonb_typeof(metadata) = 'object')
);

comment on table public.credential_issuer_governing_bodies is
  'Optional role link when one real-world entity also governs sport. It never makes the two concepts interchangeable.';

create table public.organization_external_credential_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  external_credential_issuer_id uuid not null references public.external_credential_issuers(id) on delete cascade,
  contact_type text not null default 'rider',
  identifier_type text not null default 'membership',
  requirement_group_code text,
  match_rule text not null default 'all',
  validity_rule text not null default 'active_on_reference_date',
  enforcement_mode text not null default 'blocking',
  is_required boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_credential_issuer_id, contact_type, identifier_type),
  check (contact_type in ('owner', 'agent', 'rider', 'payer', 'other')),
  check (identifier_type in ('membership', 'license', 'registration', 'certification', 'other')),
  check (match_rule in ('all', 'at_least_one')),
  check (requirement_group_code is not null or match_rule = 'all'),
  check (validity_rule in ('present', 'active_on_reference_date')),
  check (enforcement_mode in ('warning', 'blocking')),
  check (jsonb_typeof(metadata) = 'object')
);

comment on table public.organization_external_credential_requirements is
  'Association-owned credential requirements. They are independent of discipline and evaluated at the relevant show date when configured.';

comment on column public.organization_external_credential_requirements.requirement_group_code is
  'Rows sharing a group and match_rule at_least_one are alternatives, such as the OPTS accepted by a Canadian association.';

create index organization_external_credential_requirements_group_idx
  on public.organization_external_credential_requirements (organization_id, contact_type, requirement_group_code)
  where requirement_group_code is not null and is_required;

create table public.external_data_snapshots (
  id uuid primary key default gen_random_uuid(),
  external_data_source_id uuid not null references public.external_data_sources(id) on delete restrict,
  source_record_key text,
  status text not null default 'captured',
  retrieved_at timestamptz not null default now(),
  effective_at timestamptz,
  expires_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  payload_hash text,
  created_by_user_id uuid default public.current_profile_id() references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (status in ('captured', 'verified', 'rejected', 'superseded')),
  check (jsonb_typeof(payload) = 'object')
);

create index external_data_snapshots_source_date_idx
  on public.external_data_snapshots (external_data_source_id, retrieved_at desc);

comment on table public.external_data_snapshots is
  'Immutable evidence captured from an external data channel. Business decisions remain outside this table.';

create table public.external_data_snapshot_contacts (
  snapshot_id uuid not null references public.external_data_snapshots(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  relationship_type text not null default 'subject',
  primary key (snapshot_id, contact_id),
  check (relationship_type in ('subject', 'candidate', 'related'))
);

create table public.external_data_snapshot_horses (
  snapshot_id uuid not null references public.external_data_snapshots(id) on delete cascade,
  horse_id uuid not null references public.horses(id) on delete cascade,
  relationship_type text not null default 'subject',
  primary key (snapshot_id, horse_id),
  check (relationship_type in ('subject', 'candidate', 'related'))
);

create table public.contact_external_identifiers (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  external_credential_issuer_id uuid not null references public.external_credential_issuers(id) on delete cascade,
  identifier_type text not null default 'membership',
  identifier_value text not null,
  normalized_identifier_value text generated always as (upper(btrim(identifier_value))) stored,
  status text not null default 'unknown',
  valid_from date,
  expires_on date,
  verified_at timestamptz,
  verified_by_external_data_source_id uuid references public.external_data_sources(id) on delete set null,
  latest_snapshot_id uuid references public.external_data_snapshots(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, external_credential_issuer_id, identifier_type),
  check (btrim(identifier_value) <> ''),
  check (identifier_type in ('membership', 'license', 'registration', 'certification', 'other')),
  check (status in ('active', 'pending', 'expired', 'inactive', 'revoked', 'unknown')),
  check (expires_on is null or valid_from is null or expires_on >= valid_from),
  check (jsonb_typeof(metadata) = 'object')
);

create index contact_external_identifiers_contact_idx
  on public.contact_external_identifiers (contact_id, external_credential_issuer_id);

create index contact_external_identifiers_lookup_idx
  on public.contact_external_identifiers (external_credential_issuer_id, normalized_identifier_value);

create table public.horse_external_identifiers (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references public.horses(id) on delete cascade,
  external_credential_issuer_id uuid not null references public.external_credential_issuers(id) on delete cascade,
  identifier_type text not null default 'competition_license',
  identifier_value text not null,
  normalized_identifier_value text generated always as (upper(btrim(identifier_value))) stored,
  status text not null default 'unknown',
  valid_from date,
  expires_on date,
  verified_at timestamptz,
  verified_by_external_data_source_id uuid references public.external_data_sources(id) on delete set null,
  latest_snapshot_id uuid references public.external_data_snapshots(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (horse_id, external_credential_issuer_id, identifier_type),
  check (btrim(identifier_value) <> ''),
  check (identifier_type in ('competition_license', 'registration', 'membership', 'microchip', 'passport', 'other')),
  check (status in ('active', 'pending', 'expired', 'inactive', 'revoked', 'unknown')),
  check (expires_on is null or valid_from is null or expires_on >= valid_from),
  check (jsonb_typeof(metadata) = 'object')
);

create index horse_external_identifiers_horse_idx
  on public.horse_external_identifiers (horse_id, external_credential_issuer_id);

create index horse_external_identifiers_lookup_idx
  on public.horse_external_identifiers (external_credential_issuer_id, normalized_identifier_value);

create trigger external_credential_issuers_touch_updated_at
  before update on public.external_credential_issuers
  for each row execute function public.touch_updated_at();

create trigger credential_issuer_governing_bodies_touch_updated_at
  before update on public.credential_issuer_governing_bodies
  for each row execute function public.touch_updated_at();

create trigger organization_external_credential_requirements_touch_updated_at
  before update on public.organization_external_credential_requirements
  for each row execute function public.touch_updated_at();

create trigger contact_external_identifiers_touch_updated_at
  before update on public.contact_external_identifiers
  for each row execute function public.touch_updated_at();

create trigger horse_external_identifiers_touch_updated_at
  before update on public.horse_external_identifiers
  for each row execute function public.touch_updated_at();

alter table public.external_credential_issuers enable row level security;
alter table public.credential_issuer_governing_bodies enable row level security;
alter table public.organization_external_credential_requirements enable row level security;
alter table public.external_data_snapshots enable row level security;
alter table public.external_data_snapshot_contacts enable row level security;
alter table public.external_data_snapshot_horses enable row level security;
alter table public.contact_external_identifiers enable row level security;
alter table public.horse_external_identifiers enable row level security;

create policy "Authenticated users view active credential issuers"
  on public.external_credential_issuers for select
  to authenticated
  using (is_active or public.is_platform_admin());

create policy "Platform admins manage credential issuers"
  on public.external_credential_issuers for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Authenticated users view active issuer governing body links"
  on public.credential_issuer_governing_bodies for select
  to authenticated
  using (is_active or public.is_platform_admin());

create policy "Platform admins manage issuer governing body links"
  on public.credential_issuer_governing_bodies for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Organization members view credential requirements"
  on public.organization_external_credential_requirements for select
  to authenticated
  using (public.is_org_member(organization_id));

create policy "Organization staff manage credential requirements"
  on public.organization_external_credential_requirements for all
  to authenticated
  using (public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_org_member(organization_id, array['admin', 'secretary']));

create policy "Authorized users view contact external identifiers"
  on public.contact_external_identifiers for select
  to authenticated
  using (public.can_access_contact(contact_id));

create policy "Authorized users manage contact external identifiers"
  on public.contact_external_identifiers for all
  to authenticated
  using (
    public.can_manage_contact_identity(contact_id)
    or exists (
      select 1
      from public.directory_contacts dc
      join public.organization_disciplines od on od.id = dc.organization_discipline_id
      where dc.contact_id = contact_external_identifiers.contact_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.can_manage_contact_identity(contact_id)
    or exists (
      select 1
      from public.directory_contacts dc
      join public.organization_disciplines od on od.id = dc.organization_discipline_id
      where dc.contact_id = contact_external_identifiers.contact_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  );

create policy "Authorized users view horse external identifiers"
  on public.horse_external_identifiers for select
  to authenticated
  using (public.can_access_horse(horse_id));

create policy "Authorized users manage horse external identifiers"
  on public.horse_external_identifiers for all
  to authenticated
  using (
    public.can_manage_horse_identity(horse_id)
    or exists (
      select 1
      from public.directory_horses dh
      join public.organization_disciplines od on od.id = dh.organization_discipline_id
      where dh.horse_id = horse_external_identifiers.horse_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.can_manage_horse_identity(horse_id)
    or exists (
      select 1
      from public.directory_horses dh
      join public.organization_disciplines od on od.id = dh.organization_discipline_id
      where dh.horse_id = horse_external_identifiers.horse_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  );

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
  );

create policy "Authorized users create external data snapshots"
  on public.external_data_snapshots for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or coalesce(created_by_user_id, public.current_profile_id()) = public.current_profile_id()
  );

create policy "Platform admins update or delete external data snapshots"
  on public.external_data_snapshots for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Authorized users view contact snapshot links"
  on public.external_data_snapshot_contacts for select
  to authenticated
  using (public.can_access_contact(contact_id));

create policy "Authorized users manage contact snapshot links"
  on public.external_data_snapshot_contacts for all
  to authenticated
  using (
    public.is_platform_admin()
    or public.can_manage_contact_identity(contact_id)
    or exists (
      select 1
      from public.directory_contacts dc
      join public.organization_disciplines od on od.id = dc.organization_discipline_id
      where dc.contact_id = external_data_snapshot_contacts.contact_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.is_platform_admin()
    or public.can_manage_contact_identity(contact_id)
    or exists (
      select 1
      from public.directory_contacts dc
      join public.organization_disciplines od on od.id = dc.organization_discipline_id
      where dc.contact_id = external_data_snapshot_contacts.contact_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  );

create policy "Authorized users view horse snapshot links"
  on public.external_data_snapshot_horses for select
  to authenticated
  using (public.can_access_horse(horse_id));

create policy "Authorized users manage horse snapshot links"
  on public.external_data_snapshot_horses for all
  to authenticated
  using (
    public.is_platform_admin()
    or public.can_manage_horse_identity(horse_id)
    or exists (
      select 1
      from public.directory_horses dh
      join public.organization_disciplines od on od.id = dh.organization_discipline_id
      where dh.horse_id = external_data_snapshot_horses.horse_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.is_platform_admin()
    or public.can_manage_horse_identity(horse_id)
    or exists (
      select 1
      from public.directory_horses dh
      join public.organization_disciplines od on od.id = dh.organization_discipline_id
      where dh.horse_id = external_data_snapshot_horses.horse_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  );

grant select, insert, update, delete on table
  public.external_credential_issuers,
  public.credential_issuer_governing_bodies,
  public.organization_external_credential_requirements,
  public.external_data_snapshots,
  public.external_data_snapshot_contacts,
  public.external_data_snapshot_horses,
  public.contact_external_identifiers,
  public.horse_external_identifiers
to authenticated;

insert into public.external_credential_issuers (
  code,
  name,
  issuer_type,
  country_code,
  subdivision_code,
  metadata
)
values
  ('CHEVAL_QUEBEC', 'Cheval Quebec', 'provincial_territorial_sport_organization', 'CA', 'CA-QC', '{"opts":true}'::jsonb),
  ('ONTARIO_EQUESTRIAN', 'Ontario Equestrian', 'provincial_territorial_sport_organization', 'CA', 'CA-ON', '{"opts":true}'::jsonb),
  ('NRHA', 'National Reining Horse Association', 'sanctioning_organization', 'US', null, '{}'::jsonb),
  ('AQR', 'Association Quebec Reining', 'sanctioning_organization', 'CA', 'CA-QC', '{}'::jsonb),
  ('AQHA', 'American Quarter Horse Association', 'breed_registry', 'US', null, '{}'::jsonb),
  ('NSBA', 'National Snaffle Bit Association', 'national_sport_organization', 'US', null, '{}'::jsonb),
  ('NBHA', 'National Barrel Horse Association', 'national_sport_organization', 'US', null, '{}'::jsonb);

insert into public.credential_issuer_governing_bodies (
  external_credential_issuer_id,
  governing_body_id,
  relationship_type
)
select issuer.id, body.id, 'same_legal_entity'
from (
  values
    ('NRHA', 'NRHA'),
    ('AQR', 'AQR'),
    ('AQHA', 'AQHA'),
    ('NSBA', 'NSBA'),
    ('NBHA', 'NBHA')
) mapping(issuer_code, body_code)
join public.external_credential_issuers issuer on issuer.code = mapping.issuer_code
join public.governing_bodies body on body.code = mapping.body_code;

notify pgrst, 'reload schema';
