-- Configuration sportive administrable et exigences cumulatives.
-- Cette migration est strictement additive: aucune exigence existante n'est
-- activée ou rendue bloquante automatiquement.

alter table public.external_credential_issuers
  drop constraint if exists external_credential_issuers_issuer_type_check;

alter table public.external_credential_issuers
  add constraint external_credential_issuers_issuer_type_check
  check (issuer_type in (
    'provincial_territorial_sport_organization',
    'national_sport_organization',
    'breed_registry',
    'sanctioning_organization',
    'insurance_provider',
    'other'
  ));

create table public.discipline_governing_bodies (
  discipline_id uuid not null references public.disciplines(id) on delete cascade,
  governing_body_id uuid not null references public.governing_bodies(id) on delete cascade,
  is_default boolean not null default false,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (discipline_id, governing_body_id),
  check (jsonb_typeof(settings) = 'object')
);

comment on table public.discipline_governing_bodies is
  'Platform-admin catalog of sporting governing bodies compatible with a discipline.';

create table public.discipline_credential_issuers (
  discipline_id uuid not null references public.disciplines(id) on delete cascade,
  external_credential_issuer_id uuid not null references public.external_credential_issuers(id) on delete cascade,
  is_default boolean not null default false,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (discipline_id, external_credential_issuer_id),
  check (jsonb_typeof(settings) = 'object')
);

comment on table public.discipline_credential_issuers is
  'Platform-admin catalog of credential issuers available to associations using a discipline.';

create table public.organization_discipline_governing_bodies (
  organization_discipline_id uuid not null references public.organization_disciplines(id) on delete cascade,
  governing_body_id uuid not null references public.governing_bodies(id) on delete restrict,
  is_default boolean not null default false,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_discipline_id, governing_body_id),
  check (jsonb_typeof(settings) = 'object')
);

comment on table public.organization_discipline_governing_bodies is
  'Association selection and defaults among the governing bodies allowed for one active discipline.';

create or replace function public.assert_organization_discipline_governing_body_available()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.organization_disciplines directory
    join public.discipline_governing_bodies available
      on available.discipline_id = directory.discipline_id
     and available.governing_body_id = new.governing_body_id
     and available.is_active
    where directory.id = new.organization_discipline_id
      and directory.is_active
  ) then
    raise exception 'Governing body is not available for this organization discipline'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger organization_discipline_governing_bodies_assert_available
  before insert or update on public.organization_discipline_governing_bodies
  for each row execute function public.assert_organization_discipline_governing_body_available();

create table public.external_credential_products (
  id uuid primary key default gen_random_uuid(),
  external_credential_issuer_id uuid not null references public.external_credential_issuers(id) on delete cascade,
  code text not null,
  name text not null,
  credential_type text not null,
  includes_liability_insurance boolean not null default false,
  minimum_coverage_amount numeric(12,2),
  coverage_currency text,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_credential_issuer_id, code),
  check (btrim(code) <> ''),
  check (btrim(name) <> ''),
  check (credential_type in ('membership', 'license', 'registration', 'certification', 'insurance', 'other')),
  check (minimum_coverage_amount is null or minimum_coverage_amount >= 0),
  check (coverage_currency is null or coverage_currency ~ '^[A-Z]{3}$'),
  check (jsonb_typeof(settings) = 'object')
);

comment on table public.external_credential_products is
  'Platform-admin catalog of memberships, registrations and insurance products issued by an external organization.';

alter table public.contact_external_identifiers
  add column credential_product_id uuid references public.external_credential_products(id) on delete set null;

alter table public.horse_external_identifiers
  add column credential_product_id uuid references public.external_credential_products(id) on delete set null;

create table public.contact_insurance_evidence (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  external_credential_issuer_id uuid references public.external_credential_issuers(id) on delete set null,
  credential_product_id uuid references public.external_credential_products(id) on delete set null,
  policy_number text,
  provider_name text,
  valid_from date,
  expires_on date not null,
  coverage_amount numeric(12,2),
  coverage_currency text,
  document_storage_path text,
  status text not null default 'pending',
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.user_profiles(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_on >= coalesce(valid_from, expires_on)),
  check (coverage_amount is null or coverage_amount >= 0),
  check (coverage_currency is null or coverage_currency ~ '^[A-Z]{3}$'),
  check (status in ('pending', 'approved', 'expired', 'rejected', 'superseded')),
  check (jsonb_typeof(metadata) = 'object')
);

create index contact_insurance_evidence_contact_idx
  on public.contact_insurance_evidence (contact_id, expires_on desc);

comment on table public.contact_insurance_evidence is
  'Auditable rider insurance evidence used when an accepted sport-organization membership is absent.';

create table public.eligibility_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope_type text not null,
  organization_discipline_id uuid references public.organization_disciplines(id) on delete cascade,
  block_id uuid references public.blocks(id) on delete cascade,
  class_id uuid references public.classes(id) on delete cascade,
  block_template_id uuid references public.block_templates(id) on delete cascade,
  class_template_id uuid references public.class_templates(id) on delete cascade,
  requirement_type text not null,
  subject_type text not null,
  external_credential_issuer_id uuid references public.external_credential_issuers(id) on delete restrict,
  credential_product_id uuid references public.external_credential_products(id) on delete restrict,
  credential_type text,
  requirement_group_code text,
  match_rule text not null default 'all',
  validity_rule text not null default 'active_on_reference_date',
  enforcement_mode text not null default 'blocking',
  is_required boolean not null default true,
  is_active boolean not null default true,
  label text,
  settings jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope_type in ('organization_discipline', 'block', 'class', 'block_template', 'class_template')),
  check (requirement_type in ('host_membership', 'external_contact_credential', 'horse_registration', 'rider_insurance')),
  check (subject_type in ('rider', 'owner', 'horse')),
  check (credential_type is null or credential_type in ('membership', 'license', 'registration', 'certification', 'insurance', 'other')),
  check (match_rule in ('all', 'at_least_one')),
  check (validity_rule in ('present', 'active_on_reference_date')),
  check (enforcement_mode in ('warning', 'blocking')),
  check (requirement_group_code is not null or match_rule = 'all'),
  check (jsonb_typeof(settings) = 'object'),
  constraint eligibility_requirements_scope_target_check check (
    (scope_type = 'organization_discipline' and organization_discipline_id is not null and block_id is null and class_id is null and block_template_id is null and class_template_id is null)
    or (scope_type = 'block' and organization_discipline_id is null and block_id is not null and class_id is null and block_template_id is null and class_template_id is null)
    or (scope_type = 'class' and organization_discipline_id is null and block_id is null and class_id is not null and block_template_id is null and class_template_id is null)
    or (scope_type = 'block_template' and organization_discipline_id is null and block_id is null and class_id is null and block_template_id is not null and class_template_id is null)
    or (scope_type = 'class_template' and organization_discipline_id is null and block_id is null and class_id is null and block_template_id is null and class_template_id is not null)
  )
);

create index eligibility_requirements_organization_idx
  on public.eligibility_requirements (organization_id, scope_type, is_active);
create index eligibility_requirements_directory_idx
  on public.eligibility_requirements (organization_discipline_id) where organization_discipline_id is not null;
create index eligibility_requirements_block_idx
  on public.eligibility_requirements (block_id) where block_id is not null;
create index eligibility_requirements_class_idx
  on public.eligibility_requirements (class_id) where class_id is not null;
create unique index eligibility_requirements_host_membership_directory_key
  on public.eligibility_requirements (organization_discipline_id, subject_type)
  where scope_type = 'organization_discipline'
    and requirement_type = 'host_membership';

comment on table public.eligibility_requirements is
  'Association-owned requirements inherited from discipline to block and supplemented by class rules.';

create or replace function public.assert_eligibility_requirement_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_organization_id uuid;
begin
  case new.scope_type
    when 'organization_discipline' then
      select organization_id into target_organization_id from public.organization_disciplines where id = new.organization_discipline_id;
    when 'block' then
      select organization_id into target_organization_id from public.blocks where id = new.block_id;
    when 'class' then
      select organization_id into target_organization_id from public.classes where id = new.class_id;
    when 'block_template' then
      select organization_id into target_organization_id from public.block_templates where id = new.block_template_id;
    when 'class_template' then
      select organization_id into target_organization_id from public.class_templates where id = new.class_template_id;
  end case;

  if target_organization_id is null or target_organization_id <> new.organization_id then
    raise exception 'Eligibility requirement scope does not belong to organization %', new.organization_id
      using errcode = 'check_violation';
  end if;

  if new.credential_product_id is not null and not exists (
    select 1 from public.external_credential_products product
    where product.id = new.credential_product_id
      and (new.external_credential_issuer_id is null or product.external_credential_issuer_id = new.external_credential_issuer_id)
  ) then
    raise exception 'Credential product does not belong to the selected issuer'
      using errcode = 'check_violation';
  end if;

  if new.external_credential_issuer_id is not null and not exists (
    select 1
    from public.discipline_credential_issuers available
    where available.external_credential_issuer_id = new.external_credential_issuer_id
      and available.is_active
      and (
        (new.scope_type = 'organization_discipline' and exists (
          select 1 from public.organization_disciplines directory
          where directory.id = new.organization_discipline_id
            and directory.discipline_id = available.discipline_id
            and directory.is_active
        ))
        or (new.scope_type = 'class' and exists (
          select 1
          from public.classes class_record
          join public.organization_disciplines directory on directory.id = class_record.organization_discipline_id
          where class_record.id = new.class_id
            and directory.discipline_id = available.discipline_id
            and directory.is_active
        ))
        or (new.scope_type = 'block' and exists (
          select 1
          from public.classes class_record
          join public.organization_disciplines directory on directory.id = class_record.organization_discipline_id
          where class_record.block_id = new.block_id
            and directory.discipline_id = available.discipline_id
            and directory.is_active
        ))
        or (new.scope_type = 'class_template' and exists (
          select 1
          from public.class_templates class_template
          join public.organization_disciplines directory on directory.id = class_template.organization_discipline_id
          where class_template.id = new.class_template_id
            and directory.discipline_id = available.discipline_id
            and directory.is_active
        ))
        or (new.scope_type = 'block_template' and exists (
          select 1
          from public.class_templates class_template
          join public.organization_disciplines directory on directory.id = class_template.organization_discipline_id
          where class_template.block_template_id = new.block_template_id
            and directory.discipline_id = available.discipline_id
            and directory.is_active
        ))
      )
  ) then
    raise exception 'Credential issuer is not available for the requirement discipline'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger eligibility_requirements_assert_context
  before insert or update on public.eligibility_requirements
  for each row execute function public.assert_eligibility_requirement_context();

create or replace function public.evaluate_entry_eligibility_requirements(
  target_entry_id uuid,
  target_reference_date date default current_date
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with entry_context as (
    select
      entry.id as entry_id,
      entry.organization_id,
      entry.horse_id,
      entry.owner_contact_id,
      entry.rider_contact_id,
      class_record.id as class_id,
      class_record.block_id,
      class_record.organization_discipline_id
    from public.entries entry
    join public.classes class_record on class_record.id = entry.class_id
    where entry.id = target_entry_id
  ), effective_requirements as (
    select requirement.*
    from public.eligibility_requirements requirement
    cross join entry_context context
    where requirement.organization_id = context.organization_id
      and requirement.is_active
      and requirement.is_required
      and (
        (requirement.scope_type = 'organization_discipline' and requirement.organization_discipline_id = context.organization_discipline_id)
        or (requirement.scope_type = 'block' and requirement.block_id = context.block_id)
        or (requirement.scope_type = 'class' and requirement.class_id = context.class_id)
      )
  ), evaluated as (
    select
      requirement.*,
      case requirement.requirement_type
        when 'host_membership' then exists (
          select 1
          from public.contact_organization_memberships membership
          cross join entry_context context
          where membership.organization_id = context.organization_id
            and membership.contact_id = case requirement.subject_type when 'owner' then context.owner_contact_id else context.rider_contact_id end
            and membership.status = 'active'
            and (requirement.validity_rule = 'present' or target_reference_date between membership.valid_from and membership.valid_until)
        )
        when 'external_contact_credential' then exists (
          select 1
          from public.contact_external_identifiers identifier
          cross join entry_context context
          where identifier.contact_id = case requirement.subject_type when 'owner' then context.owner_contact_id else context.rider_contact_id end
            and (requirement.external_credential_issuer_id is null or identifier.external_credential_issuer_id = requirement.external_credential_issuer_id)
            and (requirement.credential_product_id is null or identifier.credential_product_id = requirement.credential_product_id)
            and (requirement.credential_type is null or identifier.identifier_type = requirement.credential_type)
            and (requirement.validity_rule = 'present' or (
              identifier.status = 'active'
              and (identifier.valid_from is null or identifier.valid_from <= target_reference_date)
              and (identifier.expires_on is null or identifier.expires_on >= target_reference_date)
            ))
        )
        when 'horse_registration' then exists (
          select 1
          from public.horse_external_identifiers identifier
          cross join entry_context context
          where identifier.horse_id = context.horse_id
            and identifier.identifier_type = 'registration'
            and (requirement.external_credential_issuer_id is null or identifier.external_credential_issuer_id = requirement.external_credential_issuer_id)
            and (requirement.credential_product_id is null or identifier.credential_product_id = requirement.credential_product_id)
            and (requirement.validity_rule = 'present' or (
              identifier.status = 'active'
              and (identifier.valid_from is null or identifier.valid_from <= target_reference_date)
              and (identifier.expires_on is null or identifier.expires_on >= target_reference_date)
            ))
        )
        when 'rider_insurance' then (
          exists (
            select 1
            from public.contact_external_identifiers identifier
            join public.external_credential_products product on product.id = identifier.credential_product_id
            cross join entry_context context
            where identifier.contact_id = context.rider_contact_id
              and product.includes_liability_insurance
              and product.is_active
              and (requirement.external_credential_issuer_id is null or identifier.external_credential_issuer_id = requirement.external_credential_issuer_id)
              and (requirement.credential_product_id is null or identifier.credential_product_id = requirement.credential_product_id)
              and (requirement.validity_rule = 'present' or (
                identifier.status = 'active'
                and (identifier.valid_from is null or identifier.valid_from <= target_reference_date)
                and (identifier.expires_on is null or identifier.expires_on >= target_reference_date)
              ))
          )
          or (
            requirement.external_credential_issuer_id is null
            and requirement.credential_product_id is null
            and exists (
              select 1
              from public.contact_insurance_evidence evidence
              cross join entry_context context
              where evidence.contact_id = context.rider_contact_id
                and evidence.status = 'approved'
                and (evidence.valid_from is null or evidence.valid_from <= target_reference_date)
                and evidence.expires_on >= target_reference_date
                and (
                  nullif(requirement.settings ->> 'minimum_coverage_amount', '') is null
                  or coalesce(evidence.coverage_amount, 0) >= (requirement.settings ->> 'minimum_coverage_amount')::numeric
                )
            )
          )
        )
        else false
      end as passed
    from effective_requirements requirement
  ), grouped as (
    select
      coalesce(requirement_group_code, id::text) as evaluation_group,
      case when match_rule = 'all' then bool_and(passed) else bool_or(passed) end as passed,
      bool_or(enforcement_mode = 'blocking') as blocking,
      jsonb_agg(jsonb_build_object(
        'id', id,
        'scope_type', scope_type,
        'requirement_type', requirement_type,
        'subject_type', subject_type,
        'label', label,
        'passed', passed,
        'enforcement_mode', enforcement_mode
      ) order by created_at) as checks
    from evaluated
    group by coalesce(requirement_group_code, id::text), match_rule
  )
  select jsonb_build_object(
    'entry_id', target_entry_id,
    'reference_date', target_reference_date,
    'can_proceed', coalesce(bool_and(passed or not blocking), true),
    'status', case
      when count(*) = 0 then 'not_required'
      when bool_and(passed) then 'compliant'
      when bool_and(passed or not blocking) then 'warning'
      else 'non_compliant'
    end,
    'groups', coalesce(jsonb_agg(jsonb_build_object(
      'code', evaluation_group,
      'passed', passed,
      'blocking', blocking,
      'checks', checks
    )), '[]'::jsonb)
  )
  from grouped;
$$;

create or replace function public.enforce_entry_eligibility_requirements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reference_date date;
  assessment jsonb;
begin
  if new.status not in ('pending_checkout', 'active', 'completed') then
    return new;
  end if;

  select coalesce(show_record.start_date, current_date)
  into reference_date
  from public.shows show_record
  where show_record.id = new.show_id;

  assessment := public.evaluate_entry_eligibility_requirements(new.id, reference_date);
  if not coalesce((assessment ->> 'can_proceed')::boolean, true) then
    raise exception 'Entry requirements are not satisfied: %', assessment
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger entries_zz_enforce_configurable_eligibility
  after insert or update of status, class_id, horse_id, owner_contact_id, rider_contact_id
  on public.entries
  for each row execute function public.enforce_entry_eligibility_requirements();

create or replace function public.copy_block_template_eligibility_requirements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.block_template_id is not null then
    insert into public.eligibility_requirements (
      organization_id, scope_type, block_id, requirement_type, subject_type,
      external_credential_issuer_id, credential_product_id, credential_type,
      requirement_group_code, match_rule, validity_rule, enforcement_mode,
      is_required, is_active, label, settings, created_by_user_id
    )
    select
      new.organization_id, 'block', new.id, requirement_type, subject_type,
      external_credential_issuer_id, credential_product_id, credential_type,
      case when requirement_group_code is null then null else requirement_group_code || ':' || new.id::text end,
      match_rule, validity_rule, enforcement_mode, is_required, is_active, label,
      settings || jsonb_build_object('copied_from_template_requirement_id', id),
      public.current_profile_id()
    from public.eligibility_requirements
    where scope_type = 'block_template'
      and block_template_id = new.block_template_id
      and is_active;
  end if;
  return new;
end;
$$;

create or replace function public.copy_class_template_eligibility_requirements()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.class_template_id is not null then
    insert into public.eligibility_requirements (
      organization_id, scope_type, class_id, requirement_type, subject_type,
      external_credential_issuer_id, credential_product_id, credential_type,
      requirement_group_code, match_rule, validity_rule, enforcement_mode,
      is_required, is_active, label, settings, created_by_user_id
    )
    select
      new.organization_id, 'class', new.id, requirement_type, subject_type,
      external_credential_issuer_id, credential_product_id, credential_type,
      case when requirement_group_code is null then null else requirement_group_code || ':' || new.id::text end,
      match_rule, validity_rule, enforcement_mode, is_required, is_active, label,
      settings || jsonb_build_object('copied_from_template_requirement_id', id),
      public.current_profile_id()
    from public.eligibility_requirements
    where scope_type = 'class_template'
      and class_template_id = new.class_template_id
      and is_active;
  end if;
  return new;
end;
$$;

create trigger blocks_copy_template_eligibility_requirements
  after insert on public.blocks
  for each row execute function public.copy_block_template_eligibility_requirements();
create trigger classes_copy_template_eligibility_requirements
  after insert on public.classes
  for each row execute function public.copy_class_template_eligibility_requirements();

create trigger discipline_governing_bodies_touch_updated_at
  before update on public.discipline_governing_bodies
  for each row execute function public.touch_updated_at();
create trigger discipline_credential_issuers_touch_updated_at
  before update on public.discipline_credential_issuers
  for each row execute function public.touch_updated_at();
create trigger organization_discipline_governing_bodies_touch_updated_at
  before update on public.organization_discipline_governing_bodies
  for each row execute function public.touch_updated_at();
create trigger external_credential_products_touch_updated_at
  before update on public.external_credential_products
  for each row execute function public.touch_updated_at();
create trigger contact_insurance_evidence_touch_updated_at
  before update on public.contact_insurance_evidence
  for each row execute function public.touch_updated_at();
create trigger eligibility_requirements_touch_updated_at
  before update on public.eligibility_requirements
  for each row execute function public.touch_updated_at();

alter table public.discipline_governing_bodies enable row level security;
alter table public.discipline_credential_issuers enable row level security;
alter table public.organization_discipline_governing_bodies enable row level security;
alter table public.external_credential_products enable row level security;
alter table public.contact_insurance_evidence enable row level security;
alter table public.eligibility_requirements enable row level security;

create or replace function public.can_review_contact_insurance_evidence(target_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.directory_contacts directory_contact
      join public.organization_disciplines directory on directory.id = directory_contact.organization_discipline_id
      where directory_contact.contact_id = target_contact_id
        and public.is_org_member(directory.organization_id, array['admin', 'secretary'])
    );
$$;

create or replace function public.assert_contact_insurance_review_authority()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  review_changed boolean;
begin
  review_changed := case
    when tg_op = 'INSERT' then new.status <> 'pending' or new.reviewed_at is not null or new.reviewed_by_user_id is not null
    else new.status is distinct from old.status
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by_user_id is distinct from old.reviewed_by_user_id
      or old.status <> 'pending'
  end;

  if review_changed and not public.can_review_contact_insurance_evidence(new.contact_id) then
    raise exception 'Only authorized association staff can review insurance evidence'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger contact_insurance_evidence_assert_review_authority
  before insert or update on public.contact_insurance_evidence
  for each row execute function public.assert_contact_insurance_review_authority();

create policy "Authenticated users view active discipline governing bodies"
  on public.discipline_governing_bodies for select to authenticated
  using (public.is_platform_admin() or is_active);
create policy "Platform admins manage discipline governing bodies"
  on public.discipline_governing_bodies for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "Authenticated users view active discipline credential issuers"
  on public.discipline_credential_issuers for select to authenticated
  using (public.is_platform_admin() or is_active);
create policy "Platform admins manage discipline credential issuers"
  on public.discipline_credential_issuers for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "Organization members view discipline governing body selections"
  on public.organization_discipline_governing_bodies for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.organization_disciplines directory
      where directory.id = organization_discipline_governing_bodies.organization_discipline_id
        and public.is_org_member(directory.organization_id)
    )
  );
create policy "Organization admins manage discipline governing body selections"
  on public.organization_discipline_governing_bodies for all to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.organization_disciplines directory
      where directory.id = organization_discipline_governing_bodies.organization_discipline_id
        and public.is_org_member(directory.organization_id, array['admin'])
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.organization_disciplines directory
      where directory.id = organization_discipline_governing_bodies.organization_discipline_id
        and public.is_org_member(directory.organization_id, array['admin'])
    )
  );

create policy "Authenticated users view active credential products"
  on public.external_credential_products for select to authenticated
  using (public.is_platform_admin() or is_active);
create policy "Platform admins manage credential products"
  on public.external_credential_products for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "Authorized users view contact insurance evidence"
  on public.contact_insurance_evidence for select to authenticated
  using (
    public.is_platform_admin()
    or exists (select 1 from public.contacts contact where contact.id = contact_insurance_evidence.contact_id and contact.linked_user_id = public.current_profile_id())
    or exists (
      select 1
      from public.directory_contacts directory_contact
      join public.organization_disciplines directory on directory.id = directory_contact.organization_discipline_id
      where directory_contact.contact_id = contact_insurance_evidence.contact_id
        and public.is_org_member(directory.organization_id)
    )
  );
create policy "Authorized users manage contact insurance evidence"
  on public.contact_insurance_evidence for all to authenticated
  using (
    public.is_platform_admin()
    or exists (select 1 from public.contacts contact where contact.id = contact_insurance_evidence.contact_id and contact.linked_user_id = public.current_profile_id())
    or exists (
      select 1
      from public.directory_contacts directory_contact
      join public.organization_disciplines directory on directory.id = directory_contact.organization_discipline_id
      where directory_contact.contact_id = contact_insurance_evidence.contact_id
        and public.is_org_member(directory.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.is_platform_admin()
    or exists (select 1 from public.contacts contact where contact.id = contact_insurance_evidence.contact_id and contact.linked_user_id = public.current_profile_id())
    or exists (
      select 1
      from public.directory_contacts directory_contact
      join public.organization_disciplines directory on directory.id = directory_contact.organization_discipline_id
      where directory_contact.contact_id = contact_insurance_evidence.contact_id
        and public.is_org_member(directory.organization_id, array['admin', 'secretary'])
    )
  );

create policy "Organization members view eligibility requirements"
  on public.eligibility_requirements for select to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id));
create policy "Organization staff manage eligibility requirements"
  on public.eligibility_requirements for all to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

grant select, insert, update, delete on public.discipline_governing_bodies to authenticated;
grant select, insert, update, delete on public.discipline_credential_issuers to authenticated;
grant select, insert, update, delete on public.organization_discipline_governing_bodies to authenticated;
grant select, insert, update, delete on public.external_credential_products to authenticated;
grant select, insert, update, delete on public.contact_insurance_evidence to authenticated;
grant select, insert, update, delete on public.eligibility_requirements to authenticated;
grant execute on function public.evaluate_entry_eligibility_requirements(uuid, date) to authenticated;
grant execute on function public.can_review_contact_insurance_evidence(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('rider-insurance-documents', 'rider-insurance-documents', false)
on conflict (id) do nothing;

create policy "Authorized users upload rider insurance documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'rider-insurance-documents'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      exists (
        select 1 from public.contacts contact
        where contact.id = split_part(name, '/', 1)::uuid
          and contact.linked_user_id = public.current_profile_id()
      )
      or public.can_review_contact_insurance_evidence(split_part(name, '/', 1)::uuid)
    )
  );

create policy "Authorized users view rider insurance documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'rider-insurance-documents'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.contacts contact
        where contact.id = split_part(name, '/', 1)::uuid
          and contact.linked_user_id = public.current_profile_id()
      )
      or exists (
        select 1
        from public.directory_contacts directory_contact
        join public.organization_disciplines directory on directory.id = directory_contact.organization_discipline_id
        where directory_contact.contact_id = split_part(name, '/', 1)::uuid
          and public.is_org_member(directory.organization_id)
      )
    )
  );

create or replace function public.configure_organization_discipline(
  target_organization_id uuid,
  target_discipline_id uuid,
  target_is_active boolean default true,
  target_is_default boolean default false,
  target_requires_host_membership boolean default true
)
returns public.organization_disciplines
language plpgsql
security definer
set search_path = public
as $$
declare
  configured public.organization_disciplines;
  actor_profile_id uuid := public.current_profile_id();
begin
  if actor_profile_id is null or not (
    public.is_platform_admin()
    or public.is_org_member(target_organization_id, array['admin'])
  ) then
    raise exception 'Not authorized to configure organization disciplines'
      using errcode = 'insufficient_privilege';
  end if;

  if not target_is_active and exists (
    select 1 from public.classes where organization_discipline_id = (
      select id from public.organization_disciplines
      where organization_id = target_organization_id and discipline_id = target_discipline_id
    )
    union all
    select 1 from public.class_templates where organization_discipline_id = (
      select id from public.organization_disciplines
      where organization_id = target_organization_id and discipline_id = target_discipline_id
    )
  ) then
    raise exception 'This discipline directory is still used by classes or recurring classes'
      using errcode = 'dependent_objects_still_exist';
  end if;

  if target_is_default and target_is_active then
    update public.organization_disciplines
    set is_default = false
    where organization_id = target_organization_id
      and is_default;
  end if;

  insert into public.organization_disciplines (
    organization_id,
    discipline_id,
    is_default,
    is_active,
    created_by_user_id
  )
  values (
    target_organization_id,
    target_discipline_id,
    target_is_default and target_is_active,
    target_is_active,
    actor_profile_id
  )
  on conflict (organization_id, discipline_id) do update
  set is_default = excluded.is_default,
      is_active = excluded.is_active,
      updated_at = now()
  returning * into configured;

  if not target_is_active and not exists (
    select 1 from public.organization_disciplines
    where organization_id = target_organization_id
      and is_active
      and is_default
  ) then
    update public.organization_disciplines
    set is_default = true
    where id = (
      select id from public.organization_disciplines
      where organization_id = target_organization_id
        and is_active
      order by created_at
      limit 1
    );
  end if;

  if target_is_active and not exists (
    select 1 from public.organization_disciplines
    where organization_id = target_organization_id
      and is_active
      and is_default
  ) then
    update public.organization_disciplines
    set is_default = true
    where id = configured.id
    returning * into configured;
  end if;

  insert into public.eligibility_requirements (
    organization_id,
    scope_type,
    organization_discipline_id,
    requirement_type,
    subject_type,
    validity_rule,
    enforcement_mode,
    is_required,
    is_active,
    label,
    settings,
    created_by_user_id
  )
  values (
    target_organization_id,
    'organization_discipline',
    configured.id,
    'host_membership',
    'rider',
    'active_on_reference_date',
    'blocking',
    target_requires_host_membership,
    target_is_active and target_requires_host_membership,
    'Adhésion à l’association hôte',
    '{"source":"organization_discipline_configuration"}'::jsonb,
    actor_profile_id
  )
  on conflict (organization_discipline_id, subject_type)
    where scope_type = 'organization_discipline' and requirement_type = 'host_membership'
  do update
  set is_required = excluded.is_required,
      is_active = excluded.is_active,
      updated_at = now();

  select * into configured from public.organization_disciplines where id = configured.id;
  return configured;
end;
$$;

create or replace function public.create_organization_with_disciplines(
  target_name text,
  target_slug text,
  target_primary_contact_email text,
  target_timezone text,
  target_currency text,
  target_discipline_ids uuid[],
  target_default_discipline_id uuid,
  target_requires_host_membership boolean default true
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
  created_organization public.organizations;
  discipline_id uuid;
  directory_id uuid;
begin
  if actor_profile_id is null then
    raise exception 'Authenticated profile required' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(array_length(target_discipline_ids, 1), 0) = 0 then
    raise exception 'At least one discipline is required' using errcode = 'check_violation';
  end if;
  if target_default_discipline_id is null or not (target_default_discipline_id = any(target_discipline_ids)) then
    raise exception 'Default discipline must be one of the selected disciplines' using errcode = 'check_violation';
  end if;

  insert into public.organizations (
    name,
    slug,
    primary_contact_email,
    timezone,
    currency,
    created_by_user_id
  )
  values (
    btrim(target_name),
    btrim(target_slug),
    nullif(btrim(target_primary_contact_email), ''),
    coalesce(nullif(btrim(target_timezone), ''), 'America/Toronto'),
    coalesce(nullif(btrim(target_currency), ''), 'CAD'),
    actor_profile_id
  )
  returning * into created_organization;

  insert into public.organization_members (organization_id, user_id, role)
  values (created_organization.id, actor_profile_id, 'admin');

  foreach discipline_id in array target_discipline_ids loop
    insert into public.organization_disciplines (
      organization_id, discipline_id, is_default, is_active, created_by_user_id
    )
    values (
      created_organization.id,
      discipline_id,
      discipline_id = target_default_discipline_id,
      true,
      actor_profile_id
    )
    returning id into directory_id;

    insert into public.eligibility_requirements (
      organization_id,
      scope_type,
      organization_discipline_id,
      requirement_type,
      subject_type,
      validity_rule,
      enforcement_mode,
      is_required,
      is_active,
      label,
      settings,
      created_by_user_id
    )
    values (
      created_organization.id,
      'organization_discipline',
      directory_id,
      'host_membership',
      'rider',
      'active_on_reference_date',
      'blocking',
      target_requires_host_membership,
      target_requires_host_membership,
      'Adhésion à l’association hôte',
      '{"source":"organization_creation"}'::jsonb,
      actor_profile_id
    );
  end loop;

  return created_organization;
end;
$$;

grant execute on function public.configure_organization_discipline(uuid, uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.create_organization_with_disciplines(text, text, text, text, text, uuid[], uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
