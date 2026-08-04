-- Bloc 3 / S5: politiques de sante propres a chaque association.
-- Une politique ne depend ni d'une discipline, ni d'une classe, ni d'un organisme sportif.
-- Les revisions d'association sont separees du document global et de son identification.
-- Impact ShowScore: SS-0. Aucun objet, passage, score, resultat ou payload n'est modifie.

create table public.organization_health_policies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  effective_from date not null,
  effective_until date,
  coggins_required boolean not null default true,
  coggins_validity_rule text not null default 'rolling_months'
    check (coggins_validity_rule in ('rolling_months', 'calendar_year')),
  coggins_validity_months smallint not null default 12
    check (coggins_validity_months between 1 and 36),
  influenza_required boolean not null default true,
  rhino_required boolean not null default true,
  combo_vaccine_accepted boolean not null default true,
  vaccine_validity_months smallint not null default 6
    check (vaccine_validity_months between 1 and 36),
  identity_validation_requirement text not null default 'identified'
    check (identity_validation_requirement in ('none', 'identified', 'verified')),
  association_review_required boolean not null default false,
  enforcement_mode text not null default 'blocking'
    check (enforcement_mode in ('warning', 'blocking')),
  notes text,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  updated_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, effective_from),
  check (effective_until is null or effective_until >= effective_from)
);

create index organization_health_policies_effective_idx
  on public.organization_health_policies (organization_id, effective_from desc, effective_until);

create trigger organization_health_policies_touch_updated_at
before update on public.organization_health_policies
for each row execute function public.touch_updated_at();

create or replace function public.organization_health_policy_at(
  target_organization_id uuid,
  target_reference_date date default current_date
)
returns public.organization_health_policies
language sql
stable
security definer
set search_path = public
as $$
  select policy.*
  from public.organization_health_policies policy
  where policy.organization_id = target_organization_id
    and policy.effective_from <= coalesce(target_reference_date, current_date)
    and (
      policy.effective_until is null
      or policy.effective_until >= coalesce(target_reference_date, current_date)
    )
  order by policy.effective_from desc
  limit 1
$$;

create or replace function public.set_organization_health_policy(
  p_organization_id uuid,
  p_effective_from date,
  p_policy jsonb
)
returns public.organization_health_policies
language plpgsql
security definer
set search_path = public
as $$
declare
  target_effective_from date := coalesce(p_effective_from, current_date);
  current_policy public.organization_health_policies%rowtype;
  same_day_policy public.organization_health_policies%rowtype;
  next_effective_from date;
  saved_policy public.organization_health_policies%rowtype;
  actor_profile_id uuid := public.current_profile_id();
begin
  if not (
    public.is_platform_admin()
    or public.is_org_member(p_organization_id, array['admin', 'secretary'])
  ) then
    raise exception 'HSP_HEALTH_POLICY_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  if actor_profile_id is null then
    raise exception 'A user profile is required to configure a health policy'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(coalesce(p_policy, '{}'::jsonb)) <> 'object' then
    raise exception 'Health policy payload must be an object'
      using errcode = 'invalid_parameter_value';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_policy, '{}'::jsonb)) key
    where key not in (
      'coggins_required', 'coggins_validity_rule', 'coggins_validity_months',
      'influenza_required', 'rhino_required', 'combo_vaccine_accepted',
      'vaccine_validity_months', 'identity_validation_requirement',
      'association_review_required', 'enforcement_mode', 'notes'
    )
  ) then
    raise exception 'Health policy contains an unsupported field'
      using errcode = 'invalid_parameter_value';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text, 5));

  select * into current_policy
  from public.organization_health_policies policy
  where policy.organization_id = p_organization_id
    and policy.effective_from <= target_effective_from
    and (policy.effective_until is null or policy.effective_until >= target_effective_from)
  order by policy.effective_from desc
  limit 1
  for update;

  select * into same_day_policy
  from public.organization_health_policies policy
  where policy.organization_id = p_organization_id
    and policy.effective_from = target_effective_from
  for update;

  select min(policy.effective_from) into next_effective_from
  from public.organization_health_policies policy
  where policy.organization_id = p_organization_id
    and policy.effective_from > target_effective_from;

  if same_day_policy.id is not null then
    if target_effective_from < current_date then
      raise exception 'HSP_HEALTH_POLICY_HISTORY_IMMUTABLE'
        using errcode = 'check_violation';
    end if;

    update public.organization_health_policies policy
    set coggins_required = coalesce((p_policy->>'coggins_required')::boolean, policy.coggins_required),
        coggins_validity_rule = coalesce(nullif(p_policy->>'coggins_validity_rule', ''), policy.coggins_validity_rule),
        coggins_validity_months = coalesce((p_policy->>'coggins_validity_months')::smallint, policy.coggins_validity_months),
        influenza_required = coalesce((p_policy->>'influenza_required')::boolean, policy.influenza_required),
        rhino_required = coalesce((p_policy->>'rhino_required')::boolean, policy.rhino_required),
        combo_vaccine_accepted = coalesce((p_policy->>'combo_vaccine_accepted')::boolean, policy.combo_vaccine_accepted),
        vaccine_validity_months = coalesce((p_policy->>'vaccine_validity_months')::smallint, policy.vaccine_validity_months),
        identity_validation_requirement = coalesce(nullif(p_policy->>'identity_validation_requirement', ''), policy.identity_validation_requirement),
        association_review_required = coalesce((p_policy->>'association_review_required')::boolean, policy.association_review_required),
        enforcement_mode = coalesce(nullif(p_policy->>'enforcement_mode', ''), policy.enforcement_mode),
        notes = case when p_policy ? 'notes' then nullif(btrim(p_policy->>'notes'), '') else policy.notes end,
        updated_by_user_id = actor_profile_id
    where policy.id = same_day_policy.id
    returning * into saved_policy;

    return saved_policy;
  end if;

  if current_policy.id is not null and current_policy.effective_from < target_effective_from then
    update public.organization_health_policies
    set effective_until = target_effective_from - 1,
        updated_by_user_id = actor_profile_id
    where id = current_policy.id;
  end if;

  insert into public.organization_health_policies (
    organization_id,
    effective_from,
    effective_until,
    coggins_required,
    coggins_validity_rule,
    coggins_validity_months,
    influenza_required,
    rhino_required,
    combo_vaccine_accepted,
    vaccine_validity_months,
    identity_validation_requirement,
    association_review_required,
    enforcement_mode,
    notes,
    created_by_user_id,
    updated_by_user_id
  ) values (
    p_organization_id,
    target_effective_from,
    case when next_effective_from is null then null else next_effective_from - 1 end,
    coalesce((p_policy->>'coggins_required')::boolean, current_policy.coggins_required, true),
    coalesce(nullif(p_policy->>'coggins_validity_rule', ''), current_policy.coggins_validity_rule, 'rolling_months'),
    coalesce((p_policy->>'coggins_validity_months')::smallint, current_policy.coggins_validity_months, 12),
    coalesce((p_policy->>'influenza_required')::boolean, current_policy.influenza_required, true),
    coalesce((p_policy->>'rhino_required')::boolean, current_policy.rhino_required, true),
    coalesce((p_policy->>'combo_vaccine_accepted')::boolean, current_policy.combo_vaccine_accepted, true),
    coalesce((p_policy->>'vaccine_validity_months')::smallint, current_policy.vaccine_validity_months, 6),
    coalesce(nullif(p_policy->>'identity_validation_requirement', ''), current_policy.identity_validation_requirement, 'identified'),
    coalesce((p_policy->>'association_review_required')::boolean, current_policy.association_review_required, false),
    coalesce(nullif(p_policy->>'enforcement_mode', ''), current_policy.enforcement_mode, 'blocking'),
    case when p_policy ? 'notes' then nullif(btrim(p_policy->>'notes'), '') else current_policy.notes end,
    actor_profile_id,
    actor_profile_id
  )
  returning * into saved_policy;

  return saved_policy;
end;
$$;

create or replace function public.ensure_default_organization_health_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_health_policies (
    organization_id,
    effective_from,
    coggins_required,
    coggins_validity_rule,
    coggins_validity_months,
    influenza_required,
    rhino_required,
    combo_vaccine_accepted,
    vaccine_validity_months,
    identity_validation_requirement,
    association_review_required,
    enforcement_mode,
    created_by_user_id,
    updated_by_user_id
  ) values (
    new.id,
    '1900-01-01',
    coalesce(new.health_verification_required, true),
    'rolling_months',
    coalesce(new.coggins_validity_months, 12),
    coalesce(new.health_verification_required, true),
    coalesce(new.health_verification_required, true),
    true,
    coalesce(new.coggins_validity_months, 12),
    'identified',
    false,
    'blocking',
    new.created_by_user_id,
    new.created_by_user_id
  )
  on conflict (organization_id, effective_from) do nothing;

  return new;
end;
$$;

create trigger organizations_create_default_health_policy
after insert on public.organizations
for each row execute function public.ensure_default_organization_health_policy();

insert into public.organization_health_policies (
  organization_id,
  effective_from,
  coggins_required,
  coggins_validity_rule,
  coggins_validity_months,
  influenza_required,
  rhino_required,
  combo_vaccine_accepted,
  vaccine_validity_months,
  identity_validation_requirement,
  association_review_required,
  enforcement_mode,
  created_by_user_id,
  updated_by_user_id
)
select
  organization.id,
  '1900-01-01',
  coalesce(organization.health_verification_required, true),
  'rolling_months',
  coalesce(organization.coggins_validity_months, 12),
  coalesce(organization.health_verification_required, true),
  coalesce(organization.health_verification_required, true),
  true,
  coalesce(organization.coggins_validity_months, 12),
  'identified',
  false,
  'blocking',
  organization.created_by_user_id,
  organization.created_by_user_id
from public.organizations organization
on conflict (organization_id, effective_from) do nothing;

create table public.organization_health_document_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  horse_document_id uuid not null references public.horse_documents(id) on delete cascade,
  health_policy_id uuid references public.organization_health_policies(id) on delete set null,
  version integer not null check (version > 0),
  status text not null check (status in ('approved', 'rejected')),
  review_notes text,
  reviewed_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, horse_document_id, version)
);

create index organization_health_document_reviews_latest_idx
  on public.organization_health_document_reviews (organization_id, horse_document_id, version desc);

create or replace function public.create_organization_health_document_review(
  p_organization_id uuid,
  p_horse_document_id uuid,
  p_status text,
  p_review_notes text default null
)
returns public.organization_health_document_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  document_horse_id uuid;
  active_policy_id uuid;
  next_version integer;
  saved_review public.organization_health_document_reviews%rowtype;
begin
  if p_status not in ('approved', 'rejected') then
    raise exception 'Health document review status must be approved or rejected'
      using errcode = 'invalid_parameter_value';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_org_member(p_organization_id, array['admin', 'secretary'])
  ) then
    raise exception 'HSP_HEALTH_REVIEW_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;

  select document.horse_id into document_horse_id
  from public.horse_documents document
  where document.id = p_horse_document_id;

  if document_horse_id is null then
    raise exception 'Horse document not found' using errcode = 'no_data_found';
  end if;

  if not exists (
    select 1
    from public.directory_horses directory_horse
    join public.organization_disciplines organization_discipline
      on organization_discipline.id = directory_horse.organization_discipline_id
    where directory_horse.horse_id = document_horse_id
      and organization_discipline.organization_id = p_organization_id
  ) then
    raise exception 'Horse is not in this association directory'
      using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_horse_document_id::text, 6));

  select policy.id into active_policy_id
  from public.organization_health_policy_at(p_organization_id, current_date) policy;

  select coalesce(max(review.version), 0) + 1 into next_version
  from public.organization_health_document_reviews review
  where review.organization_id = p_organization_id
    and review.horse_document_id = p_horse_document_id;

  insert into public.organization_health_document_reviews (
    organization_id,
    horse_document_id,
    health_policy_id,
    version,
    status,
    review_notes,
    reviewed_by_user_id
  ) values (
    p_organization_id,
    p_horse_document_id,
    active_policy_id,
    next_version,
    p_status,
    nullif(btrim(p_review_notes), ''),
    public.current_profile_id()
  )
  returning * into saved_review;

  return saved_review;
end;
$$;

alter table public.organization_health_policies enable row level security;
alter table public.organization_health_document_reviews enable row level security;

create policy "Health policies are readable"
  on public.organization_health_policies for select
  to anon, authenticated
  using (true);

create policy "Authorized users view association health reviews"
  on public.organization_health_document_reviews for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id)
    or exists (
      select 1
      from public.horse_documents document
      where document.id = horse_document_id
        and public.can_manage_horse_identity(document.horse_id)
    )
  );

revoke all on public.organization_health_policies from anon, authenticated;
grant select on public.organization_health_policies to anon, authenticated;

revoke all on public.organization_health_document_reviews from anon, authenticated;
grant select on public.organization_health_document_reviews to authenticated;

revoke all on function public.organization_health_policy_at(uuid, date) from public;
grant execute on function public.organization_health_policy_at(uuid, date) to anon, authenticated;

revoke all on function public.set_organization_health_policy(uuid, date, jsonb) from public, anon;
grant execute on function public.set_organization_health_policy(uuid, date, jsonb) to authenticated;

revoke all on function public.create_organization_health_document_review(uuid, uuid, text, text) from public, anon;
grant execute on function public.create_organization_health_document_review(uuid, uuid, text, text) to authenticated;

comment on table public.organization_health_policies is
  'Versioned association health requirements independent from disciplines, classes and governing bodies.';
comment on table public.organization_health_document_reviews is
  'Immutable association-specific document reviews that never alter the global horse document or another association decision.';
