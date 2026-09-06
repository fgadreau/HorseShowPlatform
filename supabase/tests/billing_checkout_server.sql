-- Real authenticated roles; original 1A fixtures remain available. No Stripe or files.
drop trigger billing_test_opt_in on public.billing_contexts;
update public.contacts set company_name='Fictitious checkout company' where id='f6000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$
declare cfg jsonb; c uuid; f uuid; r jsonb; cmd jsonb; org uuid:='f3000000-0000-0000-0000-000000000001';
begin
 select value into cfg from public.billing_test_fixture where key='config';
 c:=public.billing_create_context(org,null,(cfg->>'type')::uuid,'checkout-demo','CAD','{}',now()-interval '1 day',null,jsonb_set(cfg->'products','{0,unit_price}','0'));
 cmd:=jsonb_build_object('context_id',c,'payer_customer_account_id',cfg->>'customer','product_id','f5000000-0000-0000-0000-000000000001','quantity',1,'source_id',gen_random_uuid());
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)',gen_random_uuid(),cmd),'BILLING_CAPABILITY_DISABLED');
 perform public.billing_test_error(format('select public.billing_set_capabilities(%L,null,true,true,true)',org),'BILLING_FORBIDDEN');
 perform public.billing_set_capabilities(org,c,true,true,true,true,2020);
 r:=public.add_billing_sale(gen_random_uuid(),cmd); f:=(r#>>'{account,folio_id}')::uuid;
 insert into public.billing_test_fixture values('checkout',jsonb_build_object('context',c,'folio',f,'command',cmd,'version',r#>'{account,version}'));
 perform public.billing_test_assert(public.list_billing_accounts(org,jsonb_build_object('context_id',c,'year',2020))->>'total'='1','context financial year filter');
 perform public.billing_test_assert(public.list_billing_accounts(org,jsonb_build_object('context_id',c,'year',2021))->>'total'='0','context excluded from other year');
 perform public.billing_test_error(format('select public.billing_set_capabilities(%L,%L,true,true,true,true,2021)',org,c),'BILLING_YEAR_FROZEN');
 perform public.billing_test_assert(public.list_my_billing_accounts()->>'total'='0','staff personal projection is owner-only');
 perform public.billing_test_assert(public.get_billing_checkout_eligibility(f,false)->>'eligible'='false','end/date or zero is not readiness');
 perform public.billing_set_ready(f,true);
 perform public.billing_test_assert(public.billing_get_close_controls(f)#>>'{attestation,attested_by}'='20000000-0000-0000-0000-000000000002','internal author retained');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; f uuid; r jsonb; again jsonb; k uuid:=gen_random_uuid(); begin
 select value into x from public.billing_test_fixture where key='checkout'; f:=(x->>'folio')::uuid;
 perform public.billing_test_assert(public.list_my_billing_accounts(null,jsonb_build_object('context_id',x->>'context'))->>'total'='1','true payer lists account');
 perform public.billing_test_assert(public.get_billing_account_detail(f,true)#>>'{payer,company_name}' is not null,'company remains payer coordinate');
 perform public.billing_test_error(format('select public.billing_set_ready(%L,true)',f),'BILLING_FORBIDDEN');
 perform public.billing_test_error(format('select public.billing_get_close_controls(%L)',f),'BILLING_FORBIDDEN');
 perform public.billing_test_error('select * from public.billing_close_blocks','permission denied');
 perform public.billing_test_error('select public.billing6_execute_foundation(gen_random_uuid(),''{}'')','permission denied');
 perform public.billing_test_assert(public.get_billing_checkout_eligibility(f)->>'can_prepare'='true','ready zero payer can prepare');
 r:=public.prepare_own_billing_recap(k,f); again:=public.prepare_own_billing_recap(k,f);
 perform public.billing_test_assert(r=again,'recap command retry identical');
 perform public.billing_test_assert(r#>>'{document,kind}'='statement' and r#>'{document,number}'='null'::jsonb,'recap no invoice number');
 perform public.billing_test_assert(r#>>'{document,snapshot,account_number}' is not null,'account reference on recap');
 perform public.billing_test_assert(public.get_billing_checkout_eligibility(f)->>'eligible'='true','current recap makes eligible');
 insert into public.billing_test_fixture values('checkout-recap',r);
end $$;
-- Coordinate edit invalidates recap without changing invoice history.
reset role;
update public.contacts set address='Checkout new coordinate' where id='f6000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; r jsonb; begin
 select value into x from public.billing_test_fixture where key='checkout';select value into r from public.billing_test_fixture where key='checkout-recap';
 perform public.billing_test_error(format('select public.finalize_own_billing_folio(%L,%L,%s,%L)',gen_random_uuid(),x->>'folio',r->>'version',r->>'document_id'),'BILLING_STALE_RECAP');
 perform public.billing_test_assert(public.get_billing_checkout_eligibility((x->>'folio')::uuid)->>'eligible'='false','coordinates stale eligibility');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$ declare x jsonb; f uuid; r jsonb; begin
 select value into x from public.billing_test_fixture where key='checkout';f:=(x->>'folio')::uuid;
 perform public.billing_set_close_block(f,'verification','pending_provider',true,'INTERNAL SECRET');
 perform public.billing_test_assert(public.get_billing_checkout_eligibility(f,false)->>'can_prepare'='false','pending future provider blocks');
 perform public.billing_test_assert(position('INTERNAL SECRET' in public.get_billing_account_detail(f,false)::text)=0,'internal reason absent from financial projection');
 perform public.billing_test_error(format('select public.billing_set_ready(%L,true)',f),'BILLING_BLOCKED');
 perform public.billing_set_close_block(f,'verification','pending_provider',false,'cleared');
 perform public.billing_test_assert(public.billing_get_close_controls(f)#>>'{attestation,ready}'='false','unblocking does not attest');
 perform public.billing_set_ready(f,true);
 r:=public.add_billing_sale(gen_random_uuid(),(x->'command')||jsonb_build_object('source_id',gen_random_uuid()));
 perform public.billing_test_assert(public.billing_get_close_controls(f)#>>'{attestation,ready}'='false','new free sale revokes readiness');
 perform public.billing_set_ready(f,true);
end $$;
-- All non-payer actors (even staff) cannot use the personal command.
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='checkout';
 perform public.billing_test_error(format('select public.prepare_own_billing_recap(%L,%L)',gen_random_uuid(),x->>'folio'),'BILLING_FORBIDDEN');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='checkout';
 perform public.billing_test_assert(public.list_my_billing_accounts()->>'total'='0','unlinked actor has no personal accounts');
 perform public.billing_test_error(format('select public.get_billing_account_detail(%L,true)',x->>'folio'),'BILLING_FORBIDDEN');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; r jsonb; done jsonb; request_key uuid:=gen_random_uuid(); begin
 select value into x from public.billing_test_fixture where key='checkout';
 r:=public.prepare_own_billing_recap(gen_random_uuid(),(x->>'folio')::uuid);
 done:=public.finalize_own_billing_folio(request_key,(x->>'folio')::uuid,(r->>'version')::bigint,(r->>'document_id')::uuid);
 perform public.billing_test_assert(done=public.finalize_own_billing_folio(request_key,(x->>'folio')::uuid,(r->>'version')::bigint,(r->>'document_id')::uuid),'final retry exact durable result');
 perform public.billing_test_assert(done#>>'{document,kind}'='invoice','own checkout creates final invoice');
 perform public.billing_test_error(format('select public.finalize_own_billing_folio(%L,%L,999,%L)',request_key,x->>'folio',r->>'document_id'),'BILLING_IDEMPOTENCY_CONFLICT');
 perform public.billing_test_error(format('select public.finalize_own_billing_folio(%L,%L,%s,%L)',gen_random_uuid(),x->>'folio',r->>'version',r->>'document_id'),'BILLING_NOT_ADMISSIBLE');
 perform public.billing_test_assert(public.get_billing_account_detail((x->>'folio')::uuid,true)->>'state'='closed','closed without any PDF worker');
 insert into public.billing_test_fixture values('checkout-final',done);
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; r jsonb; org uuid:='f3000000-0000-0000-0000-000000000001'; begin
 select value into x from public.billing_test_fixture where key='checkout';select value into r from public.billing_test_fixture where key='checkout-final';
 perform public.billing_test_assert((public.search_billing_finance(org,r#>>'{document,number}')->>'total')::int>=2,'search final reference finds account/document');
 perform public.billing_test_assert(public.list_billing_accounts(org,'{}',1,0)->>'limit'='1','bounded pagination');
 perform public.billing_test_assert(public.list_billing_accounts(org,'{}',1,0)#>>'{items,0,id}'<>public.list_billing_accounts(org,'{}',1,1)#>>'{items,0,id}','stable distinct pages');
 perform public.billing_test_error(format('select public.list_billing_accounts(%L,''{}'',101)',org),'BILLING_INVALID_FILTER');
 perform public.billing_set_capabilities(org,(x->>'context')::uuid,false,false,false,false,2020);
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)',gen_random_uuid(),x->'command'),'BILLING_CAPABILITY_DISABLED');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='checkout';
 perform public.billing_test_assert(public.get_billing_account_detail((x->>'folio')::uuid,true)->>'state'='closed','revocation preserves authorized history');
end $$;
reset role;
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='checkout';
 perform public.billing_test_assert((select count(*) from public.billing_documents where folio_id=(x->>'folio')::uuid and kind='invoice')=1,'exactly one invoice');
 perform public.billing_test_assert((select count(*) from public.billing_outbox where document_id=(select (value->>'document_id')::uuid from public.billing_test_fixture where key='checkout-final'))=1,'one final outbox item');
 perform public.billing_test_assert((select count(*) from public.billing_pilot_organizations where organization_id<>'f3000000-0000-0000-0000-000000000001')=0,'no other association enabled');
end $$;
-- Reusable test factory; runs with the caller's real admin identity.
create function public.billing_test_checkout_account(p_code text,p_price numeric default 0,p_year integer default 2020) returns jsonb language plpgsql as $$
declare cfg jsonb; c uuid; r jsonb; cmd jsonb; org uuid:='f3000000-0000-0000-0000-000000000001';
begin
 select value into cfg from public.billing_test_fixture where key='config';
 c:=public.billing_create_context(org,null,(cfg->>'type')::uuid,p_code,'CAD','{}',now()-interval '1 day',null,jsonb_set(cfg->'products','{0,unit_price}',to_jsonb(p_price)));
 perform public.billing_set_capabilities(org,c,true,true,true,true,p_year);
 cmd:=jsonb_build_object('context_id',c,'payer_customer_account_id',cfg->>'customer','product_id','f5000000-0000-0000-0000-000000000001','quantity',1,'source_id',gen_random_uuid());
 r:=public.add_billing_sale(gen_random_uuid(),cmd);
 return jsonb_build_object('context',c,'folio',r#>>'{account,folio_id}','version',r#>'{account,version}','charge',r->>'charge_id','command',cmd);
end $$;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; y jsonb; r jsonb; cfg jsonb; org uuid:='f3000000-0000-0000-0000-000000000001'; c uuid; begin
 x:=public.billing_test_checkout_account('unqualified',0,null);
 perform public.billing_test_assert(public.list_billing_accounts(org,jsonb_build_object('context_id',x->>'context','unqualified',true))->>'total'='1','unknown year stays unqualified');
 y:=public.billing_test_checkout_account('late-payment',100,2020);
 perform public.billing_set_ready((y->>'folio')::uuid,true);
 insert into public.billing_test_fixture values('checkout-paid',y);
 select value into cfg from public.billing_test_fixture where key='config';
 c:=public.billing_create_context(org,null,(cfg->>'type')::uuid,'usd-checkout','USD','{}',now()-interval '1 day',null,jsonb_set(cfg->'products','{0,unit_price}','0'));
 perform public.billing_set_capabilities(org,c,true,true,true,true,2020);
 perform public.add_billing_sale(gen_random_uuid(),(x->'command')||jsonb_build_object('context_id',c,'source_id',gen_random_uuid()));
 r:=public.get_billing_finance_overview(org,2020);
 perform public.billing_test_assert(jsonb_array_length(r->'groups')=2,'CAD USD aggregated separately');
 perform public.billing_test_assert(public.list_my_billing_accounts(org)->>'total'='0','administrative membership adds no personal access');
 perform public.billing_test_assert(public.list_billing_contexts(org,'non_event',2020)->>'total' is not null,'non-event context list');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='checkout-paid';
 perform public.billing_test_error(format('select public.prepare_own_billing_recap(%L,%L)',gen_random_uuid(),x->>'folio'),'BILLING_NOT_ADMISSIBLE');
 perform public.billing_test_assert((public.list_my_billing_accounts(null,'{"prior_balance":true}')->>'total')::integer>=1,'earlier-year unpaid account discoverable');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$ declare x jsonb; r jsonb; pay jsonb; begin
 select value into x from public.billing_test_fixture where key='checkout-paid';
 pay:=jsonb_build_object('folio_id',x->>'folio','version',x->'version','amount',115,'method','cash','received_at',now(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',x->>'charge','amount',115)));
 r:=public.record_billing_payment(gen_random_uuid(),pay);
 perform public.billing_test_assert(public.billing_get_close_controls((x->>'folio')::uuid)#>>'{attestation,ready}'='true','payment preserves complete-fees attestation');
 perform public.billing_test_assert((r#>>'{account,version}')::bigint>(x->>'version')::bigint,'payment increments recap financial version');
 perform public.billing_test_assert(public.list_billing_accounts('f3000000-0000-0000-0000-000000000001',jsonb_build_object('context_id',x->>'context','year',2020))#>>'{items,0,paid}'='115.00','late receipt stays original year');
 perform public.billing_test_assert((public.search_billing_finance('f3000000-0000-0000-0000-000000000001',r#>>'{document,number}')->>'total')::integer>=2,'receipt number search');
end $$;
reset role;
-- Secretary with ONLY a show role must never see the non-event totals or names.
insert into public.show_roles(show_id,user_id,role) values('f4000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005','secretary');
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
do $$ declare org uuid:='f3000000-0000-0000-0000-000000000001'; x jsonb; begin
 select value into x from public.billing_test_fixture where key='checkout';
 perform public.billing_test_assert(public.list_billing_contexts(org,'non_event')->>'total'='0','show-only role no outside contexts');
 perform public.billing_test_assert(public.list_billing_contexts(org,'event')->>'total'='1','show-only sees only authorized show');
 perform public.billing_test_assert(public.list_billing_accounts(org,jsonb_build_object('context_id',x->>'context'))->>'total'='0','no hidden account counter');
 perform public.billing_test_assert(public.search_billing_finance(org,'Checkout new coordinate')->>'total'='0','search no inaccessible results');
 perform public.billing_test_assert(public.get_billing_finance_overview(org,2020)->'groups'='[]'::jsonb,'no forbidden annual totals');
 perform public.billing_test_error(format('select public.get_billing_account_detail(%L)',x->>'folio'),'BILLING_FORBIDDEN');
end $$;
reset role;
delete from public.show_roles where show_id='f4000000-0000-0000-0000-000000000001' and user_id='20000000-0000-0000-0000-000000000005';
-- Same login, two distinct contacts; a company match confers no rights.
insert into public.contacts(id,type,first_name,last_name,company_name,linked_user_id) values
 ('f6000000-0000-0000-0000-000000000011','payer','Second','Linked','Fictitious checkout company','20000000-0000-0000-0000-000000000004');
insert into public.directory_contacts(organization_discipline_id,contact_id) values('f7000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000011');
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; a uuid; r jsonb; begin
 x:=public.billing_test_checkout_account('multi-contact');
 a:=public.billing_get_customer_account('f3000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000011',(x->>'context')::uuid);
 r:=public.add_billing_sale(gen_random_uuid(),(x->'command')||jsonb_build_object('payer_customer_account_id',a,'source_id',gen_random_uuid()));
 insert into public.billing_test_fixture values('multi-contact',x);
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; r jsonb; begin
 select value into x from public.billing_test_fixture where key='multi-contact';
 r:=public.list_my_billing_accounts(null,jsonb_build_object('context_id',x->>'context'));
 perform public.billing_test_assert(r->>'total'='2','multiple contacts remain two accounts');
 perform public.billing_test_assert(r#>>'{items,0,payer,contact_id}'<>r#>>'{items,1,payer,contact_id}','no merged payer identity');
end $$;
reset role;
-- Archived show enforces the approved rule on the server, not just in projections.
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare cfg jsonb; r jsonb; cmd jsonb; begin
 select value into cfg from public.billing_test_fixture where key='config';
 perform public.billing_set_capabilities('f3000000-0000-0000-0000-000000000001',(cfg->>'event')::uuid,true,true,true,true,null);
 cmd:=jsonb_build_object('context_id',cfg->>'event','payer_customer_account_id',public.billing_get_customer_account('f3000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000011',(cfg->>'event')::uuid),'product_id','f5000000-0000-0000-0000-000000000002','quantity',1,'source_id',gen_random_uuid());
 r:=public.add_billing_sale(gen_random_uuid(),cmd);
 insert into public.billing_test_fixture values('archive',jsonb_build_object('command',cmd,'sale',r));
 perform public.billing_test_assert(public.list_billing_contexts('f3000000-0000-0000-0000-000000000001','event',extract(year from current_date)::integer)->>'total'='1','event year derives from date column');
end $$;
reset role;
update public.shows set status='archived' where id='f4000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; r jsonb; rec jsonb; f uuid; pay jsonb; begin
 select value into x from public.billing_test_fixture where key='archive';f:=(x#>>'{sale,account,folio_id}')::uuid;
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)',gen_random_uuid(),(x->'command')||jsonb_build_object('source_id',gen_random_uuid())),'BILLING_SHOW_ARCHIVED');
 pay:=jsonb_build_object('folio_id',f,'version',x#>'{sale,account,version}','amount',1,'method','cash','received_at',now(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',x#>>'{sale,charge_id}','amount',1)));
 r:=public.record_billing_payment(gen_random_uuid(),pay);
 perform public.billing_test_assert(r->>'payment_id' is not null,'archived show can still receive payment');
 rec:=public.get_billing_statement(gen_random_uuid(),f);
 r:=public.finalize_billing_folio(gen_random_uuid(),f,(r#>>'{account,version}')::bigint,(rec->>'document_id')::uuid);
 perform public.billing_test_assert(r#>>'{account,state}'='closed' and (r#>>'{account,balance}')::numeric>0,'staff closes archived show with balance as 1A permits');
end $$;
reset role;
-- The same unrelated login is owner, agent, rider and beneficiary, yet never the payer.
insert into public.contacts(id,type,first_name,last_name,linked_user_id) values
 ('f6000000-0000-0000-0000-000000000012','payer','Not','Payeur','20000000-0000-0000-0000-000000000005');
insert into public.directory_contacts(organization_discipline_id,contact_id) values('f7000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000012');
insert into public.horses(id,name,primary_owner_contact_id) values('f8000000-0000-0000-0000-000000000012','Checkout Test Horse','f6000000-0000-0000-0000-000000000012');
insert into public.directory_horses(organization_discipline_id,horse_id) values('f7000000-0000-0000-0000-000000000001','f8000000-0000-0000-0000-000000000012');
insert into public.horse_contacts(horse_id,contact_id,role) select 'f8000000-0000-0000-0000-000000000012','f6000000-0000-0000-0000-000000000012',r from unnest(array['owner','agent','rider']) r;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; r jsonb; org uuid:='f3000000-0000-0000-0000-000000000001'; q text; begin
 x:=public.billing_test_checkout_account('identity-roles');
 r:=public.add_billing_sale(gen_random_uuid(),(x->'command')||jsonb_build_object('beneficiary_contact_id','f6000000-0000-0000-0000-000000000012','horse_id','f8000000-0000-0000-0000-000000000012','source_id',gen_random_uuid()));
 insert into public.billing_test_fixture values('identity-roles',x);
 foreach q in array array['Checkout Test Horse','Not Payeur','Fictitious checkout company','Client','Compte boutique'] loop
  perform public.billing_test_assert((public.search_billing_finance(org,q)->>'total')::integer>0,'search by horse, beneficiary, company, payer, context');
 end loop;
 x:=public.billing_test_checkout_account('horse-without-beneficiary');
 perform public.add_billing_sale(gen_random_uuid(),(x->'command')||jsonb_build_object('horse_id','f8000000-0000-0000-0000-000000000012','source_id',gen_random_uuid()));
 perform public.billing_test_assert(public.list_billing_accounts(org,jsonb_build_object('context_id',x->>'context','q','Checkout Test Horse'))->>'total'='1','horse search without beneficiary');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='identity-roles';
 perform public.billing_test_assert(public.list_my_billing_accounts()->>'total'='0','horse owner rider agent beneficiary has no payer accounts');
 perform public.billing_test_error(format('select public.prepare_own_billing_recap(%L,%L)',gen_random_uuid(),x->>'folio'),'BILLING_FORBIDDEN');
 perform public.billing_test_error(format('select public.finalize_own_billing_folio(%L,%L,1,%L)',gen_random_uuid(),x->>'folio',gen_random_uuid()),'BILLING_FORBIDDEN');
end $$;
reset role;
-- A second association is a fixture, never an automatically enabled pilot.
insert into public.organizations(id,name,slug,currency) values('f3000000-0000-0000-0000-000000000002','SECOND TEST ONLY','checkout-isolation-fixture','CAD');
insert into public.organization_members(organization_id,user_id,role) values('f3000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000006','admin');
insert into public.contacts(id,type,first_name,last_name,linked_user_id) values('f6000000-0000-0000-0000-000000000022','payer','Other association','Payer','20000000-0000-0000-0000-000000000006');
insert into public.organization_disciplines(id,organization_id,discipline_id) select 'f7000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000002',id from public.disciplines order by id limit 1;
insert into public.directory_contacts(organization_discipline_id,contact_id) values('f7000000-0000-0000-0000-000000000002','f6000000-0000-0000-0000-000000000022');
insert into public.organization_products(id,organization_id,name,category,default_price,tax_applicable) values('f5000000-0000-0000-0000-000000000022','f3000000-0000-0000-0000-000000000002','Other private product','merch',0,false);
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000006';
do $$ declare cfg jsonb; t uuid; c uuid; org uuid:='f3000000-0000-0000-0000-000000000002'; begin
 select value into cfg from public.billing_test_fixture where key='config';
 t:=public.billing_create_context_type(org,'other',1,cfg->'config');
 c:=public.billing_create_context(org,null,t,'private-context','CAD','{}',now()-interval '1 day',null,'[{"product_id":"f5000000-0000-0000-0000-000000000022","unit_price":0,"taxes":[],"exemption_reason":"TEST ONLY"}]');
 perform public.billing_set_capabilities(org,c,true,false,true,true,2020);
 perform public.billing_test_error(format('select public.billing_get_customer_account(%L,%L,%L)',org,'f6000000-0000-0000-0000-000000000022',c),'BILLING_CAPABILITY_DISABLED');
 insert into public.billing_test_fixture values('other-org',jsonb_build_object('context',c,'org',org));
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
select public.billing_set_capabilities('f3000000-0000-0000-0000-000000000002',null,true,true,true);
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000006';
do $$ declare x jsonb; a uuid; r jsonb; f uuid; begin
 select value into x from public.billing_test_fixture where key='other-org';
 a:=public.billing_get_customer_account((x->>'org')::uuid,'f6000000-0000-0000-0000-000000000022',(x->>'context')::uuid);
 r:=public.add_billing_sale(gen_random_uuid(),jsonb_build_object('context_id',x->>'context','payer_customer_account_id',a,'product_id','f5000000-0000-0000-0000-000000000022','quantity',1,'source_id',gen_random_uuid()));f:=(r#>>'{account,folio_id}')::uuid;
 perform public.billing_test_assert(public.list_my_billing_accounts()->>'total'='0','personal capability independently disabled even for admin payer');
 perform public.billing_test_error(format('select public.get_billing_account_detail(%L,true)',f),'BILLING_FORBIDDEN');
 perform public.billing_set_capabilities((x->>'org')::uuid,(x->>'context')::uuid,true,true,true,true);
 perform public.billing_test_assert(public.list_my_billing_accounts()->>'total'='1','explicit personal capability enables owner projection');
 perform public.billing_set_ready(f,true);
 r:=public.prepare_own_billing_recap(gen_random_uuid(),f);
 insert into public.billing_test_fixture values('other-org-account',jsonb_build_object('folio',f,'number',r#>>'{document,snapshot,account_number}','recap',r));
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; org uuid:='f3000000-0000-0000-0000-000000000002'; begin
 select value into x from public.billing_test_fixture where key='other-org-account';
 perform public.billing_test_assert(public.list_billing_accounts(org)->>'total'='0','other association hidden to administrator');
 perform public.billing_test_assert(public.search_billing_finance(org,x->>'number')->>'total'='0','guessed private reference hidden');
 perform public.billing_test_assert(public.get_billing_finance_overview(org)->'groups'='[]'::jsonb,'no other association totals');
 perform public.billing_test_error(format('select public.get_billing_account_detail(%L,true)',x->>'folio'),'BILLING_FORBIDDEN');
 perform public.billing_test_assert(public.get_billing_document((x#>>'{recap,document_id}')::uuid) is null,'private document reference returns no document');
end $$;
reset role;
-- Personal DTOs contain no staff identities, proofs, control tokens or block details.
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; r jsonb; begin
 select value into x from public.billing_test_fixture where key='checkout';
 r:=public.get_billing_account_detail((x->>'folio')::uuid,true);
 perform public.billing_test_assert(public.billing_test_is_public(r-'checkout'),'personal detail and every document expurgated recursively');
 perform public.billing_test_assert(public.billing_test_is_public((r->'checkout')-'version'),'checkout reasons contain no internal evidence');
 perform public.billing_test_assert(position('control_token' in r::text)=0 and position('attested_by' in r::text)=0,'private recap token and staff author absent');
 perform public.billing_test_error('select * from public.billing_payer_recaps','permission denied');
 perform public.billing_test_error('select * from public.billing_checkout_state','permission denied');
 perform public.billing_test_error('update public.billing_context_access set checkout=true','permission denied');
 perform public.billing_test_error('select * from public.billing_audit_events','permission denied');
end $$;
-- Disabling the whole association does not erase historical read rights, but stops checkout.
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
select public.billing_set_capabilities('f3000000-0000-0000-0000-000000000002',null,false,false,false);
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000006';
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='other-org-account';
 perform public.billing_test_assert(public.list_my_billing_accounts()->>'total'='1','association capability withdrawal preserves historical read');
 perform public.billing_test_error(format('select public.finalize_own_billing_folio(%L,%L,%s,%L)',gen_random_uuid(),x->>'folio',x#>>'{recap,version}',x#>>'{recap,document_id}'),'BILLING_NOT_ADMISSIBLE');
end $$;
reset role;
