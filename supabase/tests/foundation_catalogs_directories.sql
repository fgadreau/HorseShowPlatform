\set ON_ERROR_STOP on

begin;

insert into public.disciplines (id, code, name)
values
  ('d1000000-0000-0000-0000-000000000001', 'TEST_REINING', 'Test Reining'),
  ('d1000000-0000-0000-0000-000000000002', 'TEST_GYMKHANA', 'Test Gymkhana');

update public.organization_disciplines
set is_default = false
where organization_id = '30000000-0000-0000-0000-000000000001';

insert into public.organization_disciplines (
  id,
  organization_id,
  discipline_id,
  is_default
)
values (
  'd2000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  true
);

do $$
begin
  begin
    insert into public.organization_disciplines (
      id,
      organization_id,
      discipline_id,
      is_default
    )
    values (
      'd2000000-0000-0000-0000-000000000002',
      '30000000-0000-0000-0000-000000000001',
      'd1000000-0000-0000-0000-000000000002',
      true
    );
  exception
    when unique_violation then
      raise notice 'ok - one default discipline per organization';
      return;
  end;

  raise exception 'Expected a unique violation for a second default discipline';
end;
$$;

insert into public.directory_contacts (
  id,
  organization_discipline_id,
  contact_id,
  source
)
values (
  'd3000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000004',
  'manual'
);

insert into public.horses (
  id,
  name,
  gender,
  primary_owner_contact_id,
  created_by_user_id
)
values (
  'd4100000-0000-0000-0000-000000000001',
  'Foundation Directory Test Horse',
  'G',
  '70000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004'
);

insert into public.directory_horses (
  id,
  organization_discipline_id,
  horse_id,
  source
)
values (
  'd4000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001',
  'd4100000-0000-0000-0000-000000000001',
  'manual'
);

do $$
begin
  begin
    insert into public.slates (
      id,
      organization_id,
      show_id,
      name
    )
    values (
      'd5000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000001',
      'Invalid cross-organization slate'
    );
  exception
    when check_violation then
      raise notice 'ok - slate organization must match show organization';
      return;
  end;

  raise exception 'Expected a context violation for a cross-organization slate';
end;
$$;

delete from public.organization_deadline_policies
where organization_id = '30000000-0000-0000-0000-000000000001';

insert into public.organization_deadline_policies (organization_id)
values ('30000000-0000-0000-0000-000000000001');

do $$
declare
  policy_record public.organization_deadline_policies%rowtype;
begin
  select *
  into policy_record
  from public.organization_deadline_policies
  where organization_id = '30000000-0000-0000-0000-000000000001';

  if policy_record.entry_deadline_mode <> 'block'
    or policy_record.entry_days_before <> 1
    or policy_record.entry_local_time <> time '18:00' then
    raise exception 'Unexpected default entry deadline policy: %', row_to_json(policy_record);
  end if;

  raise notice 'ok - default entry deadline is per block, previous day at 18:00';
end;
$$;

update public.shows
set
  entry_deadline_mode = 'show',
  entries_close_at = '2026-06-25 18:00:00-04'::timestamptz,
  reservations_close_at = '2026-06-20 18:00:00-04'::timestamptz
where id = '40000000-0000-0000-0000-000000000001';

do $$
declare
  show_record public.shows%rowtype;
begin
  select *
  into show_record
  from public.shows
  where id = '40000000-0000-0000-0000-000000000001';

  if show_record.entry_deadline_mode <> 'show'
    or show_record.entries_close_at is null
    or show_record.reservations_close_at is null
    or show_record.entries_close_at = show_record.reservations_close_at then
    raise exception 'Show entry and reservation deadlines were not stored independently';
  end if;

  raise notice 'ok - show entry and reservation deadlines are independent';
end;
$$;

rollback;
