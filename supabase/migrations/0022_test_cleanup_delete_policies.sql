-- Allow practical test cleanup from the app while keeping deletes scoped to
-- records the user can already manage.

drop policy if exists "Staff and related users can delete entries" on public.entries;
create policy "Staff and related users can delete entries"
  on public.entries for delete
  using (
    public.can_manage_show(show_id, array['secretary'])
    or created_by_user_id = public.current_profile_id()
    or agent_user_id = public.current_profile_id()
    or public.can_modify_entries_for_horse(horse_id)
  );

drop policy if exists "Staff and related users can delete stall bookings" on public.stall_bookings;
create policy "Staff and related users can delete stall bookings"
  on public.stall_bookings for delete
  using (
    public.can_manage_show(show_id, array['secretary'])
    or created_by_user_id = public.current_profile_id()
    or public.can_access_contact(booker_contact_id)
    or (horse_id is not null and public.can_book_stalls_for_horse(horse_id))
  );

drop policy if exists "Staff and related users can delete horse contacts" on public.horse_contacts;
create policy "Staff and related users can delete horse contacts"
  on public.horse_contacts for delete
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or exists (
      select 1
      from public.horses h
      where h.id = horse_id
        and (
          h.created_by_user_id = public.current_profile_id()
          or public.can_access_horse(h.id)
        )
    )
  );

drop policy if exists "Staff and related users can delete horses" on public.horses;
create policy "Staff and related users can delete horses"
  on public.horses for delete
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or created_by_user_id = public.current_profile_id()
    or public.can_access_horse(id)
  );
