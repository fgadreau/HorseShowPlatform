\set ON_ERROR_STOP on

begin;

\ir ../seed.sql

do $$
declare
  insecure_views text[];
  trigger_count integer;
begin
  select array_agg(target_view order by target_view)
  into insecure_views
  from unnest(array['associations', 'days', 'association_memberships'])
    as target(target_view)
  where not exists (
    select 1
    from pg_class relation
    where relation.oid = format('public.%I', target_view)::regclass
      and coalesce(relation.reloptions, array[]::text[])
        @> array['security_invoker=true']
  );

  if insecure_views is not null then
    raise exception 'Compatibility views missing security_invoker=true: %', insecure_views;
  end if;

  select count(*)
  into trigger_count
  from pg_trigger
  where not tgisinternal
    and tgrelid in (
      'public.associations'::regclass,
      'public.days'::regclass,
      'public.association_memberships'::regclass
    );

  if trigger_count <> 8 then
    raise exception 'Expected 8 compatibility view triggers, found %', trigger_count;
  end if;
end;
$$;

create schema if not exists compatibility_view_test;
grant usage on schema compatibility_view_test to anon, authenticated;

create or replace function compatibility_view_test.as_user(auth_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', auth_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create or replace function compatibility_view_test.assert_count(
  label text,
  query text,
  expected_count bigint
)
returns void
language plpgsql
as $$
declare
  actual_count bigint;
begin
  execute query into actual_count;
  if actual_count is distinct from expected_count then
    raise exception '% expected %, got %', label, expected_count, actual_count;
  end if;
  raise notice 'ok - %', label;
end;
$$;

grant execute on all functions in schema compatibility_view_test to anon, authenticated;
grant select on public.associations, public.days, public.association_memberships
  to anon, authenticated;
grant select on public.organizations, public.show_days, public.organization_members, public.user_profiles
  to anon, authenticated;

set local role anon;
select compatibility_view_test.assert_count(
  'anonymous users retain public association access',
  'select count(*) from public.associations',
  2
);
select compatibility_view_test.assert_count(
  'anonymous users cannot read private show days',
  'select count(*) from public.days',
  0
);
select compatibility_view_test.assert_count(
  'anonymous users cannot read memberships',
  'select count(*) from public.association_memberships',
  0
);
reset role;

set local role authenticated;
select compatibility_view_test.as_user('10000000-0000-0000-0000-000000000002');
select compatibility_view_test.assert_count(
  'organization admins read only their organization days',
  'select count(*) from public.days',
  1
);
select compatibility_view_test.assert_count(
  'organization admins read only their organization memberships',
  'select count(*) from public.association_memberships',
  2
);
reset role;

set local role authenticated;
select compatibility_view_test.as_user('10000000-0000-0000-0000-000000000004');
select compatibility_view_test.assert_count(
  'non-member owners cannot read memberships',
  'select count(*) from public.association_memberships',
  0
);
reset role;

rollback;
