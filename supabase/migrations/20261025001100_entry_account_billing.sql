-- Domain writers for adopted event accounts. No historical invoice changes or automatic adoption.
begin;
create table public.event_billing_products (
 organization_id uuid not null references public.organizations(id), kind text not null, product_id uuid not null unique references public.organization_products(id),primary key(organization_id,kind)
);
create table public.event_billing_lines (
 line_key text primary key, organization_id uuid not null references public.organizations(id), show_id uuid not null references public.shows(id),
 charge_id uuid not null unique references public.billing_charges(id), snapshot jsonb not null
);
alter table public.event_billing_products enable row level security;
alter table public.event_billing_lines enable row level security;
revoke all on public.event_billing_products,public.event_billing_lines from public,anon,authenticated,service_role;

-- Private domain writer. All amounts and sources are computed by the table triggers below.
create function public.event_billing_set_line(p_key text,p_org uuid,p_show uuid,p_payer uuid,p_beneficiary uuid,p_horse uuid,p_kind text,p_description text,p_quantity numeric,p_price numeric,p_taxable boolean,p_active boolean,p_reference text default null) returns void
language plpgsql security definer set search_path='' as $$
declare ctx public.billing_contexts;l public.event_billing_lines;f public.billing_folios;cust uuid;prod uuid;ch uuid;base numeric;tax numeric;snap jsonb;actor uuid:=public.current_profile_id();
begin
 if actor is null then raise exception 'BILLING_FORBIDDEN';end if;
 perform public.billing6_lock(p_org);perform public.billing_lock_scope(p_org,p_show);
 select c.* into ctx from public.reservation_billing_contexts r join public.billing_contexts c on c.id=r.context_id where r.show_id=p_show and c.organization_id=p_org;
 if ctx.id is null then raise exception 'BILLING_CONTEXT_REQUIRED';end if;
 select * into l from public.event_billing_lines where line_key=p_key for update;
 snap:=jsonb_build_object('payer',p_payer,'beneficiary',p_beneficiary,'horse',p_horse,'kind',p_kind,'description',p_description,'quantity',p_quantity,'price',p_price,'taxable',p_taxable,'reference',p_reference);
 if l.charge_id is not null then
  if p_active and p_price*p_quantity>0 and l.snapshot=snap then return;end if;
  perform public.reservation_reverse_charge(l.charge_id);
  delete from public.event_billing_lines where line_key=p_key;
 end if;
 if not p_active or p_price*p_quantity=0 then return;end if;
 if p_quantity is null or p_quantity<=0 or p_price is null or p_price<0 or p_price<>round(p_price,2) then raise exception 'BILLING_INVALID_AMOUNT';end if;
 if not public.billing6_cap(ctx.id,'engine') or not public.billing6_cap(ctx.id,'personal') then raise exception 'BILLING_CONTEXT_UNAVAILABLE';end if;
 if clock_timestamp()<ctx.opens_at or (ctx.closes_at is not null and clock_timestamp()>=ctx.closes_at) then raise exception 'BILLING_CONTEXT_NOT_OPEN';end if;
 if not public.contact_is_linked_to_org(p_payer,p_org) or not public.contact_is_linked_to_org(p_beneficiary,p_org) or (p_horse is not null and not public.horse_is_linked_to_org(p_horse,p_org)) then raise exception 'BILLING_INVALID_BENEFICIARY';end if;
 select product_id into prod from public.event_billing_products where organization_id=p_org and kind=p_kind;
 if prod is null then
  insert into public.organization_products(organization_id,name,code,category,default_price,tax_applicable)
  values(p_org,case p_kind when 'entry' then 'Inscription / Entry' when 'late_entry' then 'Inscription tardive / Late entry' when 'judge_fee' then 'Frais de juge / Judge fee' else 'Vente / Sale' end,'ACCOUNT-'||upper(p_kind),'manual',0,p_taxable) returning id into prod;
  insert into public.event_billing_products values(p_org,p_kind,prod);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('billing-customer:'||p_org||':'||p_payer,0));
 insert into public.billing_customer_accounts(organization_id,payer_contact_id) values(p_org,p_payer) on conflict do nothing;
 select id into cust from public.billing_customer_accounts where organization_id=p_org and payer_contact_id=p_payer;
 select * into f from public.billing_folios where billing_context_id=ctx.id and payer_customer_account_id=cust for update;
 if not found then insert into public.billing_folios(organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by) values(p_org,ctx.id,cust,ctx.currency,public.billing_number(p_org,'account',ctx.config->>'account_prefix'),actor) returning * into f;end if;
 if f.state<>'open' then raise exception 'BILLING_FOLIO_CLOSED';end if;
 if exists(select 1 from public.billing_stripe_attempts where folio_id=f.id and not resolved) then raise exception 'BILLING_PAYMENT_PENDING';end if;
 if p_taxable and exists(select 1 from public.billing_tax_rules where context_id=ctx.id and (current_date<valid_from or (valid_until is not null and current_date>valid_until))) then raise exception 'BILLING_TAX_RULE_OUTSIDE_VALIDITY';end if;
 base:=round(p_quantity*p_price,2);
 select coalesce(sum(round(base*rate/100,2)),0) into tax from public.billing_tax_rules where context_id=ctx.id and p_taxable;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,horse_id,actor_id,authorization_snapshot)
 values(p_org,f.id,ctx.currency,'secretary_sale',gen_random_uuid(),prod,p_kind,p_description,p_quantity,p_price,base,tax,case when not p_taxable or not exists(select 1 from public.billing_tax_rules where context_id=ctx.id) then 'Configuration explicite sans taxes' end,p_beneficiary,p_horse,actor,jsonb_build_object('kind',p_kind,'line_key',p_key,'actor',actor)) returning id into ch;
 insert into public.billing_charge_taxes select ch,id,name,code,jurisdiction,rate,base,round(base*rate/100,2) from public.billing_tax_rules where context_id=ctx.id and p_taxable;
 insert into public.event_billing_lines values(p_key,p_org,p_show,ch,snap);
 if p_horse is not null then insert into public.billing_folio_horses(folio_id,horse_id,source_charge_id,actor_id) values(f.id,p_horse,ch,actor) on conflict do nothing;end if;
 update public.billing_folios set version=version+1 where id=f.id;
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload) values(p_org,f.id,actor,'event_source_charge',jsonb_build_object('actor',actor),jsonb_build_object('line_key',p_key,'charge_id',ch,'source_kind',p_kind));
end $$;

-- Keep every non-adopted legacy scope protected. No broad legacy-guard exemption.
create function public.event_source_billing_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb;org uuid;sh uuid;
begin
 for r in select x from jsonb_array_elements(case when tg_op='INSERT' then jsonb_build_array(to_jsonb(new)) when tg_op='DELETE' then jsonb_build_array(to_jsonb(old)) else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end) x order by x->>'organization_id',x->>'show_id' loop
  org:=(r->>'organization_id')::uuid;sh:=(r->>'show_id')::uuid;
  perform public.billing6_lock(org);perform public.billing_lock_scope(org,sh);
  if public.reservation_uses_accounts(sh) then
   if tg_op<>'INSERT' and exists(select 1 from public.invoice_line_items where item_id=old.id and item_type in ('entry','judge_fee','fee','extra','manual')) then raise exception 'EVENT_LEGACY_RECONCILIATION_REQUIRED';end if;
  elsif exists(select 1 from public.billing_contexts where organization_id=org and show_id is not distinct from sh) then raise exception 'BILLING_LEGACY_CONTEXT_ADOPTED';end if;
 end loop;
 if tg_op='UPDATE' and (new.organization_id,new.show_id) is distinct from (old.organization_id,old.show_id) then raise exception 'EVENT_SCOPE_IMMUTABLE';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger a_billing_engine_guard on public.entries;
create trigger a_billing_engine_guard before insert or update or delete on public.entries for each row execute function public.event_source_billing_guard();
drop trigger a_billing_engine_guard on public.manual_sales;
create trigger a_billing_engine_guard before insert or update or delete on public.manual_sales for each row execute function public.event_source_billing_guard();

-- Price and late surcharge originate on the server. A status-only edit preserves the original quote.
create function public.entry_account_quote() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.classes;b public.blocks;s public.shows;staff boolean;
begin
 if not public.reservation_uses_accounts(new.show_id) then return new;end if;
 select * into c from public.classes where id=new.class_id;
 select * into b from public.blocks where id=c.block_id;
 select * into s from public.shows where id=new.show_id;
 staff:=public.is_platform_admin() or public.is_org_member(s.organization_id,array['admin','secretary']);
 if tg_op='INSERT' or new.class_id is distinct from old.class_id then
  new.base_fee:=case when staff then coalesce(new.base_fee,c.entry_fee,0) else coalesce(c.entry_fee,0) end;
  new.is_late:=b.entries_close_at is not null and clock_timestamp()>b.entries_close_at;
  if new.is_late and not coalesce(s.late_entries_allowed,true) then raise exception 'Les inscriptions sont fermées pour ce bloc.';end if;
  new.late_fee_percent:=case when new.is_late then coalesce(s.late_entry_fee_percent,50) else 0 end;
  new.late_fee_amount:=round(new.base_fee*new.late_fee_percent/100,2);
 else
  if not staff then new.base_fee:=old.base_fee;end if;
  new.is_late:=old.is_late;new.late_fee_percent:=old.late_fee_percent;
  new.late_fee_amount:=round(coalesce(new.base_fee,0)*coalesce(old.late_fee_percent,0)/100,2);
 end if;
 new.total_fees:=coalesce(new.base_fee,0)+coalesce(new.late_fee_amount,0);
 if new.base_fee<0 then raise exception 'BILLING_INVALID_AMOUNT';end if;
 return new;
end $$;
create trigger entries_account_quote before insert or update on public.entries for each row execute function public.entry_account_quote();

-- Freeze entry references for the existing account UI and document renderer.
create function public.event_billing_entry_identity(p_key text,p_entry uuid,p_fee_kind text) returns void
language plpgsql security definer set search_path='' as $$
declare ch uuid;e record;identity jsonb;presentation jsonb;
begin
 select charge_id into ch from public.event_billing_lines where line_key=p_key;
 if ch is null or exists(select 1 from public.billing_charge_entry_identity where charge_id=ch) then return;end if;
 select en.*,c.block_id,c.name class_name,b.name block_name,h.name horse_name,
 coalesce(c.back_number_policy_override,o.back_number_policy)::text policy,
 nullif(concat_ws(' ',r.first_name,r.middle_name,r.last_name),'') rider_name
 into e from public.entries en join public.classes c on c.id=en.class_id join public.blocks b on b.id=c.block_id join public.horses h on h.id=en.horse_id join public.organizations o on o.id=en.organization_id left join public.contacts r on r.id=en.rider_contact_id where en.id=p_entry;
 if not found then return;end if;
 presentation:=jsonb_build_object('section','entry','block_id',e.block_id,'block_label',e.block_name,'occurrence_id',e.block_id::text,'fee_kind',p_fee_kind);
 if p_fee_kind<>'judge_block' then presentation:=presentation||jsonb_build_object('class_id',e.class_id,'class_label',e.class_name);end if;
 identity:=jsonb_build_object('version',1,'organization_id',e.organization_id,'show_id',e.show_id,'entry_id',e.id,'assignment_id',null,'policy',e.policy,'number',e.entry_number,'horse',jsonb_build_object('id',e.horse_id,'name',e.horse_name),'rider',case when e.rider_contact_id is not null then jsonb_build_object('id',e.rider_contact_id,'name',e.rider_name) else null end,'block_id',e.block_id,'class_id',e.class_id,'occurrence_id',e.block_id::text);
 insert into public.billing_charge_entry_identity values(ch,gen_random_uuid(),e.class_id,null,e.block_id::text,p_fee_kind,identity,presentation);
 insert into public.billing_charge_presentation(charge_id,presentation) values(ch,presentation);
end $$;

-- Judge fee: one per payer/horse/rider/block, using the same highest-entry-fee selection as before.
create function public.entry_account_judge_fee(p_org uuid,p_show uuid,p_payer uuid,p_horse uuid,p_rider uuid,p_block uuid) returns void
language plpgsql security definer set search_path='' as $$
declare selected record;key text;begin
 key:='judge:'||p_show||':'||p_payer||':'||p_horse||':'||coalesce(p_rider::text,'none')||':'||p_block;
 select e.id,e.owner_contact_id,e.horse_id,e.payer_contact_id,c.judge_fee,c.name,bl.name block_name,h.name horse_name into selected
 from public.entries e join public.classes c on c.id=e.class_id join public.blocks bl on bl.id=c.block_id join public.horses h on h.id=e.horse_id
 where e.show_id=p_show and e.organization_id=p_org and e.payer_contact_id=p_payer and e.horse_id=p_horse and e.rider_contact_id is not distinct from p_rider and c.block_id=p_block
 and e.status not in ('cancelled','scratched')
 order by coalesce(e.base_fee,c.entry_fee,0) desc,e.created_at,e.id limit 1;
 perform public.event_billing_set_line(key,p_org,p_show,p_payer,coalesce(selected.owner_contact_id,p_payer),p_horse,'judge_fee',
 'Frais de juge / Judge fee — '||coalesce(selected.horse_name,'')||' / '||coalesce(selected.block_name,'')||' / '||coalesce(selected.name,''),1,coalesce(selected.judge_fee,0),true,selected.id is not null);
 if selected.id is not null then perform public.event_billing_entry_identity(key,selected.id,'judge_block');end if;
end $$;
create function public.sync_entry_billing_account() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.entries;c public.classes;h text;active boolean;begin
 if tg_op='DELETE' then e:=old;else e:=new;end if;
 if not public.reservation_uses_accounts(e.show_id) then if tg_op='DELETE' then return old;end if;return new;end if;
 select * into c from public.classes where id=e.class_id;
 select name into h from public.horses where id=e.horse_id;
 active:=tg_op<>'DELETE' and e.status not in ('cancelled','scratched');
 perform public.event_billing_set_line('entry:'||e.id,e.organization_id,e.show_id,e.payer_contact_id,e.owner_contact_id,e.horse_id,'entry','Inscription / Entry — '||h||' / '||c.name,1,coalesce(e.base_fee,c.entry_fee,0),true,active,coalesce(e.rider_contact_id::text,'')||':'||coalesce(e.entry_number::text,''));
 perform public.event_billing_set_line('late:'||e.id,e.organization_id,e.show_id,e.payer_contact_id,e.owner_contact_id,e.horse_id,'late_entry','Inscription tardive / Late entry — '||h||' / '||c.name,1,coalesce(e.late_fee_amount,0),true,active,coalesce(e.rider_contact_id::text,'')||':'||coalesce(e.entry_number::text,''));
 if tg_op<>'DELETE' then
  perform public.event_billing_entry_identity('entry:'||e.id,e.id,'entry');
  perform public.event_billing_entry_identity('late:'||e.id,e.id,'entry');
 end if;
 if tg_op='UPDATE' then
  perform public.entry_account_judge_fee(old.organization_id,old.show_id,old.payer_contact_id,old.horse_id,old.rider_contact_id,(select block_id from public.classes where id=old.class_id));
 end if;
 perform public.entry_account_judge_fee(e.organization_id,e.show_id,e.payer_contact_id,e.horse_id,e.rider_contact_id,c.block_id);
 if tg_op='DELETE' then return old;end if;return new;
end $$;
alter function public.sync_entry_invoice() rename to event_legacy_entry_invoice_sync;
drop trigger entries_invoice_sync on public.entries;
create trigger entries_invoice_insert after insert on public.entries for each row when(not public.reservation_uses_accounts(new.show_id)) execute function public.event_legacy_entry_invoice_sync();
create trigger entries_invoice_update after update on public.entries for each row when(not public.reservation_uses_accounts(new.show_id)) execute function public.event_legacy_entry_invoice_sync();
create trigger entries_invoice_delete after delete on public.entries for each row when(not public.reservation_uses_accounts(old.show_id)) execute function public.event_legacy_entry_invoice_sync();
create trigger entries_account_sync after insert or update or delete on public.entries for each row execute function public.sync_entry_billing_account();

create function public.sync_manual_sale_billing_account() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.manual_sales;begin
 if tg_op='DELETE' then s:=old;else s:=new;end if;
 if not public.reservation_uses_accounts(s.show_id) then if tg_op='DELETE' then return old;end if;return new;end if;
 -- Existing manual-sale RLS remains the authority; monetary writes are staff-only in adopted scopes.
 perform public.billing_assert_staff(s.organization_id,s.show_id);
 perform public.event_billing_set_line('sale:'||s.id,s.organization_id,s.show_id,s.payer_contact_id,s.payer_contact_id,null,'manual',s.description,s.quantity,s.unit_price,s.tax_applicable,tg_op<>'DELETE' and s.status<>'cancelled');
 if tg_op='DELETE' then return old;end if;return new;
end $$;
alter function public.sync_manual_sale_invoice() rename to event_legacy_sale_invoice_sync;
drop trigger manual_sales_invoice_sync on public.manual_sales;
create trigger manual_sales_invoice_insert after insert on public.manual_sales for each row when(not public.reservation_uses_accounts(new.show_id)) execute function public.event_legacy_sale_invoice_sync();
create trigger manual_sales_invoice_update after update on public.manual_sales for each row when(not public.reservation_uses_accounts(new.show_id)) execute function public.event_legacy_sale_invoice_sync();
create trigger manual_sales_invoice_delete after delete on public.manual_sales for each row when(not public.reservation_uses_accounts(old.show_id)) execute function public.event_legacy_sale_invoice_sync();
create trigger manual_sales_account_sync after insert or update or delete on public.manual_sales for each row execute function public.sync_manual_sale_billing_account();

revoke all on function public.event_billing_set_line(text,uuid,uuid,uuid,uuid,uuid,text,text,numeric,numeric,boolean,boolean,text),public.event_source_billing_guard(),public.entry_account_quote(),public.event_billing_entry_identity(text,uuid,text),public.entry_account_judge_fee(uuid,uuid,uuid,uuid,uuid,uuid),public.sync_entry_billing_account(),public.sync_manual_sale_billing_account() from public,anon,authenticated,service_role;
-- Adopt only a fresh operational scope; historical source rows require explicit reconciliation.
alter function public.configure_reservation_billing(uuid,jsonb,jsonb) rename to configure_reservation_billing_sources_base;
create function public.configure_reservation_billing(p_show uuid,p_config jsonb,p_taxes jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare ctx uuid;c public.billing_contexts;a jsonb;begin
 select organization_id into c.organization_id from public.shows where id=p_show;
 a:=public.billing_assert_staff(c.organization_id,p_show);
 if a->>'kind'<>'platform_admin' and a->>'role'<>'admin' then raise exception 'BILLING_FORBIDDEN';end if;
 perform public.billing6_lock(c.organization_id);perform public.billing_lock_scope(c.organization_id,p_show);
 if not public.reservation_uses_accounts(p_show) and (
 exists(select 1 from public.entries where show_id=p_show) or exists(select 1 from public.stall_bookings where show_id=p_show) or exists(select 1 from public.manual_sales where show_id=p_show)) then raise exception 'EVENT_LEGACY_RECONCILIATION_REQUIRED';end if;
 if not exists(select 1 from pg_timezone_names where name=p_config->>'timezone') then raise exception 'BILLING_INVALID_TIMEZONE';end if;
 ctx:=public.configure_reservation_billing_sources_base(p_show,p_config,p_taxes);
 select * into c from public.billing_contexts where id=ctx;
 insert into public.billing_product_tax_profiles(context_id,product_id,unit_price,exemption_reason)
 select ctx,p.id,p.default_price,case when not p.tax_applicable or not exists(select 1 from public.billing_tax_rules where context_id=ctx) then 'Configuration explicite sans taxes' end
 from public.organization_products p where p.organization_id=c.organization_id and p.is_active and c.config->'categories' ? p.category
 and not exists(select 1 from public.event_billing_products ep where ep.product_id=p.id) and not exists(select 1 from public.reservation_billing_products rp where rp.product_id=p.id)
 on conflict do nothing;
 insert into public.billing_product_tax_rules(context_id,product_id,tax_rule_id)
 select ctx,pr.product_id,t.id from public.billing_product_tax_profiles pr join public.organization_products p on p.id=pr.product_id cross join public.billing_tax_rules t
 where pr.context_id=ctx and p.tax_applicable and t.context_id=ctx on conflict do nothing;
 return ctx;
end $$;
revoke all on function public.configure_reservation_billing_sources_base(uuid,jsonb,jsonb),public.configure_reservation_billing(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.configure_reservation_billing(uuid,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
