-- Additive management report/expense tracking. Existing billing entries stay immutable.
begin;
create table public.billing_context_expenses (
 id uuid primary key,organization_id uuid not null,context_id uuid not null,currency text not null,
 category text not null check(category in ('venue','judges','payouts','staff','supplies','travel','other')),
 description text not null check(length(btrim(description)) between 3 and 200),
 amount numeric(12,2) not null check(amount>0 and amount<1000000000),incurred_on date not null,
 reference text check(length(reference)<=200),created_by uuid not null references public.user_profiles(id),created_at timestamptz not null default now(),
 voided_at timestamptz,voided_by uuid references public.user_profiles(id),void_reason text,
 foreign key(organization_id,context_id,currency) references public.billing_contexts(organization_id,id,currency),
 check((voided_at is null and voided_by is null and void_reason is null) or (voided_at is not null and voided_by is not null and length(btrim(void_reason)) between 3 and 500))
);
create index billing_context_expenses_context on public.billing_context_expenses(context_id,incurred_on desc,created_at desc);
alter table public.billing_context_expenses enable row level security;
revoke all on public.billing_context_expenses from public,anon,authenticated,service_role;
create policy "Expense management through scoped RPC only" on public.billing_context_expenses for select to authenticated using(false);

create function public.record_billing_context_expense(p_context uuid,p_request_id uuid,p_expense jsonb) returns public.billing_context_expenses
language plpgsql security definer set search_path='' as $$
declare c public.billing_contexts; saved public.billing_context_expenses; actor uuid:=public.current_profile_id(); amount numeric;
begin
 select * into c from public.billing_contexts where id=p_context;
 if actor is null or c.id is null or not coalesce(public.billing6_staff(c.id),false) then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 if p_request_id is null or p_expense is null or jsonb_typeof(p_expense)<>'object' or exists(select 1 from jsonb_object_keys(p_expense) k where k not in ('category','description','amount','incurred_on','reference')) then raise exception 'BILLING_INVALID_REQUEST';end if;
 amount:=(p_expense->>'amount')::numeric;
 if amount is null or amount<=0 or amount>=1000000000 or amount<>round(amount,2) or amount::text in ('NaN','Infinity','-Infinity')
   or coalesce(p_expense->>'category','') not in ('venue','judges','payouts','staff','supplies','travel','other')
   or length(btrim(coalesce(p_expense->>'description',''))) not between 3 and 200
   or coalesce(p_expense->>'incurred_on','') !~ '^\d{4}-\d{2}-\d{2}$'
   or (p_expense->>'incurred_on')::date not between date '1900-01-01' and date '2100-12-31'
   or length(coalesce(p_expense->>'reference',''))>200 then raise exception 'BILLING_INVALID_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextextended('management-expense:'||p_request_id,0));
 select * into saved from public.billing_context_expenses where id=p_request_id;
 if found then
   if saved.context_id<>c.id or saved.created_by<>actor or saved.amount<>amount or saved.category<>p_expense->>'category' or saved.description<>btrim(p_expense->>'description') or saved.incurred_on<>(p_expense->>'incurred_on')::date or saved.reference is distinct from nullif(btrim(p_expense->>'reference'),'') then raise exception 'BILLING_IDEMPOTENCY_CONFLICT';end if;
   return saved;
 end if;
 insert into public.billing_context_expenses(id,organization_id,context_id,currency,category,description,amount,incurred_on,reference,created_by)
 values(p_request_id,c.organization_id,c.id,c.currency,p_expense->>'category',btrim(p_expense->>'description'),amount,(p_expense->>'incurred_on')::date,nullif(btrim(p_expense->>'reference'),''),actor) returning * into saved;
 insert into public.billing_audit_events(organization_id,actor_id,operation,authorization_snapshot,payload)
 values(c.organization_id,actor,'management_expense_added',jsonb_build_object('context_id',c.id,'actor',actor),jsonb_build_object('expense_id',saved.id,'amount',saved.amount,'currency',saved.currency));
 return saved;
end $$;
create function public.void_billing_context_expense(p_expense uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare e public.billing_context_expenses; actor uuid:=public.current_profile_id();
begin
 select * into e from public.billing_context_expenses where id=p_expense for update;
 if actor is null or e.id is null or not coalesce(public.billing6_staff(e.context_id),false) then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'BILLING_INVALID_REQUEST';end if;
 if e.voided_at is not null then return;end if;
 update public.billing_context_expenses set voided_at=now(),voided_by=actor,void_reason=btrim(p_reason) where id=e.id;
 insert into public.billing_audit_events(organization_id,actor_id,operation,authorization_snapshot,payload)
 values(e.organization_id,actor,'management_expense_voided',jsonb_build_object('context_id',e.context_id,'actor',actor),jsonb_build_object('expense_id',e.id,'reason',btrim(p_reason)));
end $$;

create function public.list_billing_finance_accounts(p_org uuid,p_filter jsonb default '{}',p_due_only boolean default false,p_limit integer default 25,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if public.current_profile_id() is null or p_org is null then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 perform public.billing6_filter(p_filter,p_limit,p_offset);
 with accounts as materialized(select * from public.billing6_accounts(p_org,false,p_filter) where not coalesce(p_due_only,false) or (item->>'balance')::numeric>0),
 page as(select * from accounts order by created_at desc,id limit p_limit offset p_offset)
 select jsonb_build_object('items',coalesce((select jsonb_agg(item order by created_at desc,id) from page),'[]'),'total',(select count(*) from accounts),'limit',p_limit,'offset',p_offset) into result;
 return result;
end $$;
create function public.get_billing_context_report(p_context uuid,p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.billing_contexts; report jsonb;
begin
 select * into c from public.billing_contexts where id=p_context;
 if public.current_profile_id() is null or c.id is null or p_org is distinct from c.organization_id or not coalesce(public.billing6_staff(c.id),false) then
  raise exception 'BILLING_FORBIDDEN' using errcode='42501';
 end if;
 with folios as materialized (select f.* from public.billing_folios f where f.organization_id=c.organization_id and f.billing_context_id=c.id),
 charges as materialized (select ch.*,
   case when coalesce(e.fee_kind,p.presentation->>'fee_kind')='back_number' then 'back_number'
     when coalesce(e.fee_kind,p.presentation->>'fee_kind') like 'judge%' then 'judge_fee'
     when coalesce(e.presentation,p.presentation)->>'section'='entry' then 'entry'
     when p.presentation->>'section'='reservation' then 'reservation'
     when exists(select 1 from public.contact_organization_memberships m where m.billing_charge_id=ch.id) then 'membership'
     else ch.category end as reporting_category
   from public.billing_charges ch join folios f on f.id=ch.folio_id
   left join public.billing_charge_entry_identity e on e.charge_id=ch.id
   left join public.billing_charge_presentation p on p.charge_id=ch.id),
 payments as materialized (select p.* from public.billing_payments p join folios f on f.id=p.folio_id),
 allocations as materialized (select a.*,ch.supplier from public.billing_payment_allocations a join charges ch on ch.id=a.charge_id join payments p on p.id=a.payment_id),
 charge_totals as (select coalesce(sum(subtotal) filter(where supplier='association'),0) revenue,
   coalesce(sum(tax_amount) filter(where supplier='association'),0) association_tax,
   coalesce(sum(total) filter(where supplier='association'),0) association_total,
   coalesce(sum(subtotal) filter(where supplier='hsp'),0) hsp_subtotal,
   coalesce(sum(tax_amount) filter(where supplier='hsp'),0) hsp_tax,
   coalesce(sum(total) filter(where supplier='hsp'),0) hsp_total,
   coalesce(sum(total),0) billed from charges),
 allocated as (select coalesce(sum(amount) filter(where supplier='association'),0) association_collected,
   coalesce(sum(amount) filter(where supplier='hsp'),0) hsp_collected from allocations),
 categories as (select reporting_category as category,coalesce(sum(subtotal),0) subtotal,coalesce(sum(tax_amount),0) tax_amount,coalesce(sum(total),0) total
   from charges where supplier='association' group by reporting_category),
 methods as (select method,sum(amount) amount,count(*) payments from payments group by method),
 fees as (select coalesce(sum(round(p.processing_fee_amount*coalesce((select sum(a.amount) from allocations a where a.payment_id=p.id and a.supplier='association'),0)/p.amount,2)),0) association_processing_fees,
   count(*) filter(where p.processing_fee_amount is null) unknown_processing_fees from payments p),
 account_totals as (select count(*) accounts,count(*) filter(where state='open') open_accounts,count(*) filter(where state='closed') closed_accounts,
   count(*) filter(where coalesce((select sum(ch.total) from charges ch where ch.folio_id=f.id),0)>coalesce((select sum(p.amount) from payments p where p.folio_id=f.id),0)) owing_accounts from folios f)
 select jsonb_build_object('context',jsonb_build_object('id',c.id,'show_id',c.show_id,'kind',c.kind,'currency',c.currency,
     'name_fr',coalesce((select s.name from public.shows s where s.id=c.show_id),c.config->>'name_fr'),
     'name_en',coalesce(c.config->>'name_en',(select s.name from public.shows s where s.id=c.show_id)),
     'year',(select financial_year from public.billing_context_access where context_id=c.id)),
   'totals',to_jsonb(t)||to_jsonb(a)||to_jsonb(f)||jsonb_build_object('collected',coalesce((select sum(amount) from payments),0),
     'balance',t.billed-coalesce((select sum(amount) from payments),0),
     'association_balance',t.association_total-a.association_collected,'hsp_balance',t.hsp_total-a.hsp_collected),
   'expenses_total',coalesce((select sum(e.amount) from public.billing_context_expenses e where e.context_id=c.id and e.voided_at is null),0),
   'management_result',t.revenue-f.association_processing_fees-coalesce((select sum(e.amount) from public.billing_context_expenses e where e.context_id=c.id and e.voided_at is null),0),
   'expenses',coalesce((select jsonb_agg(to_jsonb(e) order by e.incurred_on desc,e.created_at desc,e.id) from public.billing_context_expenses e where e.context_id=c.id),'[]'),
   'accounts',to_jsonb(ac),'revenue_categories',coalesce((select jsonb_agg(to_jsonb(x) order by category) from categories x),'[]'),
   'payment_methods',coalesce((select jsonb_agg(to_jsonb(x) order by method) from methods x),'[]'),
   'generated_at',statement_timestamp()) into report from charge_totals t cross join allocated a cross join fees f cross join account_totals ac;
 return report;
end $$;
revoke all on function public.get_billing_context_report(uuid,uuid),public.list_billing_finance_accounts(uuid,jsonb,boolean,integer,integer),public.record_billing_context_expense(uuid,uuid,jsonb),public.void_billing_context_expense(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_billing_context_report(uuid,uuid),public.list_billing_finance_accounts(uuid,jsonb,boolean,integer,integer),public.record_billing_context_expense(uuid,uuid,jsonb),public.void_billing_context_expense(uuid,text) to authenticated;
commit;
