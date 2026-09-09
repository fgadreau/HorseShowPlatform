-- Fictitious records in the disposable test database only.
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
select public.billing_test_checkout_account('consolidated-demo',100) as fixture \gset consolidated_
reset role;
select set_config('billing.test.consolidated', :'consolidated_fixture', false);
do $$
declare x jsonb:=current_setting('billing.test.consolidated')::jsonb; f public.billing_folios; ctx public.billing_contexts; s jsonb; r jsonb; cmd jsonb; req uuid:=gen_random_uuid(); old jsonb; st jsonb; inv jsonb; amount numeric; h uuid;
begin
 select * into f from public.billing_folios where id=(x->>'folio')::uuid;
 select * into ctx from public.billing_contexts where id=f.billing_context_id;
 perform public.billing_test_assert((public.billing_effective_hsp_fee(ctx.id)->>'amount')::numeric=5,'platform fee 5');
 perform public.set_billing_hsp_fee('association',f.organization_id,7.34,'DEMO association override');
 perform public.billing_test_assert((public.billing_effective_hsp_fee(ctx.id)->>'amount')::numeric=7.34,'association override');
 -- Helper uses a non-event context; create a fictitious show-bound settings resolution probe from existing show fixture.
 if ctx.show_id is null then
  select id into ctx.show_id from public.shows where organization_id=f.organization_id limit 1;
 end if;
 if ctx.show_id is not null then
  -- Transaction-local resolver probe uses another actual event context if available; below creates one via copied config.
  insert into public.billing_contexts(organization_id,kind,show_id,currency,config,opens_at,created_by)
  values(f.organization_id,'event',ctx.show_id,'CAD',ctx.config,now(),f.created_by)
  on conflict (organization_id,show_id) where kind='event' do nothing;
  select id into ctx.id from public.billing_contexts where show_id=ctx.show_id and organization_id=f.organization_id;
  perform public.set_billing_hsp_fee('show',ctx.show_id,9,'DEMO show override');
  perform public.billing_test_assert((public.billing_effective_hsp_fee(ctx.id)->>'amount')::numeric=9,'show beats association');
  perform public.set_billing_hsp_fee('show',ctx.show_id,0,'DEMO sponsored show');
  perform public.billing_test_assert(public.billing_effective_hsp_fee(ctx.id) @> '{"amount":0,"sponsored":true,"source":"show"}','show zero wins');
  perform public.set_billing_hsp_fee('show',ctx.show_id,null,'DEMO inherit');
  perform public.billing_test_assert((public.billing_effective_hsp_fee(ctx.id)->>'amount')::numeric=7.34,'show null inherits association');
 else raise exception 'Show fixture required'; end if;
 ctx.id:=f.billing_context_id;
 perform public.set_billing_hsp_fee('association',f.organization_id,0,'DEMO sponsorship');
 perform public.billing_test_assert(public.billing_effective_hsp_fee(ctx.id) @> '{"amount":0,"sponsored":true,"source":"association"}','association zero is explicit');
 perform public.set_billing_hsp_fee('association',f.organization_id,null,'DEMO inherit');
 perform public.billing_test_assert((public.billing_effective_hsp_fee(ctx.id)->>'amount')::numeric=5,'null restores platform');
 insert into public.billing_hsp_products values(f.organization_id,(x#>>'{command,product_id}')::uuid);
 cmd:=x->'command'||jsonb_build_object('source_id',gen_random_uuid());
 r:=public.add_billing_sale(req,cmd);h:=(r->>'charge_id')::uuid;
 perform public.billing_test_assert(r=public.add_billing_sale(req,cmd),'HSP exact retry');
 perform public.billing_test_assert((select subtotal=5 and hsp_fee_snapshot @> '{"source":"platform","amount":5}' from public.billing_charges where id=h),'effective fee frozen on ledger');
 old:=public.billing_snapshot(f.id);
 perform public.set_billing_hsp_fee('association',f.organization_id,0,'DEMO later change');
 perform public.billing_test_assert(public.billing_snapshot(f.id)=old,'settings never alter existing charges');
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L)',gen_random_uuid(),cmd||jsonb_build_object('source_id',gen_random_uuid())),'billing_one_hsp_fee_per_folio');
 s:=public.get_billing_statement(gen_random_uuid(),f.id);
 r:=public.record_billing_payment(gen_random_uuid(),jsonb_build_object('folio_id',f.id,'version',s#>'{account,version}','amount',20,'method','cheque','received_at',now(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',x->>'charge','amount',20))));
 perform public.billing_test_assert(r#>>'{document,kind}'='receipt','numbered cheque receipt');
 s:=public.get_billing_statement(gen_random_uuid(),f.id);
 select total into amount from public.billing_charges where id=h;
 r:=public.record_billing_payment(gen_random_uuid(),jsonb_build_object('folio_id',f.id,'version',s#>'{account,version}','amount',amount+10,'method','cash','received_at',now(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',h,'amount',amount),jsonb_build_object('charge_id',x->>'charge','amount',10))));
 s:=public.billing_snapshot(f.id);
 perform public.billing_test_assert((s#>>'{payments,1,supplier_allocations,association}')::numeric=10 and (s#>>'{payments,1,supplier_allocations,hsp}')::numeric=amount,'one payment spans both suppliers');
 perform public.billing_test_assert((r#>>'{document,snapshot,balance}')::numeric=(s->>'balance')::numeric,'receipt and ledger balances agree');
 perform public.billing_test_assert(jsonb_array_length(s->'payments')=2 and (s->>'total')::numeric-(s->>'received')::numeric=(s->>'balance')::numeric,'multiple methods and exact balance');
 perform public.billing_test_assert((select count(*)=1 from public.billing_charges where folio_id=f.id and supplier='hsp'),'payments never add HSP fees');
 perform public.billing_test_assert(s#>>'{supplier_invoices,association,fiscal_id}'<>s#>>'{supplier_invoices,hsp,fiscal_id}','two fiscal identifiers');
 st:=public.get_billing_statement(gen_random_uuid(),f.id);
 inv:=public.finalize_billing_folio(gen_random_uuid(),f.id,(st#>>'{account,version}')::bigint,(st->>'document_id')::uuid);
 select snapshot into old from public.billing_documents where folio_id=f.id and kind='invoice';
 perform public.set_billing_hsp_fee('association',f.organization_id,11,'DEMO post-finalization');
 perform public.billing_test_assert((select snapshot=old from public.billing_documents where folio_id=f.id and kind='invoice'),'final invoice unchanged after settings');
 perform public.billing_test_error(format('update public.billing_documents set snapshot=%L where folio_id=%L and kind=''invoice''','{}',f.id),'BILLING_IMMUTABLE');

 -- New accounts use the new setting, including fractional cents-free values and zero.
 perform public.set_billing_hsp_fee('association',f.organization_id,0,'DEMO sponsored');
 x:=public.billing_test_checkout_account('consolidated-sponsored',100);
 perform public.billing_test_assert((select subtotal=0 and total=0 and hsp_fee_snapshot @> '{"sponsored":true,"source":"association"}' from public.billing_charges where id=(x->>'charge')::uuid),'zero fee charge and zero taxes');
 perform public.set_billing_hsp_fee('association',f.organization_id,7.34,'DEMO arbitrary fee');
 x:=public.billing_test_checkout_account('consolidated-custom',100);
 perform public.billing_test_assert((select subtotal=7.34 and hsp_fee_snapshot @> '{"amount":7.34}' from public.billing_charges where id=(x->>'charge')::uuid),'7.34 frozen as commercial amount');
 perform public.billing_test_assert((select (p->>'price')::numeric=7.34 from jsonb_array_elements(public.billing_ui_catalog((x->>'context')::uuid)->'products') p where p->>'id'=x#>>'{command,product_id}'),'catalog displays effective custom price');
 perform public.billing_test_error(format('select public.set_billing_hsp_fee(''association'',%L,7.345)',f.organization_id),'BILLING_INVALID_AMOUNT');
 s:=public.billing_supplier_payment('{"charges":[{"id":"a","supplier":"association"},{"id":"h","supplier":"hsp"}]}','{"amount":100,"allocations":[{"charge_id":"a","amount":90},{"charge_id":"h","amount":10}]}',1.23);
 perform public.billing_test_assert(s#>'{processing_fee}' @> '{"association":1.11,"hsp":0.12,"funds_separated":false}','proportional processing cost, exact remainder, no Connect transfer');
 perform public.billing_test_assert((select count(*)>=8 from public.billing_hsp_fee_setting_events where setting->>'changed_by' is not null),'settings audit actor timestamp');
end $$;

set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
select public.billing_test_error('select public.set_billing_hsp_fee(''platform'',''00000000-0000-0000-0000-000000000000'',7.34)','BILLING_FORBIDDEN');
reset role;
