-- Explicit service-only opt-in for an existing, unpaid TEST event context.
-- No activation, backfill, historical charge/document update, or provider call.
begin;
create function public.billing_hsp_adopt_existing_test_context(p_context uuid,p_product uuid,p_suppliers jsonb,p_mandate text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.billing_contexts; supplier jsonb;
begin
 select * into c from public.billing_contexts where id=p_context;
 if c.id is null then raise exception 'BILLING_FORBIDDEN'; end if;
 perform public.billing6_lock(c.organization_id);
 if c.kind<>'event' or c.currency<>'CAD' then raise exception 'BILLING_HSP_NEW_CONTEXT_REQUIRED'; end if;
 if not exists(select 1 from public.billing_stripe_accounts where organization_id=c.organization_id and environment='test' and enabled and charge_mode='direct') then raise exception 'BILLING_STRIPE_DISABLED'; end if;
 -- Explicit test activation only, before any payment or final account closure.
 if exists(select 1 from public.billing_folios f where f.billing_context_id=c.id and (f.state<>'open'
   or exists(select 1 from public.billing_payments p where p.folio_id=f.id)
   or exists(select 1 from public.billing_documents d where d.folio_id=f.id and d.kind in ('invoice','receipt'))))
   or exists(select 1 from public.billing_stripe_attempts where context_id=c.id)
 then raise exception 'BILLING_HSP_NEW_CONTEXT_REQUIRED'; end if;
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

revoke all on function public.billing_hsp_adopt_existing_test_context(uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_hsp_adopt_existing_test_context(uuid,uuid,jsonb,text) to service_role;
commit;
