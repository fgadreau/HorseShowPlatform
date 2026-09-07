-- Fictitious opt-in HSP agency prototype. No adoption/backfill/provider calls in migration.
begin;
create table public.billing_hsp_policies (
 context_id uuid primary key references public.billing_contexts(id),
 product_id uuid not null references public.organization_products(id),
 suppliers jsonb not null, mandate text not null check(length(mandate) between 1 and 250),
 created_at timestamptz not null default clock_timestamp()
);
create table public.billing_hsp_assessments (
 folio_id uuid primary key references public.billing_folios(id),
 charge_id uuid not null unique references public.billing_charges(id),
 context_id uuid not null references public.billing_hsp_policies(context_id)
);
create table public.billing_hsp_quotes (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.user_profiles(id),
 context_id uuid not null references public.billing_contexts(id), command jsonb not null,
 snapshot jsonb not null, expires_at timestamptz not null default clock_timestamp()+interval '20 minutes'
);
create table public.billing_hsp_commands (
 actor_id uuid not null references public.user_profiles(id), request_id uuid not null,
 command jsonb not null, response jsonb not null, primary key(actor_id,request_id)
);
alter table public.billing_charges drop constraint billing_charges_source_type_check;
alter table public.billing_charges add constraint billing_charges_source_type_check check(source_type in ('secretary_sale','hsp_service'));
create unique index billing_hsp_once on public.billing_charges(folio_id) where source_type='hsp_service';

-- Service authority only, explicit fictitious identities and an unused CAD event context.
create function public.billing_hsp_adopt(p_context uuid,p_product uuid,p_suppliers jsonb,p_mandate text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.billing_contexts; supplier jsonb;
begin
 select * into c from public.billing_contexts where id=p_context;
 if c.id is null then raise exception 'BILLING_FORBIDDEN'; end if;
 perform public.billing6_lock(c.organization_id);
 if c.kind<>'event' or c.currency<>'CAD' or exists(select 1 from public.billing_folios where billing_context_id=c.id) then raise exception 'BILLING_HSP_NEW_CONTEXT_REQUIRED'; end if;
 if not exists(select 1 from public.billing_product_tax_profiles t join public.organization_products p on p.id=t.product_id where t.context_id=c.id and t.product_id=p_product and t.unit_price=5 and p.organization_id=c.organization_id and p.is_active) then raise exception 'BILLING_HSP_PROFILE_REQUIRED'; end if;
 if jsonb_typeof(p_suppliers) is distinct from 'object' or not p_suppliers ?& array['association','hsp'] or (select count(*) from jsonb_object_keys(p_suppliers))<>2 then raise exception 'BILLING_HSP_SUPPLIERS_REQUIRED'; end if;
 for supplier in select value from jsonb_each(p_suppliers) loop
  if jsonb_typeof(supplier) is distinct from 'object' or not supplier ?& array['name','address','tax_number_1','demo'] or supplier->'demo' is distinct from 'true'::jsonb
   or supplier->>'tax_number_1' not like 'DEMO-%' or length(supplier->>'name') not between 1 and 150 or length(supplier->>'address') not between 1 and 250
   or exists(select 1 from jsonb_object_keys(supplier) k where k not in ('name','address','tax_number_1','tax_number_2','demo')) then raise exception 'BILLING_HSP_SUPPLIERS_REQUIRED'; end if;
 end loop;
 insert into public.billing_hsp_policies values(c.id,p_product,p_suppliers,p_mandate,clock_timestamp());
end $$;

create function public.billing_hsp_quote_value(p_sale jsonb) returns jsonb language plpgsql set search_path='' as $$
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
  base:=round(pr.unit_price*case when pr.product_id=pol.product_id then 1 else qty end,2);
  select coalesce(jsonb_agg(jsonb_build_object('code',t.code,'name',t.name,'rate',t.rate,'jurisdiction',t.jurisdiction,'base',base,'amount',round(base*t.rate/100,2)) order by t.code),'[]'),coalesce(sum(round(base*t.rate/100,2)),0) into taxes,tax
   from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=c.id and m.product_id=pr.product_id;
  if (jsonb_array_length(taxes)=0)=(nullif(btrim(pr.exemption_reason),'') is null) then raise exception 'BILLING_TAX_CONFIG_REQUIRED'; end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('supplier',case when pr.product_id=pol.product_id then 'hsp' else 'association' end,'product_id',pr.product_id,'description',case when pr.product_id=pol.product_id then 'Frais de service HSP' else pr.name end,'quantity',case when pr.product_id=pol.product_id then 1 else qty end,'unit_price',pr.unit_price,'subtotal',base,'taxes',taxes,'tax_amount',tax,'total',base+tax,'exemption_reason',pr.exemption_reason));
 end loop;
 if not exists(select 1 from jsonb_array_elements(lines) l where l->>'supplier'='association' and (l->>'subtotal')::numeric>0) then raise exception 'BILLING_HSP_ZERO_OPERATION_UNSUPPORTED'; end if;
 return jsonb_build_object('lines',lines,'suppliers',pol.suppliers,'mandate',pol.mandate,'currency','CAD','folio_version',f.version,'folio_id',f.id,'total',(select sum((l->>'total')::numeric) from jsonb_array_elements(lines) l));
end $$;
create function public.prepare_billing_operation_quote(p_sale jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.billing_hsp_quotes; snap jsonb; org uuid;
begin
 select organization_id into org from public.billing_contexts where id=(p_sale->>'context_id')::uuid;
 if org is null then raise exception 'BILLING_FORBIDDEN'; end if;
 perform public.billing6_lock(org);
 snap:=public.billing_hsp_quote_value(p_sale);
 insert into public.billing_hsp_quotes(actor_id,context_id,command,snapshot) values(public.current_profile_id(),(p_sale->>'context_id')::uuid,p_sale,snap) returning * into q;
 return snap||jsonb_build_object('quote_id',q.id,'expires_at',q.expires_at);
end $$;

-- The existing sale transaction inserts the fee before its response/version/audit commit.
create function public.billing_hsp_add_fee() returns trigger language plpgsql set search_path='' as $$
declare pol public.billing_hsp_policies; f public.billing_folios; cid uuid; tax numeric; profile public.billing_product_tax_profiles;
begin
 if new.source_type='hsp_service' then return new; end if;
 select * into f from public.billing_folios where id=new.folio_id;
 select * into pol from public.billing_hsp_policies where context_id=f.billing_context_id;
 if pol.context_id is null or exists(select 1 from public.billing_hsp_assessments where folio_id=f.id) then return new; end if;
 select * into profile from public.billing_product_tax_profiles where context_id=pol.context_id and product_id=pol.product_id;
 if profile.unit_price<>5 then raise exception 'BILLING_HSP_PROFILE_REQUIRED'; end if;
 select coalesce(sum(round(5*t.rate/100,2)),0) into tax from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=pol.context_id and m.product_id=pol.product_id;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(new.organization_id,f.id,'CAD','hsp_service',f.id,pol.product_id,'other','Frais de service HSP',1,5,5,tax,profile.exemption_reason,(select payer_contact_id from public.billing_customer_accounts where id=f.payer_customer_account_id),new.actor_id,new.authorization_snapshot) returning id into cid;
 insert into public.billing_charge_taxes select cid,t.id,t.name,t.code,t.jurisdiction,t.rate,5,round(5*t.rate/100,2) from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=pol.context_id and m.product_id=pol.product_id;
 insert into public.billing_hsp_assessments values(f.id,cid,pol.context_id);
 return new;
end $$;
create trigger billing_hsp_fee after insert on public.billing_charges for each row execute function public.billing_hsp_add_fee();

alter function public.billing_execute(uuid,jsonb) rename to billingh_execute_previous;
create function public.billing_execute(p_request_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.billing_hsp_quotes; old public.billing_hsp_commands; org uuid; r jsonb; stripped jsonb;
begin
 if p_command->>'operation'='sale' and exists(select 1 from public.billing_hsp_policies where context_id=(p_command->>'context_id')::uuid) then
  select organization_id into org from public.billing_contexts where id=(p_command->>'context_id')::uuid;
  perform public.billing6_lock(org);
  if not public.billing6_staff((p_command->>'context_id')::uuid) then raise exception 'BILLING_FORBIDDEN'; end if;
  select * into old from public.billing_hsp_commands where actor_id=public.current_profile_id() and request_id=p_request_id;
  if found then
   if old.command<>p_command then raise exception 'BILLING_IDEMPOTENCY_CONFLICT'; end if;
   return old.response;
  end if;
  select * into q from public.billing_hsp_quotes where id=(p_command->>'quote_id')::uuid and actor_id=public.current_profile_id();
  stripped:=p_command-array['quote_id','operation'];
  if q.id is null or q.command<>stripped then raise exception 'BILLING_QUOTE_REQUIRED'; end if;
  if q.expires_at<clock_timestamp() or q.snapshot<>public.billing_hsp_quote_value(stripped) then raise exception 'BILLING_STALE_QUOTE'; end if;
  r:=public.billingh_execute_previous(p_request_id,p_command-'quote_id');
  insert into public.billing_hsp_commands values(public.current_profile_id(),p_request_id,p_command,r);
  return r;
 end if;
 return public.billingh_execute_previous(p_request_id,p_command);
end $$;
alter function public.billing_snapshot(uuid) rename to billingh_snapshot_previous;
create function public.billing_snapshot(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 select case when p.context_id is null then s else jsonb_set(s,'{charges}',(select coalesce(jsonb_agg(c||jsonb_build_object('supplier',case when c->>'id'=a.charge_id::text then 'hsp' else 'association' end) order by n),'[]') from jsonb_array_elements(s->'charges') with ordinality x(c,n)))||jsonb_build_object('suppliers',p.suppliers,'mandate',p.mandate) end
 from public.billing_folios f cross join lateral(select public.billingh_snapshot_previous(f.id) s) x left join public.billing_hsp_policies p on p.context_id=f.billing_context_id left join public.billing_hsp_assessments a on a.folio_id=f.id where f.id=p_folio;
$$;
alter function public.billing_ui_catalog(uuid) rename to billingh_catalog_previous;
create function public.billing_ui_catalog(p_context uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_set(c,'{products}',(select coalesce(jsonb_agg(p),'[]') from jsonb_array_elements(c->'products') p where not exists(select 1 from public.billing_hsp_policies h where h.context_id=p_context and h.product_id=(p->>'id')::uuid)))||jsonb_build_object('hsp_quote_required',exists(select 1 from public.billing_hsp_policies where context_id=p_context)) from (select public.billingh_catalog_previous(p_context) c) x;
$$;
do $$ declare t text; fn record; begin
 foreach t in array array['billing_hsp_policies','billing_hsp_assessments','billing_hsp_quotes','billing_hsp_commands'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger immutable before update or delete on public.%I for each row execute function public.billing_immutable()',t);
 end loop;
 for fn in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing_hsp_%' or proname like 'billingh_%' or proname in ('prepare_billing_operation_quote','billing_execute','billing_snapshot','billing_ui_catalog')) loop execute 'revoke all on function '||fn.signature||' from public,anon,authenticated,service_role'; end loop;
end $$;
grant execute on function public.billing_hsp_adopt(uuid,uuid,jsonb,text) to service_role;
grant execute on function public.prepare_billing_operation_quote(jsonb),public.billing_execute(uuid,jsonb),public.billing_ui_catalog(uuid) to authenticated;
commit;
