-- Let authenticated users browse the active membership catalog before buying.

drop policy if exists "Authenticated users can view membership seller organizations"
  on public.organizations;
create policy "Authenticated users can view membership seller organizations"
  on public.organizations for select
  to authenticated
  using (
    exists (
      select 1
      from public.organization_membership_types membership_type
      where membership_type.organization_id = organizations.id
        and membership_type.is_active
    )
  );

drop policy if exists "Authenticated users can view active internal membership types"
  on public.organization_membership_types;
create policy "Authenticated users can view active internal membership types"
  on public.organization_membership_types for select
  to authenticated
  using (is_active);
