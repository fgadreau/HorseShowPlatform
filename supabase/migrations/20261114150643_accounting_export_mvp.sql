-- Accounting export MVP: organization mappings, balanced previews and immutable export history.
-- HSP supplier charges remain outside the association journals by design.
begin;

create schema if not exists private;
revoke all on schema private from public,anon,authenticated,service_role;

create table public.billing_accounting_profiles (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 software text not null check(software in ('quickbooks_online','xero','sage_50_ca')),
 accounts jsonb not null default '{}'::jsonb check(jsonb_typeof(accounts)='object'),
 options jsonb not null default '{}'::jsonb check(jsonb_typeof(options)='object'),
 updated_by uuid not null references public.user_profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(organization_id,software)
);
create index billing_accounting_profiles_updated_by on public.billing_accounting_profiles(updated_by);

create table public.billing_accounting_exports (
 id uuid primary key,
 organization_id uuid not null references public.organizations(id) on delete cascade,
 context_id uuid not null references public.billing_contexts(id),
 software text not null check(software in ('quickbooks_online','xero','sage_50_ca')),
 export_kind text not null check(export_kind in ('show_close','receipts')),
 period_start date not null,
 period_end date not null,
 posting_date date not null,
 journal_number text not null,
 profile_snapshot jsonb not null check(jsonb_typeof(profile_snapshot)='object'),
 payload_hash text not null check(length(payload_hash)=64),
 payload jsonb not null check(jsonb_typeof(payload)='object'),
 actor_id uuid not null references public.user_profiles(id),
 created_at timestamptz not null default clock_timestamp(),
 check(period_end>=period_start),
 unique(organization_id,software,export_kind,payload_hash)
);
create index billing_accounting_exports_history on public.billing_accounting_exports(organization_id,context_id,created_at desc);
create index billing_accounting_exports_context on public.billing_accounting_exports(context_id);
create index billing_accounting_exports_actor on public.billing_accounting_exports(actor_id);
create index billing_payments_accounting_period on public.billing_payments(organization_id,received_at,id);

alter table public.billing_accounting_profiles enable row level security;
alter table public.billing_accounting_exports enable row level security;
revoke all on public.billing_accounting_profiles,public.billing_accounting_exports from public,anon,authenticated,service_role;

create trigger billing_accounting_profiles_touch before update on public.billing_accounting_profiles
for each row execute function public.touch_updated_at();

create function private.billing_accounting_payload(
 p_context uuid,p_software text,p_kind text,p_from date,p_to date,p_posting_date date
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 c public.billing_contexts; s public.shows; o public.organizations; profile public.billing_accounting_profiles;
 accounts jsonb:='{}'; options jsonb:='{}'; lines jsonb:='[]'; journals jsonb:='[]'; reconciliation jsonb:='[]'; warnings jsonb:='[]';
 required_accounts jsonb; missing_accounts jsonb; row record; tax_total numeric:=0; detailed_tax numeric:=0; association_total numeric:=0;
 debit_total numeric:=0; credit_total numeric:=0; source_count integer:=0; unknown_fees integer:=0;
 key text; label_fr text; label_en text; amount numeric; journal_date date; journal_number text; prefix text; tz text;
 add_debit numeric; add_credit numeric;
begin
 select * into c from public.billing_contexts where id=p_context;
 if c.id is null then raise exception 'ACCOUNTING_CONTEXT_NOT_FOUND';end if;
 select * into s from public.shows where id=c.show_id;
 select * into o from public.organizations where id=c.organization_id;
 select * into profile from public.billing_accounting_profiles where organization_id=c.organization_id and software=p_software;
 accounts:=coalesce(profile.accounts,'{}');options:=coalesce(profile.options,'{}');
 tz:=coalesce(nullif(c.config->>'timezone',''),nullif(s.timezone,''),nullif(o.timezone,''),'America/Toronto');
 journal_date:=coalesce(p_posting_date,current_date);
 prefix:=left(coalesce(nullif(btrim(options->>'journal_prefix'),''),case when p_kind='show_close' then 'HSP-CLOSE' else 'HSP-RCPT' end),24);

 if p_kind='show_close' then
  journal_number:=left(prefix||'-'||to_char(journal_date,'YYYYMMDD'),40);
  with folios as materialized (
    select id from public.billing_folios where organization_id=c.organization_id and billing_context_id=c.id
  ), charges as materialized (
    select ch.*,
      case when coalesce(e.fee_kind,p.presentation->>'fee_kind')='back_number' then 'back_number'
       when coalesce(e.fee_kind,p.presentation->>'fee_kind') like 'judge%' then 'judge_fee'
       when coalesce(e.presentation,p.presentation)->>'section'='entry' then 'entry'
       when p.presentation->>'section'='reservation' then 'reservation'
       when exists(select 1 from public.contact_organization_memberships m where m.billing_charge_id=ch.id) then 'membership'
       else ch.category end reporting_category
    from public.billing_charges ch join folios f on f.id=ch.folio_id
    left join public.billing_charge_entry_identity e on e.charge_id=ch.id
    left join public.billing_charge_presentation p on p.charge_id=ch.id
    where ch.supplier='association'
  )
  select coalesce(sum(total),0),coalesce(sum(tax_amount),0),count(*) into association_total,tax_total,source_count from charges;

  if association_total<>0 then
   add_debit:=greatest(association_total,0);add_credit:=greatest(-association_total,0);
   lines:=lines||jsonb_build_array(jsonb_build_object('account_key','accounts_receivable','account',coalesce(accounts->>'accounts_receivable',''),
     'label_fr','Comptes clients','label_en','Accounts receivable','description',coalesce(s.name,c.config->>'name_fr','HSP')||' — comptes clients',
     'debit',add_debit,'credit',add_credit));
  end if;

  for row in
   with folios as materialized (select id from public.billing_folios where organization_id=c.organization_id and billing_context_id=c.id),
   charges as (
    select ch.subtotal,case when coalesce(e.fee_kind,p.presentation->>'fee_kind')='back_number' then 'back_number'
      when coalesce(e.fee_kind,p.presentation->>'fee_kind') like 'judge%' then 'judge_fee'
      when coalesce(e.presentation,p.presentation)->>'section'='entry' then 'entry'
      when p.presentation->>'section'='reservation' then 'reservation'
      when exists(select 1 from public.contact_organization_memberships m where m.billing_charge_id=ch.id) then 'membership'
      else ch.category end category
    from public.billing_charges ch join folios f on f.id=ch.folio_id
    left join public.billing_charge_entry_identity e on e.charge_id=ch.id
    left join public.billing_charge_presentation p on p.charge_id=ch.id where ch.supplier='association')
   select category,sum(subtotal) amount from charges group by category having sum(subtotal)<>0 order by category
  loop
   key:='revenue:'||lower(regexp_replace(coalesce(row.category,'other'),'[^a-zA-Z0-9_]+','_','g'));
   add_debit:=greatest(-row.amount,0);add_credit:=greatest(row.amount,0);
   lines:=lines||jsonb_build_array(jsonb_build_object('account_key',key,'account',coalesce(accounts->>key,''),
     'label_fr','Revenu — '||coalesce(row.category,'other'),'label_en','Revenue — '||coalesce(row.category,'other'),
     'description',coalesce(s.name,c.config->>'name_fr','HSP')||' — '||coalesce(row.category,'other'),'debit',add_debit,'credit',add_credit));
  end loop;

  for row in
   with folios as materialized (select id from public.billing_folios where organization_id=c.organization_id and billing_context_id=c.id),
   charges as materialized (select ch.id from public.billing_charges ch join folios f on f.id=ch.folio_id where ch.supplier='association')
   select coalesce(nullif(btrim(t.code),''),'tax') code,coalesce(nullif(btrim(t.name),''),t.code,'Tax') name,sum(t.amount) amount
   from public.billing_charge_taxes t join charges ch on ch.id=t.charge_id group by 1,2 having sum(t.amount)<>0 order by 1,2
  loop
   detailed_tax:=detailed_tax+row.amount;
   key:='tax:'||lower(regexp_replace(row.code,'[^a-zA-Z0-9_]+','_','g'));
   add_debit:=greatest(-row.amount,0);add_credit:=greatest(row.amount,0);
   lines:=lines||jsonb_build_array(jsonb_build_object('account_key',key,'account',coalesce(accounts->>key,''),
     'label_fr','Taxe à remettre — '||row.name,'label_en','Tax payable — '||row.name,
     'description',coalesce(s.name,c.config->>'name_fr','HSP')||' — '||row.name,'debit',add_debit,'credit',add_credit));
  end loop;
  if round(tax_total-detailed_tax,2)<>0 then
   amount:=round(tax_total-detailed_tax,2);key:='tax:unassigned';
   lines:=lines||jsonb_build_array(jsonb_build_object('account_key',key,'account',coalesce(accounts->>key,''),
    'label_fr','Taxes à répartir','label_en','Unassigned tax','description',coalesce(s.name,c.config->>'name_fr','HSP')||' — taxes à répartir',
    'debit',greatest(-amount,0),'credit',greatest(amount,0)));
   warnings:=warnings||jsonb_build_array(jsonb_build_object('code','tax_detail_missing','amount',amount));
  end if;
  select coalesce(sum((x->>'debit')::numeric),0),coalesce(sum((x->>'credit')::numeric),0) into debit_total,credit_total from jsonb_array_elements(lines) x;
  journals:=jsonb_build_array(jsonb_build_object('number',journal_number,'date',journal_date,'narration',coalesce(s.name,c.config->>'name_fr','HSP')||' — fermeture du concours',
    'currency',c.currency,'tracking_name',coalesce(options->>'tracking_name','Concours'),'tracking_option',coalesce(nullif(options->>'tracking_option',''),s.name,c.config->>'name_fr'),
    'lines',lines,'debits',debit_total,'credits',credit_total,'balanced',round(debit_total-credit_total,2)=0));
 else
  for row in
   with payments as materialized (
    select p.id,p.received_at,p.method,p.reference,p.amount payment_amount,p.processing_fee_amount,p.folio_id,
      f.public_number,f.billing_context_id origin_context_id,oc.currency,
      coalesce(os.name,oc.config->>'name_fr',oc.config->>'name_en','HSP') origin_name,
      coalesce(nullif(pc.company_name,''),concat_ws(' ',pc.first_name,pc.last_name),f.public_number) payer,
      coalesce(sum(a.amount) filter(where ch.supplier='association'),0) association_amount
    from public.billing_payments p
    join public.billing_folios f on f.id=p.folio_id
    join public.billing_contexts oc on oc.id=f.billing_context_id
    left join public.shows os on os.id=oc.show_id
    join public.billing_customer_accounts ca on ca.id=f.payer_customer_account_id
    join public.contacts pc on pc.id=ca.payer_contact_id
    left join public.billing_payment_allocations a on a.payment_id=p.id
    left join public.billing_charges ch on ch.id=a.charge_id
    where p.organization_id=c.organization_id and (p.received_at at time zone tz)::date between p_from and p_to
    group by p.id,f.public_number,f.billing_context_id,oc.currency,os.name,oc.config,pc.company_name,pc.first_name,pc.last_name
   ), shares as (
    select *,case when processing_fee_amount is null then 0 else round(processing_fee_amount*association_amount/payment_amount,2) end association_fee,
      (received_at at time zone tz)::date received_date
    from payments where association_amount<>0
   )
   select received_date,method,origin_context_id,currency,origin_name,sum(association_amount) association_amount,sum(association_fee) association_fee,
     count(*) payment_count,count(*) filter(where processing_fee_amount is null) unknown_fees,
     jsonb_agg(jsonb_build_object('payment_id',id,'received_date',received_date,'method',method,'reference',reference,'folio_number',public_number,
       'origin_context_id',origin_context_id,'origin_name',origin_name,'payer',payer,'association_amount',association_amount,'processing_fee',association_fee)
       order by received_at,id) details
   from shares group by received_date,method,origin_context_id,currency,origin_name order by received_date,origin_name,method
  loop
   lines:='[]';
   key:='payment:'||lower(regexp_replace(row.method,'[^a-zA-Z0-9_]+','_','g'));
   amount:=round(row.association_amount-row.association_fee,2);
   lines:=lines||jsonb_build_array(jsonb_build_object('account_key',key,'account',coalesce(accounts->>key,''),
     'label_fr','Encaissement — '||row.method,'label_en','Receipt — '||row.method,'description',row.origin_name||' — '||row.method,
     'debit',greatest(amount,0),'credit',greatest(-amount,0)));
   if row.association_fee<>0 then
    lines:=lines||jsonb_build_array(jsonb_build_object('account_key','processing_fees','account',coalesce(accounts->>'processing_fees',''),
      'label_fr','Frais de traitement','label_en','Processing fees','description',row.origin_name||' — frais de traitement',
      'debit',greatest(row.association_fee,0),'credit',greatest(-row.association_fee,0)));
   end if;
   lines:=lines||jsonb_build_array(jsonb_build_object('account_key','accounts_receivable','account',coalesce(accounts->>'accounts_receivable',''),
     'label_fr','Comptes clients','label_en','Accounts receivable','description',row.origin_name||' — comptes clients',
     'debit',greatest(-row.association_amount,0),'credit',greatest(row.association_amount,0)));
   select coalesce(sum((x->>'debit')::numeric),0),coalesce(sum((x->>'credit')::numeric),0) into debit_total,credit_total from jsonb_array_elements(lines) x;
   journal_number:=left(prefix||'-'||to_char(row.received_date,'YYYYMMDD')||'-'||substr(row.origin_context_id::text,1,8)||'-'||upper(left(row.method,5)),40);
   journals:=journals||jsonb_build_array(jsonb_build_object('number',journal_number,'date',row.received_date,'narration',row.origin_name||' — encaissements '||row.method,
     'currency',row.currency,'tracking_name',coalesce(options->>'tracking_name','Concours'),'tracking_option',row.origin_name,
     'origin_context_id',row.origin_context_id,'method',row.method,'lines',lines,'debits',debit_total,'credits',credit_total,'balanced',round(debit_total-credit_total,2)=0));
   reconciliation:=reconciliation||row.details;source_count:=source_count+row.payment_count;unknown_fees:=unknown_fees+row.unknown_fees;
  end loop;
  journal_number:=left(prefix||'-'||to_char(p_from,'YYYYMMDD')||'-'||to_char(p_to,'YYYYMMDD'),40);
  if unknown_fees>0 then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','processing_fee_unknown','count',unknown_fees));end if;
 end if;

 select coalesce(jsonb_agg(distinct jsonb_build_object('key',x->>'account_key','label_fr',x->>'label_fr','label_en',x->>'label_en') order by jsonb_build_object('key',x->>'account_key','label_fr',x->>'label_fr','label_en',x->>'label_en')),'[]')
 into required_accounts from jsonb_array_elements(journals) j cross join lateral jsonb_array_elements(j->'lines') x;
 select coalesce(jsonb_agg(r order by r->>'key'),'[]') into missing_accounts from jsonb_array_elements(required_accounts) r where nullif(btrim(accounts->>(r->>'key')),'') is null;
 select coalesce(sum((j->>'debits')::numeric),0),coalesce(sum((j->>'credits')::numeric),0) into debit_total,credit_total from jsonb_array_elements(journals) j;
 return jsonb_build_object('software',p_software,'export_kind',p_kind,'organization_id',c.organization_id,'context_id',c.id,
  'context',jsonb_build_object('id',c.id,'name_fr',coalesce(s.name,c.config->>'name_fr'),'name_en',coalesce(c.config->>'name_en',s.name),'currency',c.currency,
    'start_date',coalesce(s.start_date,p_from),'end_date',coalesce(s.end_date,p_to),'timezone',tz),
  'period_start',p_from,'period_end',p_to,'posting_date',journal_date,'journal_number',journal_number,
  'profile',jsonb_build_object('accounts',accounts,'options',options),'required_accounts',required_accounts,'missing_accounts',missing_accounts,
  'journals',journals,'reconciliation',reconciliation,'warnings',warnings,'source_count',source_count,
  'line_count',coalesce((select sum(jsonb_array_length(j->'lines')) from jsonb_array_elements(journals) j),0),
  'totals',jsonb_build_object('debits',debit_total,'credits',credit_total),
  'balanced',round(debit_total-credit_total,2)=0 and not exists(select 1 from jsonb_array_elements(journals) j where not (j->>'balanced')::boolean));
end $$;

create function public.get_billing_accounting_workspace(p_context uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.billing_contexts; can_manage boolean;begin
 select * into c from public.billing_contexts where id=p_context;
 if public.current_profile_id() is null or c.id is null or not coalesce(public.billing6_staff(c.id),false) then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 can_manage:=coalesce(public.is_platform_admin() or public.is_org_member(c.organization_id,array['admin','secretary']),false);
 return jsonb_build_object('can_manage',can_manage,
  'profiles',case when can_manage then coalesce((select jsonb_agg(jsonb_build_object('software',p.software,'accounts',p.accounts,'options',p.options,'updated_at',p.updated_at) order by p.software) from public.billing_accounting_profiles p where p.organization_id=c.organization_id),'[]') else '[]'::jsonb end,
  'history',case when can_manage then coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'software',e.software,'export_kind',e.export_kind,'period_start',e.period_start,'period_end',e.period_end,'posting_date',e.posting_date,'journal_number',e.journal_number,'created_at',e.created_at,'source_count',e.payload->'source_count','totals',e.payload->'totals') order by e.created_at desc) from (select * from public.billing_accounting_exports where organization_id=c.organization_id and context_id=c.id order by created_at desc limit 20)e),'[]') else '[]'::jsonb end,
  'show_dates',jsonb_build_object('start_date',coalesce((select start_date from public.shows where id=c.show_id),c.opens_at::date),'end_date',coalesce((select end_date from public.shows where id=c.show_id),coalesce(c.closes_at::date,c.opens_at::date))));
end $$;

create function public.save_billing_accounting_profile(p_context uuid,p_software text,p_accounts jsonb,p_options jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_contexts; actor uuid:=public.current_profile_id(); saved public.billing_accounting_profiles;begin
 select * into c from public.billing_contexts where id=p_context;
 if actor is null or c.id is null or not coalesce(public.is_platform_admin() or public.is_org_member(c.organization_id,array['admin','secretary']),false) then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 if p_software not in ('quickbooks_online','xero','sage_50_ca') or jsonb_typeof(p_accounts)<>'object' or jsonb_typeof(p_options)<>'object' then raise exception 'ACCOUNTING_INVALID_PROFILE';end if;
 if exists(select 1 from jsonb_each(p_accounts) x where length(x.key)>80 or jsonb_typeof(x.value)<>'string' or length(btrim(x.value#>>'{}'))>160)
   or length(coalesce(p_options->>'journal_prefix',''))>24 or length(coalesce(p_options->>'tracking_name',''))>80 or length(coalesce(p_options->>'tracking_option',''))>160 then raise exception 'ACCOUNTING_INVALID_PROFILE';end if;
 insert into public.billing_accounting_profiles(organization_id,software,accounts,options,updated_by) values(c.organization_id,p_software,p_accounts,p_options,actor)
 on conflict(organization_id,software) do update set accounts=excluded.accounts,options=excluded.options,updated_by=excluded.updated_by returning * into saved;
 return jsonb_build_object('software',saved.software,'accounts',saved.accounts,'options',saved.options,'updated_at',saved.updated_at);
end $$;

create function public.preview_billing_accounting_export(p_context uuid,p_software text,p_kind text,p_from date,p_to date,p_posting_date date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.billing_contexts;begin
 select * into c from public.billing_contexts where id=p_context;
 if public.current_profile_id() is null or c.id is null then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 if (p_kind='show_close' and not coalesce(public.billing6_staff(c.id),false)) or (p_kind='receipts' and not coalesce(public.is_platform_admin() or public.is_org_member(c.organization_id,array['admin','secretary']),false)) then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 if p_software not in ('quickbooks_online','xero','sage_50_ca') or p_kind not in ('show_close','receipts') or p_from is null or p_to is null or p_posting_date is null or p_to<p_from or p_to-p_from>366 then raise exception 'ACCOUNTING_INVALID_PERIOD';end if;
 return private.billing_accounting_payload(p_context,p_software,p_kind,p_from,p_to,p_posting_date);
end $$;

create function public.create_billing_accounting_export(p_context uuid,p_request uuid,p_software text,p_kind text,p_from date,p_to date,p_posting_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.billing_contexts; actor uuid:=public.current_profile_id(); data jsonb; fingerprint text; prior public.billing_accounting_exports;begin
 select * into c from public.billing_contexts where id=p_context;
 if actor is null or c.id is null or not coalesce(public.is_platform_admin() or public.is_org_member(c.organization_id,array['admin','secretary']),false) then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 if p_request is null then raise exception 'ACCOUNTING_REQUEST_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('accounting-export:'||c.organization_id||':'||p_software||':'||p_kind,0));
 select * into prior from public.billing_accounting_exports where id=p_request;
 data:=public.preview_billing_accounting_export(p_context,p_software,p_kind,p_from,p_to,p_posting_date);
 fingerprint:=encode(extensions.digest(convert_to(data::text,'UTF8'),'sha256'),'hex');
 if prior.id is not null then
  if prior.payload_hash<>fingerprint then raise exception 'BILLING_IDEMPOTENCY_CONFLICT';end if;return prior.payload||jsonb_build_object('export_id',prior.id,'created_at',prior.created_at,'duplicate',true);
 end if;
 if jsonb_array_length(data->'missing_accounts')>0 then raise exception 'ACCOUNTING_MAPPING_REQUIRED';end if;
 if (data->>'line_count')::integer=0 then raise exception 'ACCOUNTING_NOTHING_TO_EXPORT';end if;
 if not (data->>'balanced')::boolean then raise exception 'ACCOUNTING_UNBALANCED';end if;
 select * into prior from public.billing_accounting_exports where organization_id=c.organization_id and software=p_software and export_kind=p_kind and payload_hash=fingerprint;
 if prior.id is not null then return prior.payload||jsonb_build_object('export_id',prior.id,'created_at',prior.created_at,'duplicate',true);end if;
 insert into public.billing_accounting_exports(id,organization_id,context_id,software,export_kind,period_start,period_end,posting_date,journal_number,profile_snapshot,payload_hash,payload,actor_id)
 values(p_request,c.organization_id,c.id,p_software,p_kind,p_from,p_to,p_posting_date,data->>'journal_number',data->'profile',fingerprint,data,actor) returning * into prior;
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload)
 values(c.organization_id,null,actor,'accounting_export_created',jsonb_build_object('context_id',c.id,'software',p_software,'export_kind',p_kind),jsonb_build_object('export_id',p_request,'payload_hash',fingerprint,'source_count',data->'source_count'));
 return data||jsonb_build_object('export_id',p_request,'created_at',prior.created_at,'duplicate',false);
end $$;

revoke all on function private.billing_accounting_payload(uuid,text,text,date,date,date) from public,anon,authenticated,service_role;
revoke all on function public.get_billing_accounting_workspace(uuid),public.save_billing_accounting_profile(uuid,text,jsonb,jsonb),public.preview_billing_accounting_export(uuid,text,text,date,date,date),public.create_billing_accounting_export(uuid,uuid,text,text,date,date,date) from public,anon,authenticated,service_role;
grant execute on function public.get_billing_accounting_workspace(uuid),public.save_billing_accounting_profile(uuid,text,jsonb,jsonb),public.preview_billing_accounting_export(uuid,text,text,date,date,date),public.create_billing_accounting_export(uuid,uuid,text,text,date,date,date) to authenticated;

commit;
