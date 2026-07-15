\set ON_ERROR_STOP on

begin;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  candidate record;
begin
  select *
  into candidate
  from public.search_contact_identity_candidates(
    '30000000-0000-0000-0000-000000000002',
    'Phase1',
    null,
    'Owner A',
    'phase1.owner-a@example.test',
    null,
    null,
    5
  )
  where contact_id = '70000000-0000-0000-0000-000000000001';

  if candidate.contact_id is null or not candidate.email_exact then
    raise exception 'Expected the global contact search to find the exact email across associations';
  end if;

  if candidate.email_hint = 'phase1.owner-a@example.test' then
    raise exception 'Cross-association search must not expose the complete email';
  end if;

  raise notice 'ok - staff finds a safe cross-association contact candidate';
end;
$$;

do $$
declare
  candidate record;
begin
  select *
  into candidate
  from public.search_horse_identity_candidates(
    '30000000-0000-0000-0000-000000000002',
    'Phase One Wiz',
    'P1-A-001',
    null,
    null,
    'G',
    '70000000-0000-0000-0000-000000000003',
    5
  )
  where horse_id = '80000000-0000-0000-0000-000000000001';

  if candidate.horse_id is null or not candidate.registration_exact then
    raise exception 'Expected the global horse search to prioritize the exact registration number';
  end if;

  raise notice 'ok - staff finds a typo-tolerant horse candidate with exact registration';
end;
$$;

do $$
declare
  signature_value text;
  remaining integer;
  different_owner_remaining integer;
begin
  select search_signature
  into signature_value
  from public.search_horse_identity_candidates(
    '30000000-0000-0000-0000-000000000002',
    'Phase One Wiz',
    'P1-A-001',
    null,
    null,
    'G',
    '70000000-0000-0000-0000-000000000003',
    5
  )
  where horse_id = '80000000-0000-0000-0000-000000000001';

  perform public.dismiss_horse_identity_candidate(
    '30000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000001',
    signature_value,
    'confirmed_distinct_by_test'
  );

  select count(*)
  into remaining
  from public.search_horse_identity_candidates(
    '30000000-0000-0000-0000-000000000002',
    'Phase One Wiz',
    'P1-A-001',
    null,
    null,
    'G',
    '70000000-0000-0000-0000-000000000003',
    5
  )
  where horse_id = '80000000-0000-0000-0000-000000000001';

  if remaining <> 0 then
    raise exception 'Dismissed candidate must stay hidden for the same identity signature';
  end if;

  select count(*)
  into different_owner_remaining
  from public.search_horse_identity_candidates(
    '30000000-0000-0000-0000-000000000002',
    'Phase One Wiz',
    'P1-A-001',
    null,
    null,
    'G',
    '70000000-0000-0000-0000-000000000001',
    5
  )
  where horse_id = '80000000-0000-0000-0000-000000000001';

  if different_owner_remaining <> 1 then
    raise exception 'A dismissal for one proposed owner must not hide a different owner search';
  end if;

  raise notice 'ok - a confirmed false positive is remembered for the same proposed identity';
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.parameters
    where specific_schema = 'public'
      and specific_name like 'search_contact_identity_candidates%'
      and parameter_name ilike '%barn%'
  ) then
    raise exception 'Barn must never be part of contact identity similarity';
  end if;

  raise notice 'ok - barn is not an identity-search input';
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

do $$
begin
  begin
    perform *
    from public.search_contact_identity_candidates(
      '30000000-0000-0000-0000-000000000002',
      'Phase1',
      null,
      'Owner B',
      'phase1.owner-b@example.test',
      null,
      null,
      5
    );
  exception
    when insufficient_privilege then
      raise notice 'ok - non-staff users cannot search global identities';
      return;
  end;

  raise exception 'Expected global identity search to be denied to non-staff users';
end;
$$;

rollback;
