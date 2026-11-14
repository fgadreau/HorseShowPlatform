begin;
alter table public.billing_stripe_attempts add column capture_method text not null default 'automatic' check(capture_method in ('automatic','manual'));
alter table public.billing_stripe_attempts add column authorization_entry_ids uuid[] not null default '{}';
alter table public.billing_stripe_attempts add column authorized_amount numeric(14,2);
alter table public.billing_stripe_attempts add column planned_capture_amount numeric(14,2);
alter table public.billing_stripe_attempts drop constraint billing_stripe_attempts_state_check;
alter table public.billing_stripe_attempts add constraint billing_stripe_attempts_state_check check(state in ('preparing','requires_payment_method','requires_confirmation','requires_action','requires_capture','processing','succeeded','canceled','anomaly'));
create or replace function public.entry_cancellation_applying(p_folio uuid,p_charge uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.entry_cancellation_apply_context c where c.folio_id=p_folio and c.transaction_id=txid_current() and (p_charge is null or p_charge=any(c.charge_ids)))
 and not exists(select 1 from public.billing_stripe_attempts where folio_id=p_folio and not resolved and planned_capture_amount is not null);
$$;

create function public.begin_entry_preauthorization(p_request uuid,p_folio uuid,p_amount numeric) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.billing_folios;s public.shows;r jsonb;a public.billing_stripe_attempts;ids uuid[];balance numeric;expected numeric;
begin
 f:=public.billing6_lock_account(p_folio,true);
 select sh.* into s from public.shows sh join public.billing_contexts c on c.show_id=sh.id where c.id=f.billing_context_id;
 if s.id is null or s.entry_payment_policy<>'card_on_file_preauth' then raise exception 'BILLING_PREAUTH_NOT_CONFIGURED';end if;
 if s.entry_preauth_timing='show_start' and clock_timestamp() < ((s.start_date+s.entry_preauth_time) at time zone s.timezone) then raise exception 'BILLING_PREAUTH_NOT_DUE';end if;
 select * into a from public.billing_stripe_attempts where organization_id=f.organization_id and actor_id=public.current_profile_id() and request_id=p_request;
 if found then
  if a.folio_id<>f.id or a.amount<>p_amount or a.capture_method<>'manual' then raise exception 'BILLING_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('attempt_id',a.id);
 end if;
 balance:=(public.billing_snapshot(f.id)->>'balance')::numeric;
 expected:=round(balance*(1+case when s.entry_preauth_amount_strategy='entry_balance_with_margin' then s.entry_preauth_margin_percent else 0 end/100),2);
 if p_amount is distinct from expected then raise exception 'BILLING_PREAUTH_FULL_BALANCE_REQUIRED';end if;
 r:=public.begin_billing_stripe_attempt(p_request,p_folio,balance);
 select array_agg(e.id order by e.id) into ids from public.entries e
 join public.billing_customer_accounts ca on ca.payer_contact_id=e.payer_contact_id and ca.id=f.payer_customer_account_id
 where e.show_id=s.id and e.status='pending_checkout';
 update public.billing_stripe_attempts set capture_method='manual',amount=p_amount,authorized_amount=p_amount,authorization_entry_ids=coalesce(ids,'{}') where id=(r->>'attempt_id')::uuid;
 return r;
end $$;

-- Freeze the explicitly requested capture amount before the provider call.
-- Retries reuse this amount even if the HTTP response was lost.
create function public.authorize_entry_authorization_settlement(p_attempt uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare a public.billing_stripe_attempts;
begin
 select * into a from public.billing_stripe_attempts where id=p_attempt;
 if not found or a.capture_method<>'manual' or not (
  public.billing6_personal_read(a.folio_id) or
  (a.state in ('requires_capture','succeeded','canceled') and public.billing6_staff(a.context_id) and public.billing6_cap(a.context_id,'engine'))
 ) then raise exception 'BILLING_FORBIDDEN';end if;
 return a.id;
end $$;
create function public.prepare_entry_authorization_capture(p_attempt uuid) returns numeric language plpgsql security definer set search_path='' as $$
declare a public.billing_stripe_attempts;f public.billing_folios;capture_amount numeric;
begin
 perform public.authorize_entry_authorization_settlement(p_attempt);
 select * into a from public.billing_stripe_attempts where id=p_attempt;
 f:=public.billing7_lock(a.folio_id);
 select * into a from public.billing_stripe_attempts where id=p_attempt for update;
 if a.capture_method<>'manual' or a.state not in ('requires_capture','succeeded') then raise exception 'BILLING_PREAUTH_CAPTURE_REQUIRED';end if;
 if a.planned_capture_amount is not null then return a.planned_capture_amount;end if;
 if f.state<>'open' then raise exception 'BILLING_FOLIO_CLOSED';end if;
 capture_amount:=(public.billing_snapshot(f.id)->>'balance')::numeric;
 if capture_amount<=0 or capture_amount>a.authorized_amount or capture_amount<a.application_fee_amount then raise exception 'BILLING_PREAUTH_CAPTURE_BALANCE';end if;
 update public.billing_stripe_attempts set planned_capture_amount=capture_amount where id=a.id;
 return capture_amount;
end $$;

alter function public.billing_stripe_observe(uuid,text,jsonb) rename to entry_automatic_stripe_observe;
revoke all on function public.entry_automatic_stripe_observe(uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.billing_stripe_observe(p_attempt uuid,p_platform text,p_object jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.billing_stripe_attempts;f public.billing_folios;result jsonb;target text;en uuid;
begin
 select * into a from public.billing_stripe_attempts where id=p_attempt;
 if not found then raise exception 'BILLING_FORBIDDEN';end if;
 if a.capture_method='automatic' then return public.entry_automatic_stripe_observe(p_attempt,p_platform,p_object);end if;
 f:=public.billing7_lock(a.folio_id);
 select * into a from public.billing_stripe_attempts where id=p_attempt for update;
 if p_object->>'object' is distinct from 'payment_intent' or p_object->'livemode' is distinct from 'false'::jsonb
 or p_object->>'capture_method' is distinct from 'manual' or p_platform is distinct from a.platform_account
 or p_object->>'currency' is distinct from lower(a.currency)
 or (p_object->>'amount')::numeric is distinct from a.authorized_amount*100
 or (a.provider_id is not null and a.provider_id is distinct from p_object->>'id') or coalesce(p_object->>'id','') !~ '^pi_[A-Za-z0-9]+$'
 or (a.charge_mode='destination' and p_object#>>'{transfer_data,destination}' is distinct from a.connected_account)
 or (a.charge_mode='direct' and (p_object->>'hsp_verified_account' is distinct from a.connected_account or coalesce(p_object->'transfer_data','null')<>'null'::jsonb or coalesce((p_object->>'application_fee_amount')::numeric,0) is distinct from a.application_fee_amount*100)) then
  if not a.resolved then update public.billing_stripe_attempts set state='anomaly',last_error='PROVIDER_MISMATCH' where id=a.id;end if;
  return jsonb_build_object('state','anomaly');
 end if;
 if a.resolved then return jsonb_build_object('state',a.state,'receipt_id',a.receipt_id);end if;
 if a.state='anomaly' then return jsonb_build_object('state','anomaly');end if;
 target:=p_object->>'status';
 if target='requires_capture' then
  if f.state<>'open' or (p_object->>'amount_capturable')::numeric is distinct from a.authorized_amount*100 or coalesce((p_object->>'amount_received')::numeric,0)<>0 then
   update public.billing_stripe_attempts set state='anomaly',last_error='PROVIDER_CAPTURE_AMOUNT' where id=a.id;return jsonb_build_object('state','anomaly');
  end if;
  update public.billing_stripe_attempts set state='requires_capture',provider_id=p_object->>'id',updated_at=clock_timestamp() where id=a.id returning * into a;
  foreach en in array a.authorization_entry_ids loop
   insert into public.entry_activation_events(entry_id,kind,provider_reference) select en,'preauthorization',p_object->>'id' where exists(select 1 from public.entries where id=en and status='pending_checkout') on conflict do nothing;
   update public.entries set status='active' where id=en and status='pending_checkout';
  end loop;
  perform public.billing7_audit(a,'entry_preauthorization_verified');
  return jsonb_build_object('state','requires_capture');
 end if;
 if target='succeeded' then
  if a.planned_capture_amount is null or (p_object->>'amount_received')::numeric is distinct from a.planned_capture_amount*100 then
   update public.billing_stripe_attempts set state='anomaly',last_error='UNPLANNED_CAPTURE' where id=a.id;return jsonb_build_object('state','anomaly');
  end if;
  update public.billing_stripe_attempts set amount=planned_capture_amount where id=a.id;
  p_object:=p_object||jsonb_build_object('amount',a.planned_capture_amount*100);
 end if;
 -- Reuse the tested receipt, immutable accounting and allocation path only
 -- after the separately validated manual authorization/capture contract.
 result:=public.entry_automatic_stripe_observe(p_attempt,p_platform,p_object||jsonb_build_object('capture_method','automatic'));
 return result;
end $$;

revoke all on function public.authorize_entry_authorization_settlement(uuid),public.begin_entry_preauthorization(uuid,uuid,numeric),public.prepare_entry_authorization_capture(uuid),public.billing_stripe_observe(uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.authorize_entry_authorization_settlement(uuid),public.begin_entry_preauthorization(uuid,uuid,numeric),public.prepare_entry_authorization_capture(uuid) to authenticated;
grant execute on function public.billing_stripe_observe(uuid,text,jsonb) to service_role;

alter function public.billing_ui_detail(uuid,boolean) rename to entry_previous_billing_ui_detail;
revoke all on function public.entry_previous_billing_ui_detail(uuid,boolean) from public,anon,authenticated,service_role;
create function public.billing_ui_detail(p_folio uuid,p_personal boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;s public.shows;amount numeric;
begin
 result:=public.entry_previous_billing_ui_detail(p_folio,p_personal);
 select sh.* into s from public.shows sh join public.billing_contexts c on c.show_id=sh.id join public.billing_folios f on f.billing_context_id=c.id where f.id=p_folio;
 amount:=round((result->>'balance')::numeric*(1+case when s.entry_preauth_amount_strategy='entry_balance_with_margin' then s.entry_preauth_margin_percent else 0 end/100),2);
 return result||jsonb_build_object('preauthorization',jsonb_build_object('configured',coalesce(s.entry_payment_policy='card_on_file_preauth',false),'due',s.entry_preauth_timing='manual' or clock_timestamp()>=((s.start_date+s.entry_preauth_time) at time zone s.timezone),'amount',amount,'timing',s.entry_preauth_timing))
 ||jsonb_build_object('entry_activation',(select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'status',e.status,'basis',e.activation_basis)),'[]') from public.entries e join public.billing_customer_accounts ca on ca.payer_contact_id=e.payer_contact_id join public.billing_folios f on f.payer_customer_account_id=ca.id join public.billing_contexts c on c.id=f.billing_context_id and c.show_id=e.show_id where f.id=p_folio));
end $$;
revoke all on function public.billing_ui_detail(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.billing_ui_detail(uuid,boolean) to authenticated;
commit;
