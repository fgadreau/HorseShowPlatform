create index if not exists idx_contacts_created_by_user_id
on public.contacts(created_by_user_id);

create index if not exists idx_contact_organization_links_created_by_user_id
on public.contact_organization_links(created_by_user_id);

create index if not exists idx_horses_created_by_user_id
on public.horses(created_by_user_id);

create index if not exists idx_horse_organization_links_created_by_user_id
on public.horse_organization_links(created_by_user_id);

create or replace function public.can_access_contact(target_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contacts c
    where c.id = target_contact_id
      and (
        c.linked_user_id = public.current_profile_id()
        or c.created_by_user_id = public.current_profile_id()
      )
  )
  or exists (
    select 1
    from public.contact_organization_links col
    where col.contact_id = target_contact_id
      and col.created_by_user_id = public.current_profile_id()
  )
$$;

create or replace function public.can_access_horse(target_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.horses h
    where h.id = target_horse_id
      and h.created_by_user_id = public.current_profile_id()
  )
  or exists (
    select 1
    from public.horse_contacts hc
    where hc.horse_id = target_horse_id
      and public.can_access_contact(hc.contact_id)
  )
  or exists (
    select 1
    from public.horse_organization_links hol
    where hol.horse_id = target_horse_id
      and hol.created_by_user_id = public.current_profile_id()
  )
$$;

drop policy if exists "Staff and linked users can view contacts" on public.contacts;
create policy "Staff and linked users can view contacts"
  on public.contacts for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_contact(id)
    or exists (
      select 1
      from public.contact_organization_links col
      where col.contact_id = id
        and (
          public.is_org_member(col.organization_id, array['admin', 'secretary'])
          or col.created_by_user_id = public.current_profile_id()
        )
    )
  );

drop policy if exists "Staff and linked users can create contacts" on public.contacts;
create policy "Staff and linked users can create contacts"
  on public.contacts for insert
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or linked_user_id = public.current_profile_id()
    or created_by_user_id = public.current_profile_id()
  );

drop policy if exists "Staff and linked users can update contacts" on public.contacts;
create policy "Staff and linked users can update contacts"
  on public.contacts for update
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_contact(id)
    or exists (
      select 1
      from public.contact_organization_links col
      where col.contact_id = id
        and (
          public.is_org_member(col.organization_id, array['admin', 'secretary'])
          or col.created_by_user_id = public.current_profile_id()
        )
    )
  )
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_contact(id)
  );

drop policy if exists "Staff and linked users can delete contacts" on public.contacts;
create policy "Staff and linked users can delete contacts"
  on public.contacts for delete
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_contact(id)
    or exists (
      select 1
      from public.contact_organization_links col
      where col.contact_id = id
        and (
          public.is_org_member(col.organization_id, array['admin', 'secretary'])
          or col.created_by_user_id = public.current_profile_id()
        )
    )
  );

drop policy if exists "Staff and creators can create horses" on public.horses;
create policy "Staff and creators can create horses"
  on public.horses for insert
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or (
      created_by_user_id = public.current_profile_id()
      and public.can_access_contact(primary_owner_contact_id)
      and public.contact_is_linked_to_org(primary_owner_contact_id, organization_id)
    )
  );

drop policy if exists "Staff and related users can update horses" on public.horses;
create policy "Staff and related users can update horses"
  on public.horses for update
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_horse(id)
  )
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or (
      public.can_access_horse(id)
      and public.can_access_contact(primary_owner_contact_id)
      and public.contact_is_linked_to_org(primary_owner_contact_id, organization_id)
    )
  );
