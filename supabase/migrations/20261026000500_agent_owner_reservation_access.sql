-- Agent access is explicit and limited to owners of horses they manage.
-- Read access does not extend identity editing, other horses, or payer-only Stripe access.
begin;
create function public.can_read_managed_horse_owner(p_contact uuid,p_org uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.horses h
  join public.horse_contacts hc on hc.horse_id=h.id
  join public.contacts actor on actor.id=hc.contact_id
  where h.primary_owner_contact_id=p_contact and actor.linked_user_id=public.current_profile_id()
  and hc.role in ('owner','co-owner','agent')
  and (p_org is null or exists(select 1 from public.directory_horses dh join public.organization_disciplines od on od.id=dh.organization_discipline_id where dh.horse_id=h.id and od.organization_id=p_org))
 )
$$;
create function public.can_bill_managed_horse_owner(p_horse uuid,p_contact uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.horses h join public.horse_contacts hc on hc.horse_id=h.id
  join public.contacts actor on actor.id=hc.contact_id
  where h.id=p_horse and h.primary_owner_contact_id=p_contact
  and actor.linked_user_id=public.current_profile_id()
  and hc.role in ('owner','co-owner','agent') and hc.can_book_stalls
 )
$$;
revoke all on function public.can_read_managed_horse_owner(uuid,uuid),public.can_bill_managed_horse_owner(uuid,uuid) from public,anon;
grant execute on function public.can_read_managed_horse_owner(uuid,uuid),public.can_bill_managed_horse_owner(uuid,uuid) to authenticated;

create policy "Agents can read their managed horses owners" on public.contacts for select to authenticated
using(public.can_read_managed_horse_owner(id));
create policy "Agents can read owners directory links" on public.directory_contacts for select to authenticated
using(exists(select 1 from public.organization_disciplines od where od.id=organization_discipline_id and public.can_read_managed_horse_owner(contact_id,od.organization_id)));
create policy "Agents can read owner contact roles" on public.contact_roles for select to authenticated
using(public.can_read_managed_horse_owner(contact_id,organization_id));
-- Only the reservation payer role may be ensured; no general role or identity editing.
create policy "Agents can assign owner reservation payer role" on public.contact_roles for insert to authenticated
with check(role='payer' and source='reservation' and public.can_read_managed_horse_owner(contact_id,organization_id));
create policy "Agents can ensure owner reservation payer role" on public.contact_roles for update to authenticated
using(role='payer' and public.can_read_managed_horse_owner(contact_id,organization_id))
with check(role='payer' and source='reservation' and public.can_read_managed_horse_owner(contact_id,organization_id));
drop policy if exists "Staff and related users can create stall bookings" on public.stall_bookings;
create policy "Staff and related users can create stall bookings"
  on public.stall_bookings for insert
  with check (
    public.can_manage_show(show_id, array['secretary'])
    or (
      created_by_user_id = public.current_profile_id()
      and public.can_access_contact(booker_contact_id)
      and (
        public.can_access_contact(payer_contact_id)
        or public.can_bill_managed_horse_owner(horse_id,payer_contact_id)
        or (horse_id is not null and public.can_pay_invoices_for_horse(horse_id, payer_contact_id))
      )
      and (horse_id is null or public.can_book_stalls_for_horse(horse_id))
    )
  );

drop policy if exists "Staff and related users can update stall bookings" on public.stall_bookings;
create policy "Staff and related users can update stall bookings"
  on public.stall_bookings for update
  using (
    public.can_manage_show(show_id, array['secretary'])
    or created_by_user_id = public.current_profile_id()
    or public.can_access_contact(booker_contact_id)
  )
  with check (
    public.can_manage_show(show_id, array['secretary'])
    or (
      created_by_user_id = public.current_profile_id()
      and public.can_access_contact(booker_contact_id)
      and (
        public.can_access_contact(payer_contact_id)
        or public.can_bill_managed_horse_owner(horse_id,payer_contact_id)
        or (horse_id is not null and public.can_pay_invoices_for_horse(horse_id, payer_contact_id))
      )
      and (horse_id is null or public.can_book_stalls_for_horse(horse_id))
    )
  );

create or replace function public.claim_contacts_for_current_user()
returns setof public.contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  current_profile uuid;
  account_email text;
begin
  current_profile := public.current_profile_id();
  -- Only a verified login may claim the existing billing contact.
  select nullif(lower(btrim(u.email)), '') into account_email
  from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;

  if current_profile is null or account_email is null then
    return;
  end if;

  return query
  with claimed_contacts as (
    update public.contacts
    set linked_user_id = current_profile,
        updated_at = now()
    where email = account_email
      and (linked_user_id is null or linked_user_id = current_profile)
    returning public.contacts.*
  )
  select *
  from claimed_contacts
  union
  select contacts.*
  from public.contacts
  where contacts.email = account_email
    and contacts.linked_user_id = current_profile;
end;
$$;

notify pgrst,'reload schema';
commit;
