-- psql variables: org_id, show_id, staff_uid. Dedicated test environment only; always rolls back.
\set ON_ERROR_STOP on
begin;
select set_config('test.org', :'org_id',true),set_config('test.show', :'show_id',true),set_config('request.jwt.claim.sub', :'staff_uid',true),set_config('test.staff_uid', :'staff_uid',true);
create temp table entry_test_history as select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id)::text,'')) digest from public.invoices i;
select public.billing_set_capabilities(current_setting('test.org')::uuid,null,true,true,false);
select public.configure_reservation_billing(current_setting('test.show')::uuid,
 '{"name_fr":"Test inscriptions","name_en":"Entry test","account_prefix":"TEST-E-A","receipt_prefix":"TEST-E-R","invoice_prefix":"TEST-E-I","closing_policy":"manual","payment_policy":"received_only","activation_policy":"allocated_received","categories":["manual","stall_extra"],"staff_roles":["admin","secretary"],"period":"2026","timezone":"America/Toronto"}',
 '[{"code":"TEST-TAX","name":"Explicit test tax","jurisdiction":"TEST","rate":14.975}]');
-- Synthetic horse and unrestricted fixture classes; no real document is approved or changed.
-- Relax the test association policy only within this rolled-back transaction.
update public.organization_health_policies set coggins_required=false,influenza_required=false,rhino_required=false,identity_validation_requirement='none',association_review_required=false where organization_id=current_setting('test.org')::uuid;
update public.eligibility_requirements set is_active=false where organization_id=current_setting('test.org')::uuid;
update public.shows set entry_payment_policy='manual',late_entries_allowed=true,late_entry_fee_percent=50 where id=current_setting('test.show')::uuid;
do $$ declare org uuid:=current_setting('test.org')::uuid;sh uuid:=current_setting('test.show')::uuid;payer uuid;horse uuid;bl uuid;c1 uuid;c2 uuid;directory uuid;
begin
 select id into payer from public.contacts where id='70000000-0000-0000-0000-000000000001';
 select id into directory from public.organization_disciplines where organization_id=org limit 1;
 insert into public.horses(name,primary_owner_contact_id) values('Temporary billing test horse',payer) returning id into horse;
 insert into public.horse_contacts(horse_id,contact_id,role,can_create_entries,can_modify_entries,can_pay_invoices) values(horse,payer,'owner',true,true,true);
 insert into public.directory_horses(organization_discipline_id,horse_id) values(directory,horse);
 insert into public.directory_contacts(organization_discipline_id,contact_id) values(directory,payer) on conflict do nothing;
 insert into public.blocks(organization_id,show_id,name,entries_close_at) values(org,sh,'Temporary billing test block',clock_timestamp()+interval '1 day') returning id into bl;
 insert into public.classes(organization_id,show_id,block_id,organization_discipline_id,name,entry_fee,judge_fee) values(org,sh,bl,directory,'Temporary class 1',100,25) returning id into c1;
 insert into public.classes(organization_id,show_id,block_id,organization_discipline_id,name,entry_fee,judge_fee,sort_order) values(org,sh,bl,directory,'Temporary class 2',200,30,2) returning id into c2;
 perform set_config('test.payer',payer::text,true);perform set_config('test.horse',horse::text,true);perform set_config('test.block',bl::text,true);perform set_config('test.class1',c1::text,true);perform set_config('test.class2',c2::text,true);
end $$;
set local role authenticated;
do $$declare en public.entries;payload jsonb;begin
 payload:=jsonb_build_object('organization_id',current_setting('test.org'),'show_id',current_setting('test.show'),'horse_id',current_setting('test.horse'),'class_id',current_setting('test.class1'),'created_by_user_id',public.current_profile_id(),'owner_contact_id',current_setting('test.payer'),'payer_contact_id',current_setting('test.payer'),'back_number_choice','personal','entry_number',9876);
 select * into en from public.submit_entry(payload);
 if en.status<>'active' or en.activation_basis<>'manual' then raise exception 'TEST manual submission must activate unpaid';end if;
 perform set_config('test.entry1',en.id::text,true);
 select * into en from public.submit_entry(payload||jsonb_build_object('class_id',current_setting('test.class2')));
 perform set_config('test.entry2',en.id::text,true);
end $$;
reset role;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$declare r uuid:=gen_random_uuid();begin
 perform public.request_entry_cancellation(r,current_setting('test.entry1')::uuid,'class','Participant permissions');
 if not exists(select 1 from public.entry_cancellation_requests where id=r) then raise exception 'TEST participant must see own request';end if;
 begin perform public.entry_cancellation_quote(r);raise exception 'TEST participant cannot decide financial adjustment';exception when others then if sqlerrm<>'ENTRY_FORBIDDEN' then raise;end if;end;
 begin update public.entry_cancellation_requests set status='approved',decided_at=clock_timestamp() where id=r;raise exception 'TEST direct request mutation forbidden';exception when insufficient_privilege then null;end;
 begin insert into public.entry_activation_events(entry_id,kind,provider_reference) values(current_setting('test.entry1')::uuid,'preauthorization','forged');raise exception 'TEST forged provider event forbidden';exception when insufficient_privilege then null;end;
 begin perform public.billing_stripe_observe(gen_random_uuid(),'acct_forged','{}');raise exception 'TEST browser cannot observe provider object';exception when insufficient_privilege then null;end;
 perform public.withdraw_entry_cancellation(r);
 begin perform public.staff_entry_cancellation_quote(current_setting('test.entry1')::uuid,'class');raise exception 'TEST participant cannot use direct staff quote';exception when others then if sqlerrm<>'ENTRY_FORBIDDEN' then raise;end if;end;
 begin perform public.cancel_entry_as_staff(gen_random_uuid(),current_setting('test.entry1')::uuid,'class','{}');raise exception 'TEST participant cannot cancel directly';exception when others then if sqlerrm<>'ENTRY_FORBIDDEN' then raise;end if;end;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000006';
do $$begin
 begin perform public.request_entry_cancellation(gen_random_uuid(),current_setting('test.entry1')::uuid,'class','Unauthorized association');raise exception 'TEST cross-association request forbidden';exception when others then if sqlerrm<>'ENTRY_FORBIDDEN' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.staff_uid'),true);
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$declare q jsonb;result jsonb;begin
 begin
  q:=public.staff_entry_cancellation_quote(current_setting('test.entry2')::uuid,'class');
  result:=public.cancel_entry_as_staff(gen_random_uuid(),current_setting('test.entry2')::uuid,'class',jsonb_build_object('version',q->'version','signature',q->'signature','credit_mode','full','fee_amount',0,'fee_tax_mode','exclusive'));
  if result->>'origin'<>'staff_direct' or (select status from public.entries where id=current_setting('test.entry2')::uuid)<>'cancelled' then raise exception 'TEST authenticated secretary can cancel another owner entry directly';end if;
  raise exception 'TEST_SUBTRANSACTION_COMPLETE';
 exception when others then if sqlerrm<>'TEST_SUBTRANSACTION_COMPLETE' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.staff_uid'),true);
do $$declare scope text;q jsonb;decision jsonb;result jsonb;again jsonb;operation uuid;f uuid;pending uuid;begin
 foreach scope in array array['class','block'] loop
  begin
   operation:=gen_random_uuid();
   q:=public.staff_entry_cancellation_quote(current_setting('test.entry2')::uuid,scope);
   if exists(select 1 from public.entry_cancellation_requests where status='pending') then raise exception 'TEST direct quote must not create a pending request';end if;
   perform public.entry_draw_assert_ready(current_setting('test.block')::uuid);
   decision:=jsonb_build_object('version',q->'version','signature',q->'signature','credit_mode','full','fee_amount',12,'fee_tax_mode','exclusive');
   result:=public.cancel_entry_as_staff(operation,current_setting('test.entry2')::uuid,scope,decision);
   if (select status from public.entries where id=current_setting('test.entry2')::uuid)<>'cancelled' then raise exception 'TEST staff cancellation must apply immediately';end if;
   if scope='block' and (select status from public.entries where id=current_setting('test.entry1')::uuid)<>'cancelled' then raise exception 'TEST direct block cancellation covers both classes';end if;
   if scope='class' and (select status from public.entries where id=current_setting('test.entry1')::uuid)<>'active' then raise exception 'TEST direct class cancellation preserves other class';end if;
   if not exists(select 1 from public.entry_cancellation_requests where id=operation and origin='staff_direct' and status='approved') or exists(select 1 from public.entry_cancellation_requests where status='pending') then raise exception 'TEST no committed pending request for staff direct action';end if;
   f:=(q->>'folio_id')::uuid;
   if (public.billing_snapshot(f)->>'subtotal')::numeric<>(case when scope='class' then 137 else 12 end) then raise exception 'TEST staff direct financial adjustment';end if;
   again:=public.cancel_entry_as_staff(operation,current_setting('test.entry2')::uuid,scope,decision);
   if again<>result then raise exception 'TEST direct cancellation retry must be idempotent';end if;
   begin perform public.cancel_entry_as_staff(operation,current_setting('test.entry2')::uuid,scope,decision||'{"fee_amount":50}');raise exception 'TEST direct operation must reject changed retry';exception when others then if sqlerrm<>'ENTRY_IDEMPOTENCY_CONFLICT' then raise;end if;end;
   if exists(select 1 from public.billing_payments where folio_id=f) then raise exception 'TEST direct cancellation must not create payment or refund';end if;
   raise exception 'TEST_SUBTRANSACTION_COMPLETE';
  exception when others then if sqlerrm<>'TEST_SUBTRANSACTION_COMPLETE' then raise;end if;end;
 end loop;
 foreach scope in array array['closed','stale'] loop
  begin
   q:=public.staff_entry_cancellation_quote(current_setting('test.entry2')::uuid,'class');operation:=gen_random_uuid();f:=(q->>'folio_id')::uuid;
   decision:=jsonb_build_object('version',q->'version','signature',q->'signature','credit_mode','full','fee_amount',0,'fee_tax_mode','exclusive');
   if scope='closed' then update public.billing_folios set state='closed',closed_at=clock_timestamp(),closed_by=public.current_profile_id() where id=f;
   else update public.billing_folios set version=version+1 where id=f;end if;
   begin perform public.cancel_entry_as_staff(operation,current_setting('test.entry2')::uuid,'class',decision);raise exception 'TEST direct cancellation must reject changed account';exception when others then if sqlerrm<>(case when scope='closed' then 'ENTRY_ACCOUNT_CLOSED' else 'BILLING_STALE_VERSION' end) then raise;end if;end;
   if exists(select 1 from public.entry_cancellation_requests where id=operation) or (select status from public.entries where id=current_setting('test.entry2')::uuid)<>'active' then raise exception 'TEST failed direct cancellation must leave no request or entry mutation';end if;
   raise exception 'TEST_SUBTRANSACTION_COMPLETE';
  exception when others then if sqlerrm<>'TEST_SUBTRANSACTION_COMPLETE' then raise;end if;end;
 end loop;
 begin
  q:=public.staff_entry_cancellation_quote(current_setting('test.entry2')::uuid,'class');operation:=gen_random_uuid();
  decision:=jsonb_build_object('version',q->'version','signature',q->'signature','credit_mode','full','fee_amount',0,'fee_tax_mode','exclusive');
  update public.blocks set draw_prepared_at=clock_timestamp() where id=current_setting('test.block')::uuid;
  begin perform public.cancel_entry_as_staff(operation,current_setting('test.entry2')::uuid,'class',decision);raise exception 'TEST direct action after draw must use scratch';exception when others then if sqlerrm<>'ENTRY_DRAW_GENERATED_USE_SCRATCH' then raise;end if;end;
  if exists(select 1 from public.entry_cancellation_requests where id=operation) then raise exception 'TEST failed direct action leaves no request';end if;
  raise exception 'TEST_SUBTRANSACTION_COMPLETE';
 exception when others then if sqlerrm<>'TEST_SUBTRANSACTION_COMPLETE' then raise;end if;end;
 begin
  pending:=gen_random_uuid();perform public.request_entry_cancellation(pending,current_setting('test.entry1')::uuid,'class','Pending participant request');
  begin perform public.staff_entry_cancellation_quote(current_setting('test.entry2')::uuid,'block');raise exception 'TEST overlapping participant request must be processed individually';exception when others then if sqlerrm<>'ENTRY_CANCELLATION_ALREADY_PENDING' then raise;end if;end;
  q:=public.staff_entry_cancellation_quote(current_setting('test.entry2')::uuid,'class');
  perform public.cancel_entry_as_staff(gen_random_uuid(),current_setting('test.entry2')::uuid,'class',jsonb_build_object('version',q->'version','signature',q->'signature','credit_mode','full','fee_amount',0,'fee_tax_mode','exclusive'));
  if (select status from public.entry_cancellation_requests where id=pending)<>'pending' then raise exception 'TEST direct cancellation must not silently decide another class request';end if;
  raise exception 'TEST_SUBTRANSACTION_COMPLETE';
 exception when others then if sqlerrm<>'TEST_SUBTRANSACTION_COMPLETE' then raise;end if;end;
end $$;
do $$declare mode text;f uuid;c uuid;en public.entries;payload jsonb;a jsonb;obj jsonb;result jsonb;balance numeric;r uuid;q jsonb;begin
 foreach mode in array array['payment','preauthorization'] loop
  begin
   update public.shows set entry_payment_policy='card_on_file_preauth',entry_preauth_timing='manual' where id=current_setting('test.show')::uuid;
   insert into public.classes(organization_id,show_id,block_id,organization_discipline_id,name,entry_fee,judge_fee,sort_order)
   select organization_id,show_id,block_id,organization_discipline_id,'Payment activation fixture',50,10,3 from public.classes where id=current_setting('test.class1')::uuid returning id into c;
   payload:=jsonb_build_object('organization_id',current_setting('test.org'),'show_id',current_setting('test.show'),'horse_id',current_setting('test.horse'),'class_id',c,'created_by_user_id',public.current_profile_id(),'owner_contact_id',current_setting('test.payer'),'payer_contact_id',current_setting('test.payer'),'back_number_choice','personal','entry_number',9876);
   select * into en from public.submit_entry(payload);
   if en.status<>'pending_checkout' then raise exception 'TEST card entry must wait for actual provider confirmation';end if;
   begin update public.blocks set draw_prepared_at=clock_timestamp() where id=current_setting('test.block')::uuid;raise exception 'TEST draw cannot bypass pending financial confirmation';exception when others then if sqlerrm<>'ENTRY_DRAW_PENDING_FINANCIAL_CONFIRMATION' then raise;end if;end;
   begin update public.entries set status='active' where id=en.id;raise exception 'TEST cannot activate by browser status';exception when others then if sqlerrm<>'ENTRY_PAYMENT_OR_AUTHORIZATION_REQUIRED' then raise;end if;end;
   select ch.folio_id into f from public.event_billing_lines l join public.billing_charges ch on ch.id=l.charge_id where l.line_key='entry:'||en.id;
   perform public.billing_set_capabilities(current_setting('test.org')::uuid,(select billing_context_id from public.billing_folios where id=f),true,true,false);
   perform public.billing_stripe_configure(current_setting('test.org')::uuid,'acct_testPlatform','acct_testAssociation',true);
   balance:=(public.billing_snapshot(f)->>'balance')::numeric;
   perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
   if mode='payment' then a:=public.begin_billing_stripe_attempt(gen_random_uuid(),f,balance);
   else a:=public.begin_entry_preauthorization(gen_random_uuid(),f,balance);end if;
   obj:=jsonb_build_object('id','pi_entryLifecycle','object','payment_intent','livemode',false,'amount',balance*100,'amount_received',case when mode='payment' then balance*100 else 0 end,'amount_capturable',case when mode='preauthorization' then balance*100 else 0 end,'currency','cad','capture_method',case when mode='payment' then 'automatic' else 'manual' end,'transfer_data',jsonb_build_object('destination','acct_testAssociation'),'status',case when mode='payment' then 'succeeded' else 'requires_capture' end);
   result:=public.billing_stripe_observe((a->>'attempt_id')::uuid,'acct_testPlatform',obj);
   if (select status from public.entries where id=en.id)<>'active' then raise exception 'TEST provider % must activate: %',mode,result;end if;
   if mode='preauthorization' then
    if exists(select 1 from public.billing_payments where folio_id=f) then raise exception 'TEST authorization is not a payment';end if;
    perform set_config('request.jwt.claim.sub',current_setting('test.staff_uid'),true);
    r:=gen_random_uuid();perform public.request_entry_cancellation(r,en.id,'class','Adjust while authorized');q:=public.entry_cancellation_quote(r);
    perform public.decide_entry_cancellation(r,true,jsonb_build_object('version',q->'version','signature',q->'signature','credit_mode','full','fee_amount',12,'fee_tax_mode','exclusive'));
    if exists(select 1 from public.billing_payments where folio_id=f) then raise exception 'TEST cancellation must not capture or refund';end if;
    perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
    begin perform public.authorize_entry_authorization_settlement((a->>'attempt_id')::uuid);raise exception 'TEST unrelated association cannot capture authorization';exception when others then if sqlerrm<>'BILLING_FORBIDDEN' then raise;end if;end;
    perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
    balance:=public.prepare_entry_authorization_capture((a->>'attempt_id')::uuid);
    perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
    if balance<>public.prepare_entry_authorization_capture((a->>'attempt_id')::uuid) then raise exception 'TEST capture retry must retain frozen amount';end if;
    result:=public.billing_stripe_observe((a->>'attempt_id')::uuid,'acct_testPlatform',obj||jsonb_build_object('status','succeeded','amount_received',balance*100,'amount_capturable',0));
    if result->>'state'<>'succeeded' then raise exception 'TEST explicit partial capture after cancellation failed: %',result;end if;
   else
    if (select count(*) from public.billing_payments where folio_id=f)<>1 then raise exception 'TEST payment must be received once';end if;
    perform public.billing_stripe_observe((a->>'attempt_id')::uuid,'acct_testPlatform',obj);
    if (select count(*) from public.billing_payments where folio_id=f)<>1 then raise exception 'TEST duplicate callback duplicated payment';end if;
    perform set_config('request.jwt.claim.sub',current_setting('test.staff_uid'),true);
    r:=gen_random_uuid();perform public.request_entry_cancellation(r,en.id,'class','Paid account credit');q:=public.entry_cancellation_quote(r);
    perform public.decide_entry_cancellation(r,true,jsonb_build_object('version',q->'version','signature',q->'signature','credit_mode','full','fee_amount',0,'fee_tax_mode','exclusive'));
    if (select count(*) from public.billing_payments where folio_id=f)<>1 then raise exception 'TEST paid cancellation changed received money';end if;
   end if;
   raise exception 'TEST_SUBTRANSACTION_COMPLETE';
  exception when others then if sqlerrm<>'TEST_SUBTRANSACTION_COMPLETE' then raise;end if;end;
 end loop;
end $$;
do $$declare scenario text;bl uuid;c uuid;en public.entries;r uuid;q jsonb;payload jsonb;begin
 foreach scenario in array array['other_fees_due','fully_free'] loop
  begin
   if scenario='fully_free' then
    r:=gen_random_uuid();perform public.request_entry_cancellation(r,current_setting('test.entry1')::uuid,'block','Free fixture preparation');q:=public.entry_cancellation_quote(r);
    perform public.decide_entry_cancellation(r,true,jsonb_build_object('version',q->'version','signature',q->'signature','credit_mode','full','fee_amount',0,'fee_tax_mode','exclusive'));
   end if;
   update public.shows set entry_payment_policy='card_on_file_preauth' where id=current_setting('test.show')::uuid;
   insert into public.blocks(organization_id,show_id,name) values(current_setting('test.org')::uuid,current_setting('test.show')::uuid,'Free class fixture') returning id into bl;
   insert into public.classes(organization_id,show_id,block_id,organization_discipline_id,name,entry_fee,judge_fee)
   select organization_id,show_id,bl,organization_discipline_id,'Entirely free class',0,0 from public.classes where id=current_setting('test.class1')::uuid returning id into c;
   payload:=jsonb_build_object('organization_id',current_setting('test.org'),'show_id',current_setting('test.show'),'horse_id',current_setting('test.horse'),'class_id',c,'created_by_user_id',public.current_profile_id(),'owner_contact_id',current_setting('test.payer'),'payer_contact_id',current_setting('test.payer'),'back_number_choice','personal','entry_number',9876);
   select * into en from public.submit_entry(payload);
   if scenario='fully_free' then
    if en.status<>'active' or en.activation_basis<>'free' then raise exception 'TEST genuinely free submission must return its actual active state: %',en;end if;
    r:=gen_random_uuid();perform public.request_entry_cancellation(r,en.id,'class','Free cancellation');q:=public.entry_cancellation_quote(r);
    perform public.decide_entry_cancellation(r,true,jsonb_build_object('version',q->'version','signature',q->'signature','credit_mode','full','fee_amount',0,'fee_tax_mode','exclusive'));
    if (select status from public.entries where id=en.id)<>'cancelled' then raise exception 'TEST free cancellation must remain processable';end if;
   elsif en.status<>'pending_checkout' then raise exception 'TEST free class with other account charges must still wait for confirmation';end if;
   raise exception 'TEST_SUBTRANSACTION_COMPLETE';
  exception when others then if sqlerrm<>'TEST_SUBTRANSACTION_COMPLETE' then raise;end if;end;
 end loop;
end $$;
do $$declare sale public.manual_sales;begin
 begin
  insert into public.manual_sales(organization_id,show_id,payer_contact_id,sold_by_user_id,description,quantity,unit_price,unit_price_tax_mode,tax_applicable)
  values(current_setting('test.org')::uuid,current_setting('test.show')::uuid,current_setting('test.payer')::uuid,public.current_profile_id(),'Tax-inclusive manual price',1,114.98,'inclusive',true) returning * into sale;
  if sale.unit_price<>100 or sale.entered_unit_price<>114.98 then raise exception 'TEST manual inclusive input must preserve original and normalize before tax';end if;
  update public.manual_sales set status='cancelled' where id=sale.id returning * into sale;
  if sale.unit_price<>100 or sale.entered_unit_price<>114.98 then raise exception 'TEST unrelated update must not convert tax twice';end if;
  update public.entries set base_fee=114.98,base_fee_tax_mode='inclusive' where id=current_setting('test.entry1')::uuid;
  if (select base_fee from public.entries where id=current_setting('test.entry1')::uuid)<>100 then raise exception 'TEST custom entry fee inclusive normalization';end if;
  raise exception 'TEST_SUBTRANSACTION_COMPLETE';
 exception when others then if sqlerrm<>'TEST_SUBTRANSACTION_COMPLETE' then raise;end if;end;
end $$;
do $$declare f uuid;r uuid:=gen_random_uuid();q jsonb;result jsonb;snap jsonb;other_block uuid;begin
 select c.folio_id into f from public.event_billing_lines l join public.billing_charges c on c.id=l.charge_id where l.line_key='entry:'||current_setting('test.entry1');
 if (public.billing_snapshot(f)->>'received')::numeric<>0 then raise exception 'TEST unpaid fixture';end if;
 begin
  update public.billing_folios set state='closed',closed_at=clock_timestamp(),closed_by=public.current_profile_id() where id=f;
  r:=gen_random_uuid();perform public.request_entry_cancellation(r,current_setting('test.entry2')::uuid,'class','Closed account');
  begin perform public.entry_cancellation_quote(r);raise exception 'TEST closed account must reject financial processing';exception when others then if sqlerrm<>'ENTRY_ACCOUNT_CLOSED' then raise;end if;end;
  raise exception 'TEST_SUBTRANSACTION_COMPLETE';
 exception when others then if sqlerrm<>'TEST_SUBTRANSACTION_COMPLETE' then raise;end if;end;
 r:=gen_random_uuid();perform public.request_entry_cancellation(r,current_setting('test.entry2')::uuid,'block','Whole block');
 if (select cardinality(entry_ids) from public.entry_cancellation_requests where id=r)<>2 then raise exception 'TEST block request must cover both classes';end if;
 insert into public.blocks(organization_id,show_id,name) values(current_setting('test.org')::uuid,current_setting('test.show')::uuid,'Independent draw') returning id into other_block;
 update public.blocks set draw_prepared_at=clock_timestamp() where id=other_block;
 perform public.withdraw_entry_cancellation(r);
 -- Every financial choice runs in a subtransaction so the same historical
 -- judge/tax snapshots can be compared without accumulating adjustments.
 for q in select value from jsonb_array_elements('[{"credit_mode":"none","fee_amount":0,"fee_tax_mode":"exclusive","expected_credit":0,"expected_fee":0},{"credit_mode":"full","fee_amount":12,"fee_tax_mode":"exclusive","expected_credit":235.70,"expected_fee":13.80},{"credit_mode":"custom","credit_amount":50,"credit_tax_mode":"exclusive","fee_amount":50,"fee_tax_mode":"inclusive","expected_credit":57.49,"expected_fee":50},{"credit_mode":"custom","credit_amount":50,"credit_tax_mode":"inclusive","fee_amount":0,"fee_tax_mode":"inclusive","expected_credit":50,"expected_fee":0}]') loop
  begin
   r:=gen_random_uuid();perform public.request_entry_cancellation(r,current_setting('test.entry2')::uuid,'class','Financial choices');
   result:=public.entry_cancellation_quote(r);
   result:=public.decide_entry_cancellation(r,true,(q-'expected_credit'-'expected_fee')||jsonb_build_object('version',result->'version','signature',result->'signature'));
   if (result#>>'{credit,total}')::numeric<>(q->>'expected_credit')::numeric or (result#>>'{fee,total}')::numeric<>(q->>'expected_fee')::numeric then raise exception 'TEST financial choice % produced %',q,result;end if;
   raise exception 'TEST_SUBTRANSACTION_COMPLETE';
  exception when others then if sqlerrm<>'TEST_SUBTRANSACTION_COMPLETE' then raise;end if;end;
 end loop;
 r:=gen_random_uuid();perform public.request_entry_cancellation(r,current_setting('test.entry2')::uuid,'class','Rejected request');
 perform public.decide_entry_cancellation(r,false,'{"note":"Entry retained"}');
 if (select status from public.entries where id=current_setting('test.entry2')::uuid)<>'active' then raise exception 'TEST rejection must retain active entry';end if;
 r:=gen_random_uuid();
 perform public.request_entry_cancellation(r,current_setting('test.entry2')::uuid,'class','Test partial cancellation');
 begin update public.blocks set draw_prepared_at=clock_timestamp() where id=current_setting('test.block')::uuid;raise exception 'TEST draw must be blocked';exception when others then if sqlerrm<>'ENTRY_DRAW_PENDING_CANCELLATIONS' then raise;end if;end;
 begin insert into public.show_score_block_setups(block_id,organization_id,show_id,runs,is_draw_imported) values(current_setting('test.block')::uuid,current_setting('test.org')::uuid,current_setting('test.show')::uuid,'[]',true);raise exception 'TEST setup import must be blocked';exception when others then if sqlerrm<>'ENTRY_DRAW_PENDING_CANCELLATIONS' then raise;end if;end;
 begin insert into public.block_run_entries(block_run_id,run_id,show_id,block_id,order_of_go) values(gen_random_uuid(),gen_random_uuid(),current_setting('test.show')::uuid,current_setting('test.block')::uuid,1);raise exception 'TEST run insertion must be blocked';exception when others then if sqlerrm<>'ENTRY_DRAW_PENDING_CANCELLATIONS' then raise;end if;end;
 q:=public.entry_cancellation_quote(r);
 if (q->>'subtotal')::numeric<>205 then raise exception 'TEST judge fee recalculation expected 205, got %',q;end if;
 result:=public.decide_entry_cancellation(r,true,jsonb_build_object('version',q->'version','signature',q->'signature','credit_mode','full','fee_amount',12,'fee_tax_mode','exclusive'));
 snap:=public.billing_snapshot(f);
 if (snap->>'subtotal')::numeric<>137 then raise exception 'TEST net cancellation expected 125 retained + 12 fee: %',snap;end if;
 if (result#>>'{credit,subtotal}')::numeric<>205 or (result#>>'{fee,subtotal}')::numeric<>12 then raise exception 'TEST separate credit/fee';end if;
 if (select status from public.entries where id=current_setting('test.entry1')::uuid)<>'active' then raise exception 'TEST unaffected class active';end if;
 if (select status from public.entries where id=current_setting('test.entry2')::uuid)<>'cancelled' then raise exception 'TEST approved class cancelled';end if;
 if exists(select 1 from public.billing_payments where folio_id=f) then raise exception 'TEST cancellation cannot create payment or refund';end if;
 perform public.decide_entry_cancellation(r,true,jsonb_build_object('version',q->'version','signature',q->'signature','credit_mode','full','fee_amount',12,'fee_tax_mode','exclusive'));
 r:=gen_random_uuid();perform public.request_entry_cancellation(r,current_setting('test.entry1')::uuid,'class','Withdraw test');
 perform public.withdraw_entry_cancellation(r);
 update public.blocks set draw_prepared_at=clock_timestamp() where id=current_setting('test.block')::uuid;
 begin perform public.request_entry_cancellation(gen_random_uuid(),current_setting('test.entry1')::uuid,'class','Too late');raise exception 'TEST post draw cancellation forbidden';exception when others then if sqlerrm<>'ENTRY_DRAW_GENERATED_USE_SCRATCH' then raise;end if;end;
end $$;
rollback;
