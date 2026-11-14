begin;
alter table public.entry_cancellation_requests add column origin text not null default 'participant_request' check(origin in ('participant_request','staff_direct'));

create function public.entry_cancellation_basis_for_scope(r public.entry_cancellation_requests) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.billing_folios;ctx uuid;keys text[];ids uuid[];judge_key text;old_judge public.billing_charges;remaining record;new_judge numeric:=0;new_taxes jsonb:='[]';taxes jsonb;sub numeric;tax numeric;unchanged boolean:=false;
begin
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

-- Existing participant requests and staff direct actions use the same financial
-- basis. A quote for a direct action never creates a pending request.
create or replace function public.entry_cancellation_basis(p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.entry_cancellation_requests;
begin
 select * into r from public.entry_cancellation_requests where id=p_request;
 if not found then raise exception 'ENTRY_FORBIDDEN';end if;
 return public.entry_cancellation_basis_for_scope(r);
end $$;

create function public.staff_entry_cancellation_scope(p_entry uuid,p_scope text) returns public.entry_cancellation_requests language plpgsql security definer set search_path='' as $$
declare e public.entries;r public.entry_cancellation_requests;b uuid;
begin
 select * into e from public.entries where id=p_entry;
 if not found or not public.entry_lifecycle_staff(e.organization_id,e.show_id) then raise exception 'ENTRY_FORBIDDEN';end if;
 if p_scope is null or p_scope not in ('class','block') then raise exception 'ENTRY_INVALID_DECISION';end if;
 select block_id into b from public.classes where id=e.class_id;
 perform public.billing6_lock(e.organization_id);perform public.billing_lock_scope(e.organization_id,e.show_id);perform public.entry_draw_lock(b);
 select * into e from public.entries where id=p_entry;
 if not public.entry_lifecycle_staff(e.organization_id,e.show_id) then raise exception 'ENTRY_FORBIDDEN';end if;
 if (select block_id from public.classes where id=e.class_id) is distinct from b then raise exception 'ENTRY_CONTEXT_CHANGED';end if;
 if public.entry_draw_generated(b) then raise exception 'ENTRY_DRAW_GENERATED_USE_SCRATCH';end if;
 if e.status not in ('active','pending_checkout') then raise exception 'ENTRY_NOT_SUBMITTED';end if;
 r.organization_id:=e.organization_id;r.show_id:=e.show_id;r.block_id:=b;r.horse_id:=e.horse_id;r.rider_contact_id:=e.rider_contact_id;r.payer_contact_id:=e.payer_contact_id;r.scope:=p_scope;
 if p_scope='class' then r.entry_ids:=array[e.id];else
  select array_agg(en.id order by en.id) into r.entry_ids from public.entries en join public.classes c on c.id=en.class_id
  where c.block_id=b and en.organization_id=e.organization_id and en.show_id=e.show_id and en.horse_id=e.horse_id
  and en.rider_contact_id is not distinct from e.rider_contact_id and en.payer_contact_id=e.payer_contact_id and en.status in ('active','pending_checkout');
 end if;
 if exists(select 1 from public.entry_cancellation_requests where block_id=b and status='pending' and entry_ids&&r.entry_ids) then raise exception 'ENTRY_CANCELLATION_ALREADY_PENDING';end if;
 return r;
end $$;

create function public.staff_entry_cancellation_quote(p_entry uuid,p_scope text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.entry_cancellation_requests;b jsonb;rules jsonb;
begin
 r:=public.staff_entry_cancellation_scope(p_entry,p_scope);
 b:=public.entry_cancellation_basis_for_scope(r);
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'code',t.code,'jurisdiction',t.jurisdiction,'rate',t.rate) order by t.code,t.id),'[]') into rules
 from public.billing_tax_rules t join public.reservation_billing_contexts c on c.context_id=t.context_id where c.show_id=r.show_id;
 b:=b||jsonb_build_object('fee_tax_rules',rules,'entry_ids',r.entry_ids,'block_id',r.block_id,'scope',r.scope);
 return b||jsonb_build_object('signature',md5(b::text));
end $$;

create function public.preview_staff_entry_cancellation(p_entry uuid,p_scope text,p_decision jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb;
begin
 q:=public.staff_entry_cancellation_quote(p_entry,p_scope);
 if p_decision->>'signature' is distinct from q->>'signature' or (p_decision->>'version')::bigint is distinct from (q->>'version')::bigint then raise exception 'BILLING_STALE_VERSION';end if;
 return public.entry_cancellation_calculate(q,p_decision);
end $$;

create function public.cancel_entry_as_staff(p_operation uuid,p_entry uuid,p_scope text,p_decision jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.entry_cancellation_requests;q jsonb;outcome jsonb;command jsonb;
begin
 if p_operation is null or p_entry is null or p_decision is null then raise exception 'ENTRY_INVALID_DECISION';end if;
 command:=jsonb_build_object('entry',p_entry,'scope',p_scope,'decision',p_decision);
 -- The operation lock serializes an identical retry before entry status changes
 -- can invalidate the scope. No durable pending state is ever committed here.
 perform pg_advisory_xact_lock(hashtextextended('staff-entry-cancel:'||p_operation::text,0));
 select * into r from public.entry_cancellation_requests where id=p_operation;
 if found then
  if not public.entry_lifecycle_staff(r.organization_id,r.show_id) then raise exception 'ENTRY_FORBIDDEN';end if;
  if r.origin='staff_direct' and r.requested_by=public.current_profile_id() and r.status='approved' and r.financial_decision->'staff_command'=command then return r.financial_decision;end if;
  raise exception 'ENTRY_IDEMPOTENCY_CONFLICT';
 end if;
 r:=public.staff_entry_cancellation_scope(p_entry,p_scope);
 q:=public.staff_entry_cancellation_quote(p_entry,p_scope);
 if p_decision->>'signature' is distinct from q->>'signature' or (p_decision->>'version')::bigint is distinct from (q->>'version')::bigint then raise exception 'BILLING_STALE_VERSION';end if;
 insert into public.entry_cancellation_requests(id,organization_id,show_id,block_id,horse_id,rider_contact_id,payer_contact_id,entry_ids,scope,requested_by,reason,origin)
 values(p_operation,r.organization_id,r.show_id,r.block_id,r.horse_id,r.rider_contact_id,r.payer_contact_id,r.entry_ids,r.scope,public.current_profile_id(),left(coalesce(p_decision->>'note',''),2000),'staff_direct');
 -- Reuse the existing, atomic financial approval machinery with its original
 -- quote signature, after verifying the direct action's signed target above.
 q:=public.entry_cancellation_quote(p_operation);
 outcome:=public.decide_entry_cancellation(p_operation,true,p_decision||jsonb_build_object('signature',q->>'signature'));
 outcome:=outcome||jsonb_build_object('staff_command',command,'origin','staff_direct');
 update public.entry_cancellation_requests set financial_decision=outcome where id=p_operation;
 return outcome;
end $$;

revoke all on function public.entry_cancellation_basis_for_scope(public.entry_cancellation_requests),public.entry_cancellation_basis(uuid),public.staff_entry_cancellation_scope(uuid,text),public.staff_entry_cancellation_quote(uuid,text),public.preview_staff_entry_cancellation(uuid,text,jsonb),public.cancel_entry_as_staff(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.staff_entry_cancellation_quote(uuid,text),public.preview_staff_entry_cancellation(uuid,text,jsonb),public.cancel_entry_as_staff(uuid,uuid,text,jsonb) to authenticated;
commit;
