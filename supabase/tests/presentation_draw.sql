-- Synthetic fixtures only; all changes roll back.
begin;
set local timezone='America/Toronto';
do $$declare
 staff uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();profile uuid;org uuid:=gen_random_uuid();discipline uuid;directory uuid:=gen_random_uuid();
 sh uuid:=gen_random_uuid();day uuid:=gen_random_uuid();bl uuid:=gen_random_uuid();h1 uuid:=gen_random_uuid();h2 uuid:=gen_random_uuid();owner uuid:=gen_random_uuid();
 c1 uuid:=gen_random_uuid();c2 uuid:=gen_random_uuid();c3 uuid:=gen_random_uuid();p1 uuid:=gen_random_uuid();p2 uuid:=gen_random_uuid();n1 uuid;
 run1 jsonb;run2 jsonb;data jsonb;result jsonb;blocked boolean;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(staff,staff||'@example.test','{}'),(outsider,outsider||'@example.test','{}');
 select id into profile from public.user_profiles where user_id=staff;
 insert into public.organizations(id,name,slug,logo_url) values(org,'Presentation TEST',org::text,'https://example.test/logo.png');
 insert into public.organization_members(organization_id,user_id,role) values(org,profile,'secretary');
 select id into discipline from public.disciplines order by id limit 1;
 insert into public.organization_disciplines(id,organization_id,discipline_id) values(directory,org,discipline);
 insert into public.contacts(id,type,first_name,last_name) values(owner,'owner','Synthetic','Owner');
 insert into public.horses(id,name,primary_owner_contact_id,sire_name,dam_name,birth_year) values(h1,'Current Horse',owner,'Test Sire','Test Dam',2021),(h2,'Missing Pedigree',owner,null,null,null);
 insert into public.directory_horses(organization_discipline_id,horse_id) values(directory,h1),(directory,h2);
 insert into public.shows(id,organization_id,name,slug,start_date,end_date) values(sh,org,'Show TEST',sh::text,'2026-11-15','2026-11-15');
 select id into day from public.show_days where show_id=sh and day_date='2026-11-15';
 insert into public.blocks(id,organization_id,show_id,show_day_id,name,entries_close_at) values(bl,org,sh,day,'Mixed block',now()-interval '1 day');
 insert into public.classes(id,organization_id,show_id,block_id,organization_discipline_id,name,sort_order) values
  (c1,org,sh,bl,directory,'Program class',1),(c2,org,sh,bl,directory,'Regular class',2),(c3,org,sh,bl,directory,'Not entered class',3);
 insert into public.incentive_programs(id,organization_id,code,name_fr,name_en,program_type) values
  (p1,org,'TEST-A','Programme A','Program A','horse_foal_nomination'),(p2,org,'TEST-B','Programme B','Program B','horse_foal_nomination');
 insert into public.incentive_program_nominations(organization_id,incentive_program_id,horse_id,nomination_role,season_year,status,nominator_name)
 values(org,p1,h1,'horse',2025,'active','Original Nominator') returning id into n1;
 insert into public.incentive_program_nominations(organization_id,incentive_program_id,horse_id,nomination_role,season_year,status,nominator_name)
 values(org,p2,h1,'horse',2026,'active','Other Nominator');
 insert into public.eligibility_requirements(organization_id,scope_type,class_id,requirement_type,subject_type,incentive_program_id,label)
 values(org,'class',c1,'program_nomination','horse',p1,'Program A'),(org,'class',c3,'program_nomination','horse',p2,'Program B');
 blocked:=false;
 begin insert into public.incentive_program_nominations(organization_id,incentive_program_id,horse_id,nomination_role,season_year,status) values(org,p1,h1,'foal',2027,'active');
 exception when unique_violation then blocked:=true;end;
 if not blocked then raise exception 'TEST duplicate nomination accepted across years/roles';end if;
 run1:=jsonb_build_object('id',gen_random_uuid(),'draw',1,'backNumber','245','horseId',h1,'horse','Published Horse Name','rider','Rider TEST','divisionIds',jsonb_build_array(c1,c2),'divisionNames',jsonb_build_array('101 - Program class','102 - Regular class'));
 run2:=jsonb_build_object('id',gen_random_uuid(),'draw',-1,'backNumber','246','horseId',h2,'horse','Missing Pedigree','rider','Rider Two','status','scratch','divisionIds',jsonb_build_array(c2),'divisionNames',jsonb_build_array('102 - Regular class'));
 perform set_config('request.jwt.claim.sub',staff::text,true);
 insert into public.show_score_block_setups(block_id,organization_id,show_id,show_day_id,runs,judges) values(bl,org,sh,day,jsonb_build_array(run2,run1),'[]');
 update public.blocks set draw_version=2,draw_prepared_at=now() where id=bl;
 insert into public.block_draw_publications(organization_id,show_id,block_id,version,runs,judges,published_by_user_id) values(org,sh,bl,1,jsonb_build_array(run1),'[]',profile);
 set local role authenticated;
 data:=public.get_presentation_draw(bl);
 if data->>'source'<>'published' or (data->>'version')::integer<>1 or jsonb_array_length(data->'rows')<>1 then raise exception 'TEST published snapshot was replaced by generated order';end if;
 if data#>>'{rows,0,horse_name}'<>'Published Horse Name' or data#>>'{rows,0,sire_name}'<>'Test Sire' or data#>>'{rows,0,dam_name}'<>'Test Dam' or data#>>'{rows,0,birth_year}'<>'2021' then raise exception 'TEST pedigree enrichment or frozen labels wrong';end if;
 if jsonb_array_length(data#>'{rows,0,classes}')<>2 or jsonb_array_length(data#>'{rows,0,programs}')<>1 or data#>>'{rows,0,programs,0,nominator_name}'<>'Original Nominator' then raise exception 'TEST class-specific program or season-independent nominator filtering wrong';end if;
 data:=public.get_presentation_draw(bl,'generated');
 if data->>'source'<>'generated' or (data->>'version')::integer<>2 or jsonb_array_length(data->'rows')<>2 or data#>>'{rows,0,draw}'<>'-1' or not (data#>>'{rows,0,scratch}')::boolean then raise exception 'TEST draft order/negative draw/scratch changed';end if;
 if data#>>'{rows,0,sire_name}' is not null or jsonb_array_length(data#>'{rows,0,programs}')<>0 then raise exception 'TEST missing information or unrelated programs leaked';end if;
 result:=public.import_incentive_program_nominations(org,jsonb_build_array(jsonb_build_object('program_code','TEST-A','horse_name','Current Horse','season_year','2027','nominator_name','Updated Nominator')));
 if (result->>'imported')::integer<>1 then raise exception 'TEST nominator import failed: %',result;end if;
 result:=public.import_incentive_program_nominations(org,jsonb_build_array(jsonb_build_object('program_code','TEST-A','horse_name','Current Horse','nominator_name','')));
 if (result->>'imported')::integer<>1 then raise exception 'TEST blank nominator reimport failed: %',result;end if;
 data:=public.get_presentation_draw(bl,'published');
 if data#>>'{rows,0,programs,0,nominator_name}'<>'Updated Nominator' then raise exception 'TEST omitted/blank CSV erased nominator';end if;
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 blocked:=false;begin perform public.get_presentation_draw(bl);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'TEST outsider accessed presentation data';end if;
 reset role;
 if (select count(*) from public.incentive_program_nominations where incentive_program_id=p1 and horse_id=h1)<>1 then raise exception 'TEST reimport duplicated nomination';end if;
 if not exists(select 1 from public.incentive_program_nominations where id=n1 and valid_until is null) then raise exception 'TEST import introduced season expiry';end if;
 if (select count(*) from public.block_draw_publications where block_id=bl)<>1 or (select draw_version from public.blocks where id=bl)<>2 then raise exception 'TEST presentation export mutated/published draw';end if;
 set local role anon;
 blocked:=false;begin perform public.get_presentation_draw(bl);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'TEST anonymous presentation access';end if;
 reset role;
end $$;
rollback;
