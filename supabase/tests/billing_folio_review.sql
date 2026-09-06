-- Follow billing_folio_foundation.sql in a disposable local database only.
-- Recursively inspect keys, including nested arrays (not a substring search over JSON text).
create function public.billing_test_is_public(p jsonb) returns boolean language plpgsql immutable as $$
declare k text; v jsonb;
begin
 if jsonb_typeof(p)='object' then
  for k,v in select * from jsonb_each(p) loop
   if k=any(array['authorization_snapshot','authorization','actor_id','created_by','closed_by','role','permissions','request_id','claim_token','worker_id','source_id','source_type','version'])
    or not public.billing_test_is_public(v) then return false; end if;
  end loop;
 elsif jsonb_typeof(p)='array' then
  for v in select * from jsonb_array_elements(p) loop if not public.billing_test_is_public(v) then return false; end if; end loop;
 end if;
 return true;
end $$;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$
declare cfg jsonb; products jsonb; ctx uuid; r jsonb; a jsonb; cmd jsonb; org uuid:='f3000000-0000-0000-0000-000000000001';
begin
 select value into cfg from public.billing_test_fixture where key='config';
 -- Explicit inverse of the legacy flags: true -> exempt, false -> taxable.
 products:=jsonb_build_array(
  (cfg#>'{products,0}')||jsonb_build_object('taxes','[]'::jsonb,'exemption_reason','Explicit contextual exemption'),
  ((cfg#>'{products,1}')-'exemption_reason')||jsonb_build_object('taxes',cfg#>'{products,0,taxes}'));
 ctx:=public.billing_create_context(org,null,(cfg->>'type')::uuid,'explicit-tax-policy','CAD','{}',now()-interval '1 day',null,products);
 cmd:=jsonb_build_object('context_id',ctx,'payer_customer_account_id',cfg->>'customer','product_id','f5000000-0000-0000-0000-000000000001','quantity',1,'source_id',gen_random_uuid());
 r:=public.add_billing_sale(gen_random_uuid(),cmd);
 perform public.billing_test_assert(r#>>'{account,tax_amount}'='0.00','legacy true can be explicitly exempt');
 perform public.billing_test_assert(r#>>'{account,charges,0,exemption_reason}'='Explicit contextual exemption','reason retained');
 cmd:=cmd||jsonb_build_object('product_id','f5000000-0000-0000-0000-000000000002','source_id',gen_random_uuid());
 r:=public.add_billing_sale(gen_random_uuid(),cmd);
 perform public.billing_test_assert(r#>>'{account,tax_amount}'='6.00','legacy false can have explicit contextual taxes');
 perform public.billing_test_assert(r#>>'{account,total}'='146.00','context prices and taxes');
 a:=public.get_billing_statement(gen_random_uuid(),(r#>>'{account,folio_id}')::uuid);
 perform public.billing_test_assert(a#>>'{document,snapshot,charges,1,unit_price}'='40.00','document freezes context price');
 insert into public.billing_test_fixture values('review-tax',jsonb_build_object('command',cmd,'document',a->'document','folio',r#>>'{account,folio_id}'));
 perform public.billing_test_error(format('select public.billing_create_context(%L,null,%L,%L,%L,%L::jsonb,now(),null,%L::jsonb)',org,cfg->>'type','ambiguous-tax','CAD','{}',jsonb_set(products,'{1,exemption_reason}','"contradictory"')),'BILLING_TAX_CONFIG_REQUIRED');
 perform public.billing_test_error(format('select public.billing_create_context(%L,null,%L,%L,%L,%L::jsonb,now(),null,%L::jsonb)',org,cfg->>'type','missing-tax','CAD','{}',jsonb_set(products,'{0,exemption_reason}','"  "')),'BILLING_TAX_CONFIG_REQUIRED');
 perform public.billing_test_error(format('select public.billing_create_context(%L,null,%L,%L,%L,%L::jsonb,now(),null,%L::jsonb)',org,cfg->>'type','absent-tax','CAD','{}',jsonb_build_array((products->0)-'taxes')),'BILLING_TAX_CONFIG_REQUIRED');
 -- The administrative RPC retains full evidence, unlike financial projections.
 a:=public.billing_get_audit((r#>>'{account,folio_id}')::uuid);
 perform public.billing_test_assert(a#>>'{charges,0,authorization_snapshot,kind}'='organization_member','staff retains role evidence');
 perform public.billing_test_assert(a#>>'{charges,0,authorization_snapshot,id}' is not null,'staff retains role row identifier');
 perform public.billing_test_assert(a#>>'{events,0,actor_id}'='20000000-0000-0000-0000-000000000002','audit retains exact author');
end $$;
reset role;
update public.organization_products set tax_applicable=not tax_applicable,default_price=999 where organization_id='f3000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$ declare f jsonb; r jsonb; cmd jsonb; begin
 select value into f from public.billing_test_fixture where key='review-tax';cmd:=f->'command';
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)',gen_random_uuid(),cmd||'{"unit_price":1}'),'BILLING_UNEXPECTED_FIELD');
 perform public.billing_test_error(format('select public.add_billing_sale(%L,%L::jsonb)',gen_random_uuid(),cmd||'{"unit_price":0}'),'BILLING_UNEXPECTED_FIELD');
 r:=public.add_billing_sale(gen_random_uuid(),cmd||jsonb_build_object('source_id',gen_random_uuid()));
 perform public.billing_test_assert(r#>>'{account,total}'='192.00','legacy tax/price changes do not change context');
 perform public.billing_test_assert(r#>>'{account,charges,2,unit_price}'='40.00','secretary receives configured price only');
 perform public.billing_test_assert(public.get_billing_document((f#>>'{document,id}')::uuid)=f->'document','legacy changes leave documents byte-identical');
 perform public.billing_test_assert(public.billing_get_audit((f->>'folio')::uuid)#>>'{charges,2,actor_id}'='20000000-0000-0000-0000-000000000003','second secretary evidence retained');
end $$;
-- REAL payer session; both RPC and invoker-view/direct-column paths are checked.
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare ids jsonb; d jsonb; a jsonb; k text; n text; begin
 select value into ids from public.billing_test_fixture where key='documents';
 foreach k in array array['receipt','statement','invoice'] loop
  d:=public.get_billing_document((ids->>k)::uuid);
  perform public.billing_test_assert(d is not null,'payer can retrieve each own financial document');
  perform public.billing_test_assert(public.billing_test_is_public(d),'document contains no internal keys at any depth');
  perform public.billing_test_assert((d-array['id','organization_id','folio_id','currency','kind','number','payment_id','snapshot','created_at'])='{}'::jsonb,'document envelope allowlist');
  perform public.billing_test_assert(d#>>'{snapshot,payer,last_name}'='Without Login','payer identity visible');
  perform public.billing_test_assert(d#>>'{snapshot,total}'='155.00','financial amount visible');
 end loop;
 d:=public.get_billing_document((ids->>'receipt')::uuid);
 perform public.billing_test_assert(d#>>'{snapshot,receipt_payment,amount}'='50.00','own receipt amount visible');
 perform public.billing_test_assert(d#>>'{snapshot,receipt_payment,method}'='cash','own payment method visible');
 perform public.billing_test_assert(jsonb_array_length(d#>'{snapshot,charges,0,taxes}')=2,'tax details visible');
 n:=d#>>'{snapshot,account_number}';a:=public.find_billing_account('f3000000-0000-0000-0000-000000000001',n);
 perform public.billing_test_assert(a->>'balance'='0.00','current account balance visible');
 perform public.billing_test_assert(public.billing_test_is_public(a),'account projection contains no internal keys');
 perform public.billing_test_assert((select public.billing_test_is_public(to_jsonb(v)) from public.billing_receipts v where id=(ids->>'receipt')::uuid),'receipt view expurgated');
 perform public.billing_test_assert((select public.billing_test_is_public(to_jsonb(v)) from public.billing_statements v where id=(ids->>'statement')::uuid),'statement view expurgated');
 perform public.billing_test_assert((select public.billing_test_is_public(to_jsonb(v)) from public.billing_final_invoices v where id=(ids->>'invoice')::uuid),'invoice view expurgated');
 perform public.billing_test_error('select actor_id from public.billing_documents','permission denied');
 perform public.billing_test_error('select created_by from public.billing_folios','permission denied');
 perform public.billing_test_error('select version from public.billing_folios','permission denied');
 perform public.billing_test_error('select authorization_snapshot from public.billing_charges','permission denied');
 perform public.billing_test_error('select * from public.billing_audit_events','permission denied');
 perform public.billing_test_error(format('select public.billing_get_audit(%L)',ids->>'account'),'BILLING_FORBIDDEN');
 perform public.billing_test_error(format('select public.billing_document_payload(%L)',ids->>'invoice'),'permission denied');
 perform public.billing_test_error('select public.billing_claim_document(''payer'')','permission denied');
 perform public.billing_test_error('select * from public.billing_outbox_events','permission denied');
end $$;
reset role;

-- Outbox role is a server capability, no file/worker is produced by these tests.
grant select,insert on public.billing_test_fixture to service_role;
grant execute on function public.billing_test_error(text,text) to service_role;
set role service_role;
do $$ declare ids jsonb; j jsonb; again jsonb; doc uuid; token uuid; begin
 select value into ids from public.billing_test_fixture where key='documents';doc:=(ids->>'receipt')::uuid;
 j:=public.billing_claim_document('test-worker',doc,30);token:=(j->>'claim_token')::uuid;
 perform public.billing_test_assert(j->>'state'='processing' and j->>'attempts'='1','first claim');
 perform public.billing_test_assert(j->>'claimed_at' is not null and j->>'lease_until' is not null,'durable lease');
 perform public.billing_test_assert(public.billing_claim_document('other-worker',doc,30) is null,'cannot double claim');
 perform public.billing_test_error(format('select public.billing_finish_document(%L,%L,true,%L)',doc,gen_random_uuid(),'test-result'),'BILLING_OUTBOX_STALE_CLAIM');
 j:=public.billing_finish_document(doc,token,false,null,'Fictitious render failure',0);
 perform public.billing_test_assert(j->>'state'='failed' and j->>'last_error'='Fictitious render failure','durable failure');
 perform public.billing_test_assert(j->>'next_attempt_at' is not null and j->>'finished_at' is not null,'retry schedule');
 perform public.billing_test_assert(public.billing_finish_document(doc,token,false,null,'Fictitious render failure',0)=j,'failed completion retry idempotent');
 j:=public.billing_claim_document('test-worker-retry',doc,30);
 perform public.billing_test_assert(j->>'attempts'='2' and (j->>'claim_token')::uuid<>token,'retry has new fencing token');
 perform public.billing_test_error(format('select public.billing_finish_document(%L,%L,true,%L)',doc,token,'obsolete-result'),'BILLING_OUTBOX_STALE_CLAIM');
 token:=(j->>'claim_token')::uuid;j:=public.billing_finish_document(doc,token,true,'test-only:no-file-produced');
 perform public.billing_test_assert(j->>'state'='completed' and j->>'result_ref'='test-only:no-file-produced','durable result reference');
 perform public.billing_test_assert(public.billing_finish_document(doc,token,true,'test-only:no-file-produced')=j,'success retry idempotent');
 perform public.billing_test_assert(public.billing_claim_document('test-worker',doc,30) is null,'completed not reclaimed');
 perform public.billing_test_error('update public.billing_outbox set state=''pending''','permission denied');
 doc:=(ids->>'statement')::uuid;j:=public.billing_claim_document('interrupted-worker',doc,1);token:=(j->>'claim_token')::uuid;
 perform pg_sleep(1.1);
 j:=public.billing_claim_document('recovery-worker',doc,30);
 perform public.billing_test_assert(j->>'attempts'='2','expired processing lease recovered');
 perform public.billing_test_error(format('select public.billing_finish_document(%L,%L,true,%L)',doc,token,'stale-worker-result'),'BILLING_OUTBOX_STALE_CLAIM');
 j:=public.billing_finish_document(doc,(j->>'claim_token')::uuid,false,null,'Retry later',60);
 perform public.billing_test_assert(public.billing_claim_document('too-early',doc,30) is null,'next attempt date is enforced');
 insert into public.billing_test_fixture values('outbox-review',jsonb_build_object('completed',ids->>'receipt','processing',doc));
end $$;
reset role;
do $$ declare ids jsonb; begin
 select value into ids from public.billing_test_fixture where key='outbox-review';
 perform public.billing_test_assert((select count(*) from public.billing_outbox_events where document_id=(ids->>'completed')::uuid)=5,'pending,processing,failed,processing,completed audited once');
 perform public.billing_test_assert((select count(*) from public.billing_outbox_events where document_id=(ids->>'processing')::uuid)=4,'lease recovery and scheduled failure audited');
 perform public.billing_test_error(format('update public.billing_outbox set state=''pending'' where document_id=%L',ids->>'completed'),'BILLING_OUTBOX_INVALID_TRANSITION');
 perform public.billing_test_error('delete from public.billing_outbox','BILLING_OUTBOX_INVALID_TRANSITION');
 perform public.billing_test_error('delete from public.billing_outbox_events','BILLING_IMMUTABLE');
end $$;
