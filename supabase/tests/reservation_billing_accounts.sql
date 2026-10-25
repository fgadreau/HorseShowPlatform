-- Run against disposable fixtures or inside a rolled-back PREPROD transaction.
-- psql variables: org_id, show_id, option_id (horse-free shavings), staff_uid.
-- This script deliberately rolls back all configuration, bookings, charges and payments.
begin;
select set_config('test.org', :'org_id', true),set_config('test.show', :'show_id', true),
 set_config('test.option', :'option_id', true),set_config('request.jwt.claim.sub', :'staff_uid', true);
create temp table reservation_test_baseline as select
 (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id)::text,'')) from public.invoices i) invoices,
 (select available_quantity from public.stall_options where id=current_setting('test.option')::uuid) stock;
select public.billing_set_capabilities(current_setting('test.org')::uuid,null,true,true,false);
select public.configure_reservation_billing(current_setting('test.show')::uuid,
 '{"name_fr":"Test réservations","name_en":"Reservation test","account_prefix":"TEST-RES-A","receipt_prefix":"TEST-RES-R","invoice_prefix":"TEST-RES-I","closing_policy":"manual","payment_policy":"received_only","activation_policy":"allocated_received","categories":["stall_extra"],"staff_roles":["admin","secretary"],"period":"2026","timezone":"America/Toronto"}',
 '[{"code":"TEST-TAX","name":"Explicit test tax","jurisdiction":"TEST","rate":14.975}]');
select set_config('test.payer',(select id::text from public.contacts where linked_user_id=public.current_profile_id() and public.contact_is_linked_to_org(id,current_setting('test.org')::uuid) limit 1),true);
-- Genuine caller RLS; full-show booking intentionally has no day IDs.
set local role authenticated;
select set_config('test.booking', (select id::text from public.create_stall_booking_batch(jsonb_build_array(jsonb_build_object(
 'organization_id',current_setting('test.org'),'show_id',current_setting('test.show'),'stall_option_id',current_setting('test.option'),
 'created_by_user_id',public.current_profile_id(),'booker_contact_id',current_setting('test.payer'),'payer_contact_id',current_setting('test.payer'),
 'status','requested','quantity',7,'unit_price',9.5,'billable',true,'affects_inventory',true)))),true);
reset role;
do $$ declare ch public.billing_charges;snap jsonb;begin
 select c.* into strict ch from public.reservation_billing_links l join public.billing_charges c on c.id=l.charge_id where l.booking_id=current_setting('test.booking')::uuid;
 if ch.quantity<>7 or ch.subtotal<>66.50 or ch.tax_amount<>9.96 then raise exception 'TEST: quantity, amount or tax incorrect';end if;
 snap:=public.billing_snapshot(ch.folio_id);
 if (snap->>'total')::numeric<>76.46 or jsonb_array_length(snap->'charges')<>1 then raise exception 'TEST: account total incorrect';end if;
 if not public.billing_can_read(ch.folio_id) then raise exception 'TEST: staff cannot read account';end if;
 perform set_config('test.folio',ch.folio_id::text,true);
end $$;
set local role authenticated;
update public.stall_bookings set quantity=3 where id=current_setting('test.booking')::uuid;
reset role;
do $$ declare snap jsonb;begin
 snap:=public.billing_snapshot(current_setting('test.folio')::uuid);
 if (snap->>'subtotal')::numeric<>28.50 or (snap->>'tax_amount')::numeric<>4.27 or jsonb_array_length(snap->'charges')<>1 or jsonb_array_length(snap->'reservation_adjustments')<>2 then raise exception 'TEST: immutable replacement/credit incorrect';end if;
end $$;
-- A price failure on a later line must roll back the earlier line and its charge/stock together.
set local role authenticated;
do $$ declare row jsonb;begin
 row:=jsonb_build_object('organization_id',current_setting('test.org'),'show_id',current_setting('test.show'),'stall_option_id',current_setting('test.option'),
 'created_by_user_id',public.current_profile_id(),'booker_contact_id',current_setting('test.payer'),'payer_contact_id',current_setting('test.payer'),'quantity',2,'unit_price',9.5);
 begin
  perform public.create_stall_booking_batch(jsonb_build_array(row,row||'{"unit_price":0}'));
  raise exception 'TEST: forged price accepted';
 exception when others then if sqlerrm<>'RESERVATION_PRICE_CHANGED' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.reservation_billing_links)<>1 or (public.billing_snapshot(current_setting('test.folio')::uuid)->>'total')::numeric<>32.77 then raise exception 'TEST: batch rollback failed';end if;
end $$;
-- Closed account in the SAME context does not count as another account.
-- A distinct NON-EVENT closed account does block; open and zero-balance ones do not.
do $$ declare c public.billing_contexts;typ uuid;ctx uuid;f uuid;ch public.billing_charges;begin
 select * into c from public.billing_contexts where show_id=current_setting('test.show')::uuid;
 typ:=public.billing_create_context_type(c.organization_id,'reservation_debt_test',1,c.config);
 insert into public.billing_contexts(organization_id,kind,context_type_id,context_code,currency,config,opens_at,created_by)
 values(c.organization_id,'non_event',typ,'RESERVATION-DEBT-TEST',c.currency,c.config,clock_timestamp(),public.current_profile_id()) returning id into ctx;
 insert into public.billing_folios(organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by)
 select organization_id,ctx,payer_customer_account_id,currency,'TEST-OTHER-ACCOUNT',public.current_profile_id() from public.billing_folios where id=current_setting('test.folio')::uuid returning id into f;
 select * into ch from public.billing_charges where folio_id=current_setting('test.folio')::uuid and source_type='reservation' order by created_at desc limit 1;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(c.organization_id,f,c.currency,'secretary_sale',gen_random_uuid(),ch.product_id,ch.category,'Test other account',1,10,10,0,ch.beneficiary_contact_id,public.current_profile_id(),'{}');
 perform set_config('test.other_folio',f::text,true);
end $$;
set local role authenticated;
-- Open account has a balance but must not block.
update public.stall_bookings set quantity=4 where id=current_setting('test.booking')::uuid;
reset role;
update public.billing_folios set state='closed',closed_at=clock_timestamp(),closed_by=public.current_profile_id() where id=current_setting('test.other_folio')::uuid;
set local role authenticated;
do $$ begin
 begin
  update public.stall_bookings set quantity=5 where id=current_setting('test.booking')::uuid;
  raise exception 'TEST: closed debt accepted';
 exception when others then if sqlerrm not like 'Un autre compte est fermé%' then raise;end if;end;
 -- Cancellation still works when another account has closed debt.
 update public.stall_bookings set status='cancelled' where id=current_setting('test.booking')::uuid;
end $$;
reset role;
do $$ declare snap jsonb;begin
 snap:=public.billing_snapshot(current_setting('test.folio')::uuid);
 if (snap->>'balance')::numeric<>0 or jsonb_array_length(snap->'charges')<>0 then raise exception 'TEST: cancellation did not reverse account';end if;
 if (select available_quantity from public.stall_options where id=current_setting('test.option')::uuid)<>(select stock from reservation_test_baseline) then raise exception 'TEST: inventory not restored';end if;
 if (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id)::text,'')) from public.invoices i)<>(select invoices from reservation_test_baseline) then raise exception 'TEST: historical invoices changed';end if;
end $$;
-- Paying the closed outside account removes the block; its closed state remains unchanged.
do $$ declare f public.billing_folios;pid uuid;ch uuid;begin
 select * into f from public.billing_folios where id=current_setting('test.other_folio')::uuid;
 insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot)
 values(f.organization_id,f.id,f.currency,10,'cash',clock_timestamp(),public.current_profile_id(),'{"kind":"test"}') returning id into pid;
 select id into ch from public.billing_charges where folio_id=f.id;
 insert into public.billing_payment_allocations values(f.id,pid,ch,10);
end $$;
set local role authenticated;
update public.stall_bookings set status='requested' where id=current_setting('test.booking')::uuid;
reset role;
-- Paid reservation lines must not be silently refunded, repriced or removed.
do $$ declare f public.billing_folios;pid uuid;ch uuid;amount numeric;begin
 select * into f from public.billing_folios where id=current_setting('test.folio')::uuid;
 select c.id,c.total into ch,amount from public.reservation_billing_links l join public.billing_charges c on c.id=l.charge_id where l.booking_id=current_setting('test.booking')::uuid;
 insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot)
 values(f.organization_id,f.id,f.currency,amount,'cash',clock_timestamp(),public.current_profile_id(),'{"kind":"test"}') returning id into pid;
 insert into public.billing_payment_allocations values(f.id,pid,ch,amount);
end $$;
set local role authenticated;
do $$ begin
 begin
  delete from public.stall_bookings where id=current_setting('test.booking')::uuid;
  raise exception 'TEST: paid reservation deleted';
 exception when others then if sqlerrm<>'RESERVATION_CHARGE_HAS_PAYMENT' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if (public.billing_snapshot(current_setting('test.folio')::uuid)->>'balance')::numeric<>0 then raise exception 'TEST: paid account altered';end if;
 if not exists(select 1 from public.stall_bookings where id=current_setting('test.booking')::uuid) then raise exception 'TEST: paid booking lost';end if;
 if has_function_privilege('authenticated','public.reservation_reverse_charge(uuid)','execute') or has_table_privilege('authenticated','public.reservation_billing_links','insert') then raise exception 'TEST: private writer exposed';end if;
end $$;
rollback;
