-- Reconcile the opt-in direct-charge pilot with configurable, frozen HSP fees.
-- No activation, provider call, historical charge/document rewrite or repricing.
begin;
create or replace function public.billing_hsp_adopt(p_context uuid,p_product uuid,p_suppliers jsonb,p_mandate text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.billing_contexts; supplier jsonb;
begin
 select * into c from public.billing_contexts where id=p_context;
 if c.id is null then raise exception 'BILLING_FORBIDDEN'; end if;
 perform public.billing6_lock(c.organization_id);
 if c.kind<>'event' or c.currency<>'CAD' or exists(select 1 from public.billing_folios where billing_context_id=c.id) then raise exception 'BILLING_HSP_NEW_CONTEXT_REQUIRED'; end if;
 if not exists(select 1 from public.billing_product_tax_profiles t join public.organization_products p on p.id=t.product_id where t.context_id=c.id and t.product_id=p_product and p.organization_id=c.organization_id and p.is_active) then raise exception 'BILLING_HSP_PROFILE_REQUIRED'; end if;
 if jsonb_typeof(p_suppliers) is distinct from 'object' or not p_suppliers ?& array['association','hsp'] or (select count(*) from jsonb_object_keys(p_suppliers))<>2 then raise exception 'BILLING_HSP_SUPPLIERS_REQUIRED'; end if;
 for supplier in select value from jsonb_each(p_suppliers) loop
  if jsonb_typeof(supplier) is distinct from 'object' or not supplier ?& array['name','address','tax_number_1','demo'] or supplier->'demo' is distinct from 'true'::jsonb
   or supplier->>'tax_number_1' not like 'DEMO-%' or length(supplier->>'name') not between 1 and 150 or length(supplier->>'address') not between 1 and 250
   or exists(select 1 from jsonb_object_keys(supplier) k where k not in ('name','address','tax_number_1','tax_number_2','demo')) then raise exception 'BILLING_HSP_SUPPLIERS_REQUIRED'; end if;
 end loop;
 insert into public.billing_hsp_products(organization_id,product_id) values(c.organization_id,p_product) on conflict(product_id) do nothing;
 insert into public.billing_hsp_policies values(c.id,p_product,p_suppliers,p_mandate,clock_timestamp());
end $$;

create or replace function public.billing_hsp_quote_before_validity(p_sale jsonb) returns jsonb language plpgsql set search_path='' as $$
declare c public.billing_contexts; pol public.billing_hsp_policies; f public.billing_folios; line jsonb; lines jsonb:='[]'; pr record; base numeric; taxes jsonb; tax numeric; qty numeric;
begin
 if exists(select 1 from jsonb_object_keys(p_sale) k where k not in ('context_id','payer_customer_account_id','product_id','quantity','beneficiary_contact_id','horse_id','source_id')) then raise exception 'BILLING_UNEXPECTED_FIELD'; end if;
 select * into c from public.billing_contexts where id=(p_sale->>'context_id')::uuid;
 if c.id is null or not public.billing6_staff(c.id) then raise exception 'BILLING_FORBIDDEN'; end if;
 if not public.billing6_cap(c.id,'engine') then raise exception 'BILLING_CAPABILITY_DISABLED'; end if;
 select * into pol from public.billing_hsp_policies where context_id=c.id;
 if pol.context_id is null then raise exception 'BILLING_HSP_NOT_ADOPTED'; end if;
 if not exists(select 1 from public.billing_customer_accounts where id=(p_sale->>'payer_customer_account_id')::uuid and organization_id=c.organization_id) then raise exception 'BILLING_INVALID_PAYER'; end if;
 if (p_sale->>'product_id')::uuid=pol.product_id then raise exception 'BILLING_HSP_SYSTEM_CHARGE'; end if;
 qty:=(p_sale->>'quantity')::numeric;
 if qty is null or qty<=0 or qty<>round(qty,3) then raise exception 'BILLING_INVALID_AMOUNT'; end if;
 select * into f from public.billing_folios where billing_context_id=c.id and payer_customer_account_id=(p_sale->>'payer_customer_account_id')::uuid;
 for pr in select t.*,p.name,p.category from public.billing_product_tax_profiles t join public.organization_products p on p.id=t.product_id
 where t.context_id=c.id and p.is_active and (t.product_id=(p_sale->>'product_id')::uuid or (t.product_id=pol.product_id and not exists(select 1 from public.billing_hsp_assessments where folio_id=f.id))) order by (t.product_id=pol.product_id),t.product_id loop
  base:=round((case when pr.product_id=pol.product_id then (public.billing_effective_hsp_fee(c.id)->>'amount')::numeric else pr.unit_price end)*case when pr.product_id=pol.product_id then 1 else qty end,2);
  select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'name',t.name,'rate',t.rate,'jurisdiction',t.jurisdiction,'base',base,'amount',round(base*t.rate/100,2)) order by t.code),'[]'),coalesce(sum(round(base*t.rate/100,2)),0) into taxes,tax
   from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=c.id and m.product_id=pr.product_id;
  if (jsonb_array_length(taxes)=0)=(nullif(btrim(pr.exemption_reason),'') is null) then raise exception 'BILLING_TAX_CONFIG_REQUIRED'; end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('supplier',case when pr.product_id=pol.product_id then 'hsp' else 'association' end,'product_id',pr.product_id,'description',case when pr.product_id=pol.product_id then 'Frais de service HSP' else pr.name end,'quantity',case when pr.product_id=pol.product_id then 1 else qty end,'unit_price',case when pr.product_id=pol.product_id then (public.billing_effective_hsp_fee(c.id)->>'amount')::numeric else pr.unit_price end,'subtotal',base,'taxes',taxes,'tax_amount',tax,'total',base+tax,'exemption_reason',pr.exemption_reason));
 end loop;
 if not exists(select 1 from jsonb_array_elements(lines) l where l->>'supplier'='association' and (l->>'subtotal')::numeric>0) then raise exception 'BILLING_HSP_ZERO_OPERATION_UNSUPPORTED'; end if;
 return jsonb_build_object('lines',lines,'suppliers',pol.suppliers,'mandate',pol.mandate,'currency','CAD','folio_version',f.version,'folio_id',f.id,'total',(select sum((l->>'total')::numeric) from jsonb_array_elements(lines) l));
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
 if exists(select 1 from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=pol.context_id and m.product_id=pol.product_id and ((clock_timestamp() at time zone (select config->>'timezone' from public.billing_contexts where id=pol.context_id))::date<t.valid_from or (t.valid_until is not null and (clock_timestamp() at time zone (select config->>'timezone' from public.billing_contexts where id=pol.context_id))::date>t.valid_until))) then raise exception 'BILLING_TAX_RULE_OUTSIDE_VALIDITY'; end if;
 select coalesce(sum(round(fee*t.rate/100,2)),0) into tax from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=pol.context_id and m.product_id=pol.product_id;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(new.organization_id,f.id,'CAD','hsp_service',f.id,pol.product_id,'other','Frais de service HSP',1,fee,fee,tax,profile.exemption_reason,(select payer_contact_id from public.billing_customer_accounts where id=f.payer_customer_account_id),new.actor_id,new.authorization_snapshot) returning id into cid;
 insert into public.billing_charge_taxes select cid,t.id,t.name,t.code,t.jurisdiction,t.rate,fee,round(fee*t.rate/100,2) from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=pol.context_id and m.product_id=pol.product_id;
 insert into public.billing_hsp_assessments values(f.id,cid,pol.context_id);
 return new;
end $$;

-- Existing grants are retained by CREATE OR REPLACE. Internal helpers stay private.
revoke all on function public.billing_hsp_quote_before_validity(jsonb),public.billing_hsp_add_fee() from public,anon,authenticated,service_role;
commit;
