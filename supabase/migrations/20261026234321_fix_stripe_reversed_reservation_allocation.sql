-- Preserve direct HSP priority while excluding cancelled reservation/credit pairs.
begin;
create or replace function public.billing_stripe_observe(p_attempt uuid,p_platform text,p_object jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.billing_stripe_attempts; f public.billing_folios; pid uuid; doc uuid; remaining numeric; due numeric; ch record; target text; snap jsonb;
begin
 select * into a from public.billing_stripe_attempts where id=p_attempt;
 if not found then raise exception 'BILLING_FORBIDDEN'; end if;
 f:=public.billing7_lock(a.folio_id);
 select * into a from public.billing_stripe_attempts where id=p_attempt for update;
 if p_object->>'object' is distinct from 'payment_intent' or p_object->'livemode' is distinct from 'false'::jsonb or p_platform is distinct from a.platform_account
 or p_object->>'capture_method' is distinct from 'automatic' or (a.charge_mode='destination' and p_object#>>'{transfer_data,destination}' is distinct from a.connected_account)
 or (a.charge_mode='direct' and (p_object->>'hsp_verified_account' is distinct from a.connected_account or coalesce(p_object->'transfer_data','null')<>'null'::jsonb or coalesce((p_object->>'application_fee_amount')::numeric,0) is distinct from a.application_fee_amount*100))
 or p_object->>'currency' is distinct from lower(a.currency) or (p_object->>'amount')::numeric is distinct from a.amount*100
 or (a.provider_id is not null and a.provider_id is distinct from p_object->>'id') or coalesce(p_object->>'id','') !~ '^pi_[A-Za-z0-9]+$' then
  if not a.resolved then update public.billing_stripe_attempts set state='anomaly',last_error='PROVIDER_MISMATCH',updated_at=clock_timestamp() where id=a.id returning * into a; perform public.billing7_audit(a,'stripe_anomaly'); end if;
  return jsonb_build_object('state','anomaly');
 end if;
 if a.resolved then return jsonb_build_object('state',a.state,'receipt_id',a.receipt_id); end if;
 target:=p_object->>'status';
 if target not in ('requires_payment_method','requires_confirmation','requires_action','processing','succeeded','canceled') or target is null then target:='anomaly'; end if;
 if target='succeeded' and ((p_object->>'amount_received')::numeric is distinct from a.amount*100 or a.amount>(public.billing_snapshot(f.id)->>'balance')::numeric or f.state<>'open') then target:='anomaly'; end if;
 -- A detected anomaly requires provider reconciliation; stale webhook payloads never clear it.
 if a.state='anomaly' then return jsonb_build_object('state','anomaly'); end if;
 if target='succeeded' then
  insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot)
  values(a.organization_id,a.folio_id,a.currency,a.amount,'stripe_test',clock_timestamp(),a.actor_id,jsonb_build_object('kind','stripe_test','attempt_id',a.id,'provider_id',p_object->>'id')) returning id into pid;
  remaining:=a.amount;
  for ch in select c.id,c.total-coalesce((select sum(amount) from public.billing_payment_allocations where charge_id=c.id),0) due from public.billing_charges c where c.folio_id=f.id and c.total>0 and not exists(select 1 from public.reservation_billing_reversals rr where c.id in (rr.charge_id,rr.credit_id)) order by case when a.charge_mode='direct' and c.source_type='hsp_service' then 0 else 1 end,c.created_at,c.id loop
   due:=least(ch.due,remaining);
   if due>0 then insert into public.billing_payment_allocations values(f.id,pid,ch.id,due); remaining:=remaining-due; end if;
  end loop;
  if remaining<>0 then raise exception 'BILLING_ALLOCATION_TOTAL_MISMATCH'; end if;
  update public.billing_folios set version=version+1 where id=f.id;
  snap:=public.billing_snapshot(f.id);
  insert into public.billing_documents(organization_id,folio_id,currency,kind,number,payment_id,snapshot,actor_id)
  select a.organization_id,f.id,f.currency,'receipt',public.billing_number(f.organization_id,'receipt',c.config->>'receipt_prefix'),pid,
  snap||jsonb_build_object('issued_at',clock_timestamp(),'payment_id',pid,'receipt_payment',(select v from jsonb_array_elements(snap->'payments') v where v->>'id'=pid::text)),a.actor_id from public.billing_contexts c where c.id=f.billing_context_id returning id into doc;
  insert into public.billing_outbox(document_id) values(doc);
 end if;
 update public.billing_stripe_attempts set provider_id=p_object->>'id',state=target,resolved=target in ('succeeded','canceled'),payment_id=pid,receipt_id=doc,updated_at=clock_timestamp(),last_error=case when target='anomaly' then 'PROVIDER_STATE' else null end where id=a.id returning * into a;
 perform public.billing7_audit(a,'stripe_observation');
 return jsonb_build_object('state',a.state,'receipt_id',a.receipt_id);
end $$;
commit;
