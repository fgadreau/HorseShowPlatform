begin;
create function public.house_name_key(value text) returns text language sql immutable set search_path='' as $$
 select regexp_replace(translate(lower(coalesce(value,'')),'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ','aaaaaaceeeeiiiinooooouuuuyy'),'[^a-z0-9]','','g');
$$;
create table public.house_ineligibility_lists(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 name text not null check(length(btrim(name)) between 1 and 150), unique(organization_id,name)
);
create table public.house_ineligibility_editions(
 id uuid primary key default gen_random_uuid(), list_id uuid not null references public.house_ineligibility_lists(id) on delete cascade,
 season_year integer not null check(season_year between 2000 and 2200), source_name text,
 updated_at timestamptz not null default clock_timestamp(), unique(list_id,season_year)
);
create table public.house_ineligibility_people(
 id uuid primary key default gen_random_uuid(), edition_id uuid not null references public.house_ineligibility_editions(id) on delete cascade,
 rider_name text not null check(length(btrim(rider_name)) between 2 and 200),
 name_key text generated always as (public.house_name_key(rider_name)) stored,
 rider_contact_id uuid references public.contacts(id), unique(edition_id,name_key)
);
create table public.house_class_rules(
 class_template_id uuid primary key references public.class_templates(id) on delete cascade,
 require_membership boolean not null default false,
 minimum_age integer check(minimum_age between 0 and 120),maximum_age integer check(maximum_age between 0 and 120),
 age_basis text not null default 'january_1' check(age_basis in ('january_1','show_date')),
 excluded_list_ids uuid[] not null default '{}',
 nrha_reference_template_id uuid references public.class_templates(id),
 updated_at timestamptz not null default clock_timestamp(),
 check(minimum_age is null or maximum_age is null or minimum_age<=maximum_age)
);
create function public.house_rules_staff(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.current_profile_id() is not null and (public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary']));
$$;
alter table public.house_ineligibility_lists enable row level security;
alter table public.house_ineligibility_editions enable row level security;
alter table public.house_ineligibility_people enable row level security;
alter table public.house_class_rules enable row level security;
create policy staff_lists on public.house_ineligibility_lists for all to authenticated using(public.house_rules_staff(organization_id)) with check(public.house_rules_staff(organization_id));
create policy staff_editions on public.house_ineligibility_editions for all to authenticated
 using(exists(select 1 from public.house_ineligibility_lists l where l.id=list_id and public.house_rules_staff(l.organization_id)))
 with check(exists(select 1 from public.house_ineligibility_lists l where l.id=list_id and public.house_rules_staff(l.organization_id)));
create policy staff_people on public.house_ineligibility_people for all to authenticated
 using(exists(select 1 from public.house_ineligibility_editions e join public.house_ineligibility_lists l on l.id=e.list_id where e.id=edition_id and public.house_rules_staff(l.organization_id)))
 with check(exists(select 1 from public.house_ineligibility_editions e join public.house_ineligibility_lists l on l.id=e.list_id where e.id=edition_id and public.house_rules_staff(l.organization_id)));
create policy staff_rules on public.house_class_rules for all to authenticated
 using(exists(select 1 from public.class_templates t where t.id=class_template_id and public.house_rules_staff(t.organization_id)))
 with check(exists(select 1 from public.class_templates t where t.id=class_template_id and public.house_rules_staff(t.organization_id)));
revoke all on public.house_ineligibility_lists,public.house_ineligibility_editions,public.house_ineligibility_people,public.house_class_rules from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.house_ineligibility_lists,public.house_ineligibility_editions,public.house_ineligibility_people,public.house_class_rules to authenticated;

create function public.house_rule_scope_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare org uuid;begin
 select organization_id into org from public.class_templates where id=new.class_template_id;
 if exists(select 1 from public.class_template_governing_bodies a join public.governing_bodies b on b.id=a.governing_body_id where a.class_template_id=new.class_template_id and upper(b.code)='NRHA')
 or exists(select 1 from unnest(new.excluded_list_ids) i where not exists(select 1 from public.house_ineligibility_lists l where l.id=i and l.organization_id=org))
 or (new.nrha_reference_template_id is not null and not exists(select 1 from public.class_templates t join public.class_template_governing_bodies a on a.class_template_id=t.id join public.governing_bodies b on b.id=a.governing_body_id where t.id=new.nrha_reference_template_id and t.organization_id=org and upper(b.code)='NRHA' and a.reporting_class_code ~ '^[0-9]+$'))
 then raise exception 'HOUSE_RULE_INVALID_SCOPE';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
create trigger house_rule_scope before insert or update on public.house_class_rules for each row execute function public.house_rule_scope_guard();
create function public.house_person_scope_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.rider_contact_id is not null and not exists(select 1 from public.house_ineligibility_editions e join public.house_ineligibility_lists l on l.id=e.list_id join public.organization_disciplines d on d.organization_id=l.organization_id join public.directory_contacts dc on dc.organization_discipline_id=d.id where e.id=new.edition_id and dc.contact_id=new.rider_contact_id)
 then raise exception 'HOUSE_PERSON_OUTSIDE_DIRECTORY';end if;return new;
end $$;
create trigger house_person_scope before insert or update on public.house_ineligibility_people for each row execute function public.house_person_scope_guard();
create function public.house_edition_touch() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op<>'INSERT' then update public.house_ineligibility_editions set updated_at=clock_timestamp() where id=old.edition_id;end if;
 if tg_op<>'DELETE' then update public.house_ineligibility_editions set updated_at=clock_timestamp() where id=new.edition_id;end if;
 return null;
end $$;
create trigger house_people_touch after insert or update or delete on public.house_ineligibility_people for each row execute function public.house_edition_touch();

-- Atomically import a reviewed list. Unmatched names remain available for future riders.
create function public.import_house_ineligibility(p_edition uuid,p_rows jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare org uuid;r jsonb;n integer:=0;begin
 select l.organization_id into org from public.house_ineligibility_editions e join public.house_ineligibility_lists l on l.id=e.list_id where e.id=p_edition for update of e;
 if not coalesce(public.house_rules_staff(org),false) then raise exception 'HOUSE_LIST_FORBIDDEN' using errcode='42501';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows)>2000 then raise exception 'HOUSE_IMPORT_INVALID_ROWS';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  insert into public.house_ineligibility_people(edition_id,rider_name,rider_contact_id) values(p_edition,btrim(r->>'rider_name'),nullif(r->>'rider_contact_id','')::uuid)
  on conflict(edition_id,name_key) do update set rider_name=excluded.rider_name,rider_contact_id=excluded.rider_contact_id;
  n:=n+1;
 end loop;return n;
end $$;

create table public.house_nrha_checks(
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.classes(id) on delete cascade,
 horse_id uuid not null references public.horses(id),rider_contact_id uuid not null references public.contacts(id),
 fingerprint text not null,eligible boolean not null,reasons jsonb not null default '[]',
 checked_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default(clock_timestamp()+interval '6 hours')
);
create index house_nrha_checks_team on public.house_nrha_checks(class_id,horse_id,rider_contact_id,fingerprint,checked_at desc);
alter table public.house_nrha_checks enable row level security;
revoke all on public.house_nrha_checks from public,anon,authenticated,service_role;
grant select,insert on public.house_nrha_checks to service_role;
create table public.house_eligibility_overrides(
 id uuid primary key default gen_random_uuid(),class_id uuid not null references public.classes(id) on delete cascade,
 horse_id uuid not null references public.horses(id),rider_contact_id uuid not null references public.contacts(id),fingerprint text not null,
 reason text not null check(length(btrim(reason)) between 5 and 1000),
 actor_id uuid not null references public.user_profiles(id),created_at timestamptz not null default clock_timestamp(),
 assessment jsonb not null
);
alter table public.house_eligibility_overrides enable row level security;
revoke all on public.house_eligibility_overrides from public,anon,authenticated,service_role;
grant select on public.house_eligibility_overrides to authenticated;
create policy staff_override_audit on public.house_eligibility_overrides for select to authenticated using(exists(select 1 from public.classes c where c.id=class_id and (public.house_rules_staff(c.organization_id) or public.has_show_role(c.show_id,array['secretary']))));

create function public.house_team_authorized(p_class uuid,p_horse uuid,p_rider uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.current_profile_id() is not null and exists(select 1 from public.classes c where c.id=p_class and (
 public.house_rules_staff(c.organization_id) or public.has_show_role(c.show_id,array['secretary']) or (public.can_access_horse(p_horse) and public.can_access_contact(p_rider))));
$$;
create function public.house_nrha_parameters(p_class uuid,p_horse uuid,p_rider uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare code text;member text;license text;ref date;revision text;begin
 select a.reporting_class_code,s.start_date,r.updated_at::text into code,ref,revision
 from public.classes c join public.shows s on s.id=c.show_id join public.house_class_rules r on r.class_template_id=c.class_template_id
 join public.class_templates t on t.id=r.nrha_reference_template_id and t.organization_id=c.organization_id
 join public.class_template_governing_bodies a on a.class_template_id=t.id join public.governing_bodies b on b.id=a.governing_body_id and upper(b.code)='NRHA' where c.id=p_class;
 if code is null then return null;end if;
 select i.identifier_value into member from public.contact_external_identifiers i join public.external_credential_issuers x on x.id=i.external_credential_issuer_id and upper(x.code)='NRHA' where i.contact_id=p_rider order by i.created_at desc limit 1;
 select i.identifier_value into license from public.horse_external_identifiers i join public.external_credential_issuers x on x.id=i.external_credential_issuer_id and upper(x.code)='NRHA' where i.horse_id=p_horse and i.identifier_type='competition_license' order by i.created_at desc limit 1;
 return jsonb_build_object('classCode',code,'memberNumber',member,'competitionLicenseNumber',license,'date',ref,'fingerprint',md5(concat_ws('|',code,member,license,ref,revision)));
end $$;

-- Internal assessment: no client may read another rider's private list rows.
create function public.house_class_assessment(p_class uuid,p_horse uuid,p_rider uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.classes;s public.shows;r public.house_class_rules;birth date;age integer;at_date date;selected_list uuid;edition uuid;list_name text;
 reasons jsonb:='[]';params jsonb;check_row public.house_nrha_checks;fp text;versions text;overridden boolean;actor text;begin
 select * into c from public.classes where id=p_class;
 select * into s from public.shows where id=c.show_id;
 if c.id is null then raise exception 'HOUSE_CLASS_NOT_FOUND';end if;
 if exists(select 1 from public.class_governing_bodies a join public.governing_bodies b on b.id=a.governing_body_id where a.class_id=c.id and upper(b.code)='NRHA') then return jsonb_build_object('class_id',c.id,'applies',false,'can_proceed',true,'reasons','[]'::jsonb);end if;
 select * into r from public.house_class_rules where class_template_id=c.class_template_id;
 if exists(select 1 from public.house_class_exclusions x where x.class_template_id=c.class_template_id and x.organization_id=c.organization_id and (x.rider_contact_id=p_rider or x.horse_id=p_horse)) then reasons:=reasons||jsonb_build_array('Exclusion historique de cette classe maison.');end if;
 if r.class_template_id is null and reasons='[]'::jsonb then return jsonb_build_object('class_id',c.id,'applies',false,'can_proceed',true,'reasons',reasons);end if;
 if p_rider is null then reasons:=reasons||jsonb_build_array('Cavalier manquant.');end if;
 if r.require_membership and not exists(select 1 from public.contact_organization_memberships m where m.organization_id=c.organization_id and m.contact_id=p_rider and m.status='active' and s.start_date between m.valid_from and m.valid_until) then reasons:=reasons||jsonb_build_array('Adhésion de l’association absente ou non valide à la date du concours.');end if;
 if r.minimum_age is not null or r.maximum_age is not null then
  select date_of_birth into birth from public.contacts where id=p_rider;
  at_date:=case when r.age_basis='january_1' then make_date(extract(year from s.start_date)::integer,1,1) else s.start_date end;
  age:=extract(year from age(at_date,birth));
  if birth is null or birth>at_date then reasons:=reasons||jsonb_build_array('Date de naissance manquante ou invalide.');
  elsif (r.minimum_age is not null and age<r.minimum_age) or (r.maximum_age is not null and age>r.maximum_age) then reasons:=reasons||jsonb_build_array(format('Âge non admissible : %s ans au %s.',age,at_date));end if;
 end if;
 foreach selected_list in array coalesce(r.excluded_list_ids,'{}') loop
  select name into list_name from public.house_ineligibility_lists where id=selected_list;
  select id into edition from public.house_ineligibility_editions where house_ineligibility_editions.list_id=selected_list and season_year=extract(year from s.start_date)::integer;
  if edition is null then reasons:=reasons||jsonb_build_array(format('Liste %s non chargée pour %s.',list_name,extract(year from s.start_date)));
  elsif exists(select 1 from public.house_ineligibility_people p join public.contacts rider on rider.id=p_rider where p.edition_id=edition and (p.rider_contact_id=p_rider or (p.rider_contact_id is null and p.name_key=public.house_name_key(concat_ws(' ',rider.first_name,rider.middle_name,rider.last_name))))) then reasons:=reasons||jsonb_build_array(format('Cavalier présent dans la liste %s %s.',list_name,extract(year from s.start_date)));end if;
 end loop;
 params:=public.house_nrha_parameters(p_class,p_horse,p_rider);
 if r.nrha_reference_template_id is not null then
  if params is null or coalesce(params->>'memberNumber','')!~'^[0-9]+$' or coalesce(params->>'competitionLicenseNumber','')!~'^[0-9]+$' then reasons:=reasons||jsonb_build_array('Admissibilité NRHA non vérifiable : numéro du cavalier ou licence du cheval manquant.');
  else
   select * into check_row from public.house_nrha_checks n where n.class_id=c.id and n.horse_id=p_horse and n.rider_contact_id=p_rider and n.fingerprint=params->>'fingerprint' and n.expires_at>statement_timestamp() order by n.checked_at desc limit 1;
   if check_row.id is null then reasons:=reasons||jsonb_build_array('Vérification NRHA requise.');
   elsif not check_row.eligible then reasons:=reasons||jsonb_build_array('Non admissible à la classe NRHA de référence.')||coalesce(check_row.reasons,'[]');end if;
  end if;
 end if;
 select string_agg(e.id::text||e.updated_at::text,'|' order by e.id) into versions from public.house_ineligibility_editions e where e.list_id=any(coalesce(r.excluded_list_ids,'{}')) and e.season_year=extract(year from s.start_date)::integer;
 fp:=md5(concat_ws('|',to_jsonb(r)::text,versions,s.start_date,params::text,(select string_agg(x.id::text,'|' order by x.id) from public.house_class_exclusions x where x.class_template_id=c.class_template_id)));
 select exists(select 1 from public.house_eligibility_overrides o where o.class_id=c.id and o.horse_id=p_horse and o.rider_contact_id=p_rider and o.fingerprint=fp) into overridden;
 return jsonb_build_object('class_id',c.id,'applies',true,'can_proceed',jsonb_array_length(reasons)=0 or overridden,'reasons',reasons,'fingerprint',fp,'overridden',overridden,
 'nrha_required',r.nrha_reference_template_id is not null,'nrha_pending',r.nrha_reference_template_id is not null and check_row.id is null and coalesce(params->>'memberNumber','')~'^[0-9]+$' and coalesce(params->>'competitionLicenseNumber','')~'^[0-9]+$');
end $$;

create function public.assess_house_classes(p_org uuid,p_show uuid,p_horse uuid,p_rider uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if public.current_profile_id() is null or not exists(select 1 from public.shows where id=p_show and organization_id=p_org) or not (public.house_rules_staff(p_org) or public.has_show_role(p_show,array['secretary']) or (public.can_access_horse(p_horse) and public.can_access_contact(p_rider))) then raise exception 'HOUSE_ASSESSMENT_FORBIDDEN' using errcode='42501';end if;
 select coalesce(jsonb_agg(public.house_class_assessment(c.id,p_horse,p_rider)),'[]') into result from public.classes c where c.organization_id=p_org and c.show_id=p_show;return result;
end $$;
create function public.house_nrha_check_context(p_class uuid,p_horse uuid,p_rider uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(public.house_team_authorized(p_class,p_horse,p_rider),false) then raise exception 'HOUSE_CHECK_FORBIDDEN' using errcode='42501';end if;
 return public.house_nrha_parameters(p_class,p_horse,p_rider);
end $$;
create function public.grant_house_eligibility_override(p_class uuid,p_horse uuid,p_rider uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.classes;a jsonb;id uuid;begin
 select * into c from public.classes where classes.id=p_class;
 if public.current_profile_id() is null or not coalesce(public.house_rules_staff(c.organization_id) or public.has_show_role(c.show_id,array['secretary']),false) then raise exception 'HOUSE_OVERRIDE_FORBIDDEN' using errcode='42501';end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Une raison de 5 à 1000 caractères est obligatoire.';end if;
 a:=public.house_class_assessment(p_class,p_horse,p_rider);
 if not coalesce((a->>'applies')::boolean,false) then raise exception 'HOUSE_OVERRIDE_NOT_APPLICABLE';end if;
 insert into public.house_eligibility_overrides(class_id,horse_id,rider_contact_id,fingerprint,reason,actor_id,assessment) values(p_class,p_horse,p_rider,a->>'fingerprint',btrim(p_reason),public.current_profile_id(),a) returning house_eligibility_overrides.id into id;return id;
end $$;
create function public.enforce_annual_house_rules() returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb;begin
 if new.status in ('cancelled','scratched','scratched_pending_refund','completed') then return new;end if;
 if tg_op='UPDATE' and (new.class_id,new.horse_id,new.rider_contact_id,new.status) is not distinct from (old.class_id,old.horse_id,old.rider_contact_id,old.status) then return new;end if;
 a:=public.house_class_assessment(new.class_id,new.horse_id,new.rider_contact_id);
 if not (a->>'can_proceed')::boolean then raise exception 'HOUSE_ELIGIBILITY_BLOCKED: cavalier inéligible : %',a->'reasons' using errcode='23514';end if;return new;
end $$;
-- Replace only the old exclusion guard; the assessment preserves legacy rows and supports audited overrides.
drop trigger entries_house_class_exclusion on public.entries;
create trigger entries_annual_house_rules before insert or update of class_id,horse_id,rider_contact_id,status on public.entries for each row execute function public.enforce_annual_house_rules();
revoke all on function public.house_name_key(text),public.house_rules_staff(uuid),public.house_rule_scope_guard(),public.house_person_scope_guard(),public.house_edition_touch(),public.import_house_ineligibility(uuid,jsonb),public.house_team_authorized(uuid,uuid,uuid),public.house_nrha_parameters(uuid,uuid,uuid),public.house_class_assessment(uuid,uuid,uuid),public.assess_house_classes(uuid,uuid,uuid,uuid),public.house_nrha_check_context(uuid,uuid,uuid),public.grant_house_eligibility_override(uuid,uuid,uuid,text),public.enforce_annual_house_rules() from public,anon,authenticated,service_role;
grant execute on function public.house_name_key(text),public.house_rules_staff(uuid),public.import_house_ineligibility(uuid,jsonb),public.assess_house_classes(uuid,uuid,uuid,uuid),public.house_nrha_check_context(uuid,uuid,uuid),public.grant_house_eligibility_override(uuid,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
