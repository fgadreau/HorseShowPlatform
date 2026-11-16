begin;
alter table public.incentive_program_nominations
 add column nominator_name text check(nominator_name is null or (length(btrim(nominator_name)) between 1 and 200));

-- A nomination belongs to a horse and a program, independently of season/role.
-- Refuse unexpected historical duplicates rather than discarding nominations.
do $$declare constraint_name text;begin
 if exists(select 1 from public.incentive_program_nominations group by incentive_program_id,horse_id having count(*)>1) then
  raise exception 'NOMINATION_DUPLICATES_REQUIRE_REVIEW';
 end if;
 select conname into constraint_name from pg_constraint
 where conrelid='public.incentive_program_nominations'::regclass and contype='u'
 and pg_get_constraintdef(oid)='UNIQUE (incentive_program_id, horse_id, season_year, nomination_role)';
 if constraint_name is null then raise exception 'NOMINATION_UNIQUENESS_CONTRACT_CHANGED';end if;
 execute format('alter table public.incentive_program_nominations drop constraint %I',constraint_name);
end $$;
alter table public.incentive_program_nominations add constraint incentive_program_horse_nomination_key unique(incentive_program_id,horse_id);

-- Preserve a stored nominator when a CSV omits the column or leaves it blank.
-- Reimporting a different year updates the one existing nomination.
do $$declare source text;begin
 select pg_get_functiondef('public.import_incentive_program_nominations(uuid,jsonb)'::regprocedure) into source;
 source:=replace(source,E'\r\n',E'\n');
 if position('on conflict (incentive_program_id, horse_id, season_year, nomination_role)' in source)=0 then raise exception 'NOMINATION_IMPORT_CONTRACT_CHANGED';end if;
 source:=replace(source,'on conflict (incentive_program_id, horse_id, season_year, nomination_role)','on conflict (incentive_program_id, horse_id)');
 source:=replace(source,'        notes,
        metadata,','        notes,
        nominator_name,
        metadata,');
 source:=replace(source,'        nullif(btrim(row_data ->> ''notes''), ''''),','        nullif(btrim(row_data ->> ''notes''), ''''),
        nullif(btrim(row_data ->> ''nominator_name''), ''''),');
 source:=replace(source,'        notes = excluded.notes,','        notes = excluded.notes,
        nominator_name = coalesce(excluded.nominator_name, incentive_program_nominations.nominator_name),');
 source:=replace(source,'target_program.valid_from, make_date(target_season, 1, 1)','target_program.valid_from');
 source:=replace(source,'target_program.valid_until, make_date(target_season, 12, 31)','target_program.valid_until');
 if position('nominator_name = coalesce' in source)=0 or position('        nominator_name,' in source)=0 then raise exception 'NOMINATOR_IMPORT_CONTRACT_CHANGED';end if;
 execute source;
end $$;

create function public.get_presentation_draw(p_block uuid,p_source text default 'auto') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 b public.blocks;s public.shows;o public.organizations;pub public.block_draw_publications;
 raw_runs jsonb;source text;version integer;reference_date date;r jsonb;ordinal bigint;
 h public.horses;target_horse uuid;entry_id uuid;class_ids uuid[];class_labels jsonb;programs jsonb;rows jsonb:='[]';
begin
 select * into b from public.blocks where id=p_block;
 if public.current_profile_id() is null or b.id is null or not coalesce(
 public.is_platform_admin() or public.is_org_member(b.organization_id,array['admin','secretary']) or public.has_show_role(b.show_id,array['secretary']),false)
 then raise exception 'PRESENTATION_DRAW_FORBIDDEN' using errcode='42501';end if;
 if p_source is null or p_source not in ('auto','generated','published') then raise exception 'PRESENTATION_DRAW_INVALID_SOURCE';end if;
 select * into s from public.shows where id=b.show_id;
 select * into o from public.organizations where id=b.organization_id;
 select dp.* into pub from public.block_draw_publications dp where dp.block_id=b.id and dp.superseded_at is null order by dp.version desc limit 1;
 source:=case when p_source='auto' then case when pub.id is not null then 'published' else 'generated' end else p_source end;
 if source='published' then
  if pub.id is null then raise exception 'PRESENTATION_DRAW_NOT_PUBLISHED';end if;
  raw_runs:=pub.runs;version:=pub.version;
 else
  select runs into raw_runs from public.show_score_block_setups where block_id=b.id;
  version:=b.draw_version;
 end if;
 if coalesce(version,0)=0 or jsonb_typeof(raw_runs) is distinct from 'array' or jsonb_array_length(raw_runs)=0 then raise exception 'PRESENTATION_DRAW_NOT_READY';end if;
 reference_date:=coalesce((select day_date from public.show_days where id=b.show_day_id),s.start_date);
 for r,ordinal in select value,ordinality from jsonb_array_elements(raw_runs) with ordinality loop
  target_horse:=null;entry_id:=null;h:=null;
  if r->>'horseId' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then target_horse:=(r->>'horseId')::uuid;end if;
  if r->>'entryId' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then entry_id:=(r->>'entryId')::uuid;end if;
  if target_horse is null then select e.horse_id into target_horse from public.entries e join public.classes c on c.id=e.class_id where e.id=entry_id and c.block_id=b.id and e.organization_id=b.organization_id;end if;
  -- A stored draw must never expose a different association's horse profile.
  select horse.* into h from public.horses horse where horse.id=target_horse and exists(
   select 1 from public.directory_horses dh join public.organization_disciplines d on d.id=dh.organization_discipline_id
   where dh.horse_id=horse.id and d.organization_id=b.organization_id);
  select coalesce(array_agg(c.id order by c.sort_order,c.id),'{}'::uuid[]) into class_ids
  from public.classes c where c.block_id=b.id and c.organization_id=b.organization_id and (
   case when jsonb_typeof(r->'divisionIds')='array' then r->'divisionIds' ? c.id::text
   else exists(select 1 from public.entries e where e.class_id=c.id and e.horse_id=target_horse and (
    (jsonb_typeof(r->'entryIds')='array' and r->'entryIds' ? e.id::text) or e.id=entry_id)) end);
  if jsonb_typeof(r->'divisionNames')='array' and jsonb_array_length(r->'divisionNames')>0 then class_labels:=r->'divisionNames';
  else select coalesce(jsonb_agg(concat_ws(' - ',nullif(c.code,''),c.name) order by c.sort_order,c.id),'[]') into class_labels from public.classes c where c.id=any(class_ids);end if;
  select coalesce(jsonb_agg(jsonb_build_object('name_fr',p.name_fr,'name_en',p.name_en,'nominator_name',n.nominator_name) order by p.name_fr,p.id),'[]') into programs
  from public.incentive_program_nominations n join public.incentive_programs p on p.id=n.incentive_program_id
  left join public.incentive_program_nominations stallion on stallion.id=n.qualifying_stallion_nomination_id
  where h.id is not null and n.horse_id=h.id and n.organization_id=b.organization_id and p.organization_id=b.organization_id
   and n.nomination_role in ('horse','foal') and n.status='active' and p.is_active
   and (n.valid_from is null or n.valid_from<=reference_date) and (n.valid_until is null or n.valid_until>=reference_date)
   and (p.valid_from is null or p.valid_from<=reference_date) and (p.valid_until is null or p.valid_until>=reference_date)
   and (p.program_type in ('horse_foal_nomination','performance_incentive') or (
    stallion.incentive_program_id=p.id and stallion.nomination_role='stallion' and stallion.status='active'
    and (stallion.valid_from is null or stallion.valid_from<=reference_date) and (stallion.valid_until is null or stallion.valid_until>=reference_date)))
   and exists(select 1 from public.eligibility_requirements req where req.organization_id=b.organization_id and req.is_active and req.is_required
    and req.requirement_type='program_nomination' and req.incentive_program_id=p.id and (
     (req.scope_type='class' and req.class_id=any(class_ids)) or (req.scope_type='block' and req.block_id=b.id)
     or (req.scope_type='organization_discipline' and req.organization_discipline_id in (select organization_discipline_id from public.classes where id=any(class_ids)))));
  rows:=rows||jsonb_build_array(jsonb_build_object(
   'id',coalesce(r->>'blockRunId',r->>'runId',r->>'id',ordinal::text),'draw',coalesce(r->>'draw',r->>'order',ordinal::text),
   'back_number',coalesce(r->>'backNumber',r->>'back_number'),'horse_name',coalesce(nullif(r->>'horse',''),nullif(r->>'horseName',''),h.name),
   'rider_name',coalesce(r->>'rider',r->>'riderName'),'sire_name',h.sire_name,'dam_name',h.dam_name,
   'birth_year',coalesce(h.birth_year,extract(year from h.date_of_birth)::integer),'classes',class_labels,'programs',programs,
   'scratch',lower(coalesce(r->>'status','')) in ('scratch','scratched')));
 end loop;
 return jsonb_build_object('source',source,'version',version,'generated_version',b.draw_version,'published_version',pub.version,
  'generated_at',statement_timestamp(),'reference_date',reference_date,'organization',jsonb_build_object('name',o.name,'logo_url',o.logo_url),
  'show_name',s.name,'block',jsonb_build_object('id',b.id,'name',coalesce(b.display_label,b.name),'arena',b.arena),'rows',rows);
end $$;
revoke all on function public.get_presentation_draw(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_presentation_draw(uuid,text) to authenticated;
commit;
