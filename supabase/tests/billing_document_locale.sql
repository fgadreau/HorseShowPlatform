-- Full persisted DEMO flows, disposable database only. No direct financial row writes.
reset role;
create table public.billing_document_proof_cases(name text primary key,document_id uuid not null references public.billing_documents(id));
-- These identifiers refer exclusively to fixtures created earlier in this same test run.
update public.organizations set name='Association DEMO',billing_name='Association DEMO',address='123 DEMO',tax_number='DEMO-ASSOC-TPS',secondary_tax_number='DEMO-ASSOC-TVQ' where id='f3000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
select public.set_billing_product_document_labels('f5000000-0000-0000-0000-000000000002','Inscription et stalle DEMO','DEMO entry and stall');
select public.set_billing_product_document_labels('f5000000-0000-0000-0000-000000000001','Frais de service HSP','HSP service fee');
reset role;
do $$
declare cfg jsonb; products jsonb; ctx uuid; showid uuid; r jsonb; st jsonb; inv jsonb; receipt jsonb; cmd jsonb; f uuid; a uuid; h uuid; htotal numeric; balance numeric; scenario text; fee numeric; old jsonb; org uuid:='f3000000-0000-0000-0000-000000000001';
begin
 select value into cfg from public.billing_test_fixture where key='config';
 products:='[{"product_id":"f5000000-0000-0000-0000-000000000001","unit_price":5,"taxes":[{"code":"TPS-DEMO","name":"TPS DEMO","jurisdiction":"DEMO","rate":5},{"code":"TVQ-DEMO","name":"TVQ DEMO","jurisdiction":"DEMO","rate":9.975}]},{"product_id":"f5000000-0000-0000-0000-000000000002","unit_price":100,"taxes":[{"code":"TPS-DEMO","name":"TPS DEMO","jurisdiction":"DEMO","rate":5},{"code":"TVQ-DEMO","name":"TVQ DEMO","jurisdiction":"DEMO","rate":9.975}]}]';
 foreach scenario in array array['standard','sponsored','custom-due'] loop
 fee:=case scenario when 'standard' then 5 when 'sponsored' then 0 else 7.34 end;
 perform public.set_billing_hsp_fee('association',org,fee,'DEMO document flow');
 insert into public.shows(organization_id,name,slug,start_date,end_date,default_currency,timezone) values(org,'DEMO show '||scenario,'proof-'||scenario,current_date,current_date+1,'CAD','America/Toronto') returning id into showid;
 ctx:=public.billing_create_context(org,showid,null,null,'CAD',(cfg->'config')||'{"name_fr":"Concours DEMO","name_en":"DEMO show","timezone":"America/Toronto","account_prefix":"DEMO-ACC","receipt_prefix":"DEMO-RCPT","invoice_prefix":"DEMO-INV"}',now()-interval '1 day',null,products);
 perform public.billing_set_capabilities(org,ctx,true,true,true,true,2026);
 cmd:=jsonb_build_object('context_id',ctx,'payer_customer_account_id',cfg->>'customer','product_id','f5000000-0000-0000-0000-000000000002','quantity',1,'source_id',gen_random_uuid());
 r:=public.add_billing_sale(gen_random_uuid(),cmd);f:=(r#>>'{account,folio_id}')::uuid;a:=(r->>'charge_id')::uuid;
 r:=public.add_billing_sale(gen_random_uuid(),cmd||jsonb_build_object('product_id','f5000000-0000-0000-0000-000000000001','source_id',gen_random_uuid()));h:=(r->>'charge_id')::uuid;
 select total into htotal from public.billing_charges where id=h;
 receipt:=public.record_billing_payment(gen_random_uuid(),jsonb_build_object('folio_id',f,'version',r#>'{account,version}','amount',20+htotal,'method','cash','received_at',now(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',a,'amount',20))||case when htotal>0 then jsonb_build_array(jsonb_build_object('charge_id',h,'amount',htotal)) else '[]'::jsonb end));
 perform public.billing_test_assert(receipt#>>'{document,snapshot,receipt_payment,receipt_number}'=receipt#>>'{document,number}','receipt owns its frozen number');
 st:=public.get_billing_statement(gen_random_uuid(),f);
 insert into public.billing_document_proof_cases values(scenario||'-statement',(st->>'document_id')::uuid);
 if scenario<>'custom-due' then
 balance:=(st#>>'{account,balance}')::numeric;
 receipt:=public.record_billing_payment(gen_random_uuid(),jsonb_build_object('folio_id',f,'version',st#>'{account,version}','amount',balance,'method','etransfer','reference','DEMO-'||scenario,'received_at',now(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',a,'amount',balance))));
 end if;
 insert into public.billing_document_proof_cases values(scenario||'-receipt',(receipt->>'document_id')::uuid);
 st:=public.get_billing_statement(gen_random_uuid(),f);
 inv:=public.finalize_billing_folio(gen_random_uuid(),f,(st#>>'{account,version}')::bigint,(st->>'document_id')::uuid);
 insert into public.billing_document_proof_cases values(scenario||'-invoice',(inv->>'document_id')::uuid);
 old:=inv#>'{document,snapshot}';
 perform public.billing_test_assert(old#>>'{context,kind}'='event','persisted proof is an actual show account');
 perform public.billing_test_assert(old#>>'{context,timezone}'='America/Toronto','timezone frozen in invoice');
 perform public.billing_test_assert(old#>>'{charges,0,description_i18n,en}'='DEMO entry and stall','English description frozen');
 perform public.billing_test_assert(not exists(select 1 from jsonb_array_elements(old->'payments') p where p->>'receipt_number' is null),'every invoice payment has receipt number');
 perform public.billing_test_assert((old->>'balance')::numeric=case when scenario='custom-due' then 94.98 else 0 end,'staff may finalize with outstanding balance');
 perform public.set_billing_hsp_fee('association',org,9.99,'DEMO change after invoice');
 perform public.set_billing_product_document_labels('f5000000-0000-0000-0000-000000000002','Inscription et stalle DEMO','Changed current label DEMO');
 perform public.billing_test_assert((select snapshot=old from public.billing_documents where id=(inv->>'document_id')::uuid),'settings and labels do not rewrite invoice');
 perform public.billing_test_assert((public.billing_snapshot(f)->'charges'->0->'description_i18n'->>'en')='DEMO entry and stall','charge translation remains frozen');
 perform public.set_billing_product_document_labels('f5000000-0000-0000-0000-000000000002','Inscription et stalle DEMO','DEMO entry and stall');
 end loop;
end $$;
