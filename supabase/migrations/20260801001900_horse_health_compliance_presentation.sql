-- Bloc 3 / S7: lecture groupee de la conformite sante pour les interfaces.
-- Le calcul demeure exclusivement dans get_horse_health_compliance(); cette
-- fonction ne fait que selectionner les couples cheval-association autorises.
-- Impact ShowScore: SS-0. Aucun objet, passage, score, resultat ou payload n'est modifie.

create or replace function public.list_horse_health_compliance(
  p_horse_ids uuid[] default null,
  p_organization_id uuid default null,
  p_reference_date date default current_date
)
returns table (
  horse_id uuid,
  organization_id uuid,
  organization_name text,
  organization_short_name text,
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
begin
  if p_organization_id is null
    and (p_horse_ids is null or cardinality(p_horse_ids) = 0)
  then
    raise exception 'HSP_HEALTH_COMPLIANCE_SCOPE_REQUIRED'
      using errcode = 'invalid_parameter_value';
  end if;

  if coalesce(cardinality(p_horse_ids), 0) > 100 then
    raise exception 'HSP_HEALTH_COMPLIANCE_SCOPE_TOO_LARGE'
      using errcode = 'program_limit_exceeded';
  end if;

  return query
  with authorized_pairs as (
    select distinct
      directory_horse.horse_id,
      organization_discipline.organization_id
    from public.directory_horses directory_horse
    join public.organization_disciplines organization_discipline
      on organization_discipline.id = directory_horse.organization_discipline_id
    where (p_organization_id is null or organization_discipline.organization_id = p_organization_id)
      and (p_horse_ids is null or directory_horse.horse_id = any(p_horse_ids))
      and (
        public.is_platform_admin()
        or public.can_manage_horse_identity(directory_horse.horse_id)
        or public.is_org_member(organization_discipline.organization_id)
      )
  )
  select
    pair.horse_id,
    pair.organization_id,
    organization.name::text,
    organization.short_name::text,
    compliance.reference_date,
    compliance.policy_id,
    compliance.policy_effective_from,
    compliance.compliance_status,
    compliance.can_proceed,
    compliance.enforcement_mode,
    compliance.requirements,
    compliance.reasons
  from authorized_pairs pair
  join public.organizations organization
    on organization.id = pair.organization_id
  cross join lateral public.get_horse_health_compliance(
    pair.horse_id,
    pair.organization_id,
    coalesce(p_reference_date, current_date)
  ) compliance
  order by organization.name, pair.horse_id;
end;
$$;

revoke all on function public.list_horse_health_compliance(uuid[], uuid, date) from public, anon;
grant execute on function public.list_horse_health_compliance(uuid[], uuid, date) to authenticated;

comment on function public.list_horse_health_compliance(uuid[], uuid, date) is
  'Lists authorized horse-association compliance results for presentation while delegating every health decision to the central engine.';
