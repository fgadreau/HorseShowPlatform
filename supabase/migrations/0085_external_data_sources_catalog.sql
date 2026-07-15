-- Bloc 2 / I1: séparer les sources de données externes des associations HSP
-- et des organismes qui édictent les règles sportives.
-- Impact ShowScore: SS-0. Aucun objet de scoring, passage ou résultat touché.

create table public.external_data_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  source_type text not null,
  operational_status text not null default 'planned',
  base_url text,
  documentation_url text,
  capabilities jsonb not null default '{}'::jsonb,
  configuration jsonb not null default '{}'::jsonb,
  availability_checked_at timestamptz,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code),
  check (btrim(code) <> ''),
  check (btrim(name) <> ''),
  check (source_type in ('api', 'manual_import', 'document', 'public_registry')),
  check (operational_status in ('planned', 'available', 'degraded', 'unavailable', 'retired')),
  check (jsonb_typeof(capabilities) = 'object'),
  check (jsonb_typeof(configuration) = 'object'),
  check (jsonb_typeof(metadata) = 'object')
);

create unique index external_data_sources_normalized_code_key
  on public.external_data_sources (upper(btrim(code)));

comment on table public.external_data_sources is
  'Catalog of external data channels. A source is an optional tool and never owns an HSP identity.';

comment on column public.external_data_sources.configuration is
  'Non-secret connector configuration only. Credentials and tokens must remain in the deployment secret store.';

create table public.external_source_governing_bodies (
  external_data_source_id uuid not null references public.external_data_sources(id) on delete cascade,
  governing_body_id uuid not null references public.governing_bodies(id) on delete cascade,
  relationship_type text not null default 'official',
  data_scope jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (external_data_source_id, governing_body_id),
  check (relationship_type in ('official', 'authorized', 'third_party', 'manual')),
  check (jsonb_typeof(data_scope) = 'object')
);

create index external_source_governing_bodies_body_idx
  on public.external_source_governing_bodies (governing_body_id, is_active, external_data_source_id);

comment on table public.external_source_governing_bodies is
  'Optional many-to-many catalog link. It does not make a source a tenant or prove that a class is sanctioned.';

create trigger external_data_sources_touch_updated_at
  before update on public.external_data_sources
  for each row execute function public.touch_updated_at();

create trigger external_source_governing_bodies_touch_updated_at
  before update on public.external_source_governing_bodies
  for each row execute function public.touch_updated_at();

alter table public.external_data_sources enable row level security;
alter table public.external_source_governing_bodies enable row level security;

create policy "Authenticated users view active external data sources"
  on public.external_data_sources for select
  to authenticated
  using (is_active or public.is_platform_admin());

create policy "Platform admins manage external data sources"
  on public.external_data_sources for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Authenticated users view active external source body links"
  on public.external_source_governing_bodies for select
  to authenticated
  using (
    public.is_platform_admin()
    or (
      is_active
      and exists (
        select 1
        from public.external_data_sources source
        where source.id = external_data_source_id
          and source.is_active
      )
      and exists (
        select 1
        from public.governing_bodies body
        where body.id = governing_body_id
          and body.is_active
      )
    )
  );

create policy "Platform admins manage external source body links"
  on public.external_source_governing_bodies for all
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

grant select, insert, update, delete on public.external_data_sources to authenticated;
grant select, insert, update, delete on public.external_source_governing_bodies to authenticated;

-- Cataloguer les organismes possibles indépendamment de la présence d'un
-- connecteur. De nouveaux organismes ou sources s'ajoutent par ligne, sans
-- modifier le modèle de données.
insert into public.governing_bodies (
  code,
  name,
  description,
  default_back_number_policy,
  metadata
)
values
  ('NSBA', 'National Snaffle Bit Association', 'Sporting governing body and possible issuer of external records.', 'horse', '{"catalog_origin":"I1"}'::jsonb),
  ('NBHA', 'National Barrel Horse Association', 'Sporting governing body and possible issuer of external records.', 'horse', '{"catalog_origin":"I1"}'::jsonb)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    metadata = public.governing_bodies.metadata || excluded.metadata,
    updated_at = now();

insert into public.external_data_sources (
  code,
  name,
  source_type,
  operational_status,
  capabilities,
  configuration,
  metadata
)
values
  (
    'GENERIC_MANUAL_IMPORT',
    'Generic manual import',
    'manual_import',
    'available',
    '{"subjects":["contact","horse","team","class"],"operations":["import","compare"]}'::jsonb,
    '{}'::jsonb,
    '{"connector":"generic"}'::jsonb
  ),
  (
    'GENERIC_DOCUMENT',
    'Uploaded external document',
    'document',
    'available',
    '{"subjects":["contact","horse","team"],"operations":["extract","compare"]}'::jsonb,
    '{}'::jsonb,
    '{"connector":"generic"}'::jsonb
  ),
  (
    'NRHA_LIST_IMPORT',
    'NRHA published-list import',
    'manual_import',
    'available',
    '{"subjects":["contact"],"operations":["ranking_import","eligibility_evidence"]}'::jsonb,
    '{}'::jsonb,
    '{"integration":"existing"}'::jsonb
  ),
  (
    'NRHA_MEMBER_LOOKUP',
    'NRHA member and horse lookup',
    'api',
    'available',
    '{"subjects":["contact","horse"],"operations":["lookup","compare"]}'::jsonb,
    '{}'::jsonb,
    '{"integration":"existing","does_not_own_identity":true}'::jsonb
  ),
  (
    'NRHA_PUBLIC_REGISTRY',
    'NRHA public registry',
    'public_registry',
    'planned',
    '{"subjects":["contact","horse"],"operations":["lookup","compare"]}'::jsonb,
    '{}'::jsonb,
    '{"integration":"planned"}'::jsonb
  ),
  (
    'AQHA_PUBLIC_REGISTRY',
    'AQHA public registry',
    'public_registry',
    'planned',
    '{"subjects":["contact","horse"],"operations":["lookup","compare"]}'::jsonb,
    '{}'::jsonb,
    '{"integration":"planned"}'::jsonb
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
select
  source.id,
  body.id,
  'official',
  '{}'::jsonb
from (
  values
    ('NRHA_LIST_IMPORT', 'NRHA'),
    ('NRHA_MEMBER_LOOKUP', 'NRHA'),
    ('NRHA_PUBLIC_REGISTRY', 'NRHA'),
    ('AQHA_PUBLIC_REGISTRY', 'AQHA')
) mapping(source_code, body_code)
join public.external_data_sources source on source.code = mapping.source_code
join public.governing_bodies body on body.code = mapping.body_code
on conflict (external_data_source_id, governing_body_id) do update
set relationship_type = excluded.relationship_type,
    data_scope = excluded.data_scope,
    is_active = true,
    updated_at = now();

-- Cette ancienne table représente encore les émetteurs des numéros de membre
-- utilisés par le code actuel. I2 déplacera ces identifiants vers les FK de
-- governing_bodies; elle ne doit jamais être utilisée comme catalogue de sources.
comment on table public.external_organizations is
  'Legacy external identifier issuers. Scheduled to become external_credential_issuers in I2; not an external data source or governing-body catalog.';

-- Ces organismes émettent des adhésions ou identifiants externes. Leur présence
-- ici ne crée ni source technique ni règle sportive. I2 renommera ce catalogue
-- external_credential_issuers et déplacera les identifiants vers ce concept.
insert into public.external_organizations (code, name)
values
  ('CHEVAL_QUEBEC', 'Cheval Québec'),
  ('NSBA', 'National Snaffle Bit Association'),
  ('NBHA', 'National Barrel Horse Association')
on conflict (code) do update
set name = excluded.name,
    updated_at = now();

notify pgrst, 'reload schema';
