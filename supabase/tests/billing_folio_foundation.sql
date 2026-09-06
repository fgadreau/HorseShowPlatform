-- Run ONLY with scripts/billing/test-sql-local.mjs (disposable clone).
-- Real PostgreSQL roles/RLS, no mock auth helper and no tax/legal presets.
create table public.billing_test_fixture(key text primary key,value jsonb not null);
grant all on public.billing_test_fixture to authenticated;
create function public.billing_test_error(q text,expected text) returns void language plpgsql as $$
begin
 begin execute q; exception when others then
  if position(expected in sqlerrm)>0 then return; end if;
  raise exception 'Unexpected error, expected %: %',expected,sqlerrm;
 end;
 raise exception 'Expected rejection: %',expected;
end $$;
insert into public.organizations(id,name,slug,currency,tax_name,tax_number,secondary_tax_name,secondary_tax_number)
 values('f3000000-0000-0000-0000-000000000001','Billing TEST ONLY','billing-fixture-local','CAD','Tax A','TEST-A','Tax B','TEST-B');
insert into public.organization_members(organization_id,user_id,role) values
 ('f3000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','admin'),
 ('f3000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','secretary');
insert into public.contacts(id,type,first_name,last_name,address,company_name)
 values('f6000000-0000-0000-0000-000000000001','payer','Client','Without Login','Original address','Original company');
insert into public.organization_disciplines(id,organization_id,discipline_id)
 select 'f7000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001',id from public.disciplines order by id limit 1;
insert into public.directory_contacts(organization_discipline_id,contact_id)
 values('f7000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000001');
insert into public.organization_products(id,organization_id,name,category,default_price,tax_applicable) values
 ('f5000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','Test taxable sale','merch',100,true),
 ('f5000000-0000-0000-0000-000000000002','f3000000-0000-0000-0000-000000000001','Test exempt sale','merch',40,false);
insert into public.shows(id,organization_id,name,slug,start_date,end_date,default_currency)
 values('f4000000-0000-0000-0000-000000000001','f3000000-0000-0000-0000-000000000001','Billing test show','billing-test-show',current_date,current_date+2,'CAD');

set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$
declare org uuid:='f3000000-0000-0000-0000-000000000001'; customer uuid; typ uuid; ctx uuid; race uuid; eventctx uuid;
 config jsonb:='{"name_fr":"Compte boutique","name_en":"Shop account","account_prefix":"TEST-ACC","receipt_prefix":"TEST-RCPT","invoice_prefix":"TEST-INV","closing_policy":"manual","payment_policy":"received_only","activation_policy":"allocated_received","categories":["merch"],"staff_roles":["admin","secretary"]}';
 products jsonb:='[{"product_id":"f5000000-0000-0000-0000-000000000001","unit_price":100,"taxes":[{"code":"A","name":"Tax A","jurisdiction":"TEST","rate":5},{"code":"B","name":"Tax B","jurisdiction":"TEST","rate":10}]},{"product_id":"f5000000-0000-0000-0000-000000000002","unit_price":40,"taxes":[],"exemption_reason":"Fictitious exemption for test"}]';
 cmd jsonb; r jsonb; again jsonb; account uuid; ch1 uuid; ch2 uuid; receipt uuid; statement uuid; finaldoc uuid; version bigint;
 payment jsonb; snap jsonb;
begin
 typ:=public.billing_create_context_type(org,'shop',1,config);
 perform public.billing_test_error(format('select public.billing_create_context(%L,null,%L,%L,%L,%L::jsonb,now(),null,%L::jsonb)',org,typ,'unsupported-tax','CAD','{}',jsonb_set(products,'{0,taxes,0,compound}','true')),'BILLING_UNSUPPORTED_TAX_CONFIG');
 ctx:=public.billing_create_context(org,null,typ,'shop-2027','CAD','{}',now()-interval '1 day',null,products);
 race:=public.billing_create_context(org,null,typ,'shop-race','CAD','{}',now()-interval '1 day',null,products);
 eventctx:=public.billing_create_context(org,'f4000000-0000-0000-0000-000000000001',null,null,'CAD',config,now()-interval '1 day',null,products);
 customer:=public.billing_get_customer_account(org,'f6000000-0000-0000-0000-000000000001');
 assert customer=public.billing_get_customer_account(org,'f6000000-0000-0000-0000-000000000001'),'stable customer';
 cmd:=jsonb_build_object('context_id',ctx,'payer_customer_account_id',customer,'product_id','f5000000-0000-0000-0000-000000000001','quantity',1,'source_id',gen_random_uuid());
 r:=public.add_billing_sale('fa000000-0000-0000-0000-000000000001',cmd);
 again:=public.add_billing_sale('fa000000-0000-0000-0000-000000000001',cmd);
 assert r=again,'idempotent response';
 account:=(r#>>'{account,folio_id}')::uuid; ch1:=(r->>'charge_id')::uuid;
 assert r#>>'{account,total}'='115.00','two taxes';
 assert jsonb_array_length(r#>'{account,charges,0,taxes}')=2,'tax detail';
 assert r#>>'{account,payer,company_name}'='Original company','payer snapshot';
 assert r#>>'{account,seller,tax_number_1}'='TEST-A','actual seller tax fields';
 assert r#>>'{account,state}'='open' and r->>'document_id' is null,'sale is not invoice';
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)','fa000000-0000-0000-0000-000000000001',cmd||'{"quantity":2}'),'BILLING_IDEMPOTENCY_CONFLICT');
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)',gen_random_uuid(),cmd||'{"currency":"USD"}'),'BILLING_UNEXPECTED_FIELD');
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)',gen_random_uuid(),cmd),'billing_charges_organization_id_source_type_source_id_key');
 cmd:=cmd||jsonb_build_object('product_id','f5000000-0000-0000-0000-000000000002','source_id',gen_random_uuid());
 r:=public.add_billing_sale(gen_random_uuid(),cmd); ch2:=(r->>'charge_id')::uuid;
 assert (r#>>'{account,folio_id}')::uuid=account,'same account';
 assert r#>>'{account,subtotal}'='140.00' and r#>>'{account,total}'='155.00','mixed taxable/exempt';
 assert r#>>'{account,version}'='2','version';
 payment:=jsonb_build_object('folio_id',account,'version',2,'amount',50,'method','cash','received_at',now(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',ch1,'amount',50)));
 r:=public.record_billing_payment('fb000000-0000-0000-0000-000000000001',payment);
 assert r=public.record_billing_payment('fb000000-0000-0000-0000-000000000001',payment),'payment retry';
 assert r#>>'{account,balance}'='105.00','partial balance';
 assert r#>>'{account,state}'='open','payment does not close';
 receipt:=(r->>'document_id')::uuid;
 assert r#>>'{document,kind}'='receipt','receipt kind';
 assert r#>>'{document,snapshot,receipt_payment,amount}'='50.00','individual receipt amount';
 assert r#>>'{document,snapshot,account_number}'=r#>>'{account,account_number}','account ref on receipt';
 assert r#>>'{document,number}'<>r#>>'{account,account_number}','distinct numbering';
 payment:=payment||'{"version":3,"method":"etransfer","reference":"TRANSFER-001","amount":105}';
 payment:=payment||jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('charge_id',ch1,'amount',65),jsonb_build_object('charge_id',ch2,'amount',40)));
 perform public.billing_test_error(format('select public.record_billing_payment(%L,%L::jsonb)',gen_random_uuid(),payment||'{"confirmed":false}'),'BILLING_PAYMENT_NOT_CONFIRMED_OR_INVALID');
 perform public.billing_test_error(format('select public.record_billing_payment(%L,%L::jsonb)',gen_random_uuid(),payment||'{"amount":106}'),'BILLING_PAYMENT_EXCEEDS_BALANCE');
 r:=public.record_billing_payment(gen_random_uuid(),payment);
 assert r#>>'{account,balance}'='0.00','settled';
 assert jsonb_array_length(r#>'{account,payments}')=2,'two received payments';
 r:=public.get_billing_statement(gen_random_uuid(),account); statement:=(r->>'document_id')::uuid;
 assert r#>>'{document,kind}'='statement' and r#>>'{document,number}' is null,'provisional';
 perform public.billing_test_error(format('select public.finalize_billing_folio(%L,%L,3)',gen_random_uuid(),account),'BILLING_STALE_VERSION');
 r:=public.finalize_billing_folio('fc000000-0000-0000-0000-000000000001',account,4,statement); finaldoc:=(r->>'document_id')::uuid;
 assert r#>>'{account,state}'='closed','manual close';
 assert r#>>'{document,kind}'='invoice' and r#>>'{document,number}' like 'TEST-INV-%','final invoice numbered';
 assert r=public.finalize_billing_folio('fc000000-0000-0000-0000-000000000001',account,4,statement),'final retry stable';
 again:=public.finalize_billing_folio(gen_random_uuid(),account,5);
 assert (again->>'document_id')::uuid=finaldoc,'different key cannot create second final';
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)',gen_random_uuid(),cmd||jsonb_build_object('source_id',gen_random_uuid())),'BILLING_FOLIO_CLOSED');
 perform public.billing_test_error(format('update public.billing_documents set snapshot=%L where id=%L','{}',finaldoc),'permission denied');
 perform public.billing_test_error(format('insert into public.billing_folios default values'),'permission denied');
 insert into public.billing_test_fixture values('documents',jsonb_build_object('receipt',receipt,'statement',statement,'invoice',finaldoc,'account',account,'snapshot',public.get_billing_document(finaldoc)));
 insert into public.billing_test_fixture values('race',jsonb_build_object('context',race,'customer',customer,'product','f5000000-0000-0000-0000-000000000001','org',org,
 'admin','10000000-0000-0000-0000-000000000002','secretary','10000000-0000-0000-0000-000000000003'));
 insert into public.billing_test_fixture values('config',jsonb_build_object('context',ctx,'event',eventctx,'type',typ,'config',config,'products',products,'customer',customer));
end $$;
reset role;
-- Immutable even to privileged SQL (not merely RLS/UI). Historic base rows untouched.
select public.billing_test_error('update public.billing_documents set snapshot=''{}''','BILLING_IMMUTABLE');
select public.billing_test_error('delete from public.billing_payments','BILLING_IMMUTABLE');
select public.billing_test_error('update public.billing_contexts set currency=''USD''','BILLING_IMMUTABLE');
select public.billing_test_error('update public.shows set default_currency=''USD'' where id=''f4000000-0000-0000-0000-000000000001''','BILLING_CONTEXT_CURRENCY_FROZEN');
select public.billing_test_error('insert into public.manual_sales(organization_id,payer_contact_id,sold_by_user_id,description) values(''f3000000-0000-0000-0000-000000000001'',''f6000000-0000-0000-0000-000000000001'',''20000000-0000-0000-0000-000000000002'',''Duplicate writer'')','BILLING_LEGACY_CONTEXT_ADOPTED');
update public.contacts set company_name='Changed company',address='Changed address' where id='f6000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$
declare ids jsonb; d jsonb;
begin
 select value into ids from public.billing_test_fixture where key='documents';
 assert public.get_billing_document((ids->>'invoice')::uuid)=ids->'snapshot','final snapshot immutable after contact change';
 d:=public.get_billing_document((ids->>'statement')::uuid);
 assert d#>>'{snapshot,payer,company_name}'='Original company','old statement immutable';
 d:=public.get_billing_statement(gen_random_uuid(),(ids->>'account')::uuid);
 assert d#>>'{document,snapshot,payer,company_name}'='Changed company','new statement new snapshot';
end $$;
-- Agent/client/other association cannot create sales or view another payer's finance.
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$
declare ids jsonb; cfg jsonb;
begin
 select value into ids from public.billing_test_fixture where key='documents';
 select value into cfg from public.billing_test_fixture where key='config';
 assert public.get_billing_document((ids->>'invoice')::uuid) is null,'no document IDOR';
 assert not exists(select 1 from public.billing_folios),'RLS hidden';
 perform public.billing_test_error(format('select public.get_billing_statement(%L,%L)',gen_random_uuid(),ids->>'account'),'BILLING_FORBIDDEN');
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)',gen_random_uuid(),jsonb_build_object('context_id',cfg->>'context','payer_customer_account_id',cfg->>'customer','product_id','f5000000-0000-0000-0000-000000000001','quantity',1,'source_id',gen_random_uuid())),'BILLING_FORBIDDEN');
end $$;
reset role;
-- A login may be attached later without changing payer/account IDs.
update public.contacts set linked_user_id='20000000-0000-0000-0000-000000000004' where id='f6000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare ids jsonb; begin
 select value into ids from public.billing_test_fixture where key='documents';
 assert public.get_billing_document((ids->>'invoice')::uuid) is not null,'payer can read own document';
 perform public.billing_test_error(format('select public.finalize_billing_folio(%L,%L,5)',gen_random_uuid(),ids->>'account'),'BILLING_FORBIDDEN');
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$
declare cfg jsonb; ids jsonb; cmd jsonb; r jsonb; f uuid; ch uuid; p jsonb; d jsonb; snap jsonb; expired uuid;
begin
 select value into cfg from public.billing_test_fixture where key='config';
 select value into ids from public.billing_test_fixture where key='documents';
 cmd:=jsonb_build_object('context_id',cfg->>'event','payer_customer_account_id',cfg->>'customer','product_id','f5000000-0000-0000-0000-000000000001','quantity',1,'source_id',gen_random_uuid());
 r:=public.add_billing_sale(gen_random_uuid(),cmd);f:=(r#>>'{account,folio_id}')::uuid;ch:=(r->>'charge_id')::uuid;
 assert f<>(ids->>'account')::uuid,'event account distinct from non-event';
 assert r#>>'{account,currency}'='CAD','currency inherited';
 p:=jsonb_build_object('folio_id',f,'version',1,'amount',10,'method','etransfer','reference',' TRANSFER-001 ','received_at',now(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',ch,'amount',10)));
 perform public.billing_test_error(format('select public.record_billing_payment(%L,%L::jsonb)',gen_random_uuid(),p),'billing_etransfer_reference_key');
 p:=p||'{"method":"cash","reference":null}';
 perform public.billing_test_error(format('select public.record_billing_payment(%L,%L::jsonb)',gen_random_uuid(),p||jsonb_build_object('allocations',jsonb_build_array(jsonb_build_object('charge_id',gen_random_uuid(),'amount',10)))),'BILLING_INVALID_ALLOCATION');
 perform public.billing_test_error(format('select public.record_billing_payment(%L,%L::jsonb)',gen_random_uuid(),p||'{"amount":11}'),'BILLING_ALLOCATION_TOTAL_MISMATCH');
 r:=public.record_billing_payment(gen_random_uuid(),p);
 assert r#>>'{account,balance}'='105.00','rejected payment attempts had no effects';
 d:=public.get_billing_statement(gen_random_uuid(),f);
 d:=public.finalize_billing_folio(gen_random_uuid(),f,2,(d->>'document_id')::uuid);
 assert d#>>'{document,snapshot,balance}'='105.00','manual finalization with outstanding balance';
 snap:=d->'document';
 p:=p||jsonb_build_object('version',3,'amount',105,'allocations',jsonb_build_array(jsonb_build_object('charge_id',ch,'amount',105)));
 r:=public.record_billing_payment(gen_random_uuid(),p);
 assert r#>>'{account,balance}'='0.00' and r#>>'{account,state}'='closed','collection after closure';
 assert public.get_billing_document((d->>'document_id')::uuid)=snap,'later collection does not rewrite invoice';
 expired:=public.billing_create_context('f3000000-0000-0000-0000-000000000001',null,(cfg->>'type')::uuid,'closed-activity','USD','{}',now()-interval '3 days',now()-interval '1 day',cfg->'products');
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)',gen_random_uuid(),cmd||jsonb_build_object('context_id',expired,'source_id',gen_random_uuid())),'BILLING_CONTEXT_NOT_OPEN');
 assert not exists(select 1 from public.billing_folios where billing_context_id=expired),'no orphan folio';
end $$;
reset role;
-- All new encashments balance their allocations, exactly one logical receipt each.
do $$ begin
 assert not exists(select 1 from public.billing_payments p where p.amount<>(select coalesce(sum(a.amount),0) from public.billing_payment_allocations a where a.payment_id=p.id)),'allocation invariant';
 assert not exists(select 1 from public.billing_payments p where (select count(*) from public.billing_receipts r where r.payment_id=p.id)<>1),'one receipt per payment';
 assert (select count(*) from public.billing_final_invoices)=2,'unique final per context/payer';
 assert not exists(select 1 from public.billing_documents d where not exists(select 1 from public.billing_outbox o where o.document_id=d.id)),'durable render requests';
end $$;

-- Show-only secretary: allowed on this show, denied for the association's non-event scope.
insert into public.show_roles(show_id,user_id,role) values('f4000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000005','secretary');
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
do $$ declare cfg jsonb; c uuid; begin
 select value into cfg from public.billing_test_fixture where key='config';
 c:=public.billing_get_customer_account('f3000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000001',(cfg->>'event')::uuid);
 assert c=(cfg->>'customer')::uuid,'show secretary resolves stable payer';
 perform public.billing_test_error(format('select public.billing_get_customer_account(%L,%L,%L)','f3000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000001',cfg->>'context'),'BILLING_FORBIDDEN');
end $$;
reset role;
delete from public.show_roles where show_id='f4000000-0000-0000-0000-000000000001' and user_id='20000000-0000-0000-0000-000000000005';
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
do $$ declare cfg jsonb; begin
 select value into cfg from public.billing_test_fixture where key='config';
 perform public.billing_test_error(format('select public.billing_get_customer_account(%L,%L,%L)','f3000000-0000-0000-0000-000000000001','f6000000-0000-0000-0000-000000000001',cfg->>'event'),'BILLING_FORBIDDEN');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000006';
do $$ declare ids jsonb; begin
 select value into ids from public.billing_test_fixture where key='documents';
 assert public.get_billing_document((ids->>'invoice')::uuid) is null,'other association admin denied';
 perform public.billing_test_error(format('select public.get_billing_statement(%L,%L)',gen_random_uuid(),ids->>'account'),'BILLING_FORBIDDEN');
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare cfg jsonb; ctx uuid; r jsonb; f uuid; begin
 select value into cfg from public.billing_test_fixture where key='config';
 ctx:=public.billing_create_context('f3000000-0000-0000-0000-000000000001',null,(cfg->>'type')::uuid,'zero-recap-usd','USD','{}',now()-interval '1 day',null,cfg->'products');
 r:=public.add_billing_sale(gen_random_uuid(),jsonb_build_object('context_id',ctx,'payer_customer_account_id',cfg->>'customer','product_id','f5000000-0000-0000-0000-000000000001','quantity',1,'unit_price',0,'source_id',gen_random_uuid()));
 assert r#>>'{account,currency}'='USD' and r#>>'{account,total}'='0.00','free operation opens numbered context account';
 f:=(r#>>'{account,folio_id}')::uuid;
 perform public.billing_test_error(format('select public.finalize_billing_folio(%L,%L,1)',gen_random_uuid(),f),'BILLING_RECAP_REQUIRED');
 r:=public.get_billing_statement(gen_random_uuid(),f);
 insert into public.billing_test_fixture values('recap',jsonb_build_object('folio',f,'document',r->>'document_id'));
end $$;
reset role;
update public.contacts set company_name=null where id='f6000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare ids jsonb; r jsonb; begin
 select value into ids from public.billing_test_fixture where key='recap';
 perform public.billing_test_error(format('select public.finalize_billing_folio(%L,%L,1,%L)',gen_random_uuid(),ids->>'folio',ids->>'document'),'BILLING_STALE_RECAP');
 r:=public.get_billing_statement(gen_random_uuid(),(ids->>'folio')::uuid);
 assert r#>'{document,snapshot,payer,company_name}'='null'::jsonb,'company optional';
 r:=public.finalize_billing_folio(gen_random_uuid(),(ids->>'folio')::uuid,1,(r->>'document_id')::uuid);
 assert r#>>'{account,state}'='closed','fresh recap finalizes free account';
end $$;
reset role;

-- A type's narrower staff roles restrict financial READ as well as write.
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare cfg jsonb; typ uuid; ctx uuid; r jsonb; begin
 select value into cfg from public.billing_test_fixture where key='config';
 typ:=public.billing_create_context_type('f3000000-0000-0000-0000-000000000001','shop',2,(cfg->'config')||'{"staff_roles":["admin"]}');
 ctx:=public.billing_create_context('f3000000-0000-0000-0000-000000000001',null,typ,'admin-only','CAD','{}',now()-interval '1 day',null,cfg->'products');
 r:=public.add_billing_sale(gen_random_uuid(),jsonb_build_object('context_id',ctx,'payer_customer_account_id',cfg->>'customer','product_id','f5000000-0000-0000-0000-000000000001','quantity',1,'unit_price',0,'source_id',gen_random_uuid()));
 r:=public.get_billing_statement(gen_random_uuid(),(r#>>'{account,folio_id}')::uuid);
 insert into public.billing_test_fixture values('admin-only',r);
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$ declare r jsonb; begin
 select value into r from public.billing_test_fixture where key='admin-only';
 assert public.get_billing_document((r->>'document_id')::uuid) is null,'type restricts document read';
 assert public.find_billing_account('f3000000-0000-0000-0000-000000000001',r#>>'{account,account_number}') is null,'type restricts number lookup';
 perform public.billing_test_error(format('select public.get_billing_statement(%L,%L)',gen_random_uuid(),r#>>'{account,folio_id}'),'BILLING_FORBIDDEN');
end $$;
reset role;
