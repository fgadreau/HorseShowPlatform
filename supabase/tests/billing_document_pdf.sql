-- Fictitious fixtures only; executed after the 1A / checkout / Stripe suites.
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; r jsonb; p jsonb; st jsonb; inv jsonb; receipt jsonb; k uuid:=gen_random_uuid(); cmd jsonb; f uuid; begin
 x:=public.billing_test_checkout_account('pdf-documents',100);f:=(x->>'folio')::uuid;
 cmd:=(x->'command')||jsonb_build_object('source_id',gen_random_uuid());p:='{"section":"reservation","reservation_id":"SIMULATED-STALL","period":"2027-06-01 / 2027-06-03","duration":"3 demo nights"}';
 r:=public.add_documented_billing_sale(k,cmd,p);
 perform public.billing_test_assert(r=public.add_documented_billing_sale(k,cmd,p),'presentation exact retry');
 perform public.billing_test_error(format('select public.add_documented_billing_sale(%L,%L,%L)',k,cmd,p||'{"duration":"changed"}'),'BILLING_IDEMPOTENCY_CONFLICT');
 perform public.billing_test_error(format('select public.add_documented_billing_sale(%L,%L,%L)',gen_random_uuid(),cmd,p||'{"address":"private"}'),'BILLING_PRESENTATION_INVALID');
 cmd:=(x->'command')||jsonb_build_object('source_id',gen_random_uuid(),'horse_id','f8000000-0000-0000-0000-000000000012');
 r:=public.add_documented_billing_sale(gen_random_uuid(),cmd,'{"section":"entry","block_id":"12","block_label":"Demo block 12","occurrence_id":"SESSION-A","class_id":"L4","class_label":"Open L4","fee_kind":"entry"}');
 st:=public.get_billing_statement(gen_random_uuid(),f);
 perform public.billing_test_assert(st#>'{document,number}'='null'::jsonb,'statement without invoice number');
 perform public.billing_test_assert(exists(select 1 from jsonb_array_elements(st#>'{document,snapshot,charges}') c where c#>>'{presentation,reservation_id}'='SIMULATED-STALL'),'reservation snapshot metadata');
 perform public.billing_test_assert(exists(select 1 from jsonb_array_elements(st#>'{document,snapshot,charges}') c where c#>>'{presentation,occurrence_id}'='SESSION-A' and c#>>'{horse,name}' is not null),'horse and occurrence snapshot');
 receipt:=public.record_billing_payment(gen_random_uuid(),jsonb_build_object('folio_id',f,'version',r#>'{account,version}','amount',40,'method','cash','received_at',now(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',x->>'charge','amount',40))));
 st:=public.get_billing_statement(gen_random_uuid(),f);
 inv:=public.finalize_billing_folio(gen_random_uuid(),f,(st#>>'{account,version}')::bigint,(st->>'document_id')::uuid);
 insert into public.billing_test_fixture values('pdf',jsonb_build_object('folio',f,'document',inv->>'document_id','snapshot',inv#>'{document,snapshot}','statement',st->>'document_id','receipt',receipt->>'document_id','charge',x->>'charge'));
 perform public.billing_test_assert(public.billing_pdf_status((inv->>'document_id')::uuid,false)->>'state'='pending','real pending outbox status');
 perform public.billing_test_error(format('select public.billing_pdf_status(%L,true)',inv->>'document_id'),'BILLING_FORBIDDEN');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='pdf';
 perform public.billing_test_assert(public.billing_pdf_status((x->>'document')::uuid)->>'state'='pending','actual payer authorized');
 perform public.billing_test_error('select * from public.billing_pdf_artifacts','permission denied');
 perform public.billing_test_error(format('select public.billing_pdf_file(%L,''fr'')',x->>'document'),'permission denied');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='pdf';
 perform public.billing_test_error(format('select public.billing_pdf_status(%L,true)',x->>'document'),'BILLING_FORBIDDEN');
 perform public.billing_test_error(format('select public.billing_pdf_status(%L,false)',gen_random_uuid()),'BILLING_FORBIDDEN');
end $$;
reset role;
do $$ declare x jsonb; j jsonb; arts jsonb; r jsonb; doc uuid; org text; begin
 select value into x from public.billing_test_fixture where key='pdf';doc:=(x->>'document')::uuid;
 j:=public.billing_claim_document('pdf-test',doc,300);
 perform public.billing_test_assert(public.billing_claim_document('pdf-other',doc,300) is null,'only one active lease');
 perform public.billing_test_assert(public.billing_pdf_source(doc,(j->>'claim_token')::uuid)->'snapshot'=x->'snapshot','worker receives exact immutable snapshot');
 perform public.billing_finish_document(doc,(j->>'claim_token')::uuid,false,null,'BILLING_PDF_RENDER_FAILED',0);
 j:=public.billing_claim_document('pdf-retry',doc,300);select organization_id::text into org from public.billing_documents where id=doc;
 select jsonb_agg(jsonb_build_object('locale',l,'path',org||'/'||doc||'/'||(j->>'claim_token')||'/'||l||'.pdf','sha256',repeat('a',64),'bytes',100)) into arts from unnest(array['fr','en']) l;
 r:=public.billing_pdf_complete(doc,(j->>'claim_token')::uuid,arts);
 perform public.billing_test_assert(r=public.billing_pdf_complete(doc,(j->>'claim_token')::uuid,arts),'completion retry durable');
 perform public.billing_test_assert((select count(*)=2 from public.billing_pdf_artifacts where document_id=doc),'bilingual atomic manifest');
 perform public.billing_test_assert((select count(*)=1 from public.billing_documents where folio_id=(x->>'folio')::uuid and kind='invoice'),'one financial invoice');
 perform public.billing_test_error(format('update public.billing_pdf_artifacts set bytes=101 where document_id=%L',doc),'BILLING_IMMUTABLE');
 perform public.billing_test_assert(exists(select 1 from public.billing_outbox_events where document_id=doc and to_state='failed'),'failure audited');
 perform public.billing_test_assert((select snapshot=x->'snapshot' from public.billing_documents where id=doc),'render failure never changes document');
 perform public.billing_test_assert((select not public from storage.buckets where id='billing-pdfs'),'private bucket');
end $$;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; st jsonb; r jsonb; begin
 select value into x from public.billing_test_fixture where key='pdf';st:=public.get_billing_statement(gen_random_uuid(),(x->>'folio')::uuid);
 r:=public.record_billing_payment(gen_random_uuid(),jsonb_build_object('folio_id',x->>'folio','version',st#>'{account,version}','amount',20,'method','cash','received_at',now(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',x->>'charge','amount',20))));
 perform public.billing_test_assert(r#>>'{document,kind}'='receipt','late payment gets its own receipt');
end $$;
reset role;
update public.contacts set company_name='Changed after immutable PDF snapshot' where id='f6000000-0000-0000-0000-000000000001';
update public.horses set name='Changed after snapshot' where id='f8000000-0000-0000-0000-000000000012';
select public.billing_test_assert((select d.snapshot=x.value->'snapshot' from public.billing_test_fixture x join public.billing_documents d on d.id=(x.value->>'document')::uuid where x.key='pdf'),'source edits never rewrite invoice');
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000006';
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='pdf';perform public.billing_test_error(format('select public.billing_pdf_status(%L,false)',x->>'document'),'BILLING_FORBIDDEN');
end $$;
reset role;
insert into storage.objects(bucket_id,name) values('billing-pdfs','fictitious-permission-probe.pdf');
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
select public.billing_test_assert((select count(*)=0 from storage.objects where bucket_id='billing-pdfs'),'no browser storage listing');
reset role;
