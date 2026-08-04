-- Organization memberships store the application profile id, not auth.users.id.
-- Reuse the canonical membership helper so ShowScore championship writes follow
-- the same authorization contract as the rest of HSP.

create or replace function public.showscore_current_user_can_manage_organization(
  target_organization_id text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and (
      public.is_platform_admin()
      or public.is_org_member(
        target_organization_id::uuid,
        array['admin', 'secretary']
      )
    );
$$;

notify pgrst, 'reload schema';
