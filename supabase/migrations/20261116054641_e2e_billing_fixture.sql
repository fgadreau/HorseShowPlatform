-- Opt-in, server-only test harness. Disabled on every database by default.
begin;
create table public.e2e_robot_settings(id boolean primary key default true check(id),enabled boolean not null default false);
insert into public.e2e_robot_settings values(true,false);
create table public.e2e_robot_scopes(organization_id uuid primary key references public.organizations(id),auth_user_id uuid not null references auth.users(id),token uuid not null,created_at timestamptz not null default clock_timestamp());
alter table public.e2e_robot_settings enable row level security;
alter table public.e2e_robot_scopes enable row level security;
revoke all on public.e2e_robot_settings,public.e2e_robot_scopes from public,anon,authenticated,service_role;

create function public.e2e_robot_gate() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' or not coalesce((select enabled from public.e2e_robot_settings where id),false) then raise exception 'E2E_HARNESS_DISABLED' using errcode='42501';end if;
end $$;
create function public.e2e_robot_identity(p_org uuid,p_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare profile uuid;email text;run text;begin
 perform public.e2e_robot_gate();
 select u.email,p.id into email,profile from auth.users u join public.user_profiles p on p.user_id=u.id where u.id=p_user;
 if email is null or email!~'^e2e\+[0-9]{14}-[a-f0-9]{6}@example\.test$' then raise exception 'E2E_SCOPE_INVALID' using errcode='42501';end if;
 run:=split_part(split_part(email,'+',2),'@',1);
 if not exists(select 1 from public.organizations where id=p_org and slug='e2e-'||run and name like '[E2E]%' and created_by_user_id=profile)
 or not exists(select 1 from public.organization_members where organization_id=p_org and user_id=profile and role='admin')
 or exists(select 1 from public.organization_members where organization_id=p_org and user_id<>profile)
 or exists(select 1 from public.platform_admins where user_id=profile) then raise exception 'E2E_SCOPE_INVALID' using errcode='42501';end if;
 return profile;
end $$;
create function public.e2e_register_scope(p_org uuid,p_user uuid,p_token uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.e2e_robot_identity(p_org,p_user);
 if p_token is null then raise exception 'E2E_SCOPE_INVALID';end if;
 insert into public.e2e_robot_scopes values(p_org,p_user,p_token,clock_timestamp()) on conflict(organization_id) do nothing;
 if not exists(select 1 from public.e2e_robot_scopes where organization_id=p_org and auth_user_id=p_user and token=p_token) then raise exception 'E2E_SCOPE_INVALID' using errcode='42501';end if;
end $$;
create function public.e2e_assert_scope(p_org uuid,p_user uuid,p_token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare profile uuid;begin
 profile:=public.e2e_robot_identity(p_org,p_user);
 if not exists(select 1 from public.e2e_robot_scopes where organization_id=p_org and auth_user_id=p_user and token=p_token) then raise exception 'E2E_SCOPE_INVALID' using errcode='42501';end if;
 return profile;
end $$;
create function public.e2e_configure_show(p_org uuid,p_user uuid,p_token uuid,p_show uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare profile uuid;previous_sub text;ctx uuid;prefix text;begin
 profile:=public.e2e_assert_scope(p_org,p_user,p_token);
 if not exists(select 1 from public.shows where id=p_show and organization_id=p_org and name like '[E2E]%') then raise exception 'E2E_SCOPE_INVALID';end if;
 previous_sub:=current_setting('request.jwt.claim.sub',true);
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 -- Temporary authority exists only inside this transaction for this fake actor.
 insert into public.platform_admins(user_id) values(profile);
 perform public.billing_set_capabilities(p_org,null,true,true,false);
 prefix:='E2E-'||upper(substr(replace(p_show::text,'-',''),1,10));
 ctx:=public.configure_reservation_billing(p_show,jsonb_build_object('name_fr','[E2E] Comptes du robot','name_en','[E2E] Robot accounts','account_prefix',prefix||'-A','receipt_prefix',prefix||'-R','invoice_prefix',prefix||'-I','closing_policy','manual','payment_policy','received_only','activation_policy','allocated_received','categories',jsonb_build_array('manual','stall_extra'),'staff_roles',jsonb_build_array('admin','secretary'),'period',extract(year from (select start_date from public.shows where id=p_show))::text,'timezone','America/Toronto'),'[]');
 delete from public.platform_admins where user_id=profile;
 perform set_config('request.jwt.claim.sub',coalesce(previous_sub,''),true);
 return ctx;
end $$;

create function public.e2e_cleanup_scope(p_org uuid,p_user uuid,p_token uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare fk record;rel record;trg record;joins text;added integer;total integer;outside boolean;begin
 perform public.e2e_robot_gate();
 if not exists(select 1 from public.e2e_robot_scopes where organization_id=p_org) then return false;end if;
 perform public.e2e_assert_scope(p_org,p_user,p_token);
 perform public.billing6_lock(p_org);
 -- This harness never deletes a payment, issued document or provider attempt.
 if exists(select 1 from public.billing_payments where organization_id=p_org)
 or exists(select 1 from public.billing_documents where organization_id=p_org)
 or exists(select 1 from public.billing_stripe_attempts where organization_id=p_org) then raise exception 'E2E_FINANCIAL_ACTIVITY_RETAINED';end if;
 create temporary table e2e_cleanup_rows(relation oid,row_tid tid,primary key(relation,row_tid)) on commit drop;
 insert into pg_temp.e2e_cleanup_rows select 'public.organizations'::regclass,ctid from public.organizations where id=p_org;
 -- Follow child foreign keys, never parents such as global contacts or horses.
 -- Composite keys and shared child paths are handled without duplicate deletion.
 loop
  total:=0;
  for fk in select c.* from pg_constraint c join pg_class child on child.oid=c.conrelid where c.contype='f' and child.relnamespace='public'::regnamespace and c.confrelid in(select relation from pg_temp.e2e_cleanup_rows) loop
   select string_agg(format('child.%I=parent.%I',ca.attname,pa.attname),' and ' order by k.n) into joins from unnest(fk.conkey,fk.confkey) with ordinality k(child_col,parent_col,n) join pg_attribute ca on ca.attrelid=fk.conrelid and ca.attnum=k.child_col join pg_attribute pa on pa.attrelid=fk.confrelid and pa.attnum=k.parent_col;
   execute format('insert into pg_temp.e2e_cleanup_rows select %s,child.ctid from %s child join %s parent on %s join pg_temp.e2e_cleanup_rows target on target.relation=%s and target.row_tid=parent.ctid on conflict do nothing',fk.conrelid,fk.conrelid::regclass,fk.confrelid::regclass,joins,fk.confrelid);
   get diagnostics added=row_count;total:=total+added;
  end loop;
  exit when total=0;
 end loop;
 for rel in select distinct relation from pg_temp.e2e_cleanup_rows loop
  if exists(select 1 from pg_attribute where attrelid=rel.relation and attname='organization_id' and not attisdropped) then
   execute format('select exists(select 1 from %s r join pg_temp.e2e_cleanup_rows t on t.relation=%s and t.row_tid=r.ctid where r.organization_id is distinct from $1)',rel.relation::regclass,rel.relation) into outside using p_org;
   if outside then raise exception 'E2E_CROSS_SCOPE_REFERENCE';end if;
  end if;
 end loop;
 -- Table locks remain held until commit, so another transaction can never
 -- write while these user triggers are suspended. FK triggers stay enabled.
 -- Restore each trigger's exact prior mode; errors roll back all DDL and data.
 create temporary table e2e_cleanup_triggers on commit drop as select t.tgrelid,t.tgname,t.tgenabled from pg_trigger t where not t.tgisinternal and t.tgenabled<>'D' and t.tgrelid in(select relation from pg_temp.e2e_cleanup_rows);
 for trg in select * from pg_temp.e2e_cleanup_triggers order by tgrelid,tgname loop
  execute format('alter table %s disable trigger %I',trg.tgrelid::regclass,trg.tgname);
 end loop;
 loop
  total:=0;
  for rel in select distinct relation from pg_temp.e2e_cleanup_rows loop
   begin
    execute format('delete from %s r using pg_temp.e2e_cleanup_rows t where t.relation=%s and t.row_tid=r.ctid',rel.relation::regclass,rel.relation);
    get diagnostics added=row_count;total:=total+added;
   exception when foreign_key_violation then null;end;
  end loop;
  exit when total=0;
 end loop;
 if exists(select 1 from public.organizations where id=p_org) then raise exception 'E2E_SCOPE_DEPENDENCY_NOT_CLEANED';end if;
 for trg in select * from pg_temp.e2e_cleanup_triggers order by tgrelid,tgname loop
  execute format('alter table %s %s trigger %I',trg.tgrelid::regclass,case trg.tgenabled when 'A' then 'enable always' when 'R' then 'enable replica' else 'enable' end,trg.tgname);
 end loop;
 return true;
end $$;
revoke all on function public.e2e_robot_gate(),public.e2e_robot_identity(uuid,uuid),public.e2e_register_scope(uuid,uuid,uuid),public.e2e_assert_scope(uuid,uuid,uuid),public.e2e_configure_show(uuid,uuid,uuid,uuid),public.e2e_cleanup_scope(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.e2e_register_scope(uuid,uuid,uuid),public.e2e_configure_show(uuid,uuid,uuid,uuid),public.e2e_cleanup_scope(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
