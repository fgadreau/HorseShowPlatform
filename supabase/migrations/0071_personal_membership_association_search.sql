-- Allow users to search associations connected to their own contacts.

drop policy if exists "Linked users can view organizations for their contacts"
  on public.organizations;
create policy "Linked users can view organizations for their contacts"
  on public.organizations for select
  to authenticated
  using (
    exists (
      select 1
      from public.contacts contact
      where contact.linked_user_id = public.current_profile_id()
        and public.contact_is_linked_to_org(contact.id, organizations.id)
    )
  );
