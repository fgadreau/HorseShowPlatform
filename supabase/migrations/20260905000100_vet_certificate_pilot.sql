-- Private veterinary pilot. No changes to association membership or central identity permissions.
create table public.vet_issuers (
 id uuid primary key default gen_random_uuid(), name text not null check(length(btrim(name)) between 2 and 200),
 kind text not null check(kind in ('clinic','independent')), status text not null default 'active' check(status in ('active','suspended')),
 contact_details text not null, approved_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now()
);
create table public.vet_memberships (
 issuer_id uuid not null references public.vet_issuers(id), profile_id uuid not null references public.user_profiles(id),
 active boolean not null default true, primary key(issuer_id,profile_id)
);
create table public.vet_practitioners (
 id uuid primary key default gen_random_uuid(), issuer_id uuid not null references public.vet_issuers(id),
 name text not null check(length(btrim(name)) between 3 and 200), permit_number text not null check(permit_number ~ '^[0-9]{1,12}$'),
 created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now(),
 unique(issuer_id,permit_number), unique(id,issuer_id)
);
create table public.vet_settings (
 id boolean primary key default true check(id), omvq_enabled boolean not null default false,
 freshness_hours integer not null default 24 check(freshness_hours between 1 and 168)
);
insert into public.vet_settings(id) values(true);
create table public.vet_verifications (
 id uuid primary key default gen_random_uuid(), practitioner_id uuid not null references public.vet_practitioners(id),
 declared_name text not null, declared_permit text not null, returned_name text, returned_permit text, returned_status text,
 checked_at timestamptz not null default now(), method text not null default 'omvq_browser' check(method='omvq_browser'),
 result text not null check(result in ('verified','name_mismatch','inactive','ambiguous','unavailable','not_found'))
);
create index on public.vet_verifications(practitioner_id,checked_at desc);
create table public.vet_certificates (
 id uuid primary key default gen_random_uuid(), issuer_id uuid not null references public.vet_issuers(id),
 practitioner_id uuid, horse_id uuid references public.horses(id),
 status text not null default 'draft' check(status in ('draft','issued','superseded','revoked')),
 number text unique, created_by uuid not null references public.user_profiles(id), issued_by uuid references public.user_profiles(id),
 created_at timestamptz not null default now(), issued_at timestamptz, revision integer not null default 1,
 payload jsonb not null default '{}' check(jsonb_typeof(payload)='object'), snapshot jsonb,
 verification_id uuid references public.vet_verifications(id),
 replaces_id uuid references public.vet_certificates(id),
 foreign key(practitioner_id,issuer_id) references public.vet_practitioners(id,issuer_id),
 check((status='draft' and issued_at is null and number is null and snapshot is null) or
       (status<>'draft' and issued_at is not null and issued_by is not null and number is not null and snapshot is not null and verification_id is not null))
);
create unique index vet_one_replacement on public.vet_certificates(replaces_id) where status='issued';
create table public.horse_vaccinations (
 id uuid primary key default gen_random_uuid(), horse_id uuid not null references public.horses(id),
 certificate_id uuid not null references public.vet_certificates(id), administration_index integer not null,
 disease text not null check(disease in ('influenza','ehv_1','ehv_4')),
 product text not null, manufacturer text not null, lot text not null, product_expires_on date not null,
 administered_on date not null, valid_until date, declared_duration text,
 practitioner_id uuid not null references public.vet_practitioners(id),
 unique(certificate_id,administration_index,disease), check(valid_until is null or valid_until>=administered_on),
 check(product_expires_on>=administered_on)
);
create index on public.horse_vaccinations(horse_id,disease,administered_on desc);
create table public.vet_audit_events (
 id bigint generated always as identity primary key, issuer_id uuid references public.vet_issuers(id),
 actor_id uuid references public.user_profiles(id), action text not null, entity_id uuid,
 details jsonb not null default '{}', created_at timestamptz not null default now()
);
create index on public.vet_audit_events(actor_id,action,created_at);
-- Short-lived selections are capabilities scoped to both actor and clinic, never global horse permissions.
create table public.vet_horse_selections (
 id uuid primary key default gen_random_uuid(), issuer_id uuid not null references public.vet_issuers(id),
 actor_id uuid not null references public.user_profiles(id), horse_id uuid not null references public.horses(id),
 identity_snapshot jsonb not null, method text not null, expires_at timestamptz not null default now()+interval '10 minutes'
);

create function public.vet_name_key(p_name text) returns text language sql immutable set search_path='' as $$
 select lower(regexp_replace(btrim(regexp_replace(regexp_replace(normalize(coalesce(p_name,''),NFC),'^\s*(Dr|Dre)\.?\s+','','i'),'\s+m\.\s*v\.\s*$','','i')),'\s+',' ','g'))
$$;
create function public.vet_has_access(p_issuer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.vet_issuers i where i.id=p_issuer and i.status='active' and
 (public.is_platform_admin() or exists(select 1 from public.vet_memberships m where m.issuer_id=i.id and m.profile_id=public.current_profile_id() and m.active)))
$$;
create function public.vet_assert_access(p_issuer uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Lock through sensitive transactions so suspension cannot race issuance.
 perform 1 from public.vet_issuers where id=p_issuer for share;
 if not public.vet_has_access(p_issuer) then raise exception 'VET_ACCESS_DENIED' using errcode='42501'; end if;
 perform 1 from public.vet_memberships where issuer_id=p_issuer and profile_id=public.current_profile_id() for share;
end $$;
create function public.vet_audit(p_issuer uuid,p_action text,p_entity uuid,p_details jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.vet_audit_events(issuer_id,actor_id,action,entity_id,details) values(p_issuer,public.current_profile_id(),p_action,p_entity,p_details)
$$;

-- All table mutation goes through explicitly granted RPCs. Audit, verification and selections are internal.
do $$ declare t text; begin
 foreach t in array array['vet_issuers','vet_memberships','vet_practitioners','vet_settings','vet_verifications','vet_certificates','horse_vaccinations','vet_audit_events','vet_horse_selections'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 end loop;
end $$;
grant select on public.vet_issuers,public.vet_memberships,public.vet_practitioners,public.vet_certificates,public.horse_vaccinations,public.vet_settings,public.vet_verifications,public.vet_audit_events to authenticated;
create policy vet_read_issuers on public.vet_issuers for select to authenticated using(public.vet_has_access(id) or public.is_platform_admin());
create policy vet_read_members on public.vet_memberships for select to authenticated using(public.vet_has_access(issuer_id) or public.is_platform_admin());
create policy vet_read_practitioners on public.vet_practitioners for select to authenticated using(public.vet_has_access(issuer_id));
create policy vet_read_certificates on public.vet_certificates for select to authenticated using(public.vet_has_access(issuer_id));
create policy vet_read_settings on public.vet_settings for select to authenticated using(public.is_platform_admin() or exists(select 1 from public.vet_memberships m where m.profile_id=public.current_profile_id() and public.vet_has_access(m.issuer_id)));
create policy vet_read_checks on public.vet_verifications for select to authenticated using(exists(select 1 from public.vet_practitioners p where p.id=practitioner_id and public.vet_has_access(p.issuer_id)));
create policy vet_read_audit on public.vet_audit_events for select to authenticated using(public.is_platform_admin() or public.vet_has_access(issuer_id));
create policy vet_read_vaccinations on public.horse_vaccinations for select to authenticated using(public.can_access_horse(horse_id) or exists(select 1 from public.vet_certificates c where c.id=certificate_id and public.vet_has_access(c.issuer_id)));

create function public.vet_admin_save_issuer(p_id uuid,p_name text,p_kind text,p_contact_details text,p_status text default 'active') returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid:=coalesce(p_id,gen_random_uuid()); begin
 if not public.is_platform_admin() then raise exception 'VET_ADMIN_REQUIRED' using errcode='42501'; end if;
 insert into public.vet_issuers(id,name,kind,contact_details,status,approved_by) values(v_id,btrim(p_name),p_kind,btrim(p_contact_details),p_status,public.current_profile_id())
 on conflict(id) do update set name=excluded.name,kind=excluded.kind,contact_details=excluded.contact_details,status=excluded.status;
 perform public.vet_audit(v_id,'issuer_saved',v_id,jsonb_build_object('status',p_status)); return v_id;
end $$;
create function public.vet_admin_set_member(p_issuer uuid,p_email text,p_active boolean default true) returns void language plpgsql security definer set search_path='' as $$
declare v_profile uuid; begin
 if not public.is_platform_admin() then raise exception 'VET_ADMIN_REQUIRED' using errcode='42501'; end if;
 select p.id into v_profile from public.user_profiles p join auth.users u on u.id=p.user_id where lower(u.email)=lower(btrim(p_email));
 if v_profile is null then raise exception 'VET_EXISTING_ACCOUNT_REQUIRED'; end if;
 insert into public.vet_memberships values(p_issuer,v_profile,p_active) on conflict(issuer_id,profile_id) do update set active=excluded.active;
 perform public.vet_audit(p_issuer,'member_access_changed',v_profile,jsonb_build_object('active',p_active));
end $$;
create function public.vet_admin_settings(p_enabled boolean,p_freshness_hours integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'VET_ADMIN_REQUIRED' using errcode='42501'; end if;
 update public.vet_settings set omvq_enabled=p_enabled,freshness_hours=p_freshness_hours where id=true;
 perform public.vet_audit(null,'settings_changed',null,jsonb_build_object('enabled',p_enabled,'freshness_hours',p_freshness_hours));
end $$;
create function public.vet_add_practitioner(p_issuer uuid,p_name text,p_permit text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; begin
 perform public.vet_assert_access(p_issuer);
 insert into public.vet_practitioners(issuer_id,name,permit_number,created_by) values(p_issuer,btrim(p_name),btrim(p_permit),public.current_profile_id()) returning id into v_id;
 perform public.vet_audit(p_issuer,'practitioner_added',v_id); return v_id;
end $$;

create function public.vet_verification_context(p_practitioner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.vet_practitioners; s public.vet_settings; v public.vet_verifications; begin
 select * into p from public.vet_practitioners where id=p_practitioner;
 perform public.vet_assert_access(p.issuer_id);
 select * into s from public.vet_settings;
 if not s.omvq_enabled then raise exception 'VET_OMVQ_DISABLED'; end if;
 select * into v from public.vet_verifications where practitioner_id=p.id order by checked_at desc,id desc limit 1;
 if (select count(*) from public.vet_audit_events where actor_id=public.current_profile_id() and action='verification_requested' and created_at>now()-interval '1 hour')>=30 then raise exception 'VET_RATE_LIMIT'; end if;
 perform public.vet_audit(p.issuer_id,'verification_requested',p.id);
 return jsonb_build_object('practitioner',to_jsonb(p),'freshness_hours',s.freshness_hours,'cached',case when v.result='verified' and v.checked_at>now()-make_interval(hours=>s.freshness_hours) then to_jsonb(v) else null end);
end $$;
-- Only the trusted browser worker may call this. Neither staff nor platform admins can forge checks.
create function public.vet_record_verification(p_practitioner uuid,p_name text,p_permit text,p_status text,p_result text) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.vet_practitioners; v_id uuid; begin
 select * into p from public.vet_practitioners where id=p_practitioner;
 if not found then raise exception 'VET_PRACTITIONER_NOT_FOUND'; end if;
 if p_result='verified' and (p_permit is distinct from p.permit_number or public.vet_name_key(p_name)<>public.vet_name_key(p.name) or p_status is distinct from 'Actif') then raise exception 'VET_INVALID_POSITIVE'; end if;
 insert into public.vet_verifications(practitioner_id,declared_name,declared_permit,returned_name,returned_permit,returned_status,result)
 values(p.id,p.name,p.permit_number,left(p_name,200),left(p_permit,20),left(p_status,100),p_result) returning id into v_id;
 perform public.vet_audit(p.issuer_id,'omvq_checked',p.id,jsonb_build_object('verification_id',v_id,'result',p_result)); return v_id;
end $$;

create function public.vet_horse_snapshot(p_horse uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',h.id,'name',h.name,'breed',h.breed,'color',h.color,'gender',h.gender,'date_of_birth',h.date_of_birth,'birth_year',h.birth_year,
 'owner_name',concat_ws(' ',c.first_name,c.middle_name,c.last_name),'owner_contact_id',c.id,
 'identifiers',coalesce((select jsonb_agg(jsonb_build_object('issuer_id',x.external_credential_issuer_id,'type',x.identifier_type,'value',x.identifier_value) order by x.id) from public.horse_external_identifiers x where x.horse_id=h.id and x.identifier_type in ('registration','microchip') and x.status not in ('revoked','inactive')),'[]'::jsonb))
 from public.horses h join public.contacts c on c.id=h.primary_owner_contact_id where h.id=p_horse
$$;
create function public.vet_search_horses(p_issuer uuid,p_registry uuid default null,p_registration text default '',p_microchip text default '',p_name text default '',p_owner text default '')
 returns table(selection_id uuid,horse_name text,owner_name text,method text) language plpgsql security definer set search_path='' as $$
declare h record; v_method text; v_snapshot jsonb; v_id uuid; begin
 perform public.vet_assert_access(p_issuer);
 if (select count(*) from public.vet_audit_events where actor_id=public.current_profile_id() and action='horse_search' and created_at>now()-interval '1 hour')>=30 then raise exception 'VET_RATE_LIMIT'; end if;
 if nullif(btrim(p_registration),'') is not null then
  if p_registry is null then raise exception 'VET_REGISTRY_REQUIRED'; end if; v_method:='registration';
 elsif nullif(btrim(p_microchip),'') is not null then
  if p_microchip !~ '^[0-9]{10,20}$' then raise exception 'VET_MICROCHIP_INVALID'; end if; v_method:='microchip';
 elsif length(btrim(p_name))>=3 and length(btrim(p_owner))>=5 then v_method:='name_owner';
 else raise exception 'VET_SEARCH_CRITERIA_REQUIRED'; end if;
 perform public.vet_audit(p_issuer,'horse_search',null,jsonb_build_object('method',v_method));
 for h in select horse.id from public.horses horse join public.contacts c on c.id=horse.primary_owner_contact_id where
 (v_method='registration' and exists(select 1 from public.horse_external_identifiers x where x.horse_id=horse.id and x.identifier_type='registration' and x.external_credential_issuer_id=p_registry and x.normalized_identifier_value=upper(btrim(p_registration)) and x.status not in ('revoked','inactive')))
 or (v_method='microchip' and exists(select 1 from public.horse_external_identifiers x where x.horse_id=horse.id and x.identifier_type='microchip' and x.normalized_identifier_value=btrim(p_microchip) and x.status not in ('revoked','inactive')))
 or (v_method='name_owner' and public.vet_name_key(horse.name)=public.vet_name_key(p_name) and public.vet_name_key(concat_ws(' ',c.first_name,c.middle_name,c.last_name))=public.vet_name_key(p_owner))
 order by horse.id limit 6 loop
  v_snapshot:=public.vet_horse_snapshot(h.id);
  insert into public.vet_horse_selections(issuer_id,actor_id,horse_id,identity_snapshot,method) values(p_issuer,public.current_profile_id(),h.id,v_snapshot,v_method) returning id into v_id;
  selection_id:=v_id;horse_name:=v_snapshot->>'name';owner_name:=v_snapshot->>'owner_name';method:=v_method; return next;
 end loop;
end $$;

-- Protect strong identifiers against concurrent creation through ANY central path.
-- Existing collisions are left for manual resolution; changed/new identities cannot add collisions.
create function public.vet_prevent_duplicate_identifier() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; begin
 if new.identifier_type not in ('registration','microchip') or new.status in ('revoked','inactive') then return new; end if;
 if tg_op='UPDATE' and (new.horse_id,new.identifier_type,new.external_credential_issuer_id,new.identifier_value,new.status) is not distinct from (old.horse_id,old.identifier_type,old.external_credential_issuer_id,old.identifier_value,old.status) then return new; end if;
 k:=new.identifier_type||':'||case when new.identifier_type='registration' then new.external_credential_issuer_id::text else '' end||':'||upper(btrim(new.identifier_value));
 perform pg_advisory_xact_lock(hashtextextended(k,0));
 if exists(select 1 from public.horse_external_identifiers x where x.id<>new.id and x.horse_id<>new.horse_id and x.identifier_type=new.identifier_type and x.status not in ('revoked','inactive') and x.normalized_identifier_value=upper(btrim(new.identifier_value)) and (new.identifier_type='microchip' or x.external_credential_issuer_id=new.external_credential_issuer_id)) then raise exception 'VET_DUPLICATE_IDENTIFIER' using errcode='23505'; end if;
 return new;
end $$;
create trigger vet_prevent_duplicate_identifier before insert or update on public.horse_external_identifiers for each row execute function public.vet_prevent_duplicate_identifier();

create function public.vet_create_horse(p_issuer uuid,p_horse_name text,p_owner_first text,p_owner_last text,p_owner_email text,p_registry uuid default null,p_registration text default '',p_microchip text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid;v_horse uuid;v_selection uuid;v_chip_issuer uuid;begin
 perform public.vet_assert_access(p_issuer);
 if coalesce(length(btrim(p_horse_name)),0)<2 or coalesce(length(btrim(p_owner_first)),0)<1 or coalesce(length(btrim(p_owner_last)),0)<1 or p_owner_email is null or p_owner_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'VET_IDENTITY_REQUIRED'; end if;
 if nullif(btrim(p_registration),'') is not null and p_registry is null then raise exception 'VET_REGISTRY_REQUIRED'; end if;
 if nullif(btrim(p_microchip),'') is not null and p_microchip !~ '^[0-9]{10,20}$' then raise exception 'VET_MICROCHIP_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended('vet-owner:'||lower(btrim(p_owner_email)),0));
 select id into v_owner from public.contacts where lower(btrim(email))=lower(btrim(p_owner_email));
 if v_owner is not null and not exists(select 1 from public.contacts where id=v_owner and public.vet_name_key(concat_ws(' ',first_name,last_name))=public.vet_name_key(p_owner_first||' '||p_owner_last)) then raise exception 'VET_OWNER_REVIEW_REQUIRED'; end if;
 if v_owner is null then
  insert into public.contacts(type,first_name,last_name,email,created_by_user_id,linked_user_id) values('owner',btrim(p_owner_first),btrim(p_owner_last),lower(btrim(p_owner_email)),null,null) returning id into v_owner;
 end if;
 if exists(select 1 from public.horses where primary_owner_contact_id=v_owner and public.vet_name_key(name)=public.vet_name_key(p_horse_name)) then raise exception 'VET_EXISTING_HORSE_SEARCH_REQUIRED'; end if;
 insert into public.horses(name,primary_owner_contact_id,created_by_user_id,registration_status) values(btrim(p_horse_name),v_owner,null,case when nullif(btrim(p_registration),'') is null then 'unknown' else 'registered' end) returning id into v_horse;
 insert into public.horse_contacts(horse_id,contact_id,role) values(v_horse,v_owner,'owner');
 if nullif(btrim(p_registration),'') is not null then
  insert into public.horse_external_identifiers(horse_id,external_credential_issuer_id,identifier_type,identifier_value,status) values(v_horse,p_registry,'registration',btrim(p_registration),'pending');
 end if;
 if nullif(btrim(p_microchip),'') is not null then
  select id into v_chip_issuer from public.external_credential_issuers where code='HSP_DECLARED_MICROCHIP';
  insert into public.horse_external_identifiers(horse_id,external_credential_issuer_id,identifier_type,identifier_value,status) values(v_horse,v_chip_issuer,'microchip',btrim(p_microchip),'pending');
 end if;
 insert into public.vet_horse_selections(issuer_id,actor_id,horse_id,identity_snapshot,method) values(p_issuer,public.current_profile_id(),v_horse,public.vet_horse_snapshot(v_horse),'created') returning id into v_selection;
 perform public.vet_audit(p_issuer,'horse_created',v_horse); return v_selection;
end $$;
insert into public.external_credential_issuers(code,name,issuer_type,metadata) values('HSP_DECLARED_MICROCHIP','Micropuce déclarée — autorité non vérifiée','other','{"provenance_only":true}') on conflict(code) do nothing;

create function public.vet_save_draft(p_issuer uuid,p_id uuid,p_revision integer,p_practitioner uuid,p_payload jsonb) returns public.vet_certificates language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates;begin
 perform public.vet_assert_access(p_issuer);
 if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>65536 then raise exception 'VET_INVALID_PAYLOAD'; end if;
 if p_practitioner is not null and not exists(select 1 from public.vet_practitioners where id=p_practitioner and issuer_id=p_issuer) then raise exception 'VET_PRACTITIONER_FORBIDDEN' using errcode='42501';end if;
 select * into c from public.vet_certificates where id=p_id for update;
 if found then
  if c.issuer_id<>p_issuer or c.status<>'draft' or c.revision<>p_revision then raise exception 'VET_DRAFT_CONFLICT';end if;
  update public.vet_certificates set practitioner_id=p_practitioner,payload=p_payload,revision=revision+1 where id=p_id returning * into c;
 else
  insert into public.vet_certificates(id,issuer_id,practitioner_id,created_by,payload) values(p_id,p_issuer,p_practitioner,public.current_profile_id(),p_payload) returning * into c;
 end if;
 perform public.vet_audit(p_issuer,'draft_saved',c.id,jsonb_build_object('revision',c.revision)); return c;
end $$;
create function public.vet_link_horse(p_certificate uuid,p_selection uuid,p_confirmed boolean) returns public.vet_certificates language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates;s public.vet_horse_selections;begin
 select * into c from public.vet_certificates where id=p_certificate for update;perform public.vet_assert_access(c.issuer_id);
 if c.status<>'draft' then raise exception 'VET_CERTIFICATE_IMMUTABLE';end if;
 select * into s from public.vet_horse_selections where id=p_selection and issuer_id=c.issuer_id and actor_id=public.current_profile_id() and expires_at>now();
 if not found or p_confirmed is distinct from true then raise exception 'VET_SELECTION_REQUIRED';end if;
 if s.identity_snapshot is distinct from public.vet_horse_snapshot(s.horse_id) then raise exception 'VET_IDENTITY_CHANGED';end if;
 update public.vet_certificates set horse_id=s.horse_id,payload=jsonb_set(payload,'{horse}',s.identity_snapshot),revision=revision+1 where id=c.id returning * into c;
 perform public.vet_audit(c.issuer_id,'horse_linked',c.id,jsonb_build_object('method',s.method,'horse_id',s.horse_id));return c;
end $$;

create function public.vet_protect_certificate() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status<>'draft' and (to_jsonb(new)-'status') is distinct from (to_jsonb(old)-'status') then raise exception 'VET_CERTIFICATE_IMMUTABLE';end if;
 if old.status<>'draft' and not (old.status='issued' and new.status in ('issued','revoked','superseded')) then raise exception 'VET_INVALID_TRANSITION';end if;
 return new;
end $$;
create trigger vet_protect_certificate before update on public.vet_certificates for each row execute function public.vet_protect_certificate();

create function public.vet_issue_certificate(p_id uuid) returns public.vet_certificates language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates;p public.vet_practitioners;v public.vet_verifications;s public.vet_settings;i public.vet_issuers; item jsonb;d text;idx integer:=0;v_date date;v_exp date;v_until date;begin
 select * into c from public.vet_certificates where id=p_id for update;perform public.vet_assert_access(c.issuer_id);
 if c.status='issued' then return c;end if;
 if c.status<>'draft' then raise exception 'VET_INVALID_TRANSITION';end if;
 select * into s from public.vet_settings for share;
 if not s.omvq_enabled then raise exception 'VET_OMVQ_DISABLED';end if;
 select * into p from public.vet_practitioners where id=c.practitioner_id;
 select * into v from public.vet_verifications where practitioner_id=p.id order by checked_at desc,id desc limit 1;
 if v.id is null or v.result<>'verified' or v.declared_name<>p.name or v.declared_permit<>p.permit_number or v.checked_at<now()-make_interval(hours=>s.freshness_hours) then raise exception 'VET_FRESH_VERIFICATION_REQUIRED';end if;
 if c.horse_id is null or c.payload->'horse' is distinct from public.vet_horse_snapshot(c.horse_id) then raise exception 'VET_CONFIRMED_HORSE_REQUIRED';end if;
 if coalesce(length(btrim(c.payload#>>'{owner,name}')),0)<3 or coalesce(length(btrim(c.payload#>>'{owner,contact_details}')),0)<3 then raise exception 'VET_OWNER_DETAILS_REQUIRED';end if;
 if jsonb_typeof(c.payload->'administrations') is distinct from 'array' or jsonb_array_length(c.payload->'administrations') not between 1 and 20 then raise exception 'VET_ADMINISTRATIONS_REQUIRED';end if;
 for item in select value from jsonb_array_elements(c.payload->'administrations') loop
  idx:=idx+1;
  if coalesce(length(btrim(item->>'product')),0)=0 or coalesce(length(btrim(item->>'manufacturer')),0)=0 or coalesce(length(btrim(item->>'lot')),0)=0 then raise exception 'VET_PRODUCT_DETAILS_REQUIRED';end if;
  v_date:=nullif(item->>'administered_on','')::date;v_exp:=nullif(item->>'product_expires_on','')::date;v_until:=nullif(item->>'valid_until','')::date;
  if v_date is null or v_date>current_date or v_exp is null or v_exp<v_date or v_until<v_date then raise exception 'VET_INVALID_DATES';end if;
  if v_until is null and nullif(btrim(item->>'declared_duration'),'') is null then raise exception 'VET_VALIDITY_REQUIRED';end if;
  if jsonb_typeof(item->'diseases') is distinct from 'array' or jsonb_array_length(item->'diseases') not between 1 and 3 then raise exception 'VET_DISEASES_REQUIRED';end if;
  for d in select distinct value from jsonb_array_elements_text(item->'diseases') loop
   insert into public.horse_vaccinations(horse_id,certificate_id,administration_index,disease,product,manufacturer,lot,product_expires_on,administered_on,valid_until,declared_duration,practitioner_id)
   values(c.horse_id,c.id,idx,d,item->>'product',item->>'manufacturer',item->>'lot',v_exp,v_date,v_until,item->>'declared_duration',p.id);
  end loop;
 end loop;
 select * into i from public.vet_issuers where id=c.issuer_id;
 if c.replaces_id is not null then
  perform 1 from public.vet_certificates where id=c.replaces_id and issuer_id=c.issuer_id and status='issued' for update;
  if not found then raise exception 'VET_REPLACEMENT_CONFLICT';end if;
  update public.vet_certificates set status='superseded' where id=c.replaces_id;
  perform public.vet_audit(c.issuer_id,'superseded',c.replaces_id,jsonb_build_object('replacement_id',c.id));
 end if;
 update public.vet_certificates set status='issued',issued_at=now(),issued_by=public.current_profile_id(),verification_id=v.id,
 number='HSP-VET-'||upper(replace(c.id::text,'-','')),
 snapshot=jsonb_build_object('certificate',c.payload,'issuer',jsonb_build_object('id',i.id,'name',i.name,'kind',i.kind,'contact_details',i.contact_details),
 'practitioner',jsonb_build_object('id',p.id,'name',p.name,'permit_number',p.permit_number),'verification',to_jsonb(v),'created_by',c.created_by,'issued_by',public.current_profile_id(),'issued_at',now())
 where id=c.id returning * into c;
 perform public.vet_audit(c.issuer_id,'issued',c.id);return c;
end $$;
create function public.vet_revoke_certificate(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates;begin
 if not public.is_platform_admin() then raise exception 'VET_ADMIN_REQUIRED' using errcode='42501';end if;
 if coalesce(length(btrim(p_reason)),0)<5 then raise exception 'VET_REASON_REQUIRED';end if;
 select * into c from public.vet_certificates where id=p_id for update;
 if c.status<>'issued' then raise exception 'VET_INVALID_TRANSITION';end if;
 update public.vet_certificates set status='revoked' where id=c.id;
 perform public.vet_audit(c.issuer_id,'revoked',c.id,jsonb_build_object('reason',p_reason));
end $$;
create function public.vet_correct_certificate(p_id uuid) returns public.vet_certificates language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates;n public.vet_certificates;begin
 select * into c from public.vet_certificates where id=p_id for update;perform public.vet_assert_access(c.issuer_id);
 if c.status<>'issued' then raise exception 'VET_INVALID_TRANSITION';end if;
 insert into public.vet_certificates(issuer_id,practitioner_id,horse_id,created_by,payload,replaces_id) values(c.issuer_id,c.practitioner_id,c.horse_id,public.current_profile_id(),c.payload,c.id) returning * into n;
 perform public.vet_audit(c.issuer_id,'correction_started',n.id,jsonb_build_object('replaces_id',c.id));return n;
end $$;

-- New functions are not executable by PUBLIC (the PostgreSQL default).
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'vet_%' loop
 execute format('revoke all on function %s from public, anon, authenticated',f.signature);
 if f.proname in ('vet_has_access','vet_admin_save_issuer','vet_admin_set_member','vet_admin_settings','vet_add_practitioner','vet_verification_context','vet_search_horses','vet_create_horse','vet_save_draft','vet_link_horse','vet_issue_certificate','vet_correct_certificate','vet_revoke_certificate') then
 execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end $$;
grant execute on function public.vet_record_verification(uuid,text,text,text,text) to service_role;
