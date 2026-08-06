-- Programmes incitatifs et de nomination administrés par les associations.
-- Aucun programme ne devient une exigence automatiquement : une classe ou un
-- modèle de classe doit explicitement référencer le programme.

create table public.incentive_programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name_fr text not null,
  name_en text,
  description_fr text,
  description_en text,
  program_type text not null,
  valid_from date,
  valid_until date,
  nomination_deadline date,
  nomination_fee numeric(12, 2) not null default 0,
  tax_applicable boolean not null default false,
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  check (btrim(code) <> ''),
  check (btrim(name_fr) <> ''),
  check (program_type in (
    'horse_foal_nomination',
    'stallion_nomination',
    'stallion_subscription_foal_nomination',
    'stallion_incentive',
    'performance_incentive'
  )),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (nomination_fee >= 0),
  check (jsonb_typeof(settings) = 'object')
);

create index incentive_programs_organization_active_idx
  on public.incentive_programs (organization_id, is_active, program_type);

comment on table public.incentive_programs is
  'Optional association-owned horse, foal, stallion and performance incentive or nomination programs.';

create table public.incentive_program_nominations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  incentive_program_id uuid not null references public.incentive_programs(id) on delete cascade,
  horse_id uuid not null references public.horses(id) on delete cascade,
  nomination_role text not null,
  season_year integer not null,
  status text not null default 'active',
  source text not null default 'manual',
  nominated_on date not null default current_date,
  valid_from date,
  valid_until date,
  qualifying_stallion_nomination_id uuid references public.incentive_program_nominations(id) on delete restrict,
  manual_sale_id uuid references public.manual_sales(id) on delete set null,
  reference_number text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (incentive_program_id, horse_id, season_year, nomination_role),
  check (nomination_role in ('horse', 'foal', 'stallion')),
  check (season_year between 1900 and 2200),
  check (status in ('pending', 'active', 'expired', 'rejected', 'withdrawn')),
  check (source in ('manual', 'import', 'stallion_progeny', 'performance')),
  check (valid_until is null or valid_from is null or valid_until >= valid_from),
  check (jsonb_typeof(metadata) = 'object')
);

create index incentive_program_nominations_program_idx
  on public.incentive_program_nominations (incentive_program_id, season_year, status);
create index incentive_program_nominations_horse_idx
  on public.incentive_program_nominations (horse_id, status, valid_until);
create unique index incentive_program_nominations_manual_sale_key
  on public.incentive_program_nominations (manual_sale_id)
  where manual_sale_id is not null;

comment on table public.incentive_program_nominations is
  'Annual nominations and explicit offspring eligibility records. Foals in stallion programs link to the qualifying stallion nomination.';

create or replace function public.assert_incentive_program_nomination_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_program_type text;
  qualifying_program_id uuid;
  qualifying_role text;
begin
  select program_type
  into target_program_type
  from public.incentive_programs
  where id = new.incentive_program_id
    and organization_id = new.organization_id;

  if target_program_type is null then
    raise exception 'Incentive program does not belong to organization %', new.organization_id
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1
    from public.directory_horses directory_horse
    join public.organization_disciplines directory
      on directory.id = directory_horse.organization_discipline_id
    where directory_horse.horse_id = new.horse_id
      and directory.organization_id = new.organization_id
      and directory.is_active
  ) then
    raise exception 'Nominated horse is not in an active organization directory'
      using errcode = 'check_violation';
  end if;

  if new.nomination_role = 'stallion' and new.qualifying_stallion_nomination_id is not null then
    raise exception 'A stallion nomination cannot qualify itself'
      using errcode = 'check_violation';
  end if;

  if new.qualifying_stallion_nomination_id is not null then
    select incentive_program_id, nomination_role
    into qualifying_program_id, qualifying_role
    from public.incentive_program_nominations
    where id = new.qualifying_stallion_nomination_id;

    if qualifying_program_id is distinct from new.incentive_program_id or qualifying_role is distinct from 'stallion' then
      raise exception 'Qualifying nomination must be a stallion in the same program'
        using errcode = 'check_violation';
    end if;
  end if;

  if target_program_type in (
    'stallion_nomination',
    'stallion_subscription_foal_nomination',
    'stallion_incentive'
  ) and new.nomination_role = 'foal' and new.status = 'active'
    and new.qualifying_stallion_nomination_id is null then
    raise exception 'Foal eligibility in a stallion program requires a qualifying stallion nomination'
      using errcode = 'check_violation';
  end if;

  if target_program_type in ('horse_foal_nomination', 'performance_incentive')
    and new.nomination_role = 'stallion' then
    raise exception 'This program type accepts horse or foal nominations, not stallion subscriptions'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger incentive_program_nominations_assert_context
  before insert or update on public.incentive_program_nominations
  for each row execute function public.assert_incentive_program_nomination_context();

alter table public.eligibility_requirements
  add column incentive_program_id uuid references public.incentive_programs(id) on delete restrict;

alter table public.eligibility_requirements
  drop constraint if exists eligibility_requirements_requirement_type_check;
alter table public.eligibility_requirements
  add constraint eligibility_requirements_requirement_type_check
  check (requirement_type in (
    'host_membership',
    'external_contact_credential',
    'horse_registration',
    'rider_insurance',
    'program_nomination'
  ));

alter table public.eligibility_requirements
  add constraint eligibility_requirements_program_context_check check (
    (requirement_type = 'program_nomination' and subject_type = 'horse' and incentive_program_id is not null)
    or (requirement_type <> 'program_nomination' and incentive_program_id is null)
  );

create index eligibility_requirements_program_idx
  on public.eligibility_requirements (incentive_program_id)
  where incentive_program_id is not null;

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

  if new.incentive_program_id is not null and not exists (
    select 1 from public.incentive_programs program
    where program.id = new.incentive_program_id
      and program.organization_id = new.organization_id
  ) then
    raise exception 'Incentive program does not belong to the requirement organization'
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
        when 'program_nomination' then exists (
          select 1
          from public.incentive_program_nominations nomination
          join public.incentive_programs program on program.id = nomination.incentive_program_id
          cross join entry_context context
          left join public.incentive_program_nominations stallion_nomination
            on stallion_nomination.id = nomination.qualifying_stallion_nomination_id
          where nomination.incentive_program_id = requirement.incentive_program_id
            and nomination.organization_id = context.organization_id
            and nomination.horse_id = context.horse_id
            and nomination.nomination_role in ('horse', 'foal')
            and nomination.status = 'active'
            and program.is_active
            and (nomination.valid_from is null or nomination.valid_from <= target_reference_date)
            and (nomination.valid_until is null or nomination.valid_until >= target_reference_date)
            and (program.valid_from is null or program.valid_from <= target_reference_date)
            and (program.valid_until is null or program.valid_until >= target_reference_date)
            and (
              program.program_type in ('horse_foal_nomination', 'performance_incentive')
              or (
                program.program_type in ('stallion_nomination', 'stallion_subscription_foal_nomination', 'stallion_incentive')
                and stallion_nomination.incentive_program_id = program.id
                and stallion_nomination.nomination_role = 'stallion'
                and stallion_nomination.status = 'active'
                and (stallion_nomination.valid_from is null or stallion_nomination.valid_from <= target_reference_date)
                and (stallion_nomination.valid_until is null or stallion_nomination.valid_until >= target_reference_date)
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
      incentive_program_id, requirement_group_code, match_rule, validity_rule,
      enforcement_mode, is_required, is_active, label, settings, created_by_user_id
    )
    select
      new.organization_id, 'block', new.id, requirement_type, subject_type,
      external_credential_issuer_id, credential_product_id, credential_type,
      incentive_program_id,
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
      incentive_program_id, requirement_group_code, match_rule, validity_rule,
      enforcement_mode, is_required, is_active, label, settings, created_by_user_id
    )
    select
      new.organization_id, 'class', new.id, requirement_type, subject_type,
      external_credential_issuer_id, credential_product_id, credential_type,
      incentive_program_id,
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

create or replace function public.purchase_incentive_program_nomination(
  p_incentive_program_id uuid,
  p_horse_id uuid,
  p_payer_contact_id uuid,
  p_nomination_role text,
  p_season_year integer,
  p_qualifying_stallion_nomination_id uuid default null,
  p_reference_number text default null,
  p_notes text default null
)
returns public.incentive_program_nominations
language plpgsql
security definer
set search_path = public
as $$
declare
  program_record public.incentive_programs%rowtype;
  nomination_record public.incentive_program_nominations%rowtype;
  sale_record public.manual_sales%rowtype;
  initial_status text;
begin
  select * into program_record
  from public.incentive_programs
  where id = p_incentive_program_id
    and is_active;

  if program_record.id is null then
    raise exception 'Incentive program is not active or does not exist'
      using errcode = 'check_violation';
  end if;

  if program_record.nomination_deadline is not null and current_date > program_record.nomination_deadline then
    raise exception 'The nomination deadline has passed'
      using errcode = 'check_violation';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_org_member(program_record.organization_id, array['admin', 'secretary'])
    or public.can_access_horse(p_horse_id)
  ) then
    raise exception 'User cannot nominate this horse'
      using errcode = 'insufficient_privilege';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_org_member(program_record.organization_id, array['admin', 'secretary'])
    or public.can_access_contact(p_payer_contact_id)
  ) then
    raise exception 'User cannot use this payer contact'
      using errcode = 'insufficient_privilege';
  end if;

  initial_status := case
    when program_record.nomination_fee > 0 then 'pending'
    when p_nomination_role = 'foal'
      and program_record.program_type in (
        'stallion_nomination',
        'stallion_subscription_foal_nomination',
        'stallion_incentive'
      )
      and p_qualifying_stallion_nomination_id is null then 'pending'
    else 'active'
  end;

  insert into public.incentive_program_nominations (
    organization_id,
    incentive_program_id,
    horse_id,
    nomination_role,
    season_year,
    status,
    source,
    valid_from,
    valid_until,
    qualifying_stallion_nomination_id,
    reference_number,
    notes,
    created_by_user_id
  ) values (
    program_record.organization_id,
    program_record.id,
    p_horse_id,
    p_nomination_role,
    p_season_year,
    initial_status,
    case when program_record.program_type = 'performance_incentive' then 'performance' else 'manual' end,
    coalesce(program_record.valid_from, make_date(p_season_year, 1, 1)),
    coalesce(program_record.valid_until, make_date(p_season_year, 12, 31)),
    p_qualifying_stallion_nomination_id,
    nullif(btrim(p_reference_number), ''),
    nullif(btrim(p_notes), ''),
    public.current_profile_id()
  ) returning * into nomination_record;

  if program_record.nomination_fee > 0 then
    insert into public.manual_sales (
      organization_id,
      payer_contact_id,
      sold_by_user_id,
      status,
      description,
      quantity,
      unit_price,
      tax_applicable,
      source_payload
    ) values (
      program_record.organization_id,
      p_payer_contact_id,
      public.current_profile_id(),
      'active',
      program_record.name_fr || ' — ' || nomination_record.season_year::text,
      1,
      program_record.nomination_fee,
      program_record.tax_applicable,
      jsonb_build_object(
        'source', 'incentive_program_nomination',
        'incentive_program_id', program_record.id,
        'nomination_id', nomination_record.id,
        'horse_id', p_horse_id
      )
    ) returning * into sale_record;

    update public.incentive_program_nominations
    set manual_sale_id = sale_record.id
    where id = nomination_record.id
    returning * into nomination_record;
  end if;

  return nomination_record;
end;
$$;

create or replace function public.sync_incentive_nomination_invoice_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'paid' then
    update public.incentive_program_nominations nomination
    set status = case
      when nomination.nomination_role = 'foal'
        and program.program_type in (
          'stallion_nomination',
          'stallion_subscription_foal_nomination',
          'stallion_incentive'
        )
        and nomination.qualifying_stallion_nomination_id is null
        then 'pending'
      else 'active'
    end
    from public.manual_sales sale, public.incentive_programs program
    where nomination.manual_sale_id = sale.id
      and program.id = nomination.incentive_program_id
      and sale.invoice_id = new.id
      and nomination.status = 'pending';
  elsif new.status = 'void' then
    update public.incentive_program_nominations nomination
    set status = 'withdrawn'
    from public.manual_sales sale
    where nomination.manual_sale_id = sale.id
      and sale.invoice_id = new.id
      and nomination.status in ('pending', 'active');
  end if;

  return new;
end;
$$;

create trigger invoices_sync_incentive_nomination_status
  after update of status on public.invoices
  for each row execute function public.sync_incentive_nomination_invoice_status();

create or replace function public.import_incentive_program_nominations(
  p_organization_id uuid,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  row_number integer := 0;
  imported_count integer := 0;
  errors jsonb := '[]'::jsonb;
  target_program public.incentive_programs%rowtype;
  target_horse_id uuid;
  target_qualifying_id uuid;
  target_role text;
  target_status text;
  target_season integer;
begin
  if not (
    public.is_platform_admin()
    or public.is_org_member(p_organization_id, array['admin', 'secretary'])
  ) then
    raise exception 'Only association staff can import nominations'
      using errcode = 'insufficient_privilege';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'CSV rows must be supplied as a JSON array'
      using errcode = 'invalid_parameter_value';
  end if;

  for row_data in select value from jsonb_array_elements(p_rows)
  loop
    row_number := row_number + 1;
    begin
      select * into target_program
      from public.incentive_programs
      where organization_id = p_organization_id
        and upper(btrim(code)) = upper(btrim(row_data ->> 'program_code'));

      if target_program.id is null then
        raise exception 'Unknown program code: %', coalesce(row_data ->> 'program_code', '');
      end if;

      target_horse_id := null;
      if nullif(btrim(row_data ->> 'registration_number'), '') is not null then
        select horse.id into target_horse_id
        from public.horses horse
        where upper(btrim(horse.registration_number)) = upper(btrim(row_data ->> 'registration_number'))
          and exists (
            select 1
            from public.directory_horses directory_horse
            join public.organization_disciplines directory
              on directory.id = directory_horse.organization_discipline_id
            where directory_horse.horse_id = horse.id
              and directory.organization_id = p_organization_id
              and directory.is_active
          )
        limit 1;
      end if;

      if target_horse_id is null and nullif(btrim(row_data ->> 'horse_name'), '') is not null then
        select (array_agg(horse.id))[1] into target_horse_id
        from public.horses horse
        where lower(btrim(horse.name)) = lower(btrim(row_data ->> 'horse_name'))
          and exists (
            select 1
            from public.directory_horses directory_horse
            join public.organization_disciplines directory
              on directory.id = directory_horse.organization_discipline_id
            where directory_horse.horse_id = horse.id
              and directory.organization_id = p_organization_id
              and directory.is_active
          )
        having count(*) = 1;
      end if;

      if target_horse_id is null then
        raise exception 'Horse not found or name is ambiguous';
      end if;

      target_role := coalesce(nullif(lower(btrim(row_data ->> 'nomination_role')), ''), 'horse');
      target_status := coalesce(nullif(lower(btrim(row_data ->> 'status')), ''), 'active');
      target_season := coalesce(nullif(row_data ->> 'season_year', '')::integer, extract(year from current_date)::integer);
      target_qualifying_id := null;

      if nullif(btrim(row_data ->> 'qualifying_stallion_reference'), '') is not null then
        select nomination.id into target_qualifying_id
        from public.incentive_program_nominations nomination
        where nomination.incentive_program_id = target_program.id
          and nomination.nomination_role = 'stallion'
          and upper(btrim(nomination.reference_number)) = upper(btrim(row_data ->> 'qualifying_stallion_reference'))
        limit 1;

        if target_qualifying_id is null then
          raise exception 'Qualifying stallion nomination was not found';
        end if;
      end if;

      insert into public.incentive_program_nominations (
        organization_id,
        incentive_program_id,
        horse_id,
        nomination_role,
        season_year,
        status,
        source,
        nominated_on,
        valid_from,
        valid_until,
        qualifying_stallion_nomination_id,
        reference_number,
        notes,
        created_by_user_id
      ) values (
        p_organization_id,
        target_program.id,
        target_horse_id,
        target_role,
        target_season,
        target_status,
        'import',
        coalesce(nullif(row_data ->> 'nominated_on', '')::date, current_date),
        coalesce(nullif(row_data ->> 'valid_from', '')::date, target_program.valid_from, make_date(target_season, 1, 1)),
        coalesce(nullif(row_data ->> 'valid_until', '')::date, target_program.valid_until, make_date(target_season, 12, 31)),
        target_qualifying_id,
        nullif(btrim(row_data ->> 'reference_number'), ''),
        nullif(btrim(row_data ->> 'notes'), ''),
        public.current_profile_id()
      )
      on conflict (incentive_program_id, horse_id, season_year, nomination_role)
      do update set
        status = excluded.status,
        source = 'import',
        nominated_on = excluded.nominated_on,
        valid_from = excluded.valid_from,
        valid_until = excluded.valid_until,
        qualifying_stallion_nomination_id = excluded.qualifying_stallion_nomination_id,
        reference_number = coalesce(excluded.reference_number, incentive_program_nominations.reference_number),
        notes = excluded.notes,
        updated_at = now();

      imported_count := imported_count + 1;
    exception when others then
      errors := errors || jsonb_build_array(jsonb_build_object(
        'row', row_number,
        'message', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'imported', imported_count,
    'failed', jsonb_array_length(errors),
    'errors', errors
  );
end;
$$;

create trigger incentive_programs_touch_updated_at
  before update on public.incentive_programs
  for each row execute function public.touch_updated_at();
create trigger incentive_program_nominations_touch_updated_at
  before update on public.incentive_program_nominations
  for each row execute function public.touch_updated_at();

alter table public.incentive_programs enable row level security;
alter table public.incentive_program_nominations enable row level security;

create policy "Authenticated users view active incentive programs"
  on public.incentive_programs for select to authenticated
  using (is_active or public.is_platform_admin() or public.is_org_member(organization_id));
create policy "Organization staff manage incentive programs"
  on public.incentive_programs for all to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

create policy "Authorized users view incentive nominations"
  on public.incentive_program_nominations for select to authenticated
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id)
    or public.can_access_horse(horse_id)
  );
create policy "Organization staff manage incentive nominations"
  on public.incentive_program_nominations for all to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

grant select, insert, update, delete on public.incentive_programs to authenticated;
grant select, insert, update, delete on public.incentive_program_nominations to authenticated;
grant execute on function public.purchase_incentive_program_nomination(uuid, uuid, uuid, text, integer, uuid, text, text) to authenticated;
grant execute on function public.import_incentive_program_nominations(uuid, jsonb) to authenticated;
