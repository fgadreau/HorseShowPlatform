-- Disposable database only. Exercise the boundary between both recovered branches.
begin;
-- Fee setup is a platform operation; this is the disposable fixture actor only.
insert into public.platform_admins(user_id) values('20000000-0000-0000-0000-000000000002');

set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$
declare
 org uuid:=gen_random_uuid(); contact uuid:=gen_random_uuid(); directory uuid:=gen_random_uuid();
 sale_product uuid:=gen_random_uuid(); hsp_product uuid:=gen_random_uuid();
 show_id uuid; ctx uuid; customer uuid; folio uuid; fee_id uuid; attempt uuid; request_id uuid;
 cfg jsonb; products jsonb; cmd jsonb; quote jsonb; result jsonb; frozen jsonb; fee_total numeric;
 fee numeric; suppliers jsonb:='{"association":{"name":"Association DEMO","address":"1 rue Fictive","tax_number_1":"DEMO-ASSOC","demo":true},"hsp":{"name":"HSP DEMO","address":"2 rue Fictive","tax_number_1":"DEMO-HSP","demo":true}}';
begin
 insert into public.organizations(id,name,slug,currency) values(org,'Direct configurable DEMO',org::text,'CAD');
 insert into public.organization_members(organization_id,user_id,role) values(org,'20000000-0000-0000-0000-000000000002','admin');
 insert into public.contacts(id,type,first_name,last_name,linked_user_id) values(contact,'payer','Direct','DEMO','20000000-0000-0000-0000-000000000004');
 insert into public.organization_disciplines(id,organization_id,discipline_id) select directory,org,id from public.disciplines order by id limit 1;
 insert into public.directory_contacts(organization_discipline_id,contact_id) values(directory,contact);
 insert into public.organization_products(id,organization_id,name,category,default_price,tax_applicable) values
 (sale_product,org,'Sale DEMO','merch',100,true),(hsp_product,org,'HSP DEMO','merch',5,true);
 select value->'config' into cfg from public.billing_test_fixture where key='config';
 products:=jsonb_build_array(
  jsonb_build_object('product_id',sale_product,'unit_price',100,'taxes',jsonb_build_array(jsonb_build_object('code','DIRECT','name','Tax DEMO','jurisdiction','TEST','rate',5))),
  jsonb_build_object('product_id',hsp_product,'unit_price',5,'taxes',jsonb_build_array(jsonb_build_object('code','HSPDIRECT','name','Tax DEMO','jurisdiction','TEST','rate',5)))
 );
 -- Platform capability changes require the platform fixture actor.
 perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
 perform public.billing_set_capabilities(org,null,true,true,true);
 perform public.billing_stripe_configure_direct(org,'acct_configurablePlatform','acct_configurableConnected');
 perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
 customer:=public.billing_get_customer_account(org,contact);
 foreach fee in array array[5::numeric,7.34::numeric,0::numeric] loop
  show_id:=gen_random_uuid();
  insert into public.shows(id,organization_id,name,slug,start_date,end_date,default_currency)
  values(show_id,org,'Configurable fee DEMO',show_id::text,current_date,current_date,'CAD');
  ctx:=public.billing_create_context(org,show_id,null,null,'CAD',cfg,now()-interval '1 day',null,products);
  perform public.billing_set_capabilities(org,ctx,true,true,true,true,2026);
  perform public.set_billing_hsp_fee('show',show_id,fee,'DEMO boundary test');
  perform public.billing_hsp_adopt(ctx,hsp_product,suppliers,'DEMO mandate');
  cmd:=jsonb_build_object('context_id',ctx,'payer_customer_account_id',customer,'product_id',sale_product,'quantity',1,'source_id',gen_random_uuid());
  quote:=public.prepare_billing_operation_quote(cmd);
  perform public.billing_test_assert((select (l->>'subtotal')::numeric=fee from jsonb_array_elements(quote->'lines') l where l->>'supplier'='hsp'),'direct quote uses configurable fee');
  -- A change between confirmation and execution must invalidate the quote.
  perform public.set_billing_hsp_fee('show',show_id,fee+1,'DEMO stale quote');
  perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)',gen_random_uuid(),cmd||jsonb_build_object('quote_id',quote->'quote_id')),'BILLING_STALE_QUOTE');
  perform public.set_billing_hsp_fee('show',show_id,fee,'DEMO restore');
  quote:=public.prepare_billing_operation_quote(cmd);
  request_id:=gen_random_uuid();cmd:=cmd||jsonb_build_object('quote_id',quote->'quote_id');
  result:=public.add_billing_sale(request_id,cmd);
  perform public.billing_test_assert(result=public.add_billing_sale(request_id,cmd),'direct quoted sale retries exactly once');
  folio:=(result#>>'{account,folio_id}')::uuid;
  select id,total into fee_id,fee_total from public.billing_charges where folio_id=folio and supplier='hsp';
  perform public.billing_test_assert(fee_id is not null and (select subtotal=fee and hsp_fee_snapshot->>'source'='show' from public.billing_charges where id=fee_id),'automatic direct fee has consolidated ownership and frozen price');
  perform public.billing_test_assert((select count(*)=1 from public.billing_charges where folio_id=folio and supplier='hsp'),'one HSP fee for first sale');
  frozen:=public.billing_snapshot(folio);
  perform public.set_billing_hsp_fee('show',show_id,fee+2,'DEMO later setting');
  perform public.billing_test_assert(public.billing_snapshot(folio)=frozen,'setting changes do not reprice a direct account');
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
  attempt:=(public.begin_billing_stripe_attempt(gen_random_uuid(),folio,50)->>'attempt_id')::uuid;
  perform public.billing_test_assert((select charge_mode='direct' and application_fee_amount=fee_total from public.billing_stripe_attempts where id=attempt),'direct Stripe commission equals the frozen HSP total, including zero');
  -- Record a synthetic provider cancellation so the same folio can be retried.
  result:=public.billing_stripe_observe(attempt,'acct_configurablePlatform',jsonb_build_object('object','payment_intent','id','pi_configurable'||replace(attempt::text,'-',''),'livemode',false,'amount',5000,'currency','cad','capture_method','automatic','status','canceled','metadata',jsonb_build_object('hsp_attempt_id',attempt),'hsp_verified_account','acct_configurableConnected','application_fee_amount',fee_total*100));
  perform public.billing_test_assert(result->>'state'='canceled','synthetic cancellation resolves reservation');
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
  cmd:=cmd-'quote_id'||jsonb_build_object('source_id',gen_random_uuid());
  quote:=public.prepare_billing_operation_quote(cmd);
  perform public.billing_test_assert(not exists(select 1 from jsonb_array_elements(quote->'lines') l where l->>'supplier'='hsp'),'later sales do not quote a second HSP fee');
  perform public.add_billing_sale(gen_random_uuid(),cmd||jsonb_build_object('quote_id',quote->'quote_id'));
  perform public.billing_test_assert((select count(*)=1 from public.billing_charges where folio_id=folio and supplier='hsp'),'later sales preserve a single HSP fee');
 end loop;
 -- Keep the validity wrapper from the direct-charge branch when replacing pricing.
 show_id:=gen_random_uuid();
 insert into public.shows(id,organization_id,name,slug,start_date,end_date,default_currency)
 values(show_id,org,'Expired HSP tax DEMO',show_id::text,current_date,current_date,'CAD');
 products:=jsonb_set(products,'{1,taxes,0,valid_from}',to_jsonb((current_date-10)::text));
 products:=jsonb_set(products,'{1,taxes,0,valid_until}',to_jsonb((current_date-1)::text));
 ctx:=public.billing_create_context(org,show_id,null,null,'CAD',cfg,now()-interval '1 day',null,products);
 perform public.billing_set_capabilities(org,ctx,true,true,true,true,2026);
 perform public.billing_hsp_adopt(ctx,hsp_product,suppliers,'DEMO expired-tax mandate');
 cmd:=jsonb_build_object('context_id',ctx,'payer_customer_account_id',customer,'product_id',sale_product,'quantity',1,'source_id',gen_random_uuid());
 perform public.billing_test_error(format('select public.prepare_billing_operation_quote(%L::jsonb)',cmd),'BILLING_TAX_RULE_OUTSIDE_VALIDITY');
 perform public.billing_test_assert(not has_function_privilege('authenticated','public.billing_hsp_adopt(uuid,uuid,jsonb,text)','execute'),'adoption remains server-only');
 perform public.billing_test_assert(not has_function_privilege('authenticated','public.billing_hsp_quote_before_validity(jsonb)','execute'),'quote internals remain private');
end $$;
rollback;
