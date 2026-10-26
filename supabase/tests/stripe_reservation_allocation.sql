-- Synthetic direct and destination provider observations, no Stripe call.
begin;
do $$
declare
 staff_user uuid:=gen_random_uuid(); stranger_user uuid:=gen_random_uuid();staff_profile uuid;
 org uuid:=gen_random_uuid();other_org uuid:=gen_random_uuid();show_id uuid:=gen_random_uuid();ctx uuid:=gen_random_uuid();other_ctx uuid:=gen_random_uuid();
 payer uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();product uuid:=gen_random_uuid();folio uuid:=gen_random_uuid();ch uuid;hsp uuid;payment uuid;
 request uuid:=gen_random_uuid();report jsonb;page jsonb;expense public.billing_context_expenses;blocked boolean;before_charges bigint;stripe_attempt uuid:=gen_random_uuid();object jsonb;result jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(staff_user,staff_user||'@example.test','{"first_name":"Finance","last_name":"Test"}'),(stranger_user,stranger_user||'@example.test','{"first_name":"Other","last_name":"Test"}');
 select id into staff_profile from public.user_profiles where user_id=staff_user;
 insert into public.organizations(id,name,slug,is_test_mode) values(org,'Report TEST',org::text,true),(other_org,'Other TEST',other_org::text,true);
 insert into public.organization_members(organization_id,user_id,role) values(org,staff_profile,'admin');
 insert into public.shows(id,organization_id,name,slug,start_date,end_date) values(show_id,org,'Finance report TEST',show_id::text,current_date,current_date);
 insert into public.contacts(id,type,first_name,last_name) values(payer,'payer','Synthetic','Payer');
 insert into public.organization_products(id,organization_id,name,category,default_price,tax_applicable) values(product,org,'Report TEST product','merch',100,true);
 insert into public.billing_contexts(id,organization_id,kind,show_id,currency,config,opens_at,created_by)
 values(ctx,org,'event',show_id,'CAD','{"name_fr":"Concours TEST","name_en":"TEST show","timezone":"America/Toronto","account_prefix":"TEST-ACC","receipt_prefix":"TEST-RCPT","invoice_prefix":"TEST-INV","closing_policy":"manual","payment_policy":"received_only","activation_policy":"allocated_received","categories":["merch","stall","other"],"staff_roles":["admin","secretary"]}',now(),staff_profile);
 insert into public.billing_context_access(context_id,financial_year,year_basis) values(ctx,2026,'show_start')
 on conflict(context_id) do update set financial_year=2026,year_basis='show_start';
 insert into public.billing_customer_accounts(id,organization_id,payer_contact_id) values(customer,org,payer);
 insert into public.billing_folios(id,organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by) values(folio,org,ctx,customer,'CAD','TEST-'||folio,staff_profile);
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(org,folio,'CAD','secretary_sale',gen_random_uuid(),product,'merch','TEST sale',1,100,100,5,payer,staff_profile,'{}') returning id into ch;
 insert into public.billing_charge_presentation(charge_id,presentation) values(ch,'{"section":"entry","fee_kind":"entry"}');
 -- An unpaid reservation and its immutable credit cancel out of revenue.
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(org,folio,'CAD','secretary_sale',gen_random_uuid(),product,'stall','TEST cancelled',1,50,50,2.5,payer,staff_profile,'{}'),
 (org,folio,'CAD','reservation_credit',gen_random_uuid(),product,'stall','TEST credit',1,50,-50,-2.5,payer,staff_profile,'{}');
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot,supplier)
 values(org,folio,'CAD','hsp_service',gen_random_uuid(),product,'other','TEST HSP',1,5,5,.25,payer,staff_profile,'{}','hsp') returning id into hsp;
 insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot,processing_fee_amount)
 values(org,folio,'CAD',60,'cash',now(),staff_profile,'{}',1.20) returning id into payment;
 insert into public.billing_payment_allocations(folio_id,payment_id,charge_id,amount) values(folio,payment,ch,55),(folio,payment,hsp,5);
 select count(*) into before_charges from public.billing_charges where folio_id=folio;

 perform set_config('request.jwt.claim.sub',staff_user::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',staff_user,'role','authenticated')::text,true);
 insert into public.billing_documents(organization_id,folio_id,currency,kind,number,payment_id,snapshot,actor_id)
 values(org,folio,'CAD','receipt','TEST-CASH-'||payment,payment,public.billing_snapshot(folio)||jsonb_build_object('payment_id',payment,'issued_at',clock_timestamp(),'receipt_payment',(select p from jsonb_array_elements(public.billing_snapshot(folio)->'payments') p where p->>'id'=payment::text)),staff_profile);
 insert into public.reservation_billing_reversals(charge_id,credit_id,actor_id)
 select debit.id,credit.id,staff_profile from public.billing_charges debit cross join public.billing_charges credit
 where debit.folio_id=folio and credit.folio_id=folio and debit.description='TEST cancelled' and credit.description='TEST credit';
 insert into public.billing_hsp_policies(context_id,product_id,suppliers,mandate) values(ctx,product,'{}','Synthetic test mandate');
 insert into public.billing_hsp_assessments(folio_id,charge_id,context_id) values(folio,hsp,ctx);
 insert into public.billing_stripe_accounts(organization_id,platform_account,connected_account,enabled,charge_mode) values(org,'acct_testPlatform','acct_syntheticDirectReversal',true,'direct');
 insert into public.billing_stripe_attempts(id,organization_id,context_id,folio_id,payer_account_id,actor_id,platform_account,connected_account,amount,currency,request_id,charge_mode,application_fee_amount)
 values(stripe_attempt,org,ctx,folio,customer,staff_profile,'acct_testPlatform','acct_syntheticDirectReversal',50.25,'CAD',request,'direct',0);
 object:=jsonb_build_object('object','payment_intent','id','pi_'||replace(stripe_attempt::text,'-',''),'livemode',false,'capture_method','automatic',
 'currency','cad','amount',5025,'amount_received',5025,'status','succeeded',
 'hsp_verified_account','acct_syntheticDirectReversal','application_fee_amount',(select application_fee_amount*100 from public.billing_stripe_attempts where id=stripe_attempt));
 result:=public.billing_stripe_observe(stripe_attempt,'acct_testPlatform',object);
 if result->>'state'<>'succeeded' or result->>'receipt_id' is null then raise exception 'Stripe success must reconcile after reservation replacement';end if;
 perform public.billing_stripe_observe(stripe_attempt,'acct_testPlatform',object);
 if (select count(*) from public.billing_payments where folio_id=folio and method='stripe_test')<>1
   or (select count(*) from public.billing_documents where folio_id=folio and kind='receipt')<>2 then raise exception 'Reconciliation replay duplicated payment/receipt';end if;
 if exists(select 1 from public.billing_payment_allocations a join public.reservation_billing_reversals r on a.charge_id in(r.charge_id,r.credit_id) where a.folio_id=folio)
   or (select sum(a.amount) from public.billing_payment_allocations a join public.billing_payments p on p.id=a.payment_id where p.folio_id=folio and p.method='stripe_test')<>50.25
   or (public.billing_snapshot(folio)->>'balance')::numeric<>0 then raise exception 'Payment must allocate fully to active lines only';end if;
 if has_function_privilege('authenticated','public.billing_stripe_observe(uuid,text,jsonb)','EXECUTE') or has_function_privilege('anon','public.billing_stripe_observe(uuid,text,jsonb)','EXECUTE') then raise exception 'Provider observation must stay private';end if;
end $$;
do $$
declare
 staff_user uuid:=gen_random_uuid(); stranger_user uuid:=gen_random_uuid();staff_profile uuid;
 org uuid:=gen_random_uuid();other_org uuid:=gen_random_uuid();show_id uuid:=gen_random_uuid();ctx uuid:=gen_random_uuid();other_ctx uuid:=gen_random_uuid();
 payer uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();product uuid:=gen_random_uuid();folio uuid:=gen_random_uuid();ch uuid;hsp uuid;payment uuid;
 request uuid:=gen_random_uuid();report jsonb;page jsonb;expense public.billing_context_expenses;blocked boolean;before_charges bigint;stripe_attempt uuid:=gen_random_uuid();object jsonb;result jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(staff_user,staff_user||'@example.test','{"first_name":"Finance","last_name":"Test"}'),(stranger_user,stranger_user||'@example.test','{"first_name":"Other","last_name":"Test"}');
 select id into staff_profile from public.user_profiles where user_id=staff_user;
 insert into public.organizations(id,name,slug,is_test_mode) values(org,'Report TEST',org::text,true),(other_org,'Other TEST',other_org::text,true);
 insert into public.organization_members(organization_id,user_id,role) values(org,staff_profile,'admin');
 insert into public.shows(id,organization_id,name,slug,start_date,end_date) values(show_id,org,'Finance report TEST',show_id::text,current_date,current_date);
 insert into public.contacts(id,type,first_name,last_name) values(payer,'payer','Synthetic','Payer');
 insert into public.organization_products(id,organization_id,name,category,default_price,tax_applicable) values(product,org,'Report TEST product','merch',100,true);
 insert into public.billing_contexts(id,organization_id,kind,show_id,currency,config,opens_at,created_by)
 values(ctx,org,'event',show_id,'CAD','{"name_fr":"Concours TEST","name_en":"TEST show","timezone":"America/Toronto","account_prefix":"TEST-ACC","receipt_prefix":"TEST-RCPT","invoice_prefix":"TEST-INV","closing_policy":"manual","payment_policy":"received_only","activation_policy":"allocated_received","categories":["merch","stall","other"],"staff_roles":["admin","secretary"]}',now(),staff_profile);
 insert into public.billing_context_access(context_id,financial_year,year_basis) values(ctx,2026,'show_start')
 on conflict(context_id) do update set financial_year=2026,year_basis='show_start';
 insert into public.billing_customer_accounts(id,organization_id,payer_contact_id) values(customer,org,payer);
 insert into public.billing_folios(id,organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by) values(folio,org,ctx,customer,'CAD','TEST-'||folio,staff_profile);
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(org,folio,'CAD','secretary_sale',gen_random_uuid(),product,'merch','TEST sale',1,100,100,5,payer,staff_profile,'{}') returning id into ch;
 insert into public.billing_charge_presentation(charge_id,presentation) values(ch,'{"section":"entry","fee_kind":"entry"}');
 -- An unpaid reservation and its immutable credit cancel out of revenue.
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(org,folio,'CAD','secretary_sale',gen_random_uuid(),product,'stall','TEST cancelled',1,50,50,2.5,payer,staff_profile,'{}'),
 (org,folio,'CAD','reservation_credit',gen_random_uuid(),product,'stall','TEST credit',1,50,-50,-2.5,payer,staff_profile,'{}');
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot,supplier)
 values(org,folio,'CAD','hsp_service',gen_random_uuid(),product,'other','TEST HSP',1,5,5,.25,payer,staff_profile,'{}','hsp') returning id into hsp;
 insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot,processing_fee_amount)
 values(org,folio,'CAD',60,'cash',now(),staff_profile,'{}',1.20) returning id into payment;
 insert into public.billing_payment_allocations(folio_id,payment_id,charge_id,amount) values(folio,payment,ch,55),(folio,payment,hsp,5);
 select count(*) into before_charges from public.billing_charges where folio_id=folio;

 perform set_config('request.jwt.claim.sub',staff_user::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',staff_user,'role','authenticated')::text,true);
 insert into public.billing_documents(organization_id,folio_id,currency,kind,number,payment_id,snapshot,actor_id)
 values(org,folio,'CAD','receipt','TEST-CASH-'||payment,payment,public.billing_snapshot(folio)||jsonb_build_object('payment_id',payment,'issued_at',clock_timestamp(),'receipt_payment',(select p from jsonb_array_elements(public.billing_snapshot(folio)->'payments') p where p->>'id'=payment::text)),staff_profile);
 insert into public.reservation_billing_reversals(charge_id,credit_id,actor_id)
 select debit.id,credit.id,staff_profile from public.billing_charges debit cross join public.billing_charges credit
 where debit.folio_id=folio and credit.folio_id=folio and debit.description='TEST cancelled' and credit.description='TEST credit';
 insert into public.billing_hsp_policies(context_id,product_id,suppliers,mandate) values(ctx,product,'{}','Synthetic test mandate');
 insert into public.billing_hsp_assessments(folio_id,charge_id,context_id) values(folio,hsp,ctx);
 insert into public.billing_stripe_accounts(organization_id,platform_account,connected_account,enabled,charge_mode) values(org,'acct_testPlatform','acct_syntheticDestinationReversal',true,'destination');
 insert into public.billing_stripe_attempts(id,organization_id,context_id,folio_id,payer_account_id,actor_id,platform_account,connected_account,amount,currency,request_id,charge_mode,application_fee_amount)
 values(stripe_attempt,org,ctx,folio,customer,staff_profile,'acct_testPlatform','acct_syntheticDestinationReversal',50.25,'CAD',request,'destination',0);
 object:=jsonb_build_object('object','payment_intent','id','pi_'||replace(stripe_attempt::text,'-',''),'livemode',false,'capture_method','automatic',
 'currency','cad','amount',5025,'amount_received',5025,'status','succeeded',
 'transfer_data',jsonb_build_object('destination','acct_syntheticDestinationReversal'));
 result:=public.billing_stripe_observe(stripe_attempt,'acct_testPlatform',object);
 if result->>'state'<>'succeeded' or result->>'receipt_id' is null then raise exception 'Stripe success must reconcile after reservation replacement';end if;
 perform public.billing_stripe_observe(stripe_attempt,'acct_testPlatform',object);
 if (select count(*) from public.billing_payments where folio_id=folio and method='stripe_test')<>1
   or (select count(*) from public.billing_documents where folio_id=folio and kind='receipt')<>2 then raise exception 'Reconciliation replay duplicated payment/receipt';end if;
 if exists(select 1 from public.billing_payment_allocations a join public.reservation_billing_reversals r on a.charge_id in(r.charge_id,r.credit_id) where a.folio_id=folio)
   or (select sum(a.amount) from public.billing_payment_allocations a join public.billing_payments p on p.id=a.payment_id where p.folio_id=folio and p.method='stripe_test')<>50.25
   or (public.billing_snapshot(folio)->>'balance')::numeric<>0 then raise exception 'Payment must allocate fully to active lines only';end if;
 if has_function_privilege('authenticated','public.billing_stripe_observe(uuid,text,jsonb)','EXECUTE') or has_function_privilege('anon','public.billing_stripe_observe(uuid,text,jsonb)','EXECUTE') then raise exception 'Provider observation must stay private';end if;
end $$;
rollback;
