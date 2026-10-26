-- All fixture records and fees are rolled back. No email or payment is sent.
begin;
do $$
declare
  owner_user uuid:=gen_random_uuid();staff_user uuid:=gen_random_uuid();owner_profile uuid;staff_profile uuid;
  org uuid:=gen_random_uuid();sh uuid:=gen_random_uuid();blk uuid:=gen_random_uuid();dir uuid:=gen_random_uuid();
  c1 uuid:=gen_random_uuid();c2 uuid:=gen_random_uuid();c3 uuid:=gen_random_uuid();c4 uuid:=gen_random_uuid();c5 uuid:=gen_random_uuid();
  contact uuid:=gen_random_uuid();h1 uuid:=gen_random_uuid();h2 uuid:=gen_random_uuid();h3 uuid:=gen_random_uuid();
  token uuid:=gen_random_uuid();auto_token uuid:=gen_random_uuid();free_token uuid:=gen_random_uuid();
  bt uuid:=gen_random_uuid();ct uuid:=gen_random_uuid();ct2 uuid:=gen_random_uuid();other_org uuid:=gen_random_uuid();
  sh2 uuid:=gen_random_uuid();blk2 uuid:=gen_random_uuid();c6 uuid:=gen_random_uuid();
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


  insert into public.block_templates(id,organization_id,name) values(bt,org,'Recurring pilot');
  insert into public.class_templates(id,organization_id,block_template_id,organization_discipline_id,name,sort_order) values
    (ct,org,bt,dir,'House recurring',1),(ct2,org,bt,dir,'Other recurring',2);
  update public.classes set class_template_id=ct where id in(c1,c2);
  update public.classes set class_template_id=ct2 where id=c3;
  insert into public.shows(id,organization_id,name,slug,start_date,end_date,is_public) values(sh2,org,'Second house show','house-show-'||sh2,current_date+7,current_date+7,true);
  insert into public.blocks(id,organization_id,show_id,name) values(blk2,org,sh2,'Second house block');
  insert into public.classes(id,organization_id,show_id,block_id,organization_discipline_id,class_template_id,name,entry_fee,sort_order)
    values(c6,org,sh2,blk2,dir,ct,'Recurring at second show',0,1);
  insert into public.organizations(id,name,slug) values(other_org,'Other exclusion org','other-exclusion-'||other_org);
  blocked:=false;
  begin insert into public.house_class_exclusions(organization_id,class_template_id,horse_id) values(other_org,ct,h1);
    exception when others then blocked:=sqlerrm like '%classe maison%';end;
  if not blocked then raise exception 'Cross-association exclusions must fail';end if;
  if has_table_privilege('anon','public.house_class_exclusions','SELECT') or has_function_privilege('anon','public.house_class_entry_blocks(uuid,uuid,uuid,uuid)','EXECUTE') then raise exception 'Anonymous access must be denied';end if;

  perform set_config('request.jwt.claim.sub',staff_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',staff_user,'role','authenticated')::text,true);
  set local role authenticated;
  insert into public.house_class_exclusions(organization_id,class_template_id,rider_contact_id,reason) values(org,ct,contact,'Internal test reason');
  if (select count(*) from public.house_class_exclusions where class_template_id=ct)<>1 then raise exception 'Staff must manage list';end if;
  reset role;
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_user,'role','authenticated')::text,true);
  set local role authenticated;
  if (select count(*) from public.house_class_exclusions)<>0 then raise exception 'Participants must not see private lists';end if;
  blocked:=false;
  begin insert into public.house_class_exclusions(organization_id,class_template_id,horse_id) values(org,ct,h2);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Participant cannot manage exclusion list';end if;
  if (select count(*) from public.house_class_entry_blocks(org,sh,h1,contact))<>2 then raise exception 'Exclusion applies to every occurrence of its recurring class';end if;
  if (select count(*) from public.house_class_entry_blocks(org,sh2,h1,contact))<>1 then raise exception 'Exclusion persists across shows';end if;
  if exists(select 1 from public.house_class_entry_blocks(org,sh,h1,contact) where class_id=c3) then raise exception 'Different house class remains eligible';end if;
  blocked:=false;
  begin perform public.house_class_entry_blocks(other_org,sh,h1,contact);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Mismatched show scope must fail';end if;
  blocked:=false;
  begin insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,status)
    values(org,sh,h1,c1,contact,contact,contact,owner_profile,'draft');exception when check_violation then blocked:=sqlerrm like '%inéligible%';end;
  if not blocked then raise exception 'Direct entry must be rejected by server';end if;
  insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,status)
    values(org,sh,h1,c3,contact,contact,contact,owner_profile,'draft') returning id into e1;
  update public.entries set status='cancelled' where id=e1;
  reset role;
  perform set_config('request.jwt.claim.sub',staff_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',staff_user,'role','authenticated')::text,true);
  set local role authenticated;
  delete from public.house_class_exclusions where class_template_id=ct;
  insert into public.house_class_exclusions(organization_id,class_template_id,horse_id) values(org,ct,h2);
  reset role;
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_user,'role','authenticated')::text,true);
  set local role authenticated;
  if exists(select 1 from public.house_class_entry_blocks(org,sh,h1,contact)) then raise exception 'Removing rider restores eligibility for unlisted horse';end if;
  if (select count(*) from public.house_class_entry_blocks(org,sh,h2,contact))<>2 then raise exception 'Horse exclusion applies with same rider';end if;
  insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,status)
    values(org,sh,h1,c1,contact,contact,contact,owner_profile,'draft');
  reset role;
  raise notice 'PASS house exclusions: scope, staff RLS, privacy, recurring occurrences, rider/horse checks, server enforcement, cancellation and removal';
end $$;
rollback;
