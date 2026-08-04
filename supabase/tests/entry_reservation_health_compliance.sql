\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regprocedure('public.assert_horse_health_compliance_for_show(uuid,uuid)') is null then
    raise exception 'Expected show-scoped health compliance assertion';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'entries_zz_enforce_health_compliance'
      and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'stall_bookings_zz_enforce_health_compliance'
      and not tgisinternal
  ) then
    raise exception 'Expected central health compliance triggers';
  end if;
end;
$$;

-- Le document date du 15 janvier. Avec une validite d'un mois, il est expire
-- a la date exacte du concours du 12 juin, meme si le test est execute un autre jour.
update public.organization_health_policies
set coggins_required = true,
    coggins_validity_months = 1,
    influenza_required = false,
    rhino_required = false,
    identity_validation_requirement = 'none',
    association_review_required = false,
    enforcement_mode = 'blocking'
where organization_id = '30000000-0000-0000-0000-000000000001'
  and effective_from = '1900-01-01';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

do $$
declare
  blocked_message text;
  blocked_detail text;
begin
  begin
    perform public.assert_horse_health_compliance_for_show(
      '80000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001'
    );
    raise exception 'Blocking policy unexpectedly allowed expired health documents';
  exception when check_violation then
    get stacked diagnostics
      blocked_message = message_text,
      blocked_detail = pg_exception_detail;

    if blocked_message <> 'HSP_HEALTH_COMPLIANCE_BLOCKED'
      or (blocked_detail::jsonb)->>'reference_date' <> '2026-06-12'
      or (blocked_detail::jsonb)->>'enforcement_mode' <> 'blocking'
      or not ((blocked_detail::jsonb)->'reasons' @> '[{"code":"health.coggins.expired"}]'::jsonb)
    then
      raise exception 'Unexpected blocking health error: % / %', blocked_message, blocked_detail;
    end if;
  end;

  raise notice 'ok - blocking uses the exact show date and returns stable reasons';
end;
$$;

do $$
begin
  begin
    insert into public.entries (
      id, organization_id, show_id, horse_id, class_id, created_by_user_id,
      owner_contact_id, rider_contact_id, payer_contact_id, status
    ) values (
      '96000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      '60000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000004',
      '70000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000002',
      '70000000-0000-0000-0000-000000000001',
      'draft'
    );
    raise exception 'Entry trigger did not enforce blocking health policy';
  exception when check_violation then
    if sqlerrm <> 'HSP_HEALTH_COMPLIANCE_BLOCKED' then
      raise;
    end if;
  end;

  begin
    insert into public.stall_bookings (
      id, organization_id, show_id, stall_option_id, horse_id,
      created_by_user_id, booker_contact_id, payer_contact_id, status,
      show_day_start_id, show_day_end_id, quantity
    ) values (
      '96000000-0000-0000-0000-000000000002',
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001',
      '80000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000004',
      '70000000-0000-0000-0000-000000000001',
      '70000000-0000-0000-0000-000000000001',
      'requested',
      '41000000-0000-0000-0000-000000000001',
      '41000000-0000-0000-0000-000000000001',
      1
    );
    raise exception 'Reservation trigger did not enforce blocking health policy';
  exception when check_violation then
    if sqlerrm <> 'HSP_HEALTH_COMPLIANCE_BLOCKED' then
      raise;
    end if;
  end;

  raise notice 'ok - entries and horse-linked reservations share the central block';
end;
$$;

reset role;
update public.organization_health_policies
set enforcement_mode = 'warning'
where organization_id = '30000000-0000-0000-0000-000000000001'
  and effective_from = '1900-01-01';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

insert into public.entries (
  id, organization_id, show_id, horse_id, class_id, created_by_user_id,
  owner_contact_id, rider_contact_id, payer_contact_id, status
) values (
  '96000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000004',
  '70000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002',
  '70000000-0000-0000-0000-000000000001',
  'draft'
);

insert into public.stall_bookings (
  id, organization_id, show_id, stall_option_id, horse_id,
  created_by_user_id, booker_contact_id, payer_contact_id, status,
  show_day_start_id, show_day_end_id, quantity
) values (
  '96000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004',
  '70000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  'requested',
  '41000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  1
);

do $$
declare
  result jsonb;
begin
  result := public.assert_horse_health_compliance_for_show(
    '80000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000001'
  );

  if (result->>'can_proceed')::boolean is not true
    or result->>'compliance_status' <> 'non_compliant'
    or result->>'enforcement_mode' <> 'warning'
  then
    raise exception 'Warning policy should retain non-compliance and allow operations: %', result;
  end if;

  raise notice 'ok - warning mode preserves the visible issue without blocking';
end;
$$;

reset role;
update public.organization_health_policies
set enforcement_mode = 'blocking'
where organization_id = '30000000-0000-0000-0000-000000000001'
  and effective_from = '1900-01-01';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

update public.entries
set status = 'cancelled'
where id = '96000000-0000-0000-0000-000000000001';

update public.stall_bookings
set status = 'cancelled'
where id = '96000000-0000-0000-0000-000000000002';

insert into public.stall_bookings (
  id, organization_id, show_id, stall_option_id, horse_id,
  created_by_user_id, booker_contact_id, payer_contact_id, status,
  show_day_start_id, show_day_end_id, quantity
) values (
  '96000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000005',
  null,
  '20000000-0000-0000-0000-000000000004',
  '70000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  'requested',
  '41000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  1
);

do $$
begin
  if not exists (select 1 from public.entries where id = '96000000-0000-0000-0000-000000000001' and status = 'cancelled')
    or not exists (select 1 from public.stall_bookings where id = '96000000-0000-0000-0000-000000000002' and status = 'cancelled')
    or not exists (select 1 from public.stall_bookings where id = '96000000-0000-0000-0000-000000000003' and horse_id is null)
  then
    raise exception 'Cancellation or non-horse reservation was unexpectedly blocked';
  end if;

  raise notice 'ok - cancellations and reservations without a horse stay available';
end;
$$;

rollback;
