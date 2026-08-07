\set ON_ERROR_STOP on

begin;

do $$
declare
  source_count integer;
  planned_count integer;
  nrha_source_count integer;
begin
  if to_regclass('public.organizations') is null
    or to_regclass('public.governing_bodies') is null
    or to_regclass('public.external_credential_issuers') is null
    or to_regclass('public.external_data_sources') is null
    or to_regclass('public.contact_external_identifiers') is null
    or to_regclass('public.external_data_snapshots') is null then
    raise exception 'Expected tenants, governing bodies, credential issuers, sources, identifiers and snapshots to be distinct';
  end if;

  if to_regclass('public.external_organizations') is not null
    or to_regclass('public.contact_external_memberships') is not null
    or to_regclass('public.horse_external_memberships') is not null then
    raise exception 'Legacy ambiguous external organization or membership tables must be removed';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'external_data_sources'
      and column_name = 'organization_id'
  ) then
    raise exception 'An external data source must not belong to an HSP organization tenant';
  end if;

  select count(*) into source_count
  from public.external_data_sources
  where code in (
    'GENERIC_MANUAL_IMPORT',
    'GENERIC_DOCUMENT',
    'NRHA_LIST_IMPORT',
    'NRHA_MEMBER_LOOKUP',
    'NRHA_ELIGIBILITY_API',
    'NRHA_PUBLIC_REGISTRY',
    'AQHA_PUBLIC_REGISTRY'
  );

  select count(*) into planned_count
  from public.external_data_sources
  where code in ('NRHA_PUBLIC_REGISTRY', 'AQHA_PUBLIC_REGISTRY')
    and operational_status = 'planned';

  select count(*) into nrha_source_count
  from public.external_source_governing_bodies link
  join public.external_data_sources source on source.id = link.external_data_source_id
  join public.governing_bodies body on body.id = link.governing_body_id
  where body.code = 'NRHA'
    and source.code in ('NRHA_LIST_IMPORT', 'NRHA_MEMBER_LOOKUP', 'NRHA_ELIGIBILITY_API', 'NRHA_PUBLIC_REGISTRY');

  if source_count <> 7 or planned_count <> 2 or nrha_source_count <> 4 then
    raise exception 'Unexpected source catalog: sources %, planned %, NRHA links %', source_count, planned_count, nrha_source_count;
  end if;

  raise notice 'ok - external sources are distinct, extensible technical channels';
end;
$$;

do $$
declare
  opts_count integer;
begin
  select count(*) into opts_count
  from public.external_credential_issuers
  where code in ('CHEVAL_QUEBEC', 'ONTARIO_EQUESTRIAN')
    and issuer_type = 'provincial_territorial_sport_organization'
    and country_code = 'CA'
    and subdivision_code in ('CA-QC', 'CA-ON')
    and metadata ->> 'opts' = 'true';

  if opts_count <> 2 then
    raise exception 'Expected Quebec and Ontario OPTS issuers to share one configurable model';
  end if;

  if exists (
    select 1
    from public.external_data_sources source
    where source.code like 'CHEVAL_QUEBEC%'
       or source.code like 'ONTARIO_EQUESTRIAN%'
  ) then
    raise exception 'An OPTS membership issuer must not imply a technical connector';
  end if;

  raise notice 'ok - OPTS is a configurable issuer category, not Cheval Quebec-specific logic';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  visible_sources integer;
begin
  select count(*) into visible_sources
  from public.external_data_sources;

  if visible_sources <> 7 then
    raise exception 'Association staff should see the active source catalog, got %', visible_sources;
  end if;

  begin
    insert into public.external_data_sources (code, name, source_type)
    values ('ORG_B_PRIVATE_SOURCE', 'Unauthorized source', 'api');
  exception
    when insufficient_privilege then
      raise notice 'ok - association staff can read but cannot redefine the global source catalog';
      return;
  end;

  raise exception 'Association staff unexpectedly changed the global source catalog';
end;
$$;

insert into public.organization_external_credential_requirements (
  organization_id,
  external_credential_issuer_id,
  contact_type,
  identifier_type,
  requirement_group_code,
  match_rule,
  validity_rule,
  enforcement_mode,
  is_required
)
select
  '30000000-0000-0000-0000-000000000002',
  issuer.id,
  'owner',
  'membership',
  'opts',
  'at_least_one',
  'active_on_reference_date',
  'blocking',
  true
from public.external_credential_issuers issuer
where issuer.code in ('CHEVAL_QUEBEC', 'ONTARIO_EQUESTRIAN');

insert into public.contact_external_identifiers (
  contact_id,
  external_credential_issuer_id,
  identifier_type,
  identifier_value,
  status,
  valid_from,
  expires_on,
  verified_at
)
select
  '70000000-0000-0000-0000-000000000003',
  issuer.id,
  'membership',
  'CQ-I2-TEST',
  'active',
  '2026-01-01',
  '2026-12-31',
  now()
from public.external_credential_issuers issuer
where issuer.code = 'CHEVAL_QUEBEC';

do $$
declare
  valid_membership_count integer;
  opts_option_count integer;
begin
  select count(*) into opts_option_count
  from public.organization_external_credential_requirements requirement
  where requirement.organization_id = '30000000-0000-0000-0000-000000000002'
    and requirement.contact_type = 'owner'
    and requirement.requirement_group_code = 'opts'
    and requirement.match_rule = 'at_least_one';

  select count(*) into valid_membership_count
  from public.organization_external_credential_requirements requirement
  join public.contact_external_identifiers identifier
    on identifier.external_credential_issuer_id = requirement.external_credential_issuer_id
   and identifier.identifier_type = requirement.identifier_type
  join public.external_credential_issuers issuer
    on issuer.id = requirement.external_credential_issuer_id
  where requirement.organization_id = '30000000-0000-0000-0000-000000000002'
    and requirement.contact_type = 'owner'
    and requirement.requirement_group_code = 'opts'
    and requirement.match_rule = 'at_least_one'
    and requirement.validity_rule = 'active_on_reference_date'
    and requirement.is_required
    and identifier.contact_id = '70000000-0000-0000-0000-000000000003'
    and identifier.status = 'active'
    and identifier.valid_from <= '2026-07-10'
    and identifier.expires_on >= '2026-07-10'
    and issuer.code = 'CHEVAL_QUEBEC';

  if opts_option_count <> 2 or valid_membership_count <> 1 then
    raise exception 'Expected one active membership to satisfy two accepted OPTS alternatives, options %, valid %', opts_option_count, valid_membership_count;
  end if;

  raise notice 'ok - an association can require active OPTS membership independently of discipline';
end;
$$;

with snapshot as (
  insert into public.external_data_snapshots (
    external_data_source_id,
    status,
    effective_at,
    payload
  )
  select source.id, 'verified', now(), '{"membership_status":"active"}'::jsonb
  from public.external_data_sources source
  where source.code = 'GENERIC_DOCUMENT'
  returning id
)
insert into public.external_data_snapshot_contacts (snapshot_id, contact_id)
select id, '70000000-0000-0000-0000-000000000003'
from snapshot;

do $$
declare
  snapshot_count integer;
begin
  select count(*) into snapshot_count
  from public.external_data_snapshots snapshot
  join public.external_data_snapshot_contacts link on link.snapshot_id = snapshot.id
  where link.contact_id = '70000000-0000-0000-0000-000000000003'
    and snapshot.payload ->> 'membership_status' = 'active';

  if snapshot_count <> 1 then
    raise exception 'Expected immutable external evidence linked to the contact identifier';
  end if;

  raise notice 'ok - external evidence is stored separately from the identity and requirement decision';
end;
$$;

reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.external_credential_issuers (
  code,
  name,
  issuer_type,
  country_code,
  subdivision_code,
  metadata
)
values (
  'ALBERTA_EQUESTRIAN_TEST',
  'Alberta Equestrian test issuer',
  'provincial_territorial_sport_organization',
  'CA',
  'CA-AB',
  '{"opts":true}'::jsonb
);

insert into public.external_data_sources (
  code,
  name,
  source_type,
  operational_status,
  capabilities
)
values (
  'FUTURE_PROVIDER_TEST',
  'Future provider test',
  'api',
  'planned',
  '{"subjects":["horse"],"operations":["lookup"]}'::jsonb
);

do $$
declare
  future_source_count integer;
  future_opts_count integer;
begin
  select count(*) into future_source_count
  from public.external_data_sources
  where code = 'FUTURE_PROVIDER_TEST';

  select count(*) into future_opts_count
  from public.external_credential_issuers
  where code = 'ALBERTA_EQUESTRIAN_TEST'
    and subdivision_code = 'CA-AB';

  if future_source_count <> 1 or future_opts_count <> 1 then
    raise exception 'Expected future sources and OPTS issuers to be data additions only';
  end if;

  raise notice 'ok - another province or technical provider requires data only, not a schema change';
end;
$$;

reset role;
rollback;
