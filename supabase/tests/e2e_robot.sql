begin;
do $$declare
 u uuid:=gen_random_uuid();profile uuid;org uuid:=gen_random_uuid();sh uuid;ctx uuid;token uuid:=gen_random_uuid();rejected boolean;contact uuid;account uuid;folio uuid;product uuid;charge uuid;trigger_modes jsonb;run text:='20261116000000-'||substr(replace(gen_random_uuid()::text,'-',''),1,6);
begin
 insert into auth.users(id,email,raw_user_meta_data) values(u,'e2e+'||run||'@example.test','{}');
 select id into profile from public.user_profiles where user_id=u;
 insert into public.organizations(id,name,slug,created_by_user_id,currency) values(org,'[E2E] Robot SQL','e2e-'||run,profile,'CAD');
 insert into public.organization_members(organization_id,user_id,role) values(org,profile,'admin') on conflict do nothing;
 perform set_config('request.jwt.claim.role','service_role',true);
 rejected:=false;begin perform public.e2e_register_scope(org,u,token);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Harness must be disabled by default';end if;
 update public.e2e_robot_settings set enabled=true where id;
 perform set_config('request.jwt.claim.role','authenticated',true);
 rejected:=false;begin perform public.e2e_register_scope(org,u,token);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Normal users can register a cleanup scope';end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 perform public.e2e_register_scope(org,u,token);
 rejected:=false;begin perform public.e2e_assert_scope(org,u,gen_random_uuid());exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Wrong cleanup token accepted';end if;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.shows(organization_id,name,slug,start_date,end_date,entry_payment_policy) values(org,'[E2E] SQL show','e2e-'||gen_random_uuid(),current_date+1,current_date+2,'manual') returning id into sh;
 ctx:=public.e2e_configure_show(org,u,token,sh);
 if not public.reservation_uses_accounts(sh) or exists(select 1 from public.platform_admins where user_id=profile) then raise exception 'Account adoption or temporary authority cleanup failed';end if;
 -- Exercise immutable rows, including a composite foreign key and a child
 -- without organization_id. No real payer or financial document is created.
 insert into public.billing_audit_events(organization_id,actor_id,operation,authorization_snapshot,payload) values(org,profile,'e2e_test','{}','{}');
 insert into public.contacts(type,first_name,last_name) values('payer','Synthetic','E2E') returning id into contact;
 insert into public.billing_customer_accounts(organization_id,payer_contact_id) values(org,contact) returning id into account;
 insert into public.billing_folios(organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by) values(org,ctx,account,'CAD','E2E-SQL-A1',profile) returning id into folio;
 insert into public.organization_products(organization_id,name,code,category,default_price,tax_applicable) values(org,'E2E product','E2E-SQL','manual',10,false) returning id into product;
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,actor_id,authorization_snapshot) values(org,folio,'CAD','secretary_sale',gen_random_uuid(),product,'manual','E2E charge',1,10,10,0,'Synthetic no tax',contact,profile,'{}') returning id into charge;
 insert into public.billing_charge_presentation(charge_id,presentation) values(charge,'{"section":"e2e"}');
 begin
  insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot) values(org,folio,'CAD',10,'cash',clock_timestamp(),profile,'{}');
  rejected:=false;begin perform public.e2e_cleanup_scope(org,u,token);exception when others then rejected:=sqlerrm='E2E_FINANCIAL_ACTIVITY_RETAINED';end;
  if not rejected then raise exception 'Cleanup accepted an organization with a payment';end if;
  raise exception 'ROLLBACK_SYNTHETIC_PAYMENT';
 exception when others then if sqlerrm<>'ROLLBACK_SYNTHETIC_PAYMENT' then raise;end if;end;
 perform set_config('request.jwt.claim.role','authenticated',true);
 rejected:=false;begin perform public.e2e_cleanup_scope(org,u,token);exception when insufficient_privilege then rejected:=true;end;
 if not rejected then raise exception 'Participant can clean fixture';end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 select jsonb_object_agg(oid::text,tgenabled) into trigger_modes from pg_trigger where not tgisinternal;
 if not public.e2e_cleanup_scope(org,u,token) then raise exception 'Scoped cleanup did not execute';end if;
 if exists(select 1 from public.organizations where id=org) or exists(select 1 from public.billing_contexts where id=ctx) or exists(select 1 from public.billing_context_access where context_id=ctx) or exists(select 1 from public.billing_audit_events where organization_id=org) or exists(select 1 from public.billing_charges where id=charge) or exists(select 1 from public.billing_charge_presentation where charge_id=charge) then raise exception 'Scoped graph cleanup incomplete';end if;
 if not exists(select 1 from public.contacts where id=contact) then raise exception 'Cleanup followed a global parent';end if;
 delete from public.contacts where id=contact;
 if current_setting('session_replication_role')<>'origin' then raise exception 'Trigger configuration was not restored';end if;
 if trigger_modes is distinct from (select jsonb_object_agg(oid::text,tgenabled) from pg_trigger where not tgisinternal) then raise exception 'Trigger modes changed';end if;
 if has_function_privilege('authenticated','public.e2e_cleanup_scope(uuid,uuid,uuid)','EXECUTE') then raise exception 'Cleanup endpoint is exposed';end if;
end $$;
rollback;
