-- Dashboard reads need ledger totals, not complete printable document snapshots.
-- Preserve the union of staff access and personal/history access, once per folio.
begin;
create or replace function public.list_dashboard_billing_accounts(p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if public.current_profile_id() is null then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 with contexts as materialized (
  select c.*,a.financial_year,public.billing6_staff(c.id) staff
  from public.billing_contexts c left join public.billing_context_access a on a.context_id=c.id
  where p_org is null or c.organization_id=p_org
 ), folios as materialized (
  select f.* from public.billing_folios f join contexts c on c.id=f.billing_context_id
  where c.staff or public.billing6_personal_read(f.id)
 ), charges as (
  select ch.folio_id,sum(ch.subtotal) subtotal,sum(ch.tax_amount) tax_amount,sum(ch.total) total
  from public.billing_charges ch join folios f on f.id=ch.folio_id group by ch.folio_id
 ), payments as (
  select p.folio_id,sum(p.amount) paid from public.billing_payments p join folios f on f.id=p.folio_id group by p.folio_id
 ), amounts as (
  select f.*,coalesce(ch.subtotal,0) subtotal,coalesce(ch.tax_amount,0) tax_amount,
   coalesce(ch.total,0) total,coalesce(p.paid,0) paid,coalesce(ch.total,0)-coalesce(p.paid,0) balance
  from folios f left join charges ch on ch.folio_id=f.id left join payments p on p.folio_id=f.id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',f.id,'organization_id',f.organization_id,'context_id',c.id,'show_id',c.show_id,'type_id',c.context_type_id,
  'kind',case when c.kind='event' then 'show_account' else 'non_event_account' end,
  'name_fr',c.config->>'name_fr','name_en',c.config->>'name_en','account_number',f.public_number,
  'year',c.financial_year,'currency',f.currency,'state',f.state,'payer_contact_id',pc.id,
  'payer',jsonb_build_object('customer_account_id',ca.id,'contact_id',pc.id,'first_name',pc.first_name,
   'middle_name',pc.middle_name,'last_name',pc.last_name,'company_name',pc.company_name,
   'address',pc.address,'address_line2',pc.address_line2,'city',pc.city,'state',pc.state,'zip_code',pc.zip_code,
   'country',pc.country,'email',pc.email,'phone',pc.phone,'tax_identifiers',null),
  'subtotal',f.subtotal,'tax_amount',f.tax_amount,'total',f.total,'paid',f.paid,'balance',f.balance,
  'needs_attention',(f.state='closed' and f.balance<>0)
   or (f.state='open' and coalesce(cs.ready,false))
   or exists(select 1 from public.billing_close_blocks b where b.folio_id=f.id and b.active)
 ) order by f.id),'[]'::jsonb) into result
 from amounts f join contexts c on c.id=f.billing_context_id
 join public.billing_customer_accounts ca on ca.id=f.payer_customer_account_id
 join public.contacts pc on pc.id=ca.payer_contact_id
 left join public.billing_checkout_state cs on cs.folio_id=f.id;
 return result;
end $$;
revoke all on function public.list_dashboard_billing_accounts(uuid) from public,anon,authenticated;
grant execute on function public.list_dashboard_billing_accounts(uuid) to authenticated;
commit;
