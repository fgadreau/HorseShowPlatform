-- Search receipts bind creation to a real, scoped, recent search on this draft.
create table public.vet_horse_searches (
 id uuid primary key default gen_random_uuid(), certificate_id uuid not null references public.vet_certificates(id),
 issuer_id uuid not null references public.vet_issuers(id), actor_id uuid not null references public.user_profiles(id),
 criteria jsonb not null, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '15 minutes',
 consumed_at timestamptz
);
alter table public.vet_horse_searches enable row level security;
revoke all on public.vet_horse_searches from public,anon,authenticated;
-- The former create RPC must no longer be a way around search-first.
revoke execute on function public.vet_create_horse(uuid,text,text,text,text,uuid,text,text) from authenticated,anon,public;
insert into public.external_credential_issuers(code,name,issuer_type,metadata)
 values('HSP_DECLARED_REGISTRATION','Enregistrement déclaré — organisme non précisé','other','{"provenance_only":true}') on conflict(code) do nothing;

create function public.vet_match_horses(p_name text,p_owner text,p_registration text,p_microchip text)
returns setof uuid language sql stable security definer set search_path='' as $$
 select h.id from public.horses h join public.contacts c on c.id=h.primary_owner_contact_id where
 (length(btrim(p_name))>=2 and length(btrim(p_owner))>=3 and public.vet_name_key(h.name)=public.vet_name_key(p_name)
  and public.vet_name_key(concat_ws(' ',c.first_name,c.middle_name,c.last_name))=public.vet_name_key(p_owner))
 or exists(select 1 from public.horse_external_identifiers x where x.horse_id=h.id and x.status not in ('revoked','inactive') and
 ((nullif(btrim(p_registration),'') is not null and x.identifier_type='registration' and x.normalized_identifier_value=upper(btrim(p_registration))) or
 (nullif(btrim(p_microchip),'') is not null and x.identifier_type='microchip' and x.normalized_identifier_value=btrim(p_microchip))))
 order by h.id limit 11
$$;
create function public.vet_candidate_results(p_issuer uuid,p_ids uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare h uuid;s jsonb;t uuid;r jsonb:='[]';begin
 foreach h in array p_ids[1:10] loop
  s:=public.vet_horse_snapshot(h);
  insert into public.vet_horse_selections(issuer_id,actor_id,horse_id,identity_snapshot,method)
   values(p_issuer,public.current_profile_id(),h,s,'targeted_search') returning id into t;
  r:=r||jsonb_build_array(jsonb_build_object('selection_id',t,'horse_name',s->>'name','owner_name',s->>'owner_name',
    'identifiers',s->'identifiers','breed',s->>'breed','color',s->>'color','birth_year',s->>'birth_year'));
 end loop;return r;
end $$;
create function public.vet_search_horse_candidates(p_certificate uuid,p_name text,p_owner text,p_registration text default '',p_microchip text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates; ids uuid[]; receipt uuid;begin
 select * into c from public.vet_certificates where id=p_certificate;perform public.vet_assert_access(c.issuer_id);
 if c.status<>'draft' then raise exception 'VET_CERTIFICATE_IMMUTABLE';end if;
 if not (coalesce(length(btrim(p_name)),0)>=2 and coalesce(length(btrim(p_owner)),0)>=3) and nullif(btrim(p_registration),'') is null and nullif(btrim(p_microchip),'') is null then raise exception 'VET_SEARCH_CRITERIA_REQUIRED';end if;
 if nullif(btrim(p_microchip),'') is not null and p_microchip !~ '^[0-9]{10,20}$' then raise exception 'VET_MICROCHIP_INVALID';end if;
 if (select count(*) from public.vet_horse_searches where actor_id=public.current_profile_id() and created_at>now()-interval '1 hour')>=30 then raise exception 'VET_RATE_LIMIT';end if;
 select coalesce(array_agg(x),'{}') into ids from public.vet_match_horses(p_name,p_owner,p_registration,p_microchip) x;
 insert into public.vet_horse_searches(certificate_id,issuer_id,actor_id,criteria) values(c.id,c.issuer_id,public.current_profile_id(),
 jsonb_build_object('name',btrim(p_name),'owner',btrim(p_owner),'registration',btrim(p_registration),'microchip',btrim(p_microchip))) returning id into receipt;
 perform public.vet_audit(c.issuer_id,'horse_search',c.id,jsonb_build_object('search_id',receipt));
 return jsonb_build_object('search_id',receipt,'results',public.vet_candidate_results(c.issuer_id,ids),'more_matches',cardinality(ids)>10);
end $$;
create function public.vet_create_searched_horse(p_certificate uuid,p_search uuid,p_owner_first text,p_owner_last text,p_owner_email text default '',p_reviewed_matches text default '',p_difference_reason text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates;s public.vet_horse_searches; ids uuid[];fingerprint text;own uuid;owners integer;h uuid;sel uuid;reg uuid;chip uuid;linked public.vet_certificates;begin
 select * into c from public.vet_certificates where id=p_certificate for update;perform public.vet_assert_access(c.issuer_id);
 if c.status<>'draft' then raise exception 'VET_CERTIFICATE_IMMUTABLE';end if;
 select * into s from public.vet_horse_searches where id=p_search and certificate_id=c.id and actor_id=public.current_profile_id() and expires_at>now() and consumed_at is null for update;
 if not found then raise exception 'VET_SEARCH_REQUIRED';end if;
 if length(btrim(s.criteria->>'name'))<2 or coalesce(length(btrim(p_owner_first)),0)<1 or coalesce(length(btrim(p_owner_last)),0)<1 then raise exception 'VET_IDENTITY_REQUIRED';end if;
 if public.vet_name_key(concat_ws(' ',p_owner_first,p_owner_last))<>public.vet_name_key(s.criteria->>'owner') then raise exception 'VET_SEARCH_AGAIN';end if;
 if nullif(btrim(p_owner_email),'') is not null and p_owner_email !~ '^[^@[:space:]<>]+@[^@[:space:]<>]+\.[^@[:space:]<>]+$' then raise exception 'VET_OWNER_EMAIL_INVALID';end if;
 -- Serialize veterinary creation, including no-email and concurrent identical searches.
 perform pg_advisory_xact_lock(hashtextextended('vet-horse-create',0));
 select coalesce(array_agg(x),'{}') into ids from public.vet_match_horses(s.criteria->>'name',s.criteria->>'owner',s.criteria->>'registration',s.criteria->>'microchip') x;
 fingerprint:=encode(extensions.digest(ids::text,'sha256'),'hex');
 if cardinality(ids)>0 and (p_reviewed_matches is distinct from fingerprint or coalesce(length(btrim(p_difference_reason)),0)<10) then
  return jsonb_build_object('needs_confirmation',true,'reviewed_matches',fingerprint,'results',public.vet_candidate_results(c.issuer_id,ids),'more_matches',cardinality(ids)>10);
 end if;
 -- A shared microchip is never overridden. Unknown registration authorities require manual resolution.
 if exists(select 1 from public.horse_external_identifiers x where x.horse_id=any(ids) and x.status not in ('revoked','inactive') and
  ((x.identifier_type='microchip' and x.normalized_identifier_value=nullif(s.criteria->>'microchip','')) or
   (x.identifier_type='registration' and x.normalized_identifier_value=upper(nullif(s.criteria->>'registration',''))))) then raise exception 'VET_DUPLICATE_IDENTIFIER';end if;
 if nullif(btrim(p_owner_email),'') is not null then
  perform pg_advisory_xact_lock(hashtextextended('vet-owner:'||lower(btrim(p_owner_email)),0));
  select count(*),(array_agg(id))[1] into owners,own from public.contacts where lower(btrim(email))=lower(btrim(p_owner_email));
  if owners>1 or (own is not null and not exists(select 1 from public.contacts where id=own and public.vet_name_key(concat_ws(' ',first_name,middle_name,last_name))=public.vet_name_key(s.criteria->>'owner'))) then raise exception 'VET_OWNER_REVIEW_REQUIRED';end if;
 end if;
 if own is null then insert into public.contacts(type,first_name,last_name,email,created_by_user_id,linked_user_id)
  values('owner',btrim(p_owner_first),btrim(p_owner_last),nullif(lower(btrim(p_owner_email)),''),null,null) returning id into own;end if;
 insert into public.horses(name,primary_owner_contact_id,created_by_user_id,registration_status) values(s.criteria->>'name',own,null,case when nullif(s.criteria->>'registration','') is null then 'unknown' else 'registered' end) returning id into h;
 insert into public.horse_contacts(horse_id,contact_id,role) values(h,own,'owner');
 if nullif(s.criteria->>'registration','') is not null then
  select id into reg from public.external_credential_issuers where code='HSP_DECLARED_REGISTRATION';
  insert into public.horse_external_identifiers(horse_id,external_credential_issuer_id,identifier_type,identifier_value,status) values(h,reg,'registration',s.criteria->>'registration','pending');end if;
 if nullif(s.criteria->>'microchip','') is not null then
  select id into chip from public.external_credential_issuers where code='HSP_DECLARED_MICROCHIP';
  insert into public.horse_external_identifiers(horse_id,external_credential_issuer_id,identifier_type,identifier_value,status) values(h,chip,'microchip',s.criteria->>'microchip','pending');end if;
 insert into public.vet_horse_selections(issuer_id,actor_id,horse_id,identity_snapshot,method) values(c.issuer_id,public.current_profile_id(),h,public.vet_horse_snapshot(h),'created') returning id into sel;
 linked:=public.vet_link_horse(c.id,sel,true);
 update public.vet_horse_searches set consumed_at=now() where id=s.id;
 perform public.vet_audit(c.issuer_id,'horse_created',h,jsonb_build_object('search_id',s.id,'difference_reason',p_difference_reason));
 return jsonb_build_object('certificate',to_jsonb(linked));
end $$;
revoke all on function public.vet_match_horses(text,text,text,text),public.vet_candidate_results(uuid,uuid[]),public.vet_search_horse_candidates(uuid,text,text,text,text),public.vet_create_searched_horse(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.vet_search_horse_candidates(uuid,text,text,text,text),public.vet_create_searched_horse(uuid,uuid,text,text,text,text,text) to authenticated;
