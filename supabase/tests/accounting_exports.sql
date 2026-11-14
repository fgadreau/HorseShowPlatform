-- Synthetic accounting journals only; the transaction is rolled back.
begin;
do $$
declare
 staff_user uuid:=gen_random_uuid();stranger_user uuid:=gen_random_uuid();staff_profile uuid;
 org uuid:=gen_random_uuid();show_now uuid:=gen_random_uuid();show_old uuid:=gen_random_uuid();ctx_now uuid:=gen_random_uuid();ctx_old uuid:=gen_random_uuid();
 payer uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();product uuid:=gen_random_uuid();folio_now uuid:=gen_random_uuid();folio_old uuid:=gen_random_uuid();
 tps uuid:=gen_random_uuid();tvq uuid:=gen_random_uuid();old_tax uuid:=gen_random_uuid();charge_now uuid;charge_hsp uuid;charge_old uuid;payment_now uuid;payment_old uuid;
 request_id uuid:=gen_random_uuid();data jsonb;created jsonb;duplicate jsonb;blocked boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(staff_user,staff_user||'@example.test','{"first_name":"Accounting","last_name":"Staff"}'),(stranger_user,stranger_user||'@example.test','{"first_name":"Accounting","last_name":"Other"}');
 select id into staff_profile from public.user_profiles where user_id=staff_user;
 insert into public.organizations(id,name,slug,is_test_mode,timezone) values(org,'Accounting TEST',org::text,true,'America/Toronto');
 insert into public.organization_members(organization_id,user_id,role) values(org,staff_profile,'secretary');
 insert into public.shows(id,organization_id,name,slug,start_date,end_date) values(show_now,org,'Current show TEST',show_now::text,current_date,current_date),(show_old,org,'Previous show TEST',show_old::text,current_date-30,current_date-28);
 insert into public.contacts(id,type,first_name,last_name) values(payer,'payer','Synthetic','Payer');
 insert into public.organization_products(id,organization_id,name,category,default_price,tax_applicable) values(product,org,'Accounting TEST product','merch',100,true);
 insert into public.billing_contexts(id,organization_id,kind,show_id,currency,config,opens_at,created_by) values
  (ctx_now,org,'event',show_now,'CAD','{"name_fr":"Concours courant","name_en":"Current show","timezone":"America/Toronto","staff_roles":["admin","secretary"]}',now(),staff_profile),
  (ctx_old,org,'event',show_old,'CAD','{"name_fr":"Ancien concours","name_en":"Previous show","timezone":"America/Toronto","staff_roles":["admin","secretary"]}',now(),staff_profile);
 insert into public.billing_customer_accounts(id,organization_id,payer_contact_id) values(customer,org,payer);
 insert into public.billing_folios(id,organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by) values
  (folio_now,org,ctx_now,customer,'CAD','ACC-NOW-'||folio_now,staff_profile),(folio_old,org,ctx_old,customer,'CAD','ACC-OLD-'||folio_old,staff_profile);
 insert into public.billing_tax_rules(id,organization_id,context_id,code,name,jurisdiction,rate,rule_version,valid_from) values
  (tps,org,ctx_now,'TPS','TPS','CA',5,'test',current_date-60),(tvq,org,ctx_now,'TVQ','TVQ','QC',9.975,'test',current_date-60),(old_tax,org,ctx_old,'TPS','TPS','CA',5,'test',current_date-60);
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(org,folio_now,'CAD','secretary_sale',gen_random_uuid(),product,'entry_fee','Current entry TEST',1,100,100,14.98,payer,staff_profile,'{}') returning id into charge_now;
 insert into public.billing_charge_presentation(charge_id,presentation) values(charge_now,'{"section":"entry","fee_kind":"entry"}');
 insert into public.billing_charge_taxes(charge_id,tax_rule_id,name,code,jurisdiction,rate,base,amount) values(charge_now,tps,'TPS','TPS','CA',5,100,5),(charge_now,tvq,'TVQ','TVQ','QC',9.975,100,9.98);
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot,supplier)
 values(org,folio_now,'CAD','secretary_sale',gen_random_uuid(),product,'other','HSP excluded TEST',1,10,10,1.50,payer,staff_profile,'{}','hsp') returning id into charge_hsp;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(org,folio_old,'CAD','secretary_sale',gen_random_uuid(),product,'merch','Previous show TEST',1,50,50,0,payer,staff_profile,'{}') returning id into charge_old;
 insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot,processing_fee_amount)
 values(org,folio_now,'CAD',114.98,'cash',now(),staff_profile,'{}',2) returning id into payment_now;
 insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot,processing_fee_amount)
 values(org,folio_old,'CAD',50,'cash',now(),staff_profile,'{}',1) returning id into payment_old;
 insert into public.billing_payment_allocations(folio_id,payment_id,charge_id,amount) values(folio_now,payment_now,charge_now,114.98),(folio_old,payment_old,charge_old,50);

 perform set_config('request.jwt.claim.sub',stranger_user::text,true);perform set_config('request.jwt.claims',json_build_object('sub',stranger_user,'role','authenticated')::text,true);set local role authenticated;
 blocked:=false;begin perform public.preview_billing_accounting_export(ctx_now,'quickbooks_online','show_close',current_date,current_date,current_date);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'TEST stranger previewed accounting data';end if;
 reset role;perform set_config('request.jwt.claim.sub',staff_user::text,true);perform set_config('request.jwt.claims',json_build_object('sub',staff_user,'role','authenticated')::text,true);set local role authenticated;

 data:=public.preview_billing_accounting_export(ctx_now,'quickbooks_online','show_close',current_date,current_date,current_date);
 if jsonb_array_length(data->'missing_accounts')<>4 or (data#>>'{totals,debits}')::numeric<>114.98 or (data#>>'{totals,credits}')::numeric<>114.98 or not (data->>'balanced')::boolean then raise exception 'TEST closing preview totals/mappings wrong: %',data;end if;
 if (data->>'source_count')::integer<>1 or exists(select 1 from jsonb_array_elements(data#>'{journals,0,lines}') line where line->>'description' like '%HSP excluded%') then raise exception 'TEST HSP supplier leaked into association journal';end if;
 if not exists(select 1 from jsonb_array_elements(data#>'{journals,0,lines}') line where line->>'account_key'='tax:tps' and (line->>'credit')::numeric=5)
   or not exists(select 1 from jsonb_array_elements(data#>'{journals,0,lines}') line where line->>'account_key'='tax:tvq' and (line->>'credit')::numeric=9.98) then raise exception 'TEST tax liabilities not split';end if;

 perform public.save_billing_accounting_profile(ctx_now,'quickbooks_online','{"accounts_receivable":"1200","revenue:entry":"4100","tax:tps":"2310","tax:tvq":"2340","payment:cash":"1010","processing_fees":"6100"}','{"journal_prefix":"AQR","tracking_name":"Concours"}');
 data:=public.preview_billing_accounting_export(ctx_now,'quickbooks_online','show_close',current_date,current_date,current_date);
 if jsonb_array_length(data->'missing_accounts')<>0 then raise exception 'TEST saved profile not applied';end if;
 created:=public.create_billing_accounting_export(ctx_now,request_id,'quickbooks_online','show_close',current_date,current_date,current_date);
 duplicate:=public.create_billing_accounting_export(ctx_now,gen_random_uuid(),'quickbooks_online','show_close',current_date,current_date,current_date);
 if (created->>'duplicate')::boolean or not (duplicate->>'duplicate')::boolean or created->>'export_id'<>duplicate->>'export_id' or jsonb_array_length((public.get_billing_accounting_workspace(ctx_now))->'history')<>1 then raise exception 'TEST exact export was duplicated';end if;
 blocked:=false;begin perform public.create_billing_accounting_export(ctx_now,request_id,'quickbooks_online','show_close',current_date,current_date,current_date+1);exception when others then if sqlerrm='BILLING_IDEMPOTENCY_CONFLICT' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'TEST changed request id retry accepted';end if;

 data:=public.preview_billing_accounting_export(ctx_now,'quickbooks_online','receipts',current_date,current_date,current_date);
 if (data->>'source_count')::integer<>2 or jsonb_array_length(data->'journals')<>2 or (data#>>'{totals,debits}')::numeric<>164.98 or (data#>>'{totals,credits}')::numeric<>164.98 then raise exception 'TEST receipt journals wrong: %',data;end if;
 if not exists(select 1 from jsonb_array_elements(data->'reconciliation') row where row->>'origin_context_id'=ctx_old::text and (row->>'association_amount')::numeric=50) then raise exception 'TEST prior-show receipt lost its origin';end if;
 if (select sum((line->>'debit')::numeric) from jsonb_array_elements(data->'journals') journal cross join lateral jsonb_array_elements(journal->'lines') line where line->>'account_key'='processing_fees')<>3 then raise exception 'TEST processing fees not separated';end if;
 perform public.create_billing_accounting_export(ctx_now,gen_random_uuid(),'quickbooks_online','receipts',current_date,current_date,current_date);
 if jsonb_array_length((public.get_billing_accounting_workspace(ctx_now))->'history')<>2 then raise exception 'TEST workspace history missing';end if;
 blocked:=false;begin select accounts into data from public.billing_accounting_profiles where organization_id=org;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'TEST direct accounting profile read allowed';end if;
 reset role;
 if has_function_privilege('anon','public.get_billing_accounting_workspace(uuid)','EXECUTE') or has_function_privilege('anon','public.create_billing_accounting_export(uuid,uuid,text,text,date,date,date)','EXECUTE') then raise exception 'TEST anonymous accounting RPC access granted';end if;
end $$;
rollback;
