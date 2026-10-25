begin;

-- A document decision belongs to the association, without editing the horse,
-- dates or vaccination facts supplied by the member.
create or replace function public.review_vaccination_document(
  p_organization_id uuid, p_horse_document_id uuid, p_status text
)
returns public.organization_health_document_reviews
language plpgsql security definer set search_path=public
as $$
declare
  document public.horse_documents%rowtype;
  horse public.horses%rowtype;
  latest_validation public.horse_document_validations%rowtype;
  identity_status text;
begin
  if not (public.is_platform_admin() or public.is_org_member(p_organization_id,array['admin','secretary'])) then
    raise exception 'HSP_HEALTH_REVIEW_FORBIDDEN' using errcode='insufficient_privilege';
  end if;
  select * into document from public.horse_documents where id=p_horse_document_id for update;
  if document.id is null or document.document_category<>'health' or document.document_type not in ('combo_vaccine','influenza_vaccine','rhino_vaccine') then
    raise exception 'VACCINE_DOCUMENT_REQUIRED' using errcode='invalid_parameter_value';
  end if;
  if not exists(select 1 from public.directory_horses dh join public.organization_disciplines od on od.id=dh.organization_discipline_id where dh.horse_id=document.horse_id and od.organization_id=p_organization_id) then
    raise exception 'HSP_HEALTH_REVIEW_FORBIDDEN' using errcode='insufficient_privilege';
  end if;
  if p_status is null or p_status not in ('approved','rejected') then
    raise exception 'VACCINE_REVIEW_STATUS_REQUIRED' using errcode='invalid_parameter_value';
  end if;
  if p_status='approved' then
    if document.document_url is null or document.status in ('rejected','expired') then
      raise exception 'VACCINE_READABLE_CERTIFICATE_REQUIRED' using errcode='invalid_parameter_value';
    end if;
    select * into horse from public.horses where id=document.horse_id for share;
    if document.horse_name is not null and public.identity_search_key(document.horse_name)<>public.identity_search_key(horse.name) then
      raise exception 'VACCINE_IDENTITY_MISMATCH' using errcode='invalid_parameter_value';
    end if;
    if document.horse_date_of_birth is not null and (
      (horse.date_of_birth is not null and horse.date_of_birth<>document.horse_date_of_birth)
      or (horse.birth_year is not null and horse.birth_year<>extract(year from document.horse_date_of_birth)::integer)
    ) then
      raise exception 'VACCINE_IDENTITY_MISMATCH' using errcode='invalid_parameter_value';
    end if;
    -- Use the same document lock as the identity-versioning RPC.
    perform pg_advisory_xact_lock(hashtextextended(document.id::text,0));
    select * into latest_validation from public.horse_document_validations
    where horse_document_id=document.id and status not in ('superseded','invalidated') order by version desc limit 1;
    if latest_validation.status in ('mismatch','rejected') then
      raise exception 'VACCINE_IDENTITY_MISMATCH' using errcode='invalid_parameter_value';
    end if;
    if latest_validation.id is null then
      identity_status:=case when document.horse_date_of_birth is not null and (
        horse.date_of_birth=document.horse_date_of_birth or horse.birth_year=extract(year from document.horse_date_of_birth)::integer
      ) then 'verified' else 'identified' end;
      perform public.create_horse_document_validation(document.id,jsonb_build_object(
        'status',identity_status,'source','manual','comparison_profile','health_document_horse',
        'extracted_horse_name',coalesce(document.horse_name,horse.name),
        'extracted_date_of_birth',document.horse_date_of_birth,
        'horse_identity_snapshot',jsonb_build_object('name',horse.name,'date_of_birth',horse.date_of_birth,'birth_year',horse.birth_year),
        'comparison_result',jsonb_build_object('verdict',case when identity_status='verified' then 'match' else 'possible_match' end),
        'evidence',jsonb_build_array(jsonb_build_object('field','name','outcome','exact','reason','association_document_review')),
        'source_payload',jsonb_build_object('method','association_certificate_review','organization_id',p_organization_id,'document_type',document.document_type),
        'warnings','[]'::jsonb,'verdict',case when identity_status='verified' then 'match' else 'possible_match' end,
        'score',case when identity_status='verified' then 100 else 90 end,'confidence',case when identity_status='verified' then 'certain' else 'probable' end
      ));
    end if;
  end if;
  return public.create_organization_health_document_review(p_organization_id,p_horse_document_id,p_status,
    case when p_status='approved' then 'Certificat consulté et approuvé par l’association.' else 'Certificat consulté et refusé par l’association.' end);
end;
$$;
revoke all on function public.review_vaccination_document(uuid,uuid,text) from public,anon;
grant execute on function public.review_vaccination_document(uuid,uuid,text) to authenticated;

-- An explicit vaccine rejection applies even when routine association review is optional.
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
      document.test_or_administered_on,
      case
        when document.document_type = 'coggins_eia'
          and active_policy.coggins_validity_rule = 'calendar_year'
          then make_date(extract(year from document.test_or_administered_on)::integer, 12, 31)
        when document.document_type = 'coggins_eia'
          then (document.test_or_administered_on + make_interval(months => active_policy.coggins_validity_months))::date
        else (document.test_or_administered_on + make_interval(months => active_policy.vaccine_validity_months))::date
      end as expires_on,
      validation.id as validation_id,
      validation.status as validation_status,
      validation.verdict as validation_verdict,
      review.id as review_id,
      review.status as review_status
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
      select candidate.id, candidate.status
      from public.organization_health_document_reviews candidate
      where candidate.organization_id = p_organization_id
        and candidate.horse_document_id = document.id
      order by candidate.version desc
      limit 1
    ) review on true
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
        when assessment.document_type in ('combo_vaccine','influenza_vaccine','rhino_vaccine')
          and assessment.review_status='rejected' then 'review_rejected'
        when assessment.test_or_administered_on is null then 'missing_date'
        when assessment.test_or_administered_on > target_date then 'future_date'
        when assessment.document_status = 'expired' or assessment.expires_on < target_date then 'expired'
        when assessment.document_type = 'coggins_eia'
          and assessment.document_status = 'pending_review'
          and assessment.verification_source in ('gvl_qr', 'gvl_url', 'gvl_api')
          and coalesce(assessment.review_status, '') <> 'approved' then 'review_pending'
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
      best.review_status
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
          'association_review_status', review_status
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
