-- All fixture records and fees are rolled back. No email or payment is sent.
begin;
do $$
declare
  owner_user uuid:=gen_random_uuid();staff_user uuid:=gen_random_uuid();owner_profile uuid;staff_profile uuid;
  org uuid:=gen_random_uuid();sh uuid:=gen_random_uuid();blk uuid:=gen_random_uuid();dir uuid:=gen_random_uuid();
  c1 uuid:=gen_random_uuid();c2 uuid:=gen_random_uuid();c3 uuid:=gen_random_uuid();c4 uuid:=gen_random_uuid();c5 uuid:=gen_random_uuid();
  contact uuid:=gen_random_uuid();h1 uuid:=gen_random_uuid();h2 uuid:=gen_random_uuid();h3 uuid:=gen_random_uuid();
  token uuid:=gen_random_uuid();auto_token uuid:=gen_random_uuid();free_token uuid:=gen_random_uuid();
  agent_user uuid:=gen_random_uuid();agent_profile uuid;other_user uuid:=gen_random_uuid();other_profile uuid;
  request1 uuid;request2 uuid;request3 uuid;new_horse public.horses;created2 public.horses;agent_contact uuid;
  owner_request uuid;nrha_number text:='99'||floor(random()*100000000000000)::bigint::text;
  private_owner uuid:=gen_random_uuid();private_request uuid;private_horse public.horses;outcome jsonb;
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

  if has_function_privilege('anon','public.search_horse_agent_candidates(uuid,text)','EXECUTE') or
    has_function_privilege('authenticated','public.horse_agent_contact_for_profile(uuid)','EXECUTE') then raise exception 'Agent helpers must stay private';end if;
  insert into auth.users(id,email,raw_user_meta_data) values
    (agent_user,agent_user||'@example.test','{"first_name":"Agent","last_name":"Pilot"}'),
    (other_user,other_user||'@example.test','{"first_name":"Other","last_name":"Pilot"}');
  select id into agent_profile from public.user_profiles where user_id=agent_user;
  select id into other_profile from public.user_profiles where user_id=other_user;
  insert into public.contacts(id,type,first_name,last_name,linked_user_id,created_by_user_id,email)
    values(private_owner,'owner','Other','Pilot',other_profile,other_profile,other_user||'@example.test');
  insert into public.contacts(type,first_name,last_name,linked_user_id,created_by_user_id) values('agent','Staff','Reviewer',staff_profile,staff_profile);
  insert into public.contact_external_identifiers(contact_id,external_credential_issuer_id,identifier_value,status)
    values(contact,(select id from public.external_credential_issuers where code='NRHA' limit 1),nrha_number,'active');
  insert into public.contact_external_identifiers(contact_id,external_credential_issuer_id,identifier_value,status)
    values(private_owner,(select id from public.external_credential_issuers where code='NRHA' limit 1),nrha_number||'7','active');
  perform set_config('request.jwt.claim.sub',agent_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',agent_user,'role','authenticated')::text,true);
  set local role authenticated;
  if public.can_access_horse(h1) then raise exception 'Requester must start without access to the existing horse';end if;
  if (select count(*) from public.search_horse_agent_candidates(org,'Number Horse One'))<>1 then raise exception 'Exact-name search must return a minimal candidate without association access';end if;
  if exists(select 1 from public.search_horse_agent_candidates(org,'Num')) then raise exception 'No partial-name enumeration';end if;
  request1:=public.request_horse_agent_access(org,h1,'Please let me enter this horse');
  if public.request_horse_agent_access(org,h1,'Retry')<>request1 then raise exception 'Pending requests must be idempotent';end if;
  if public.can_access_horse(h1) then raise exception 'Pending request must grant no horse access';end if;
  if exists(select 1 from public.contacts where id=contact) then raise exception 'Pending requester must not receive owner private data';end if;
  if jsonb_array_length(public.list_horse_agent_requests(org))<>1 then raise exception 'Requester must track own pending request';end if;
  blocked:=false;begin perform public.decide_horse_agent_request(request1,'approve');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Requester cannot approve own request';end if;
  reset role;
  perform set_config('request.jwt.claim.sub',other_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',other_user,'role','authenticated')::text,true);
  set local role authenticated;
  if jsonb_array_length(public.list_horse_agent_requests(org))<>0 or (select count(*) from public.horse_agent_requests)<>0 then raise exception 'Strangers must not see requests';end if;
  blocked:=false;begin perform public.decide_horse_agent_request(request1,'approve');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Stranger cannot approve';end if;
  request2:=public.request_horse_agent_access(org,h2,'Second agent');
  reset role;
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_user,'role','authenticated')::text,true);
  set local role authenticated;
  if not public.can_review_horse_agent_request(org,h1) then raise exception 'Owner must be allowed to review';end if;
  perform public.decide_horse_agent_request(request1,'approve');
  perform public.decide_horse_agent_request(request1,'approve');
  reset role;
  perform set_config('request.jwt.claim.sub',staff_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',staff_user,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.decide_horse_agent_request(request2,'approve');
  reset role;
  perform set_config('request.jwt.claim.sub',agent_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',agent_user,'role','authenticated')::text,true);
  set local role authenticated;
  if not public.can_access_horse(h1) or not public.can_create_entries_for_horse(h1) then raise exception 'Approved agent must gain horse and entry access';end if;
  insert into public.entries(organization_id,show_id,horse_id,class_id,owner_contact_id,payer_contact_id,rider_contact_id,created_by_user_id,status)
    values(org,sh,h1,c1,contact,contact,contact,agent_profile,'draft');
  select hc.contact_id into agent_contact from public.horse_contacts hc join public.contacts c on c.id=hc.contact_id
    where hc.horse_id=h1 and hc.role='agent' and c.linked_user_id=agent_profile;
  if agent_contact is null then raise exception 'Agent must be linked to requester account';end if;
  if exists(select 1 from public.horse_contacts where horse_id=h1 and contact_id=agent_contact and can_pay_invoices) then raise exception 'Agent must not automatically receive payment rights';end if;
  if (select primary_owner_contact_id from public.horses where id=h1)<>contact then raise exception 'Approval must preserve owner';end if;
  if public.can_manage_contact_identity(contact) then raise exception 'Agent approval must not give identity ownership over the owner contact';end if;
  blocked:=false;begin update public.horses set primary_owner_contact_id=agent_contact where id=h1;exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Agency must not allow ownership takeover';end if;
  blocked:=false;begin insert into public.horse_contacts(horse_id,contact_id,role) values(h1,agent_contact,'co-owner');exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Agent cannot promote itself to co-owner';end if;
  blocked:=false;begin insert into public.horse_contacts(horse_id,contact_id,role,can_create_entries) values(h1,agent_contact,'manager',true);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Agent cannot appoint new managers without approval';end if;
  blocked:=false;begin delete from public.horses where id=h1;exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Agent cannot delete an existing owned horse';end if;
  request3:=public.request_horse_agent_access(org,h3,'Cancel');
  perform public.decide_horse_agent_request(request3,'cancel');
  if public.can_access_horse(h3) then raise exception 'Cancellation must not grant access';end if;
  request3:=public.request_horse_agent_access(org,h3,'Reject');
  if (select count(*) from public.find_horse_owner_by_nrha(org,nrha_number))<>1 then raise exception 'Exact NRHA lookup returns the existing owner';end if;
  outcome:=public.create_horse_for_nrha_owner(org,dir,nrha_number,jsonb_build_object('name','NRHA owner new horse '||token,'registration_number','TEST-'||token,'gender','G','birth_year',2020));
  if outcome->>'status'<>'created' then raise exception 'An already delegated owner may be reused directly';end if;
  new_horse:=jsonb_populate_record(null::public.horses,outcome->'horse');
  if new_horse.primary_owner_contact_id<>contact then raise exception 'New horse must belong to designated NRHA owner';end if;
  blocked:=false;begin update public.horses set created_by_user_id=owner_profile where id=new_horse.id;exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Creator cannot rewrite horse audit identity';end if;
  -- Even after directory removal, a published horse cannot become creator-owned.
  reset role;
  delete from public.directory_horses where horse_id=new_horse.id;
  set local role authenticated;
  blocked:=false;begin update public.horses set primary_owner_contact_id=agent_contact where id=new_horse.id;exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Unlinking a published horse must not restore creator ownership authority';end if;
  if not exists(select 1 from public.horse_contacts where horse_id=new_horse.id and contact_id=agent_contact and role='agent' and can_book_stalls and not can_pay_invoices) then raise exception 'Creator must automatically become agent';end if;
  if exists(select 1 from public.contacts where id=private_owner) then raise exception 'Unrelated owner must start private';end if;
  if not (select requires_confirmation from public.find_horse_owner_by_nrha(org,nrha_number||'7')) then raise exception 'Private NRHA owner must require confirmation';end if;
  outcome:=public.create_horse_for_nrha_owner(org,dir,nrha_number||'7',jsonb_build_object('name','Private owner proposed horse '||token));
  if outcome->>'status'<>'pending_owner_confirmation' then raise exception 'A supplied NRHA number must not grant private-owner access by itself';end if;
  private_request:=(outcome->>'request_id')::uuid;
  if exists(select 1 from public.contacts where id=private_owner) then raise exception 'NRHA proposal must not expose private owner data';end if;
  blocked:=false;begin perform public.decide_horse_owner_confirmation(private_request,'approve',private_owner);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Requester cannot approve private NRHA-owner creation';end if;
  reset role;
  if exists(select 1 from public.horses where name='Private owner proposed horse '||token) then raise exception 'Private owner proposal must not create a horse before consent';end if;
  perform set_config('request.jwt.claim.sub',other_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',other_user,'role','authenticated')::text,true);
  set local role authenticated;
  if not exists(select 1 from jsonb_array_elements(public.list_horse_owner_confirmations(org)) r where r->>'id'=private_request::text and (r->>'can_review')::boolean) then raise exception 'Identified owner must see the consent request';end if;
  perform public.decide_horse_owner_confirmation(private_request,'approve');
  reset role;
  select * into private_horse from public.horses where name='Private owner proposed horse '||token;
  if private_horse.primary_owner_contact_id<>private_owner then raise exception 'Consent must preserve the identified owner';end if;
  if exists(select 1 from public.horse_contacts hc join public.contacts c on c.id=hc.contact_id where hc.horse_id=private_horse.id and hc.role='agent' and c.linked_user_id=other_profile) then raise exception 'The approving owner must not become the requester agent';end if;
  perform set_config('request.jwt.claim.sub',agent_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',agent_user,'role','authenticated')::text,true);
  set local role authenticated;
  if not public.can_access_horse(private_horse.id) then raise exception 'Original requester gets agency after owner consent';end if;
  owner_request:=public.request_horse_owner_confirmation(org,dir,'Pilot','Participant',jsonb_build_object('name','Name owner new horse '||token,'gender','F'));
  if public.request_horse_owner_confirmation(org,dir,'Pilot','Participant',jsonb_build_object('name','Name owner new horse '||token,'gender','F'))<>owner_request then raise exception 'Name confirmation request must be idempotent';end if;
  blocked:=false;begin perform public.decide_horse_owner_confirmation(owner_request,'approve',contact);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Requester cannot confirm a named owner';end if;
  reset role;
  if exists(select 1 from public.horses where name='Name owner new horse '||token) then raise exception 'Name-only request must not create horse before confirmation';end if;
  perform set_config('request.jwt.claim.sub',staff_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',staff_user,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.decide_horse_agent_request(request3,'reject');
  blocked:=false;begin insert into public.horse_contacts(horse_id,contact_id,role)
    select h1,id,'co-owner' from public.contacts where linked_user_id=staff_profile limit 1;exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Association staff cannot appoint itself co-owner';end if;
  perform public.decide_horse_owner_confirmation(owner_request,'approve',contact);
  perform public.decide_horse_owner_confirmation(owner_request,'approve',contact);
  reset role;
  select h.* into created2 from public.horses h where name='Name owner new horse '||token;
  if created2.id is null or created2.primary_owner_contact_id<>contact or created2.created_by_user_id<>agent_profile then raise exception 'Staff confirmation must create horse for the requested owner and original creator';end if;
  if not exists(select 1 from public.horse_contacts hc join public.contacts c on c.id=hc.contact_id where hc.horse_id=created2.id and hc.role='agent' and c.linked_user_id=agent_profile) then raise exception 'Original requester, not reviewing staff, becomes agent';end if;
  if exists(select 1 from public.horse_contacts hc join public.contacts c on c.id=hc.contact_id where hc.horse_id=created2.id and hc.role='agent' and c.linked_user_id=staff_profile) then raise exception 'Staff reviewer must not become agent';end if;
  if (select count(*) from public.horses where name='Name owner new horse '||token)<>1 then raise exception 'Approval retry must not create duplicate horse';end if;
  if exists(select 1 from public.horse_contacts where horse_id=h3 and contact_id=agent_contact and role='agent') then raise exception 'Rejected agent request must not grant access';end if;
  perform set_config('request.jwt.claim.sub',owner_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',owner_user,'role','authenticated')::text,true);
  set local role authenticated;
  insert into public.horses(name,primary_owner_contact_id,created_by_user_id,registration_number) values('Owned direct horse '||token,contact,owner_profile,'OWN-'||token) returning * into new_horse;
  if exists(select 1 from public.horse_contacts where horse_id=new_horse.id and role='agent') then raise exception 'Owner creating own horse must not become an extra agent';end if;
  blocked:=false;begin insert into public.horses(name,primary_owner_contact_id,created_by_user_id,registration_number)
    values('Duplicate registration',contact,owner_profile,'OWN-'||token);exception when unique_violation then blocked:=true;end;
  if not blocked then raise exception 'Duplicate owner/registration must be refused atomically';end if;
  reset role;
  raise notice 'PASS horse agent requests: no pending access, owner/staff approval, privacy, idempotency, permissions, owner preservation, no takeover, cancellation/rejection, NRHA owner creation, named owner confirmation';
end $$;
rollback;
