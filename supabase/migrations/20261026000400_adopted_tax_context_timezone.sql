-- Correct only the UTC-derived start date of automatically adopted tax rules.
-- Explicit/manual dates, rates, immutable rules and historical charges are preserved.
begin;
create function public.billing_tax_effective_start(p_rule_version text,p_valid_from date,p_context_created_at timestamptz,p_timezone text)
returns date language sql immutable set search_path='' as $$
 select case when p_rule_version='reservation-adoption-1'
 and p_valid_from=(p_context_created_at at time zone 'UTC')::date
 then (p_context_created_at at time zone p_timezone)::date else p_valid_from end
$$;
revoke all on function public.billing_tax_effective_start(text,date,timestamptz,text) from public,anon,authenticated,service_role;
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
    and ((clock_timestamp() at time zone (c.config->>'timezone'))::date<public.billing_tax_effective_start(t.rule_version,t.valid_from,c.created_at,c.config->>'timezone') or (t.valid_until is not null and (clock_timestamp() at time zone (c.config->>'timezone'))::date>t.valid_until))) then raise exception 'BILLING_TAX_RULE_OUTSIDE_VALIDITY'; end if;
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

create or replace function public.billing_hsp_quote_value(p_sale jsonb) returns jsonb language plpgsql set search_path='' as $$
declare q jsonb; c public.billing_contexts;
begin
 q:=public.billing_hsp_quote_before_validity(p_sale);
 select * into c from public.billing_contexts where id=(p_sale->>'context_id')::uuid;
 if exists(select 1 from public.billing_product_tax_rules p join public.billing_tax_rules t on t.id=p.tax_rule_id
 where p.context_id=c.id and p.product_id in(select (l->>'product_id')::uuid from jsonb_array_elements(q->'lines') l)
 and ((clock_timestamp() at time zone(c.config->>'timezone'))::date<public.billing_tax_effective_start(t.rule_version,t.valid_from,c.created_at,c.config->>'timezone') or (t.valid_until is not null and (clock_timestamp() at time zone(c.config->>'timezone'))::date>t.valid_until))) then raise exception 'BILLING_TAX_RULE_OUTSIDE_VALIDITY'; end if;
 return q;
end $$;

create or replace function public.billing_hsp_add_fee() returns trigger language plpgsql set search_path='' as $$
declare pol public.billing_hsp_policies; f public.billing_folios; cid uuid; tax numeric; profile public.billing_product_tax_profiles; fee numeric;
begin
 if new.source_type='hsp_service' then return new; end if;
 select * into f from public.billing_folios where id=new.folio_id;
 select * into pol from public.billing_hsp_policies where context_id=f.billing_context_id;
 if pol.context_id is null or exists(select 1 from public.billing_hsp_assessments where folio_id=f.id) then return new; end if;
 select * into profile from public.billing_product_tax_profiles where context_id=pol.context_id and product_id=pol.product_id;
 fee:=(public.billing_effective_hsp_fee(pol.context_id)->>'amount')::numeric;
 if profile.context_id is null or fee is null then raise exception 'BILLING_HSP_PROFILE_REQUIRED'; end if;
 if exists(select 1 from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=pol.context_id and m.product_id=pol.product_id and ((clock_timestamp() at time zone (select config->>'timezone' from public.billing_contexts where id=pol.context_id))::date<public.billing_tax_effective_start(t.rule_version,t.valid_from,(select created_at from public.billing_contexts where id=pol.context_id),(select config->>'timezone' from public.billing_contexts where id=pol.context_id)) or (t.valid_until is not null and (clock_timestamp() at time zone (select config->>'timezone' from public.billing_contexts where id=pol.context_id))::date>t.valid_until))) then raise exception 'BILLING_TAX_RULE_OUTSIDE_VALIDITY'; end if;
 select coalesce(sum(round(fee*t.rate/100,2)),0) into tax from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=pol.context_id and m.product_id=pol.product_id;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(new.organization_id,f.id,'CAD','hsp_service',f.id,pol.product_id,'other','Frais de service HSP',1,fee,fee,tax,profile.exemption_reason,(select payer_contact_id from public.billing_customer_accounts where id=f.payer_customer_account_id),new.actor_id,new.authorization_snapshot) returning id into cid;
 insert into public.billing_charge_taxes select cid,t.id,t.name,t.code,t.jurisdiction,t.rate,fee,round(fee*t.rate/100,2) from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=pol.context_id and m.product_id=pol.product_id;
 insert into public.billing_hsp_assessments values(f.id,cid,pol.context_id);
 return new;
end $$;
commit;
