-- Run on a migrated test database. Every fixture is rolled back.
begin;
do $$
declare
  test_user uuid := gen_random_uuid();
  test_profile uuid;
  test_org uuid := gen_random_uuid();
  private_org uuid := gen_random_uuid();
  reining_id uuid;
  reining_directory uuid := gen_random_uuid();
  test_contact uuid;
begin
  if has_function_privilege('anon', 'public.ensure_default_reining_directory(uuid)', 'EXECUTE') then
    raise exception 'Anonymous callers must not be allowed';
  end if;
  select id into strict reining_id from public.disciplines where code = 'REINING';
  insert into auth.users (id, email, raw_user_meta_data)
    values (test_user, test_user::text || '@example.test', '{"first_name":"Mobile","last_name":"Pilot"}');
  select id into strict test_profile from public.user_profiles where user_id = test_user;
  insert into public.organizations (id, name, slug, is_test_mode)
    values (test_org, 'Mobile UI test', 'mobile-test-' || test_org, true),
      (private_org, 'Private UI test', 'mobile-private-' || private_org, true);
  insert into public.organization_disciplines (id, organization_id, discipline_id, is_active)
    values (reining_directory, test_org, reining_id, true),
      (gen_random_uuid(), private_org, reining_id, true);
  insert into public.shows (organization_id, name, slug, start_date, end_date, is_public)
    values (test_org, 'Mobile pilot test', 'mobile-show-' || test_org, current_date, current_date, true);

  perform set_config('request.jwt.claim.sub', test_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', test_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if public.ensure_default_reining_directory(private_org) is not null then
    raise exception 'A private association must not enroll a non-member';
  end if;
  if public.ensure_default_reining_directory(test_org) is distinct from reining_directory then
    raise exception 'A new participant must receive Reining';
  end if;
  if public.ensure_default_reining_directory(test_org) is not null then
    raise exception 'Existing directory selection must be preserved';
  end if;
  reset role;

  select id into strict test_contact from public.contacts where linked_user_id = test_profile;
  if (select count(*) from public.directory_contacts where contact_id = test_contact) <> 1 then
    raise exception 'Initialization must be idempotent';
  end if;
  if exists (select 1 from public.organization_members where user_id = test_profile)
    or exists (select 1 from public.contact_organization_memberships where contact_id = test_contact) then
    raise exception 'Initialization must not grant roles or purchase memberships';
  end if;

  -- A pre-existing choice of another discipline must not be replaced.
  delete from public.directory_contacts where contact_id = test_contact;
  insert into public.disciplines (code, name) values ('MOBILE_TEST_' || test_org::text, 'Test discipline') returning id into reining_id;
  insert into public.organization_disciplines (organization_id, discipline_id) values (test_org, reining_id) returning id into reining_id;
  insert into public.directory_contacts (organization_discipline_id, contact_id, source)
    values (reining_id, test_contact, 'manual');
  set local role authenticated;
  if public.ensure_default_reining_directory(test_org) is not null then
    raise exception 'An existing non-Reining selection must be retained';
  end if;
  reset role;
  if exists (select 1 from public.directory_contacts where contact_id = test_contact and organization_discipline_id = reining_directory) then
    raise exception 'Reining must not override an explicit selection';
  end if;
end;
$$;
rollback;
