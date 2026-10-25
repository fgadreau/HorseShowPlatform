-- Local review only. No activation, historical rewrite or Stripe funds transfer.
create table public.billing_hsp_fee_settings (
 scope text not null check(scope in ('platform','association','show')),
 scope_id uuid not null,
 amount numeric(12,2) check(amount>=0),
 sponsored boolean generated always as (amount=0) stored,
 note text check(length(note)<=1000),
 changed_by uuid references public.user_profiles(id),
 changed_at timestamptz not null default clock_timestamp(),
 primary key(scope,scope_id),
 check(scope<>'platform' or (scope_id='00000000-0000-0000-0000-000000000000' and amount>0))
);
insert into public.billing_hsp_fee_settings(scope,scope_id,amount,note) values('platform','00000000-0000-0000-0000-000000000000',5,'Default commercial fee, before applicable taxes');
create table public.billing_hsp_fee_setting_events (id bigint generated always as identity primary key, setting jsonb not null, created_at timestamptz not null default clock_timestamp());
create trigger immutable before update or delete on public.billing_hsp_fee_setting_events for each row execute function public.billing_immutable();
-- Explicit product ownership; existing products remain Association. Configure only before sales.
create table public.billing_hsp_products (
 organization_id uuid not null, product_id uuid primary key,
 foreign key(organization_id,product_id) references public.organization_products(organization_id,id)
);
alter table public.billing_hsp_fee_settings enable row level security;
alter table public.billing_hsp_fee_setting_events enable row level security;
alter table public.billing_hsp_products enable row level security;
revoke all on public.billing_hsp_fee_settings,public.billing_hsp_fee_setting_events,public.billing_hsp_products from public,anon,authenticated,service_role;
create function public.set_billing_hsp_fee(p_scope text,p_id uuid,p_amount numeric,p_note text default null) returns void language plpgsql security definer set search_path='' as $$
declare org uuid; rowdata jsonb;
begin
 if p_scope='association' then select id into org from public.organizations where id=p_id;
 elsif p_scope='show' then select organization_id into org from public.shows where id=p_id;
 elsif p_scope<>'platform' then raise exception 'BILLING_INVALID_SCOPE'; end if;
 if public.current_profile_id() is null or not coalesce(public.is_platform_admin() or (org is not null and public.is_org_member(org,array['admin'])),false) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 if (p_scope<>'platform' and org is null) or (p_scope='platform' and (p_id<>'00000000-0000-0000-0000-000000000000' or p_amount is null or p_amount<=0)) or p_amount<0 or p_amount<>round(p_amount,2) or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'BILLING_INVALID_AMOUNT'; end if;
 insert into public.billing_hsp_fee_settings(scope,scope_id,amount,note,changed_by) values(p_scope,p_id,p_amount,p_note,public.current_profile_id())
 on conflict(scope,scope_id) do update set amount=excluded.amount,note=excluded.note,changed_by=excluded.changed_by,changed_at=clock_timestamp()
 returning to_jsonb(billing_hsp_fee_settings.*) into rowdata;
 insert into public.billing_hsp_fee_setting_events(setting) values(rowdata);
end $$;
create function public.billing_effective_hsp_fee(p_context uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('amount',s.amount,'source',s.scope,'sponsored',s.amount=0,'sponsorship_level',case when s.amount=0 then s.scope end,'note',s.note,'changed_by',s.changed_by,'changed_at',s.changed_at,'tax_basis','exclusive')
 from public.billing_contexts c join public.billing_hsp_fee_settings s on
 (s.scope='platform' or (s.scope='association' and s.scope_id=c.organization_id) or (s.scope='show' and s.scope_id=c.show_id))
 where c.id=p_context and s.amount is not null order by case s.scope when 'show' then 1 when 'association' then 2 else 3 end limit 1
$$;
alter table public.billing_charges add column supplier text not null default 'association' check(supplier in ('association','hsp')),
 add column hsp_fee_snapshot jsonb;
create unique index billing_one_hsp_fee_per_folio on public.billing_charges(folio_id) where supplier='hsp';
create function public.billing_capture_hsp_fee() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.billing_hsp_products where product_id=new.product_id) then
 new.supplier:='hsp';
 new.hsp_fee_snapshot:=public.billing_effective_hsp_fee((select billing_context_id from public.billing_folios where id=new.folio_id));
 if new.quantity<>1 or new.subtotal<>(new.hsp_fee_snapshot->>'amount')::numeric then raise exception 'BILLING_HSP_FEE_INVALID'; end if;
 new.description:=case when new.subtotal=0 then 'Frais de service HSP commandités — 0,00 $' else 'Frais de service HSP — '||replace(to_char(new.subtotal,'FM999999990.00'),'.',',')||' $ plus taxes' end;
 end if;
 return new;
end $$;
create trigger billing_capture_hsp_fee before insert on public.billing_charges for each row execute function public.billing_capture_hsp_fee();
create or replace function public.billing6_execute_foundation(p_request_id uuid,p_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_contexts; f public.billing_folios; a jsonb; actor uuid:=public.current_profile_id();
 op text:=p_command->>'operation'; previous public.billing_operations; response jsonb; account uuid; payer uuid;
 product public.organization_products; profile public.billing_product_tax_profiles; qty numeric; price numeric; base numeric; tax numeric;
 charge uuid; pay uuid; doc uuid; num text; snap jsonb; amount numeric; alloc jsonb; allocated numeric:=0; owed numeric;
 beneficiary uuid; horse uuid; at_time timestamptz; allowed text[];
begin
 if p_request_id is null or p_command is null or jsonb_typeof(p_command)<>'object' or op is null then raise exception 'BILLING_INVALID_REQUEST'; end if;
 if op='sale' then
  allowed:=array['operation','context_id','payer_customer_account_id','product_id','quantity','beneficiary_contact_id','horse_id','source_id'];
  select * into c from public.billing_contexts where id=(p_command->>'context_id')::uuid;
 else
  allowed:=case op when 'payment' then array['operation','folio_id','version','amount','method','reference','received_at','confirmed','allocations']
   when 'statement' then array['operation','folio_id'] when 'finalize' then array['operation','folio_id','version','statement_id'] else null end;
  select ctx.* into c from public.billing_folios fol join public.billing_contexts ctx on ctx.id=fol.billing_context_id where fol.id=(p_command->>'folio_id')::uuid;
 end if;
 if c.id is null or allowed is null then raise exception 'BILLING_NOT_FOUND_OR_INVALID'; end if;
 if exists(select 1 from jsonb_object_keys(p_command) k where not(k=any(allowed))) then raise exception 'BILLING_UNEXPECTED_FIELD'; end if;
 a:=public.billing_assert_staff(c.organization_id,c.show_id);
 if a->>'kind'<>'platform_admin' and not(c.config->'staff_roles' ? (a->>'role')) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 perform public.billing_lock_scope(c.organization_id,c.show_id);
 perform pg_advisory_xact_lock(hashtextextended('billing-request:'||c.organization_id||':'||actor||':'||p_request_id,0));
 select * into previous from public.billing_operations where organization_id=c.organization_id and actor_id=actor and request_id=p_request_id;
 if found then
  if previous.request<>p_command then raise exception 'BILLING_IDEMPOTENCY_CONFLICT' using errcode='22023'; end if;
  return previous.response;
 end if;
 if op='sale' then
  if clock_timestamp()<c.opens_at or (c.closes_at is not null and clock_timestamp()>=c.closes_at) then raise exception 'BILLING_CONTEXT_NOT_OPEN'; end if;
  select id,payer_contact_id into account,payer from public.billing_customer_accounts
   where id=(p_command->>'payer_customer_account_id')::uuid and organization_id=c.organization_id;
  if account is null or not public.contact_is_linked_to_org(payer,c.organization_id) then raise exception 'BILLING_INVALID_PAYER'; end if;
  beneficiary:=coalesce((p_command->>'beneficiary_contact_id')::uuid,payer); horse:=(p_command->>'horse_id')::uuid;
  if not public.contact_is_linked_to_org(beneficiary,c.organization_id) or (horse is not null and not public.horse_is_linked_to_org(horse,c.organization_id)) then raise exception 'BILLING_INVALID_BENEFICIARY'; end if;
  select * into product from public.organization_products where id=(p_command->>'product_id')::uuid and organization_id=c.organization_id and is_active for share;
  if not found or not(c.config->'categories' ? product.category) then raise exception 'BILLING_INVALID_PRODUCT'; end if;
  select * into profile from public.billing_product_tax_profiles where context_id=c.id and product_id=product.id;
  if not found then raise exception 'BILLING_TAX_CONFIG_REQUIRED'; end if;
  if exists(select 1 from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=c.id and m.product_id=product.id
    and ((clock_timestamp() at time zone (c.config->>'timezone'))::date<t.valid_from or (t.valid_until is not null and (clock_timestamp() at time zone (c.config->>'timezone'))::date>t.valid_until))) then raise exception 'BILLING_TAX_RULE_OUTSIDE_VALIDITY'; end if;
  qty:=(p_command->>'quantity')::numeric; price:=profile.unit_price;
  if exists(select 1 from public.billing_hsp_products where product_id=product.id) then price:=(public.billing_effective_hsp_fee(c.id)->>'amount')::numeric; end if;
  if qty is null or not(qty>0 and qty<1000000000) or qty<>round(qty,3) or not(price>=0 and price<10000000000) or price<>round(price,2) then raise exception 'BILLING_INVALID_AMOUNT'; end if;
  if (p_command->>'source_id') is null then raise exception 'BILLING_SOURCE_REQUIRED'; end if;
  base:=round(qty*price,2);
  select coalesce(sum(round(base*t.rate/100,2)),0) into tax from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id
   where m.context_id=c.id and m.product_id=product.id;
  select * into f from public.billing_folios where organization_id=c.organization_id and billing_context_id=c.id and payer_customer_account_id=account for update;
  if not found then
   insert into public.billing_folios(organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by)
   values(c.organization_id,c.id,account,c.currency,public.billing_number(c.organization_id,'account',c.config->>'account_prefix'),actor) returning * into f;
  end if;
  if f.state<>'open' then raise exception 'BILLING_FOLIO_CLOSED'; end if;
  insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,
   exemption_reason,beneficiary_contact_id,horse_id,actor_id,authorization_snapshot)
  values(c.organization_id,f.id,c.currency,'secretary_sale',(p_command->>'source_id')::uuid,product.id,product.category,product.name,qty,price,base,tax,profile.exemption_reason,beneficiary,horse,actor,a) returning id into charge;
  insert into public.billing_charge_taxes select charge,t.id,t.name,t.code,t.jurisdiction,t.rate,base,round(base*t.rate/100,2)
   from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=c.id and m.product_id=product.id;
  if horse is not null then insert into public.billing_folio_horses(folio_id,horse_id,source_charge_id,actor_id) values(f.id,horse,charge,actor) on conflict do nothing; end if;
 else
  select * into f from public.billing_folios where id=(p_command->>'folio_id')::uuid for update;
  if op in ('payment','finalize') then
   if (p_command->>'version')::bigint is distinct from f.version then raise exception 'BILLING_STALE_VERSION' using errcode='40001'; end if;
  end if;
  if op='payment' then
   amount:=(p_command->>'amount')::numeric; at_time:=(p_command->>'received_at')::timestamptz;
   if amount is null or not(amount>0 and amount<1000000000000) or amount<>round(amount,2) or at_time is null or at_time>clock_timestamp()
    or p_command->>'confirmed' is distinct from 'true' or coalesce(p_command->>'method','') not in ('cash','etransfer','cheque','other')
    or jsonb_typeof(p_command->'allocations') is distinct from 'array' then raise exception 'BILLING_PAYMENT_NOT_CONFIRMED_OR_INVALID'; end if;
   snap:=public.billing_snapshot(f.id);
   if amount>(snap->>'balance')::numeric then raise exception 'BILLING_PAYMENT_EXCEEDS_BALANCE'; end if;
   insert into public.billing_payments(organization_id,folio_id,currency,amount,method,reference,received_at,actor_id,authorization_snapshot)
    values(c.organization_id,f.id,c.currency,amount,p_command->>'method',nullif(btrim(p_command->>'reference'),''),at_time,actor,a) returning id into pay;
   for alloc in select * from jsonb_array_elements(p_command->'allocations') order by value->>'charge_id' loop
    if jsonb_typeof(alloc)<>'object' or exists(select 1 from jsonb_object_keys(alloc) k where k not in ('charge_id','amount')) then raise exception 'BILLING_INVALID_ALLOCATION'; end if;
    select ch.total-coalesce((select sum(pa.amount) from public.billing_payment_allocations pa where pa.charge_id=ch.id),0)
    into owed from public.billing_charges ch where ch.id=(alloc->>'charge_id')::uuid and ch.folio_id=f.id;
    if owed is null or (alloc->>'amount') is null or not((alloc->>'amount')::numeric>0 and (alloc->>'amount')::numeric<=owed)
      or (alloc->>'amount')::numeric<>round((alloc->>'amount')::numeric,2) then raise exception 'BILLING_INVALID_ALLOCATION'; end if;
    insert into public.billing_payment_allocations values(f.id,pay,(alloc->>'charge_id')::uuid,(alloc->>'amount')::numeric);
    allocated:=allocated+(alloc->>'amount')::numeric;
   end loop;
   if allocated<>amount then raise exception 'BILLING_ALLOCATION_TOTAL_MISMATCH'; end if;
   num:=public.billing_number(c.organization_id,'receipt',c.config->>'receipt_prefix');
  elsif op='finalize' then
   if f.state='closed' then
    select id into doc from public.billing_documents where folio_id=f.id and kind='invoice';
   else
    if f.version=0 then raise exception 'BILLING_EMPTY_FOLIO'; end if;
    select snapshot into snap from public.billing_documents where id=(p_command->>'statement_id')::uuid and folio_id=f.id and kind='statement';
    if snap is null then raise exception 'BILLING_RECAP_REQUIRED'; end if;
    if (snap-array['issued_at','payment_id']) is distinct from public.billing_snapshot(f.id) then raise exception 'BILLING_STALE_RECAP' using errcode='40001'; end if;
    num:=public.billing_number(c.organization_id,'invoice',c.config->>'invoice_prefix');
    update public.billing_folios set state='closed',closed_at=clock_timestamp(),closed_by=actor where id=f.id;
   end if;
  end if;
 end if;
 if op in ('sale','payment') or (op='finalize' and doc is null) then update public.billing_folios set version=version+1 where id=f.id; end if;
 if op in ('payment','statement','finalize') and doc is null then
  snap:=public.billing_snapshot(f.id);
  insert into public.billing_documents(organization_id,folio_id,currency,kind,number,payment_id,snapshot,actor_id)
   values(c.organization_id,f.id,c.currency,case op when 'payment' then 'receipt' when 'finalize' then 'invoice' else 'statement' end,num,pay,
    snap||jsonb_build_object('payment_id',pay,'issued_at',clock_timestamp())||case when pay is null then '{}'::jsonb else jsonb_build_object('receipt_payment',(select v from jsonb_array_elements(snap->'payments') v where v->>'id'=pay::text)) end,actor) returning id into doc;
  insert into public.billing_outbox(document_id) values(doc);
 end if;
 response:=jsonb_build_object('account',public.billing_snapshot(f.id)||jsonb_build_object('version',(select version from public.billing_folios where id=f.id)),'charge_id',charge,'payment_id',pay,'document_id',doc);
 if doc is not null then response:=response||jsonb_build_object('document',public.billing_document_payload(doc)); end if;
 insert into public.billing_operations values(c.organization_id,actor,p_request_id,p_command,response,clock_timestamp());
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload)
 values(c.organization_id,f.id,actor,op,a,jsonb_build_object('request_id',p_request_id,'charge_id',charge,'payment_id',pay,'document_id',doc));
 return response;
end $$;
alter table public.billing_payments drop constraint billing_payments_method_check;
alter table public.billing_payments add constraint billing_payments_method_check check(method in ('cash','etransfer','cheque','other','stripe_test'));
alter function public.billing_snapshot(uuid) rename to billing_consolidated_snapshot_previous;
create function public.billing_snapshot(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_set(s,'{charges}',coalesce((select jsonb_agg(c||jsonb_build_object('supplier',ch.supplier,'hsp_fee',ch.hsp_fee_snapshot) order by n) from jsonb_array_elements(s->'charges') with ordinality a(c,n) join public.billing_charges ch on ch.id=(c->>'id')::uuid),'[]'))
 ||jsonb_build_object('supplier_invoices',jsonb_build_object(
 'association',jsonb_build_object('fiscal_id',(s->>'account_number')||'-ASSOC','identity',s->'seller'),
 'hsp',jsonb_build_object('fiscal_id',(s->>'account_number')||'-HSP','identity',jsonb_build_object('billing_name','Horse Show Platform DEMO','name','HSP DEMO','address','123 rue Exemple DEMO','tax_number_1','DEMO-HSP-TPS-NON-VALIDE','tax_number_2','DEMO-HSP-TVQ-NON-VALIDE'))),
 'processing_fee_policy',jsonb_build_object('basis','supplier_payment_allocations','rounding','association rounded to cent; remainder to HSP','funds_separated',false))
 from (select public.billing_consolidated_snapshot_previous(p_folio) s) x
$$;
revoke all on function public.set_billing_hsp_fee(text,uuid,numeric,text),public.billing_effective_hsp_fee(uuid),public.billing_capture_hsp_fee(),public.billing_consolidated_snapshot_previous(uuid),public.billing_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_billing_hsp_fee(text,uuid,numeric,text) to authenticated;

create function public.get_billing_hsp_fee_settings(p_org uuid,p_show uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if public.current_profile_id() is null or not coalesce(public.is_platform_admin() or public.is_org_member(p_org,array['admin']),false) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 if p_show is not null and not exists(select 1 from public.shows where id=p_show and organization_id=p_org) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 return jsonb_build_object('platform_admin',public.is_platform_admin(),'settings',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.billing_hsp_fee_settings s where scope='platform' or (scope='association' and scope_id=p_org) or (scope='show' and scope_id=p_show)));
end $$;
revoke all on function public.get_billing_hsp_fee_settings(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_billing_hsp_fee_settings(uuid,uuid) to authenticated;

-- Unknown provider costs stay null. This is an accounting attribution, never a transfer.
alter table public.billing_payments add column processing_fee_amount numeric(14,2) check(processing_fee_amount>=0 and processing_fee_amount<1000000000000);
create function public.billing_supplier_payment(p_snapshot jsonb,p_payment jsonb,p_fee numeric) returns jsonb language plpgsql immutable set search_path='' as $$
declare assoc numeric; hsp numeric; amount numeric:=(p_payment->>'amount')::numeric; cost numeric;
begin
 select coalesce(sum((a->>'amount')::numeric) filter(where c->>'supplier'='association'),0),coalesce(sum((a->>'amount')::numeric) filter(where c->>'supplier'='hsp'),0)
 into assoc,hsp from jsonb_array_elements(p_payment->'allocations') a join jsonb_array_elements(p_snapshot->'charges') c on c->>'id'=a->>'charge_id';
 if amount<=0 or assoc+hsp<>amount then raise exception 'BILLING_INVALID_ALLOCATION'; end if;
 if p_fee is not null and (p_fee<0 or p_fee<>round(p_fee,2)) then raise exception 'BILLING_INVALID_AMOUNT'; end if;
 cost:=round(p_fee*assoc/amount,2);
 return p_payment||jsonb_build_object('supplier_allocations',jsonb_build_object('association',assoc,'hsp',hsp),
 'processing_fee',jsonb_build_object('amount',p_fee,'association',cost,'hsp',p_fee-cost,'funds_separated',false));
end $$;
alter function public.billing_snapshot(uuid) rename to billing_supplier_snapshot_base;
create function public.billing_snapshot(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_set(s,'{payments}',coalesce((select jsonb_agg(public.billing_supplier_payment(s,p,pm.processing_fee_amount) order by n)
 from jsonb_array_elements(s->'payments') with ordinality a(p,n) join public.billing_payments pm on pm.id=(p->>'id')::uuid),'[]'))
 from (select public.billing_supplier_snapshot_base(p_folio) s) x
$$;
alter function public.billing_ui_catalog(uuid) rename to billing_supplier_catalog_previous;
create function public.billing_ui_catalog(p_context uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_set(s,'{products}',coalesce((select jsonb_agg(case when h.product_id is null then p else p||jsonb_build_object('price',fee->'amount','hsp_fee',fee,'name',case when (fee->>'amount')::numeric=0 then 'Frais de service HSP commandités — 0,00 $' else 'Frais de service HSP — '||replace(to_char((fee->>'amount')::numeric,'FM999999990.00'),'.',',')||' $ plus taxes' end) end order by n)
 from jsonb_array_elements(s->'products') with ordinality a(p,n) left join public.billing_hsp_products h on h.product_id=(p->>'id')::uuid),'[]'))
 from (select public.billing_supplier_catalog_previous(p_context) s,public.billing_effective_hsp_fee(p_context) fee) x
$$;
revoke all on function public.billing_supplier_payment(jsonb,jsonb,numeric),public.billing_supplier_snapshot_base(uuid),public.billing_snapshot(uuid),public.billing_supplier_catalog_previous(uuid),public.billing_ui_catalog(uuid) from public,anon,authenticated,service_role;
grant execute on function public.billing_ui_catalog(uuid) to authenticated;
