-- Freeze a readable occurrence date in future entry documents. Existing financial snapshots are unchanged.
begin;
create or replace function public.event_billing_entry_identity(p_key text,p_entry uuid,p_fee_kind text) returns void
language plpgsql security definer set search_path='' as $$
declare ch uuid;e record;identity jsonb;presentation jsonb;
begin
 select charge_id into ch from public.event_billing_lines where line_key=p_key;
 if ch is null or exists(select 1 from public.billing_charge_entry_identity where charge_id=ch) then return;end if;
 select en.*,coalesce((select day_date::text from public.show_days where id=b.show_day_id),(select start_date::text from public.shows where id=en.show_id)) occurrence_label,c.block_id,c.name class_name,b.name block_name,h.name horse_name,
 coalesce(c.back_number_policy_override,o.back_number_policy)::text policy,
 nullif(concat_ws(' ',r.first_name,r.middle_name,r.last_name),'') rider_name
 into e from public.entries en join public.classes c on c.id=en.class_id join public.blocks b on b.id=c.block_id join public.horses h on h.id=en.horse_id join public.organizations o on o.id=en.organization_id left join public.contacts r on r.id=en.rider_contact_id where en.id=p_entry;
 if not found then return;end if;
 presentation:=jsonb_build_object('section','entry','block_id',e.block_id,'block_label',e.block_name,'occurrence_id',e.occurrence_label,'fee_kind',p_fee_kind);
 if p_fee_kind<>'judge_block' then presentation:=presentation||jsonb_build_object('class_id',e.class_id,'class_label',e.class_name);end if;
 identity:=jsonb_build_object('version',1,'organization_id',e.organization_id,'show_id',e.show_id,'entry_id',e.id,'assignment_id',null,'policy',e.policy,'number',e.entry_number,'horse',jsonb_build_object('id',e.horse_id,'name',e.horse_name),'rider',case when e.rider_contact_id is not null then jsonb_build_object('id',e.rider_contact_id,'name',e.rider_name) else null end,'block_id',e.block_id,'class_id',e.class_id,'occurrence_id',e.occurrence_label);
 insert into public.billing_charge_entry_identity values(ch,gen_random_uuid(),e.class_id,null,e.occurrence_label,p_fee_kind,identity,presentation);
 insert into public.billing_charge_presentation(charge_id,presentation) values(ch,presentation);
end $$;

notify pgrst,'reload schema';
commit;
