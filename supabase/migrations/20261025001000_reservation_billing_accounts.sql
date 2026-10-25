-- Reservation adapter. Historical invoices are preserved; adoption never imports or pays them.
begin;
create table public.reservation_billing_contexts (
 show_id uuid primary key references public.shows(id), context_id uuid not null unique references public.billing_contexts(id)
);
create table public.reservation_billing_products (
 option_id uuid primary key references public.stall_options(id), product_id uuid not null unique references public.organization_products(id)
);
create table public.reservation_billing_links (
 booking_id uuid primary key, charge_id uuid not null unique references public.billing_charges(id),
 booking_snapshot jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table public.reservation_billing_reversals (
 charge_id uuid primary key references public.billing_charges(id), credit_id uuid not null unique references public.billing_charges(id),
 actor_id uuid not null references public.user_profiles(id), created_at timestamptz not null default clock_timestamp()
);
do $$ declare t text;begin
 foreach t in array array['reservation_billing_contexts','reservation_billing_products','reservation_billing_links','reservation_billing_reversals'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
create trigger reservation_reversals_immutable before update or delete on public.reservation_billing_reversals for each row execute function public.billing_immutable();

-- Explicit association adoption; all fiscal settings come from the reviewed configuration.
create function public.configure_reservation_billing(p_show uuid,p_config jsonb,p_taxes jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare s public.shows; c uuid; a jsonb; tax jsonb;
begin
 select * into s from public.shows where id=p_show;
 if s.id is null then raise exception 'BILLING_NOT_FOUND_OR_INVALID';end if;
 a:=public.billing_assert_staff(s.organization_id,s.id);
 if a->>'kind'<>'platform_admin' and a->>'role'<>'admin' then raise exception 'BILLING_FORBIDDEN';end if;
 perform public.billing6_lock(s.organization_id);perform public.billing_lock_scope(s.organization_id,s.id);
 select context_id into c from public.reservation_billing_contexts where show_id=s.id;
 if found then return c;end if;
 if not coalesce((select engine and personal from public.billing_pilot_organizations where organization_id=s.organization_id),false) then raise exception 'BILLING_PILOT_REQUIRED';end if;
 if exists(select 1 from public.billing_contexts where show_id=s.id) then raise exception 'RESERVATION_CONTEXT_ALREADY_EXISTS';end if;
 -- Use the same validation as context creation, with explicit adoption of future reservations only.
 perform public.billing_check_config(p_config);
 if jsonb_typeof(p_taxes) is distinct from 'array' then raise exception 'BILLING_TAX_CONFIG_REQUIRED';end if;
 insert into public.billing_contexts(organization_id,kind,show_id,currency,config,opens_at,created_by)
 values(s.organization_id,'event',s.id,coalesce(s.default_currency,(select currency from public.organizations where id=s.organization_id)),p_config,clock_timestamp(),public.current_profile_id()) returning id into c;
 for tax in select value from jsonb_array_elements(p_taxes) loop
  if nullif(trim(tax->>'code'),'') is null or nullif(trim(tax->>'name'),'') is null or nullif(trim(tax->>'jurisdiction'),'') is null or (tax->>'rate')::numeric is null or (tax->>'rate')::numeric<=0 then raise exception 'BILLING_TAX_CONFIG_REQUIRED';end if;
  insert into public.billing_tax_rules(organization_id,context_id,code,name,jurisdiction,rate,rule_version,valid_from)
  values(s.organization_id,c,tax->>'code',tax->>'name',tax->>'jurisdiction',(tax->>'rate')::numeric,'reservation-adoption-1',current_date);
 end loop;
 insert into public.reservation_billing_contexts values(s.id,c);
 perform public.billing_set_capabilities(s.organization_id,c,true,true,false,false,extract(year from s.start_date)::integer);
 insert into public.billing_audit_events(organization_id,actor_id,operation,authorization_snapshot,payload)
 values(s.organization_id,public.current_profile_id(),'reservation_billing_adopt',a,jsonb_build_object('show_id',s.id,'context_id',c,'taxes',p_taxes,'historical_invoices','preserved_without_import'));
 return c;
end $$;

-- The debt check uses both event and non-event accounts. Open accounts and legacy invoices never block.
create or replace function public.assert_no_open_invoice_balance_for_stall_booking() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(new.billable,true) or new.status in ('cancelled','completed') then return new;end if;
 perform public.billing6_lock(new.organization_id);
 if exists(select 1 from public.billing_folios f
 join public.billing_customer_accounts a on a.id=f.payer_customer_account_id
 join public.billing_contexts c on c.id=f.billing_context_id
 where f.organization_id=new.organization_id and a.payer_contact_id=new.payer_contact_id
 and f.state='closed' and c.show_id is distinct from new.show_id
 and (public.billing_snapshot(f.id)->>'balance')::numeric>0) then
 raise exception 'Un autre compte est fermé avec un solde dû. Le paiement est requis avant une nouvelle réservation.' using errcode='P0001';
 end if;
 return new;
end $$;

-- Adapt only the reservation guard; all other legacy writers keep their existing guard.
create function public.reservation_billing_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb;o uuid;s uuid;adopted boolean;
begin
 for r in select x from jsonb_array_elements(case when tg_op='INSERT' then jsonb_build_array(to_jsonb(new)) when tg_op='DELETE' then jsonb_build_array(to_jsonb(old)) else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end) x order by x->>'organization_id',x->>'show_id' loop
  o:=(r->>'organization_id')::uuid;s:=(r->>'show_id')::uuid;
  perform public.billing6_lock(o);perform public.billing_lock_scope(o,s);
  select exists(select 1 from public.reservation_billing_contexts rc join public.billing_contexts c on c.id=rc.context_id where rc.show_id=s and c.organization_id=o) into adopted;
  if not adopted and exists(select 1 from public.billing_contexts c where c.organization_id=o and c.show_id=s) then raise exception 'BILLING_LEGACY_CONTEXT_ADOPTED';end if;
  if adopted and tg_op<>'INSERT' and not exists(select 1 from public.reservation_billing_links l where l.booking_id=old.id) and exists(select 1 from public.invoice_line_items i where i.item_id=old.id and i.item_type in ('stall','extra')) then raise exception 'RESERVATION_LEGACY_RECONCILIATION_REQUIRED';end if;
 end loop;
 if tg_op='UPDATE' and (new.organization_id,new.show_id) is distinct from (old.organization_id,old.show_id) then raise exception 'RESERVATION_SCOPE_IMMUTABLE';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
drop trigger a_billing_engine_guard on public.stall_bookings;
create trigger a_billing_engine_guard before insert or update or delete on public.stall_bookings for each row execute function public.reservation_billing_guard();

-- Suppress the old invoice writer and description sync only for adopted reservation scopes.
alter function public.sync_stall_booking_invoice() rename to reservation_legacy_invoice_sync;
alter function public.sync_stall_booking_invoice_description() rename to reservation_legacy_description_sync;
drop trigger stall_bookings_invoice_sync on public.stall_bookings;
drop trigger stall_bookings_zz_invoice_description_sync on public.stall_bookings;
create function public.reservation_uses_accounts(p_show uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.reservation_billing_contexts where show_id=p_show)$$;
create trigger stall_bookings_invoice_insert after insert on public.stall_bookings for each row when(not public.reservation_uses_accounts(new.show_id)) execute function public.reservation_legacy_invoice_sync();
create trigger stall_bookings_invoice_update after update on public.stall_bookings for each row when(not public.reservation_uses_accounts(new.show_id)) execute function public.reservation_legacy_invoice_sync();
create trigger stall_bookings_invoice_delete after delete on public.stall_bookings for each row when(not public.reservation_uses_accounts(old.show_id)) execute function public.reservation_legacy_invoice_sync();
create trigger stall_bookings_zz_invoice_description_sync after insert or update on public.stall_bookings for each row when(not public.reservation_uses_accounts(new.show_id)) execute function public.reservation_legacy_description_sync();

alter table public.billing_charges drop constraint billing_charges_source_type_check;
alter table public.billing_charges add constraint billing_charges_source_type_check check(source_type in ('secretary_sale','hsp_service','reservation','reservation_credit'));
alter table public.billing_charges drop constraint billing_charges_subtotal_check;
alter table public.billing_charges drop constraint billing_charges_tax_amount_check;
alter table public.billing_charges add constraint billing_charges_signed_amounts check(
 (source_type='reservation_credit' and subtotal<=0 and tax_amount<=0) or (source_type<>'reservation_credit' and subtotal>=0 and tax_amount>=0));

-- Reverse unpaid charges with an immutable credit; never rewrite a payment, receipt, or original charge.
create function public.reservation_reverse_charge(p_charge uuid) returns void language plpgsql security definer set search_path='' as $$
declare ch public.billing_charges; f public.billing_folios; credit uuid;
begin
 select * into ch from public.billing_charges where id=p_charge;
 select * into f from public.billing_folios where id=ch.folio_id for update;
 if f.state<>'open' then raise exception 'BILLING_FOLIO_CLOSED';end if;
 if exists(select 1 from public.billing_stripe_attempts where folio_id=f.id and not resolved) or exists(select 1 from public.billing_payment_allocations where charge_id=ch.id) then raise exception 'RESERVATION_CHARGE_HAS_PAYMENT';end if;
 if exists(select 1 from public.reservation_billing_reversals where charge_id=ch.id) then return;end if;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,horse_id,actor_id,authorization_snapshot)
 values(ch.organization_id,ch.folio_id,ch.currency,'reservation_credit',gen_random_uuid(),ch.product_id,ch.category,'Annulation / Cancellation — '||ch.description,ch.quantity,ch.unit_price,-ch.subtotal,-ch.tax_amount,ch.exemption_reason,ch.beneficiary_contact_id,ch.horse_id,public.current_profile_id(),jsonb_build_object('kind','reservation_reversal','original_charge_id',ch.id)) returning id into credit;
 insert into public.billing_charge_taxes select credit,tax_rule_id,name,code,jurisdiction,rate,-base,-amount from public.billing_charge_taxes where charge_id=ch.id;
 insert into public.reservation_billing_reversals(charge_id,credit_id,actor_id) values(ch.id,credit,public.current_profile_id());
 update public.billing_folios set version=version+1 where id=f.id;
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload) values(ch.organization_id,f.id,public.current_profile_id(),'reservation_reversal',jsonb_build_object('actor',public.current_profile_id()),jsonb_build_object('charge_id',ch.id,'credit_id',credit));
end $$;

create function public.sync_reservation_billing_account() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.stall_bookings; opt public.stall_options; ctx public.billing_contexts; link public.reservation_billing_links;
 prod uuid; customer uuid; f public.billing_folios; charge uuid; base numeric; taxes numeric; actor uuid:=public.current_profile_id(); snapshot jsonb;
begin
 if tg_op='DELETE' then b:=old;else b:=new;end if;
 select c.* into ctx from public.reservation_billing_contexts r join public.billing_contexts c on c.id=r.context_id where r.show_id=b.show_id;
 if not found then if tg_op='DELETE' then return old;end if;return new;end if;
 if actor is null then raise exception 'BILLING_FORBIDDEN';end if;
 perform public.billing6_lock(b.organization_id);perform public.billing_lock_scope(b.organization_id,b.show_id);
 if not public.billing6_cap(ctx.id,'engine') or not public.billing6_cap(ctx.id,'personal') then raise exception 'BILLING_CONTEXT_UNAVAILABLE';end if;
 select * into link from public.reservation_billing_links where booking_id=b.id for update;
 snapshot:=jsonb_build_object('option',b.stall_option_id,'payer',b.payer_contact_id,'horse',b.horse_id,'quantity',b.quantity,'unit_price',b.unit_price,'billable',b.billable);
 if link.charge_id is not null then
  if tg_op<>'DELETE' and b.status<>'cancelled' and coalesce(b.billable,true) and snapshot=link.booking_snapshot then return new;end if;
  perform public.reservation_reverse_charge(link.charge_id);
  delete from public.reservation_billing_links where booking_id=b.id;
 end if;
 if tg_op='DELETE' or b.status='cancelled' or not coalesce(b.billable,true) then if tg_op='DELETE' then return old;end if;return new;end if;
 if clock_timestamp()<ctx.opens_at or (ctx.closes_at is not null and clock_timestamp()>=ctx.closes_at) then raise exception 'BILLING_CONTEXT_NOT_OPEN';end if;
 select * into opt from public.stall_options where id=b.stall_option_id for share;
 if opt.organization_id<>b.organization_id or opt.show_id<>b.show_id or b.quantity<=0 or b.unit_price<0 then raise exception 'BILLING_INVALID_AMOUNT';end if;
 -- Preserve the existing split-tack representation; normal inventory lines use the authoritative option price.
 if coalesce(b.affects_inventory,true) and b.unit_price is distinct from opt.price then raise exception 'RESERVATION_PRICE_CHANGED';end if;
 select product_id into prod from public.reservation_billing_products where option_id=opt.id;
 if prod is null then
  insert into public.organization_products(organization_id,name,code,category,default_price,tax_applicable) values(b.organization_id,opt.name,'RESERVATION-'||opt.id,'stall_extra',opt.price,exists(select 1 from public.billing_tax_rules where context_id=ctx.id)) returning id into prod;
  insert into public.reservation_billing_products values(opt.id,prod);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('billing-customer:'||b.organization_id||':'||b.payer_contact_id,0));
 insert into public.billing_customer_accounts(organization_id,payer_contact_id) values(b.organization_id,b.payer_contact_id) on conflict do nothing;
 select id into customer from public.billing_customer_accounts where organization_id=b.organization_id and payer_contact_id=b.payer_contact_id;
 select * into f from public.billing_folios where billing_context_id=ctx.id and payer_customer_account_id=customer for update;
 if not found then insert into public.billing_folios(organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by) values(b.organization_id,ctx.id,customer,ctx.currency,public.billing_number(b.organization_id,'account',ctx.config->>'account_prefix'),actor) returning * into f;end if;
 if f.state<>'open' then raise exception 'BILLING_FOLIO_CLOSED';end if;
 if exists(select 1 from public.billing_stripe_attempts where folio_id=f.id and not resolved) then raise exception 'BILLING_PAYMENT_PENDING';end if;
 if exists(select 1 from public.billing_tax_rules where context_id=ctx.id and (current_date<valid_from or (valid_until is not null and current_date>valid_until))) then raise exception 'BILLING_TAX_RULE_OUTSIDE_VALIDITY';end if;
 base:=round(b.quantity*b.unit_price,2);
 select coalesce(sum(round(base*rate/100,2)),0) into taxes from public.billing_tax_rules where context_id=ctx.id;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,horse_id,actor_id,authorization_snapshot)
 values(b.organization_id,f.id,ctx.currency,'reservation',gen_random_uuid(),prod,'stall_extra',opt.name,b.quantity,b.unit_price,base,taxes,case when not exists(select 1 from public.billing_tax_rules where context_id=ctx.id) then 'Configuration explicite du concours sans taxes' end,b.payer_contact_id,b.horse_id,actor,jsonb_build_object('kind','reservation','booking_id',b.id,'actor',actor,'split',not coalesce(b.affects_inventory,true))) returning id into charge;
 insert into public.billing_charge_taxes select charge,id,name,code,jurisdiction,rate,base,round(base*rate/100,2) from public.billing_tax_rules where context_id=ctx.id;
 insert into public.reservation_billing_links(booking_id,charge_id,booking_snapshot) values(b.id,charge,snapshot);
 if b.horse_id is not null then insert into public.billing_folio_horses(folio_id,horse_id,source_charge_id,actor_id) values(f.id,b.horse_id,charge,actor) on conflict do nothing;end if;
 update public.billing_folios set version=version+1 where id=f.id;
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload) values(b.organization_id,f.id,actor,'reservation_charge',jsonb_build_object('actor',actor),jsonb_build_object('booking_id',b.id,'charge_id',charge));
 return new;
end $$;
create trigger stall_bookings_account_sync after insert or update or delete on public.stall_bookings for each row execute function public.sync_reservation_billing_account();

-- Keep reversal history in statements while hiding settled reversal pairs from payable lines.
alter function public.billing_snapshot(uuid) rename to reservation_billing_snapshot_base;
create function public.billing_snapshot(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_set(s,'{charges}',coalesce((select jsonb_agg(c order by n) from jsonb_array_elements(s->'charges') with ordinality a(c,n) where not exists(select 1 from public.reservation_billing_reversals r where (c->>'id')::uuid in (r.charge_id,r.credit_id))),'[]'))
 ||jsonb_build_object('reservation_adjustments',coalesce((select jsonb_agg(c order by n) from jsonb_array_elements(s->'charges') with ordinality a(c,n) where exists(select 1 from public.reservation_billing_reversals r where (c->>'id')::uuid in (r.charge_id,r.credit_id))),'[]'))
 from (select public.reservation_billing_snapshot_base(p_folio) s) x;
$$;
create function public.reservation_allocation_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.reservation_billing_reversals where new.charge_id in (charge_id,credit_id)) then raise exception 'RESERVATION_CHARGE_REVERSED';end if;
 return new;
end $$;
create trigger reservation_allocation_guard before insert on public.billing_payment_allocations for each row execute function public.reservation_allocation_guard();
-- The Stripe allocator also consumes only active debit lines (its other logic is unchanged).
do $$ declare fn regprocedure; def text; needle text:='where c.folio_id=f.id order by c.created_at,c.id';begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and prosrc like '%'||needle||'%' loop
 def:=pg_get_functiondef(fn);def:=replace(def,needle,'where c.folio_id=f.id and c.total>0 and not exists(select 1 from public.reservation_billing_reversals rr where c.id in (rr.charge_id,rr.credit_id)) order by c.created_at,c.id');execute def;
 end loop;
end $$;

-- Public preview reveals only accounts the caller is entitled to read; enforcement above checks every payer.
create function public.reservation_closed_balance_blocks(p_show uuid,p_payers uuid[]) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('account_number',f.public_number,'balance',public.billing_snapshot(f.id)->'balance','currency',f.currency)),'[]')
 from public.billing_folios f join public.billing_customer_accounts a on a.id=f.payer_customer_account_id join public.billing_contexts c on c.id=f.billing_context_id join public.shows s on s.organization_id=f.organization_id and s.id=p_show
 where a.payer_contact_id=any(p_payers) and f.state='closed' and c.show_id is distinct from p_show and public.billing_can_read(f.id) and (public.billing_snapshot(f.id)->>'balance')::numeric>0;
$$;
revoke all on function public.configure_reservation_billing(uuid,jsonb,jsonb),public.reservation_billing_guard(),public.reservation_uses_accounts(uuid),public.reservation_reverse_charge(uuid),public.sync_reservation_billing_account(),public.reservation_billing_snapshot_base(uuid),public.billing_snapshot(uuid),public.reservation_allocation_guard(),public.reservation_closed_balance_blocks(uuid,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.configure_reservation_billing(uuid,jsonb,jsonb),public.reservation_closed_balance_blocks(uuid,uuid[]),public.reservation_uses_accounts(uuid) to authenticated;
-- One request is one database transaction: a later payer/stock/health failure rolls back every line.
create function public.create_stall_booking_batch(p_rows jsonb) returns setof public.stall_bookings
language plpgsql security invoker set search_path='' as $$
declare r jsonb; b public.stall_bookings;
begin
 if public.current_profile_id() is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'RESERVATION_INVALID_BATCH';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  b:=jsonb_populate_record(null::public.stall_bookings,r);
  if b.created_by_user_id is distinct from public.current_profile_id() then raise exception 'RESERVATION_INVALID_ACTOR';end if;
  return query insert into public.stall_bookings(organization_id,show_id,stall_option_id,horse_id,created_by_user_id,booker_contact_id,payer_contact_id,status,show_day_start_id,show_day_end_id,quantity,unit_price,total_price,affects_inventory,billable,notes)
  values(b.organization_id,b.show_id,b.stall_option_id,b.horse_id,b.created_by_user_id,b.booker_contact_id,b.payer_contact_id,coalesce(b.status,'requested'),b.show_day_start_id,b.show_day_end_id,b.quantity,b.unit_price,b.total_price,coalesce(b.affects_inventory,true),coalesce(b.billable,true),b.notes) returning *;
 end loop;
end $$;
revoke all on function public.create_stall_booking_batch(jsonb) from public,anon,service_role;
grant execute on function public.create_stall_booking_batch(jsonb) to authenticated;

-- Restore full-show reservations while retaining directory and cross-show validation.
create or replace function public.set_stall_booking_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_org_id uuid;
  option_record record;
  start_day record;
  end_day record;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id, show_id into option_record
  from public.stall_options
  where id = new.stall_option_id;

  if not found then
    raise exception 'Stall option % does not exist', new.stall_option_id using errcode = 'foreign_key_violation';
  end if;

  if option_record.show_id is distinct from new.show_id or option_record.organization_id is distinct from show_org_id then
    raise exception 'Stall option % does not belong to booking show %', new.stall_option_id, new.show_id
      using errcode = 'check_violation';
  end if;

  if new.horse_id is not null then
    if not exists (select 1 from public.horses where id = new.horse_id) then
      raise exception 'Horse % does not exist', new.horse_id using errcode = 'foreign_key_violation';
    end if;

    if not public.horse_is_linked_to_org(new.horse_id, show_org_id) then
      raise exception 'Booking horse % is not linked to show organization %', new.horse_id, show_org_id
        using errcode = 'check_violation';
    end if;
  end if;

  if not exists (select 1 from public.contacts where id = new.booker_contact_id) then
    raise exception 'Booker contact % does not exist', new.booker_contact_id using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.contacts where id = new.payer_contact_id) then
    raise exception 'Payer contact % does not exist', new.payer_contact_id using errcode = 'foreign_key_violation';
  end if;

  if not public.contact_is_linked_to_org(new.booker_contact_id, show_org_id)
    or not public.contact_is_linked_to_org(new.payer_contact_id, show_org_id)
  then
    raise exception 'Booking contacts must be linked to the same organization as the show'
      using errcode = 'check_violation';
  end if;

  if (new.show_day_start_id is null) <> (new.show_day_end_id is null) then
    raise exception 'Booking show days must both be set or both be empty' using errcode='23514';
  end if;
  if new.show_day_start_id is not null then
  select organization_id, show_id into start_day from public.show_days where id = new.show_day_start_id;
  if not found then
    raise exception 'Start show day % does not exist', new.show_day_start_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id, show_id into end_day from public.show_days where id = new.show_day_end_id;
  if not found then
    raise exception 'End show day % does not exist', new.show_day_end_id using errcode = 'foreign_key_violation';
  end if;

  if start_day.show_id is distinct from new.show_id
    or end_day.show_id is distinct from new.show_id
    or start_day.organization_id is distinct from show_org_id
    or end_day.organization_id is distinct from show_org_id
  then
    raise exception 'Booking show days must belong to the booking show'
      using errcode = 'check_violation';
  end if;

  end if;
  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Booking organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
  return new;
end;
$$;


notify pgrst,'reload schema';
commit;
