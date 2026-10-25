begin;
-- Apply the same explicit validity check to the HSP profile as to the ordinary sale.
-- Only new quotes/commands change. Existing snapshots and supplier evidence are untouched.
alter function public.billing_hsp_quote_value(jsonb) rename to billing_hsp_quote_before_validity;
create function public.billing_hsp_quote_value(p_sale jsonb) returns jsonb language plpgsql set search_path='' as $$
declare q jsonb; c public.billing_contexts;
begin
 q:=public.billing_hsp_quote_before_validity(p_sale);
 select * into c from public.billing_contexts where id=(p_sale->>'context_id')::uuid;
 if exists(select 1 from public.billing_product_tax_rules p join public.billing_tax_rules t on t.id=p.tax_rule_id
 where p.context_id=c.id and p.product_id in(select (l->>'product_id')::uuid from jsonb_array_elements(q->'lines') l)
 and ((clock_timestamp() at time zone(c.config->>'timezone'))::date<t.valid_from or (t.valid_until is not null and (clock_timestamp() at time zone(c.config->>'timezone'))::date>t.valid_until))) then raise exception 'BILLING_TAX_RULE_OUTSIDE_VALIDITY'; end if;
 return q;
end $$;
revoke all on function public.billing_hsp_quote_before_validity(jsonb),public.billing_hsp_quote_value(jsonb) from public,anon,authenticated,service_role;

-- Show unsettled provider reservations separately; never call an uncertain fee a remittance.
-- Partial HT/tax allocation has no approved commercial policy: expose null, not an invented prorata.
create or replace function public.get_billing_hsp_remittances(p_context uuid,p_offset integer default 0,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.billing6_staff(p_context) then raise exception 'BILLING_FORBIDDEN'; end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 then raise exception 'BILLING_INVALID_REQUEST'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('uncollected',x.total-x.collected,'remaining',x.collected-x.remitted,
 'recoverable',x.total-x.remitted-x.reserved,
 'collected_subtotal',case when x.collected=0 then 0 when x.collected=x.total then x.subtotal else null end,
 'collected_tax_amount',case when x.collected=0 then 0 when x.collected=x.total then x.tax_amount else null end,
 'allocation_status',case when x.collected=0 then 'uncollected' when x.collected=x.total then 'fully_collected' else 'partial_tax_allocation_unapproved' end)
 order by x.account_number,x.folio_id),'[]') into result from (
 select f.public_number account_number,f.id folio_id,f.currency,c.subtotal,c.tax_amount,c.total,
 coalesce((select sum(pa.amount) from public.billing_payment_allocations pa where pa.charge_id=c.id),0) collected,
 coalesce((select sum(r.amount) from public.billing_hsp_recoveries r where r.folio_id=f.id),0) remitted,
 coalesce((select sum(a.application_fee_amount-coalesce(r.amount,0)) from public.billing_stripe_attempts a left join public.billing_hsp_recoveries r on r.attempt_id=a.id where a.folio_id=f.id and a.state<>'canceled'),0) reserved,
 (select coalesce(jsonb_agg(jsonb_build_object('name',t.name,'code',t.code,'amount',t.amount) order by t.code),'[]') from public.billing_charge_taxes t where t.charge_id=c.id) taxes,
 (select coalesce(jsonb_agg(jsonb_build_object('amount',pa.amount,'method',p.method,'received_at',p.received_at,'receipt_number',d.number,
 'subtotal',case when pa.amount=c.total then c.subtotal else null end,'tax_amount',case when pa.amount=c.total then c.tax_amount else null end)
 order by p.received_at,p.id),'[]') from public.billing_payment_allocations pa join public.billing_payments p on p.id=pa.payment_id join public.billing_documents d on d.payment_id=p.id and d.kind='receipt' where pa.charge_id=c.id) collections
 from public.billing_hsp_assessments h join public.billing_folios f on f.id=h.folio_id join public.billing_charges c on c.id=h.charge_id where h.context_id=p_context order by f.public_number,f.id offset p_offset limit p_limit
 ) x;
 return jsonb_build_object('context_id',p_context,'rows',result,'offset',p_offset,'limit',p_limit,'settlement_supported',false,'partial_tax_policy_approved',false);
end $$;
revoke all on function public.get_billing_hsp_remittances(uuid,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_billing_hsp_remittances(uuid,integer,integer) to authenticated;
commit;
