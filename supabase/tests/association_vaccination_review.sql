\set ON_ERROR_STOP on
begin;
update public.horse_documents set status='pending_review',document_url='80000000-0000-0000-0000-000000000001/DEMO-vaccine.pdf',test_or_administered_on=current_date
where id='82000000-0000-0000-0000-000000000002';
create temp table vaccine_before as select to_jsonb(h) as snapshot from public.horses h where id='80000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select public.set_organization_health_policy('30000000-0000-0000-0000-000000000001',current_date,jsonb_build_object('coggins_required',false,'influenza_required',true,'rhino_required',true,'vaccine_validity_months',12,'combo_vaccine_accepted',true,'identity_validation_requirement','identified','association_review_required',false,'enforcement_mode','blocking'));
select public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','approved');
do $$ declare r record; begin
 select * into r from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date);
 if r.compliance_status<>'compliant' or not r.can_proceed then raise exception 'Reviewed current vaccine must satisfy ordinary identified policy: %',row_to_json(r); end if;
 if not exists(select 1 from public.organization_health_document_reviews where horse_document_id='82000000-0000-0000-0000-000000000002' and status='approved' and reviewed_by_user_id='20000000-0000-0000-0000-000000000003') then raise exception 'Review actor must be recorded'; end if;
 if not exists(select 1 from public.horse_document_validations where horse_document_id='82000000-0000-0000-0000-000000000002' and status='identified' and source='manual') then raise exception 'Name-only manual review must be identified, not fabricated verified identity'; end if;
 raise notice 'ok - open/approve creates audited association decision and manual identification atomically';
end $$;
select public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','rejected');
do $$ declare r record; begin
 select * into r from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date);
 if r.can_proceed or not (r.reasons @> '[{"code":"health.influenza.review_rejected"}]'::jsonb) then raise exception 'Explicit rejection must apply even when routine association review optional: %',row_to_json(r);end if;
 raise notice 'ok - rejection affects only association compliance and cannot silently pass';
end $$;
select public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','approved');
do $$ begin
 if (select count(*) from public.horse_document_validations where horse_document_id='82000000-0000-0000-0000-000000000002')<>1 then raise exception 'Re-review must preserve prior identity evidence';end if;
 if (select max(version) from public.organization_health_document_reviews where horse_document_id='82000000-0000-0000-0000-000000000002')<>3 then raise exception 'Review decisions must retain every version';end if;
end $$;
select public.set_organization_health_policy('30000000-0000-0000-0000-000000000001',current_date,jsonb_build_object('identity_validation_requirement','verified'));
do $$ declare r record;begin
 select * into r from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date);
 if r.can_proceed or r.compliance_status<>'pending_review' then raise exception 'Approval must not bypass stricter verified-identity policy';end if;
 raise notice 'ok - stronger identity policies remain enforced';
end $$;
reset role;
update public.horse_documents set test_or_administered_on=current_date-interval '2 years' where id='82000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$ declare r record;begin
 select * into r from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date);
 if r.can_proceed or not (r.reasons @> '[{"code":"health.influenza.expired"}]'::jsonb) then raise exception 'Approval must not extend expired vaccination';end if;
 raise notice 'ok - approval never extends vaccination dates';
end $$;
reset role;
update public.horse_documents set test_or_administered_on=null where id='82000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$ declare r record;begin
 select * into r from public.get_horse_health_compliance('80000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',current_date);
 if r.can_proceed or not (r.reasons @> '[{"code":"health.influenza.missing_date"}]'::jsonb) then raise exception 'Approval must not invent missing vaccination date';end if;
end $$;
-- Owner and unrelated association cannot record this association decision.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
do $$begin
 begin perform public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','approved');raise exception 'Expected owner forbidden';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$begin
 begin perform public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000004','approved');raise exception 'Expected unrelated document forbidden';exception when insufficient_privilege then null;end;
 begin perform public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','approved');raise exception 'Expected Coggins forbidden';exception when invalid_parameter_value then null;end;
end $$;
reset role;
update public.horse_documents set horse_name='A different horse' where id='82000000-0000-0000-0000-000000000002';
set local role authenticated;
do $$begin
 begin perform public.review_vaccination_document('30000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','approved');raise exception 'Expected identity mismatch';exception when invalid_parameter_value then null;end;
 if (select max(version) from public.organization_health_document_reviews where horse_document_id='82000000-0000-0000-0000-000000000002')<>3 then raise exception 'Failed approval must not create a decision';end if;
end $$;
reset role;
do $$begin
 if (select snapshot from vaccine_before)<>(select to_jsonb(h) from public.horses h where id='80000000-0000-0000-0000-000000000001') then raise exception 'Review must never edit horse';end if;
 if has_function_privilege('anon','public.review_vaccination_document(uuid,uuid,text)','execute') then raise exception 'Anonymous review forbidden';end if;
 raise notice 'ok - actor, association, certificate type, horse identity and atomic failure guards';
end $$;
rollback;
