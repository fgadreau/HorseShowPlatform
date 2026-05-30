create or replace function public.can_claim_first_org_admin(
  target_organization_id uuid,
  target_user_id uuid,
  target_role text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_role = 'admin'
    and target_user_id = public.current_profile_id()
    and exists (
      select 1
      from public.organizations
      where id = target_organization_id
        and created_by_user_id = target_user_id
    )
    and not exists (
      select 1
      from public.organization_members
      where organization_id = target_organization_id
    )
$$;

create policy "Organization creators can view pending organizations"
  on public.organizations for select
  using (created_by_user_id = public.current_profile_id());

drop policy if exists "Organization creator can claim first admin membership"
  on public.organization_members;

create policy "Organization creator can claim first admin membership"
  on public.organization_members for insert
  with check (public.can_claim_first_org_admin(organization_id, user_id, role));
