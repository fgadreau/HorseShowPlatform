\set ON_ERROR_STOP on
begin;
-- Fictitious local actors: staff, agent, owner-to-be. No existing account identity is used.
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('a0610000-0000-0000-0000-000000000001','agent-staff@example.test',now(),'{}'),
('a0610000-0000-0000-0000-000000000002','agent-booker@example.test',now(),'{}'),
('a0610000-0000-0000-0000-000000000003','future-owner@example.test',null,'{}');
insert into public.platform_admins(user_id) select id from public.user_profiles where user_id='a0610000-0000-0000-0000-000000000001';
insert into public.organizations(id,name,slug,currency) values('a0630000-0000-0000-0000-000000000001','Agent TEST','agent-owner-test','CAD');
insert into public.disciplines(id,code,name) values('a0640000-0000-0000-0000-000000000001','AGENTTEST','Agent TEST');
insert into public.organization_disciplines(id,organization_id,discipline_id,is_default) values('a0650000-0000-0000-0000-000000000001','a0630000-0000-0000-0000-000000000001','a0640000-0000-0000-0000-000000000001',true);
insert into public.contacts(id,type,first_name,last_name,email,linked_user_id) values
('a0660000-0000-0000-0000-000000000001','owner','Future','Owner','future-owner@example.test',null),
('a0660000-0000-0000-0000-000000000002','owner','Other','Owner','other-owner@example.test',null);
insert into public.contacts(id,type,first_name,last_name,linked_user_id) select 'a0660000-0000-0000-0000-000000000003','agent','Test','Agent',id from public.user_profiles where user_id='a0610000-0000-0000-0000-000000000002';
insert into public.directory_contacts(organization_discipline_id,contact_id) select 'a0650000-0000-0000-0000-000000000001',id from public.contacts where id::text like 'a0660000%';
insert into public.horses(id,name,primary_owner_contact_id) values
('a0670000-0000-0000-0000-000000000001','Managed horse','a0660000-0000-0000-0000-000000000001'),
('a0670000-0000-0000-0000-000000000002','Same owner, unmanaged horse','a0660000-0000-0000-0000-000000000001'),
('a0670000-0000-0000-0000-000000000003','Other owner horse','a0660000-0000-0000-0000-000000000002');
insert into public.directory_horses(organization_discipline_id,horse_id) select 'a0650000-0000-0000-0000-000000000001',id from public.horses where id::text like 'a0670000%';
insert into public.horse_contacts(horse_id,contact_id,role,can_book_stalls) values('a0670000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000003','agent',true);
insert into public.shows(id,organization_id,name,slug,start_date,end_date,status,default_currency,timezone,is_public) values('a0680000-0000-0000-0000-000000000001','a0630000-0000-0000-0000-000000000001','Agent TEST','agent-test',current_date,current_date+1,'open','CAD','America/Toronto',true);
insert into public.organization_health_policies(organization_id,effective_from,coggins_required,influenza_required,rhino_required,identity_validation_requirement) values('a0630000-0000-0000-0000-000000000001',current_date-1,false,false,false,'none');
insert into public.stall_options(id,organization_id,show_id,name,price,total_quantity,available_quantity,category) values('a0690000-0000-0000-0000-000000000001','a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001','Test box',100,10,10,'stall');
select set_config('request.jwt.claim.sub','a0610000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a0610000-0000-0000-0000-000000000001","email":"agent-staff@example.test"}',true);
select public.billing_set_capabilities('a0630000-0000-0000-0000-000000000001',null,true,true,true);
select public.configure_reservation_billing('a0680000-0000-0000-0000-000000000001','{"name_fr":"Agent TEST","name_en":"Agent TEST","account_prefix":"AT-A","receipt_prefix":"AT-R","invoice_prefix":"AT-I","closing_policy":"manual","payment_policy":"received_only","activation_policy":"allocated_received","categories":["stall_extra"],"staff_roles":["admin","secretary"],"timezone":"America/Toronto"}','[]');
-- Use the fixture staff identity, without depending on agent-owner policies.
update public.stall_options set category='extra' where id='a0690000-0000-0000-0000-000000000001';
grant select,insert,update,delete on all tables in schema public to authenticated;
set local role authenticated;
do $$ declare rows jsonb;first_group uuid;second_group uuid;n integer;begin
 rows:=jsonb_build_array(jsonb_build_object('organization_id','a0630000-0000-0000-0000-000000000001','show_id','a0680000-0000-0000-0000-000000000001','stall_option_id','a0690000-0000-0000-0000-000000000001','created_by_user_id',public.current_profile_id(),'booker_contact_id','a0660000-0000-0000-0000-000000000003','payer_contact_id','a0660000-0000-0000-0000-000000000001','status','reserved','quantity',1,'unit_price',100,'total_price',100));
 select count(*),min(reservation_id::text)::uuid into n,first_group from public.create_stall_booking_batch(rows||rows);
 if n<>2 or first_group is null then raise exception 'MISSING_BATCH_IDENTITY';end if;
 if (select count(distinct reservation_id) from public.stall_bookings)<>1 then raise exception 'ITEMS_SPLIT_INTO_RESERVATIONS';end if;
 select reservation_id into second_group from public.create_stall_booking_batch(rows);
 if second_group=first_group then raise exception 'DISTINCT_SUBMISSIONS_MERGED';end if;
 if (select count(distinct reservation_id) from public.stall_bookings)<>2 then raise exception 'WRONG_RESERVATION_COUNT';end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.reservation_billing_links)<>3 then raise exception 'BILLING_ITEMS_CHANGED';end if;
 if (select sum((public.billing_snapshot(f.id)->>'balance')::numeric) from public.billing_folios f)<>300 then raise exception 'WRONG_ACCOUNT_BALANCE';end if;
end $$;
reset role;
select 'PASS: batch identity groups all items, separates submissions and preserves three charges / balance 300';
rollback;
