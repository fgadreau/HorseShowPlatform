-- Allow linked users to buy active association memberships for their own contacts.

drop policy if exists "Linked users can view active internal membership types"
  on public.organization_membership_types;
create policy "Linked users can view active internal membership types"
  on public.organization_membership_types for select
  to authenticated
  using (
    is_active
    and exists (
      select 1
      from public.contacts contact
      where contact.linked_user_id = public.current_profile_id()
        and public.contact_is_linked_to_org(contact.id, organization_membership_types.organization_id)
    )
  );

drop policy if exists "Linked users can create own internal memberships"
  on public.contact_organization_memberships;
create policy "Linked users can create own internal memberships"
  on public.contact_organization_memberships for insert
  to authenticated
  with check (
    sold_by_user_id = public.current_profile_id()
    and show_id is null
    and status in ('draft', 'active')
    and exists (
      select 1
      from public.organization_membership_types membership_type
      where membership_type.id = contact_organization_memberships.membership_type_id
        and membership_type.organization_id = contact_organization_memberships.organization_id
        and membership_type.is_active
    )
    and exists (
      select 1
      from public.contacts contact
      where contact.id = contact_organization_memberships.contact_id
        and contact.linked_user_id = public.current_profile_id()
        and public.contact_is_linked_to_org(contact.id, contact_organization_memberships.organization_id)
    )
    and (
      payer_contact_id is null
      or payer_contact_id = contact_id
      or exists (
        select 1
        from public.contacts payer
        where payer.id = contact_organization_memberships.payer_contact_id
          and payer.linked_user_id = public.current_profile_id()
          and public.contact_is_linked_to_org(payer.id, contact_organization_memberships.organization_id)
      )
    )
  );
