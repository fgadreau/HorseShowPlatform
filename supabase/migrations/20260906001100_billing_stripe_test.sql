-- Stripe test only. No activation, fixtures, legacy writes or external calls.
begin;
alter table public.billing_payments drop constraint billing_payments_method_check;
alter table public.billing_payments add constraint billing_payments_method_check check(method in ('cash','etransfer','stripe_test'));
create table public.billing_stripe_accounts (
 organization_id uuid primary key references public.organizations(id),
 platform_account text not null check(platform_account ~ '^acct_[A-Za-z0-9]+$'),
 connected_account text not null unique check(connected_account ~ '^acct_[A-Za-z0-9]+$'),
 environment text not null default 'test' check(environment='test'), enabled boolean not null default false
);
create table public.billing_stripe_attempts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null,
 context_id uuid not null references public.billing_contexts(id), folio_id uuid not null,
 payer_account_id uuid not null references public.billing_customer_accounts(id), actor_id uuid not null references public.user_profiles(id),
 platform_account text not null, connected_account text not null, environment text not null default 'test' check(environment='test'),
 amount numeric(14,2) not null check(amount>0), currency text not null,
 request_id uuid not null, provider_id text unique check(provider_id ~ '^pi_[A-Za-z0-9]+$'),
 state text not null default 'preparing' check(state in ('preparing','requires_payment_method','requires_confirmation','requires_action','processing','succeeded','canceled','anomaly')),
 resolved boolean not null default false, last_error text, created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 payment_id uuid unique references public.billing_payments(id), receipt_id uuid unique references public.billing_documents(id),
 foreign key(organization_id,folio_id,currency) references public.billing_folios(organization_id,id,currency),
 unique(organization_id,actor_id,request_id),check(resolved=(state in ('succeeded','canceled')))
);
create unique index billing_stripe_one_pending on public.billing_stripe_attempts(folio_id) where not resolved;
create table public.billing_stripe_events (
 id text primary key check(id ~ '^evt_[A-Za-z0-9]+$'), provider_id text not null,
 event_type text not null, platform_account text not null, environment text not null check(environment='test'),
 received_at timestamptz not null default clock_timestamp(), processed_at timestamptz, attempts integer not null default 0,
 last_error text
);
create index billing_stripe_events_pending on public.billing_stripe_events(received_at,id) where processed_at is null;
create function public.billing7_lock(p_folio uuid) returns public.billing_folios language plpgsql set search_path='' as $$
declare f public.billing_folios;
begin
 select * into f from public.billing_folios where id=p_folio;
 if not found then raise exception 'BILLING_FORBIDDEN'; end if;
 perform public.billing6_lock(f.organization_id);
 perform public.billing_lock_scope(f.organization_id,(select show_id from public.billing_contexts where id=f.billing_context_id));
 select * into f from public.billing_folios where id=p_folio for update;
 perform 1 from public.contacts ct where ct.id in (select payer_contact_id from public.billing_customer_accounts where id=f.payer_customer_account_id union select beneficiary_contact_id from public.billing_charges where folio_id=f.id) order by ct.id for share;
 perform 1 from public.horses h where h.id in(select horse_id from public.billing_charges where folio_id=f.id) order by h.id for share;
 perform 1 from public.organizations where id=f.organization_id for share;
 return f;
end $$;
create function public.billing7_audit(p public.billing_stripe_attempts,p_operation text) returns void language sql set search_path='' as $$
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload)
 values(p.organization_id,p.folio_id,p.actor_id,p_operation,jsonb_build_object('kind','stripe_test_server','attempt_id',p.id),jsonb_build_object('state',p.state,'payment_id',p.payment_id,'receipt_id',p.receipt_id));
$$;
create function public.billing_stripe_configure(p_org uuid,p_platform text,p_connected text,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.billing6_lock(p_org);
 if exists(select 1 from public.billing_stripe_attempts where organization_id=p_org and not resolved and (platform_account<>p_platform or connected_account<>p_connected)) then raise exception 'BILLING_PENDING_PAYMENT'; end if;
 insert into public.billing_stripe_accounts values(p_org,p_platform,p_connected,'test',p_enabled)
 on conflict(organization_id) do update set platform_account=excluded.platform_account,connected_account=excluded.connected_account,enabled=excluded.enabled;
end $$;
create function public.get_billing_stripe_status(p_folio uuid,p_personal boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.billing_folios; a public.billing_stripe_attempts; reserved numeric;
begin
 select * into f from public.billing_folios where id=p_folio;
 if not found or not(case when p_personal then public.billing6_personal_read(f.id) else public.billing6_staff(f.billing_context_id) end) then raise exception 'BILLING_FORBIDDEN'; end if;
 select * into a from public.billing_stripe_attempts where folio_id=f.id order by created_at desc,id desc limit 1;
 reserved:=case when a.id is not null and not a.resolved then a.amount else 0 end;
 return jsonb_build_object('attempt',case when a.id is null then null else jsonb_build_object('id',a.id,'state',a.state,'amount',a.amount,'resolved',a.resolved,'receipt_id',a.receipt_id,'created_at',a.created_at) end,
 'reserved',reserved,'available',(public.billing_snapshot(f.id)->>'balance')::numeric-reserved,'currency',f.currency,
 'can_pay',f.state='open' and public.billing6_owner(f.id) and public.billing6_cap(f.billing_context_id,'engine') and public.billing6_cap(f.billing_context_id,'personal') and coalesce((select enabled from public.billing_stripe_accounts where organization_id=f.organization_id),false));
end $$;
create function public.begin_billing_stripe_attempt(p_request uuid,p_folio uuid,p_amount numeric) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.billing_folios; a public.billing_stripe_attempts; cfg public.billing_stripe_accounts;
begin
 f:=public.billing6_lock_account(p_folio,true);
 if p_request is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'BILLING_INVALID_AMOUNT'; end if;
 select * into a from public.billing_stripe_attempts where organization_id=f.organization_id and actor_id=public.current_profile_id() and request_id=p_request;
 if found then
  if a.folio_id<>f.id or a.amount<>p_amount then raise exception 'BILLING_IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('attempt_id',a.id);
 end if;
 if not public.billing6_cap(f.billing_context_id,'engine') or not public.billing6_cap(f.billing_context_id,'personal') or f.state<>'open' then raise exception 'BILLING_CAPABILITY_DISABLED'; end if;
 select * into cfg from public.billing_stripe_accounts where organization_id=f.organization_id and enabled;
 if not found then raise exception 'BILLING_STRIPE_DISABLED'; end if;
 if exists(select 1 from public.billing_stripe_attempts where folio_id=f.id and not resolved) then raise exception 'BILLING_PENDING_PAYMENT'; end if;
 if p_amount>(public.billing_snapshot(f.id)->>'balance')::numeric then raise exception 'BILLING_PAYMENT_EXCEEDS_BALANCE'; end if;
 insert into public.billing_stripe_attempts(organization_id,context_id,folio_id,payer_account_id,actor_id,platform_account,connected_account,amount,currency,request_id)
 values(f.organization_id,f.billing_context_id,f.id,f.payer_customer_account_id,public.current_profile_id(),cfg.platform_account,cfg.connected_account,p_amount,f.currency,p_request) returning * into a;
 -- Starting a provider operation invalidates a recap, but not the complete-fees attestation.
 insert into public.billing_checkout_state(folio_id) values(f.id) on conflict(folio_id) do update set revision=public.billing_checkout_state.revision+1;
 perform public.billing7_audit(a,'stripe_attempt');
 return jsonb_build_object('attempt_id',a.id);
end $$;
-- Authentication for resume/cancel is always repeated, even when payment capability is withdrawn.
create function public.authorize_billing_stripe_attempt(p_attempt uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare a public.billing_stripe_attempts;
begin
 select * into a from public.billing_stripe_attempts where id=p_attempt;
 if not found or not public.billing6_personal_read(a.folio_id) then raise exception 'BILLING_FORBIDDEN'; end if;
 return a.id;
end $$;
create function public.billing_stripe_attempt_private(p_attempt uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(a) from public.billing_stripe_attempts a where id=p_attempt;
$$;
-- Private provider observation. Receives the object retrieved from Stripe, never browser metadata.
create function public.billing_stripe_observe(p_attempt uuid,p_platform text,p_object jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.billing_stripe_attempts; f public.billing_folios; pid uuid; doc uuid; remaining numeric; due numeric; ch record; target text; snap jsonb;
begin
 select * into a from public.billing_stripe_attempts where id=p_attempt;
 if not found then raise exception 'BILLING_FORBIDDEN'; end if;
 f:=public.billing7_lock(a.folio_id);
 select * into a from public.billing_stripe_attempts where id=p_attempt for update;
 if p_object->>'object' is distinct from 'payment_intent' or p_object->'livemode' is distinct from 'false'::jsonb or p_platform is distinct from a.platform_account
 or p_object->>'capture_method' is distinct from 'automatic' or p_object#>>'{transfer_data,destination}' is distinct from a.connected_account
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
  for ch in select c.id,c.total-coalesce((select sum(amount) from public.billing_payment_allocations where charge_id=c.id),0) due from public.billing_charges c where c.folio_id=f.id order by c.created_at,c.id loop
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
create function public.billing_stripe_receive(p_event text,p_provider text,p_type text,p_platform text,p_live boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_live is distinct from false or p_provider !~ '^pi_[A-Za-z0-9]+$' then raise exception 'BILLING_TEST_ONLY'; end if;
 insert into public.billing_stripe_events(id,provider_id,event_type,platform_account,environment) values(p_event,p_provider,p_type,p_platform,'test') on conflict(id) do nothing;
end $$;
create function public.billing_stripe_event_result(p_event text,p_error text default null) returns void language sql security definer set search_path='' as $$
 update public.billing_stripe_events set attempts=attempts+1,last_error=p_error,processed_at=case when p_error is null then clock_timestamp() else null end where id=p_event;
$$;
-- No direct provider block is exposed to secretary commands: the attempt is the durable block.
alter function public.billing_execute(uuid,jsonb) rename to billing7_execute_previous;
create function public.billing_execute(p_request_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.billing_folios; reserved numeric;
begin
 if p_command->>'operation' in ('payment','finalize') then
  f:=public.billing6_lock_account((p_command->>'folio_id')::uuid);
  -- Preserve durable retries before testing the now-changed balance/reservation.
  if not exists(select 1 from public.billing_operations where organization_id=f.organization_id and actor_id=public.current_profile_id() and request_id=p_request_id) then
   select coalesce(sum(amount),0) into reserved from public.billing_stripe_attempts where folio_id=f.id and not resolved;
   if p_command->>'operation'='finalize' and reserved>0 then raise exception 'BILLING_PENDING_PAYMENT'; end if;
   if p_command->>'operation'='payment' and reserved>0 and (p_command->>'amount')::numeric>(public.billing_snapshot(f.id)->>'balance')::numeric-reserved then raise exception 'BILLING_PAYMENT_RESERVED'; end if;
  end if;
 end if;
 return public.billing7_execute_previous(p_request_id,p_command);
end $$;
alter function public.billing6_reasons(uuid) rename to billing7_reasons_previous;
create function public.billing6_reasons(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 select public.billing7_reasons_previous(p_folio)||case when exists(select 1 from public.billing_stripe_attempts where folio_id=p_folio and not resolved) then '["Une opération est en traitement"]'::jsonb else '[]'::jsonb end;
$$;
-- Privileged HTTP server can read only these provider registries; financial mutations stay RPC-only.
do $$ declare t text; fn record; begin
 foreach t in array array['billing_stripe_accounts','billing_stripe_attempts','billing_stripe_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 execute format('grant select on public.%I to service_role',t);
 end loop;
 for fn in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing7_%' or proname like 'billing_stripe_%' or proname in ('billing_execute','billing6_reasons','begin_billing_stripe_attempt','authorize_billing_stripe_attempt','get_billing_stripe_status')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',fn.sig);
 end loop;
end $$;
grant execute on function public.begin_billing_stripe_attempt(uuid,uuid,numeric),public.authorize_billing_stripe_attempt(uuid),public.get_billing_stripe_status(uuid,boolean) to authenticated;
grant execute on function public.billing_stripe_configure(uuid,text,text,boolean),public.billing_stripe_attempt_private(uuid),public.billing_stripe_observe(uuid,text,jsonb),public.billing_stripe_receive(text,text,text,text,boolean),public.billing_stripe_event_result(text,text) to service_role;
commit;
