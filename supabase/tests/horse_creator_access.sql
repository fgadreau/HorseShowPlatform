\set ON_ERROR_STOP on

begin;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change,
  phone_change,
  phone_change_token,
  email_change_token_current,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '10000000-0000-0000-0000-000000000104',
  'authenticated',
  'authenticated',
  'horse.creator@example.test',
  crypt('phase1-password', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
)
on conflict (id) do update
set email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    updated_at = now();

insert into public.user_profiles (user_id, first_name, last_name, type_user)
values (
  '10000000-0000-0000-0000-000000000104',
  'Horse',
  'Creator',
  'owner'
)
on conflict (user_id) do update
set first_name = excluded.first_name,
    last_name = excluded.last_name,
    type_user = excluded.type_user,
    updated_at = now();

insert into public.organizations (
  id,
  name,
  short_name,
  slug,
  primary_contact_email,
  timezone,
  currency,
  tax_rate,
  created_by_user_id
)
values (
  '30000000-0000-0000-0000-000000000104',
  'Horse Creator Test Association',
  'HCTA',
  'horse-creator-test-association',
  'horse.creator@example.test',
  'America/Toronto',
  'CAD',
  13.00,
  (select id from public.user_profiles where user_id = '10000000-0000-0000-0000-000000000104')
)
on conflict (id) do update
set name = excluded.name,
    short_name = excluded.short_name,
    primary_contact_email = excluded.primary_contact_email,
    timezone = excluded.timezone,
    currency = excluded.currency,
    tax_rate = excluded.tax_rate,
    updated_at = now();

insert into public.organization_disciplines (
  id,
  organization_id,
  discipline_id,
  is_default,
  is_active,
  created_by_user_id
)
select
  '33000000-0000-0000-0000-000000000104',
  '30000000-0000-0000-0000-000000000104',
  discipline.id,
  true,
  true,
  (select id from public.user_profiles where user_id = '10000000-0000-0000-0000-000000000104')
from public.disciplines discipline
where discipline.is_active
order by discipline.code
limit 1
on conflict (organization_id, discipline_id) do update
set is_default = true,
    is_active = true,
    updated_at = now();

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000104', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.contacts (
  id,
  type,
  first_name,
  last_name,
  email,
  linked_user_id,
  barn_name,
  created_by_user_id
)
values (
  '70000000-0000-0000-0000-000000000104',
  'owner',
  'Managed',
  'Owner',
  'managed.owner@example.test',
  (select id from public.user_profiles where user_id = '10000000-0000-0000-0000-000000000104'),
  'North Barn',
  (select id from public.user_profiles where user_id = '10000000-0000-0000-0000-000000000104')
);

do $$
declare
  visible_contacts integer;
begin
  select count(*) into visible_contacts
  from public.contacts
  where id = '70000000-0000-0000-0000-000000000104';

  if visible_contacts <> 1 then
    raise exception 'Expected creator to see created contact, got %', visible_contacts;
  end if;
end;
$$;

insert into public.directory_contacts (
  organization_discipline_id,
  contact_id,
  source,
  created_by_user_id
)
values (
  '33000000-0000-0000-0000-000000000104',
  '70000000-0000-0000-0000-000000000104',
  'relationship',
  (select id from public.user_profiles where user_id = '10000000-0000-0000-0000-000000000104')
)
on conflict (organization_discipline_id, contact_id) do nothing;

insert into public.horses (
  id,
  name,
  breed,
  color,
  gender,
  registration_number,
  primary_owner_contact_id,
  created_by_user_id
)
values (
  '80000000-0000-0000-0000-000000000104',
  'Creator Access Test',
  'Quarter Horse',
  'Bay',
  'G',
  'HCTA-104',
  '70000000-0000-0000-0000-000000000104',
  (select id from public.user_profiles where user_id = '10000000-0000-0000-0000-000000000104')
);

insert into public.directory_horses (
  organization_discipline_id,
  horse_id,
  source,
  created_by_user_id
)
values (
  '33000000-0000-0000-0000-000000000104',
  '80000000-0000-0000-0000-000000000104',
  'manual',
  (select id from public.user_profiles where user_id = '10000000-0000-0000-0000-000000000104')
)
on conflict (organization_discipline_id, horse_id) do nothing;

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
  '80000000-0000-0000-0000-000000000104',
  '70000000-0000-0000-0000-000000000104',
  'owner',
  true,
  true,
  true,
  true
);

do $$
declare
  visible_horses integer;
  visible_links integer;
begin
  select count(*) into visible_horses
  from public.horses
  where id = '80000000-0000-0000-0000-000000000104';

  select count(*) into visible_links
  from public.directory_horses
  where horse_id = '80000000-0000-0000-0000-000000000104';

  if visible_horses <> 1 or visible_links <> 1 then
    raise exception 'Expected creator to see created horse and link, got %, %', visible_horses, visible_links;
  end if;
end;
$$;

reset role;
rollback;
