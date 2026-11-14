begin;
-- A transaction-scoped capability, populated only by the authorized decision RPC.
create table public.entry_cancellation_apply_context(request_id uuid primary key references public.entry_cancellation_requests(id),folio_id uuid not null,transaction_id bigint not null,charge_ids uuid[] not null);
alter table public.entry_cancellation_apply_context enable row level security;
revoke all on public.entry_cancellation_apply_context from public,anon,authenticated,service_role;
create function public.entry_cancellation_applying(p_folio uuid,p_charge uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.entry_cancellation_apply_context c where c.folio_id=p_folio and c.transaction_id=txid_current() and (p_charge is null or p_charge=any(c.charge_ids)));
$$;

-- Keep the original immutable reversal path. Its paid-charge exception is limited
-- to the precise charges of the cancellation being applied in this transaction.
create or replace function public.reservation_reverse_charge(p_charge uuid) returns void language plpgsql security definer set search_path='' as $$
declare ch public.billing_charges;f public.billing_folios;credit uuid;applying boolean;
begin
 select * into ch from public.billing_charges where id=p_charge;
 select * into f from public.billing_folios where id=ch.folio_id for update;
 if f.state<>'open' then raise exception 'BILLING_FOLIO_CLOSED';end if;
 applying:=public.entry_cancellation_applying(f.id,ch.id);
 if exists(select 1 from public.billing_stripe_attempts where folio_id=f.id and not resolved and (state<>'requires_capture' or not applying))
 or (not applying and exists(select 1 from public.billing_payment_allocations where charge_id=ch.id)) then raise exception 'RESERVATION_CHARGE_HAS_PAYMENT';end if;
 if exists(select 1 from public.reservation_billing_reversals where charge_id=ch.id) then return;end if;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,horse_id,actor_id,authorization_snapshot)
 values(ch.organization_id,ch.folio_id,ch.currency,'reservation_credit',gen_random_uuid(),ch.product_id,ch.category,'Annulation / Cancellation — '||ch.description,ch.quantity,ch.unit_price,-ch.subtotal,-ch.tax_amount,ch.exemption_reason,ch.beneficiary_contact_id,ch.horse_id,public.current_profile_id(),jsonb_build_object('kind','reservation_reversal','original_charge_id',ch.id)) returning id into credit;
 insert into public.billing_charge_taxes select credit,tax_rule_id,name,code,jurisdiction,rate,-base,-amount from public.billing_charge_taxes where charge_id=ch.id;
 insert into public.billing_charge_presentation(charge_id,presentation) select credit,presentation from public.billing_charge_presentation where charge_id=ch.id;
 insert into public.billing_charge_entry_identity select credit,gen_random_uuid(),class_id,assignment_id,occurrence_id,fee_kind,identity,presentation from public.billing_charge_entry_identity where charge_id=ch.id;
 insert into public.reservation_billing_reversals values(ch.id,credit,public.current_profile_id(),clock_timestamp());
 update public.billing_folios set version=version+1 where id=f.id;
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload) values(ch.organization_id,f.id,public.current_profile_id(),'reservation_reversal',jsonb_build_object('actor',public.current_profile_id()),jsonb_build_object('charge_id',ch.id,'credit_id',credit));
end $$;
do $$declare definition text;needle text:='if exists(select 1 from public.billing_stripe_attempts where folio_id=f.id and not resolved) then raise exception ''BILLING_PAYMENT_PENDING'';end if;';begin
 definition:=pg_get_functiondef('public.event_billing_set_line(text,uuid,uuid,uuid,uuid,uuid,text,text,numeric,numeric,boolean,boolean,text)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'ENTRY_EVENT_WRITER_CONTRACT_CHANGED';end if;
 execute replace(definition,needle,'if exists(select 1 from public.billing_stripe_attempts where folio_id=f.id and not resolved and (state<>''requires_capture'' or not public.entry_cancellation_applying(f.id))) then raise exception ''BILLING_PAYMENT_PENDING'';end if;');
end $$;

-- Effective credit basis: cancelled classes/late fees and the actual change in
-- the single judge fee selected by the existing highest-entry-fee rule.
create function public.entry_cancellation_basis(p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.entry_cancellation_requests;f public.billing_folios;ctx uuid;keys text[];ids uuid[];judge_key text;old_judge public.billing_charges;remaining record;new_judge numeric:=0;new_taxes jsonb:='[]';taxes jsonb;sub numeric;tax numeric;unchanged boolean:=false;
begin
 select * into r from public.entry_cancellation_requests where id=p_request;
 select context_id into ctx from public.reservation_billing_contexts where show_id=r.show_id;
 if ctx is null then raise exception 'ENTRY_ACCOUNT_CONFIGURATION_REQUIRED';end if;
 select fol.* into f from public.billing_folios fol join public.billing_customer_accounts c on c.id=fol.payer_customer_account_id where fol.billing_context_id=ctx and c.payer_contact_id=r.payer_contact_id;
 if f.id is null then raise exception 'ENTRY_ACCOUNT_CONFIGURATION_REQUIRED';end if;
 if f.state<>'open' then raise exception 'ENTRY_ACCOUNT_CLOSED';end if;
 select array_agg(k) into keys from (select 'entry:'||id k from unnest(r.entry_ids) id union all select 'late:'||id from unnest(r.entry_ids) id) x;
 judge_key:='judge:'||r.show_id||':'||r.payer_contact_id||':'||r.horse_id||':'||coalesce(r.rider_contact_id::text,'none')||':'||r.block_id;
 select c.* into old_judge from public.event_billing_lines l join public.billing_charges c on c.id=l.charge_id where l.line_key=judge_key;
 select en.id,c.judge_fee,c.name into remaining from public.entries en join public.classes c on c.id=en.class_id
 where c.block_id=r.block_id and en.show_id=r.show_id and en.horse_id=r.horse_id and en.payer_contact_id=r.payer_contact_id
 and en.rider_contact_id is not distinct from r.rider_contact_id and en.status not in ('cancelled','scratched') and not en.id=any(r.entry_ids)
 order by coalesce(en.base_fee,c.entry_fee,0) desc,en.created_at,en.id limit 1;
 new_judge:=coalesce(remaining.judge_fee,0);
 if old_judge.id is not null and remaining.id is not null then
  select (snapshot->>'price')::numeric=new_judge and snapshot->>'description'='Frais de juge / Judge fee — '||(select name from public.horses where id=r.horse_id)||' / '||(select name from public.blocks where id=r.block_id)||' / '||remaining.name
  into unchanged from public.event_billing_lines where line_key=judge_key;
 end if;
 if unchanged then
  select coalesce(jsonb_agg(jsonb_build_object('id',tax_rule_id,'name',name,'code',code,'jurisdiction',jurisdiction,'rate',rate,'base',base,'amount',amount)),'[]') into new_taxes from public.billing_charge_taxes where charge_id=old_judge.id;
 else
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code,'jurisdiction',jurisdiction,'rate',rate,'base',new_judge,'amount',round(new_judge*rate/100,2))),'[]') into new_taxes from public.billing_tax_rules where context_id=ctx and new_judge>0;
 end if;
 select coalesce(array_agg(charge_id order by charge_id),'{}') into ids from public.event_billing_lines where line_key=any(keys) or line_key=judge_key;
 select coalesce(sum(subtotal),0)-new_judge into sub from public.billing_charges where id=any(ids);
 with rows as (
  select tax_rule_id id,name,code,jurisdiction,rate,base,amount from public.billing_charge_taxes where charge_id=any(ids)
  union all select (t->>'id')::uuid,t->>'name',t->>'code',t->>'jurisdiction',(t->>'rate')::numeric,-(t->>'base')::numeric,-(t->>'amount')::numeric from jsonb_array_elements(new_taxes) t
 ), grouped as(select id,name,code,jurisdiction,rate,sum(base) base,sum(amount) amount from rows group by id,name,code,jurisdiction,rate)
 select coalesce(jsonb_agg(to_jsonb(grouped) order by code,id),'[]'),coalesce(sum(amount),0) into taxes,tax from grouped;
 if sub<0 or tax<0 or exists(select 1 from jsonb_array_elements(taxes) t where (t->>'amount')::numeric<0) then raise exception 'ENTRY_CANCELLATION_COMPLEX_TAX_REVIEW';end if;
 return jsonb_build_object('folio_id',f.id,'version',f.version,'currency',f.currency,'subtotal',sub,'tax_amount',tax,'total',sub+tax,'taxes',taxes,'charge_ids',to_jsonb(ids));
end $$;

create function public.entry_money_breakdown(p_amount numeric,p_mode text,p_rules jsonb) returns jsonb language plpgsql set search_path='' as $$
declare base numeric;tax numeric:=0;rate numeric;items jsonb:='[]';t jsonb;amount numeric;delta numeric;last_index integer;
begin
 if p_amount is null or p_amount<0 or p_amount<>round(p_amount,2) or p_amount>999999999 or p_mode is null or p_mode not in ('exclusive','inclusive') then raise exception 'ENTRY_INVALID_AMOUNT';end if;
 select coalesce(sum((v->>'rate')::numeric),0) into rate from jsonb_array_elements(p_rules) v;
 base:=case when p_mode='inclusive' then round(p_amount/(1+rate/100),2) else p_amount end;
 for t in select value from jsonb_array_elements(p_rules) loop
  amount:=round(base*(t->>'rate')::numeric/100,2);tax:=tax+amount;
  items:=items||jsonb_build_array(t||jsonb_build_object('base',base,'amount',amount));
 end loop;
 if p_mode='inclusive' and jsonb_array_length(items)>0 then
  delta:=p_amount-base-tax;last_index:=jsonb_array_length(items)-1;
  items:=jsonb_set(items,array[last_index::text,'amount'],to_jsonb((items->last_index->>'amount')::numeric+delta));tax:=tax+delta;
 end if;
 return jsonb_build_object('subtotal',base,'tax_amount',tax,'total',base+tax,'taxes',items);
end $$;

create function public.entry_cancellation_quote(p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.entry_cancellation_requests;b jsonb;rules jsonb;
begin
 select * into r from public.entry_cancellation_requests where id=p_request;
 if not found or not public.entry_lifecycle_staff(r.organization_id,r.show_id) then raise exception 'ENTRY_FORBIDDEN';end if;
 perform public.billing6_lock(r.organization_id);perform public.billing_lock_scope(r.organization_id,r.show_id);perform public.entry_draw_lock(r.block_id);
 if r.status<>'pending' then raise exception 'ENTRY_CANCELLATION_ALREADY_DECIDED';end if;
 if public.entry_draw_generated(r.block_id) then raise exception 'ENTRY_DRAW_GENERATED_USE_SCRATCH';end if;
 b:=public.entry_cancellation_basis(r.id);
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'code',t.code,'jurisdiction',t.jurisdiction,'rate',t.rate) order by t.code,t.id),'[]') into rules from public.billing_tax_rules t join public.reservation_billing_contexts c on c.context_id=t.context_id where c.show_id=r.show_id;
 b:=b||jsonb_build_object('fee_tax_rules',rules);
 return b||jsonb_build_object('signature',md5(b::text));
end $$;

create function public.entry_insert_adjustment(p_request uuid,p_folio uuid,p_kind text,p_label text,p_amount jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.entry_cancellation_requests;f public.billing_folios;prod uuid;ch uuid;t jsonb;
begin
 if (p_amount->>'total')::numeric=0 then return null;end if;
 select * into r from public.entry_cancellation_requests where id=p_request;
 select * into f from public.billing_folios where id=p_folio;
 select product_id into prod from public.event_billing_products where organization_id=r.organization_id and kind=p_kind;
 if prod is null then
  insert into public.organization_products(organization_id,name,code,category,default_price,tax_applicable) values(r.organization_id,p_label,'ACCOUNT-'||upper(p_kind),'manual',0,true) returning id into prod;
  insert into public.event_billing_products values(r.organization_id,p_kind,prod);
 end if;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,horse_id,actor_id,authorization_snapshot)
 values(r.organization_id,f.id,f.currency,'secretary_sale',gen_random_uuid(),prod,p_kind,p_label,1,(p_amount->>'subtotal')::numeric,(p_amount->>'subtotal')::numeric,(p_amount->>'tax_amount')::numeric,r.payer_contact_id,r.horse_id,public.current_profile_id(),jsonb_build_object('kind',p_kind,'cancellation_request',r.id)) returning id into ch;
 for t in select value from jsonb_array_elements(p_amount->'taxes') loop
  insert into public.billing_charge_taxes values(ch,(t->>'id')::uuid,t->>'name',t->>'code',t->>'jurisdiction',(t->>'rate')::numeric,(t->>'base')::numeric,(t->>'amount')::numeric);
 end loop;
 return ch;
end $$;

create function public.entry_cancellation_calculate(b jsonb,p_decision jsonb) returns jsonb language plpgsql set search_path='' as $$
declare rules jsonb;fee jsonb;credit jsonb;retained jsonb;ratio numeric;credit_base numeric;credit_tax numeric:=0;taxes jsonb:='[]';retained_taxes jsonb:='[]';t jsonb;amt numeric;delta numeric;idx integer;
begin
 rules:=b->'fee_tax_rules';
 fee:=public.entry_money_breakdown((p_decision->>'fee_amount')::numeric,p_decision->>'fee_tax_mode',rules);
 if p_decision->>'credit_mode'='full' then credit_base:=(b->>'subtotal')::numeric;ratio:=1;
 elsif p_decision->>'credit_mode'='none' then credit_base:=0;ratio:=0;
 elsif p_decision->>'credit_mode'='custom' then
  if p_decision->>'credit_tax_mode' is null or p_decision->>'credit_amount' is null or p_decision->>'credit_tax_mode' not in ('exclusive','inclusive') or (p_decision->>'credit_amount')::numeric<0 or (p_decision->>'credit_amount')::numeric>999999999 or (p_decision->>'credit_amount')::numeric<>round((p_decision->>'credit_amount')::numeric,2) then raise exception 'ENTRY_INVALID_AMOUNT';end if;
  if (p_decision->>'credit_amount')::numeric>(case when p_decision->>'credit_tax_mode'='inclusive' then (b->>'total')::numeric else (b->>'subtotal')::numeric end) then raise exception 'ENTRY_CREDIT_EXCEEDS_CANCELLED_FEES';end if;
  ratio:=case when p_decision->>'credit_tax_mode'='inclusive' then (p_decision->>'credit_amount')::numeric/nullif((b->>'total')::numeric,0) else (p_decision->>'credit_amount')::numeric/nullif((b->>'subtotal')::numeric,0) end;
  ratio:=coalesce(ratio,0);credit_base:=round((b->>'subtotal')::numeric*ratio,2);
 else raise exception 'ENTRY_INVALID_DECISION';end if;
 if ratio is null or ratio<0 or ratio>1 then raise exception 'ENTRY_CREDIT_EXCEEDS_CANCELLED_FEES';end if;
 for t in select value from jsonb_array_elements(b->'taxes') loop
  amt:=round((t->>'amount')::numeric*ratio,2);credit_tax:=credit_tax+amt;
  taxes:=taxes||jsonb_build_array(t||jsonb_build_object('base',round((t->>'base')::numeric*ratio,2),'amount',amt));
 end loop;
 if p_decision->>'credit_mode'='custom' and p_decision->>'credit_tax_mode'='inclusive' then
  delta:=(p_decision->>'credit_amount')::numeric-credit_base-credit_tax;
  if jsonb_array_length(taxes)>0 then idx:=jsonb_array_length(taxes)-1;taxes:=jsonb_set(taxes,array[idx::text,'amount'],to_jsonb((taxes->idx->>'amount')::numeric+delta));credit_tax:=credit_tax+delta;else credit_base:=credit_base+delta;end if;
 end if;
 for t,idx in select value,ordinality::int-1 from jsonb_array_elements(b->'taxes') with ordinality loop
  retained_taxes:=retained_taxes||jsonb_build_array(t||jsonb_build_object('base',(t->>'base')::numeric-(taxes->idx->>'base')::numeric,'amount',(t->>'amount')::numeric-(taxes->idx->>'amount')::numeric));
 end loop;
 credit:=jsonb_build_object('subtotal',credit_base,'tax_amount',credit_tax,'total',credit_base+credit_tax,'taxes',taxes);
 retained:=jsonb_build_object('subtotal',(b->>'subtotal')::numeric-credit_base,'tax_amount',(b->>'tax_amount')::numeric-credit_tax,'total',(b->>'total')::numeric-credit_base-credit_tax,'taxes',retained_taxes);
 return jsonb_build_object('credit',credit,'fee',fee,'retained',retained);
end $$;

create function public.preview_entry_cancellation(p_request uuid,p_decision jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b jsonb;
begin
 b:=public.entry_cancellation_quote(p_request);
 if p_decision->>'signature' is distinct from b->>'signature' or (p_decision->>'version')::bigint is distinct from (b->>'version')::bigint then raise exception 'BILLING_STALE_VERSION';end if;
 return public.entry_cancellation_calculate(b,p_decision);
end $$;

create function public.decide_entry_cancellation(p_request uuid,p_approve boolean,p_decision jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.entry_cancellation_requests;b jsonb;f public.billing_folios;rules jsonb;fee jsonb;credit jsonb;retained jsonb;ratio numeric;credit_base numeric;credit_tax numeric:=0;credit_total numeric;taxes jsonb:='[]';retained_taxes jsonb:='[]';t jsonb;amt numeric;delta numeric;idx integer;before_snapshot jsonb;after_snapshot jsonb;outcome jsonb;
begin
 select * into r from public.entry_cancellation_requests where id=p_request;
 if not found or not public.entry_lifecycle_staff(r.organization_id,r.show_id) then raise exception 'ENTRY_FORBIDDEN';end if;
 perform public.billing6_lock(r.organization_id);perform public.billing_lock_scope(r.organization_id,r.show_id);perform public.entry_draw_lock(r.block_id);
 select * into r from public.entry_cancellation_requests where id=p_request for update;
 if r.status<>'pending' then
  if r.status=(case when p_approve then 'approved' else 'rejected' end) and r.financial_decision->'input'=p_decision then return r.financial_decision;end if;
  raise exception 'ENTRY_CANCELLATION_ALREADY_DECIDED';
 end if;
 if p_approve is null or p_decision is null or jsonb_typeof(p_decision)<>'object' or exists(select 1 from jsonb_object_keys(p_decision) k where k not in ('version','signature','credit_mode','credit_amount','credit_tax_mode','fee_amount','fee_tax_mode','note')) then raise exception 'ENTRY_INVALID_DECISION';end if;
 if not p_approve then
  outcome:=jsonb_build_object('input',p_decision,'status','rejected');
  update public.entry_cancellation_requests set status='rejected',decided_by=public.current_profile_id(),decided_at=clock_timestamp(),decision_note=left(coalesce(p_decision->>'note',''),2000),financial_decision=outcome where id=r.id;
  return outcome;
 end if;
 if public.entry_draw_generated(r.block_id) then raise exception 'ENTRY_DRAW_GENERATED_USE_SCRATCH';end if;
 b:=public.entry_cancellation_quote(r.id);
 if (p_decision->>'version')::bigint is distinct from (b->>'version')::bigint then raise exception 'BILLING_STALE_VERSION';end if;
 if p_decision->>'signature' is distinct from b->>'signature' then raise exception 'BILLING_STALE_VERSION';end if;
 select * into f from public.billing_folios where id=(b->>'folio_id')::uuid for update;
 before_snapshot:=public.billing_snapshot(f.id);
 outcome:=public.entry_cancellation_calculate(b,p_decision);fee:=outcome->'fee';credit:=outcome->'credit';retained:=outcome->'retained';
 if (fee->>'total')::numeric>0 and exists(select 1 from public.billing_tax_rules t join public.reservation_billing_contexts c on c.context_id=t.context_id where c.show_id=r.show_id and (current_date<t.valid_from or (t.valid_until is not null and current_date>t.valid_until))) then raise exception 'BILLING_TAX_RULE_OUTSIDE_VALIDITY';end if;
 insert into public.entry_cancellation_apply_context values(r.id,f.id,txid_current(),array(select jsonb_array_elements_text(b->'charge_ids')::uuid));
 update public.entry_cancellation_requests set status='approved',decided_by=public.current_profile_id(),decided_at=clock_timestamp(),decision_note=left(coalesce(p_decision->>'note',''),2000) where id=r.id;
 update public.entries set status='cancelled' where id=any(r.entry_ids);
 after_snapshot:=public.billing_snapshot(f.id);
 if round((before_snapshot->>'total')::numeric-(after_snapshot->>'total')::numeric,2)<>(b->>'total')::numeric then raise exception 'ENTRY_CANCELLATION_QUOTE_CHANGED';end if;
 perform public.entry_insert_adjustment(r.id,f.id,'cancellation_retained','Part non créditée / Retained cancellation amount',retained);
 perform public.entry_insert_adjustment(r.id,f.id,'cancellation_fee','Frais d’annulation / Cancellation fee',fee);
 update public.billing_folios set version=version+1 where id=f.id;
 outcome:=jsonb_build_object('input',p_decision,'status','approved','credit',credit,'fee',fee,'folio_id',f.id,'balance',(public.billing_snapshot(f.id)->>'balance')::numeric);
 update public.entry_cancellation_requests set financial_decision=outcome where id=r.id;
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload) values(r.organization_id,f.id,public.current_profile_id(),'entry_cancellation',jsonb_build_object('request_id',r.id),outcome);
 delete from public.entry_cancellation_apply_context where request_id=r.id;
 return outcome;
end $$;

do $$declare f record;begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('entry_cancellation_calculate','preview_entry_cancellation','entry_cancellation_applying','entry_cancellation_basis','entry_money_breakdown','entry_cancellation_quote','entry_insert_adjustment','decide_entry_cancellation') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);end loop;
end $$;
grant execute on function public.preview_entry_cancellation(uuid,jsonb),public.entry_cancellation_quote(uuid),public.decide_entry_cancellation(uuid,boolean,jsonb) to authenticated;
commit;
