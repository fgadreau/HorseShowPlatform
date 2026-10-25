-- Participants must be able to discover the active directory before linking
-- their own contact/horse. Existing directory_contacts/directory_horses policies
-- continue to control those writes; this grants no staff or membership rights.
create policy "Participants discover active public show directories"
  on public.organization_disciplines for select
  to authenticated
  using (
    is_active
    and exists (
      select 1 from public.shows s
      where s.organization_id = organization_disciplines.organization_id
        and (s.is_public or public.showscore_public_show_exists(s.id))
    )
  );
