drop policy if exists "Staff and linked users can delete contacts" on public.contacts;
create policy "Staff and linked users can delete contacts"
  on public.contacts for delete
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or linked_user_id = public.current_profile_id()
    or exists (
      select 1
      from public.contact_organization_links col
      where col.contact_id = id
        and public.is_org_member(col.organization_id, array['admin', 'secretary'])
    )
  );
