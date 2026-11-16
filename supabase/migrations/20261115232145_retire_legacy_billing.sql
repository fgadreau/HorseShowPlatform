-- The retired invoice engine contains fictitious data only. Modern billing_*
-- documents, charges, payments, allocations and source records are preserved.
begin;

-- Stop every obsolete writer before removing its tables or foreign keys.
do $$ declare r record; begin
 for r in select t.tgname,t.tgrelid::regclass as relation
 from pg_trigger t join pg_proc p on p.oid=t.tgfoid
 where not t.tgisinternal and p.pronamespace='public'::regnamespace
 and p.proname in ('reservation_legacy_invoice_sync','reservation_legacy_description_sync',
 'event_legacy_entry_invoice_sync','event_legacy_sale_invoice_sync','membership_legacy_invoice_sync')
 loop execute format('drop trigger %I on %s',r.tgname,r.relation); end loop;
end $$;

create or replace function public.membership_billing_admin(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a jsonb;begin
 a:=public.billing_assert_staff(p_org);
 return jsonb_build_object('can_configure',a->>'kind'='platform_admin' or a->>'role'='admin',
 'types',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('context_id',cfg.context_id) order by t.season_year desc,t.name)
 from public.organization_membership_types t left join public.membership_billing_config cfg on cfg.membership_type_id=t.id where t.organization_id=p_org),'[]'));
end $$;

-- These guards now require the account engine for every monetary write.
-- A delete remains possible for unadopted fictitious source records.
create or replace function public.event_source_billing_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb;org uuid;sh uuid;begin
 for r in select x from jsonb_array_elements(case when tg_op='INSERT' then jsonb_build_array(to_jsonb(new)) when tg_op='DELETE' then jsonb_build_array(to_jsonb(old)) else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end) x order by x->>'organization_id',x->>'show_id' loop
  org:=(r->>'organization_id')::uuid;sh:=(r->>'show_id')::uuid;
  perform public.billing6_lock(org);perform public.billing_lock_scope(org,sh);
  if tg_op<>'DELETE' and not public.reservation_uses_accounts(sh) then raise exception 'EVENT_BILLING_NOT_CONFIGURED';end if;
 end loop;
 if tg_op='UPDATE' and (new.organization_id,new.show_id) is distinct from (old.organization_id,old.show_id) then raise exception 'EVENT_SCOPE_IMMUTABLE';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create or replace function public.reservation_billing_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare r jsonb;o uuid;s uuid;begin
 for r in select x from jsonb_array_elements(case when tg_op='INSERT' then jsonb_build_array(to_jsonb(new)) when tg_op='DELETE' then jsonb_build_array(to_jsonb(old)) else jsonb_build_array(to_jsonb(old),to_jsonb(new)) end) x order by x->>'organization_id',x->>'show_id' loop
  o:=(r->>'organization_id')::uuid;s:=(r->>'show_id')::uuid;
  perform public.billing6_lock(o);perform public.billing_lock_scope(o,s);
  if tg_op<>'DELETE' and not public.reservation_uses_accounts(s) then raise exception 'RESERVATION_BILLING_NOT_CONFIGURED';end if;
 end loop;
 if tg_op='UPDATE' and (new.organization_id,new.show_id) is distinct from (old.organization_id,old.show_id) then raise exception 'RESERVATION_SCOPE_IMMUTABLE';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;

-- Keep the validated modern membership writer; reject obsolete platform writes.
create or replace function public.billing_legacy_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name<>'contact_organization_memberships' then raise exception 'BILLING_ENGINE_RETIRED';end if;
 if tg_op='DELETE' then return old;end if;
 if new.billing_charge_id is null then raise exception 'MEMBERSHIP_BILLING_NOT_CONFIGURED';end if;
 if not exists(select 1 from public.billing_charges ch join public.billing_folios f on f.id=ch.folio_id
 join public.billing_customer_accounts a on a.id=f.payer_customer_account_id
 join public.membership_billing_config cfg on cfg.context_id=f.billing_context_id
 where ch.id=new.billing_charge_id and ch.source_id=new.id and ch.beneficiary_contact_id=new.contact_id
 and ch.organization_id=new.organization_id and a.payer_contact_id=new.payer_contact_id and cfg.membership_type_id=new.membership_type_id)
 then raise exception 'MEMBERSHIP_INVALID_CHARGE';end if;
 return new;
end $$;

-- Remove the invoice fallback from free entry activation and the obsolete FK
-- check from external membership imports without changing their other rules.
do $$ declare source text;changed text;begin
 select pg_get_functiondef('public.entry_submission_activation()'::regprocedure) into source;
 changed:=regexp_replace(source,'free := not exists \([^;]+public.invoices[^;]+\);','free := false;');
 if changed=source then raise exception 'ENTRY_ACTIVATION_CONTRACT_CHANGED';end if;
 execute changed;
 select pg_get_functiondef('public.membership_acquisition_guard()'::regprocedure) into source;
 changed:=replace(source,' or new.invoice_id is not null','');
 if changed=source then raise exception 'MEMBERSHIP_ACQUISITION_CONTRACT_CHANGED';end if;
 execute changed;
end $$;

-- Remove fictitious purchases that were never connected to modern charges.
-- External/complimentary memberships and modern purchases remain intact.
delete from public.contact_organization_memberships
where acquisition_source='platform' and billing_charge_id is null;
alter table public.manual_sales drop column invoice_id;
alter table public.contact_organization_memberships drop column invoice_id;

-- Invoice-owned policies and triggers disappear with their own tables. No
-- CASCADE: an unexpected external dependency must stop the transaction.
drop table public.payments;
drop table public.invoice_line_items;
drop table public.invoices;
drop function public.membership_billing_reconcile(uuid,numeric,uuid);
drop function public.membership_invoice_reconciliation_guard();
drop function public.membership_legacy_invoice_sync();
drop function public.event_legacy_entry_invoice_sync();
drop function public.event_legacy_sale_invoice_sync();
drop function public.reservation_legacy_invoice_sync();
drop function public.reservation_legacy_description_sync();
drop function public.recalculate_entry_judge_fees(uuid);
drop function public.recalculate_invoice_totals(uuid);
drop function public.next_invoice_number(uuid,uuid);
drop function public.set_invoice_refs();
drop function public.set_invoice_line_item_refs();
drop function public.set_payment_refs();
drop function public.sync_incentive_nomination_invoice_status();
drop function public.billing_membership_legacy_guard_base();
drop function public.manual_sale_invoice_item_type(text);
drop function public.stall_booking_invoice_item_type(text);
drop function public.stall_booking_invoice_description(uuid);
alter function public.billing_legacy_guard() rename to membership_billing_charge_guard;
alter function public.assert_no_open_invoice_balance_for_stall_booking()
rename to assert_no_closed_account_balance_for_stall_booking;

commit;
