-- Read-only breakdown from frozen billed labels, including matching reservation credits.
begin;
create or replace function public.get_billing_context_report(p_context uuid,p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c public.billing_contexts; report jsonb;
begin
 select * into c from public.billing_contexts where id=p_context;
 if public.current_profile_id() is null or c.id is null or p_org is distinct from c.organization_id or not coalesce(public.billing6_staff(c.id),false) then
  raise exception 'BILLING_FORBIDDEN' using errcode='42501';
 end if;
 with folios as materialized (select f.* from public.billing_folios f where f.organization_id=c.organization_id and f.billing_context_id=c.id),
 charges as materialized (select ch.*,
   coalesce(original.product_id,ch.product_id) reservation_product,
   case when original.id is not null then original.description_i18n else ch.description_i18n end reservation_labels,
   coalesce(original.description,ch.description) reservation_label,
   case when coalesce(e.fee_kind,p.presentation->>'fee_kind')='back_number' then 'back_number'
     when coalesce(e.fee_kind,p.presentation->>'fee_kind') like 'judge%' then 'judge_fee'
     when coalesce(e.presentation,p.presentation)->>'section'='entry' then 'entry'
     when p.presentation->>'section'='reservation' then 'reservation'
     when exists(select 1 from public.contact_organization_memberships m where m.billing_charge_id=ch.id) then 'membership'
     else ch.category end as reporting_category
   from public.billing_charges ch join folios f on f.id=ch.folio_id
   left join public.billing_charge_entry_identity e on e.charge_id=ch.id
   left join public.billing_charge_presentation p on p.charge_id=ch.id
   left join public.reservation_billing_reversals reversal on reversal.credit_id=ch.id
   left join public.billing_charges original on original.id=reversal.charge_id),
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
 reservation_groups as (
   select reservation_product product_id,
     coalesce(nullif(reservation_labels->>'fr',''),reservation_label) label_fr,
     coalesce(nullif(reservation_labels->>'en',''),reservation_label) label_en,
     sum(subtotal) subtotal,sum(tax_amount) tax_amount,sum(total) total
   from charges where supplier='association' and reporting_category='reservation'
   group by reservation_product,coalesce(nullif(reservation_labels->>'fr',''),reservation_label),coalesce(nullif(reservation_labels->>'en',''),reservation_label)
   having sum(subtotal)<>0 or sum(tax_amount)<>0 or sum(total)<>0),
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
   'reservation_revenue',coalesce((select jsonb_agg(to_jsonb(x) order by label_fr,label_en,product_id) from reservation_groups x),'[]'),
   'payment_methods',coalesce((select jsonb_agg(to_jsonb(x) order by method) from methods x),'[]'),
   'generated_at',statement_timestamp()) into report from charge_totals t cross join allocated a cross join fees f cross join account_totals ac;
 return report;
end $$;
commit;
