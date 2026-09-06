-- Preserve the document evaluator (including Coggins/GVL) and its existing callers.
-- Clone the legacy implementation, preserving the original evaluator OID for existing dependencies.
do $$ begin
 execute replace(pg_get_functiondef('public.evaluate_horse_health_compliance(uuid,uuid,date)'::regprocedure),
  'FUNCTION public.evaluate_horse_health_compliance(', 'FUNCTION public.evaluate_document_health_compliance(');
end $$;
revoke all on function public.evaluate_document_health_compliance(uuid,uuid,date) from public,anon,authenticated;

create function public.vet_evaluate_vaccinations(p_horse uuid,p_date date default current_date,p_months integer default null)
returns jsonb language sql stable security definer set search_path='' as $$
 with assessed as (
 select v.*,c.status certificate_status,
 case when p_months is null then v.valid_until else least(v.valid_until,(v.administered_on+make_interval(months=>p_months))::date) end expires_on,
 case when c.status in ('revoked','superseded') then c.status
 when c.status<>'issued' then 'pending_verification'
 when v.administered_on>coalesce(p_date,current_date) then 'future_date'
 when v.valid_until is null then 'incomplete'
 when v.valid_until<coalesce(p_date,current_date) or (p_months is not null and (v.administered_on+make_interval(months=>p_months))::date<coalesce(p_date,current_date)) then 'expired'
 else 'valid' end assessment
 from public.horse_vaccinations v join public.vet_certificates c on c.id=v.certificate_id
 where v.horse_id=p_horse
 ), best as (
 select d.code,a.* from (values('influenza'),('ehv_1'),('ehv_4')) d(code)
 left join lateral (select * from assessed a where a.disease=d.code order by
 case a.assessment when 'valid' then 0 when 'incomplete' then 1 when 'expired' then 2 when 'future_date' then 3 else 4 end,
 a.administered_on desc,a.id limit 1) a on true
 ) select jsonb_object_agg(code,jsonb_build_object('status',coalesce(assessment,'missing'),'reason',coalesce(assessment,'missing'),
 'certificate_id',certificate_id,'vaccination_id',id,'administered_on',administered_on,'valid_until',expires_on,'certificate_status',certificate_status)) from best
$$;
revoke all on function public.vet_evaluate_vaccinations(uuid,date,integer) from public,anon,authenticated;

create function public.vet_get_certificate_health(p_certificate uuid,p_date date default current_date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.vet_certificates;begin
 select * into c from public.vet_certificates where id=p_certificate;
 if not public.vet_has_access(c.issuer_id) then raise exception 'VET_ACCESS_DENIED' using errcode='42501';end if;
 return public.vet_evaluate_vaccinations(c.horse_id,p_date,null);
end $$;
revoke all on function public.vet_get_certificate_health(uuid,date) from public,anon;
grant execute on function public.vet_get_certificate_health(uuid,date) to authenticated;

create or replace function public.evaluate_horse_health_compliance(p_horse_id uuid,p_organization_id uuid,p_reference_date date default current_date)
returns table(horse_id uuid,organization_id uuid,reference_date date,policy_id uuid,policy_effective_from date,compliance_status text,can_proceed boolean,enforcement_mode text,requirements jsonb,reasons jsonb)
language plpgsql stable security definer set search_path='' as $$
declare base record;pol public.organization_health_policies;vacc jsonb;key text;item jsonb;v_status text;has_source boolean;begin
 select * into base from public.evaluate_document_health_compliance(p_horse_id,p_organization_id,p_reference_date);
 -- Exact compatibility when the horse has no veterinary history.
 if not exists(select 1 from public.horse_vaccinations v where v.horse_id=p_horse_id) then
 return query select base.horse_id,base.organization_id,base.reference_date,base.policy_id,base.policy_effective_from,base.compliance_status,base.can_proceed,base.enforcement_mode,base.requirements,base.reasons;return;
 end if;
 select * into pol from public.organization_health_policies where id=base.policy_id;
 vacc:=public.vet_evaluate_vaccinations(p_horse_id,coalesce(p_reference_date,current_date),pol.vaccine_validity_months);
 requirements:=base.requirements;
 foreach key in array array['influenza','rhino'] loop
  item:=requirements->key;
  if (item->>'required')::boolean and item->>'status'<>'valid' then
   has_source:=case when key='influenza' then vacc#>>'{influenza,certificate_id}' is not null else vacc#>>'{ehv_1,certificate_id}' is not null or vacc#>>'{ehv_4,certificate_id}' is not null end;
   if has_source then
    v_status:=case when key='influenza' then vacc#>>'{influenza,status}'
    when vacc#>>'{ehv_1,status}'='valid' and vacc#>>'{ehv_4,status}'='valid' then 'valid'
    when vacc#>>'{ehv_1,status}'='expired' or vacc#>>'{ehv_4,status}'='expired' then 'expired'
    else 'missing' end;
    if v_status='valid' and pol.identity_validation_requirement='verified' then v_status:='identity_pending';end if;
    if v_status='valid' and pol.association_review_required then v_status:='review_pending';end if;
    if v_status in ('revoked','superseded') then v_status:='rejected';end if;
    if v_status in ('incomplete','pending_verification') then v_status:='missing_date';end if;
    -- A usable existing document is never displaced; preserve pending review over unusable evidence.
    if v_status in ('valid','identity_pending','review_pending') or item->>'status' in ('missing','expired','rejected','missing_date','future_date') then
     requirements:=jsonb_set(requirements,array[key],item||jsonb_build_object('status',v_status,'source_type','vet_certificate','sources',case when key='influenza' then jsonb_build_object('influenza',vacc->'influenza') else jsonb_build_object('ehv_1',vacc->'ehv_1','ehv_4',vacc->'ehv_4') end));
    end if;
   end if;
  end if;
 end loop;
 requirements:=requirements||jsonb_build_object('vaccination_diseases',vacc);
 select case when bool_and(not (x.value->>'required')::boolean) then 'not_required'
 when bool_and(x.value->>'status' in ('valid','not_required')) then 'compliant'
 when bool_or(x.value->>'status' in ('missing','missing_date','future_date','expired','rejected','identity_mismatch','review_rejected')) then 'non_compliant'
 else 'pending_review' end into compliance_status
 from jsonb_each(requirements) x where x.key in ('coggins','influenza','rhino');
 select coalesce(jsonb_agg(jsonb_build_object('code','health.'||x.key||'.'||(x.value->>'status'),'requirement',x.key,'status',x.value->>'status','sources',x.value->'sources','document_id',x.value->'document_id','expires_on',x.value->'expires_on')),'[]') into reasons
 from jsonb_each(requirements) x where x.key in ('coggins','influenza','rhino') and (x.value->>'required')::boolean and x.value->>'status'<>'valid';
 horse_id:=base.horse_id;organization_id:=base.organization_id;reference_date:=base.reference_date;policy_id:=base.policy_id;policy_effective_from:=base.policy_effective_from;enforcement_mode:=base.enforcement_mode;
 can_proceed:=compliance_status in ('compliant','not_required') or enforcement_mode='warning';return next;
end $$;
revoke all on function public.evaluate_horse_health_compliance(uuid,uuid,date) from public,anon,authenticated;

-- Horse dossier projection: source evidence without clinic membership or owner coordinates.
create function public.get_horse_vaccination_history(p_horse uuid) returns setof jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_access_horse(p_horse) then raise exception 'VET_HORSE_ACCESS_DENIED' using errcode='42501';end if;
 return query select to_jsonb(v)||jsonb_build_object('certificate_number',c.number,'certificate_status',c.status,
 'veterinarian_name',c.snapshot#>>'{practitioner,name}','permit_number',c.snapshot#>>'{practitioner,permit_number}','issuer_name',c.snapshot#>>'{issuer,name}')
 from public.horse_vaccinations v join public.vet_certificates c on c.id=v.certificate_id where v.horse_id=p_horse order by v.administered_on desc,v.id;
end $$;
revoke all on function public.get_horse_vaccination_history(uuid) from public,anon;
grant execute on function public.get_horse_vaccination_history(uuid) to authenticated;
