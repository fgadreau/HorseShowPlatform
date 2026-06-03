alter table public.contacts
drop constraint if exists contacts_linked_user_id_key;

alter table public.contacts
drop constraint if exists contacts_organization_id_email_key;

create index if not exists idx_contacts_linked_user_id
on public.contacts(linked_user_id);

create index if not exists idx_contacts_org_email
on public.contacts(organization_id, email)
where email is not null;
