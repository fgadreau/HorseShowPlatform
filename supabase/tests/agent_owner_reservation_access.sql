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
grant select,insert,update,delete on all tables in schema public to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','a0610000-0000-0000-0000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a0610000-0000-0000-0000-000000000002","email":"agent-booker@example.test"}',true);
do $$ declare affected integer;begin
 if (select count(*) from public.contacts where id='a0660000-0000-0000-0000-000000000001')<>1 then raise exception 'OWNER_NOT_VISIBLE';end if;
 if exists(select 1 from public.contacts where id='a0660000-0000-0000-0000-000000000002') then raise exception 'UNRELATED_OWNER_VISIBLE';end if;
 if public.can_access_contact('a0660000-0000-0000-0000-000000000001') then raise exception 'GENERAL_CONTACT_AUTHORITY_LEAK';end if;
 if exists(select 1 from public.horses where id='a0670000-0000-0000-0000-000000000002') then raise exception 'OTHER_HORSE_LEAK';end if;
 if public.can_bill_managed_horse_owner('a0670000-0000-0000-0000-000000000002','a0660000-0000-0000-0000-000000000001') then raise exception 'UNMANAGED_HORSE_BILLING';end if;
 update public.contacts set first_name='Not permitted' where id='a0660000-0000-0000-0000-000000000001';get diagnostics affected=row_count;
 if affected<>0 then raise exception 'OWNER_IDENTITY_EDIT_ALLOWED';end if;
end $$;
insert into public.contact_roles(organization_id,contact_id,role,source) values('a0630000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000001','payer','reservation') on conflict(organization_id,contact_id,role) do update set source=excluded.source;
insert into public.stall_bookings(id,organization_id,show_id,stall_option_id,horse_id,created_by_user_id,booker_contact_id,payer_contact_id,status,quantity,unit_price,total_price)
select 'a0700000-0000-0000-0000-000000000001','a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001','a0690000-0000-0000-0000-000000000001','a0670000-0000-0000-0000-000000000001',public.current_profile_id(),'a0660000-0000-0000-0000-000000000003','a0660000-0000-0000-0000-000000000001','requested',1,100,100;
do $$ begin
 if (select payer_contact_id from public.stall_bookings where id='a0700000-0000-0000-0000-000000000001')<>'a0660000-0000-0000-0000-000000000001'::uuid then raise exception 'WRONG_PAYER';end if;
 begin
 update public.stall_bookings set payer_contact_id='a0660000-0000-0000-0000-000000000002' where id='a0700000-0000-0000-0000-000000000001';
 raise exception 'UNRELATED_PAYER_ALLOWED';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Revocation of booking authority must immediately revoke owner billing authority.
update public.horse_contacts set can_book_stalls=false where horse_id='a0670000-0000-0000-0000-000000000001' and contact_id='a0660000-0000-0000-0000-000000000003';
set local role authenticated;
do $$ begin
 if public.can_bill_managed_horse_owner('a0670000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000001') then raise exception 'REVOKED_BOOKING_PERMISSION_IGNORED';end if;
end $$;
reset role;
-- The owner is still a contact without a login; its own folio already holds the box.
do $$ begin
 if not exists(select 1 from public.billing_folios f join public.billing_customer_accounts a on a.id=f.payer_customer_account_id where a.payer_contact_id='a0660000-0000-0000-0000-000000000001' and (public.billing_snapshot(f.id)->>'balance')::numeric=100) then raise exception 'OWNER_ACCOUNT_NOT_BILLED';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a0610000-0000-0000-0000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a0610000-0000-0000-0000-000000000003","email":"future-owner@example.test"}',true);
do $$ begin if exists(select 1 from public.claim_contacts_for_current_user()) then raise exception 'UNVERIFIED_EMAIL_CLAIMED_OWNER';end if;end $$;
reset role;
update auth.users set email_confirmed_at=now() where id='a0610000-0000-0000-0000-000000000003';
set local role authenticated;
do $$ begin
 perform public.claim_contacts_for_current_user();
 if not exists(select 1 from public.contacts where id='a0660000-0000-0000-0000-000000000001' and linked_user_id=public.current_profile_id()) then raise exception 'VERIFIED_OWNER_NOT_LINKED';end if;
 if not exists(select 1 from public.billing_folios f where (public.get_billing_stripe_status(f.id,true)->>'available')::numeric=100) then raise exception 'ORIGINAL_ACCOUNT_NOT_RECOVERED';end if;
end $$;
reset role;
select 'PASS: agent owner visibility, scoped booking, owner without login, unchanged identity, denied unrelated payer, verified email recovery of original account' as result;
rollback;
