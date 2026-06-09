update public.contacts
set email = null
where email is not null
  and btrim(email) = '';

update public.contacts
set email = lower(btrim(email))
where email is not null
  and email is distinct from lower(btrim(email));

drop table if exists pg_temp.contact_global_dedup_map;

create temp table contact_global_dedup_map as
with ranked_contacts as (
  select
    id,
    lower(btrim(email)) as normalized_email,
    first_value(id) over (
      partition by lower(btrim(email))
      order by (linked_user_id is null), created_at, id
    ) as canonical_id
  from public.contacts
  where email is not null
)
select
  id as duplicate_id,
  canonical_id,
  normalized_email
from ranked_contacts
where id is distinct from canonical_id;

insert into public.contact_organization_links (
  organization_id,
  contact_id,
  source,
  created_by_user_id,
  created_at
)
select
  duplicate_contacts.organization_id,
  duplicate_map.canonical_id,
  'created_here',
  duplicate_contacts.created_by_user_id,
  duplicate_contacts.created_at
from contact_global_dedup_map duplicate_map
join public.contacts duplicate_contacts on duplicate_contacts.id = duplicate_map.duplicate_id
on conflict (organization_id, contact_id) do update
set
  created_by_user_id = coalesce(public.contact_organization_links.created_by_user_id, excluded.created_by_user_id),
  updated_at = now();

insert into public.contact_organization_links (
  organization_id,
  contact_id,
  source,
  created_by_user_id,
  created_at
)
select
  existing_links.organization_id,
  duplicate_map.canonical_id,
  (array_agg(existing_links.source order by existing_links.created_at, existing_links.id))[1],
  (array_agg(existing_links.created_by_user_id order by existing_links.created_at, existing_links.id) filter (where existing_links.created_by_user_id is not null))[1],
  min(existing_links.created_at)
from contact_global_dedup_map duplicate_map
join public.contact_organization_links existing_links on existing_links.contact_id = duplicate_map.duplicate_id
group by existing_links.organization_id, duplicate_map.canonical_id
on conflict (organization_id, contact_id) do update
set
  created_by_user_id = coalesce(public.contact_organization_links.created_by_user_id, excluded.created_by_user_id),
  updated_at = now();

with merged_values as (
  select
    duplicate_map.canonical_id,
    (array_agg(related_contacts.phone order by related_contacts.created_at, related_contacts.id) filter (where related_contacts.phone is not null and btrim(related_contacts.phone) <> ''))[1] as phone,
    (array_agg(related_contacts.barn_name order by related_contacts.created_at, related_contacts.id) filter (where related_contacts.barn_name is not null and btrim(related_contacts.barn_name) <> ''))[1] as barn_name,
    (array_agg(related_contacts.linked_user_id order by (related_contacts.linked_user_id is null), related_contacts.created_at, related_contacts.id) filter (where related_contacts.linked_user_id is not null))[1] as linked_user_id,
    (array_agg(related_contacts.created_by_user_id order by (related_contacts.created_by_user_id is null), related_contacts.created_at, related_contacts.id) filter (where related_contacts.created_by_user_id is not null))[1] as created_by_user_id,
    (array_agg(
      related_contacts.type
      order by
        case related_contacts.type
          when 'rider' then 1
          when 'owner' then 2
          when 'agent' then 3
          when 'payer' then 4
          else 5
        end,
        related_contacts.created_at,
        related_contacts.id
    ) filter (where related_contacts.type <> 'other'))[1] as contact_type
  from contact_global_dedup_map duplicate_map
  join public.contacts related_contacts
    on related_contacts.id = duplicate_map.duplicate_id
    or related_contacts.id = duplicate_map.canonical_id
  group by duplicate_map.canonical_id
)
update public.contacts canonical_contacts
set
  phone = coalesce(nullif(canonical_contacts.phone, ''), merged_values.phone),
  barn_name = coalesce(nullif(canonical_contacts.barn_name, ''), merged_values.barn_name),
  linked_user_id = coalesce(canonical_contacts.linked_user_id, merged_values.linked_user_id),
  created_by_user_id = coalesce(canonical_contacts.created_by_user_id, merged_values.created_by_user_id),
  type = case
    when canonical_contacts.type = 'other' and merged_values.contact_type is not null then merged_values.contact_type
    else canonical_contacts.type
  end,
  updated_at = now()
from merged_values
where canonical_contacts.id = merged_values.canonical_id;

do $$
begin
  if to_regclass('public.contact_roles') is not null then
    insert into public.contact_roles (
      organization_id,
      contact_id,
      role,
      source,
      created_at
    )
    select
      duplicate_contacts.organization_id,
      duplicate_map.canonical_id,
      duplicate_contacts.type,
      'contact_type',
      duplicate_contacts.created_at
    from contact_global_dedup_map duplicate_map
    join public.contacts duplicate_contacts on duplicate_contacts.id = duplicate_map.duplicate_id
    where duplicate_contacts.type in ('owner', 'agent', 'rider', 'payer', 'other')
    on conflict (organization_id, contact_id, role) do nothing;

    insert into public.contact_roles (
      organization_id,
      contact_id,
      role,
      source,
      created_at
    )
    select
      contact_roles.organization_id,
      duplicate_map.canonical_id,
      contact_roles.role,
      contact_roles.source,
      min(contact_roles.created_at)
    from public.contact_roles
    join contact_global_dedup_map duplicate_map on duplicate_map.duplicate_id = contact_roles.contact_id
    group by
      contact_roles.organization_id,
      duplicate_map.canonical_id,
      contact_roles.role,
      contact_roles.source
    on conflict (organization_id, contact_id, role) do nothing;

    delete from public.contact_roles
    using contact_global_dedup_map duplicate_map
    where contact_roles.contact_id = duplicate_map.duplicate_id;
  end if;
end;
$$;

insert into public.contact_external_memberships (
  contact_id,
  external_organization_id,
  membership_number,
  status,
  expires_on,
  verified_at,
  verification_source,
  verification_payload,
  created_at
)
select
  duplicate_map.canonical_id,
  contact_external_memberships.external_organization_id,
  contact_external_memberships.membership_number,
  contact_external_memberships.status,
  contact_external_memberships.expires_on,
  contact_external_memberships.verified_at,
  contact_external_memberships.verification_source,
  contact_external_memberships.verification_payload,
  contact_external_memberships.created_at
from public.contact_external_memberships
join contact_global_dedup_map duplicate_map on duplicate_map.duplicate_id = contact_external_memberships.contact_id
on conflict (contact_id, external_organization_id) do update
set
  membership_number = coalesce(nullif(public.contact_external_memberships.membership_number, ''), excluded.membership_number),
  status = case
    when public.contact_external_memberships.status = 'active' then public.contact_external_memberships.status
    when excluded.status = 'active' then excluded.status
    else public.contact_external_memberships.status
  end,
  expires_on = coalesce(public.contact_external_memberships.expires_on, excluded.expires_on),
  verified_at = coalesce(public.contact_external_memberships.verified_at, excluded.verified_at),
  verification_source = coalesce(public.contact_external_memberships.verification_source, excluded.verification_source),
  verification_payload = public.contact_external_memberships.verification_payload || excluded.verification_payload,
  updated_at = now();

delete from public.contact_external_memberships
using contact_global_dedup_map duplicate_map
where contact_external_memberships.contact_id = duplicate_map.duplicate_id;

insert into public.horse_contacts (
  organization_id,
  horse_id,
  contact_id,
  role,
  can_create_entries,
  can_modify_entries,
  can_book_stalls,
  can_pay_invoices,
  created_at
)
select
  horse_contacts.organization_id,
  horse_contacts.horse_id,
  duplicate_map.canonical_id,
  horse_contacts.role,
  bool_or(horse_contacts.can_create_entries),
  bool_or(horse_contacts.can_modify_entries),
  bool_or(horse_contacts.can_book_stalls),
  bool_or(horse_contacts.can_pay_invoices),
  min(horse_contacts.created_at)
from public.horse_contacts
join contact_global_dedup_map duplicate_map on duplicate_map.duplicate_id = horse_contacts.contact_id
group by
  horse_contacts.organization_id,
  horse_contacts.horse_id,
  duplicate_map.canonical_id,
  horse_contacts.role
on conflict (horse_id, contact_id, role) do update
set
  can_create_entries = public.horse_contacts.can_create_entries or excluded.can_create_entries,
  can_modify_entries = public.horse_contacts.can_modify_entries or excluded.can_modify_entries,
  can_book_stalls = public.horse_contacts.can_book_stalls or excluded.can_book_stalls,
  can_pay_invoices = public.horse_contacts.can_pay_invoices or excluded.can_pay_invoices,
  updated_at = now();

delete from public.horse_contacts
using contact_global_dedup_map duplicate_map
where horse_contacts.contact_id = duplicate_map.duplicate_id;

update public.horses
set primary_owner_contact_id = contact_global_dedup_map.canonical_id,
    updated_at = now()
from contact_global_dedup_map
where horses.primary_owner_contact_id = contact_global_dedup_map.duplicate_id;

update public.entries
set owner_contact_id = contact_global_dedup_map.canonical_id,
    updated_at = now()
from contact_global_dedup_map
where entries.owner_contact_id = contact_global_dedup_map.duplicate_id;

update public.entries
set rider_contact_id = contact_global_dedup_map.canonical_id,
    updated_at = now()
from contact_global_dedup_map
where entries.rider_contact_id = contact_global_dedup_map.duplicate_id;

update public.entries
set payer_contact_id = contact_global_dedup_map.canonical_id,
    updated_at = now()
from contact_global_dedup_map
where entries.payer_contact_id = contact_global_dedup_map.duplicate_id;

update public.stall_bookings
set booker_contact_id = contact_global_dedup_map.canonical_id,
    updated_at = now()
from contact_global_dedup_map
where stall_bookings.booker_contact_id = contact_global_dedup_map.duplicate_id;

update public.stall_bookings
set payer_contact_id = contact_global_dedup_map.canonical_id,
    updated_at = now()
from contact_global_dedup_map
where stall_bookings.payer_contact_id = contact_global_dedup_map.duplicate_id;

update public.invoices
set payer_contact_id = contact_global_dedup_map.canonical_id,
    updated_at = now()
from contact_global_dedup_map
where invoices.payer_contact_id = contact_global_dedup_map.duplicate_id;

do $$
begin
  if to_regclass('public.organization_back_numbers') is not null then
    update public.organization_back_numbers back_numbers
    set assigned_rider_contact_id = duplicate_map.canonical_id,
        updated_at = now()
    from contact_global_dedup_map duplicate_map
    where back_numbers.assigned_rider_contact_id = duplicate_map.duplicate_id
      and not exists (
        select 1
        from public.organization_back_numbers existing_back_numbers
        where existing_back_numbers.id <> back_numbers.id
          and existing_back_numbers.organization_id = back_numbers.organization_id
          and existing_back_numbers.status = 'assigned'
          and existing_back_numbers.assignment_mode = back_numbers.assignment_mode
          and existing_back_numbers.assigned_rider_contact_id = duplicate_map.canonical_id
          and (
            back_numbers.assignment_mode = 'rider'
            or existing_back_numbers.assigned_horse_id is not distinct from back_numbers.assigned_horse_id
          )
      );

    update public.organization_back_numbers back_numbers
    set status = 'available',
        assigned_rider_contact_id = null,
        assigned_at = null,
        updated_at = now()
    from contact_global_dedup_map duplicate_map
    where back_numbers.assigned_rider_contact_id = duplicate_map.duplicate_id;
  end if;
end;
$$;

delete from public.contacts
using contact_global_dedup_map duplicate_map
where contacts.id = duplicate_map.duplicate_id;

drop index if exists public.idx_contacts_org_email;
drop index if exists public.contacts_organization_normalized_email_key;

create unique index if not exists contacts_global_normalized_email_key
on public.contacts(lower(btrim(email)))
where email is not null;

drop table if exists pg_temp.contact_global_dedup_map;

create or replace function public.reuse_contact_by_email(
  target_organization_id uuid,
  target_type text,
  target_first_name text,
  target_last_name text,
  target_email text,
  target_phone text default null,
  target_barn_name text default null,
  target_linked_user_id uuid default null,
  target_created_by_user_id uuid default null,
  target_roles text[] default '{}'::text[]
)
returns public.contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := nullif(lower(btrim(target_email)), '');
  normalized_first_name text := nullif(btrim(target_first_name), '');
  normalized_last_name text := nullif(btrim(target_last_name), '');
  requester_profile_id uuid := public.current_profile_id();
  can_manage boolean := public.is_platform_admin() or public.is_org_member(target_organization_id, array['admin', 'secretary']);
  result_contact public.contacts;
  role_name text;
  requested_roles text[];
begin
  if requester_profile_id is null then
    raise exception 'Connecte-toi avant de creer un contact.';
  end if;

  if target_type not in ('owner', 'agent', 'rider', 'payer', 'other') then
    raise exception 'Type de contact invalide.'
      using errcode = 'check_violation';
  end if;

  if normalized_first_name is null or normalized_last_name is null then
    raise exception 'Le prenom et le nom du contact sont requis.';
  end if;

  if normalized_email is null then
    raise exception 'Un email est requis pour reutiliser un contact existant.';
  end if;

  if not exists (select 1 from public.organizations where id = target_organization_id) then
    raise exception 'Association introuvable.'
      using errcode = 'foreign_key_violation';
  end if;

  if target_linked_user_id is not null
    and target_linked_user_id is distinct from requester_profile_id
    and not can_manage
  then
    raise exception 'Tu ne peux pas lier ce contact a un autre compte utilisateur.'
      using errcode = 'insufficient_privilege';
  end if;

  if target_created_by_user_id is not null
    and target_created_by_user_id is distinct from requester_profile_id
    and not can_manage
  then
    raise exception 'Tu ne peux pas creer de contact au nom d''un autre utilisateur.'
      using errcode = 'insufficient_privilege';
  end if;

  if not can_manage
    and target_linked_user_id is distinct from requester_profile_id
    and target_created_by_user_id is distinct from requester_profile_id
  then
    raise exception 'Tu ne peux pas creer de contact pour cette association.'
      using errcode = 'insufficient_privilege';
  end if;

  select *
  into result_contact
  from public.contacts
  where email = normalized_email
  order by (linked_user_id is null), created_at, id
  for update
  limit 1;

  if result_contact.id is null then
    begin
      insert into public.contacts (
        organization_id,
        type,
        first_name,
        last_name,
        email,
        phone,
        barn_name,
        linked_user_id,
        created_by_user_id
      )
      values (
        target_organization_id,
        target_type,
        normalized_first_name,
        normalized_last_name,
        normalized_email,
        nullif(btrim(target_phone), ''),
        nullif(btrim(target_barn_name), ''),
        target_linked_user_id,
        coalesce(target_created_by_user_id, requester_profile_id)
      )
      returning * into result_contact;
    exception
      when unique_violation then
        select *
        into result_contact
        from public.contacts
        where email = normalized_email
        order by (linked_user_id is null), created_at, id
        for update
        limit 1;
    end;
  else
    update public.contacts
    set
      phone = coalesce(nullif(phone, ''), nullif(btrim(target_phone), '')),
      barn_name = coalesce(nullif(barn_name, ''), nullif(btrim(target_barn_name), '')),
      linked_user_id = coalesce(linked_user_id, target_linked_user_id),
      created_by_user_id = coalesce(created_by_user_id, target_created_by_user_id, requester_profile_id),
      type = case
        when type = 'other' and target_type <> 'other' then target_type
        else type
      end,
      updated_at = now()
    where id = result_contact.id
    returning * into result_contact;
  end if;

  insert into public.contact_organization_links (
    organization_id,
    contact_id,
    source,
    created_by_user_id
  )
  values (
    target_organization_id,
    result_contact.id,
    case when result_contact.organization_id = target_organization_id then 'created_here' else 'manual' end,
    coalesce(target_created_by_user_id, requester_profile_id)
  )
  on conflict (organization_id, contact_id) do update
  set
    created_by_user_id = coalesce(public.contact_organization_links.created_by_user_id, excluded.created_by_user_id),
    updated_at = now();

  if to_regclass('public.contact_roles') is not null then
    select array_agg(distinct role_value)
    into requested_roles
    from unnest(array_append(coalesce(target_roles, '{}'::text[]), target_type)) as role_value
    where role_value in ('owner', 'agent', 'rider', 'payer', 'booker', 'other');

    foreach role_name in array coalesce(requested_roles, array[target_type])
    loop
      insert into public.contact_roles (
        organization_id,
        contact_id,
        role,
        source
      )
      values (
        target_organization_id,
        result_contact.id,
        role_name,
        case when role_name = target_type then 'contact_type' else 'manual' end
      )
      on conflict (organization_id, contact_id, role) do nothing;
    end loop;
  end if;

  return result_contact;
end;
$$;

revoke all on function public.reuse_contact_by_email(uuid, text, text, text, text, text, text, uuid, uuid, text[]) from public;
grant execute on function public.reuse_contact_by_email(uuid, text, text, text, text, text, text, uuid, uuid, text[]) to authenticated;
