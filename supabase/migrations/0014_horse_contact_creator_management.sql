drop policy if exists "Horse creators can manage their own horse contacts" on public.horse_contacts;

create policy "Horse creators can manage their own horse contacts"
  on public.horse_contacts for all
  using (
    exists (
      select 1
      from public.horses h
      where h.id = horse_id
        and h.created_by_user_id = public.current_profile_id()
    )
    and public.can_access_contact(contact_id)
  )
  with check (
    exists (
      select 1
      from public.horses h
      where h.id = horse_id
        and h.created_by_user_id = public.current_profile_id()
    )
    and public.can_access_contact(contact_id)
  );
