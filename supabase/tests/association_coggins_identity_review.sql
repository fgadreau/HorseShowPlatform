\set ON_ERROR_STOP on
-- Run on a disposable/local database or in this rolled-back transaction with:
-- psql -v org_id=... -v doc_id=... -v staff_uid=... -v member_uid=... -f <this file>
-- The fixture must be a Coggins attached to a horse in the supplied association,
-- with a policy requiring Coggins. staff_uid/member_uid are auth user IDs.
begin;
select set_config('test.coggins_org', :'org_id', true);
select set_config('test.coggins_doc', :'doc_id', true);
select set_config('test.coggins_staff', :'staff_uid', true);
select set_config('test.coggins_member', :'member_uid', true);
update public.horse_documents set status='pending_review', result='Negative',
  verification_source='gvl_qr', test_or_administered_on=current_date,
  document_url=coalesce(document_url,'DEMO-certificate.pdf'),
  warnings=array['HORSE_NAME_MISMATCH']
where id=current_setting('test.coggins_doc')::uuid;
create temp table coggins_review_original as
select md5(to_jsonb(h)::text) as horse, md5(to_jsonb(d)::text) as document,
  (select md5(coalesce(string_agg(to_jsonb(v)::text,'' order by v.id),'')) from public.horse_document_validations v where v.horse_document_id=d.id) as validations
from public.horse_documents d join public.horses h on h.id=d.horse_id
where d.id=current_setting('test.coggins_doc')::uuid;
create temp table coggins_other_scope as
select p.organization_id,r.requirements from
 (select organization_id from public.organization_health_policies where organization_id<>current_setting('test.coggins_org')::uuid and effective_from<=current_date and (effective_until is null or effective_until>=current_date) limit 1) p
cross join lateral public.evaluate_horse_health_compliance((select horse_id from public.horse_documents where id=current_setting('test.coggins_doc')::uuid),p.organization_id,current_date) r;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.coggins_staff'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.coggins_staff'),'role','authenticated')::text,true);
select public.review_coggins_document(current_setting('test.coggins_org')::uuid,current_setting('test.coggins_doc')::uuid,'approved','DEMO: coquille du nom, identité vérifiée sur les autres caractéristiques.');
do $$ declare r record; d public.horse_documents%rowtype; begin
 select * into d from public.horse_documents where id=current_setting('test.coggins_doc')::uuid;
 select * into r from public.get_horse_health_compliance(d.horse_id,current_setting('test.coggins_org')::uuid,current_date);
 if r.requirements->'coggins'->>'status'<>'valid' or r.requirements->'coggins'->>'manual_association_approval'<>'true' then raise exception 'Expected local identity override: %',row_to_json(r); end if;
 if not exists(select 1 from public.organization_health_document_reviews where horse_document_id=d.id and organization_id=current_setting('test.coggins_org')::uuid and review_method='manual_coggins' and reviewed_by_user_id=public.current_profile_id() and coggins_document_updated_at=d.updated_at and length(review_notes)>=10) then raise exception 'Missing audit/snapshot'; end if;
 begin perform public.review_coggins_document(current_setting('test.coggins_org')::uuid,d.id,'approved','court');raise exception 'Expected mandatory reason';exception when invalid_parameter_value then null;end;
 begin perform public.review_coggins_document('00000000-0000-0000-0000-000000000099',d.id,'approved','DEMO: autre association interdite.');raise exception 'Expected association scope';exception when insufficient_privilege then null;end;
end $$;
select public.review_coggins_document(current_setting('test.coggins_org')::uuid,current_setting('test.coggins_doc')::uuid,'rejected','DEMO: la nouvelle décision retire la dérogation.');
do $$declare r record;begin
 select * into r from public.get_horse_health_compliance((select horse_id from public.horse_documents where id=current_setting('test.coggins_doc')::uuid),current_setting('test.coggins_org')::uuid,current_date);
 if r.requirements->'coggins'->>'status'<>'review_rejected' then raise exception 'Latest rejection must withdraw override';end if;
end $$;
reset role;
do $$begin
 if exists(select * from coggins_review_original except select md5(to_jsonb(h)::text),md5(to_jsonb(d)::text),(select md5(coalesce(string_agg(to_jsonb(v)::text,'' order by v.id),'')) from public.horse_document_validations v where v.horse_document_id=d.id) from public.horse_documents d join public.horses h on h.id=d.horse_id where d.id=current_setting('test.coggins_doc')::uuid) then raise exception 'Review modified global horse, document or validation history';end if;
 if exists(select * from coggins_other_scope before_scope cross join lateral public.evaluate_horse_health_compliance((select horse_id from public.horse_documents where id=current_setting('test.coggins_doc')::uuid),before_scope.organization_id,current_date) after_scope where before_scope.requirements is distinct from after_scope.requirements) then raise exception 'Decision leaked into another association';end if;
 if has_table_privilege('authenticated','public.organization_health_document_reviews','INSERT') then raise exception 'Direct inserts could bypass review RPC guards';end if;
 if has_function_privilege('anon','public.review_coggins_document(uuid,uuid,text,text)','execute') then raise exception 'Anonymous execution forbidden';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.coggins_member'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.coggins_member'),'role','authenticated')::text,true);
do $$begin
 begin perform public.review_coggins_document(current_setting('test.coggins_org')::uuid,current_setting('test.coggins_doc')::uuid,'approved','DEMO: participant ne peut pas approuver.');raise exception 'Expected staff only';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.coggins_staff'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.coggins_staff'),'role','authenticated')::text,true);
select public.review_coggins_document(current_setting('test.coggins_org')::uuid,current_setting('test.coggins_doc')::uuid,'approved','DEMO: approbation liée à la lecture actuelle seulement.');
select public.create_horse_document_validation(current_setting('test.coggins_doc')::uuid,jsonb_build_object('status','mismatch','source','external_api','comparison_profile','health_document_horse','extracted_horse_name','DEMO nouvelle lecture différente','horse_identity_snapshot',jsonb_build_object('name','DEMO'),'comparison_result',jsonb_build_object('verdict','mismatch'),'evidence','[]'::jsonb,'source_payload',jsonb_build_object('provider','DEMO'),'warnings','[]'::jsonb,'verdict','mismatch','score',0,'confidence','weak'));
do $$declare r record;begin
 select * into r from public.get_horse_health_compliance((select horse_id from public.horse_documents where id=current_setting('test.coggins_doc')::uuid),current_setting('test.coggins_org')::uuid,current_date);
 if r.requirements->'coggins'->>'manual_association_approval'='true' or r.requirements->'coggins'->>'status'='valid' then raise exception 'A new machine reading must invalidate the old identity override';end if;
end $$;
reset role;
-- Confirm that positive/unsigned/future/missing-file certificates cannot use
-- this identity override. All fixture changes are rolled back below.
do $$declare bad text;begin
 foreach bad in array array['positive','unsigned','future'] loop
  update public.horse_documents set result=case when bad='positive' then 'Positive' else 'Negative' end,
    warnings=case when bad='unsigned' then array['NOT_SIGNED'] else array['HORSE_NAME_MISMATCH'] end,
    test_or_administered_on=case when bad='future' then current_date+1 else current_date end
  where id=current_setting('test.coggins_doc')::uuid;
  perform set_config('request.jwt.claim.sub',current_setting('test.coggins_staff'),true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.coggins_staff'),'role','authenticated')::text,true);
  begin perform public.review_coggins_document(current_setting('test.coggins_org')::uuid,current_setting('test.coggins_doc')::uuid,'approved','DEMO: certificat non admissible.');raise exception 'Expected unsafe certificate refused: %',bad;exception when invalid_parameter_value then null;end;
 end loop;
end $$;
do $$declare missing_id uuid;begin
 insert into public.horse_documents(horse_id,document_category,document_type,status,verification_source,result,test_or_administered_on,created_by_user_id)
 select horse_id,'health','coggins_eia','pending_review','upload','Negative',current_date,public.current_profile_id() from public.horse_documents where id=current_setting('test.coggins_doc')::uuid returning id into missing_id;
 begin perform public.review_coggins_document(current_setting('test.coggins_org')::uuid,missing_id,'approved','DEMO: certificat joint obligatoire.');raise exception 'Expected attached certificate';exception when invalid_parameter_value then null;end;
 delete from public.horse_documents where id=missing_id;
end $$;
update public.horse_documents set result='Negative',warnings=array['HORSE_NAME_MISMATCH'],test_or_administered_on=(current_date-interval '20 years')::date where id=current_setting('test.coggins_doc')::uuid;
set local role authenticated;
select public.review_coggins_document(current_setting('test.coggins_org')::uuid,current_setting('test.coggins_doc')::uuid,'approved','DEMO: identité acceptée, validité médicale inchangée.');
do $$declare r record;begin
 select * into r from public.get_horse_health_compliance((select horse_id from public.horse_documents where id=current_setting('test.coggins_doc')::uuid),current_setting('test.coggins_org')::uuid,current_date);
 if r.requirements->'coggins'->>'status'<>'expired' then raise exception 'Override must not extend validity: %',row_to_json(r);end if;
end $$;
rollback;
