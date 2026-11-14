begin;
-- Received, allocated money is sufficient for activation. Receipt issuance and
-- the browser return page are deliberately not activation signals.
create function public.entry_activate_paid_folio(p_folio uuid) returns void language plpgsql security definer set search_path='' as $$
declare e record;required_ids uuid[];b uuid;judge_key text;
begin
 for e in select en.* from public.entries en join public.reservation_billing_contexts ctx on ctx.show_id=en.show_id
 join public.billing_folios f on f.billing_context_id=ctx.context_id
 join public.billing_customer_accounts ca on ca.id=f.payer_customer_account_id and ca.payer_contact_id=en.payer_contact_id
 where f.id=p_folio and en.status='pending_checkout' order by en.id loop
  select block_id into b from public.classes where id=e.class_id;
  judge_key:='judge:'||e.show_id||':'||e.payer_contact_id||':'||e.horse_id||':'||coalesce(e.rider_contact_id::text,'none')||':'||b;
  select array_agg(l.charge_id) into required_ids from public.event_billing_lines l where l.line_key in ('entry:'||e.id,'late:'||e.id,judge_key);
  if ((cardinality(required_ids)>0 and not exists(
   select 1 from public.billing_charges c where c.id=any(required_ids)
   and c.total>coalesce((select sum(a.amount) from public.billing_payment_allocations a where a.charge_id=c.id),0)
  )) or (coalesce(cardinality(required_ids),0)=0 and (public.billing_snapshot(p_folio)->>'balance')::numeric<=0 and exists(select 1 from public.billing_payments where folio_id=p_folio))) then
   insert into public.entry_activation_events(entry_id,kind,provider_reference) values(e.id,'payment','folio:'||p_folio) on conflict do nothing;
   update public.entries set status='active' where id=e.id and status='pending_checkout';
  end if;
 end loop;
end $$;
create function public.entry_payment_allocation_activation() returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.entry_activate_paid_folio(new.folio_id);return new;end $$;
create trigger entry_payment_activation after insert on public.billing_payment_allocations for each row execute function public.entry_payment_allocation_activation();
revoke all on function public.entry_activate_paid_folio(uuid),public.entry_payment_allocation_activation() from public,anon,authenticated,service_role;

create function public.entry_submission_activation() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.classes;f uuid;free boolean;ctx public.billing_contexts;customer uuid;
begin
 if new.status<>'pending_checkout' or new.submitted_at is null then return new;end if;
 select * into c from public.classes where id=new.class_id;
 select bc.* into ctx from public.reservation_billing_contexts link join public.billing_contexts bc on bc.id=link.context_id where link.show_id=new.show_id;
 select fol.id into f from public.billing_folios fol join public.reservation_billing_contexts link on link.context_id=fol.billing_context_id
 join public.billing_customer_accounts ca on ca.id=fol.payer_customer_account_id where link.show_id=new.show_id and ca.payer_contact_id=new.payer_contact_id;
 if f is null and ctx.id is not null and public.billing6_cap(ctx.id,'engine') and public.billing6_cap(ctx.id,'personal') then
  insert into public.billing_customer_accounts(organization_id,payer_contact_id) values(new.organization_id,new.payer_contact_id) on conflict do nothing;
  select id into customer from public.billing_customer_accounts where organization_id=new.organization_id and payer_contact_id=new.payer_contact_id;
  insert into public.billing_folios(organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by)
  values(new.organization_id,ctx.id,customer,ctx.currency,public.billing_number(new.organization_id,'account',ctx.config->>'account_prefix'),public.current_profile_id()) returning id into f;
 end if;
 free:=coalesce(new.base_fee,c.entry_fee,0)=0 and coalesce(new.late_fee_amount,0)=0 and coalesce(c.judge_fee,0)=0;
 if free and f is not null then free:=(public.billing_snapshot(f)->>'balance')::numeric<=0;
 elsif free then free:=not exists(select 1 from public.invoices where show_id=new.show_id and payer_contact_id=new.payer_contact_id and status<>'void' and balance_due>0);
 end if;
 if free then
  insert into public.entry_activation_events(entry_id,kind,provider_reference) values(new.id,'free','free:'||new.id) on conflict do nothing;
  update public.entries set status='active' where id=new.id and status='pending_checkout';
 elsif f is not null then perform public.entry_activate_paid_folio(f);
 end if;
 return new;
end $$;
create trigger zz_entry_submission_activation after insert or update of submitted_at on public.entries for each row execute function public.entry_submission_activation();
revoke all on function public.entry_submission_activation() from public,anon,authenticated,service_role;

-- Draw generation is also a late-entry boundary, independently of publication.
do $$declare definition text;needle text:='new.is_late:=b.entries_close_at is not null and clock_timestamp()>b.entries_close_at;';begin
 definition:=pg_get_functiondef('public.entry_account_quote()'::regprocedure);
 if position(needle in definition)=0 then raise exception 'ENTRY_QUOTE_CONTRACT_CHANGED';end if;
 execute replace(definition,needle,'new.is_late:=public.entry_draw_generated(b.id) or (b.entries_close_at is not null and clock_timestamp()>b.entries_close_at);');
end $$;
commit;
