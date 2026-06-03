create or replace function public.normalize_contact_email()
returns trigger
language plpgsql
as $$
begin
  if new.email is not null then
    new.email := nullif(lower(btrim(new.email)), '');
  end if;

  return new;
end;
$$;

drop trigger if exists contacts_normalize_email on public.contacts;
create trigger contacts_normalize_email
before insert or update of email on public.contacts
for each row execute function public.normalize_contact_email();

update public.contacts
set email = null
where email is not null
  and btrim(email) = '';

update public.contacts
set email = lower(btrim(email))
where email is not null
  and email is distinct from lower(btrim(email));

create temp table contact_dedup_map on commit drop as
with ranked_contacts as (
  select
    id,
    first_value(id) over (
      partition by organization_id, email
      order by (linked_user_id is null), created_at, id
    ) as canonical_id
  from public.contacts
  where email is not null
)
select id as duplicate_id, canonical_id
from ranked_contacts
where id is distinct from canonical_id;

with merged_values as (
  select
    duplicate_map.canonical_id,
    (array_agg(duplicate_contacts.phone) filter (where duplicate_contacts.phone is not null and btrim(duplicate_contacts.phone) <> ''))[1] as phone,
    (array_agg(duplicate_contacts.barn_name) filter (where duplicate_contacts.barn_name is not null and btrim(duplicate_contacts.barn_name) <> ''))[1] as barn_name,
    (array_agg(duplicate_contacts.linked_user_id) filter (where duplicate_contacts.linked_user_id is not null))[1] as linked_user_id,
    (array_agg(duplicate_contacts.created_by_user_id) filter (where duplicate_contacts.created_by_user_id is not null))[1] as created_by_user_id
  from contact_dedup_map duplicate_map
  join public.contacts duplicate_contacts on duplicate_contacts.id = duplicate_map.duplicate_id
  group by duplicate_map.canonical_id
)
update public.contacts canonical_contacts
set
  phone = coalesce(nullif(canonical_contacts.phone, ''), merged_values.phone),
  barn_name = coalesce(nullif(canonical_contacts.barn_name, ''), merged_values.barn_name),
  linked_user_id = coalesce(canonical_contacts.linked_user_id, merged_values.linked_user_id),
  created_by_user_id = coalesce(canonical_contacts.created_by_user_id, merged_values.created_by_user_id),
  updated_at = now()
from merged_values
where canonical_contacts.id = merged_values.canonical_id
  and (
    (canonical_contacts.phone is null and merged_values.phone is not null)
    or (canonical_contacts.barn_name is null and merged_values.barn_name is not null)
    or (canonical_contacts.linked_user_id is null and merged_values.linked_user_id is not null)
    or (canonical_contacts.created_by_user_id is null and merged_values.created_by_user_id is not null)
  );

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
      contact_roles.organization_id,
      duplicate_map.canonical_id,
      contact_roles.role,
      contact_roles.source,
      min(contact_roles.created_at)
    from public.contact_roles
    join contact_dedup_map duplicate_map on duplicate_map.duplicate_id = contact_roles.contact_id
    group by
      contact_roles.organization_id,
      duplicate_map.canonical_id,
      contact_roles.role,
      contact_roles.source
    on conflict (organization_id, contact_id, role) do nothing;

    delete from public.contact_roles
    using contact_dedup_map duplicate_map
    where contact_roles.contact_id = duplicate_map.duplicate_id;
  end if;
end;
$$;

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
join contact_dedup_map duplicate_map on duplicate_map.duplicate_id = horse_contacts.contact_id
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
using contact_dedup_map duplicate_map
where horse_contacts.contact_id = duplicate_map.duplicate_id;

update public.horses
set primary_owner_contact_id = contact_dedup_map.canonical_id,
    updated_at = now()
from contact_dedup_map
where horses.primary_owner_contact_id = contact_dedup_map.duplicate_id;

update public.entries
set owner_contact_id = contact_dedup_map.canonical_id,
    updated_at = now()
from contact_dedup_map
where entries.owner_contact_id = contact_dedup_map.duplicate_id;

update public.entries
set rider_contact_id = contact_dedup_map.canonical_id,
    updated_at = now()
from contact_dedup_map
where entries.rider_contact_id = contact_dedup_map.duplicate_id;

update public.entries
set payer_contact_id = contact_dedup_map.canonical_id,
    updated_at = now()
from contact_dedup_map
where entries.payer_contact_id = contact_dedup_map.duplicate_id;

update public.stall_bookings
set booker_contact_id = contact_dedup_map.canonical_id,
    updated_at = now()
from contact_dedup_map
where stall_bookings.booker_contact_id = contact_dedup_map.duplicate_id;

update public.stall_bookings
set payer_contact_id = contact_dedup_map.canonical_id,
    updated_at = now()
from contact_dedup_map
where stall_bookings.payer_contact_id = contact_dedup_map.duplicate_id;

update public.invoices
set payer_contact_id = contact_dedup_map.canonical_id,
    updated_at = now()
from contact_dedup_map
where invoices.payer_contact_id = contact_dedup_map.duplicate_id;

delete from public.contacts
using contact_dedup_map duplicate_map
where contacts.id = duplicate_map.duplicate_id;

drop index if exists public.idx_contacts_org_email;

create unique index if not exists contacts_organization_normalized_email_key
on public.contacts(organization_id, lower(btrim(email)))
where email is not null;

create index if not exists idx_contacts_linked_user_id
on public.contacts(linked_user_id);

create or replace function public.claim_contacts_for_current_user()
returns setof public.contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile uuid;
  account_email text;
begin
  current_profile := public.current_profile_id();
  account_email := nullif(lower(btrim(coalesce(auth.jwt() ->> 'email', ''))), '');

  if account_email is null then
    select nullif(lower(btrim(email)), '')
    into account_email
    from auth.users
    where id = auth.uid();
  end if;

  if current_profile is null or account_email is null then
    return;
  end if;

  return query
  with claimed_contacts as (
    update public.contacts
    set linked_user_id = current_profile,
        updated_at = now()
    where email = account_email
      and (linked_user_id is null or linked_user_id = current_profile)
    returning public.contacts.*
  )
  select *
  from claimed_contacts
  union
  select contacts.*
  from public.contacts
  where contacts.email = account_email
    and contacts.linked_user_id = current_profile;
end;
$$;

revoke all on function public.claim_contacts_for_current_user() from public;
grant execute on function public.claim_contacts_for_current_user() to authenticated;
