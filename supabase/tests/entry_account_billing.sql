-- psql variables: org_id, show_id, staff_uid. Dedicated test environment only; always rolls back.
\set ON_ERROR_STOP on
begin;
select set_config('test.org', :'org_id',true),set_config('test.show', :'show_id',true),set_config('request.jwt.claim.sub', :'staff_uid',true),set_config('test.staff_uid', :'staff_uid',true);
create temp table entry_test_history as select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id)::text,'')) digest from public.invoices i;
select public.billing_set_capabilities(current_setting('test.org')::uuid,null,true,true,false);
select public.configure_reservation_billing(current_setting('test.show')::uuid,
 '{"name_fr":"Test inscriptions","name_en":"Entry test","account_prefix":"TEST-E-A","receipt_prefix":"TEST-E-R","invoice_prefix":"TEST-E-I","closing_policy":"manual","payment_policy":"received_only","activation_policy":"allocated_received","categories":["manual","stall_extra"],"staff_roles":["admin","secretary"],"period":"2026","timezone":"America/Toronto"}',
 '[{"code":"TEST-TAX","name":"Explicit test tax","jurisdiction":"TEST","rate":14.975}]');
-- Synthetic horse and unrestricted fixture classes; no real document is approved or changed.
-- Relax the test association policy only within this rolled-back transaction.
update public.organization_health_policies set coggins_required=false,influenza_required=false,rhino_required=false,identity_validation_requirement='none',association_review_required=false where organization_id=current_setting('test.org')::uuid;
update public.eligibility_requirements set is_active=false where organization_id=current_setting('test.org')::uuid;
update public.shows set late_entries_allowed=true,late_entry_fee_percent=50 where id=current_setting('test.show')::uuid;
do $$ declare org uuid:=current_setting('test.org')::uuid;sh uuid:=current_setting('test.show')::uuid;payer uuid;horse uuid;bl uuid;c1 uuid;c2 uuid;directory uuid;
begin
 select id into payer from public.contacts where linked_user_id=public.current_profile_id() and public.contact_is_linked_to_org(id,org) limit 1;
 select id into directory from public.organization_disciplines where organization_id=org limit 1;
 insert into public.horses(name,primary_owner_contact_id) values('Temporary billing test horse',payer) returning id into horse;
 insert into public.blocks(organization_id,show_id,name,entries_close_at) values(org,sh,'Temporary billing test block',clock_timestamp()+interval '1 day') returning id into bl;
 insert into public.classes(organization_id,show_id,block_id,organization_discipline_id,name,entry_fee,judge_fee) values(org,sh,bl,directory,'Temporary class 1',100,25) returning id into c1;
 insert into public.classes(organization_id,show_id,block_id,organization_discipline_id,name,entry_fee,judge_fee,sort_order) values(org,sh,bl,directory,'Temporary class 2',200,30,2) returning id into c2;
 perform set_config('test.payer',payer::text,true);perform set_config('test.horse',horse::text,true);perform set_config('test.block',bl::text,true);perform set_config('test.class1',c1::text,true);perform set_config('test.class2',c2::text,true);
end $$;
set local role authenticated;
do $$ declare id uuid;begin
 insert into public.entries(organization_id,show_id,horse_id,class_id,created_by_user_id,owner_contact_id,payer_contact_id)
 values(current_setting('test.org')::uuid,current_setting('test.show')::uuid,current_setting('test.horse')::uuid,current_setting('test.class1')::uuid,public.current_profile_id(),current_setting('test.payer')::uuid,current_setting('test.payer')::uuid) returning entries.id into id;
 perform set_config('test.entry1',id::text,true);
 insert into public.entries(organization_id,show_id,horse_id,class_id,created_by_user_id,owner_contact_id,payer_contact_id)
 values(current_setting('test.org')::uuid,current_setting('test.show')::uuid,current_setting('test.horse')::uuid,current_setting('test.class2')::uuid,public.current_profile_id(),current_setting('test.payer')::uuid,current_setting('test.payer')::uuid) returning entries.id into id;
 perform set_config('test.entry2',id::text,true);
end $$;
reset role;
do $$ declare snap jsonb;f uuid;begin
 select ch.folio_id into f from public.event_billing_lines l join public.billing_charges ch on ch.id=l.charge_id where l.line_key='entry:'||current_setting('test.entry1');
 perform set_config('test.folio',f::text,true);snap:=public.billing_snapshot(f);
 if (snap->>'subtotal')::numeric<>330 or (snap->>'tax_amount')::numeric<>49.42 or jsonb_array_length(snap->'charges')<>3 then raise exception 'TEST: incorrect entry/judge totals %',snap;end if;
 if (select count(*) from public.event_billing_lines where line_key like 'judge:%')<>1 then raise exception 'TEST: duplicate judge fee';end if;
 if exists(select 1 from jsonb_array_elements(snap->'charges') ch where ch->'entry_identity' is null or ch->'presentation' is null) then raise exception 'TEST: entry document references missing';end if;
end $$;
-- Status changes must not create duplicate charges; cancellation recalculates the remaining block fee.
set local role authenticated;
update public.entries set status='active' where id=current_setting('test.entry1')::uuid;
update public.entries set status='cancelled' where id=current_setting('test.entry2')::uuid;
reset role;
do $$ declare snap jsonb;begin
 snap:=public.billing_snapshot(current_setting('test.folio')::uuid);
 if (snap->>'subtotal')::numeric<>125 or jsonb_array_length(snap->'charges')<>2 then raise exception 'TEST: cancellation/judge recalculation wrong';end if;
end $$;
set local role authenticated;
delete from public.entries where id=current_setting('test.entry1')::uuid;
reset role;
do $$ begin if (public.billing_snapshot(current_setting('test.folio')::uuid)->>'total')::numeric<>0 then raise exception 'TEST: deletion did not reverse all entry fees';end if;end $$;
update public.blocks set entries_close_at=clock_timestamp()-interval '1 day' where id=current_setting('test.block')::uuid;
set local role authenticated;
insert into public.entries(organization_id,show_id,horse_id,class_id,created_by_user_id,owner_contact_id,payer_contact_id,late_fee_amount)
values(current_setting('test.org')::uuid,current_setting('test.show')::uuid,current_setting('test.horse')::uuid,current_setting('test.class1')::uuid,public.current_profile_id(),current_setting('test.payer')::uuid,current_setting('test.payer')::uuid,0);
reset role;
do $$ begin if (public.billing_snapshot(current_setting('test.folio')::uuid)->>'subtotal')::numeric<>175 then raise exception 'TEST: server late surcharge not applied';end if;end $$;
set local role authenticated;
do $$ declare id uuid;begin
 insert into public.manual_sales(organization_id,show_id,payer_contact_id,sold_by_user_id,description,quantity,unit_price,tax_applicable)
 values(current_setting('test.org')::uuid,current_setting('test.show')::uuid,current_setting('test.payer')::uuid,public.current_profile_id(),'Temporary non-taxable sale',2,12.5,false) returning manual_sales.id into id;
 perform set_config('test.sale',id::text,true);
end $$;
reset role;
do $$ begin
 if (public.billing_snapshot(current_setting('test.folio')::uuid)->>'subtotal')::numeric<>200 then raise exception 'TEST: manual sale not in account';end if;
end $$;
set local role authenticated;
update public.manual_sales set status='cancelled' where id=current_setting('test.sale')::uuid;
reset role;
-- Move an unpaid entry to a new payer. Original charges remain visible in the audit only.
do $$ declare payer uuid;begin
 insert into public.contacts(first_name,last_name,linked_user_id,type) values('Temporary','Billing payer',public.current_profile_id(),'owner') returning id into payer;
 perform set_config('test.new_payer',payer::text,true);
end $$;
set local role authenticated;
update public.entries set payer_contact_id=current_setting('test.new_payer')::uuid where show_id=current_setting('test.show')::uuid and horse_id=current_setting('test.horse')::uuid and status='draft';
reset role;
do $$ declare f uuid;ch uuid;pay jsonb;v bigint;begin
 if (public.billing_snapshot(current_setting('test.folio')::uuid)->>'total')::numeric<>0 then raise exception 'TEST: old payer still charged';end if;
 select f1.id,f1.version into f,v from public.billing_folios f1 join public.billing_customer_accounts ca on ca.id=f1.payer_customer_account_id where ca.payer_contact_id=current_setting('test.new_payer')::uuid;
 perform set_config('test.new_folio',f::text,true);
 if (public.billing_snapshot(f)->>'subtotal')::numeric<>175 then raise exception 'TEST: new payer total wrong';end if;
 select c.id into ch from public.event_billing_lines l join public.billing_charges c on c.id=l.charge_id where c.folio_id=f and l.line_key like 'entry:%';
 pay:=public.record_billing_payment(gen_random_uuid(),jsonb_build_object('folio_id',f,'version',v,'amount',20,'method','cash','received_at',clock_timestamp(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',ch,'amount',20))));
 if (public.billing_snapshot(f)->>'received')::numeric<>20 then raise exception 'TEST: real payment RPC failed';end if;
end $$;
set local role authenticated;
do $$ begin
 begin
  delete from public.entries where show_id=current_setting('test.show')::uuid and horse_id=current_setting('test.horse')::uuid and status='draft';
  raise exception 'TEST: paid entry deleted';
 exception when others then if sqlerrm<>'RESERVATION_CHARGE_HAS_PAYMENT' then raise;end if;end;
end $$;
reset role;
-- Personal account and untrusted entry amounts: genuine member RLS, not a staff bypass.
select set_config('test.member_uid', :'member_uid',true);
do $$ declare member_profile uuid;ct uuid;h uuid;begin
 select id into member_profile from public.user_profiles where user_id=current_setting('test.member_uid')::uuid;
 select id into ct from public.contacts where linked_user_id=member_profile and public.contact_is_linked_to_org(id,current_setting('test.org')::uuid) limit 1;
 if ct is null then raise exception 'TEST: member contact fixture required';end if;
 insert into public.horses(name,primary_owner_contact_id,created_by_user_id) values('Temporary member billing horse',ct,member_profile) returning id into h;
 insert into public.horse_contacts(horse_id,contact_id,role,can_create_entries,can_modify_entries,can_book_stalls,can_pay_invoices) values(h,ct,'owner',true,true,true,true) on conflict do nothing;
 update public.horse_contacts set can_create_entries=true,can_modify_entries=true,can_book_stalls=true,can_pay_invoices=true where horse_id=h and contact_id=ct;
 perform set_config('test.member_horse',h::text,true);perform set_config('test.member_contact',ct::text,true);
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.member_uid'),true);
set local role authenticated;
insert into public.entries(organization_id,show_id,horse_id,class_id,created_by_user_id,owner_contact_id,payer_contact_id,base_fee,late_fee_amount)
values(current_setting('test.org')::uuid,current_setting('test.show')::uuid,current_setting('test.member_horse')::uuid,current_setting('test.class1')::uuid,public.current_profile_id(),current_setting('test.member_contact')::uuid,current_setting('test.member_contact')::uuid,0,0);
reset role;
do $$ declare f uuid;view jsonb;begin
 select f1.id into f from public.billing_folios f1 join public.billing_customer_accounts ca on ca.id=f1.payer_customer_account_id where ca.payer_contact_id=current_setting('test.member_contact')::uuid;
 view:=public.billing_ui_detail(f,true);
 if (view->>'subtotal')::numeric<>175 or not public.billing6_personal_read(f) then raise exception 'TEST: personal account/authoritative price failure';end if;
 begin perform public.billing_ui_detail(current_setting('test.new_folio')::uuid,true);raise exception 'TEST: another payer account exposed';
 exception when others then if sqlerrm='TEST: another payer account exposed' then raise;end if;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',current_setting('test.staff_uid'),true);
-- Server-authoritative split prices, including a one-cent remainder; forged direct writes fail.
do $$ declare opt uuid;begin
 insert into public.stall_options(organization_id,show_id,name,price,total_quantity,available_quantity,category,requires_horse_assignment)
 values(current_setting('test.org')::uuid,current_setting('test.show')::uuid,'Temporary split test',9.51,10,10,'extra',false) returning id into opt;
 perform set_config('test.split_option',opt::text,true);
end $$;
set local role authenticated;
do $$ declare r jsonb;begin
 r:=jsonb_build_object('organization_id',current_setting('test.org'),'show_id',current_setting('test.show'),'stall_option_id',current_setting('test.split_option'),'created_by_user_id',public.current_profile_id(),'booker_contact_id',current_setting('test.payer'),'payer_contact_id',current_setting('test.payer'));
 perform public.create_stall_booking_batch(jsonb_build_array(r||'{"quantity":3,"unit_price":9.51,"billable":false,"affects_inventory":true}',r||jsonb_build_object('quantity',1,'unit_price',14.27,'billable',true,'affects_inventory',false,'horse_id',current_setting('test.horse')),r||jsonb_build_object('quantity',1,'unit_price',14.26,'billable',true,'affects_inventory',false,'horse_id',current_setting('test.member_horse'))));
 begin
  insert into public.stall_bookings(organization_id,show_id,stall_option_id,horse_id,created_by_user_id,booker_contact_id,payer_contact_id,quantity,unit_price,billable,affects_inventory)
  values(current_setting('test.org')::uuid,current_setting('test.show')::uuid,current_setting('test.split_option')::uuid,current_setting('test.horse')::uuid,public.current_profile_id(),current_setting('test.payer')::uuid,current_setting('test.payer')::uuid,1,0,true,false);
  raise exception 'TEST: forged direct split accepted';
 exception when others then if sqlerrm<>'RESERVATION_SPLIT_REQUIRES_BATCH' then raise;end if;end;
end $$;
reset role;
do $$ begin
 if (select sum(c.subtotal) from public.reservation_billing_links l join public.billing_charges c on c.id=l.charge_id join public.stall_bookings b on b.id=l.booking_id where b.stall_option_id=current_setting('test.split_option')::uuid)<>28.53 then raise exception 'TEST: split total/rounding wrong';end if;
 if (select available_quantity from public.stall_options where id=current_setting('test.split_option')::uuid)<>7 then raise exception 'TEST: split inventory decremented more than once';end if;
end $$;
reset role;
-- The modern non-event sale/payment/finalization RPCs stay usable after adoption.
do $$ declare cfg jsonb;ctx uuid;prod uuid;customer uuid;sale jsonb;folio uuid;statement jsonb;ver bigint;ch uuid;begin
 select config into cfg from public.billing_contexts where show_id=current_setting('test.show')::uuid;
 cfg:=cfg||'{"name_fr":"Hors concours test","name_en":"Non-event test","account_prefix":"TEST-OUT-A","receipt_prefix":"TEST-OUT-R","invoice_prefix":"TEST-OUT-I"}';
 insert into public.organization_products(organization_id,name,category,default_price,tax_applicable) values(current_setting('test.org')::uuid,'Temporary outside product','manual',10,true) returning id into prod;
 ctx:=public.configure_non_event_billing(current_setting('test.org')::uuid,2026,cfg,'[{"code":"TEST-TAX","name":"Explicit test tax","jurisdiction":"TEST","rate":14.975}]');
 customer:=public.billing_get_customer_account(current_setting('test.org')::uuid,current_setting('test.payer')::uuid,ctx);
 sale:=public.add_billing_sale(gen_random_uuid(),jsonb_build_object('context_id',ctx,'payer_customer_account_id',customer,'product_id',prod,'quantity',1,'source_id',gen_random_uuid()));
 folio:=(sale->'account'->>'folio_id')::uuid;ch:=(sale->>'charge_id')::uuid;
 if (public.billing_snapshot(folio)->>'total')::numeric<>11.50 then raise exception 'TEST: non-event modern sale wrong';end if;
 statement:=public.get_billing_statement(gen_random_uuid(),folio);
 select version into ver from public.billing_folios where id=folio;
 perform public.finalize_billing_folio(gen_random_uuid(),folio,ver,(statement->>'document_id')::uuid);
 if (select state from public.billing_folios where id=folio)<>'closed' or (public.billing_snapshot(folio)->>'balance')::numeric<>11.50 then raise exception 'TEST: closed non-event debt wrong';end if;
 select version into ver from public.billing_folios where id=folio;
 perform public.record_billing_payment(gen_random_uuid(),jsonb_build_object('folio_id',folio,'version',ver,'amount',11.50,'method','cash','received_at',clock_timestamp(),'confirmed',true,'allocations',jsonb_build_array(jsonb_build_object('charge_id',ch,'amount',11.50))));
 if (public.billing_snapshot(folio)->>'balance')::numeric<>0 or (select state from public.billing_folios where id=folio)<>'closed' then raise exception 'TEST: payment of closed account wrong';end if;
end $$;
reset role;
do $$ begin
 if (select md5(coalesce(jsonb_agg(to_jsonb(i) order by i.id)::text,'')) from public.invoices i)<>(select digest from entry_test_history) then raise exception 'TEST: historical invoices modified';end if;
 if has_function_privilege('authenticated','public.event_billing_set_line(text,uuid,uuid,uuid,uuid,uuid,text,text,numeric,numeric,boolean,boolean,text)','execute') then raise exception 'TEST: private domain writer exposed';end if;
end $$;
rollback;
