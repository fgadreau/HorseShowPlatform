alter table public.organization_membership_types add column is_public boolean not null default true;
alter table public.contact_organization_memberships
  add column acquisition_source text not null default 'platform' check(acquisition_source in ('platform','external_purchase','complimentary')),
  add column import_batch_id uuid;
create table public.membership_import_batches(
  id uuid primary key,organization_id uuid not null references public.organizations(id),actor_id uuid not null references public.user_profiles(id),
  payload_hash text not null, payload jsonb not null,result jsonb,created_at timestamptz not null default clock_timestamp()
);
alter table public.membership_import_batches enable row level security;
revoke all on public.membership_import_batches from public,anon,authenticated,service_role;
alter table public.contact_organization_memberships add foreign key(import_batch_id) references public.membership_import_batches(id);

drop policy "Authenticated users can view active internal membership types" on public.organization_membership_types;
drop policy "Linked users can view active internal membership types" on public.organization_membership_types;
create policy "Authenticated users can view active internal membership types" on public.organization_membership_types for select to authenticated using(is_active and is_public);
drop policy "Members can view internal membership types" on public.organization_membership_types;
create policy "Members can view internal membership types" on public.organization_membership_types for select to authenticated using(
 public.is_platform_admin() or public.is_org_member(organization_id,array['admin','secretary']) or exists(
 select 1 from public.contact_organization_memberships m join public.contacts c on c.id=m.contact_id
 where m.membership_type_id=organization_membership_types.id and c.linked_user_id=public.current_profile_id()));
drop policy "Authenticated users can view membership seller organizations" on public.organizations;
create policy "Authenticated users can view membership seller organizations" on public.organizations for select to authenticated using(
 exists(select 1 from public.organization_membership_types t where t.organization_id=organizations.id and t.is_active and t.is_public));

create function public.membership_acquisition_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.acquisition_source<>old.acquisition_source or new.import_batch_id is distinct from old.import_batch_id) then raise exception 'MEMBERSHIP_SOURCE_IMMUTABLE';end if;
 if tg_op='UPDATE' and new.acquisition_source<>'platform' then
  if new.organization_id<>old.organization_id or new.contact_id<>old.contact_id or new.membership_type_id<>old.membership_type_id then raise exception 'MEMBERSHIP_SOURCE_IMMUTABLE';end if;
  if not(public.is_platform_admin() or public.is_org_member(new.organization_id,array['admin','secretary'])) or new.billing_charge_id is not null or new.invoice_id is not null then raise exception 'MEMBERSHIP_IMPORT_FORBIDDEN' using errcode='42501';end if;
 end if;
 if tg_op='INSERT' and new.acquisition_source<>'platform' then
  if not(public.is_platform_admin() or public.is_org_member(new.organization_id,array['admin','secretary'])) or not exists(
   select 1 from public.membership_import_batches b where b.id=new.import_batch_id and b.organization_id=new.organization_id and b.actor_id=public.current_profile_id() and b.result is null)
   or new.billing_charge_id is not null or new.invoice_id is not null then raise exception 'MEMBERSHIP_IMPORT_FORBIDDEN' using errcode='42501';end if;
 elsif tg_op='INSERT' and not exists(select 1 from public.organization_membership_types t where t.id=new.membership_type_id and (t.is_public or public.is_platform_admin() or public.is_org_member(t.organization_id,array['admin','secretary']))) then
  raise exception 'MEMBERSHIP_UNAVAILABLE';
 end if;
 return new;
end $$;

-- External entitlements do not belong in the unpaid legacy-purchase queue.
do $$declare source text;needle text:='and m.billing_charge_id is null and m.status<>''cancelled''';begin
 select pg_get_functiondef('public.membership_billing_admin(uuid)'::regprocedure) into source;
 if position(needle in source)=0 then raise exception 'MEMBERSHIP_ADMIN_CONTRACT_CHANGED';end if;
 execute replace(source,needle,'and m.acquisition_source=''platform'' '||needle);
end $$;
revoke all on function public.membership_acquisition_guard() from public,anon,authenticated;
create trigger a0_membership_acquisition_guard before insert or update on public.contact_organization_memberships for each row execute function public.membership_acquisition_guard();
-- Imported entitlements never call the invoice writer or the platform charge adapter.
drop trigger a_billing_engine_guard on public.contact_organization_memberships;
create trigger a_billing_engine_guard before insert or update on public.contact_organization_memberships for each row when(new.acquisition_source='platform') execute function public.billing_legacy_guard();
create trigger a_billing_engine_guard_delete before delete on public.contact_organization_memberships for each row when(old.acquisition_source='platform') execute function public.billing_legacy_guard();
drop trigger contact_organization_memberships_invoice_sync on public.contact_organization_memberships;
create trigger contact_organization_memberships_invoice_sync after insert or update on public.contact_organization_memberships for each row when(new.billing_charge_id is null and new.acquisition_source='platform') execute function public.membership_legacy_invoice_sync();
drop trigger contact_organization_memberships_invoice_delete on public.contact_organization_memberships;
create trigger contact_organization_memberships_invoice_delete after delete on public.contact_organization_memberships for each row when(old.billing_charge_id is null and old.acquisition_source='platform') execute function public.membership_legacy_invoice_sync();
-- The quotation API must enforce visibility even when a hidden type ID is known.
do $$declare source text;needle text:='if not t.is_active or current_date>t.valid_until';begin
 select pg_get_functiondef('public.membership_billing_quote(uuid)'::regprocedure) into source;
 if position(needle in source)=0 then raise exception 'MEMBERSHIP_QUOTE_CONTRACT_CHANGED';end if;
 execute replace(source,needle,'if (not t.is_public and not (public.is_platform_admin() or public.is_org_member(t.organization_id,array[''admin'',''secretary'']))) or not t.is_active or current_date>t.valid_until');
end $$;

create function public.preview_membership_import(p_org uuid,p_type uuid,p_rows jsonb,p_source text default 'external_purchase') returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.organization_membership_types;r jsonb;result jsonb:='[]';c public.contacts;m public.contact_organization_memberships;
 n int:=0;err text;action text;d1 date;d2 date;candidates jsonb;seen uuid[]:='{}';identities text[]:='{}';identity_key text;
begin
 if public.current_profile_id() is null or not(public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary'])) then raise exception 'MEMBERSHIP_IMPORT_FORBIDDEN' using errcode='42501';end if;
 select * into t from public.organization_membership_types where id=p_type and organization_id=p_org and is_active;
 if t.id is null then raise exception 'MEMBERSHIP_UNAVAILABLE';end if;
 if p_source is null or p_source not in ('external_purchase','complimentary') or (p_source='complimentary' and t.price<>0) then raise exception 'MEMBERSHIP_COMPLIMENTARY_REQUIRES_FREE_TYPE';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text)>2097152 then raise exception 'MEMBERSHIP_IMPORT_ROW_LIMIT';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  n:=n+1;err:=null;action:=null;c:=null;m:=null;candidates:='[]';
  begin
   d1:=coalesce(nullif(r->>'valid_from','')::date,t.valid_from);d2:=coalesce(nullif(r->>'valid_until','')::date,t.valid_until);
   if (nullif(r->>'valid_from','') is not null and r->>'valid_from' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') or (nullif(r->>'valid_until','') is not null and r->>'valid_until' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') then err:='INVALID_DATES';end if;
   if d2<d1 then err:='INVALID_DATES';end if;
   if coalesce(length(r->>'membership_number'),0)>150 or coalesce(length(r->>'notes'),0)>2000 or coalesce(length(r->>'first_name'),0)>100 or coalesce(length(r->>'last_name'),0)>100 or coalesce(length(r->>'email'),0)>255 then err:='VALUE_TOO_LONG';end if;
   if nullif(r->>'contact_id','') is not null then
    select * into c from public.contacts where id=(r->>'contact_id')::uuid;
    if c.id is null then err:='CONTACT_NOT_FOUND';end if;
   else
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',concat_ws(' ',x.first_name,x.last_name),'email_hint',case when x.email is null then null else left(x.email,1)||'***@'||split_part(x.email,'@',2) end,'has_account',x.linked_user_id is not null,'in_directory',public.contact_is_linked_to_org(x.id,p_org)) order by x.first_name,x.last_name),'[]') into candidates
    from public.contacts x where (nullif(btrim(r->>'email'),'') is not null and lower(btrim(x.email))=lower(btrim(r->>'email')))
      or (public.contact_is_linked_to_org(x.id,p_org) and public.identity_search_key(concat_ws(' ',x.first_name,x.last_name))=public.identity_search_key(concat_ws(' ',r->>'first_name',r->>'last_name')) and nullif(btrim(r->>'first_name'),'') is not null and nullif(btrim(r->>'last_name'),'') is not null);
    if coalesce((r->>'create_contact')::boolean,false) then
     if nullif(btrim(r->>'first_name'),'') is null or nullif(btrim(r->>'last_name'),'') is null or coalesce(r->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then err:='CONTACT_DETAILS_REQUIRED';end if;
     if exists(select 1 from public.contacts x where lower(btrim(x.email))=lower(btrim(r->>'email')) and public.identity_search_key(concat_ws(' ',x.first_name,x.last_name))=public.identity_search_key(concat_ws(' ',r->>'first_name',r->>'last_name'))) then err:='CONTACT_ALREADY_EXISTS';end if;
     identity_key:=lower(btrim(r->>'email'))||'|'||public.identity_search_key(concat_ws(' ',r->>'first_name',r->>'last_name'));
     if identity_key=any(identities) then err:='DUPLICATE_CONTACT';end if;identities:=array_append(identities,identity_key);
     action:='create';
    else action:='resolve';end if;
   end if;
   if c.id is not null then
    if c.id=any(seen) then err:='DUPLICATE_CONTACT';end if;seen:=array_append(seen,c.id);
    select * into m from public.contact_organization_memberships where organization_id=p_org and contact_id=c.id and membership_type_id=t.id and season_year=t.season_year;
    action:=case when m.id is null then 'link' when m.status='active' then 'skip' else 'conflict' end;
    if action='conflict' then err:='EXISTING_MEMBERSHIP_REQUIRES_REVIEW';end if;
   end if;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then err:='INVALID_VALUE';
  end;
  result:=result||jsonb_build_array(jsonb_build_object('row',n,'action',action,'error',err,'contact_id',c.id,'contact_name',concat_ws(' ',c.first_name,c.last_name),'has_account',c.linked_user_id is not null,'candidates',candidates,'valid_from',d1,'valid_until',d2));
 end loop;
 return jsonb_build_object('rows',result,'type_name',t.name,'season',t.season_year,'token',md5(jsonb_build_object('type',to_jsonb(t),'rows',p_rows,'source',p_source,'plan',result)::text));
end $$;

create function public.apply_membership_import(p_operation uuid,p_org uuid,p_type uuid,p_rows jsonb,p_source text,p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan jsonb;r jsonb;line jsonb;c uuid;directory uuid;b public.membership_import_batches;h text;created int:=0;skipped int:=0;newcontacts int:=0;outcome jsonb;
begin
 if public.current_profile_id() is null or not(public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary'])) then raise exception 'MEMBERSHIP_IMPORT_FORBIDDEN' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('membership-import:'||p_org::text,0));
 h:=md5(jsonb_build_object('org',p_org,'type',p_type,'rows',p_rows,'source',p_source)::text);
 select * into b from public.membership_import_batches where id=p_operation;
 if found then
  if b.organization_id<>p_org or b.actor_id<>public.current_profile_id() or b.payload_hash<>h then raise exception 'MEMBERSHIP_IMPORT_OPERATION_CONFLICT';end if;
  return b.result;
 end if;
 select id into directory from public.organization_disciplines where organization_id=p_org and is_active order by is_default desc,created_at,id limit 1;
 if directory is null then raise exception 'MEMBERSHIP_IMPORT_DIRECTORY_REQUIRED';end if;
 perform 1 from public.organization_membership_types where id=p_type for share;
 plan:=public.preview_membership_import(p_org,p_type,p_rows,p_source);
 if p_token is distinct from plan->>'token' then raise exception 'MEMBERSHIP_IMPORT_PREVIEW_CHANGED';end if;
 if exists(select 1 from jsonb_array_elements(plan->'rows') x where x->>'error' is not null or x->>'action' not in ('link','create','skip')) then raise exception 'MEMBERSHIP_IMPORT_UNRESOLVED';end if;
 insert into public.membership_import_batches(id,organization_id,actor_id,payload_hash,payload) values(p_operation,p_org,public.current_profile_id(),h,jsonb_build_object('type',p_type,'source',p_source,'rows',p_rows));
 for line in select value from jsonb_array_elements(plan->'rows') loop
  r:=p_rows->((line->>'row')::int-1);
  if line->>'action'='skip' then skipped:=skipped+1;continue;end if;
  c:=nullif(line->>'contact_id','')::uuid;
  if line->>'action'='create' then
   -- Explicit new identity; never assign account ownership from CSV input.
   insert into public.contacts(type,first_name,last_name,email,created_by_user_id) values('rider',btrim(r->>'first_name'),btrim(r->>'last_name'),lower(btrim(r->>'email')),public.current_profile_id()) returning id into c;
   newcontacts:=newcontacts+1;
  end if;
  insert into public.directory_contacts(organization_discipline_id,contact_id,source,created_by_user_id) values(directory,c,'import',public.current_profile_id()) on conflict do nothing;
  if line->>'action'='create' then insert into public.contact_roles(organization_id,contact_id,role) values(p_org,c,'rider') on conflict do nothing;end if;
  insert into public.contact_organization_memberships(organization_id,contact_id,membership_type_id,status,membership_number,valid_from,valid_until,notes,sold_by_user_id,acquisition_source,import_batch_id)
  values(p_org,c,p_type,'active',nullif(btrim(r->>'membership_number'),''),(line->>'valid_from')::date,(line->>'valid_until')::date,nullif(btrim(r->>'notes'),''),public.current_profile_id(),p_source,p_operation);
  created:=created+1;
 end loop;
 outcome:=jsonb_build_object('created',created,'skipped',skipped,'new_contacts',newcontacts,'batch_id',p_operation);
 update public.membership_import_batches set result=outcome where id=p_operation;
 return outcome;
end $$;
revoke all on function public.preview_membership_import(uuid,uuid,jsonb,text),public.apply_membership_import(uuid,uuid,uuid,jsonb,text,text) from public,anon;
grant execute on function public.preview_membership_import(uuid,uuid,jsonb,text),public.apply_membership_import(uuid,uuid,uuid,jsonb,text,text) to authenticated;
