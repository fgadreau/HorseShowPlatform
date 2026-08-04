\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regclass('public.contact_organization_links') is not null
    or to_regclass('public.horse_organization_links') is not null then
    raise exception 'Legacy organization link tables must be physically removed';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'organization_id'
      and table_name in ('contacts', 'horses', 'horse_contacts')
  ) then
    raise exception 'Global identity tables must not retain organization_id';
  end if;

  raise notice 'ok - legacy identity organization paths are physically removed';
end;
$$;

-- L'admin B rattache un contact et un cheval A a son repertoire REINING.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.directory_contacts (
  organization_discipline_id,
  contact_id,
  source,
  created_by_user_id
)
values (
  '33000000-0000-0000-0000-000000000002',
  '70000000-0000-0000-0000-000000000001',
  'manual',
  '20000000-0000-0000-0000-000000000006'
);

insert into public.directory_horses (
  organization_discipline_id,
  horse_id,
  source,
  created_by_user_id
)
values (
  '33000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000001',
  'manual',
  '20000000-0000-0000-0000-000000000006'
);

do $$
begin
  if not public.contact_is_linked_to_org(
    '70000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002'
  ) or not public.horse_is_linked_to_org(
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'Expected directory links to grant organization membership';
  end if;

  if not public.can_access_contact('70000000-0000-0000-0000-000000000001')
    or not public.can_access_horse('80000000-0000-0000-0000-000000000001') then
    raise exception 'Directory staff must be able to read linked identities';
  end if;

  if public.can_manage_contact_identity('70000000-0000-0000-0000-000000000001')
    or public.can_manage_horse_identity('80000000-0000-0000-0000-000000000001') then
    raise exception 'Directory staff must not gain global identity edit rights';
  end if;

  raise notice 'ok - staff can link and read, but cannot edit global identity';
end;
$$;

do $$
declare
  affected_rows integer;
begin
  update public.contacts
  set last_name = 'Unauthorized change'
  where id = '70000000-0000-0000-0000-000000000001';

  get diagnostics affected_rows = row_count;

  if affected_rows <> 0 then
    raise exception 'Expected association admin contact identity update to affect zero rows';
  end if;

  raise notice 'ok - association admin identity update denied by RLS';
end;
$$;

-- Le même élément peut appartenir à plusieurs disciplines; retirer une liaison
-- ne supprime ni la fiche globale ni ses autres répertoires.
insert into public.directory_contacts (
  organization_discipline_id,
  contact_id,
  source,
  created_by_user_id
)
values (
  '33000000-0000-0000-0000-000000000005',
  '70000000-0000-0000-0000-000000000001',
  'manual',
  '20000000-0000-0000-0000-000000000006'
);

insert into public.directory_horses (
  organization_discipline_id,
  horse_id,
  source,
  created_by_user_id
)
values (
  '33000000-0000-0000-0000-000000000005',
  '80000000-0000-0000-0000-000000000001',
  'manual',
  '20000000-0000-0000-0000-000000000006'
);

delete from public.directory_contacts
where organization_discipline_id = '33000000-0000-0000-0000-000000000002'
  and contact_id = '70000000-0000-0000-0000-000000000001';

delete from public.directory_horses
where organization_discipline_id = '33000000-0000-0000-0000-000000000002'
  and horse_id = '80000000-0000-0000-0000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.contacts
    where id = '70000000-0000-0000-0000-000000000001'
  ) or not exists (
    select 1 from public.horses
    where id = '80000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Removing a directory link must preserve global identities';
  end if;

  if not public.contact_is_linked_to_org(
    '70000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002'
  ) or not public.horse_is_linked_to_org(
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'The remaining discipline directory must preserve organization access';
  end if;

  raise notice 'ok - multi-discipline links are independent and identities survive unlinking';
end;
$$;

do $$
declare
  reused_contact public.contacts;
begin
  reused_contact := public.reuse_contact_by_email(
    '30000000-0000-0000-0000-000000000002',
    'owner',
    'Attempted',
    'Overwrite',
    'phase1.owner-a@example.test',
    '555-9999',
    'Wrong Barn',
    null,
    '20000000-0000-0000-0000-000000000006',
    array['owner']
  );

  if reused_contact.id <> '70000000-0000-0000-0000-000000000001'::uuid
    or reused_contact.first_name <> 'Phase1'
    or reused_contact.last_name <> 'Owner A'
    or reused_contact.phone is not null then
    raise exception 'Association reuse must not overwrite existing global identity';
  end if;

  raise notice 'ok - exact contact reuse links without overwriting identity';
end;
$$;

do $$
declare
  claimed public.organization_back_numbers;
begin
  claimed := public.claim_horse_back_number(
    '30000000-0000-0000-0000-000000000002',
    '80000000-0000-0000-0000-000000000001',
    811,
    'horse',
    null
  );

  if claimed.assigned_horse_id <> '80000000-0000-0000-0000-000000000001'::uuid
    or claimed.organization_id <> '30000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'Expected back number assignment through the directory link';
  end if;

  raise notice 'ok - back number eligibility uses directory membership';
end;
$$;

-- Une secretaire/admin peut creer le brouillon, etablir le proprietaire, puis
-- le placer au repertoire sans conserver un droit permanent sur l'identite.
insert into public.contacts (
  id,
  type,
  first_name,
  last_name,
  created_by_user_id
)
values (
  '70000000-0000-0000-0000-000000000099',
  'owner',
  'Directory',
  'Created Owner',
  '20000000-0000-0000-0000-000000000006'
);

insert into public.directory_contacts (
  organization_discipline_id,
  contact_id,
  source,
  created_by_user_id
)
values (
  '33000000-0000-0000-0000-000000000002',
  '70000000-0000-0000-0000-000000000099',
  'manual',
  '20000000-0000-0000-0000-000000000006'
);

insert into public.horses (
  id,
  name,
  primary_owner_contact_id,
  created_by_user_id
)
values (
  '80000000-0000-0000-0000-000000000099',
  'Directory Created Horse',
  '70000000-0000-0000-0000-000000000099',
  '20000000-0000-0000-0000-000000000006'
);

insert into public.horse_contacts (
  horse_id,
  contact_id,
  role,
  can_create_entries,
  can_modify_entries,
  can_book_stalls,
  can_pay_invoices
)
values (
  '80000000-0000-0000-0000-000000000099',
  '70000000-0000-0000-0000-000000000099',
  'owner',
  true,
  true,
  true,
  true
);

insert into public.directory_horses (
  organization_discipline_id,
  horse_id,
  source,
  created_by_user_id
)
values (
  '33000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000099',
  'manual',
  '20000000-0000-0000-0000-000000000006'
);

do $$
begin
  if public.can_manage_horse_identity('80000000-0000-0000-0000-000000000099') then
    raise exception 'Directory staff must lose draft identity authority after directory placement';
  end if;

  raise notice 'ok - staff draft authority ends after directory placement';
end;
$$;

reset role;

-- Le proprietaire lie conserve la gestion de sa fiche et de son cheval.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  if not public.can_manage_contact_identity('70000000-0000-0000-0000-000000000001')
    or not public.can_manage_horse_identity('80000000-0000-0000-0000-000000000001') then
    raise exception 'Expected linked owner to manage contact and horse identity';
  end if;

  raise notice 'ok - linked owner retains identity authority';
end;
$$;

reset role;
rollback;
