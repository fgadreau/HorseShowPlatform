-- Synthetic bookkeeping in a rolled-back transaction. No payment provider is called.
begin;
do $$
declare
 staff_user uuid:=gen_random_uuid(); stranger_user uuid:=gen_random_uuid();staff_profile uuid;
 org uuid:=gen_random_uuid();other_org uuid:=gen_random_uuid();show_id uuid:=gen_random_uuid();ctx uuid:=gen_random_uuid();other_ctx uuid:=gen_random_uuid();
 payer uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();product uuid:=gen_random_uuid();folio uuid:=gen_random_uuid();ch uuid;hsp uuid;payment uuid;
 request uuid:=gen_random_uuid();report jsonb;page jsonb;expense public.billing_context_expenses;blocked boolean;before_charges bigint;
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
 values(org,folio,'CAD','secretary_sale',gen_random_uuid(),product,'other','TEST HSP',1,5,5,.25,payer,staff_profile,'{}','hsp') returning id into hsp;
 insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot,processing_fee_amount)
 values(org,folio,'CAD',60,'cash',now(),staff_profile,'{}',1.20) returning id into payment;
 insert into public.billing_payment_allocations(folio_id,payment_id,charge_id,amount) values(folio,payment,ch,55),(folio,payment,hsp,5);
 select count(*) into before_charges from public.billing_charges where folio_id=folio;
 perform set_config('request.jwt.claim.sub',stranger_user::text,true);perform set_config('request.jwt.claims',json_build_object('sub',stranger_user,'role','authenticated')::text,true);
 set local role authenticated;
 blocked:=false;begin perform public.get_billing_context_report(ctx,org);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Stranger read report';end if;
 blocked:=false;begin perform public.record_billing_context_expense(ctx,request,'{"category":"judges","description":"TEST expense","amount":20,"incurred_on":"2026-10-26"}');exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Stranger wrote expense';end if;
 reset role;
 perform set_config('request.jwt.claim.sub',staff_user::text,true);perform set_config('request.jwt.claims',json_build_object('sub',staff_user,'role','authenticated')::text,true);
 set local role authenticated;
 report:=public.get_billing_context_report(ctx,org);
 if (report#>>'{totals,revenue}')::numeric<>100 or (report#>>'{totals,association_tax}')::numeric<>5 or (report#>>'{totals,hsp_subtotal}')::numeric<>5 then raise exception 'Revenue must exclude HSP/tax and net cancelled charges';end if;
 if not exists(select 1 from jsonb_array_elements(report->'revenue_categories') row where row->>'category'='entry' and (row->>'subtotal')::numeric=100) then raise exception 'Frozen entry presentation must classify entry revenue';end if;
 if (report#>>'{totals,collected}')::numeric<>60 or (report#>>'{totals,association_collected}')::numeric<>55 or (report#>>'{totals,association_balance}')::numeric<>50 or (report#>>'{totals,balance}')::numeric<>50.25 then raise exception 'Mixed supplier allocation totals wrong';end if;
 if (report#>>'{totals,association_processing_fees}')::numeric<>1.10 or (report->>'management_result')::numeric<>98.90 then raise exception 'Processing fee share must be proportional and cent-rounded';end if;
 expense:=public.record_billing_context_expense(ctx,request,'{"category":"judges","description":"TEST expense","amount":20,"incurred_on":"2026-10-26"}');
 perform public.record_billing_context_expense(ctx,request,'{"category":"judges","description":"TEST expense","amount":20,"incurred_on":"2026-10-26"}');
 report:=public.get_billing_context_report(ctx,org);
 if jsonb_array_length(report->'expenses')<>1 or (report->>'expenses_total')::numeric<>20 or (report->>'management_result')::numeric<>78.90 then raise exception 'Expense or retry counted twice';end if;
 blocked:=false;begin perform public.record_billing_context_expense(ctx,request,'{"category":"judges","description":"TEST changed payload","amount":20,"incurred_on":"2026-10-26"}');exception when others then if sqlerrm='BILLING_IDEMPOTENCY_CONFLICT' then blocked:=true;else raise;end if;end;
 if not blocked then raise exception 'Changed retry must be rejected';end if;
 blocked:=false;begin perform public.get_billing_context_report(ctx,other_org);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Mismatched organization read report';end if;
 page:=public.list_billing_finance_accounts(org,jsonb_build_object('context_id',ctx),true,25,0);
 if (page->>'total')::integer<>1 then raise exception 'Due accounts filter wrong';end if;
 page:=public.list_billing_finance_accounts(org,jsonb_build_object('context_id',ctx,'q','does-not-exist'),false,25,0);
 if (page->>'total')::integer<>0 then raise exception 'Account search wrong';end if;
 perform public.void_billing_context_expense(request,'TEST correction');perform public.void_billing_context_expense(request,'TEST correction');
 report:=public.get_billing_context_report(ctx,org);
 if (report->>'expenses_total')::numeric<>0 or (report->>'management_result')::numeric<>98.90 or report#>>'{expenses,0,voided_at}' is null then raise exception 'Void must retain history and remove expense from result';end if;
 blocked:=false;begin delete from public.billing_context_expenses where id=request;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Direct expense deletes must be forbidden';end if;
 reset role;
 if (select count(*) from public.billing_charges where folio_id=folio)<>before_charges then raise exception 'Reports/expenses changed financial charges';end if;
 if (select count(*) from public.billing_audit_events where organization_id=org and operation='management_expense_added')<>1 or (select count(*) from public.billing_audit_events where organization_id=org and operation='management_expense_voided')<>1 then raise exception 'Expense audit/idempotency wrong';end if;
 if has_function_privilege('anon','public.get_billing_context_report(uuid,uuid)','EXECUTE') or has_function_privilege('anon','public.record_billing_context_expense(uuid,uuid,jsonb)','EXECUTE') then raise exception 'Anonymous report/expense access granted';end if;
end $$;
rollback;
