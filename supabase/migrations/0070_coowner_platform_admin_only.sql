-- Co-owner horse contacts are restricted to platform admins.
-- Association staff (admin/secretary) can manage all other horse contact roles
-- (rider, agent, manager) but not co-ownership, which is rare and should not
-- be self-served to avoid cluttering a horse with multiple owners.

drop policy if exists "Staff manage horse contacts" on public.horse_contacts;

create policy "Platform admin can manage all horse contacts"
  on public.horse_contacts for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Staff can manage non-coowner horse contacts"
  on public.horse_contacts for all
  using (
    public.is_org_member(organization_id, array['admin', 'secretary'])
    and role != 'co-owner'
  )
  with check (
    public.is_org_member(organization_id, array['admin', 'secretary'])
    and role != 'co-owner'
  );
