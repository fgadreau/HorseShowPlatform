-- Executed only in disposable databases after 1A/1A.6 fixtures.
reset role;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; begin
 x:=public.billing_test_checkout_account('stripe-test',100);
 insert into public.billing_test_fixture values('stripe',x);
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='stripe';
 perform public.billing_test_error(format('select public.begin_billing_stripe_attempt(%L,%L,40)',gen_random_uuid(),x->>'folio'),'BILLING_STRIPE_DISABLED');
end $$;
reset role;
select public.billing_stripe_configure('f3000000-0000-0000-0000-000000000001','acct_testPlatform','acct_testAssociation',true);
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; a jsonb; k uuid:=gen_random_uuid(); begin
 select value into x from public.billing_test_fixture where key='stripe';
 a:=public.begin_billing_stripe_attempt(k,(x->>'folio')::uuid,40);
 perform public.billing_test_assert(a=public.begin_billing_stripe_attempt(k,(x->>'folio')::uuid,40),'Stripe double click durable attempt');
 perform public.billing_test_error(format('select public.begin_billing_stripe_attempt(%L,%L,41)',k,x->>'folio'),'BILLING_IDEMPOTENCY_CONFLICT');
 perform public.billing_test_error(format('select public.begin_billing_stripe_attempt(%L,%L,40)',gen_random_uuid(),x->>'folio'),'BILLING_PENDING_PAYMENT');
 perform public.billing_test_assert(public.get_billing_stripe_status((x->>'folio')::uuid)->>'reserved'='40.00','Stripe amount reserved');
 perform public.billing_test_assert(public.get_billing_checkout_eligibility((x->>'folio')::uuid)->'reasons' ? 'Une opération est en traitement','provider attempt blocks payer closure');
 perform public.billing_test_error(format('select public.billing_stripe_attempt_private(%L)',a->>'attempt_id'),'permission denied');
 update public.billing_test_fixture set value=value||a where key='stripe';
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='stripe';
 perform public.billing_test_error(format('select public.authorize_billing_stripe_attempt(%L)',x->>'attempt_id'),'BILLING_FORBIDDEN');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; p jsonb; r jsonb; begin
 select value into x from public.billing_test_fixture where key='stripe';
 p:=jsonb_build_object('folio_id',x->>'folio','version',x->'version','amount',100,'method','cash','received_at',now(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',x->>'charge','amount',100)));
 perform public.billing_test_error(format('select public.record_billing_payment(%L,%L)',gen_random_uuid(),p),'BILLING_PAYMENT_RESERVED');
 r:=public.get_billing_statement(gen_random_uuid(),(x->>'folio')::uuid);
 perform public.billing_test_error(format('select public.finalize_billing_folio(%L,%L,%s,%L)',gen_random_uuid(),x->>'folio',x->>'version',r->>'document_id'),'BILLING_PENDING_PAYMENT');
 perform public.billing_set_close_block((x->>'folio')::uuid,'provider','pending_provider',false);
 perform public.billing_test_assert(public.get_billing_stripe_status((x->>'folio')::uuid,false)->>'reserved'='40.00','secretary cannot release provider reservation or block');
 -- A new charge during processing stays on the same account.
 perform public.add_billing_sale(gen_random_uuid(),(x->'command')||jsonb_build_object('source_id',gen_random_uuid()));
end $$;
reset role;
do $$ declare x jsonb; obj jsonb; r jsonb; a uuid; begin
 select value into x from public.billing_test_fixture where key='stripe'; a:=(x->>'attempt_id')::uuid;
 obj:=jsonb_build_object('id','pi_testOne','object','payment_intent','livemode',false,'amount',4000,'amount_received',4000,'currency','cad','capture_method','automatic','transfer_data',jsonb_build_object('destination','acct_testAssociation'),'status','processing');
 perform public.billing_stripe_observe(a,'acct_testPlatform',obj);
 perform public.billing_test_assert((select count(*) from public.billing_payments where folio_id=(x->>'folio')::uuid)=0,'processing is not received');
 -- Withdrawal must not lose an already engaged provider confirmation.
 perform public.billing_stripe_configure('f3000000-0000-0000-0000-000000000001','acct_testPlatform','acct_testAssociation',false);
 obj:=obj||'{"status":"succeeded"}';
 r:=public.billing_stripe_observe(a,'acct_testPlatform',obj);
 perform public.billing_test_assert(r->>'state'='succeeded','engaged payment confirmed after deactivation');
 perform public.billing_test_assert(r=public.billing_stripe_observe(a,'acct_testPlatform',obj),'duplicate confirmation one receipt');
 perform public.billing_stripe_observe(a,'acct_testPlatform',obj||'{"status":"processing"}');
 perform public.billing_test_assert((select count(*) from public.billing_payments where folio_id=(x->>'folio')::uuid)=1,'late event cannot duplicate payment');
 perform public.billing_test_assert((select state from public.billing_folios where id=(x->>'folio')::uuid)='open','Stripe success never finalizes');
 perform public.billing_test_assert((select count(*) from public.billing_documents where folio_id=(x->>'folio')::uuid and kind='receipt')=1,'one logical receipt');
 perform public.billing_test_assert((select count(*) from public.billing_outbox where document_id=(r->>'receipt_id')::uuid)=1,'one receipt outbox');
 perform public.billing_stripe_receive('evt_testOne','pi_testOne','payment_intent.succeeded','acct_testPlatform',false);
 perform public.billing_stripe_receive('evt_testOne','pi_testOne','payment_intent.succeeded','acct_testPlatform',false);
 perform public.billing_test_assert((select count(*) from public.billing_stripe_events where id='evt_testOne')=1,'event deduplication');
 perform public.billing_test_error($q$select public.billing_stripe_receive('evt_live','pi_live','payment_intent.succeeded','acct_testPlatform',true)$q$,'BILLING_TEST_ONLY');
 perform public.billing_stripe_configure('f3000000-0000-0000-0000-000000000001','acct_testPlatform','acct_testAssociation',true);
end $$;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; a jsonb; begin
 select value into x from public.billing_test_fixture where key='stripe';
 a:=public.begin_billing_stripe_attempt(gen_random_uuid(),(x->>'folio')::uuid,10);
 update public.billing_test_fixture set value=value||jsonb_build_object('second',a->>'attempt_id') where key='stripe';
end $$;
reset role;
do $$ declare x jsonb; a uuid; obj jsonb; begin
 select value into x from public.billing_test_fixture where key='stripe';a:=(x->>'second')::uuid;
 obj:='{"id":"pi_testTwo","object":"payment_intent","livemode":false,"amount":1000,"amount_received":0,"currency":"cad","capture_method":"automatic","transfer_data":{"destination":"acct_testAssociation"},"status":"requires_action"}';
 perform public.billing_stripe_observe(a,'acct_testPlatform',obj);
 perform public.billing_test_assert((select state from public.billing_stripe_attempts where id=a)='requires_action','additional authentication retains reservation');
 perform public.billing_stripe_observe(a,'acct_testPlatform',obj||'{"status":"requires_payment_method"}');
 perform public.billing_test_assert((select not resolved from public.billing_stripe_attempts where id=a),'decline retains resumable attempt');
 perform public.billing_stripe_observe(a,'acct_testPlatform',obj||'{"status":"canceled"}');
 perform public.billing_test_assert((select resolved from public.billing_stripe_attempts where id=a),'server cancellation releases reservation');
end $$;
-- Complete fictitious operational flow: a second successful partial intent pays the new balance.
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; begin
 select value into x from public.billing_test_fixture where key='stripe';
 perform public.billing_set_ready((x->>'folio')::uuid,true);
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; a jsonb; begin
 select value into x from public.billing_test_fixture where key='stripe';
 a:=public.begin_billing_stripe_attempt(gen_random_uuid(),(x->>'folio')::uuid,(public.get_billing_stripe_status((x->>'folio')::uuid)->>'available')::numeric);
 update public.billing_test_fixture set value=value||jsonb_build_object('last',a->>'attempt_id') where key='stripe';
end $$;
reset role;
do $$ declare x jsonb; a public.billing_stripe_attempts; r jsonb; begin
 select value into x from public.billing_test_fixture where key='stripe';select * into a from public.billing_stripe_attempts where id=(x->>'last')::uuid;
 r:=public.billing_stripe_observe(a.id,a.platform_account,jsonb_build_object('id','pi_testFinal','object','payment_intent','livemode',false,'amount',a.amount*100,'amount_received',a.amount*100,'currency',lower(a.currency),'capture_method','automatic','transfer_data',jsonb_build_object('destination',a.connected_account),'status','succeeded'));
 perform public.billing_test_assert(r->>'state'='succeeded','second successful Stripe payment');
 perform public.billing_test_assert((select count(*) from public.billing_documents where folio_id=a.folio_id and kind='receipt')=2,'two intents produce two receipts');
 perform public.billing_test_assert((select ready from public.billing_checkout_state where folio_id=a.folio_id),'provider payment preserves complete-fees attestation');
end $$;
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; r jsonb; invoice jsonb; k uuid:=gen_random_uuid(); begin
 select value into x from public.billing_test_fixture where key='stripe';r:=public.prepare_own_billing_recap(gen_random_uuid(),(x->>'folio')::uuid);
 invoice:=public.finalize_own_billing_folio(k,(x->>'folio')::uuid,(r->>'version')::bigint,(r->>'document_id')::uuid);
 perform public.billing_test_assert(invoice=public.finalize_own_billing_folio(k,(x->>'folio')::uuid,(r->>'version')::bigint,(r->>'document_id')::uuid),'full demo final invoice durable');
 perform public.billing_test_assert(invoice#>>'{document,snapshot,balance}'='0.00','final demo invoice paid');
end $$;
reset role;
-- Each provider mismatch stays blocked, without an encaissement, even with a known attempt UUID.
do $$ declare field text; x jsonb; a jsonb; obj jsonb; r jsonb; begin
 foreach field in array array['livemode','amount','currency','destination','platform'] loop
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
  x:=public.billing_test_checkout_account('stripe-mismatch-'||field,100);
  perform set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
  a:=public.begin_billing_stripe_attempt(gen_random_uuid(),(x->>'folio')::uuid,10);
  obj:='{"id":"pi_mismatch","object":"payment_intent","livemode":false,"amount":1000,"amount_received":1000,"currency":"cad","capture_method":"automatic","transfer_data":{"destination":"acct_testAssociation"},"status":"succeeded"}';
  if field='livemode' then obj:=obj||'{"livemode":true}';elsif field='amount' then obj:=obj||'{"amount":1}';elsif field='currency' then obj:=obj||'{"currency":"usd"}';elsif field='destination' then obj:=jsonb_set(obj,'{transfer_data,destination}','"acct_otherAssociation"');end if;
  r:=public.billing_stripe_observe((a->>'attempt_id')::uuid,case when field='platform' then 'acct_otherPlatform' else 'acct_testPlatform' end,obj);
  perform public.billing_test_assert(r->>'state'='anomaly' and not exists(select 1 from public.billing_payments where folio_id=(x->>'folio')::uuid),'provider mismatch blocked: '||field);
 end loop;
end $$;
-- Exercise the actual SQL contracts consumed by the UI, not only browser stubs.
set role authenticated;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$ declare x jsonb; d jsonb; begin
 select value into x from public.billing_test_fixture where key='stripe';d:=public.billing_ui_detail((x->>'folio')::uuid,true);
 perform public.billing_test_assert(d#>'{checkout,reasons}' ? 'CLOSED','UI receives stable translated-reason code');
 perform public.billing_test_assert(d->'controls'='null'::jsonb and d#>>'{actions,sale}'='false','personal UI never receives staff controls');
end $$;
set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$ declare x jsonb; c jsonb; begin
 select value into x from public.billing_test_fixture where key='stripe';c:=public.billing_ui_catalog((x->>'context')::uuid);
 perform public.billing_test_assert(jsonb_array_length(c->'products')>0 and c->>'currency'='CAD','UI catalog gets configured products and context currency');
 perform public.billing_test_assert(public.billing_navigation_scope('f3000000-0000-0000-0000-000000000001')->>'staff'='true','navigation scope authorized server-side');
end $$;
reset role;
