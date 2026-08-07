\set ON_ERROR_STOP on

begin;

do $$
declare
  nrha_source_id uuid;
begin
  select id into nrha_source_id
  from public.external_data_sources
  where code = 'NRHA_ELIGIBILITY_API'
    and operational_status = 'available';

  if nrha_source_id is null or not exists (
    select 1
    from public.external_source_governing_bodies source_body
    join public.governing_bodies body on body.id = source_body.governing_body_id
    where source_body.external_data_source_id = nrha_source_id
      and body.code = 'NRHA'
      and source_body.data_scope @> '{"operations":["eligibility_check"]}'::jsonb
  ) then
    raise exception 'Expected a distinct NRHA eligibility source linked to the NRHA governing body';
  end if;

  raise notice 'ok - NRHA eligibility source is separate from member and horse lookup';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

with snapshot as (
  insert into public.external_data_snapshots (
    external_data_source_id,
    source_record_key,
    status,
    effective_at,
    expires_at,
    payload
  )
  select
    source.id,
    'nrha|1100|123|456|2026-06-12',
    'verified',
    '2026-06-12T12:00:00Z',
    '2026-06-12T18:00:00Z',
    '{"eligible":true}'::jsonb
  from public.external_data_sources source
  where source.code = 'NRHA_ELIGIBILITY_API'
  returning id
)
insert into public.team_eligibility_snapshots (
  snapshot_id,
  horse_id,
  rider_contact_id,
  show_id,
  class_id,
  governing_body_id
)
select
  snapshot.id,
  '80000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  body.id
from snapshot
join public.governing_bodies body on body.code = 'NRHA';

insert into public.team_eligibility_decisions (
  organization_id,
  show_id,
  class_id,
  governing_body_id,
  horse_id,
  rider_contact_id,
  reference_date,
  status,
  can_proceed,
  reasons,
  input_fingerprint,
  source_mode,
  external_snapshot_id,
  checked_at,
  expires_at
)
select
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  body.id,
  '80000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002',
  '2026-06-12',
  'eligible',
  true,
  '[]'::jsonb,
  'nrha|1100|123|456|2026-06-12',
  'live_external',
  snapshot.snapshot_id,
  '2026-06-12T12:00:00Z',
  '2026-06-12T18:00:00Z'
from public.governing_bodies body
join public.team_eligibility_snapshots snapshot
  on snapshot.governing_body_id = body.id
 and snapshot.class_id = '60000000-0000-0000-0000-000000000001'
where body.code = 'NRHA';

do $$
begin
  if not exists (
    select 1
    from public.team_eligibility_decisions decision
    join public.external_data_snapshots snapshot on snapshot.id = decision.external_snapshot_id
    where decision.class_id = '60000000-0000-0000-0000-000000000001'
      and decision.horse_id = '80000000-0000-0000-0000-000000000001'
      and decision.rider_contact_id = '70000000-0000-0000-0000-000000000002'
      and decision.reference_date = '2026-06-12'
      and decision.status = 'eligible'
      and decision.can_proceed
      and decision.expires_at = '2026-06-12T18:00:00Z'
      and snapshot.payload ->> 'eligible' = 'true'
  ) then
    raise exception 'Expected separate linked evidence and eligibility decision with TTL';
  end if;

  update public.team_eligibility_snapshots
  set show_id = '40000000-0000-0000-0000-000000000002'
  where class_id = '60000000-0000-0000-0000-000000000001';

  if found then
    raise exception 'Expected immutable eligibility snapshot links';
  end if;

  begin
    insert into public.team_eligibility_decisions (
      organization_id, show_id, class_id, governing_body_id, horse_id, rider_contact_id,
      reference_date, status, can_proceed, reasons, input_fingerprint, source_mode
    )
    select
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000001',
      body.id,
      '80000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000002',
      '2026-06-12', 'eligible', true, '[]'::jsonb, 'bad-context', 'local'
    from public.governing_bodies body where body.code = 'NRHA';
    raise exception 'Expected mismatched class/show/organization context to be refused';
  exception
    when raise_exception then
      if sqlerrm = 'Expected mismatched class/show/organization context to be refused' then
        raise;
      end if;
  end;

  raise notice 'ok - eligibility proof, decision, TTL and FK context are enforced';
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);

do $$
begin
  if exists (
    select 1 from public.team_eligibility_decisions
    where organization_id = '30000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Another association must not read eligibility decisions for an inaccessible team';
  end if;

  raise notice 'ok - eligibility decisions remain scoped by association and team access';
end;
$$;

rollback;
