begin;

alter table public.organization_health_document_reviews
  drop constraint organization_health_document_reviews_review_method_check,
  add constraint organization_health_document_reviews_review_method_check
    check (review_method is null or review_method in ('manual_association','manual_coggins')),
  add column coggins_validation_id uuid references public.horse_document_validations(id),
  add column coggins_document_updated_at timestamptz;

create or replace function public.review_coggins_document(
  p_organization_id uuid, p_horse_document_id uuid, p_status text, p_reason text
)
returns public.organization_health_document_reviews
language plpgsql security definer set search_path=public
as $$
declare
  document public.horse_documents%rowtype;
  policy_id uuid;
  validation_id uuid;
  next_version integer;
  saved public.organization_health_document_reviews%rowtype;
begin
  if public.current_profile_id() is null or not (public.is_platform_admin() or public.is_org_member(p_organization_id,array['admin','secretary'])) then
    raise exception 'HSP_HEALTH_REVIEW_FORBIDDEN' using errcode='42501';
  end if;
  select * into document from public.horse_documents where id=p_horse_document_id for share;
  if document.id is null or document.document_category<>'health' or document.document_type<>'coggins_eia' then
    raise exception 'COGGINS_DOCUMENT_REQUIRED' using errcode='22023';
  end if;
  if not exists(select 1 from public.directory_horses dh join public.organization_disciplines od on od.id=dh.organization_discipline_id where dh.horse_id=document.horse_id and od.organization_id=p_organization_id and od.is_active) then
    raise exception 'HSP_HEALTH_REVIEW_FORBIDDEN' using errcode='42501';
  end if;
  if p_status is null or p_status not in ('approved','rejected') then
    raise exception 'COGGINS_REVIEW_STATUS_REQUIRED' using errcode='22023';
  end if;
  if length(btrim(coalesce(p_reason,'')))<10 or length(p_reason)>2000 then
    raise exception 'COGGINS_REVIEW_REASON_REQUIRED' using errcode='22023';
  end if;
  if p_status='approved' and (
    nullif(btrim(document.document_url),'') is null
    or lower(btrim(coalesce(document.result,'')))<>'negative'
    or document.status in ('rejected','expired')
    or document.test_or_administered_on is null
    or document.test_or_administered_on>current_date
    or document.test_or_administered_on<date '1900-01-01'
    or document.warnings && array['NOT_EIA_DOCUMENT','NOT_SIGNED','VOIDED','NOT_NEGATIVE','MISSING_SAMPLE_DATE','FUTURE_SAMPLE_DATE']
  ) then
    raise exception 'COGGINS_NEGATIVE_CERTIFICATE_REQUIRED' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||':'||p_horse_document_id::text,6));
  select policy.id into policy_id from public.organization_health_policy_at(p_organization_id,current_date) policy;
  select candidate.id into validation_id from public.horse_document_validations candidate
    where candidate.horse_document_id=document.id and candidate.status not in ('superseded','invalidated')
    order by candidate.version desc limit 1;
  select coalesce(max(version),0)+1 into next_version from public.organization_health_document_reviews
    where organization_id=p_organization_id and horse_document_id=p_horse_document_id;
  insert into public.organization_health_document_reviews(
    organization_id,horse_document_id,health_policy_id,version,status,reviewed_by_user_id,
    review_method,review_notes,coggins_validation_id,coggins_document_updated_at
  ) values (
    p_organization_id,p_horse_document_id,policy_id,next_version,p_status,public.current_profile_id(),
    'manual_coggins',btrim(p_reason),validation_id,document.updated_at
  ) returning * into saved;
  return saved;
end;
$$;
revoke all on function public.review_coggins_document(uuid,uuid,text,text) from public,anon;
grant execute on function public.review_coggins_document(uuid,uuid,text,text) to authenticated;

create or replace function public.evaluate_horse_health_compliance(
  p_horse_id uuid,
  p_organization_id uuid,
  p_reference_date date default current_date
)
returns table (
  horse_id uuid,
  organization_id uuid,
  reference_date date,
  policy_id uuid,
  policy_effective_from date,
  compliance_status text,
  can_proceed boolean,
  enforcement_mode text,
  requirements jsonb,
  reasons jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_date date := coalesce(p_reference_date, current_date);
  active_policy public.organization_health_policies%rowtype;
begin
  select * into active_policy
  from public.organization_health_policy_at(p_organization_id, target_date);

  if active_policy.id is null then
    raise exception 'HSP_HEALTH_POLICY_NOT_FOUND' using errcode = 'no_data_found';
  end if;

  return query
  with document_assessments as (
    select
      document.id as document_id,
      document.document_type,
      document.status as document_status,
      document.verification_source,
      document.result,
      coalesce(manual_review.administered_on,document.test_or_administered_on) as test_or_administered_on,
      manual_review.approved as manual_association_approval,
      case
        when document.document_type = 'coggins_eia'
          and active_policy.coggins_validity_rule = 'calendar_year'
          then make_date(extract(year from document.test_or_administered_on)::integer, 12, 31)
        when document.document_type = 'coggins_eia'
          then (document.test_or_administered_on + make_interval(months => active_policy.coggins_validity_months))::date
        else (coalesce(manual_review.administered_on,document.test_or_administered_on) + make_interval(months => active_policy.vaccine_validity_months))::date
      end as expires_on,
      validation.id as validation_id,
      validation.status as validation_status,
      validation.verdict as validation_verdict,
      review.id as review_id,
      review.status as review_status,
      review.review_method
    from public.horse_documents document
    left join lateral (
      select candidate.id, candidate.status, candidate.verdict
      from public.horse_document_validations candidate
      where candidate.horse_document_id = document.id
        and candidate.status not in ('superseded', 'invalidated')
      order by candidate.version desc
      limit 1
    ) validation on true
    left join lateral (
      select candidate.id, candidate.status, candidate.review_method, candidate.vaccination_administered_on, candidate.coggins_validation_id, candidate.coggins_document_updated_at
      from public.organization_health_document_reviews candidate
      where candidate.organization_id = p_organization_id
        and candidate.horse_document_id = document.id
      order by candidate.version desc
      limit 1
    ) review on true
    cross join lateral (
      select coalesce(
        (document.document_type in ('combo_vaccine','influenza_vaccine','rhino_vaccine')
          and review.status='approved' and review.review_method='manual_association')
        or (document.document_type='coggins_eia' and review.status='approved'
          and review.review_method='manual_coggins' and lower(btrim(document.result))='negative'
          and not (document.warnings && array['NOT_EIA_DOCUMENT','NOT_SIGNED','VOIDED','NOT_NEGATIVE','MISSING_SAMPLE_DATE','FUTURE_SAMPLE_DATE'])
          and review.coggins_validation_id is not distinct from validation.id
          and review.coggins_document_updated_at=document.updated_at),false) as approved,
        case when document.document_type in ('combo_vaccine','influenza_vaccine','rhino_vaccine')
          and review.status='approved' and review.review_method='manual_association'
          then review.vaccination_administered_on end as administered_on
    ) manual_review
    where document.horse_id = p_horse_id
      and document.document_category = 'health'
      and document.document_type in (
        'coggins_eia', 'influenza_vaccine', 'rhino_vaccine', 'combo_vaccine'
      )
  ),
  expanded_assessments as (
    select
      mapped.requirement_code,
      assessment.*,
      case
        when assessment.document_status = 'rejected' then 'rejected'
        when assessment.document_type='coggins_eia'
          and lower(btrim(assessment.result)) in ('positive','positive/reactor','reactor') then 'rejected'
        when assessment.review_status='rejected' then 'review_rejected'
        when assessment.test_or_administered_on is null then 'missing_date'
        when assessment.test_or_administered_on > target_date then 'future_date'
        when assessment.document_status = 'expired' or assessment.expires_on < target_date then 'expired'
        when assessment.document_type = 'coggins_eia'
          and assessment.document_status = 'pending_review'
          and assessment.verification_source in ('gvl_qr', 'gvl_url', 'gvl_api')
          and not assessment.manual_association_approval
          and (assessment.review_status is distinct from 'approved' or assessment.review_method='manual_coggins') then 'review_pending'
        -- Explicit human acceptance for this association; no global identity rewrite.
        when assessment.manual_association_approval then 'valid'
        when active_policy.identity_validation_requirement = 'verified'
          and coalesce(assessment.validation_status, '') <> 'verified'
          then case
            when assessment.validation_status in ('mismatch', 'rejected') then 'identity_mismatch'
            else 'identity_pending'
          end
        when active_policy.identity_validation_requirement = 'identified'
          and coalesce(assessment.validation_status, '') not in ('identified', 'verified')
          then case
            when assessment.validation_status in ('mismatch', 'rejected') then 'identity_mismatch'
            else 'identity_pending'
          end
        when active_policy.association_review_required
          and coalesce(assessment.review_status, '') <> 'approved'
          then case
            when assessment.review_status = 'rejected' then 'review_rejected'
            else 'review_pending'
          end
        else 'valid'
      end as assessment_status
    from document_assessments assessment
    cross join lateral (
      select requirement_code
      from (
        values
          ('coggins', assessment.document_type = 'coggins_eia'),
          (
            'influenza',
            assessment.document_type = 'influenza_vaccine'
            or (active_policy.combo_vaccine_accepted and assessment.document_type = 'combo_vaccine')
          ),
          (
            'rhino',
            assessment.document_type = 'rhino_vaccine'
            or (active_policy.combo_vaccine_accepted and assessment.document_type = 'combo_vaccine')
          )
      ) mapping(requirement_code, matches_requirement)
      where matches_requirement
    ) mapped
  ),
  policy_requirements as (
    select *
    from (
      values
        ('coggins'::text, active_policy.coggins_required),
        ('influenza'::text, active_policy.influenza_required),
        ('rhino'::text, active_policy.rhino_required)
    ) requirement(requirement_code, is_required)
  ),
  evaluated_requirements as (
    select
      requirement.requirement_code,
      requirement.is_required,
      case
        when not requirement.is_required then 'not_required'
        else coalesce(best.assessment_status, 'missing')
      end as requirement_status,
      best.document_id,
      best.document_type,
      best.document_status,
      best.test_or_administered_on,
      best.expires_on,
      best.validation_id,
      best.validation_status,
      best.validation_verdict,
      best.review_id,
      best.review_status,
      best.manual_association_approval
    from policy_requirements requirement
    left join lateral (
      select assessment.*
      from expanded_assessments assessment
      where assessment.requirement_code = requirement.requirement_code
      order by
        case assessment.assessment_status
          when 'valid' then 0
          when 'review_pending' then 1
          when 'identity_pending' then 2
          when 'expired' then 3
          when 'identity_mismatch' then 4
          when 'review_rejected' then 5
          when 'rejected' then 6
          when 'missing_date' then 7
          when 'future_date' then 8
          else 8
        end,
        assessment.expires_on desc nulls last,
        assessment.test_or_administered_on desc nulls last
      limit 1
    ) best on requirement.is_required
  ),
  summary as (
    select
      case
        when bool_and(not is_required) then 'not_required'
        when bool_and(requirement_status in ('valid', 'not_required')) then 'compliant'
        when bool_or(requirement_status in (
          'missing', 'missing_date', 'future_date', 'expired', 'rejected',
          'identity_mismatch', 'review_rejected'
        )) then 'non_compliant'
        else 'pending_review'
      end as calculated_status,
      jsonb_object_agg(
        requirement_code,
        jsonb_build_object(
          'required', is_required,
          'status', requirement_status,
          'document_id', document_id,
          'document_type', document_type,
          'document_status', document_status,
          'test_or_administered_on', test_or_administered_on,
          'expires_on', expires_on,
          'identity_validation_id', validation_id,
          'identity_validation_status', validation_status,
          'identity_validation_verdict', validation_verdict,
          'association_review_id', review_id,
          'association_review_status', review_status,
          'manual_association_approval', manual_association_approval
        ) order by requirement_code
      ) as requirement_details,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'code', format('health.%s.%s', requirement_code, requirement_status),
            'requirement', requirement_code,
            'status', requirement_status,
            'document_id', document_id,
            'expires_on', expires_on
          ) order by requirement_code
        ) filter (where is_required and requirement_status <> 'valid'),
        '[]'::jsonb
      ) as reason_details
    from evaluated_requirements
  )
  select
    p_horse_id,
    p_organization_id,
    target_date,
    active_policy.id,
    active_policy.effective_from,
    summary.calculated_status,
    summary.calculated_status in ('compliant', 'not_required')
      or active_policy.enforcement_mode = 'warning',
    active_policy.enforcement_mode,
    summary.requirement_details,
    summary.reason_details
  from summary;
end;
$$;

commit;
