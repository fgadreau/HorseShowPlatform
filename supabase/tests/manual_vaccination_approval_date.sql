\set ON_ERROR_STOP on
begin;
update public.horse_documents set status='pending_review', document_url='80000000-0000-0000-0000-000000000001/DEMO.pdf', horse_name='Automatic reading error',horse_date_of_birth='1990-01-01',test_or_administered_on=current_date-interval '2 years' where id='82000000-0000-0000-0000-000000000002';
insert into public.directory_horses(id,organization_discipline_id,horse_id,source,created_by_user_id) values('84000000-0000-0000-0000-000000000098','33000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001','manual','20000000-0000-0000-0000-000000000006') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select public.set_organization_health_policy('30000000-0000-0000-0000-000000000001',current_date,jsonb_build_object('coggins_required',false,'influenza_required',true,'rhino_required',true,'vaccine_validity_months',12,'combo_vaccine_accepted',true,'identity_validation_requirement','verified','association_review_required',true,'enforcement_mode','blocking'));
select public.create_horse_document_validation('82000000-0000-0000-0000-000000000002',jsonb_build_object('status','mismatch','source','external_api','comparison_profile','health_document_horse','extracted_horse_name','Automatic reading error','horse_identity_snapshot',jsonb_build_object('name','Phase One Whiz'),'comparison_result',jsonb_build_object('verdict','mismatch'),'evidence','[]'::jsonb,'source_payload',jsonb_build_object('provider','DEMO unreadable certificate'),'warnings','[]'::jsonb,'verdict','mismatch','score',0,'confidence','weak'));
reset role;
create temp table manual_vaccine_before as select 'horses' as kind,md5(string_agg(to_jsonb(h)::text,'' order by id)) as fingerprint from public.horses h union all select 'documents',md5(string_agg(to_jsonb(d)::text,'' order by id)) from public.horse_documents d union all select 'validations',md5(string_agg(to_jsonb(v)::text,'' order by id)) from public.horse_document_validations v;
set local role authenticated;
select public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','approved',current_date);
do $$ declare r record; begin
 select * into r from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date);
 if r.compliance_status<>'compliant' or not r.can_proceed or r.requirements->'influenza'->>'manual_association_approval'<>'true' then raise exception 'Explicit human decision must work despite automatic interpretation failure: %',row_to_json(r);end if;
 if r.requirements->'influenza'->>'test_or_administered_on'<>current_date::text then raise exception 'Use the association-entered date for its own compliance';end if;
 if not exists(select 1 from public.organization_health_document_reviews where horse_document_id='82000000-0000-0000-0000-000000000002' and review_method='manual_association' and vaccination_administered_on=current_date and reviewed_by_user_id='20000000-0000-0000-0000-000000000003') then raise exception 'Human source, date and actor must be audited';end if;
 raise notice 'ok - manual association decision and date work without interpreting certificate identity';
end $$;
-- The same horse is visible to B; A decision/date must not propagate there.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
select public.set_organization_health_policy('30000000-0000-0000-0000-000000000002',current_date,jsonb_build_object('coggins_required',false,'influenza_required',true,'rhino_required',true,'vaccine_validity_months',12,'combo_vaccine_accepted',true,'identity_validation_requirement','verified','association_review_required',true,'enforcement_mode','blocking'));
do $$ declare r record; begin
 select * into r from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002',current_date);
 if r.compliance_status='compliant' or r.can_proceed or coalesce((r.requirements->'influenza'->>'manual_association_approval')::boolean,false) then raise exception 'Manual decision must remain association-scoped: %',row_to_json(r);end if;
 raise notice 'ok - other associations retain original evidence and dates';
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$begin
 begin perform public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','approved',null);raise exception 'Expected date required';exception when invalid_parameter_value then null;end;
 begin perform public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','approved',current_date+1);raise exception 'Expected future date rejected';exception when invalid_parameter_value then null;end;
 if (select max(version) from public.organization_health_document_reviews where horse_document_id='82000000-0000-0000-0000-000000000002')<>1 then raise exception 'Invalid dates must not record a decision';end if;
end $$;
select public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','rejected',null);
do $$ declare r record;begin
 select * into r from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date);
 if r.can_proceed or not(r.reasons @> '[{"code":"health.influenza.review_rejected"}]'::jsonb) then raise exception 'Latest refusal must replace approval';end if;
end $$;
select public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','approved',(current_date-interval '2 years')::date);
do $$ declare r record;begin
 select * into r from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date);
 if r.can_proceed or not(r.reasons @> '[{"code":"health.influenza.expired"}]'::jsonb) then raise exception 'Human approval must not extend validity';end if;
 raise notice 'ok - dated manual approval still respects expiry';
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
do $$begin
 begin perform public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','approved',current_date);raise exception 'Expected staff only';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if exists(select * from manual_vaccine_before except (select 'horses',md5(string_agg(to_jsonb(h)::text,'' order by id)) from public.horses h union all select 'documents',md5(string_agg(to_jsonb(d)::text,'' order by id)) from public.horse_documents d union all select 'validations',md5(string_agg(to_jsonb(v)::text,'' order by id)) from public.horse_document_validations v)) then raise exception 'Horse, certificate fields and machine identity history must remain unchanged';end if;
 if has_function_privilege('anon','public.review_vaccination_document(uuid,uuid,text,date)','execute') then raise exception 'Anonymous decisions forbidden';end if;
 raise notice 'ok - no global identity/date rewrite and no anonymous access';
end $$;
rollback;
