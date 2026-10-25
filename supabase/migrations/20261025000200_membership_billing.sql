begin;
alter table public.organization_membership_types alter column tax_applicable set default false;
alter table public.contact_organization_memberships add column billing_charge_id uuid unique references public.billing_charges(id);
create table public.membership_billing_config (
 membership_type_id uuid primary key references public.organization_membership_types(id),
 context_id uuid not null unique references public.billing_contexts(id), product_id uuid not null unique references public.organization_products(id),
 created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default clock_timestamp()
);
alter table public.membership_billing_config enable row level security;
revoke all on public.membership_billing_config from public,anon,authenticated,service_role;
-- Domain adapter: only this private function may bypass the obsolete invoice writer.
alter function public.billing_legacy_guard() rename to billing_membership_legacy_guard_base;
create function public.billing_legacy_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb;o uuid;s uuid;
begin
 if tg_table_name='contact_organization_memberships' and tg_op<>'DELETE' then
 if new.billing_charge_id is not null then
  if not exists(select 1 from public.billing_charges ch join public.billing_folios f on f.id=ch.folio_id join public.billing_customer_accounts a on a.id=f.payer_customer_account_id join public.membership_billing_config cfg on cfg.context_id=f.billing_context_id
   where ch.id=new.billing_charge_id and ch.source_id=new.id and ch.beneficiary_contact_id=new.contact_id and ch.organization_id=new.organization_id and a.payer_contact_id=new.payer_contact_id and cfg.membership_type_id=new.membership_type_id) then raise exception 'MEMBERSHIP_INVALID_CHARGE';end if;
  return new;
 end if;
 end if;
 for r in select x from jsonb_array_elements(case when tg_op='INSERT' then jsonb_build_array(to_jsonb(new)) when tg_op='DELETE' then jsonb_build_array(to_jsonb(old)) else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end) x order by x->>'organization_id',x->>'show_id' loop
  o:=(r->>'organization_id')::uuid;s:=(r->>'show_id')::uuid;
  perform public.billing_lock_scope(o,s);
  if exists(select 1 from public.billing_contexts c where c.organization_id=o and c.show_id is not distinct from s) then raise exception 'BILLING_LEGACY_CONTEXT_ADOPTED' using errcode='55000';end if;
 end loop;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
-- Existing triggers retain the renamed function OID; point them at the adapted guard.
do $$ declare t text;begin foreach t in array array['invoices','manual_sales','entries','stall_bookings','contact_organization_memberships'] loop
 execute format('drop trigger a_billing_engine_guard on public.%I',t);
 execute format('create trigger a_billing_engine_guard before insert or update or delete on public.%I for each row execute function public.billing_legacy_guard()',t);
end loop;end $$;
alter function public.sync_contact_organization_membership_invoice() rename to membership_legacy_invoice_sync;
-- Keep the legacy trigger for unmapped rows; a WHEN clause avoids all old invoice writes for new purchases.
drop trigger contact_organization_memberships_invoice_sync on public.contact_organization_memberships;
create trigger contact_organization_memberships_invoice_sync after insert or update on public.contact_organization_memberships for each row when(new.billing_charge_id is null) execute function public.membership_legacy_invoice_sync();
create trigger contact_organization_memberships_invoice_delete after delete on public.contact_organization_memberships for each row when(old.billing_charge_id is null) execute function public.membership_legacy_invoice_sync();
-- Mapped membership rows must be written through the atomic purchase/reconciliation functions.
revoke insert,update,delete on public.contact_organization_memberships from authenticated;

create function public.membership_billing_configure(p_type uuid,p_taxes jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.organization_membership_types; a jsonb; cfg jsonb; ctx uuid; typ uuid; prod uuid; tax jsonb; taxid uuid; prefix text;
begin
 select * into t from public.organization_membership_types where id=p_type for update;
 if t.id is null then raise exception 'MEMBERSHIP_NOT_FOUND';end if;
 a:=public.billing_assert_staff(t.organization_id);
 if a->>'kind'<>'platform_admin' and a->>'role'<>'admin' then raise exception 'BILLING_FORBIDDEN';end if;
 perform public.billing6_lock(t.organization_id);perform public.billing_lock_scope(t.organization_id,null);
 select context_id into ctx from public.membership_billing_config where membership_type_id=t.id;
 if found then return ctx;end if;
 if jsonb_typeof(p_taxes) is distinct from 'array' or (t.tax_applicable and jsonb_array_length(p_taxes)=0) or (not t.tax_applicable and jsonb_array_length(p_taxes)>0) then raise exception 'MEMBERSHIP_TAX_CONFIG_REQUIRED';end if;
 if not coalesce((select engine and personal from public.billing_pilot_organizations where organization_id=t.organization_id),false) then
  if not public.is_platform_admin() then raise exception 'MEMBERSHIP_PILOT_REQUIRED';end if;
  perform public.billing_set_capabilities(t.organization_id,null,true,true,false);
 end if;
 prefix:='M-'||upper(substr(replace(t.id::text,'-',''),1,12));
 cfg:=jsonb_build_object('name_fr','Cartes — '||t.name||' '||t.season_year,'name_en','Memberships — '||t.name||' '||t.season_year,'account_prefix',prefix||'-A','receipt_prefix',prefix||'-R','invoice_prefix',prefix||'-I','closing_policy','manual','payment_policy','received_only','activation_policy','allocated_received','categories',jsonb_build_array('manual'),'staff_roles',jsonb_build_array('admin','secretary'),'period',t.season_year::text,'timezone',coalesce((select timezone from public.organizations where id=t.organization_id),'America/Toronto'));
 typ:=public.billing_create_context_type(t.organization_id,'membership_'||replace(t.id::text,'-',''),1,cfg);
 -- Explicitly adopted membership scope; legacy amounts are not imported here.
 insert into public.billing_contexts(organization_id,kind,context_type_id,context_code,currency,config,opens_at,created_by)
 values(t.organization_id,'non_event',typ,'MEMBERSHIP-'||t.id,(select currency from public.organizations where id=t.organization_id),cfg,clock_timestamp(),public.current_profile_id()) returning id into ctx;
 insert into public.organization_products(organization_id,name,code,category,default_price,tax_applicable) values(t.organization_id,t.name||' '||t.season_year,'MEMBERSHIP-'||t.id,'manual',t.price,t.tax_applicable) returning id into prod;
 insert into public.billing_product_tax_profiles(context_id,product_id,unit_price,exemption_reason) values(ctx,prod,t.price,case when not t.tax_applicable then 'Carte sans taxes — choix explicite de l’association' end);
 for tax in select value from jsonb_array_elements(p_taxes) loop
  if nullif(trim(tax->>'code'),'') is null or nullif(trim(tax->>'name'),'') is null or nullif(trim(tax->>'jurisdiction'),'') is null or (tax->>'rate')::numeric is null or (tax->>'rate')::numeric<=0 or (tax->>'rate')::numeric>100 then raise exception 'MEMBERSHIP_TAX_CONFIG_REQUIRED';end if;
  insert into public.billing_tax_rules(organization_id,context_id,code,name,jurisdiction,rate,rule_version,valid_from) values(t.organization_id,ctx,tax->>'code',tax->>'name',tax->>'jurisdiction',(tax->>'rate')::numeric,'membership-1',current_date) returning id into taxid;
  insert into public.billing_product_tax_rules values(ctx,prod,taxid);
 end loop;
 insert into public.membership_billing_config values(t.id,ctx,prod,public.current_profile_id(),clock_timestamp());
 perform public.billing_set_capabilities(t.organization_id,ctx,true,true,false,false,t.season_year);
 insert into public.billing_audit_events(organization_id,actor_id,operation,authorization_snapshot,payload) values(t.organization_id,public.current_profile_id(),'membership_billing_configure',a,jsonb_build_object('type',t.id,'context',ctx,'taxes',p_taxes));
 return ctx;
end $$;

create function public.membership_billing_quote(p_type uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.organization_membership_types; cfg public.membership_billing_config; c public.billing_contexts; price numeric; taxes numeric;
begin
 if public.current_profile_id() is null then raise exception 'BILLING_FORBIDDEN';end if;
 select * into t from public.organization_membership_types where id=p_type;
 select * into cfg from public.membership_billing_config where membership_type_id=p_type;
 if cfg.context_id is null then raise exception 'MEMBERSHIP_BILLING_NOT_CONFIGURED';end if;
 select * into c from public.billing_contexts where id=cfg.context_id;
 if not t.is_active or current_date>t.valid_until or not public.billing6_cap(c.id,'engine') or not public.billing6_cap(c.id,'personal') or clock_timestamp()<c.opens_at or (c.closes_at is not null and clock_timestamp()>=c.closes_at) then raise exception 'MEMBERSHIP_UNAVAILABLE';end if;
 select unit_price into price from public.billing_product_tax_profiles where context_id=c.id and product_id=cfg.product_id;
 if price is distinct from t.price or t.tax_applicable is distinct from (select tax_applicable from public.organization_products where id=cfg.product_id) then raise exception 'MEMBERSHIP_CONFIG_CHANGED';end if;
 if exists(select 1 from public.billing_product_tax_rules m join public.billing_tax_rules r on r.id=m.tax_rule_id where m.context_id=c.id and m.product_id=cfg.product_id and (current_date<r.valid_from or (r.valid_until is not null and current_date>r.valid_until))) then raise exception 'BILLING_TAX_RULE_OUTSIDE_VALIDITY';end if;
 select coalesce(sum(round(price*r.rate/100,2)),0) into taxes from public.billing_product_tax_rules m join public.billing_tax_rules r on r.id=m.tax_rule_id where m.context_id=c.id and m.product_id=cfg.product_id;
 return jsonb_build_object('type_id',t.id,'name',t.name,'season',t.season_year,'currency',c.currency,'subtotal',price,'tax_amount',taxes,'total',price+taxes,'taxes',coalesce((select jsonb_agg(jsonb_build_object('code',r.code,'name',r.name,'rate',r.rate,'amount',round(price*r.rate/100,2)) order by r.code) from public.billing_product_tax_rules m join public.billing_tax_rules r on r.id=m.tax_rule_id where m.context_id=c.id and m.product_id=cfg.product_id),'[]'));
end $$;

-- Private narrow domain writer: no public EXECUTE, no caller-supplied prices, product, context or charge source.
create function public.membership_billing_charge(p_id uuid,p_type uuid,p_contact uuid,p_payer uuid,p_total numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.organization_membership_types; cfg public.membership_billing_config; c public.billing_contexts; q jsonb; account uuid; f public.billing_folios; ch uuid; a jsonb; directory uuid;
begin
 select * into t from public.organization_membership_types where id=p_type for share;
 perform public.billing6_lock(t.organization_id);perform public.billing_lock_scope(t.organization_id,null);
 q:=public.membership_billing_quote(p_type);
 if (q->>'total')::numeric is distinct from p_total then raise exception 'MEMBERSHIP_QUOTE_CHANGED';end if;
 select * into cfg from public.membership_billing_config where membership_type_id=p_type;
 select * into c from public.billing_contexts where id=cfg.context_id for share;
 -- The wrapper has established ownership/staff authority for both beneficiary and payer.
 -- Preserve existing directory authority; this operation grants no identity-management rights.
 select id into directory from public.organization_disciplines where organization_id=t.organization_id order by id limit 1;
 if directory is null then raise exception 'MEMBERSHIP_DIRECTORY_REQUIRED';end if;
 insert into public.directory_contacts(organization_discipline_id,contact_id) values(directory,p_contact),(directory,p_payer) on conflict do nothing;
 perform pg_advisory_xact_lock(hashtextextended('billing-customer:'||t.organization_id||':'||p_payer,0));
 insert into public.billing_customer_accounts(organization_id,payer_contact_id) values(t.organization_id,p_payer) on conflict do nothing;
 select id into account from public.billing_customer_accounts where organization_id=t.organization_id and payer_contact_id=p_payer;
 a:=jsonb_build_object('kind','membership_purchase','actor',public.current_profile_id(),'membership_id',p_id,'contact_id',p_contact,'payer_contact_id',p_payer,'checked_at',clock_timestamp());
 select * into f from public.billing_folios where billing_context_id=c.id and payer_customer_account_id=account for update;
 if not found then insert into public.billing_folios(organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by) values(t.organization_id,c.id,account,c.currency,public.billing_number(t.organization_id,'account',c.config->>'account_prefix'),public.current_profile_id()) returning * into f;end if;
 if f.state<>'open' then raise exception 'BILLING_FOLIO_CLOSED';end if;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(t.organization_id,f.id,c.currency,'secretary_sale',p_id,cfg.product_id,'manual',t.name||' '||t.season_year,1,(q->>'subtotal')::numeric,(q->>'subtotal')::numeric,(q->>'tax_amount')::numeric,case when not t.tax_applicable then 'Carte sans taxes — choix explicite de l’association' end,p_contact,public.current_profile_id(),a) returning id into ch;
 insert into public.billing_charge_taxes select ch,r.id,r.name,r.code,r.jurisdiction,r.rate,(q->>'subtotal')::numeric,round((q->>'subtotal')::numeric*r.rate/100,2) from public.billing_product_tax_rules m join public.billing_tax_rules r on r.id=m.tax_rule_id where m.context_id=c.id and m.product_id=cfg.product_id;
 update public.billing_folios set version=version+1 where id=f.id;
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload) values(t.organization_id,f.id,public.current_profile_id(),'membership_purchase',a,jsonb_build_object('membership_id',p_id,'charge_id',ch,'quote',q));
 return ch;
end $$;

create function public.purchase_billed_membership(p_type uuid,p_contact uuid,p_payer uuid,p_total numeric) returns public.contact_organization_memberships language plpgsql security definer set search_path='' as $$
declare t public.organization_membership_types; m public.contact_organization_memberships; id uuid:=gen_random_uuid(); ch uuid;
begin
 select * into t from public.organization_membership_types where organization_membership_types.id=p_type for share;
 if t.id is null or public.current_profile_id() is null or not((public.can_access_contact(p_contact) and exists(select 1 from public.contacts payer where payer.id=p_payer and payer.linked_user_id=public.current_profile_id())) or public.is_org_member(t.organization_id,array['admin','secretary']) or public.is_platform_admin()) then raise exception 'BILLING_FORBIDDEN';end if;
 perform public.billing6_lock(t.organization_id);perform public.billing_lock_scope(t.organization_id,null);
 select * into m from public.contact_organization_memberships where membership_type_id=p_type and contact_id=p_contact and season_year=t.season_year for update;
 if found then
  if m.billing_charge_id is null then raise exception 'MEMBERSHIP_LEGACY_REVIEW_REQUIRED';end if;
  if m.payer_contact_id is distinct from p_payer then raise exception 'MEMBERSHIP_PAYER_CHANGED';end if;
  return m;
 end if;
 ch:=public.membership_billing_charge(id,p_type,p_contact,p_payer,p_total);
 insert into public.contact_organization_memberships(id,organization_id,contact_id,membership_type_id,payer_contact_id,status,sold_by_user_id,billing_charge_id)
 values(id,t.organization_id,p_contact,p_type,p_payer,case when p_total=0 then 'active' else 'draft' end,public.current_profile_id(),ch) returning * into m;
 return m;
end $$;

create function public.membership_billing_reconcile(p_membership uuid,p_total numeric,p_payer uuid default null) returns public.contact_organization_memberships language plpgsql security definer set search_path='' as $$
declare m public.contact_organization_memberships; i public.invoices; ch uuid; t public.organization_membership_types; a jsonb;
begin
 select * into m from public.contact_organization_memberships where id=p_membership;
 if m.id is null then raise exception 'MEMBERSHIP_NOT_FOUND';end if;
 a:=public.billing_assert_staff(m.organization_id);
 perform public.billing6_lock(m.organization_id);perform public.billing_lock_scope(m.organization_id,null);
 select * into m from public.contact_organization_memberships where id=p_membership for update;
 if m.billing_charge_id is not null then return m;end if;
 select * into i from public.invoices where id=m.invoice_id for update;
 if m.show_id is not null or m.status='cancelled' or i.id is null or i.status<>'draft' or i.total_paid<>0 or i.total_amount is distinct from p_total or (select count(*) from public.invoice_line_items where invoice_id=i.id)<>1 or not exists(select 1 from public.invoice_line_items where invoice_id=i.id and item_type='membership' and item_id=m.id and quantity=1) or exists(select 1 from public.payments where invoice_id=i.id) then raise exception 'MEMBERSHIP_LEGACY_MANUAL_REVIEW';end if;
 if p_payer is not null and not(public.contact_is_linked_to_org(p_payer,m.organization_id) or exists(select 1 from public.contacts where id=p_payer and linked_user_id=public.current_profile_id())) then raise exception 'BILLING_INVALID_PAYER';end if;
 ch:=public.membership_billing_charge(m.id,m.membership_type_id,m.contact_id,coalesce(p_payer,m.payer_contact_id),p_total);
 -- Keep the old invoice and its original amounts for audit; it no longer represents a second receivable.
 -- Only this already-locked, verified unpaid draft may pass the legacy guard below.
 update public.invoices set status='void' where id=i.id;
 update public.contact_organization_memberships set billing_charge_id=ch,payer_contact_id=coalesce(p_payer,payer_contact_id),status=case when p_total=0 then 'active' else 'draft' end,activated_at=case when p_total=0 then clock_timestamp() end where id=m.id returning * into m;
 insert into public.billing_audit_events(organization_id,actor_id,operation,authorization_snapshot,payload) values(m.organization_id,public.current_profile_id(),'membership_legacy_reconciled',a,jsonb_build_object('membership',m.id,'legacy_invoice',i.id,'charge',ch,'total',p_total));
 return m;
end $$;

-- Guarded exception for reconciliation: exact draft invoice, exact charge, same amount; no balances are discarded.
create function public.membership_invoice_reconciliation_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.status='draft' and new.status='void' and to_jsonb(old)-'status'-'updated_at'-'balance_due'=to_jsonb(new)-'status'-'updated_at'-'balance_due' and old.total_paid=0
 and exists(select 1 from public.contact_organization_memberships m join public.billing_charges ch on ch.source_id=m.id join public.membership_billing_config cfg on cfg.membership_type_id=m.membership_type_id where m.invoice_id=old.id and m.billing_charge_id is null and ch.total=old.total_amount and ch.product_id=cfg.product_id and public.billing6_staff(cfg.context_id)) then return new;end if;
 perform public.billing_lock_scope(old.organization_id,old.show_id);perform public.billing_lock_scope(new.organization_id,new.show_id);
 if exists(select 1 from public.billing_contexts c where (c.organization_id=new.organization_id and c.show_id is not distinct from new.show_id) or (c.organization_id=old.organization_id and c.show_id is not distinct from old.show_id)) then raise exception 'BILLING_LEGACY_CONTEXT_ADOPTED';end if;
 return new;
end $$;
drop trigger a_billing_engine_guard on public.invoices;
create trigger a_billing_engine_guard before update on public.invoices for each row execute function public.membership_invoice_reconciliation_guard();
create trigger a_billing_engine_guard_insert_delete before insert or delete on public.invoices for each row execute function public.billing_legacy_guard();

create function public.membership_activate_on_allocation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.contact_organization_memberships m set status='active',activated_at=clock_timestamp()
 where m.billing_charge_id=new.charge_id and m.status='draft' and exists(select 1 from public.billing_charges ch where ch.id=m.billing_charge_id and (select coalesce(sum(amount),0) from public.billing_payment_allocations where charge_id=ch.id)>=ch.total);
 return new;
end $$;
create trigger membership_payment_allocation after insert on public.billing_payment_allocations for each row execute function public.membership_activate_on_allocation();

revoke all on function public.billing_legacy_guard(),public.billing_membership_legacy_guard_base(),public.membership_legacy_invoice_sync(),public.membership_billing_charge(uuid,uuid,uuid,uuid,numeric),public.membership_invoice_reconciliation_guard(),public.membership_activate_on_allocation(),public.membership_billing_configure(uuid,jsonb),public.membership_billing_quote(uuid),public.purchase_billed_membership(uuid,uuid,uuid,numeric),public.membership_billing_reconcile(uuid,numeric,uuid) from public,anon,authenticated;
grant execute on function public.membership_billing_configure(uuid,jsonb),public.membership_billing_quote(uuid),public.purchase_billed_membership(uuid,uuid,uuid,numeric),public.membership_billing_reconcile(uuid,numeric,uuid) to authenticated;
create function public.membership_billing_admin(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a jsonb;
begin
 a:=public.billing_assert_staff(p_org);
 return jsonb_build_object('can_configure',a->>'kind'='platform_admin' or a->>'role'='admin',
 'types',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('context_id',cfg.context_id) order by t.season_year desc,t.name) from public.organization_membership_types t left join public.membership_billing_config cfg on cfg.membership_type_id=t.id where t.organization_id=p_org),'[]'),
 'payers',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',concat_ws(' ',c.first_name,c.last_name))) from public.contacts c where c.linked_user_id is not null and (public.contact_is_linked_to_org(c.id,p_org) or c.linked_user_id=public.current_profile_id())),'[]'),
 'legacy',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'type_id',m.membership_type_id,'name',concat_ws(' ',c.first_name,c.last_name),'total',i.total_amount,'paid',i.total_paid,'invoice_status',i.status,'payer_id',m.payer_contact_id)) from public.contact_organization_memberships m join public.contacts c on c.id=m.contact_id left join public.invoices i on i.id=m.invoice_id where m.organization_id=p_org and m.billing_charge_id is null and m.status<>'cancelled'),'[]'));
end $$;
revoke all on function public.membership_billing_admin(uuid) from public,anon,authenticated;
grant execute on function public.membership_billing_admin(uuid) to authenticated;
commit;
