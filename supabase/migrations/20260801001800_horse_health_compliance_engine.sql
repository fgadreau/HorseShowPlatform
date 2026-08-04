-- Bloc 3 / S6: calcul central de conformite par cheval, association et date.
-- Le resultat est calcule a la demande a partir de la politique versionnee,
-- des documents globaux, de leur identification et des revisions locales.
-- Impact ShowScore: SS-0. Aucun objet, passage, score, resultat ou payload n'est modifie.

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
        when assessment.test_or_administered_on is null then 'missing_date'
        when assessment.test_or_administered_on > target_date then 'future_date'
        when assessment.document_status = 'expired' or assessment.expires_on < target_date then 'expired'
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

revoke all on function public.evaluate_horse_health_compliance(uuid, uuid, date) from public, anon, authenticated;

comment on function public.evaluate_horse_health_compliance(uuid, uuid, date) is
  'Internal pure health compliance evaluator. It is not granted to client roles; public access goes through get_horse_health_compliance.';

create or replace function public.get_horse_health_compliance(
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
  horse_is_in_organization boolean;
begin
  select exists (
    select 1
    from public.directory_horses directory_horse
    join public.organization_disciplines organization_discipline
      on organization_discipline.id = directory_horse.organization_discipline_id
    where directory_horse.horse_id = p_horse_id
      and organization_discipline.organization_id = p_organization_id
  ) into horse_is_in_organization;

  if not public.is_platform_admin() and not horse_is_in_organization then
    raise exception 'HSP_HEALTH_COMPLIANCE_FORBIDDEN'
      using errcode = 'insufficient_privilege';
  end if;

  if not (
    public.is_platform_admin()
    or public.can_manage_horse_identity(p_horse_id)
    or public.is_org_member(p_organization_id)
  ) then
    raise exception 'HSP_HEALTH_COMPLIANCE_FORBIDDEN'
      using errcode = 'insufficient_privilege';
  end if;

  return query
  select *
  from public.evaluate_horse_health_compliance(
    p_horse_id,
    p_organization_id,
    p_reference_date
  );
end;
$$;

revoke all on function public.get_horse_health_compliance(uuid, uuid, date) from public, anon;
grant execute on function public.get_horse_health_compliance(uuid, uuid, date) to authenticated;

comment on function public.get_horse_health_compliance(uuid, uuid, date) is
  'Authorized public wrapper around the internal explainable health compliance evaluator.';
