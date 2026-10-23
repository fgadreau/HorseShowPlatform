-- Direct test charges preserve the mode/provider of every existing attempt.
begin;
alter table public.billing_stripe_accounts add column charge_mode text not null default 'destination' check(charge_mode in ('destination','direct'));
alter table public.billing_stripe_attempts add column charge_mode text not null default 'destination' check(charge_mode in ('destination','direct'));
alter table public.billing_stripe_attempts add column application_fee_amount numeric(14,2) not null default 0 check(application_fee_amount>=0 and application_fee_amount<=amount);
alter table public.billing_stripe_events add column connected_account text;
create table public.billing_hsp_recoveries (
 attempt_id uuid primary key references public.billing_stripe_attempts(id), folio_id uuid not null references public.billing_folios(id),
 amount numeric(14,2) not null check(amount>0), provider_fee text not null unique, created_at timestamptz not null default clock_timestamp()
);
create table public.billing_provider_anomalies (
 folio_id uuid not null references public.billing_folios(id), provider_reference text not null,
 reason text not null check(reason in ('external_refund','external_dispute','fee_mismatch')),
 created_at timestamptz not null default clock_timestamp(), primary key(folio_id,provider_reference,reason)
);
create function public.billing_hsp_attempt() returns trigger language plpgsql set search_path='' as $$
declare outstanding numeric;
begin
 select charge_mode into new.charge_mode from public.billing_stripe_accounts where organization_id=new.organization_id;
 if new.charge_mode='direct' then
  if not exists(select 1 from public.billing_hsp_policies where context_id=new.context_id) then raise exception 'BILLING_HSP_NOT_ADOPTED'; end if;
  if exists(select 1 from public.billing_provider_anomalies where folio_id=new.folio_id) then raise exception 'BILLING_RECONCILIATION_REQUIRED'; end if;
  select c.total-coalesce((select sum(a.application_fee_amount) from public.billing_stripe_attempts a where a.folio_id=new.folio_id and a.state<>'canceled'),0) into outstanding from public.billing_hsp_assessments h join public.billing_charges c on c.id=h.charge_id where h.folio_id=new.folio_id;
  -- Full recovery only. A smaller payment is credited, never silently rounded up.
  new.application_fee_amount:=case when new.amount>=outstanding then outstanding else 0 end;
 end if;
 return new;
end $$;
create trigger billing_hsp_attempt before insert on public.billing_stripe_attempts for each row execute function public.billing_hsp_attempt();
create function public.billing_stripe_configure_direct(p_org uuid,p_platform text,p_connected text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.billing6_lock(p_org);
 if exists(select 1 from public.billing_stripe_accounts where organization_id=p_org) or exists(select 1 from public.billing_stripe_attempts where organization_id=p_org) then raise exception 'BILLING_HSP_NEW_CONTEXT_REQUIRED'; end if;
 insert into public.billing_stripe_accounts(organization_id,platform_account,connected_account,environment,enabled,charge_mode) values(p_org,p_platform,p_connected,'test',true,'direct');
end $$;
create or replace function public.billing_stripe_configure(p_org uuid,p_platform text,p_connected text,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.billing6_lock(p_org);
 if exists(select 1 from public.billing_stripe_accounts where organization_id=p_org and charge_mode='direct') then raise exception 'BILLING_PROVIDER_ACCOUNT'; end if;
 if exists(select 1 from public.billing_stripe_attempts where organization_id=p_org and not resolved and (platform_account<>p_platform or connected_account<>p_connected)) then raise exception 'BILLING_PENDING_PAYMENT'; end if;
 insert into public.billing_stripe_accounts(organization_id,platform_account,connected_account,environment,enabled) values(p_org,p_platform,p_connected,'test',p_enabled)
 on conflict(organization_id) do update set platform_account=excluded.platform_account,connected_account=excluded.connected_account,enabled=excluded.enabled;
end $$;
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
  for ch in select c.id,c.total-coalesce((select sum(amount) from public.billing_payment_allocations where charge_id=c.id),0) due from public.billing_charges c where c.folio_id=f.id order by case when a.charge_mode='direct' and c.source_type='hsp_service' then 0 else 1 end,c.created_at,c.id loop
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
create function public.billing_hsp_confirm_fee(p_attempt uuid,p_fee jsonb) returns void language plpgsql security definer set search_path='' as $$
declare a public.billing_stripe_attempts; outstanding numeric;
begin
 select * into a from public.billing_stripe_attempts where id=p_attempt;
 perform public.billing7_lock(a.folio_id);
 select * into a from public.billing_stripe_attempts where id=p_attempt for update;
 if a.charge_mode<>'direct' or a.state<>'succeeded' or a.application_fee_amount<=0 then raise exception 'BILLING_PROVIDER_ACCOUNT'; end if;
 if p_fee->>'object' is distinct from 'application_fee' or p_fee->'livemode' is distinct from 'false'::jsonb or p_fee->>'account' is distinct from a.connected_account or p_fee->>'currency' is distinct from lower(a.currency) or (p_fee->>'amount')::numeric is distinct from a.application_fee_amount*100 or coalesce(p_fee->>'id','') !~ '^fee_[A-Za-z0-9]+$' then raise exception 'BILLING_PROVIDER_ACCOUNT'; end if;
 if exists(select 1 from public.billing_hsp_recoveries where attempt_id=a.id and provider_fee<>p_fee->>'id') then raise exception 'BILLING_IDEMPOTENCY_CONFLICT'; end if;
 insert into public.billing_hsp_recoveries(attempt_id,folio_id,amount,provider_fee) values(a.id,a.folio_id,a.application_fee_amount,p_fee->>'id') on conflict(attempt_id) do nothing;
end $$;
create function public.billing_provider_flag(p_attempt uuid,p_reference text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare a public.billing_stripe_attempts;
begin
 select * into a from public.billing_stripe_attempts where id=p_attempt;
 if a.id is null then raise exception 'BILLING_FORBIDDEN'; end if;
 perform public.billing7_lock(a.folio_id);
 insert into public.billing_provider_anomalies values(a.folio_id,p_reference,p_reason,clock_timestamp()) on conflict do nothing;
 update public.billing_checkout_state set ready=false,revision=revision+1 where folio_id=a.folio_id;
 perform public.billing7_audit(a,'provider_reconciliation_required');
end $$;
create function public.billing_stripe_receive_direct(p_event text,p_provider text,p_type text,p_platform text,p_connected text,p_live boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_live is distinct from false or coalesce(p_connected,'') !~ '^acct_[A-Za-z0-9]+$' or p_provider !~ '^pi_[A-Za-z0-9]+$' then raise exception 'BILLING_TEST_ONLY'; end if;
 if not exists(select 1 from public.billing_stripe_accounts where platform_account=p_platform and connected_account=p_connected and charge_mode='direct') then raise exception 'BILLING_PROVIDER_ACCOUNT'; end if;
 insert into public.billing_stripe_events(id,provider_id,event_type,platform_account,environment,connected_account) values(p_event,p_provider,p_type,p_platform,'test',p_connected) on conflict(id) do nothing;
end $$;
-- Protect both closing paths. No secretary RPC can clear a provider anomaly.
alter function public.billing6_reasons(uuid) rename to billingh_reasons_previous;
create function public.billing6_reasons(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 select public.billingh_reasons_previous(p_folio)||case when exists(select 1 from public.billing_provider_anomalies where folio_id=p_folio) or exists(select 1 from public.billing_stripe_attempts a where a.folio_id=p_folio and a.state='succeeded' and a.application_fee_amount>0 and not exists(select 1 from public.billing_hsp_recoveries r where r.attempt_id=a.id)) then '["Vérification par l’association"]'::jsonb else '[]'::jsonb end;
$$;
create function public.billing_hsp_closing_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.state='closed' and old.state='open' and (exists(select 1 from public.billing_provider_anomalies where folio_id=new.id) or exists(select 1 from public.billing_stripe_attempts a where a.folio_id=new.id and a.state='succeeded' and a.application_fee_amount>0 and not exists(select 1 from public.billing_hsp_recoveries r where r.attempt_id=a.id))) then raise exception 'BILLING_RECONCILIATION_REQUIRED'; end if;
 return new;
end $$;
create trigger billing_hsp_closing before update on public.billing_folios for each row execute function public.billing_hsp_closing_guard();

create function public.get_billing_hsp_remittances(p_context uuid,p_offset integer default 0,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.billing6_staff(p_context) then raise exception 'BILLING_FORBIDDEN'; end if;
 if p_offset<0 or p_limit not between 1 and 100 then raise exception 'BILLING_INVALID_REQUEST'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('uncollected',x.total-x.collected,'remaining',x.collected-x.remitted)),'[]') into result from (
 select f.public_number account_number,f.id folio_id,f.currency,c.subtotal,c.tax_amount,c.total,
 coalesce((select sum(pa.amount) from public.billing_payment_allocations pa where pa.charge_id=c.id),0) collected,
 coalesce((select sum(r.amount) from public.billing_hsp_recoveries r where r.folio_id=f.id),0) remitted,
 (select coalesce(jsonb_agg(jsonb_build_object('name',t.name,'code',t.code,'amount',t.amount)),'[]') from public.billing_charge_taxes t where t.charge_id=c.id) taxes,
 (select coalesce(jsonb_agg(jsonb_build_object('amount',pa.amount,'method',p.method,'received_at',p.received_at,'receipt_number',d.number)),'[]') from public.billing_payment_allocations pa join public.billing_payments p on p.id=pa.payment_id join public.billing_documents d on d.payment_id=p.id and d.kind='receipt' where pa.charge_id=c.id) collections
 from public.billing_hsp_assessments h join public.billing_folios f on f.id=h.folio_id join public.billing_charges c on c.id=h.charge_id where h.context_id=p_context order by f.public_number,f.id offset p_offset limit p_limit
 ) x;
 return jsonb_build_object('context_id',p_context,'rows',result,'offset',p_offset,'limit',p_limit,'settlement_supported',false);
end $$;
do $$ declare t text; fn record; begin
 foreach t in array array['billing_hsp_recoveries','billing_provider_anomalies'] loop
 execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger immutable before update or delete on public.%I for each row execute function public.billing_immutable()',t);
 end loop;
 for fn in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing_hsp_%' or proname like 'billingh_%' or proname in ('billing_provider_flag','billing_stripe_configure_direct','billing_stripe_receive_direct','get_billing_hsp_remittances','billing6_reasons')) loop execute 'revoke all on function '||fn.signature||' from public,anon,authenticated,service_role'; end loop;
end $$;
grant execute on function public.billing_hsp_adopt(uuid,uuid,jsonb,text),public.billing_stripe_configure_direct(uuid,text,text),public.billing_stripe_receive_direct(text,text,text,text,text,boolean),public.billing_provider_flag(uuid,text,text),public.billing_hsp_confirm_fee(uuid,jsonb) to service_role;
grant execute on function public.get_billing_hsp_remittances(uuid,integer,integer) to authenticated;
commit;
