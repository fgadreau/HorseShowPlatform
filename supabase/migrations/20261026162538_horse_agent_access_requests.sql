begin;
-- Replace the legacy auth-actor trigger: staff approving a creation request
-- must not accidentally become the horse's agent themselves.
drop trigger if exists horses_assign_creator_agent on public.horses;
revoke all on function public.assign_horse_creator_agent() from public,anon,authenticated,service_role;
create function public.can_request_horse_access_in_org(p_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (public.is_platform_admin() or public.is_org_member(p_org)
    or public.has_linked_contact_in_org(p_org) or exists(select 1 from public.shows where organization_id=p_org and is_public));
$$;
revoke all on function public.can_request_horse_access_in_org(uuid) from public,anon,authenticated,service_role;
create function public.horse_agent_contact_for_profile(p_profile uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare profile public.user_profiles; result uuid;
begin
  select * into profile from public.user_profiles where id=p_profile;
  if profile.id is null then raise exception 'Connecte-toi pour gérer un cheval.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('horse-agent-contact:'||profile.id,0));
  select id into result from public.contacts where linked_user_id=profile.id
    order by (lower(first_name)=lower(profile.first_name) and lower(last_name)=lower(profile.last_name)) desc,created_at,id limit 1;
  if result is null then
    if nullif(btrim(profile.first_name),'') is null or nullif(btrim(profile.last_name),'') is null then
      raise exception 'Complète ton prénom et ton nom dans Mon profil avant de gérer un cheval.';end if;
    insert into public.contacts(type,first_name,last_name,linked_user_id,created_by_user_id)
      values('agent',profile.first_name,profile.last_name,profile.id,profile.id) returning id into result;
  end if;
  return result;
end $$;
create function public.my_horse_agent_contact() returns uuid
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour gérer un cheval.' using errcode='42501';end if;
  return public.horse_agent_contact_for_profile(public.current_profile_id());
end $$;

-- A creator acting for another owner is an agent, never an implicit owner.
create function public.new_horse_creator_agent() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_profile_id(); agent uuid;
begin
  if actor is null or new.created_by_user_id is distinct from actor
    or exists(select 1 from public.contacts where id=new.primary_owner_contact_id and linked_user_id=actor) then return new;end if;
  agent:=public.my_horse_agent_contact();
  insert into public.horse_contacts(horse_id,contact_id,role,can_create_entries,can_modify_entries,can_book_stalls,can_pay_invoices)
    values(new.id,agent,'agent',true,true,true,false) on conflict(horse_id,contact_id,role) do nothing;
  return new;
end $$;
create trigger horse_creator_agent after insert on public.horses for each row execute function public.new_horse_creator_agent();
create function public.horse_registration_duplicate_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if nullif(btrim(new.registration_number),'') is null then return new;end if;
  perform pg_advisory_xact_lock(hashtextextended('horse-owner-creation:'||new.primary_owner_contact_id,0));
  perform pg_advisory_xact_lock(hashtextextended('horse-registration:'||public.identity_search_key(new.registration_number),0));
  if exists(select 1 from public.horses h where h.id<>new.id
    and public.identity_search_key(h.registration_number)=public.identity_search_key(new.registration_number)) then
    raise exception 'Ce numéro de cheval existe déjà. Utilise sa fiche ou demande un accès comme agent.' using errcode='23505';end if;
  return new;
end $$;
create trigger horse_registration_duplicate_guard before insert on public.horses for each row execute function public.horse_registration_duplicate_guard();
revoke all on function public.horse_registration_duplicate_guard() from public,anon,authenticated,service_role;

create function public.new_horse_agent_directory() returns trigger
language plpgsql security definer set search_path='' as $$
declare organization uuid;
begin
  select organization_id into organization from public.organization_disciplines where id=new.organization_discipline_id;
  insert into public.directory_contacts(organization_discipline_id,contact_id,source,created_by_user_id)
    select new.organization_discipline_id,hc.contact_id,'relationship',h.created_by_user_id from public.horses h
      join public.horse_contacts hc on hc.horse_id=h.id and hc.role='agent'
      join public.contacts c on c.id=hc.contact_id and c.linked_user_id=h.created_by_user_id
      where h.id=new.horse_id on conflict(organization_discipline_id,contact_id) do nothing;
  insert into public.contact_roles(organization_id,contact_id,role,source)
    select organization,hc.contact_id,'agent','horse' from public.horses h
      join public.horse_contacts hc on hc.horse_id=h.id and hc.role='agent'
      join public.contacts c on c.id=hc.contact_id and c.linked_user_id=h.created_by_user_id
      where h.id=new.horse_id on conflict(organization_id,contact_id,role) do nothing;
  return new;
end $$;
create trigger horse_creator_agent_directory after insert on public.directory_horses for each row execute function public.new_horse_agent_directory();

create function public.can_review_horse_agent_request(p_org uuid,p_horse uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.directory_horses dh
    join public.organization_disciplines od on od.id=dh.organization_discipline_id
    where dh.horse_id=p_horse and od.organization_id=p_org and od.is_active)
    and (public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary'])
      or exists(select 1 from public.horses h join public.contacts c on c.id=h.primary_owner_contact_id
        where h.id=p_horse and c.linked_user_id=public.current_profile_id())
      or exists(select 1 from public.horse_contacts hc join public.contacts c on c.id=hc.contact_id
        where hc.horse_id=p_horse and hc.role in ('owner','co-owner') and c.linked_user_id=public.current_profile_id()));
$$;

create table public.horse_agent_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  horse_id uuid not null references public.horses(id),
  requested_by uuid not null references public.user_profiles(id),
  agent_contact_id uuid not null references public.contacts(id),
  message text not null default '' check(length(message)<=500),
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.user_profiles(id)
);
create unique index horse_agent_one_pending on public.horse_agent_requests(organization_id,horse_id,requested_by) where status='pending';
create index horse_agent_review_queue on public.horse_agent_requests(organization_id,status,created_at);
create index horse_agent_requester on public.horse_agent_requests(requested_by,created_at);
alter table public.horse_agent_requests enable row level security;
revoke all on public.horse_agent_requests from public,anon,authenticated;
grant select on public.horse_agent_requests to authenticated;
create policy "Requesters and authorized reviewers read agent requests" on public.horse_agent_requests for select to authenticated
  using (requested_by=public.current_profile_id() or public.can_review_horse_agent_request(organization_id,horse_id));

create function public.search_horse_agent_candidates(p_org uuid,p_query text)
returns table(horse_id uuid,name text,registration_number text,already_authorized boolean)
language plpgsql stable security definer set search_path='' as $$
declare needle text:=public.identity_search_key(p_query);
begin
  if not public.can_request_horse_access_in_org(p_org) then raise exception 'Cette association n’est pas accessible depuis ton compte.' using errcode='42501';end if;
  if length(needle)<3 or length(p_query)>200 then return;end if;
  return query select h.id,h.name::text,h.registration_number::text,
    exists(select 1 from public.horse_contacts hc join public.contacts c on c.id=hc.contact_id
      where hc.horse_id=h.id and c.linked_user_id=public.current_profile_id() and hc.role in ('owner','co-owner','agent','manager'))
    from public.horses h where (public.identity_search_key(h.name)=needle or public.identity_search_key(h.registration_number)=needle
      or exists(select 1 from public.horse_external_identifiers x where x.horse_id=h.id and public.identity_search_key(x.identifier_value)=needle))
      and exists(select 1 from public.directory_horses dh join public.organization_disciplines od on od.id=dh.organization_discipline_id
        where dh.horse_id=h.id and od.organization_id=p_org and od.is_active)
    order by h.name,h.id limit 8;
end $$;

create function public.request_horse_agent_access(p_org uuid,p_horse uuid,p_message text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_profile_id(); agent uuid; result uuid;
begin
  if auth.uid() is null or actor is null then raise exception 'Connecte-toi pour demander un accès.' using errcode='42501';end if;
  if not public.can_request_horse_access_in_org(p_org) then raise exception 'Cette association n’est pas accessible depuis ton compte.' using errcode='42501';end if;
  if length(coalesce(p_message,''))>500 then raise exception 'Message trop long.';end if;
  if not exists(select 1 from public.directory_horses dh join public.organization_disciplines od on od.id=dh.organization_discipline_id
    where dh.horse_id=p_horse and od.organization_id=p_org and od.is_active) then
    raise exception 'Ce cheval ne fait pas partie des répertoires actifs de cette association.' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('horse-agent-request:'||p_horse||':'||actor,0));
  if exists(select 1 from public.horse_contacts hc join public.contacts c on c.id=hc.contact_id
    where hc.horse_id=p_horse and c.linked_user_id=actor and hc.role in ('owner','co-owner','agent','manager')) then
    raise exception 'Tu es déjà lié à ce cheval.';end if;
  select id into result from public.horse_agent_requests where organization_id=p_org and horse_id=p_horse and requested_by=actor and status='pending';
  if result is not null then return result;end if;
  agent:=public.my_horse_agent_contact();
  insert into public.horse_agent_requests(organization_id,horse_id,requested_by,agent_contact_id,message)
    values(p_org,p_horse,actor,agent,coalesce(p_message,'')) returning id into result;
  return result;
end $$;

create function public.list_horse_agent_requests(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour consulter les demandes.' using errcode='42501';end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (
    select x.id,x.horse_id,h.name as horse_name,x.status,x.message,x.created_at,
      concat_ws(' ',p.first_name,p.last_name) as requester_name,
      x.requested_by=public.current_profile_id() as is_mine,
      public.can_review_horse_agent_request(x.organization_id,x.horse_id) as can_review
    from public.horse_agent_requests x join public.horses h on h.id=x.horse_id join public.user_profiles p on p.id=x.requested_by
    where x.organization_id=p_org and (x.requested_by=public.current_profile_id() or public.can_review_horse_agent_request(x.organization_id,x.horse_id))
    order by (x.status='pending') desc,x.created_at desc limit 100) r),'[]'::jsonb);
end $$;

create function public.decide_horse_agent_request(p_request uuid,p_action text) returns text
language plpgsql security definer set search_path='' as $$
declare r public.horse_agent_requests; actor uuid:=public.current_profile_id(); result text;
begin
  if auth.uid() is null or actor is null then raise exception 'Connecte-toi pour gérer une demande.' using errcode='42501';end if;
  select * into r from public.horse_agent_requests where id=p_request for update;
  if r.id is null then raise exception 'Demande introuvable.';end if;
  perform 1 from public.horses where id=r.horse_id for update;
  if p_action='cancel' then
    if r.requested_by<>actor then raise exception 'Tu ne peux pas annuler cette demande.' using errcode='42501';end if;
    result:='cancelled';
  elsif p_action in ('approve','reject') then
    if not public.can_review_horse_agent_request(r.organization_id,r.horse_id) then raise exception 'Seuls le propriétaire ou le secrétariat autorisé peuvent traiter cette demande.' using errcode='42501';end if;
    result:=case when p_action='approve' then 'approved' else 'rejected' end;
  else raise exception 'Action invalide.';end if;
  if r.status=result then return result;end if;
  if r.status<>'pending' then raise exception 'Cette demande a déjà été traitée.';end if;
  if result='approved' then
    if not exists(select 1 from public.contacts where id=r.agent_contact_id and linked_user_id=r.requested_by) then raise exception 'Le contact de l’agent doit encore être lié au compte demandeur.';end if;
    insert into public.horse_contacts(horse_id,contact_id,role,can_create_entries,can_modify_entries,can_book_stalls,can_pay_invoices)
      values(r.horse_id,r.agent_contact_id,'agent',true,true,true,false)
      on conflict(horse_id,contact_id,role) do update set can_create_entries=true,can_modify_entries=true,can_book_stalls=true;
    insert into public.directory_contacts(organization_discipline_id,contact_id,source,created_by_user_id)
      select dh.organization_discipline_id,r.agent_contact_id,'relationship',actor from public.directory_horses dh
        join public.organization_disciplines od on od.id=dh.organization_discipline_id and od.organization_id=r.organization_id and od.is_active
        where dh.horse_id=r.horse_id on conflict(organization_discipline_id,contact_id) do nothing;
    insert into public.contact_roles(organization_id,contact_id,role,source) values(r.organization_id,r.agent_contact_id,'agent','horse')
      on conflict(organization_id,contact_id,role) do nothing;
  end if;
  update public.horse_agent_requests set status=result,decided_at=now(),decided_by=actor where id=r.id;
  return result;
end $$;

revoke all on function public.horse_agent_contact_for_profile(uuid),public.my_horse_agent_contact(),public.new_horse_creator_agent(),public.new_horse_agent_directory(),
  public.can_review_horse_agent_request(uuid,uuid),public.search_horse_agent_candidates(uuid,text),public.request_horse_agent_access(uuid,uuid,text),
  public.list_horse_agent_requests(uuid),public.decide_horse_agent_request(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.can_review_horse_agent_request(uuid,uuid),public.search_horse_agent_candidates(uuid,text),
  public.request_horse_agent_access(uuid,uuid,text),public.list_horse_agent_requests(uuid),public.decide_horse_agent_request(uuid,text) to authenticated;
-- Horse ownership may be changed by its owner or association staff, not by
-- gaining an agent relationship. Creators may finish an unpublished new record.
create function public.can_assign_horse_owner(p_horse uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_platform_admin() or exists(select 1 from public.horses h where h.id=p_horse and (
    (h.created_by_user_id=public.current_profile_id() and not exists(select 1 from public.directory_horses where horse_id=h.id))
    or exists(select 1 from public.contacts c where c.id=h.primary_owner_contact_id and c.linked_user_id=public.current_profile_id())))
    or exists(select 1 from public.horse_contacts hc join public.contacts c on c.id=hc.contact_id
      where hc.horse_id=p_horse and hc.role in ('owner','co-owner') and c.linked_user_id=public.current_profile_id())
    or exists(select 1 from public.directory_horses dh join public.organization_disciplines od on od.id=dh.organization_discipline_id
      where dh.horse_id=p_horse and public.is_org_member(od.organization_id,array['admin','secretary']));
$$;
create function public.horse_ownership_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid; previous public.horse_contacts;
begin
  if auth.uid() is null then if tg_op='DELETE' then return old;else return new;end if;end if;
  if tg_table_name='horses' then
    if tg_op='UPDATE' and new.primary_owner_contact_id is not distinct from old.primary_owner_contact_id then return new;end if;
    target:=old.id;
  elsif tg_op='INSERT' then
    target:=new.horse_id;
    select * into previous from public.horse_contacts where horse_id=new.horse_id and contact_id=new.contact_id and role=new.role;
    if previous.id is not null and (new.can_create_entries,new.can_modify_entries,new.can_book_stalls,new.can_pay_invoices)
      is not distinct from (previous.can_create_entries,previous.can_modify_entries,previous.can_book_stalls,previous.can_pay_invoices) then return new;end if;
    if new.role='owner' and exists(select 1 from public.horses h where h.id=target and h.created_by_user_id=public.current_profile_id()
      and h.primary_owner_contact_id=new.contact_id and not exists(select 1 from public.horse_contacts hc where hc.horse_id=h.id and hc.role in ('owner','co-owner'))) then return new;end if;
  elsif tg_op='UPDATE' then
    target:=old.horse_id;
    if new.horse_id is distinct from old.horse_id then raise exception 'Le lien ne peut pas être déplacé vers un autre cheval.';end if;
    if (new.contact_id,new.role,new.can_create_entries,new.can_modify_entries,new.can_book_stalls,new.can_pay_invoices)
      is not distinct from (old.contact_id,old.role,old.can_create_entries,old.can_modify_entries,old.can_book_stalls,old.can_pay_invoices) then return new;end if;
    if new.contact_id=old.contact_id and new.role=old.role and old.role not in ('owner','co-owner')
      and exists(select 1 from public.contacts where id=old.contact_id and linked_user_id=public.current_profile_id())
      and (not new.can_create_entries or old.can_create_entries) and (not new.can_modify_entries or old.can_modify_entries)
      and (not new.can_book_stalls or old.can_book_stalls) and (not new.can_pay_invoices or old.can_pay_invoices) then return new;end if;
  else
    target:=old.horse_id;
    if old.role not in ('owner','co-owner') and exists(select 1 from public.contacts where id=old.contact_id and linked_user_id=public.current_profile_id()) then return old;end if;
  end if;
  if not public.can_assign_horse_owner(target) then raise exception 'La propriété et les nouveaux accès du cheval doivent être approuvés par son propriétaire ou le secrétariat.' using errcode='42501';end if;
  if tg_op='DELETE' then return old;else return new;end if;
end $$;
create trigger horse_ownership_guard before update of primary_owner_contact_id or delete on public.horses for each row execute function public.horse_ownership_guard();
create trigger horse_contact_ownership_guard before insert or update or delete on public.horse_contacts for each row execute function public.horse_ownership_guard();
revoke all on function public.can_assign_horse_owner(uuid),public.horse_ownership_guard() from public,anon,authenticated,service_role;

create function public.find_horse_owner_by_nrha(p_org uuid,p_number text)
returns table(contact_id uuid,first_name text,last_name text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.can_request_horse_access_in_org(p_org) then raise exception 'Cette association n’est pas accessible depuis ton compte.' using errcode='42501';end if;
  if p_number is null or btrim(p_number) !~ '^[0-9]{1,20}$' or not exists(select 1 from public.organization_disciplines where organization_id=p_org and is_active) then return;end if;
  return query select distinct c.id,c.first_name::text,c.last_name::text from public.contacts c
    join public.contact_external_identifiers x on x.contact_id=c.id
    join public.external_credential_issuers i on i.id=x.external_credential_issuer_id and upper(i.code)='NRHA'
    where public.identity_search_key(x.identifier_value)=public.identity_search_key(p_number) order by c.id limit 3;
end $$;

-- Internal atomic creation, callable only by the two validated workflows below.
create function public.create_horse_agent_record(p_org uuid,p_directory uuid,p_owner uuid,p_creator uuid,p_details jsonb) returns public.horses
language plpgsql security definer set search_path='' as $$
declare result public.horses; agent uuid; horse_name text:=nullif(btrim(p_details->>'name'),''); registration text:=nullif(btrim(p_details->>'registration_number'),'');
begin
  if not exists(select 1 from public.organization_disciplines where id=p_directory and organization_id=p_org and is_active)
    or not exists(select 1 from public.contacts where id=p_owner) then raise exception 'Propriétaire ou répertoire invalide.';end if;
  if horse_name is null or length(horse_name)>200 then raise exception 'Le nom du cheval est requis (200 caractères maximum).';end if;
  if length(coalesce(registration,''))>100 or (nullif(p_details->>'gender','') is not null and p_details->>'gender' not in ('M','F','G')) then raise exception 'Numéro ou sexe du cheval invalide.';end if;
  if nullif(p_details->>'birth_year','') is not null then
    if p_details->>'birth_year' !~ '^[0-9]{4}$' then raise exception 'Année de naissance invalide.';end if;
    if (p_details->>'birth_year')::integer not between 1900 and extract(year from current_date)::integer+1 then raise exception 'Année de naissance invalide.';end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('horse-owner-creation:'||p_owner,0));
  if exists(select 1 from public.horses h where
    (h.primary_owner_contact_id=p_owner and public.identity_search_key(h.name)=public.identity_search_key(horse_name))
      or (registration is not null and public.identity_search_key(h.registration_number)=public.identity_search_key(registration))) then
    raise exception 'Ce cheval existe déjà. Recherche-le et demande à devenir son agent.';end if;
  agent:=public.horse_agent_contact_for_profile(p_creator);
  insert into public.horses(name,primary_owner_contact_id,created_by_user_id,registration_number,registration_status,gender,birth_year)
    values(horse_name,p_owner,p_creator,registration,case when registration is null then 'unknown' else 'registered' end,
      nullif(p_details->>'gender',''),nullif(p_details->>'birth_year','')::integer) returning * into result;
  insert into public.directory_contacts(organization_discipline_id,contact_id,source,created_by_user_id)
    values(p_directory,p_owner,'relationship',p_creator) on conflict(organization_discipline_id,contact_id) do nothing;
  insert into public.directory_horses(organization_discipline_id,horse_id,source,created_by_user_id)
    values(p_directory,result.id,'manual',p_creator) on conflict(organization_discipline_id,horse_id) do nothing;
  insert into public.horse_contacts(horse_id,contact_id,role,can_create_entries,can_modify_entries,can_book_stalls,can_pay_invoices)
    values(result.id,p_owner,'owner',true,true,true,true) on conflict(horse_id,contact_id,role) do nothing;
  if not exists(select 1 from public.contacts where id=p_owner and linked_user_id=p_creator) then
    insert into public.horse_contacts(horse_id,contact_id,role,can_create_entries,can_modify_entries,can_book_stalls,can_pay_invoices)
      values(result.id,agent,'agent',true,true,true,false) on conflict(horse_id,contact_id,role) do nothing;
    insert into public.directory_contacts(organization_discipline_id,contact_id,source,created_by_user_id)
      values(p_directory,agent,'relationship',p_creator) on conflict(organization_discipline_id,contact_id) do nothing;
    insert into public.contact_roles(organization_id,contact_id,role,source) values(p_org,agent,'agent','horse') on conflict(organization_id,contact_id,role) do nothing;
  end if;
  insert into public.contact_roles(organization_id,contact_id,role,source) values(p_org,p_owner,'owner','horse') on conflict(organization_id,contact_id,role) do nothing;
  return result;
end $$;

create function public.create_horse_for_nrha_owner(p_org uuid,p_directory uuid,p_number text,p_details jsonb) returns public.horses
language plpgsql security definer set search_path='' as $$
declare owner uuid; matches integer;
begin
  if auth.uid() is null or public.current_profile_id() is null then raise exception 'Connecte-toi pour créer un cheval.' using errcode='42501';end if;
  select count(*),min(c.contact_id::text)::uuid into matches,owner from public.find_horse_owner_by_nrha(p_org,p_number) c;
  if matches<>1 then raise exception 'Le numéro NRHA ne permet pas de choisir une fiche unique. Demande la confirmation du secrétariat avec le nom du propriétaire.';end if;
  return public.create_horse_agent_record(p_org,p_directory,owner,public.current_profile_id(),p_details);
end $$;

create table public.horse_owner_creation_requests (
  id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
  organization_discipline_id uuid not null references public.organization_disciplines(id),
  requested_by uuid not null references public.user_profiles(id),owner_first_name text not null,owner_last_name text not null,
  details jsonb not null,status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  created_horse_id uuid references public.horses(id) on delete set null,created_at timestamptz not null default now(),
  decided_at timestamptz,decided_by uuid references public.user_profiles(id)
);
create index horse_owner_request_queue on public.horse_owner_creation_requests(organization_id,status,created_at);
create index horse_owner_request_author on public.horse_owner_creation_requests(requested_by,created_at);
alter table public.horse_owner_creation_requests enable row level security;
revoke all on public.horse_owner_creation_requests from public,anon,authenticated;
grant select on public.horse_owner_creation_requests to authenticated;
create policy "Requester and staff read owner confirmation requests" on public.horse_owner_creation_requests for select to authenticated
  using (requested_by=public.current_profile_id() or public.is_platform_admin() or public.is_org_member(organization_id,array['admin','secretary']));

create function public.request_horse_owner_confirmation(p_org uuid,p_directory uuid,p_first_name text,p_last_name text,p_details jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; actor uuid:=public.current_profile_id(); request_details jsonb;
begin
  if auth.uid() is null or actor is null then raise exception 'Connecte-toi pour demander la confirmation du propriétaire.' using errcode='42501';end if;
  if not public.can_request_horse_access_in_org(p_org) then raise exception 'Cette association n’est pas accessible depuis ton compte.' using errcode='42501';end if;
  if nullif(btrim(p_first_name),'') is null or nullif(btrim(p_last_name),'') is null or length(p_first_name)>100 or length(p_last_name)>100
    or nullif(btrim(p_details->>'name'),'') is null or length(p_details->>'name')>200 or pg_column_size(p_details)>8192 then raise exception 'Le nom du propriétaire et du cheval sont requis.';end if;
  if not exists(select 1 from public.organization_disciplines where id=p_directory and organization_id=p_org and is_active) then raise exception 'Répertoire invalide.' using errcode='42501';end if;
  perform public.my_horse_agent_contact();
  request_details:=jsonb_build_object('name',btrim(p_details->>'name'),'registration_number',p_details->>'registration_number','gender',p_details->>'gender','birth_year',p_details->>'birth_year');
  perform pg_advisory_xact_lock(hashtextextended('horse-owner-request:'||actor||':'||p_org,0));
  select id into result from public.horse_owner_creation_requests where requested_by=actor and organization_id=p_org and organization_discipline_id=p_directory
    and owner_first_name=btrim(p_first_name) and owner_last_name=btrim(p_last_name) and status='pending' and horse_owner_creation_requests.details=request_details limit 1;
  if result is null then insert into public.horse_owner_creation_requests(organization_id,organization_discipline_id,requested_by,owner_first_name,owner_last_name,details)
    values(p_org,p_directory,actor,btrim(p_first_name),btrim(p_last_name),request_details) returning id into result;end if;
  return result;
end $$;

create function public.list_horse_owner_confirmations(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Connecte-toi pour consulter les demandes.' using errcode='42501';end if;
  return coalesce((select jsonb_agg(to_jsonb(r)) from (
    select x.id,x.owner_first_name,x.owner_last_name,x.details,x.status,x.created_horse_id,x.created_at,
      concat_ws(' ',p.first_name,p.last_name) as requester_name,x.requested_by=public.current_profile_id() as is_mine,
      public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary']) as can_review
    from public.horse_owner_creation_requests x join public.user_profiles p on p.id=x.requested_by where x.organization_id=p_org
      and (x.requested_by=public.current_profile_id() or public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary']))
    order by (x.status='pending') desc,x.created_at desc limit 100) r),'[]'::jsonb);
end $$;

create function public.decide_horse_owner_confirmation(p_request uuid,p_action text,p_owner uuid default null) returns text
language plpgsql security definer set search_path='' as $$
declare r public.horse_owner_creation_requests; actor uuid:=public.current_profile_id(); result text; horse public.horses;
begin
  if auth.uid() is null or actor is null then raise exception 'Connecte-toi pour traiter une demande.' using errcode='42501';end if;
  select * into r from public.horse_owner_creation_requests where id=p_request for update;
  if r.id is null then raise exception 'Demande introuvable.';end if;
  if p_action='cancel' then
    if r.requested_by<>actor then raise exception 'Tu ne peux pas annuler cette demande.' using errcode='42501';end if;
    result:='cancelled';
  elsif p_action in ('approve','reject') then
    if not (public.is_platform_admin() or public.is_org_member(r.organization_id,array['admin','secretary'])) then raise exception 'La confirmation du nom appartient au secrétariat.' using errcode='42501';end if;
    result:=case when p_action='approve' then 'approved' else 'rejected' end;
  else raise exception 'Action invalide.';end if;
  if r.status=result then return result;end if;
  if r.status<>'pending' then raise exception 'Cette demande a déjà été traitée.';end if;
  if result='approved' then
    if p_owner is null or not public.can_access_contact(p_owner) then raise exception 'Choisis la fiche du propriétaire confirmée.' using errcode='42501';end if;
    horse:=public.create_horse_agent_record(r.organization_id,r.organization_discipline_id,p_owner,r.requested_by,r.details);
  end if;
  update public.horse_owner_creation_requests set status=result,created_horse_id=horse.id,decided_at=now(),decided_by=actor where id=r.id;
  return result;
end $$;

revoke all on function public.find_horse_owner_by_nrha(uuid,text),public.create_horse_agent_record(uuid,uuid,uuid,uuid,jsonb),
  public.create_horse_for_nrha_owner(uuid,uuid,text,jsonb),public.request_horse_owner_confirmation(uuid,uuid,text,text,jsonb),
  public.list_horse_owner_confirmations(uuid),public.decide_horse_owner_confirmation(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.find_horse_owner_by_nrha(uuid,text),public.create_horse_for_nrha_owner(uuid,uuid,text,jsonb),
  public.request_horse_owner_confirmation(uuid,uuid,text,text,jsonb),public.list_horse_owner_confirmations(uuid),public.decide_horse_owner_confirmation(uuid,text,uuid) to authenticated;
-- Preserve approved agents' existing right to enter their managed horse for its owner.
create or replace function public.entry_back_number_workflow() returns trigger
language plpgsql security definer set search_path=public as $$
declare b public.blocks;o public.organizations;n public.organization_back_numbers;r public.back_number_requests;price numeric;stock public.organization_back_numbers;
begin
  select * into b from public.blocks where id=(select block_id from public.classes where id=new.class_id);
  select * into o from public.organizations where id=new.organization_id;
  if o.back_number_policy<>'horse' then return new;end if;
  if tg_op='INSERT' then new.back_number_request_id:=null;
  elsif new.back_number_request_id is distinct from old.back_number_request_id then new.back_number_request_id:=old.back_number_request_id;
  end if;
  if b.organization_id is distinct from new.organization_id or b.show_id is distinct from new.show_id then raise exception 'Association ou concours incohérent.';end if;
  if tg_op='UPDATE' and (new.horse_id,new.class_id,new.entry_number,new.back_number_choice,new.back_number_request_token)
    is not distinct from (old.horse_id,old.class_id,old.entry_number,old.back_number_choice,old.back_number_request_token) then return new;end if;
  if auth.uid() is null or not public.can_access_horse(new.horse_id) or not (public.can_access_contact(new.payer_contact_id) or public.can_bill_entry_owner(new.horse_id,new.payer_contact_id)) then
    raise exception 'Inscription non autorisée.' using errcode='42501';end if;
  perform public.billing6_lock(new.organization_id);
  perform pg_advisory_xact_lock(hashtextextended('backnumbers:'||new.organization_id,0));
  select * into n from public.organization_back_numbers where organization_id=new.organization_id and assigned_horse_id=new.horse_id and assignment_mode='horse' and status='assigned' for update;
  if tg_op='UPDATE' and new.entry_number is not null and new.entry_number is distinct from old.entry_number
    and new.entry_number is distinct from n.number and new.back_number_choice=old.back_number_choice
    and new.back_number_request_token is not distinct from old.back_number_request_token then
    new.back_number_choice:='personal';
    new.back_number_request_id:=null;
  end if;
  if new.back_number_choice='legacy' then
    if new.entry_number is not null and new.entry_number is distinct from n.number then
      new.back_number_choice:='personal';
    elsif n.id is not null and (not b.requires_association_back_number or n.association_issued) then
      new.entry_number:=n.number;
      return new;
    else
      -- Existing integrations may leave the number pending, never purchase silently.
      new.entry_number:=null;
      if b.draw_prepared_at is not null then raise exception 'Un dossard doit être assigné avant d''ajouter ce cheval à un bloc dont l''ordre est créé.';end if;
      return new;
    end if;
  end if;
  -- Compatibility for existing entry clients that supply a number directly.
  if new.back_number_choice='reuse' and new.entry_number is not null and new.entry_number is distinct from n.number then
    new.back_number_choice:='personal';
  end if;

  -- Assignment propagation is not a new purchase.
  if tg_op='UPDATE' and new.entry_number is not distinct from n.number and new.back_number_request_id is not null then
    select * into r from public.back_number_requests where id=new.back_number_request_id;
    if r.status='assigned' and r.horse_id=new.horse_id and r.organization_id=new.organization_id then
      if b.requires_association_back_number and not n.association_issued then raise exception 'Ce bloc impose un dossard fourni par l''association.';end if;
      return new;
    end if;
  end if;
  if new.back_number_choice='request' then
    select * into r from public.back_number_requests where id=new.back_number_request_token for update;
    if r.id is not null and (r.organization_id<>new.organization_id or r.horse_id<>new.horse_id) then raise exception 'Demande de dossard incohérente.';end if;
    if r.id is null then select * into r from public.back_number_requests where organization_id=new.organization_id and horse_id=new.horse_id and status='pending' for update;end if;
    if r.id is null then
      price:=coalesce(b.back_number_request_fee,o.back_number_request_fee);
      insert into public.back_number_requests(id,organization_id,horse_id,show_id,block_id,payer_contact_id,requested_by,fee)
        values(coalesce(new.back_number_request_token,gen_random_uuid()),new.organization_id,new.horse_id,new.show_id,b.id,new.payer_contact_id,public.current_profile_id(),price) returning * into r;
      if price>0 then
        if public.reservation_uses_accounts(new.show_id) then
          perform public.event_billing_set_line('back-number:'||r.id,new.organization_id,new.show_id,new.payer_contact_id,new.owner_contact_id,new.horse_id,
            'back_number','Nouveau dossard / New back number',1,price,true,true,r.id::text);
        else
          insert into public.manual_sales(organization_id,show_id,payer_contact_id,sold_by_user_id,status,description,quantity,unit_price,tax_applicable,source_payload)
            values(new.organization_id,new.show_id,new.payer_contact_id,public.current_profile_id(),'active','Nouveau dossard / New back number',1,price,true,jsonb_build_object('back_number_request_id',r.id));
        end if;
      end if;
      if o.back_number_auto_assign then
        select * into stock from public.organization_back_numbers where organization_id=new.organization_id and status='available' and association_issued order by number for update skip locked limit 1;
        if stock.id is not null then
          perform public.back_number_assert_change(new.organization_id,new.horse_id,stock.number);
          update public.organization_back_numbers set status='available',assigned_horse_id=null,assigned_rider_contact_id=null,assigned_at=null where id=n.id;
          update public.organization_back_numbers set status='assigned',assignment_mode='horse',assigned_horse_id=new.horse_id,assigned_rider_contact_id=null,assigned_at=now() where id=stock.id;
          select * into r from public.back_number_requests where id=r.id;
        end if;
      end if;
    end if;
    new.back_number_request_id:=r.id;
    if r.status='assigned' then
      select * into n from public.organization_back_numbers where organization_id=new.organization_id and assigned_horse_id=new.horse_id and assignment_mode='horse' and status='assigned';
      if n.id is null then raise exception 'Le dossard de cette demande a été libéré. Crée une nouvelle demande.';end if;
      if b.requires_association_back_number and not n.association_issued then raise exception 'Ce bloc impose un dossard fourni par l''association.';end if;
      new.entry_number:=n.number;
    else new.entry_number:=null;
    end if;
  elsif new.back_number_choice='personal' then
    if b.requires_association_back_number then raise exception 'Ce bloc impose un dossard fourni par l''association.';end if;
    if exists(select 1 from public.back_number_requests where organization_id=new.organization_id and horse_id=new.horse_id and status='pending') then
      raise exception 'Une demande de dossard est déjà en attente auprès de l''association.';end if;
    n:=public.claim_horse_back_number(new.organization_id,new.horse_id,new.entry_number,'horse',null);
    new.entry_number:=n.number;
    new.back_number_request_id:=null;
  else
    if n.id is null then raise exception 'Inscris un dossard libre ou demande une assignation à l''association.';end if;
    if b.requires_association_back_number and not n.association_issued then raise exception 'Ce bloc impose un dossard fourni par l''association.';end if;
    new.entry_number:=n.number;
  end if;
  if new.entry_number is null and b.draw_prepared_at is not null then raise exception 'Un dossard doit être assigné avant d''ajouter ce cheval à un bloc dont l''ordre est créé.';end if;
  return new;
end $$;
revoke all on function public.entry_back_number_workflow() from public,anon,authenticated,service_role;
commit;
