-- Synthetic transaction; real PostgreSQL authorization and ledger arithmetic.
begin;
do $$declare
 staff uuid:=gen_random_uuid();buyer uuid:=gen_random_uuid();stranger uuid:=gen_random_uuid();sp uuid;bp uuid;org uuid:=gen_random_uuid();directory uuid:=gen_random_uuid();contact uuid:=gen_random_uuid();sh uuid;bl uuid;
 catalog jsonb;q jsonb;items jsonb;result jsonb;folio uuid;charge uuid;ctx uuid;pid uuid;aid uuid;rid uuid;ord uuid;pid2 uuid;aid2 uuid;charge2 uuid;request uuid:=gen_random_uuid();refund_request uuid:=gen_random_uuid();blocked boolean;snap jsonb;credit_total numeric;original jsonb;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(staff,staff||'@example.test','{}'),(buyer,buyer||'@example.test','{}'),(stranger,stranger||'@example.test','{}');
 select id into sp from public.user_profiles where user_id=staff;select id into bp from public.user_profiles where user_id=buyer;
 insert into public.organizations(id,name,slug,currency) values(org,'Credit TEST',org::text,'CAD');
 insert into public.organization_members(organization_id,user_id,role) values(org,sp,'admin');
 insert into public.organization_disciplines(id,organization_id,discipline_id) values(directory,org,(select id from public.disciplines where code='REINING'));
 insert into public.contacts(id,type,first_name,last_name,linked_user_id) values(contact,'payer','Buyer','TEST',bp);
 insert into public.platform_admins(user_id) values(sp);
 perform set_config('request.jwt.claim.sub',staff::text,true);
 perform public.billing_set_capabilities(org,null,true,true,false);
 delete from public.platform_admins where user_id=sp;
 set local role authenticated;
 sh:=public.create_ticket_event(org,'Credit TEST',current_date+10,'Test venue');
 reset role;select id into bl from public.blocks where show_id=sh;
 set local role authenticated;
 perform public.save_ticket_block(bl,'{"payment_policy":"manual","capacity":5,"is_active":true}',
 '[{"name":"Stall TEST","price":300,"taxable":true,"tax_mode":"exclusive","capacity":5,"is_active":true}]',
 '[{"code":"T1","name":"Tax 1","rate":5,"jurisdiction":"TEST"},{"code":"T2","name":"Tax 2","rate":9.975,"jurisdiction":"TEST"}]',null);
 catalog:=public.get_ticket_catalog(org,sh,true)->0;
 items:=jsonb_build_array(jsonb_build_object('option_id',catalog#>>'{options,0,id}','quantity',1));
 perform set_config('request.jwt.claim.sub',buyer::text,true);
 q:=public.ticket_quote(bl,items);result:=public.purchase_tickets(gen_random_uuid(),bl,contact,items,'',q->>'signature');folio:=(result->>'folio_id')::uuid;
 reset role;
 select id,to_jsonb(ch) into charge,original from public.billing_charges ch where folio_id=folio and supplier='association';
 select billing_context_id into ctx from public.billing_folios where id=folio;
 insert into public.billing_stripe_accounts(organization_id,platform_account,connected_account,enabled) values(org,'acct_CreditPlatform','acct_CreditConnected',true);
 insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot,processing_fee_amount)
 values(org,folio,'CAD',344.93,'stripe_test',clock_timestamp(),sp,'{}',0) returning id into pid;
 insert into public.billing_payment_allocations values(folio,pid,charge,344.93);
 insert into public.billing_stripe_attempts(organization_id,context_id,folio_id,payer_account_id,actor_id,platform_account,connected_account,amount,currency,request_id,provider_id,state,resolved,payment_id)
 select org,ctx,folio,payer_customer_account_id,sp,'acct_CreditPlatform','acct_CreditConnected',344.93,'CAD',gen_random_uuid(),'pi_CreditTest','succeeded',true,pid from public.billing_folios where id=folio returning id into aid;
 set local role authenticated;
 blocked:=false;begin perform public.billing_credit_account(request,folio,charge,50,'Stall difference');exception when others then blocked:=sqlerrm='BILLING_FORBIDDEN';end;
 if not blocked then raise exception 'Buyer issued a credit';end if;
 perform set_config('request.jwt.claim.sub',staff::text,true);
 result:=public.billing_credit_account(request,folio,charge,50,'Stall difference');
 if (result->>'total')::numeric<>57.49 then raise exception 'Credit tax incorrect: %',result;end if;
 if public.billing_credit_account(request,folio,charge,50,'Stall difference')<>result then raise exception 'Credit replay changed';end if;
 blocked:=false;begin perform public.billing_credit_account(request,folio,charge,51,'Stall difference');exception when others then blocked:=sqlerrm='BILLING_IDEMPOTENCY_CONFLICT';end;
 if not blocked then raise exception 'Changed request reused';end if;
 blocked:=false;begin perform public.billing_credit_account(gen_random_uuid(),folio,charge,251,'Too large credit');exception when others then blocked:=sqlerrm='BILLING_CREDIT_EXCEEDS_CHARGE';end;
 if not blocked then raise exception 'Excess credit accepted';end if;
 blocked:=false;begin perform public.begin_billing_refund(gen_random_uuid(),folio,pid,58,'Too large refund');exception when others then blocked:=sqlerrm='BILLING_REFUND_EXCEEDS_CREDIT';end;
 if not blocked then raise exception 'Excess refund accepted';end if;
 result:=public.begin_billing_refund(refund_request,folio,pid,57.49,'Refund stall difference');rid:=(result->>'refund_id')::uuid;
 if public.begin_billing_refund(refund_request,folio,pid,57.49,'Refund stall difference')<>result then raise exception 'Refund replay changed';end if;
 blocked:=false;begin perform public.begin_billing_refund(gen_random_uuid(),folio,pid,1,'Parallel refund');exception when others then blocked:=sqlerrm='BILLING_PAYMENT_PENDING';end;
 if not blocked then raise exception 'Parallel refund accepted';end if;
 blocked:=false;begin perform public.billing_credit_account(gen_random_uuid(),folio,charge,1,'Pending refund');exception when others then blocked:=sqlerrm='BILLING_PAYMENT_PENDING';end;
 if not blocked then raise exception 'Credit allowed while refund pending';end if;
 perform set_config('request.jwt.claim.sub',buyer::text,true);
 blocked:=false;begin perform public.authorize_billing_refund(rid);exception when others then blocked:=sqlerrm='BILLING_FORBIDDEN';end;
 if not blocked then raise exception 'Buyer authorized refund';end if;
 reset role;
 result:=public.billing_refund_observe(rid,jsonb_build_object('id','re_CreditTest','status','pending','hsp_verified_test',true,'payment_intent','pi_CreditTest','currency','cad','amount',5749));
 if (public.billing_snapshot(folio)->>'balance')::numeric<>-57.49 then raise exception 'Pending refund consumed credit';end if;
 result:=public.billing_refund_observe(rid,jsonb_build_object('id','re_CreditTest','status','succeeded','hsp_verified_test',true,'payment_intent','pi_CreditTest','currency','cad','amount',5749));
 perform public.billing_refund_observe(rid,jsonb_build_object('id','re_CreditTest','status','succeeded','hsp_verified_test',true,'payment_intent','pi_CreditTest','currency','cad','amount',5749));
 snap:=public.billing_snapshot(folio);
 if (snap->>'balance')::numeric<>0 or (snap->>'received')::numeric<>287.44 or (select count(*) from public.billing_payments where refund_of=pid)<>1 then raise exception 'Refund ledger/replay incorrect: %',snap;end if;
 if (select to_jsonb(ch) from public.billing_charges ch where id=charge)<>original then raise exception 'Original charge mutated';end if;
 perform set_config('request.jwt.claim.sub',staff::text,true);set local role authenticated;
 snap:=public.billing_ui_detail(folio,false);
 if snap#>>'{refunds,0,state}'<>'succeeded' then raise exception 'Refund history missing';end if;
 snap:=public.list_dashboard_billing_accounts(org);
 if jsonb_array_length(snap)<>1 or (snap#>>'{0,paid}')::numeric<>287.44 or (snap#>>'{0,balance}')::numeric<>0 or snap#>>'{0,payer_contact_id}'<>contact::text then raise exception 'Dashboard refund summary wrong: %',snap;end if;
 perform set_config('request.jwt.claim.sub',buyer::text,true);
 if public.list_dashboard_billing_accounts(org)<>snap then raise exception 'Buyer dashboard summary differs from staff';end if;
 perform set_config('request.jwt.claim.sub',stranger::text,true);
 if public.list_dashboard_billing_accounts(org)<>'[]'::jsonb then raise exception 'Stranger read dashboard account';end if;
 perform set_config('request.jwt.claim.sub',staff::text,true);
 snap:=public.get_billing_context_report(ctx,org);
 if (snap#>>'{totals,collected}')::numeric<>287.44 or (snap#>>'{totals,balance}')::numeric<>0 then raise exception 'Report refund totals wrong: %',snap;end if;
 snap:=public.preview_billing_accounting_export(ctx,'quickbooks_online','receipts',current_date,current_date,current_date);
 if (snap#>>'{totals,debits}')::numeric<>287.44 or (snap#>>'{totals,credits}')::numeric<>287.44 or not (snap->>'balanced')::boolean then raise exception 'Accounting refund journal incorrect: %',snap;end if;
 -- Tiny credits must cumulatively reverse precisely the original tax amount.
 perform public.billing_credit_account(gen_random_uuid(),folio,charge,0.01,'Rounding test one');
 perform public.billing_credit_account(gen_random_uuid(),folio,charge,249.99,'Rounding remainder');
 snap:=public.list_dashboard_billing_accounts(org);
 if (snap#>>'{0,balance}')::numeric<>-287.44 or (snap#>>'{0,total}')::numeric<>0 then raise exception 'Dashboard lost signed credits: %',snap;end if;
 reset role;
 if (select sum(tax_amount) from public.billing_charges where id=charge or credit_for=charge)<>0 then raise exception 'Cumulative tax rounding incorrect';end if;
 -- A real ticket cancellation must also permit refund allocations to reversed fees.
 set local role authenticated;perform set_config('request.jwt.claim.sub',buyer::text,true);
 q:=public.ticket_quote(bl,items);result:=public.purchase_tickets(gen_random_uuid(),bl,contact,items,'',q->>'signature');ord:=(result->>'order_id')::uuid;
 reset role;select charge_id into charge2 from public.ticket_order_lines where order_id=ord;
 insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot,processing_fee_amount)
 values(org,folio,'CAD',344.93,'stripe_test',clock_timestamp(),sp,'{}',0) returning id into pid2;
 insert into public.billing_payment_allocations values(folio,pid2,charge2,344.93);
 insert into public.billing_stripe_attempts(organization_id,context_id,folio_id,payer_account_id,actor_id,platform_account,connected_account,amount,currency,request_id,provider_id,state,resolved,payment_id)
 select org,ctx,folio,payer_customer_account_id,sp,'acct_CreditPlatform','acct_CreditConnected',344.93,'CAD',gen_random_uuid(),'pi_CancelTest','succeeded',true,pid2 from public.billing_folios where id=folio returning id into aid2;
 perform set_config('request.jwt.claim.sub',staff::text,true);set local role authenticated;
 perform public.cancel_ticket_order(ord,'Canceled test ticket','full');
 result:=public.begin_billing_refund(gen_random_uuid(),folio,pid2,344.93,'Refund canceled ticket');rid:=(result->>'refund_id')::uuid;
 reset role;
 perform public.billing_refund_observe(rid,jsonb_build_object('id','re_CancelTest','status','succeeded','hsp_verified_test',true,'payment_intent','pi_CancelTest','currency','cad','amount',34493));
 snap:=public.billing_snapshot(folio);
 if (snap->>'balance')::numeric<>-287.44 then raise exception 'Cancellation refund ledger incorrect: %',snap;end if;
 set local role authenticated;
 result:=public.begin_billing_refund(gen_random_uuid(),folio,pid,287.44,'Refund remaining credit');rid:=(result->>'refund_id')::uuid;
 reset role;
 perform public.billing_refund_observe(rid,jsonb_build_object('id','re_FinalTest','status','succeeded','hsp_verified_test',true,'payment_intent','pi_CreditTest','currency','cad','amount',28744));
 set local role authenticated;
 snap:=public.preview_billing_accounting_export(ctx,'quickbooks_online','receipts',current_date,current_date,current_date);
 if jsonb_array_length(snap->'journals')<>0 then raise exception 'Fully refunded payments exported zero-value journals: %',snap;end if;
 reset role;
 if has_function_privilege('authenticated','public.billing_refund_observe(uuid,jsonb)','execute') or has_table_privilege('authenticated','public.billing_refunds','update') then raise exception 'Refund private write exposed';end if;
end $$;
rollback;
