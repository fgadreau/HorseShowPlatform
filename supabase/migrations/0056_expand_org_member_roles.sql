-- Add ShowScore roles (scribe, announcer) to organization_members

alter table public.organization_members
  drop constraint if exists organization_members_role_check;

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('admin', 'secretary', 'user', 'scribe', 'announcer'));
