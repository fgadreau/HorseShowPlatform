begin;
-- Keep the creator's authority even for imports and clients other than HorseForm.
create function public.assign_horse_creator_agent() returns trigger
language plpgsql security definer set search_path = '' as $$
declare creator_contact uuid;
begin
  select id into creator_contact from public.contacts
  where linked_user_id = public.current_profile_id()
  order by created_at, id limit 1;
  if creator_contact is not null and not exists (
    select 1 from public.contacts where id = new.primary_owner_contact_id
    and linked_user_id = public.current_profile_id()
  ) then
    insert into public.horse_contacts(horse_id, contact_id, role, can_create_entries, can_modify_entries, can_book_stalls, can_pay_invoices)
    values(new.id, creator_contact, 'agent', true, true, true, false)
    on conflict(horse_id, contact_id, role) do update
      set can_create_entries = true, can_modify_entries = true, can_book_stalls = true;
  end if;
  return new;
end $$;
revoke all on function public.assign_horse_creator_agent() from public;
create trigger horses_assign_creator_agent after insert on public.horses
for each row execute function public.assign_horse_creator_agent();

-- Repair horses created before the automatic assignment existed.
insert into public.horse_contacts(horse_id, contact_id, role, can_create_entries, can_modify_entries, can_book_stalls, can_pay_invoices)
select h.id, c.id, 'agent', true, true, true, false
from public.horses h join public.contacts c on c.linked_user_id = h.created_by_user_id
where not exists (select 1 from public.contacts owner_contact where owner_contact.id = h.primary_owner_contact_id and owner_contact.linked_user_id = c.linked_user_id)
and not exists (select 1 from public.horse_contacts hc where hc.horse_id = h.id and hc.contact_id = c.id and hc.role in ('owner', 'co-owner'))
on conflict(horse_id, contact_id, role) do nothing;

create or replace function public.paid_warmup_signup_options(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'show_id',w.show_id,'show_day_id',w.show_day_id,'sort_order',w.sort_order,'schedule_start_time',w.schedule_start_time,'show_name',s.name,'price',w.entry_fee,'currency',coalesce(s.default_currency,'CAD'),'capacity',w.capacity,'state',w.registration_state,
 'requests',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'horse_id',r.horse_id,'status',r.status,'rank',r.draw_rank,'position',r.position,'billed',r.billed_at is not null)),'[]') from public.paid_warmup_requests r where r.warmup_id=w.id and public.can_manage_horse_identity(r.horse_id))) order by w.sort_order,w.id),'[]')
 from public.show_score_paid_warmups w join public.shows s on s.id=w.show_id where w.organization_id=p_org and w.registration_enabled and ((s.is_public and s.status='open') or public.can_manage_show_score_show(s.id,array['organizer','secretary'])) and public.current_profile_id() is not null;
$$;


-- Billing an owner's entry does not grant access to the owner's other horses/accounts.
create function public.can_bill_entry_owner(p_horse uuid,p_owner uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.horses h join public.horse_contacts hc on hc.horse_id=h.id
 join public.contacts actor on actor.id=hc.contact_id where h.id=p_horse and h.primary_owner_contact_id=p_owner
 and actor.linked_user_id=public.current_profile_id() and hc.role in ('owner','co-owner','agent')
 and hc.can_create_entries);
$$;
revoke all on function public.can_bill_entry_owner(uuid,uuid) from public,anon;
grant execute on function public.can_bill_entry_owner(uuid,uuid) to authenticated;
create policy "Agents can enter managed horses for their owner" on public.entries for insert to authenticated
with check(created_by_user_id=public.current_profile_id() and owner_contact_id=payer_contact_id
 and public.can_create_entries_for_horse(horse_id) and public.can_bill_entry_owner(horse_id,payer_contact_id)
 and (agent_user_id is null or agent_user_id=public.current_profile_id()));
create policy "Agents can modify managed horse owner entries" on public.entries for update to authenticated
using(public.can_modify_entries_for_horse(horse_id) and public.can_bill_entry_owner(horse_id,payer_contact_id))
with check(owner_contact_id=payer_contact_id and public.can_modify_entries_for_horse(horse_id) and public.can_bill_entry_owner(horse_id,payer_contact_id));
create policy "Agents can ensure managed owner entry roles" on public.contact_roles for insert to authenticated
with check(source='entry' and role in ('owner','payer') and public.can_read_managed_horse_owner(contact_id,organization_id));
create policy "Agents can refresh managed owner entry roles" on public.contact_roles for update to authenticated
using(role in ('owner','payer') and public.can_read_managed_horse_owner(contact_id,organization_id))
with check(source in ('entry','reservation') and role in ('owner','payer') and public.can_read_managed_horse_owner(contact_id,organization_id));
notify pgrst,'reload schema';
commit;
