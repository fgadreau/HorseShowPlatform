-- All fixture records and fees are rolled back. No email or payment is sent.
begin;
do $$
declare
  owner_user uuid:=gen_random_uuid();staff_user uuid:=gen_random_uuid();owner_profile uuid;staff_profile uuid;
  org uuid:=gen_random_uuid();sh uuid:=gen_random_uuid();blk uuid:=gen_random_uuid();dir uuid:=gen_random_uuid();
  c1 uuid:=gen_random_uuid();c2 uuid:=gen_random_uuid();c3 uuid:=gen_random_uuid();c4 uuid:=gen_random_uuid();c5 uuid:=gen_random_uuid();
  contact uuid:=gen_random_uuid();h1 uuid:=gen_random_uuid();h2 uuid:=gen_random_uuid();h3 uuid:=gen_random_uuid();
  token uuid:=gen_random_uuid();auto_token uuid:=gen_random_uuid();free_token uuid:=gen_random_uuid();
  e1 uuid; e2 uuid;rec public.organization_back_numbers;blocked boolean;options jsonb;
begin
  if has_function_privilege('anon','public.entry_back_number_options(uuid,uuid,uuid[])','EXECUTE')
    or has_function_privilege('authenticated','public.claim_horse_back_number_before_workflow(uuid,uuid,integer,text,uuid)','EXECUTE') then
    raise exception 'Internal back number helpers must not be exposed';
  end if;
  insert into auth.users(id,email,raw_user_meta_data) values
    (owner_user,owner_user||'@example.test','{"first_name":"Back","last_name":"Number Owner"}'),
    (staff_user,staff_user||'@example.test','{"first_name":"Back","last_name":"Number Staff"}');
  select id into owner_profile from public.user_profiles where user_id=owner_user;
  select id into staff_profile from public.user_profiles where user_id=staff_user;
  insert into public.organizations(id,name,slug,is_test_mode,back_number_request_fee) values(org,'Back number pilot','back-number-'||org,true,15);
  update public.organization_health_policies set coggins_required=false,influenza_required=false,rhino_required=false where organization_id=org;
  insert into public.organization_members(organization_id,user_id,role) values(org,staff_profile,'admin');
  insert into public.organization_disciplines(id,organization_id,discipline_id,is_default) values(dir,org,(select id from public.disciplines where code='REINING'),true);
  insert into public.shows(id,organization_id,name,slug,start_date,end_date,is_public) values(sh,org,'Back number pilot','back-number-show-'||sh,current_date,current_date,true);
  insert into public.blocks(id,organization_id,show_id,name) values(blk,org,sh,'Back number block');
  insert into public.classes(id,organization_id,show_id,block_id,organization_discipline_id,name,entry_fee,sort_order) values
    (c1,org,sh,blk,dir,'First class',0,1),(c2,org,sh,blk,dir,'Second class',0,2),(c3,org,sh,blk,dir,'Third class',0,3),
    (c4,org,sh,blk,dir,'Auto class',0,4),(c5,org,sh,blk,dir,'Free class',0,5);
  insert into public.contacts(id,type,first_name,last_name,linked_user_id,created_by_user_id) values(contact,'owner','Pilot','Participant',owner_profile,owner_profile);
  insert into public.directory_contacts(organization_discipline_id,contact_id,source,created_by_user_id) values(dir,contact,'manual',owner_profile);
  insert into public.horses(id,name,primary_owner_contact_id,created_by_user_id) values
    (h1,'Number Horse One',contact,owner_profile),(h2,'Number Horse Two',contact,owner_profile),(h3,'Number Horse Three',contact,owner_profile);
  insert into public.directory_horses(organization_discipline_id,horse_id,source,created_by_user_id) values(dir,h1,'manual',owner_profile),(dir,h2,'manual',owner_profile),(dir,h3,'manual',owner_profile);
  insert into public.horse_contacts(horse_id,contact_id,role,can_create_entries,can_modify_entries,can_pay_invoices)
    values(h1,contact,'owner',true,true,true),(h2,contact,'owner',true,true,true),(h3,contact,'owner',true,true,true);

  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_user,'role','authenticated')::text,true);
  set local role authenticated;
  rec:=public.claim_horse_back_number(org,h1,123,'horse',null);
  if rec.number<>123 or rec.association_issued then raise exception 'A supplied number must be personal and permanent';end if;
  options:=public.entry_back_number_options(org,h1,array[blk]);
  if (options->>'number')::integer<>123 then raise exception 'Horse lookup must return its association number';end if;
  blocked:=false;
  begin perform public.claim_horse_back_number(org,h2,123,'horse',null);exception when others then blocked:=true;end;
  if not blocked then raise exception 'Two horses cannot own the same number';end if;

  insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,entry_number,back_number_choice,status)
    values(org,sh,h1,c1,contact,contact,contact,owner_profile,123,'reuse','draft') returning id into e1;
  reset role;
  update public.blocks set requires_association_back_number=true where id=blk;
  blocked:=false;
  begin update public.blocks set draw_prepared_at=now() where id=blk;exception when others then blocked:=sqlerrm like '%dossards sont en attente%';end;
  if not blocked then raise exception 'A forced block cannot draw a positive but personal number';end if;
  update public.blocks set requires_association_back_number=false where id=blk;
  set local role authenticated;
  insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,back_number_choice,back_number_request_token,status)
    values(org,sh,h1,c2,contact,contact,contact,owner_profile,'request',token,'draft') returning id into e2;
  insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,back_number_choice,back_number_request_token,status)
    values(org,sh,h1,c3,contact,contact,contact,owner_profile,'request',token,'draft');
  reset role;
  if (select count(*) from public.back_number_requests where organization_id=org)<>1 then raise exception 'One request for multiple classes';end if;
  if (select count(*) from public.manual_sales where source_payload->>'back_number_request_id'=token::text and unit_price=15)<>1 then raise exception 'Charge the request only once';end if;

  perform set_config('request.jwt.claim.sub',staff_user::text,true);
  set local role authenticated;
  blocked:=false;
  begin update public.blocks set draw_prepared_at=now() where id=blk;exception when others then blocked:=sqlerrm like '%dossards sont en attente%';end;
  if not blocked then raise exception 'Draw creation must reject pending numbers';end if;
  perform public.assign_association_back_number(org,h1,314);
  reset role;
  if exists(select 1 from public.entries where organization_id=org and horse_id=h1 and entry_number is distinct from 314) then raise exception 'Manual assignment must resolve every pending entry and replace the permanent number';end if;
  if not exists(select 1 from public.back_number_requests where id=token and status='assigned' and assigned_number=314) then raise exception 'Manual request completion missing';end if;
  update public.entries set status='cancelled' where id=e2;
  if not exists(select 1 from public.organization_back_numbers where organization_id=org and assigned_horse_id=h1 and number=314 and status='assigned') then raise exception 'Cancellation must retain the assignment';end if;
  if (select count(*) from public.manual_sales where source_payload->>'back_number_request_id'=token::text and status='active')<>1 then raise exception 'Cancellation must retain the request fee';end if;

  update public.organizations set back_number_auto_assign=true where id=org;
  insert into public.organization_back_numbers(organization_id,number) values(org,400);
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  set local role authenticated;
  insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,back_number_choice,back_number_request_token,status)
    values(org,sh,h2,c4,contact,contact,contact,owner_profile,'request',auto_token,'draft');
  reset role;
  if not exists(select 1 from public.entries where organization_id=org and horse_id=h2 and entry_number=400) then raise exception 'Automatic assignment must use association stock';end if;
  update public.blocks set requires_association_back_number=true,back_number_request_fee=0 where id=blk;
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  set local role authenticated;
  blocked:=false;
  begin insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,entry_number,back_number_choice,status)
    values(org,sh,h3,c5,contact,contact,contact,owner_profile,500,'personal','draft');exception when others then blocked:=sqlerrm like '%impose un dossard%';end;
  if not blocked then raise exception 'A forced block must reject a personal number';end if;
  insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,back_number_choice,back_number_request_token,status)
    values(org,sh,h3,c5,contact,contact,contact,owner_profile,'request',free_token,'draft');
  reset role;
  if not exists(select 1 from public.back_number_requests where id=free_token and fee=0 and status='pending') then raise exception 'Empty stock must remain pending and respect the free block override';end if;
  if exists(select 1 from public.manual_sales where source_payload->>'back_number_request_id'=free_token::text) then raise exception 'A free request must not create a fee';end if;

  -- The permanent number remains editable; active entries follow, cancelled history does not.
  update public.blocks set requires_association_back_number=false where id=blk;
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  set local role authenticated;
  perform public.claim_horse_back_number(org,h1,777,'horse',null);
  reset role;
  if exists(select 1 from public.entries where organization_id=org and horse_id=h1 and status in ('draft','pending_checkout','active') and entry_number is distinct from 777) then raise exception 'Changing a permanent number must update active entries';end if;
  if not exists(select 1 from public.entries where id=e2 and status='cancelled' and entry_number=314) then raise exception 'Changing a permanent number must preserve cancelled history';end if;

  -- Same contract on the adopted billing engine, with taxes and no duplicate charge.
  sh:=gen_random_uuid();blk:=gen_random_uuid();c1:=gen_random_uuid();c2:=gen_random_uuid();h3:=gen_random_uuid();token:=gen_random_uuid();
  insert into public.shows(id,organization_id,name,slug,start_date,end_date,is_public) values(sh,org,'Account number test','account-number-'||sh,current_date,current_date,true);
  insert into public.blocks(id,organization_id,show_id,name,back_number_request_fee) values(blk,org,sh,'Account number block',20);
  insert into public.classes(id,organization_id,show_id,block_id,organization_discipline_id,name,entry_fee,sort_order) values(c1,org,sh,blk,dir,'Account class 1',0,1),(c2,org,sh,blk,dir,'Account class 2',0,2);
  insert into public.horses(id,name,primary_owner_contact_id,created_by_user_id) values(h3,'Account Number Horse',contact,owner_profile);
  insert into public.directory_horses(organization_discipline_id,horse_id,source,created_by_user_id) values(dir,h3,'manual',owner_profile);
  insert into public.horse_contacts(horse_id,contact_id,role,can_create_entries,can_modify_entries,can_pay_invoices) values(h3,contact,'owner',true,true,true);
  perform set_config('request.jwt.claim.sub',staff_user::text,true);
  insert into public.platform_admins(user_id) values(staff_profile);
  perform public.billing_set_capabilities(org,null,true,true,false);
  perform public.configure_reservation_billing(sh,
    '{"name_fr":"Test dossards","name_en":"Back number test","account_prefix":"TEST-BN-A","receipt_prefix":"TEST-BN-R","invoice_prefix":"TEST-BN-I","closing_policy":"manual","payment_policy":"received_only","activation_policy":"allocated_received","categories":["manual","stall_extra"],"staff_roles":["admin","secretary"],"period":"2026","timezone":"America/Toronto"}',
    '[{"code":"BN-TAX","name":"Explicit test tax","jurisdiction":"TEST","rate":10}]');
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  set local role authenticated;
  insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,back_number_choice,back_number_request_token,status)
    values(org,sh,h3,c1,contact,contact,contact,owner_profile,'request',token,'draft') returning id into e1;
  insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,back_number_choice,back_number_request_token,status)
    values(org,sh,h3,c2,contact,contact,contact,owner_profile,'request',token,'draft');
  update public.entries set status='cancelled' where id=e1;
  reset role;
  if (select count(*) from public.event_billing_lines where line_key='back-number:'||token)<>1 then raise exception 'The account request must be billed only once';end if;
  if not exists(select 1 from public.event_billing_lines l join public.billing_charges c on c.id=l.charge_id where l.line_key='back-number:'||token and c.unit_price=20 and c.subtotal=20 and c.tax_amount=2) then raise exception 'Account request amount or taxes are wrong';end if;
end $$;
rollback;
