-- Tranche 1A: additive, opt-in contexts only. No historical backfill or remote activation.
-- Tax rates and numbering series must be explicitly configured; no fiscal presets are seeded.
begin;
alter table public.contacts add column company_name text;
alter table public.shows add constraint billing_show_org_key unique(organization_id,id);
alter table public.organization_products add constraint billing_product_org_key unique(organization_id,id);

create table public.billing_context_types (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 code text not null check(code ~ '^[a-z][a-z0-9_]*$'), version integer not null check(version>0),
 config jsonb not null check(jsonb_typeof(config)='object'), created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,code,version), unique(organization_id,id)
);
create table public.billing_contexts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 kind text not null check(kind in ('event','non_event')), show_id uuid references public.shows(id),
 context_type_id uuid, context_code text, currency text not null check(currency in ('CAD','USD')),
 config jsonb not null, opens_at timestamptz not null, closes_at timestamptz,
 created_at timestamptz not null default clock_timestamp(), created_by uuid not null references public.user_profiles(id),
 foreign key(organization_id,context_type_id) references public.billing_context_types(organization_id,id),
 foreign key(organization_id,show_id) references public.shows(organization_id,id),
 check((kind='event' and show_id is not null and context_type_id is null and context_code is null)
    or (kind='non_event' and show_id is null and context_type_id is not null and length(trim(context_code))>0)),
 check(closes_at is null or closes_at>opens_at), unique(organization_id,id,currency), unique(organization_id,id)
);
create unique index billing_context_event_key on public.billing_contexts(organization_id,show_id) where kind='event';
create unique index billing_context_activity_key on public.billing_contexts(organization_id,context_code) where kind='non_event';
create table public.billing_customer_accounts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 payer_contact_id uuid not null references public.contacts(id), created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,payer_contact_id), unique(organization_id,id)
);
create table public.billing_number_sequences (
 organization_id uuid not null references public.organizations(id), kind text not null check(kind in ('account','receipt','invoice')),
 value bigint not null check(value>0), primary key(organization_id,kind)
);
create table public.billing_folios (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, billing_context_id uuid not null,
 payer_customer_account_id uuid not null, currency text not null, public_number text not null,
 state text not null default 'open' check(state in ('open','closed')), version bigint not null default 0 check(version>=0),
 created_at timestamptz not null default clock_timestamp(), created_by uuid not null references public.user_profiles(id),
 closed_at timestamptz, closed_by uuid references public.user_profiles(id),
 foreign key(organization_id,billing_context_id,currency) references public.billing_contexts(organization_id,id,currency),
 foreign key(organization_id,payer_customer_account_id) references public.billing_customer_accounts(organization_id,id),
 unique(organization_id,billing_context_id,payer_customer_account_id), unique(organization_id,public_number),
 unique(organization_id,id,currency), unique(organization_id,id),
 check((state='open' and closed_at is null and closed_by is null) or (state='closed' and closed_at is not null and closed_by is not null))
);
create table public.billing_tax_rules (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, context_id uuid not null,
 code text not null check(length(trim(code))>0), name text not null check(length(trim(name))>0), jurisdiction text not null check(length(trim(jurisdiction))>0), rate numeric(9,6) not null check(rate between 0 and 100),
 rule_version text not null, valid_from date not null, valid_until date, check(valid_until is null or valid_until>=valid_from),
 foreign key(organization_id,context_id) references public.billing_contexts(organization_id,id),
 unique(context_id,code), unique(context_id,id)
);
create table public.billing_product_tax_profiles (
 context_id uuid not null references public.billing_contexts(id), product_id uuid not null references public.organization_products(id),
 exemption_reason text, unit_price numeric(12,2) not null check(unit_price>=0 and unit_price<10000000000), primary key(context_id,product_id)
);
create table public.billing_product_tax_rules (
 context_id uuid not null, product_id uuid not null, tax_rule_id uuid not null,
 primary key(context_id,product_id,tax_rule_id),
 foreign key(context_id,product_id) references public.billing_product_tax_profiles(context_id,product_id),
 foreign key(context_id,tax_rule_id) references public.billing_tax_rules(context_id,id)
);
create table public.billing_charges (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, folio_id uuid not null, currency text not null,
 source_type text not null check(source_type='secretary_sale'), source_id uuid not null,
 product_id uuid not null references public.organization_products(id), category text not null, description text not null,
 quantity numeric(12,3) not null check(quantity>0), unit_price numeric(12,2) not null check(unit_price>=0),
 subtotal numeric(14,2) not null check(subtotal>=0), tax_amount numeric(14,2) not null check(tax_amount>=0),
 total numeric(14,2) generated always as (subtotal+tax_amount) stored, exemption_reason text,
 beneficiary_contact_id uuid not null references public.contacts(id), horse_id uuid references public.horses(id),
 actor_id uuid not null references public.user_profiles(id), authorization_snapshot jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,folio_id,currency) references public.billing_folios(organization_id,id,currency),
 foreign key(organization_id,product_id) references public.organization_products(organization_id,id),
 unique(organization_id,source_type,source_id), unique(folio_id,id)
);
create table public.billing_charge_taxes (
 charge_id uuid not null references public.billing_charges(id), tax_rule_id uuid not null references public.billing_tax_rules(id),
 name text not null, code text not null, jurisdiction text not null, rate numeric(9,6) not null,
 base numeric(14,2) not null, amount numeric(14,2) not null, primary key(charge_id,tax_rule_id)
);
create table public.billing_folio_horses (
 folio_id uuid not null references public.billing_folios(id), horse_id uuid not null references public.horses(id),
 source_charge_id uuid not null, actor_id uuid not null references public.user_profiles(id), created_at timestamptz not null default clock_timestamp(),
 primary key(folio_id,horse_id), foreign key(folio_id,source_charge_id) references public.billing_charges(folio_id,id)
);
create table public.billing_payments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, folio_id uuid not null, currency text not null,
 amount numeric(14,2) not null check(amount>0), method text not null check(method in ('cash','etransfer')),
 reference text, received_at timestamptz not null, actor_id uuid not null references public.user_profiles(id),
 authorization_snapshot jsonb not null, created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,folio_id,currency) references public.billing_folios(organization_id,id,currency),
 check(method<>'etransfer' or length(trim(reference))>0), unique(folio_id,id)
);
-- Case is preserved: only surrounding whitespace is ignored in bank references.
create unique index billing_etransfer_reference_key on public.billing_payments(organization_id,btrim(reference)) where method='etransfer';
create table public.billing_payment_allocations (
 folio_id uuid not null, payment_id uuid not null, charge_id uuid not null, amount numeric(14,2) not null check(amount>0),
 primary key(payment_id,charge_id), foreign key(folio_id,payment_id) references public.billing_payments(folio_id,id),
 foreign key(folio_id,charge_id) references public.billing_charges(folio_id,id)
);
-- Unified immutable document storage; kind-specific views below are read-only API surfaces.
create table public.billing_documents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, folio_id uuid not null, currency text not null,
 kind text not null check(kind in ('statement','receipt','invoice')), number text, payment_id uuid,
 snapshot jsonb not null, actor_id uuid not null references public.user_profiles(id), created_at timestamptz not null default clock_timestamp(),
 foreign key(organization_id,folio_id,currency) references public.billing_folios(organization_id,id,currency),
 foreign key(folio_id,payment_id) references public.billing_payments(folio_id,id),
 check((kind='statement' and number is null and payment_id is null) or
       (kind='receipt' and number is not null and payment_id is not null) or
       (kind='invoice' and number is not null and payment_id is null)), unique(organization_id,kind,number)
);
create unique index billing_one_final_invoice on public.billing_documents(folio_id) where kind='invoice';
create unique index billing_one_receipt_per_payment on public.billing_documents(payment_id) where kind='receipt';
create table public.billing_operations (
 organization_id uuid not null references public.organizations(id), actor_id uuid not null references public.user_profiles(id),
 request_id uuid not null, request jsonb not null, response jsonb not null,
 created_at timestamptz not null default clock_timestamp(), primary key(organization_id,actor_id,request_id)
);
create table public.billing_audit_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 folio_id uuid references public.billing_folios(id), actor_id uuid not null references public.user_profiles(id),
 operation text not null, authorization_snapshot jsonb not null, payload jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table public.billing_outbox (
 document_id uuid primary key references public.billing_documents(id), created_at timestamptz not null default clock_timestamp(),
 state text not null default 'pending' check(state in ('pending','processing','completed','failed')),
 attempts integer not null default 0 check(attempts>=0), last_error text,
 next_attempt_at timestamptz default clock_timestamp(), claimed_at timestamptz, finished_at timestamptz,
 lease_until timestamptz, claim_token uuid, worker_id text, result_ref text,
 check((state='pending' and attempts=0 and next_attempt_at is not null and claimed_at is null and finished_at is null and claim_token is null and worker_id is null and lease_until is null and result_ref is null and last_error is null)
 or (state='processing' and attempts>0 and next_attempt_at is null and claimed_at is not null and finished_at is null and claim_token is not null and worker_id is not null and lease_until is not null and lease_until>claimed_at and result_ref is null)
 or (state='completed' and attempts>0 and next_attempt_at is null and claimed_at is not null and finished_at is not null and finished_at>=claimed_at and claim_token is not null and worker_id is not null and lease_until is null and result_ref is not null and length(btrim(result_ref))>0 and last_error is null)
 or (state='failed' and attempts>0 and next_attempt_at is not null and next_attempt_at>=finished_at and claimed_at is not null and finished_at is not null and finished_at>=claimed_at and claim_token is not null and worker_id is not null and lease_until is null and result_ref is null and last_error is not null and length(btrim(last_error))>0))
);

create function public.billing_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'BILLING_IMMUTABLE' using errcode='55000'; end $$;
create function public.billing_lock_scope(p_org uuid,p_show uuid) returns void language sql set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('billing-engine:'||p_org::text||':'||coalesce(p_show::text,'non-event'),0));
$$;
create function public.billing_assert_staff(p_org uuid,p_show uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v record; a uuid:=public.current_profile_id();
begin
 if a is null then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 select * into v from public.platform_admins where user_id=a for share;
 if found then return jsonb_build_object('kind','platform_admin','id',v.id,'actor',a,'checked_at',clock_timestamp()); end if;
 select * into v from public.organization_members where organization_id=p_org and user_id=a and role in ('admin','secretary') for share;
 if found then return jsonb_build_object('kind','organization_member','id',v.id,'role',v.role,'actor',a,'checked_at',clock_timestamp()); end if;
 select sr.* into v from public.show_roles sr join public.shows s on s.id=sr.show_id
 where sr.show_id=p_show and s.organization_id=p_org and sr.user_id=a and sr.role='secretary' for share of sr;
 if found then return jsonb_build_object('kind','show_secretary','id',v.id,'role','secretary','actor',a,'checked_at',clock_timestamp()); end if;
 raise exception 'BILLING_FORBIDDEN' using errcode='42501';
end $$;
create function public.billing_can_read(p_folio uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.billing_folios f join public.billing_customer_accounts a on a.id=f.payer_customer_account_id
 join public.contacts p on p.id=a.payer_contact_id join public.billing_contexts c on c.id=f.billing_context_id
 where f.id=p_folio and (public.is_platform_admin() or public.is_org_member(f.organization_id,array(select jsonb_array_elements_text(c.config->'staff_roles')))
 or (c.show_id is not null and c.config->'staff_roles' ? 'secretary' and public.has_show_role(c.show_id,array['secretary'])) or p.linked_user_id=public.current_profile_id()));
$$;
create function public.billing_number(p_org uuid,p_kind text,p_prefix text) returns text language plpgsql set search_path='' as $$
declare n bigint;
begin
 if p_prefix is null or p_prefix !~ '^[A-Z0-9][A-Z0-9-]{0,29}$' then raise exception 'BILLING_NUMBER_CONFIG_REQUIRED'; end if;
 insert into public.billing_number_sequences values(p_org,p_kind,1)
 on conflict(organization_id,kind) do update set value=public.billing_number_sequences.value+1 returning value into n;
 return p_prefix||'-'||lpad(n::text,greatest(6,length(n::text)),'0');
end $$;
create function public.billing_check_config(p jsonb) returns void language plpgsql set search_path='' as $$
begin
 if p is null or jsonb_typeof(p)<>'object' or coalesce(length(trim(p->>'name_fr')),0)=0 or coalesce(length(trim(p->>'name_en')),0)=0
 or coalesce(p->>'account_prefix','') !~ '^[A-Z0-9][A-Z0-9-]{0,29}$'
 or coalesce(p->>'receipt_prefix','') !~ '^[A-Z0-9][A-Z0-9-]{0,29}$'
 or coalesce(p->>'invoice_prefix','') !~ '^[A-Z0-9][A-Z0-9-]{0,29}$'
 or p->>'account_prefix'=p->>'receipt_prefix' or p->>'account_prefix'=p->>'invoice_prefix' or p->>'receipt_prefix'=p->>'invoice_prefix'
 or coalesce(p->>'closing_policy','')<>'manual' or coalesce(p->>'payment_policy','')<>'received_only'
 or coalesce(p->>'activation_policy','')<>'allocated_received'
 or jsonb_typeof(p->'categories') is distinct from 'array' or jsonb_array_length(p->'categories')=0
 or jsonb_typeof(p->'staff_roles') is distinct from 'array' or jsonb_array_length(p->'staff_roles')=0
 then raise exception 'BILLING_INVALID_CONFIG'; end if;
 if exists(select 1 from jsonb_object_keys(p) k where k not in ('name_fr','name_en','account_prefix','receipt_prefix','invoice_prefix','closing_policy','payment_policy','activation_policy','categories','staff_roles','period','opens_at','closes_at','timezone')) then raise exception 'BILLING_UNSUPPORTED_CONFIG'; end if;
 if exists(select 1 from jsonb_array_elements_text(p->'staff_roles') x where x not in ('admin','secretary')) then raise exception 'BILLING_INVALID_ROLES'; end if;
end $$;
create function public.billing_create_context_type(p_org uuid,p_code text,p_version integer,p_config jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a jsonb; i uuid;
begin
 a:=public.billing_assert_staff(p_org);
 if a->>'kind'<>'platform_admin' and a->>'role'<>'admin' then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 perform public.billing_check_config(p_config);
 insert into public.billing_context_types(organization_id,code,version,config) values(p_org,p_code,p_version,p_config) returning id into i;
 insert into public.billing_audit_events(organization_id,actor_id,operation,authorization_snapshot,payload)
 values(p_org,public.current_profile_id(),'context_type',a,jsonb_build_object('id',i));
 return i;
end $$;

-- Guard all legacy monetary writers. For non-event scopes the old model has no context key:
-- fail closed for the organization's entire NULL-show scope until those writers are adapted.
create function public.billing_legacy_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; o uuid; s uuid;
begin
 for r in select x from jsonb_array_elements(case when tg_op='INSERT' then jsonb_build_array(to_jsonb(new))
 when tg_op='DELETE' then jsonb_build_array(to_jsonb(old)) else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end) x
 order by x->>'organization_id',x->>'show_id' loop
  o:=(r->>'organization_id')::uuid; s:=(r->>'show_id')::uuid;
  perform public.billing_lock_scope(o,s);
  if exists(select 1 from public.billing_contexts c where c.organization_id=o and c.show_id is not distinct from s) then
   raise exception 'BILLING_LEGACY_CONTEXT_ADOPTED' using errcode='55000';
  end if;
 end loop;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create function public.billing_create_context(p_org uuid,p_show uuid,p_type uuid,p_code text,p_currency text,p_config jsonb,
 p_opens timestamptz,p_closes timestamptz,p_products jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a jsonb; i uuid; cfg jsonb; pr jsonb; tr jsonb; t uuid; prod public.organization_products; typecfg jsonb; legacy_count bigint; tab text;
begin
 a:=public.billing_assert_staff(p_org);
 if a->>'kind'<>'platform_admin' and a->>'role'<>'admin' then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 perform public.billing_lock_scope(p_org,p_show);
 cfg:=p_config;
 if p_show is null then
  select config into typecfg from public.billing_context_types where id=p_type and organization_id=p_org;
  if not found then raise exception 'BILLING_CONTEXT_TYPE_REQUIRED'; end if;
  -- Names, period and series may be specialized; permissions/categories/payment policy come from the immutable type version.
  cfg:=typecfg||coalesce(p_config,'{}')||jsonb_build_object('categories',typecfg->'categories','staff_roles',typecfg->'staff_roles',
   'closing_policy',typecfg->'closing_policy','payment_policy',typecfg->'payment_policy','activation_policy',typecfg->'activation_policy');
 else
  if not exists(select 1 from public.shows where id=p_show and organization_id=p_org and default_currency=p_currency) then raise exception 'BILLING_SHOW_CURRENCY_MISMATCH'; end if;
 end if;
 cfg:=cfg||jsonb_build_object('timezone',coalesce(cfg->>'timezone',(select timezone from public.shows where id=p_show),(select timezone from public.organizations where id=p_org),'UTC'));
 if not exists(select 1 from pg_timezone_names where name=cfg->>'timezone') then raise exception 'BILLING_INVALID_TIMEZONE'; end if;
 perform public.billing_check_config(cfg);
 foreach tab in array array['invoices','manual_sales','entries','stall_bookings','contact_organization_memberships'] loop
  execute format('select count(*) from public.%I where organization_id=$1 and show_id is not distinct from $2',tab) into legacy_count using p_org,p_show;
  if legacy_count>0 then raise exception 'BILLING_LEGACY_RECONCILIATION_REQUIRED'; end if;
 end loop;
 if jsonb_typeof(p_products) is distinct from 'array' then raise exception 'BILLING_PRODUCTS_REQUIRED'; end if;
 insert into public.billing_contexts(organization_id,kind,show_id,context_type_id,context_code,currency,config,opens_at,closes_at,created_by)
 values(p_org,case when p_show is null then 'non_event' else 'event' end,p_show,p_type,p_code,p_currency,cfg,coalesce(p_opens,(cfg->>'opens_at')::timestamptz),coalesce(p_closes,(cfg->>'closes_at')::timestamptz),public.current_profile_id()) returning id into i;
 for pr in select * from jsonb_array_elements(p_products) loop
  if exists(select 1 from jsonb_object_keys(pr) k where k not in ('product_id','unit_price','taxes','exemption_reason')) then raise exception 'BILLING_UNSUPPORTED_PRODUCT_CONFIG'; end if;
  select * into prod from public.organization_products where id=(pr->>'product_id')::uuid and organization_id=p_org and is_active for share;
  if not found or not (cfg->'categories' ? prod.category) then raise exception 'BILLING_INVALID_PRODUCT'; end if;
  if jsonb_typeof(pr->'taxes') is distinct from 'array' then raise exception 'BILLING_TAX_CONFIG_REQUIRED'; end if;
  if (jsonb_array_length(pr->'taxes')>0 and nullif(btrim(pr->>'exemption_reason'),'') is not null) or
    (jsonb_array_length(pr->'taxes')=0 and nullif(btrim(pr->>'exemption_reason'),'') is null) then raise exception 'BILLING_TAX_CONFIG_REQUIRED'; end if;
  if p_currency is distinct from (select currency from public.organizations where id=p_org) and not(pr ? 'unit_price') then raise exception 'BILLING_PRODUCT_PRICE_REQUIRED'; end if;
  if pr ? 'unit_price' and ((pr->>'unit_price') is null or (pr->>'unit_price')::numeric<>round((pr->>'unit_price')::numeric,2)) then raise exception 'BILLING_INVALID_AMOUNT'; end if;
  insert into public.billing_product_tax_profiles values(i,prod.id,nullif(btrim(pr->>'exemption_reason'),''),coalesce((pr->>'unit_price')::numeric,prod.default_price));
  for tr in select * from jsonb_array_elements(pr->'taxes') loop
   if exists(select 1 from jsonb_object_keys(tr) k where k not in ('code','name','jurisdiction','rate','version','valid_from','valid_until')) then raise exception 'BILLING_UNSUPPORTED_TAX_CONFIG'; end if;
   if (tr->>'rate')::numeric is null or (tr->>'rate')::numeric<>round((tr->>'rate')::numeric,6) then raise exception 'BILLING_INVALID_TAX_RATE'; end if;
   select id into t from public.billing_tax_rules where context_id=i and code=tr->>'code';
   if found then
    if not exists(select 1 from public.billing_tax_rules where id=t and name=tr->>'name' and jurisdiction=tr->>'jurisdiction' and rate=(tr->>'rate')::numeric
     and rule_version=coalesce(tr->>'version','context-1')
     and valid_from=coalesce((tr->>'valid_from')::date,p_opens::date,(cfg->>'opens_at')::timestamptz::date)
     and valid_until is not distinct from (tr->>'valid_until')::date) then raise exception 'BILLING_TAX_CODE_CONFLICT'; end if;
   else
    insert into public.billing_tax_rules(organization_id,context_id,code,name,jurisdiction,rate,rule_version,valid_from,valid_until)
    values(p_org,i,tr->>'code',tr->>'name',tr->>'jurisdiction',(tr->>'rate')::numeric,coalesce(tr->>'version','context-1'),coalesce((tr->>'valid_from')::date,p_opens::date,(cfg->>'opens_at')::timestamptz::date),(tr->>'valid_until')::date) returning id into t;
   end if;
   insert into public.billing_product_tax_rules values(i,prod.id,t);
  end loop;
 end loop;
 insert into public.billing_audit_events(organization_id,actor_id,operation,authorization_snapshot,payload)
 values(p_org,public.current_profile_id(),'context',a,jsonb_build_object('id',i,'config',cfg));
 return i;
end $$;

create function public.billing_snapshot(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('folio_id',f.id,'account_number',f.public_number,'state',f.state,'currency',f.currency,
 'context',jsonb_build_object('id',c.id,'kind',c.kind,'show_id',c.show_id,'name_fr',c.config->>'name_fr','name_en',c.config->>'name_en','period',c.config->'period'),
 'payer',jsonb_build_object('customer_account_id',a.id,'contact_id',p.id,'first_name',p.first_name,'middle_name',p.middle_name,'last_name',p.last_name,
  'company_name',p.company_name,'address',p.address,'address_line2',p.address_line2,'city',p.city,'state',p.state,'zip_code',p.zip_code,'country',p.country,
  'email',p.email,'phone',p.phone,'tax_identifiers',null),
 'seller',jsonb_build_object('organization_id',o.id,'name',o.name,'billing_name',o.billing_name,'address',o.address,
  'address_line2',o.address_line2,'city',o.city,'state',o.state,'zip_code',o.zip_code,'country',o.country,
  'email',o.billing_email,'phone',o.billing_phone,'tax_name_1',o.tax_name,'tax_number_1',o.tax_number,
  'tax_name_2',o.secondary_tax_name,'tax_number_2',o.secondary_tax_number),
 'charges',coalesce((select jsonb_agg(jsonb_build_object('id',ch.id,'description',ch.description,'category',ch.category,'quantity',ch.quantity,'unit_price',ch.unit_price,'subtotal',ch.subtotal,'tax_amount',ch.tax_amount,'total',ch.total,'currency',ch.currency,'beneficiary_contact_id',ch.beneficiary_contact_id,'horse_id',ch.horse_id,'exemption_reason',ch.exemption_reason,'created_at',ch.created_at,'taxes',coalesce((select jsonb_agg(jsonb_build_object('name',t.name,'code',t.code,'jurisdiction',t.jurisdiction,'rate',t.rate,'base',t.base,'amount',t.amount) order by t.code) from public.billing_charge_taxes t where t.charge_id=ch.id),'[]')) order by ch.created_at,ch.id)
 from public.billing_charges ch where ch.folio_id=f.id),'[]'),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',pmt.id,'amount',pmt.amount,'currency',pmt.currency,'method',pmt.method,'reference',pmt.reference,'received_at',pmt.received_at,'allocations',coalesce((select jsonb_agg(jsonb_build_object('charge_id',al.charge_id,'amount',al.amount) order by al.charge_id) from public.billing_payment_allocations al where al.payment_id=pmt.id),'[]')) order by pmt.created_at,pmt.id) from public.billing_payments pmt where pmt.folio_id=f.id),'[]'),
 'subtotal',coalesce((select sum(ch.subtotal) from public.billing_charges ch where ch.folio_id=f.id),0),
 'tax_amount',coalesce((select sum(ch.tax_amount) from public.billing_charges ch where ch.folio_id=f.id),0),
 'total',coalesce((select sum(ch.total) from public.billing_charges ch where ch.folio_id=f.id),0),
 'received',coalesce((select sum(pm.amount) from public.billing_payments pm where pm.folio_id=f.id),0),
 'balance',coalesce((select sum(ch.total) from public.billing_charges ch where ch.folio_id=f.id),0)-coalesce((select sum(pm.amount) from public.billing_payments pm where pm.folio_id=f.id),0))
 from public.billing_folios f join public.billing_contexts c on c.id=f.billing_context_id
 join public.billing_customer_accounts a on a.id=f.payer_customer_account_id join public.contacts p on p.id=a.payer_contact_id
 join public.organizations o on o.id=f.organization_id where f.id=p_folio;
$$;

-- Explicit public document projection: actor/permission/audit fields stay in protected storage.
create function public.billing_document_payload(p_id uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',d.id,'organization_id',d.organization_id,'folio_id',d.folio_id,'currency',d.currency,
 'kind',d.kind,'number',d.number,'payment_id',d.payment_id,'snapshot',d.snapshot,'created_at',d.created_at)
 from public.billing_documents d where d.id=p_id;
$$;

-- One transaction boundary for the 1A commands. Public wrappers give each operation a typed name.
create function public.billing_execute(p_request_id uuid,p_command jsonb) returns jsonb
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
    or p_command->>'confirmed' is distinct from 'true' or coalesce(p_command->>'method','') not in ('cash','etransfer')
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

create function public.billing_get_customer_account(p_org uuid,p_contact uuid,p_context uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare a jsonb; i uuid; c public.billing_contexts;
begin
 if p_context is not null then
  select * into c from public.billing_contexts where id=p_context and organization_id=p_org;
  if not found then raise exception 'BILLING_INVALID_CONTEXT'; end if;
 end if;
 a:=public.billing_assert_staff(p_org,c.show_id);
 if p_context is not null and a->>'kind'<>'platform_admin' and not(c.config->'staff_roles' ? (a->>'role')) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 if not public.contact_is_linked_to_org(p_contact,p_org) then raise exception 'BILLING_INVALID_PAYER'; end if;
 perform pg_advisory_xact_lock(hashtextextended('billing-customer:'||p_org||':'||p_contact,0));
 select id into i from public.billing_customer_accounts where organization_id=p_org and payer_contact_id=p_contact;
 if not found then
  insert into public.billing_customer_accounts(organization_id,payer_contact_id) values(p_org,p_contact) returning id into i;
  insert into public.billing_audit_events(organization_id,actor_id,operation,authorization_snapshot,payload) values(p_org,public.current_profile_id(),'customer_account',a,jsonb_build_object('id',i));
 end if;
 return i;
end $$;
create function public.add_billing_sale(p_request_id uuid,p_sale jsonb) returns jsonb language sql security definer set search_path='' as $$
 select public.billing_execute(p_request_id,p_sale||jsonb_build_object('operation','sale'));
$$;
create function public.record_billing_payment(p_request_id uuid,p_payment jsonb) returns jsonb language sql security definer set search_path='' as $$
 select public.billing_execute(p_request_id,p_payment||jsonb_build_object('operation','payment'));
$$;
create function public.finalize_billing_folio(p_request_id uuid,p_folio uuid,p_version bigint,p_statement_id uuid default null) returns jsonb language sql security definer set search_path='' as $$
 select public.billing_execute(p_request_id,jsonb_build_object('operation','finalize','folio_id',p_folio,'version',p_version,'statement_id',p_statement_id));
$$;
create function public.get_billing_statement(p_request_id uuid,p_folio uuid) returns jsonb language sql security definer set search_path='' as $$
 select public.billing_execute(p_request_id,jsonb_build_object('operation','statement','folio_id',p_folio));
$$;
create function public.find_billing_account(p_org uuid,p_number text) returns jsonb language sql stable security definer set search_path='' as $$
 select public.billing_snapshot(f.id) from public.billing_folios f where f.organization_id=p_org and f.public_number=p_number and public.billing_can_read(f.id);
$$;
create function public.get_billing_document(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select public.billing_document_payload(d.id) from public.billing_documents d where d.id=p_id and public.billing_can_read(d.folio_id);
$$;

create function public.billing_guard_folio() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or (to_jsonb(new)-array['version','state','closed_at','closed_by'])<>(to_jsonb(old)-array['version','state','closed_at','closed_by'])
  or new.version<old.version or (old.state='closed' and (new.state<>old.state or new.closed_at<>old.closed_at or new.closed_by<>old.closed_by)) then
  raise exception 'BILLING_IMMUTABLE'; end if;
 return new;
end $$;
create trigger billing_folio_guard before update or delete on public.billing_folios for each row execute function public.billing_guard_folio();
-- Changing the show's configured currency after adoption cannot create disagreement with its context.
create function public.billing_guard_show_currency() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.default_currency is distinct from old.default_currency then
  perform public.billing_lock_scope(old.organization_id,old.id);
  if exists(select 1 from public.billing_contexts where show_id=old.id) then raise exception 'BILLING_CONTEXT_CURRENCY_FROZEN'; end if;
 end if; return new;
end $$;
create trigger billing_show_currency_guard before update on public.shows for each row execute function public.billing_guard_show_currency();

-- Internal evidence is accessible through a separate staff-authorized RPC, never through documents.
create function public.billing_get_audit(p_folio uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.billing_contexts; a jsonb;
begin
 select ctx.* into c from public.billing_folios f join public.billing_contexts ctx on ctx.id=f.billing_context_id where f.id=p_folio;
 if not found then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 a:=public.billing_assert_staff(c.organization_id,c.show_id);
 if a->>'kind'<>'platform_admin' and not(c.config->'staff_roles' ? (a->>'role')) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 return jsonb_build_object('events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.billing_audit_events e where e.folio_id=p_folio),'[]'),
 'charges',coalesce((select jsonb_agg(to_jsonb(ch) order by ch.created_at,ch.id) from public.billing_charges ch where ch.folio_id=p_folio),'[]'),
 'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at,p.id) from public.billing_payments p where p.folio_id=p_folio),'[]'));
end $$;

create table public.billing_outbox_events (
 id bigint generated always as identity primary key, document_id uuid not null references public.billing_documents(id),
 from_state text, to_state text not null, attempt integer not null, worker_id text, claim_token uuid,
 error text, result_ref text, database_actor text not null, created_at timestamptz not null default clock_timestamp()
);
create index billing_outbox_ready on public.billing_outbox(state,next_attempt_at,lease_until);
create function public.billing_outbox_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'BILLING_OUTBOX_INVALID_TRANSITION'; end if;
 if tg_op='INSERT' then
  if new.state<>'pending' then raise exception 'BILLING_OUTBOX_INVALID_TRANSITION'; end if;
  return new;
 end if;
 if new.document_id<>old.document_id or new.created_at<>old.created_at then raise exception 'BILLING_OUTBOX_IMMUTABLE_IDENTITY'; end if;
 if new.state='processing' and (
  (old.state in ('pending','failed') and old.next_attempt_at<=clock_timestamp()) or
  (old.state='processing' and old.lease_until<=clock_timestamp())) then
  if new.attempts<>old.attempts+1 or new.claim_token is not distinct from old.claim_token or new.claimed_at<old.created_at
   or new.last_error is distinct from old.last_error then raise exception 'BILLING_OUTBOX_INVALID_CLAIM'; end if;
 elsif old.state='processing' and old.lease_until>clock_timestamp() and new.state in ('completed','failed') then
  if new.attempts<>old.attempts or new.claim_token<>old.claim_token or new.worker_id<>old.worker_id or new.claimed_at<>old.claimed_at
   then raise exception 'BILLING_OUTBOX_INVALID_FINISH'; end if;
 else raise exception 'BILLING_OUTBOX_INVALID_TRANSITION';
 end if;
 return new;
end $$;
create function public.billing_outbox_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.billing_outbox_events(document_id,from_state,to_state,attempt,worker_id,claim_token,error,result_ref,database_actor)
 values(new.document_id,case when tg_op='INSERT' then null else old.state end,new.state,new.attempts,new.worker_id,new.claim_token,new.last_error,new.result_ref,session_user);
 return new;
end $$;
create trigger billing_outbox_guard before insert or update or delete on public.billing_outbox for each row execute function public.billing_outbox_guard();
create trigger billing_outbox_audit after insert or update on public.billing_outbox for each row execute function public.billing_outbox_audit();

-- Service-role capability only. No worker is installed or scheduled by this migration.
create function public.billing_claim_document(p_worker text,p_document uuid default null,p_lease_seconds integer default 300) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.billing_outbox; at_time timestamptz:=clock_timestamp();
begin
 if coalesce(length(btrim(p_worker)),0)=0 or length(p_worker)>200 or p_lease_seconds is null or p_lease_seconds not between 1 and 3600 then raise exception 'BILLING_OUTBOX_INVALID_CLAIM'; end if;
 select * into j from public.billing_outbox where (p_document is null or document_id=p_document)
 and ((state in ('pending','failed') and next_attempt_at<=at_time) or (state='processing' and lease_until<=at_time))
 order by created_at,document_id for update skip locked limit 1;
 if not found then return null; end if;
 update public.billing_outbox set state='processing',attempts=attempts+1,worker_id=btrim(p_worker),claim_token=gen_random_uuid(),claimed_at=at_time,
 lease_until=at_time+make_interval(secs=>p_lease_seconds),finished_at=null,next_attempt_at=null,result_ref=null where document_id=j.document_id returning * into j;
 return to_jsonb(j);
end $$;
create function public.billing_finish_document(p_document uuid,p_token uuid,p_success boolean,p_result_ref text default null,p_error text default null,p_retry_seconds integer default 60) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.billing_outbox; at_time timestamptz:=clock_timestamp();
begin
 if p_success is null or p_token is null or p_retry_seconds is null or p_retry_seconds not between 0 and 86400
 or (p_success and (coalesce(length(btrim(p_result_ref)),0)=0 or p_error is not null))
 or (not p_success and (coalesce(length(btrim(p_error)),0)=0 or p_result_ref is not null)) then raise exception 'BILLING_OUTBOX_INVALID_FINISH'; end if;
 select * into j from public.billing_outbox where document_id=p_document for update;
 if not found or j.claim_token is distinct from p_token then raise exception 'BILLING_OUTBOX_STALE_CLAIM'; end if;
 if (j.state='completed' and p_success and j.result_ref=p_result_ref) or (j.state='failed' and not p_success and j.last_error=p_error) then return to_jsonb(j); end if;
 if j.state<>'processing' or j.lease_until<=at_time then raise exception 'BILLING_OUTBOX_STALE_CLAIM'; end if;
 update public.billing_outbox set state=case when p_success then 'completed' else 'failed' end,finished_at=at_time,lease_until=null,
 next_attempt_at=case when p_success then null else at_time+make_interval(secs=>p_retry_seconds) end,
 result_ref=p_result_ref,last_error=p_error where document_id=p_document returning * into j;
 return to_jsonb(j);
end $$;

do $$
declare t text; f record;
begin
 foreach t in array array['invoices','manual_sales','entries','stall_bookings','contact_organization_memberships'] loop
  execute format('create trigger a_billing_engine_guard before insert or update or delete on public.%I for each row execute function public.billing_legacy_guard()',t);
 end loop;
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'billing\_%' escape '\' loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated, service_role',t);
  if t not in ('billing_folios','billing_number_sequences','billing_outbox') then
   execute format('create trigger billing_immutable before update or delete on public.%I for each row execute function public.billing_immutable()',t);
  end if;
 end loop;
 -- Default PostgreSQL function EXECUTE is PUBLIC, so explicitly remove it for every helper and RPC.
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and (p.proname like 'billing\_%' escape '\' or p.proname in ('add_billing_sale','record_billing_payment','finalize_billing_folio','get_billing_statement','find_billing_account','get_billing_document')) loop
  execute format('revoke all on function %s from public, anon, authenticated, service_role',f.sig);
 end loop;
end $$;
-- Reads return only a payer's own account or authorized staff scope; no agent-wide financial access.
create policy billing_folio_read on public.billing_folios for select to authenticated using(public.billing_can_read(id));
create policy billing_document_read on public.billing_documents for select to authenticated using(public.billing_can_read(folio_id));
grant select(id,organization_id,billing_context_id,payer_customer_account_id,currency,public_number,state,created_at,closed_at) on public.billing_folios to authenticated;
grant select(id,organization_id,folio_id,currency,kind,number,payment_id,snapshot,created_at) on public.billing_documents to authenticated;
grant execute on function public.billing_can_read(uuid),public.billing_get_audit(uuid) to authenticated;
grant execute on function public.billing_claim_document(text,uuid,integer),public.billing_finish_document(uuid,uuid,boolean,text,text,integer) to service_role;
grant execute on function public.billing_create_context_type(uuid,text,integer,jsonb),
 public.billing_create_context(uuid,uuid,uuid,text,text,jsonb,timestamptz,timestamptz,jsonb),public.billing_get_customer_account(uuid,uuid,uuid),
 public.add_billing_sale(uuid,jsonb),public.record_billing_payment(uuid,jsonb),public.finalize_billing_folio(uuid,uuid,bigint,uuid),
 public.get_billing_statement(uuid,uuid),public.find_billing_account(uuid,text),public.get_billing_document(uuid) to authenticated;
create view public.billing_receipts with(security_invoker=true) as select id,organization_id,folio_id,currency,kind,number,payment_id,snapshot,created_at from public.billing_documents where kind='receipt';
create view public.billing_statements with(security_invoker=true) as select id,organization_id,folio_id,currency,kind,number,payment_id,snapshot,created_at from public.billing_documents where kind='statement';
create view public.billing_final_invoices with(security_invoker=true) as select id,organization_id,folio_id,currency,kind,number,payment_id,snapshot,created_at from public.billing_documents where kind='invoice';
revoke all on public.billing_receipts,public.billing_statements,public.billing_final_invoices from public,anon,authenticated,service_role;
grant select on public.billing_receipts,public.billing_statements,public.billing_final_invoices to authenticated;
commit;
