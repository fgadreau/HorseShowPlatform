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
insert into public.show_score_paid_warmups(id,organization_id,show_id,show_day_id,name,entry_fee,capacity,registration_enabled,schedule_start_time,sort_order) values('a0720000-0000-0000-0000-000000000001','a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001',(select id from public.show_days where show_id='a0680000-0000-0000-0000-000000000001' order by day_date limit 1),'Warm-up TEST',25,40,true,'07:00',30);
update public.shows set is_public=false where id='a0680000-0000-0000-0000-000000000001';
grant select,insert,update,delete on all tables in schema public to authenticated;
set local role authenticated;
do $$ declare options jsonb;begin
 options:=public.paid_warmup_signup_options('a0630000-0000-0000-0000-000000000001');
 if jsonb_array_length(options)<>1 or options->0->>'show_day_id' is null then raise exception 'STAFF_PRIVATE_SCHEDULE_MISSING';end if;
end $$;
select set_config('request.jwt.claim.sub','a0610000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a0610000-0000-0000-0000-000000000002","email":"agent-booker@example.test"}',true);
do $$ begin
 if public.paid_warmup_signup_options('a0630000-0000-0000-0000-000000000001')<>'[]'::jsonb then raise exception 'PRIVATE_SHOW_LEAK';end if;
end $$;
reset role;
update public.shows set is_public=true where id='a0680000-0000-0000-0000-000000000001';
-- The fixture actor creates an external owner's horse: the trigger assigns its agent.
do $$ declare h uuid;begin
 insert into public.horses(name,primary_owner_contact_id,created_by_user_id) values('New agent horse','a0660000-0000-0000-0000-000000000001',public.current_profile_id()) returning id into h;
 if not exists(select 1 from public.horse_contacts where horse_id=h and contact_id='a0660000-0000-0000-0000-000000000003' and role='agent' and can_book_stalls and can_create_entries) then raise exception 'CREATOR_AGENT_MISSING';end if;
 insert into public.horses(name,primary_owner_contact_id,created_by_user_id) values('Own horse','a0660000-0000-0000-0000-000000000003',public.current_profile_id()) returning id into h;
 if exists(select 1 from public.horse_contacts where horse_id=h and role='agent') then raise exception 'OWNER_ASSIGNED_AGENT';end if;
end $$;
set local role authenticated;
do $$ declare r uuid;begin
 if jsonb_array_length(public.paid_warmup_signup_options('a0630000-0000-0000-0000-000000000001'))<>1 then raise exception 'PUBLIC_WARMUP_MISSING';end if;
 r:=public.paid_warmup_request('a0720000-0000-0000-0000-000000000001','a0670000-0000-0000-0000-000000000001',false);
 if r is null then raise exception 'WARMUP_REQUEST_NOT_SAVED';end if;
end $$;
reset role;
do $$ begin
 if (select count(*) from public.paid_warmup_requests where status='requested' and billed_at is null)<>1 then raise exception 'WARMUP_REQUEST_BILLED';end if;
end $$;
insert into public.blocks(id,organization_id,show_id,show_day_id,name,block_type) values('a0740000-0000-0000-0000-000000000001','a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001',(select id from public.show_days where show_id='a0680000-0000-0000-0000-000000000001' order by day_date limit 1),'Agent block TEST','competition');
update public.horse_contacts set can_create_entries=true,can_modify_entries=true where horse_id='a0670000-0000-0000-0000-000000000001';
insert into public.classes(id,organization_id,show_id,name,entry_fee,judge_fee,block_id,organization_discipline_id) values('a0730000-0000-0000-0000-000000000001','a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001','Agent entry TEST',25,10,'a0740000-0000-0000-0000-000000000001','a0650000-0000-0000-0000-000000000001');
set local role authenticated;
insert into public.entries(organization_id,show_id,horse_id,class_id,created_by_user_id,owner_contact_id,payer_contact_id,status)
values('a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001','a0670000-0000-0000-0000-000000000001','a0730000-0000-0000-0000-000000000001',public.current_profile_id(),'a0660000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000001','draft');
insert into public.contact_roles(organization_id,contact_id,role,source) values('a0630000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000001','payer','entry') on conflict(organization_id,contact_id,role) do update set source=excluded.source;
reset role;
-- A second class in the same block must remain available to the same horse.
insert into public.classes(id,organization_id,show_id,name,entry_fee,judge_fee,block_id,organization_discipline_id,sort_order)
values('a0730000-0000-0000-0000-000000000002','a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001','Second class TEST',30,15,'a0740000-0000-0000-0000-000000000001','a0650000-0000-0000-0000-000000000001',2);
set local role authenticated;
insert into public.entries(organization_id,show_id,horse_id,class_id,created_by_user_id,owner_contact_id,payer_contact_id,status)
values('a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001','a0670000-0000-0000-0000-000000000001','a0730000-0000-0000-0000-000000000002',public.current_profile_id(),'a0660000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000001','draft');
reset role;
do $$ begin
 if (select count(*) from public.entries where horse_id='a0670000-0000-0000-0000-000000000001')<>2 then raise exception 'MULTIPLE_BLOCK_CLASSES_REFUSED';end if;
 if (select sum((public.billing_snapshot(f.id)->>'balance')::numeric) from public.billing_folios f)<>70 then raise exception 'SHARED_JUDGE_FEE_INCORRECT';end if;
end $$;
select 'PASS: same horse in two classes of one block, owner billed 25 + 30 + one judge fee 15';
\ir entry_block_rider_assertions.sql
rollback;
