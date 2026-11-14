-- One shared role per person/association, also exposed by the ShowScore view.
-- Protect every write path, including the legacy compatibility view triggers.
create or replace function public.organization_member_role_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_trusted boolean;
begin
  v_org := case when tg_op='DELETE' then old.organization_id else new.organization_id end;
  perform pg_advisory_xact_lock(hashtextextended('association-roles:' || v_org::text, 0));
  if tg_op='UPDATE' and (new.organization_id<>old.organization_id or new.user_id<>old.user_id) then
    raise exception 'ROLE_IDENTITY_IMMUTABLE';
  end if;
  -- An organization cascade has no surviving association to administer.
  if tg_op='DELETE' and not exists(select 1 from public.organizations where id=v_org) then return old; end if;
  v_trusted := auth.uid() is null and (session_user in ('postgres','supabase_admin') or auth.role()='service_role');
  if not (v_trusted or public.is_platform_admin() or public.is_org_member(v_org,array['admin'])) then
    if tg_op<>'INSERT' then raise exception 'ASSOCIATION_ADMIN_REQUIRED' using errcode='42501'; end if;
    if not public.can_claim_first_org_admin(v_org,new.user_id,new.role) then
      raise exception 'ASSOCIATION_ADMIN_REQUIRED' using errcode='42501';
    end if;
  end if;
  if tg_op in ('DELETE','UPDATE') and old.role='admin' then
    if tg_op='DELETE' or new.role<>'admin' then
      if not exists(select 1 from public.organization_members where organization_id=v_org and role='admin' and id<>old.id) then
        raise exception 'LAST_ASSOCIATION_ADMIN';
      end if;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.organization_member_role_guard() from public,anon,authenticated;
create trigger organization_member_role_guard before insert or update or delete on public.organization_members
for each row execute function public.organization_member_role_guard();

create or replace function public.association_team(p_org uuid)
returns table(id uuid,profile_id uuid,display_name text,email text,role text)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not (public.is_platform_admin() or public.is_org_member(p_org,array['admin'])) then
    raise exception 'ASSOCIATION_ADMIN_REQUIRED' using errcode='42501';
  end if;
  return query select m.id,p.id,coalesce(nullif(p.display_name,''),nullif(concat_ws(' ',p.first_name,p.last_name),''),u.email)::text,u.email::text,m.role::text
    from public.organization_members m join public.user_profiles p on p.id=m.user_id
    join auth.users u on u.id=p.user_id where m.organization_id=p_org order by m.role,u.email;
end $$;

create or replace function public.set_association_team_role(p_org uuid,p_email text,p_role text,p_expected_role text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_profile uuid; v_existing text;
begin
  perform pg_advisory_xact_lock(hashtextextended('association-roles:' || p_org::text,0));
  if auth.uid() is null or not (public.is_platform_admin() or public.is_org_member(p_org,array['admin'])) then
    raise exception 'ASSOCIATION_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if p_role is null or p_role not in ('admin','secretary','scribe','announcer','user') then raise exception 'INVALID_ASSOCIATION_ROLE'; end if;
  select p.id into v_profile from public.user_profiles p join auth.users u on u.id=p.user_id
    where lower(u.email)=lower(btrim(p_email));
  if v_profile is null then raise exception 'ASSOCIATION_ACCOUNT_NOT_FOUND'; end if;
  select m.role into v_existing from public.organization_members m where m.organization_id=p_org and m.user_id=v_profile;
  if v_existing is distinct from p_expected_role then raise exception 'ASSOCIATION_ROLE_CHANGED'; end if;
  insert into public.organization_members(organization_id,user_id,role) values(p_org,v_profile,p_role)
    on conflict(organization_id,user_id) do update set role=excluded.role;
end $$;

create or replace function public.remove_association_team_member(p_org uuid,p_member uuid,p_expected_role text)
returns void language plpgsql security definer set search_path='' as $$
declare v_role text;
begin
  perform pg_advisory_xact_lock(hashtextextended('association-roles:' || p_org::text,0));
  if auth.uid() is null or not (public.is_platform_admin() or public.is_org_member(p_org,array['admin'])) then
    raise exception 'ASSOCIATION_ADMIN_REQUIRED' using errcode='42501';
  end if;
  select role into v_role from public.organization_members where id=p_member and organization_id=p_org;
  if v_role is null or v_role is distinct from p_expected_role then raise exception 'ASSOCIATION_ROLE_CHANGED'; end if;
  delete from public.organization_members where id=p_member and organization_id=p_org;
end $$;
revoke all on function public.association_team(uuid), public.set_association_team_role(uuid,text,text,text), public.remove_association_team_member(uuid,uuid,text) from public,anon;
grant execute on function public.association_team(uuid), public.set_association_team_role(uuid,text,text,text), public.remove_association_team_member(uuid,uuid,text) to authenticated;
