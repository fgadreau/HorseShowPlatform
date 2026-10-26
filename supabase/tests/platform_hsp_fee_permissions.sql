-- Synthetic users/settings only; every write is rolled back. No payment calls.
begin;
do $$
declare
  platform_user uuid:=gen_random_uuid(); staff_user uuid:=gen_random_uuid(); member_user uuid:=gen_random_uuid();
  platform_profile uuid;staff_profile uuid;org uuid:=gen_random_uuid();other_org uuid:=gen_random_uuid();sh uuid:=gen_random_uuid();
  actor uuid;scope text;blocked boolean;settings jsonb;
begin
  if has_function_privilege('anon','public.set_billing_hsp_fee(text,uuid,numeric,text)','EXECUTE') then raise exception 'Anonymous fee writes must be forbidden';end if;
  insert into auth.users(id,email,raw_user_meta_data) values
    (platform_user,platform_user||'@example.test','{"first_name":"Platform","last_name":"Fee Test"}'),
    (staff_user,staff_user||'@example.test','{"first_name":"Association","last_name":"Fee Test"}'),
    (member_user,member_user||'@example.test','{"first_name":"Member","last_name":"Fee Test"}');
  select id into platform_profile from public.user_profiles where user_id=platform_user;
  select id into staff_profile from public.user_profiles where user_id=staff_user;
  insert into public.platform_admins(user_id) values(platform_profile);
  insert into public.organizations(id,name,slug,is_test_mode) values(org,'HSP fee permissions','fee-'||org,true),(other_org,'Other fee association','fee-'||other_org,true);
  insert into public.organization_members(organization_id,user_id,role) values(org,staff_profile,'admin');
  insert into public.shows(id,organization_id,name,slug,start_date,end_date) values(sh,org,'HSP fee test','fee-show-'||sh,current_date,current_date);
  foreach actor in array array[staff_user,member_user] loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    set local role authenticated;
    foreach scope in array array['platform','association','show'] loop
      blocked:=false;
      begin perform public.set_billing_hsp_fee(scope,case scope when 'platform' then '00000000-0000-0000-0000-000000000000'::uuid when 'show' then sh else org end,7.34,'Forbidden association write');
      exception when insufficient_privilege then blocked:=true;end;
      if not blocked then raise exception 'Non-platform user could modify % fee',scope;end if;
    end loop;
    blocked:=false;begin perform public.get_billing_hsp_fee_settings(org,sh);exception when insufficient_privilege then blocked:=true;end;
    if not blocked then raise exception 'Non-platform user could read internal fee settings';end if;
    blocked:=false;begin update public.billing_hsp_fee_settings set amount=0 where scope_id=org;exception when insufficient_privilege then blocked:=true;end;
    if not blocked then raise exception 'Direct table update must be forbidden';end if;
    reset role;
  end loop;
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',platform_user,'role','authenticated')::text,true);
  set local role authenticated;
  perform public.set_billing_hsp_fee('platform','00000000-0000-0000-0000-000000000000',8.76,'Synthetic default; rolled back');
  perform public.set_billing_hsp_fee('association',org,7.34,'Synthetic association fee');
  perform public.set_billing_hsp_fee('show',sh,0,'Synthetic sponsored show');
  settings:=public.get_billing_hsp_fee_settings(org,sh);
  if not (settings->>'platform_admin')::boolean or not exists(select 1 from jsonb_array_elements(settings->'settings') r where r->>'scope'='association' and (r->>'amount')::numeric=7.34 and r->>'changed_by'=platform_profile::text) then raise exception 'Platform fee/audit not recorded';end if;
  if not exists(select 1 from jsonb_array_elements(settings->'settings') r where r->>'scope'='show' and (r->>'amount')::numeric=0) then raise exception 'Platform show sponsorship failed';end if;
  perform public.set_billing_hsp_fee('association',org,null,'Synthetic inheritance');
  settings:=public.get_billing_hsp_fee_settings(org,null);
  if not exists(select 1 from jsonb_array_elements(settings->'settings') r where r->>'scope'='association' and r->>'amount' is null) then raise exception 'Inheritance failed';end if;
  blocked:=false;begin perform public.get_billing_hsp_fee_settings(other_org,sh);exception when insufficient_privilege then blocked:=true;end;
  if not blocked then raise exception 'Cross-association show must be rejected';end if;
  blocked:=false;begin perform public.set_billing_hsp_fee('association',org,7.345);exception when others then if sqlerrm='BILLING_INVALID_AMOUNT' then blocked:=true;else raise;end if;end;
  if not blocked then raise exception 'Sub-cent precision accepted';end if;
  reset role;
end $$;
rollback;
