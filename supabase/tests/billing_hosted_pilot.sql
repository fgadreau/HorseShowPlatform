-- Run only on an isolated local clone. All synthetic operational writes roll back.
begin;
do $$
declare c uuid; t uuid; newer uuid; e jsonb; got jsonb;
begin
 select id into c from public.billing_contexts order by id limit 1;
 assert c is not null,'Fixture context required';
 e:=jsonb_build_object('id','evt_hostedsql','type','payment_intent.succeeded','livemode',false,'account','acct_fixture','data',jsonb_build_object('object',jsonb_build_object('id','pi_hostedsql','livemode',false)));
 perform public.billing_hosted_receive(c,'connect',e);perform public.billing_hosted_receive(c,'connect',e);
 assert (select count(*) from public.billing_hosted_inbox where id='evt_hostedsql')=1,'Duplicate created inbox row';
 begin perform public.billing_hosted_receive(c,'platform',e);raise exception 'expected conflict';exception when others then assert sqlerrm='BILLING_EVENT_CONFLICT';end;
 begin perform public.billing_hosted_receive(c,'connect',jsonb_set(e,'{livemode}','true'));raise exception 'expected test guard';exception when others then assert sqlerrm='BILLING_TEST_ONLY';end;
 t:=public.billing_hosted_claim('stripe');assert t is not null;
 assert public.billing_hosted_claim('stripe') is null,'Overlapping worker acquired lane';
 got:=public.billing_hosted_next(c,'stripe',t);assert got->'event'->>'id'='evt_hostedsql';
 perform public.billing_hosted_result(c,t,'evt_hostedsql',null,'BILLING_PROVIDER_RETRY');
 assert (select processed_at is null and attempts=1 and next_attempt_at>clock_timestamp() from public.billing_hosted_inbox where id='evt_hostedsql');
 -- A killed process has no finally block; expiration alone must allow recovery.
 update public.billing_hosted_lanes set lease_until=clock_timestamp()-interval '1 second' where lane='stripe';
 newer:=public.billing_hosted_claim('stripe');assert newer is not null and newer<>t;
 perform public.billing_hosted_release('stripe',t);assert public.billing_hosted_claim('stripe') is null,'Stale owner released newer lane';
 begin perform public.billing_hosted_result(c,t,'evt_hostedsql',null,null);raise exception 'expected stale claim';exception when others then assert sqlerrm='BILLING_OUTBOX_STALE_CLAIM';end;
 perform public.billing_hosted_result(c,newer,'evt_hostedsql',null,null);
 assert (select processed_at is not null and attempts=2 from public.billing_hosted_inbox where id='evt_hostedsql');
 perform public.billing_hosted_release('stripe',newer);
 assert public.billing_hosted_claim('stripe') is not null;
 assert not public.billing_hosted_scope(c,p_folio=>gen_random_uuid());
 assert not has_table_privilege('authenticated','public.billing_hosted_inbox','SELECT');
 assert not has_table_privilege('anon','public.billing_hosted_inbox','INSERT');
 assert not has_function_privilege('authenticated','public.billing_hosted_claim(text)','EXECUTE');
 assert has_function_privilege('service_role','public.billing_hosted_claim(text)','EXECUTE');
end $$;
rollback;
