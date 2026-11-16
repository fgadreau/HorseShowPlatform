-- Immutable credits and refund ledger entries. No activation or real-money operations.
begin;
alter table public.billing_charges add column credit_for uuid references public.billing_charges(id);
alter table public.billing_charges drop constraint billing_charges_source_type_check;
alter table public.billing_charges add constraint billing_charges_source_type_check check(source_type in ('secretary_sale','hsp_service','reservation','reservation_credit','manual_credit'));
alter table public.billing_charges drop constraint billing_charges_signed_amounts;
alter table public.billing_charges add constraint billing_charges_signed_amounts check(
 (source_type in ('reservation_credit','manual_credit') and subtotal<=0 and tax_amount<=0) or
 (source_type not in ('reservation_credit','manual_credit') and subtotal>=0 and tax_amount>=0));
alter table public.billing_charges add constraint billing_manual_credit_link check((source_type='manual_credit')=(credit_for is not null));

-- A refund is an immutable negative payment, so statements, account lists,
-- supplier totals, finance reports and accounting exports use the same ledger.
alter table public.billing_payments add column refund_of uuid references public.billing_payments(id);
create index billing_payments_refund_of_idx on public.billing_payments(refund_of) where refund_of is not null;
alter table public.billing_payments drop constraint billing_payments_amount_check;
alter table public.billing_payments add constraint billing_payments_amount_check check(
 (refund_of is null and amount>0) or (refund_of is not null and amount<0 and method='stripe_test'));
alter table public.billing_payment_allocations drop constraint billing_payment_allocations_amount_check;
alter table public.billing_payment_allocations add constraint billing_payment_allocations_amount_check check(amount<>0);
create table public.billing_refunds (
 id uuid primary key default gen_random_uuid(), folio_id uuid not null references public.billing_folios(id),
 attempt_id uuid not null references public.billing_stripe_attempts(id), original_payment_id uuid not null references public.billing_payments(id),
 actor_id uuid not null references public.user_profiles(id), request_id uuid not null unique,
 amount numeric(14,2) not null check(amount>0), reason text not null check(length(btrim(reason)) between 5 and 1000),
 state text not null default 'preparing' check(state in ('preparing','pending','requires_action','succeeded','failed','canceled')),
 provider_id text unique, payment_id uuid unique references public.billing_payments(id),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create index billing_refunds_attempt_idx on public.billing_refunds(attempt_id);
create index billing_refunds_folio_idx on public.billing_refunds(folio_id);
create index billing_credits_original_idx on public.billing_charges(credit_for) where credit_for is not null;
alter table public.billing_refunds enable row level security;
revoke all on public.billing_refunds from public,anon,authenticated;
grant select on public.billing_refunds to service_role;

create function public.billing_credit_account(p_request_id uuid,p_folio uuid,p_charge uuid,p_subtotal numeric,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.billing_folios; ch public.billing_charges; prev public.billing_operations; cmd jsonb;
 credited numeric; cid uuid; tax numeric:=0; t record; result jsonb; original_sub numeric;
begin
 f:=public.billing7_lock(p_folio);
 if public.current_profile_id() is null or not coalesce(public.billing6_staff(f.billing_context_id),false) then raise exception 'BILLING_FORBIDDEN';end if;
 cmd:=jsonb_build_object('operation','manual_credit','folio',p_folio,'charge',p_charge,'subtotal',p_subtotal,'reason',p_reason);
 perform pg_advisory_xact_lock(hashtextextended('billing-credit-request:'||p_request_id::text,0));
 select * into prev from public.billing_operations where organization_id=f.organization_id and actor_id=public.current_profile_id() and request_id=p_request_id;
 if found then if prev.request<>cmd then raise exception 'BILLING_IDEMPOTENCY_CONFLICT';end if;return prev.response;end if;
 if not public.billing6_cap(f.billing_context_id,'engine') then raise exception 'BILLING_CAPABILITY_DISABLED';end if;
 if p_request_id is null or p_subtotal is null or p_subtotal<=0 or p_subtotal<>round(p_subtotal,2) or p_subtotal::text in ('NaN','Infinity','-Infinity') then raise exception 'BILLING_INVALID_AMOUNT';end if;
 if p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then raise exception 'BILLING_CREDIT_REASON_REQUIRED';end if;
 if exists(select 1 from public.billing_stripe_attempts where folio_id=f.id and not resolved)
 or exists(select 1 from public.billing_refunds where folio_id=f.id and state in ('preparing','pending','requires_action')) then raise exception 'BILLING_PAYMENT_PENDING';end if;
 -- Closed invoices and posted closing exports are immutable. Correct before closing.
 if f.state<>'open' then raise exception 'BILLING_FOLIO_CLOSED';end if;
 select * into ch from public.billing_charges where id=p_charge and folio_id=f.id and subtotal>0 and supplier='association' and credit_for is null;
 if not found or exists(select 1 from public.reservation_billing_reversals where charge_id=ch.id) then raise exception 'BILLING_CREDIT_INVALID_CHARGE';end if;
 select coalesce(-sum(subtotal),0) into credited from public.billing_charges where credit_for=ch.id;
 if p_subtotal>ch.subtotal-credited then raise exception 'BILLING_CREDIT_EXCEEDS_CHARGE';end if;
 cid:=gen_random_uuid(); original_sub:=ch.subtotal;
 -- Cumulative rounding makes repeated partial credits exactly reverse the original taxes.
 for t in select * from public.billing_charge_taxes where charge_id=ch.id loop
  tax:=tax+round(t.amount*(credited+p_subtotal)/original_sub,2)-round(t.amount*credited/original_sub,2);
 end loop;
 if ch.tax_amount<>coalesce((select sum(amount) from public.billing_charge_taxes where charge_id=ch.id),0) then raise exception 'BILLING_TAX_CONFIG_REQUIRED';end if;
 insert into public.billing_charges(id,organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,horse_id,actor_id,authorization_snapshot,credit_for)
 values(cid,f.organization_id,f.id,f.currency,'manual_credit',p_request_id,ch.product_id,
 coalesce((select case when presentation->>'fee_kind'='back_number' then 'back_number' when presentation->>'fee_kind' like 'judge%' then 'judge_fee' when presentation->>'section'='entry' then 'entry' when presentation->>'section'='reservation' then 'reservation' end from public.billing_charge_presentation where charge_id=ch.id),ch.category),
 'Crédit / Credit — '||btrim(p_reason),1,p_subtotal,-p_subtotal,-tax,ch.exemption_reason,ch.beneficiary_contact_id,ch.horse_id,public.current_profile_id(),jsonb_build_object('kind','manual_credit','original_charge_id',ch.id,'reason',btrim(p_reason)),ch.id);
 insert into public.billing_charge_taxes select cid,tax_rule_id,name,code,jurisdiction,rate,-p_subtotal,-(round(amount*(credited+p_subtotal)/original_sub,2)-round(amount*credited/original_sub,2)) from public.billing_charge_taxes where charge_id=ch.id;
 -- Keep category identity for revenue reports, with its own descriptive credit label.
 insert into public.billing_charge_presentation(charge_id,presentation) select cid,presentation||jsonb_build_object('section','credit') from public.billing_charge_presentation where charge_id=ch.id;
 update public.billing_folios set version=version+1 where id=f.id;
 update public.billing_checkout_state set ready=false,revision=revision+1 where folio_id=f.id;
 perform public.billing6_audit(f.organization_id,f.id,'manual_credit',cmd||jsonb_build_object('credit_id',cid,'tax_amount',tax));
 result:=jsonb_build_object('credit_id',cid,'subtotal',p_subtotal,'tax_amount',tax,'total',p_subtotal+tax);
 insert into public.billing_operations(organization_id,actor_id,request_id,request,response) values(f.organization_id,public.current_profile_id(),p_request_id,cmd,result);
 return result;
end $$;

create function public.begin_billing_refund(p_request uuid,p_folio uuid,p_payment uuid,p_amount numeric,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.billing_folios; a public.billing_stripe_attempts; r public.billing_refunds; available numeric; refundable numeric;
begin
 f:=public.billing7_lock(p_folio);
 if public.current_profile_id() is null or not coalesce(public.billing6_staff(f.billing_context_id),false) then raise exception 'BILLING_FORBIDDEN';end if;
 perform pg_advisory_xact_lock(hashtextextended('billing-refund-request:'||p_request::text,0));
 select * into r from public.billing_refunds where request_id=p_request;
 if found then
  if r.actor_id<>public.current_profile_id() or r.folio_id<>p_folio or r.original_payment_id<>p_payment or r.amount is distinct from p_amount or r.reason is distinct from p_reason then raise exception 'BILLING_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('refund_id',r.id);
 end if;
 if not public.billing6_cap(f.billing_context_id,'engine') then raise exception 'BILLING_CAPABILITY_DISABLED';end if;
 if p_request is null or p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'BILLING_INVALID_AMOUNT';end if;
 if p_reason is null or length(btrim(p_reason)) not between 5 and 1000 then raise exception 'BILLING_CREDIT_REASON_REQUIRED';end if;
 if exists(select 1 from public.billing_stripe_attempts where folio_id=f.id and not resolved)
 or exists(select 1 from public.billing_provider_anomalies where folio_id=f.id)
 or exists(select 1 from public.billing_refunds where folio_id=f.id and state in ('preparing','pending','requires_action')) then raise exception 'BILLING_PAYMENT_PENDING';end if;
 select * into a from public.billing_stripe_attempts where payment_id=p_payment and folio_id=f.id and state='succeeded' and resolved;
 if not found then raise exception 'BILLING_REFUND_INVALID_PAYMENT';end if;
 available:=greatest(0,-(public.billing_snapshot(f.id)->>'balance')::numeric);
 select coalesce(sum(al.amount),0) into refundable from public.billing_payment_allocations al join public.billing_charges ch on ch.id=al.charge_id where al.payment_id=p_payment and ch.supplier='association';
 refundable:=refundable-coalesce((select sum(amount) from public.billing_refunds where original_payment_id=p_payment and state not in ('failed','canceled')),0);
 if p_amount>available or p_amount>refundable then raise exception 'BILLING_REFUND_EXCEEDS_CREDIT';end if;
 insert into public.billing_refunds(folio_id,attempt_id,original_payment_id,actor_id,request_id,amount,reason)
 values(f.id,a.id,p_payment,public.current_profile_id(),p_request,p_amount,p_reason) returning * into r;
 update public.billing_folios set version=version+1 where id=f.id;
 update public.billing_checkout_state set ready=false,revision=revision+1 where folio_id=f.id;
 perform public.billing6_audit(f.organization_id,f.id,'refund_requested',jsonb_build_object('refund_id',r.id,'amount',r.amount,'reason',r.reason));
 return jsonb_build_object('refund_id',r.id);
end $$;

create function public.authorize_billing_refund(p_refund uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.billing_refunds;begin
 select * into r from public.billing_refunds where id=p_refund;
 if public.current_profile_id() is null or not exists(select 1 from public.billing_folios f where f.id=r.folio_id and public.billing6_staff(f.billing_context_id)) then raise exception 'BILLING_FORBIDDEN';end if;
 return jsonb_build_object('refund_id',r.id,'state',r.state);
end $$;
create function public.billing_refund_private(p_refund uuid) returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(r)||jsonb_build_object('provider_payment_intent',a.provider_id,'platform_account',a.platform_account,'connected_account',a.connected_account,'charge_mode',a.charge_mode,'currency',a.currency)
 from public.billing_refunds r join public.billing_stripe_attempts a on a.id=r.attempt_id where r.id=p_refund;
$$;
create function public.billing_refund_observe(p_refund uuid,p_object jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.billing_refunds; a public.billing_stripe_attempts; f public.billing_folios; pid uuid; remaining numeric; al record; part numeric; target text;
begin
 select * into r from public.billing_refunds where id=p_refund;
 if not found then raise exception 'BILLING_FORBIDDEN';end if;
 f:=public.billing7_lock(r.folio_id);
 select * into r from public.billing_refunds where id=p_refund for update;
 select * into a from public.billing_stripe_attempts where id=r.attempt_id;
 if p_object->>'hsp_verified_test' is distinct from 'true' or p_object->>'livemode'='true' or p_object->>'payment_intent' is distinct from a.provider_id
 or p_object->>'currency' is distinct from lower(a.currency) or (p_object->>'amount')::numeric is distinct from r.amount*100
 or coalesce(p_object->>'id','') !~ '^re_[A-Za-z0-9]+$' or (r.provider_id is not null and r.provider_id<>p_object->>'id') then raise exception 'BILLING_REFUND_PROVIDER_MISMATCH';end if;
 target:=p_object->>'status';
 if target is null or target not in ('pending','requires_action','succeeded','failed','canceled') then raise exception 'BILLING_REFUND_PROVIDER_MISMATCH';end if;
 if r.state in ('succeeded','failed','canceled') then return jsonb_build_object('refund_id',r.id,'state',r.state);end if;
 if target='succeeded' then
  insert into public.billing_payments(organization_id,folio_id,currency,amount,method,reference,received_at,actor_id,authorization_snapshot,processing_fee_amount,refund_of)
  values(f.organization_id,f.id,f.currency,-r.amount,'stripe_test',p_object->>'id',clock_timestamp(),r.actor_id,jsonb_build_object('kind','stripe_refund','refund_id',r.id,'reason',r.reason),0,r.original_payment_id) returning id into pid;
  remaining:=r.amount;
  for al in select pa.charge_id,pa.amount+coalesce((select sum(ra.amount) from public.billing_payment_allocations ra join public.billing_payments rp on rp.id=ra.payment_id where rp.refund_of=r.original_payment_id and ra.charge_id=pa.charge_id),0) available
   from public.billing_payment_allocations pa join public.billing_charges ch on ch.id=pa.charge_id where pa.payment_id=r.original_payment_id and ch.supplier='association' order by pa.charge_id loop
   part:=least(remaining,al.available);
   if part>0 then insert into public.billing_payment_allocations values(f.id,pid,al.charge_id,-part);remaining:=remaining-part;end if;
  end loop;
  if remaining<>0 then raise exception 'BILLING_ALLOCATION_TOTAL_MISMATCH';end if;
 end if;
 update public.billing_refunds set state=target,provider_id=p_object->>'id',payment_id=pid,updated_at=clock_timestamp() where id=r.id;
 update public.billing_folios set version=version+1 where id=f.id;
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload)
 values(f.organization_id,f.id,r.actor_id,'refund_'||target,jsonb_build_object('kind','stripe_refund','refund_id',r.id),jsonb_build_object('provider_id',p_object->>'id','amount',r.amount,'reason',r.reason));
 return jsonb_build_object('refund_id',r.id,'state',target);
end $$;

-- Pending refunds block closure and new collection even when an external response is lost.
alter function public.get_billing_stripe_status(uuid,boolean) rename to billing_credit_stripe_status_base;
create function public.get_billing_stripe_status(p_folio uuid,p_personal boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb;begin
 d:=public.billing_credit_stripe_status_base(p_folio,p_personal);
 if exists(select 1 from public.billing_refunds where folio_id=p_folio and state in ('preparing','pending','requires_action')) then
  d:=d||jsonb_build_object('available',0,'can_pay',false);
 end if;return d;
end $$;

alter function public.billing_ui_detail(uuid,boolean) rename to billing_credit_ui_detail_base;
create function public.billing_ui_detail(p_folio uuid,p_personal boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; staff boolean; pending boolean;
begin
 d:=public.billing_credit_ui_detail_base(p_folio,p_personal);
 staff:=not p_personal and coalesce((d#>>'{actions,payment}')::boolean,false);
 pending:=exists(select 1 from public.billing_refunds where folio_id=p_folio and state in ('preparing','pending','requires_action'));
 d:=jsonb_set(d,'{actions,credit}',to_jsonb(staff and d->>'state'='open' and not pending));
 d:=jsonb_set(d,'{actions,refund}',to_jsonb(staff));
 d:=jsonb_set(d,'{payments}',coalesce((select jsonb_agg(p||jsonb_build_object('refund_of',pm.refund_of) order by n) from jsonb_array_elements(d->'payments') with ordinality x(p,n) join public.billing_payments pm on pm.id=(p->>'id')::uuid),'[]'));
 return d||jsonb_build_object('credits',coalesce((select jsonb_agg(jsonb_build_object('id',ch.id,'description',ch.description,'remaining_subtotal',ch.subtotal+coalesce((select sum(cr.subtotal) from public.billing_charges cr where cr.credit_for=ch.id),0)) order by ch.created_at,ch.id) from public.billing_charges ch where ch.folio_id=p_folio and ch.subtotal>0 and ch.supplier='association' and not exists(select 1 from public.reservation_billing_reversals where charge_id=ch.id)),'[]'),
 'refunds',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'amount',r.amount,'reason',r.reason,'state',r.state,'created_at',r.created_at) order by r.created_at,r.id) from public.billing_refunds r where r.folio_id=p_folio),'[]'),
 'refundable_payments',case when staff then coalesce((select jsonb_agg(jsonb_build_object('id',pm.id,'amount',pm.amount,'received_at',pm.received_at,'refundable',greatest(0,coalesce((select sum(pa.amount) from public.billing_payment_allocations pa join public.billing_charges ch on ch.id=pa.charge_id where pa.payment_id=pm.id and ch.supplier='association'),0)-coalesce((select sum(r.amount) from public.billing_refunds r where r.original_payment_id=pm.id and r.state not in ('failed','canceled')),0)))) from public.billing_payments pm join public.billing_stripe_attempts a on a.payment_id=pm.id where pm.folio_id=p_folio and a.state='succeeded'),'[]') else '[]'::jsonb end);
end $$;

-- An already credited original cannot also be reversed by reservation/cancellation workflows.
alter function public.reservation_reverse_charge(uuid) rename to billing_credit_reverse_base;
create function public.reservation_reverse_charge(p_charge uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.billing_charges where credit_for=p_charge) then raise exception 'BILLING_CHARGE_ALREADY_CREDITED';end if;
 perform public.billing_credit_reverse_base(p_charge);
end $$;

-- Do not flag an HSP-managed refund as an unexplained external refund.
create function public.billing_refund_provider_total(p_attempt uuid) returns numeric language sql security definer set search_path='' as $$
 select coalesce(sum(amount)*100,0) from public.billing_refunds where attempt_id=p_attempt and provider_id is not null and state not in ('failed','canceled');
$$;
create function public.billing_pending_refunds(p_attempt uuid) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id)),'[]') from public.billing_refunds where attempt_id=p_attempt and state in ('preparing','pending','requires_action');
$$;

-- Signed allocations are allowed only against the same original payment/charge.
create function public.billing_refund_allocation_guard() returns trigger language plpgsql set search_path='' as $$
declare p public.billing_payments;begin
 select * into p from public.billing_payments where id=new.payment_id;
 if (p.refund_of is null and new.amount<=0) or (p.refund_of is not null and (new.amount>=0 or not exists(select 1 from public.billing_payment_allocations where payment_id=p.refund_of and charge_id=new.charge_id))) then raise exception 'BILLING_INVALID_ALLOCATION';end if;
 return new;
end $$;
create trigger billing_refund_allocation_guard before insert on public.billing_payment_allocations for each row execute function public.billing_refund_allocation_guard();
-- Canceled charges can receive refund reversals, but cannot receive new money.
create or replace function public.reservation_allocation_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.amount>0 and exists(select 1 from public.reservation_billing_reversals where new.charge_id in (charge_id,credit_id)) then raise exception 'RESERVATION_CHARGE_REVERSED';end if;
 return new;
end $$;
create function public.billing_refund_pending_guard() returns trigger language plpgsql set search_path='' as $$
declare fid uuid;begin
 if tg_table_name='billing_folios' then
  if new.state=old.state then return new;end if;fid:=new.id;
 else fid:=new.folio_id;end if;
 if exists(select 1 from public.billing_refunds where folio_id=fid and state in ('preparing','pending','requires_action')) then
  if tg_table_name='billing_payments' then if new.refund_of is not null then return new;end if;end if;
  raise exception 'BILLING_PAYMENT_PENDING';
 end if;
 return new;
end $$;
create trigger billing_refund_pending_guard before update on public.billing_folios for each row execute function public.billing_refund_pending_guard();
create trigger billing_refund_pending_guard before insert on public.billing_payments for each row execute function public.billing_refund_pending_guard();
create trigger billing_refund_pending_guard before insert on public.billing_stripe_attempts for each row execute function public.billing_refund_pending_guard();
create trigger billing_refund_pending_guard before insert on public.billing_charges for each row execute function public.billing_refund_pending_guard();
create function public.billing_credited_reversal_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from public.billing_charges where credit_for=new.charge_id) then raise exception 'BILLING_CHARGE_ALREADY_CREDITED';end if;
 return new;
end $$;
create trigger billing_credited_reversal_guard before insert on public.reservation_billing_reversals for each row execute function public.billing_credited_reversal_guard();
alter function public.billing6_reasons(uuid) rename to billing_credit_reasons_base;
create function public.billing6_reasons(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 select public.billing_credit_reasons_base(p_folio)||case when exists(select 1 from public.billing_refunds where folio_id=p_folio and state in ('preparing','pending','requires_action')) then '["Une opération est en traitement"]'::jsonb else '[]'::jsonb end;
$$;
create function public.billing_credit_labels() returns trigger language plpgsql set search_path='' as $$
begin
 if new.credit_for is not null then new.description_i18n:=jsonb_build_object('fr','Crédit — '||(new.authorization_snapshot->>'reason'),'en','Credit — '||(new.authorization_snapshot->>'reason'));end if;
 return new;
end $$;
-- Reconciliation also revisits already paid attempts with an unfinished refund.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.billing_hosted_next(uuid,text,uuid)'::regprocedure);
 if position('and not a.resolved and' in definition)=0 then raise exception 'BILLING_HOSTED_NEXT_CONTRACT_CHANGED';end if;
 execute replace(definition,'and not a.resolved and','and (not a.resolved or exists(select 1 from public.billing_refunds rr where rr.attempt_id=a.id and rr.state in (''preparing'',''pending'',''requires_action''))) and');
end $$;
revoke all on function public.billing_credited_reversal_guard() from public,anon,authenticated,service_role;
create trigger zz_billing_credit_labels before insert on public.billing_charges for each row execute function public.billing_credit_labels();
-- Supplier shares of a refund have the same negative sign as its payment.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.billing_supplier_payment(jsonb,jsonb,numeric)'::regprocedure);
 if position('if amount<=0 or assoc+hsp<>amount' in definition)=0 then raise exception 'BILLING_SUPPLIER_PAYMENT_CONTRACT_CHANGED';end if;
 execute replace(definition,'if amount<=0 or assoc+hsp<>amount','if amount=0 or assoc+hsp<>amount or (amount<0 and (assoc>0 or hsp>0))');
end $$;
revoke all on function public.billing_pending_refunds(uuid),public.billing_refund_allocation_guard(),public.billing_refund_pending_guard(),public.billing_credit_reasons_base(uuid),public.billing6_reasons(uuid),public.billing_credit_labels() from public,anon,authenticated,service_role;
revoke all on function public.billing_credit_account(uuid,uuid,uuid,numeric,text),public.begin_billing_refund(uuid,uuid,uuid,numeric,text),public.authorize_billing_refund(uuid),public.billing_refund_private(uuid),public.billing_refund_observe(uuid,jsonb),public.billing_refund_provider_total(uuid),public.billing_ui_detail(uuid,boolean),public.get_billing_stripe_status(uuid,boolean),public.reservation_reverse_charge(uuid),public.billing_credit_reverse_base(uuid),public.billing_credit_ui_detail_base(uuid,boolean),public.billing_credit_stripe_status_base(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.billing_credit_account(uuid,uuid,uuid,numeric,text),public.begin_billing_refund(uuid,uuid,uuid,numeric,text),public.authorize_billing_refund(uuid),public.billing_ui_detail(uuid,boolean),public.get_billing_stripe_status(uuid,boolean) to authenticated;
grant execute on function public.billing_refund_private(uuid),public.billing_refund_observe(uuid,jsonb),public.billing_refund_provider_total(uuid) to service_role;
grant execute on function public.billing_pending_refunds(uuid) to service_role;
-- A payment fully refunded in the same export period has no net journal entry.
-- Keep real processing fees, while excluding zero debit/credit lines.
do $$declare definition text;needle text:='group by received_date,method,origin_context_id,currency,origin_name order by received_date,origin_name,method';totals text:='select coalesce(sum((x->>''debit'')::numeric),0),coalesce(sum((x->>''credit'')::numeric),0) into debit_total,credit_total from jsonb_array_elements(lines) x;';begin
 definition:=pg_get_functiondef('private.billing_accounting_payload(uuid,text,text,date,date,date)'::regprocedure);
 if position(needle in definition)=0 or position(totals in definition)=0 then raise exception 'BILLING_ACCOUNTING_REFUND_CONTRACT_CHANGED';end if;
 definition:=replace(definition,needle,'group by received_date,method,origin_context_id,currency,origin_name having sum(association_amount)<>0 or sum(association_fee)<>0 order by received_date,origin_name,method');
 definition:=replace(definition,totals,'select coalesce(jsonb_agg(x),''[]''::jsonb) into lines from jsonb_array_elements(lines) x where (x->>''debit'')::numeric<>0 or (x->>''credit'')::numeric<>0; '||totals);
 execute definition;
end $$;
commit;
