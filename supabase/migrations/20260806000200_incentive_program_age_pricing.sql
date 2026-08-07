-- Tarification des nominations selon l'âge du cheval au 1er janvier de la saison
-- et prise en charge des profils NRHA dans l'import CSV.

create or replace function public.resolve_incentive_program_nomination_fee(
  p_incentive_program_id uuid,
  p_horse_id uuid,
  p_season_year integer
)
returns table (
  fee numeric,
  horse_age integer,
  used_age_tier boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  program_record public.incentive_programs%rowtype;
  horse_birth_date date;
  resolved_fee numeric;
  resolved_age integer;
  has_age_tiers boolean;
begin
  select * into program_record
  from public.incentive_programs
  where id = p_incentive_program_id;

  if program_record.id is null then
    raise exception 'Incentive program does not exist'
      using errcode = 'check_violation';
  end if;

  select date_of_birth into horse_birth_date
  from public.horses
  where id = p_horse_id;

  if not found then
    raise exception 'Horse does not exist'
      using errcode = 'check_violation';
  end if;

  has_age_tiers := jsonb_typeof(program_record.settings -> 'age_price_tiers') = 'array'
    and jsonb_array_length(program_record.settings -> 'age_price_tiers') > 0;

  if has_age_tiers and horse_birth_date is null then
    raise exception 'Horse date of birth is required for age-based nomination pricing'
      using errcode = 'check_violation';
  end if;

  resolved_age := case
    when horse_birth_date is null then null
    else p_season_year - extract(year from horse_birth_date)::integer
  end;

  if resolved_age is not null and resolved_age < 0 then
    raise exception 'Nomination season cannot be earlier than the horse birth year'
      using errcode = 'check_violation';
  end if;

  if has_age_tiers then
    select (item.tier ->> 'fee')::numeric
    into resolved_fee
    from jsonb_array_elements(program_record.settings -> 'age_price_tiers') item(tier)
    where (item.tier ->> 'min_age') ~ '^[0-9]+$'
      and (item.tier ->> 'fee') ~ '^[0-9]+([.][0-9]+)?$'
      and resolved_age >= (item.tier ->> 'min_age')::integer
      and (
        not (item.tier ? 'max_age')
        or jsonb_typeof(item.tier -> 'max_age') = 'null'
        or item.tier ->> 'max_age' = ''
        or (
          (item.tier ->> 'max_age') ~ '^[0-9]+$'
          and resolved_age <= (item.tier ->> 'max_age')::integer
        )
      )
    order by (item.tier ->> 'min_age')::integer desc
    limit 1;
  end if;

  fee := coalesce(resolved_fee, program_record.nomination_fee);
  horse_age := resolved_age;
  used_age_tier := resolved_fee is not null;
  return next;
end;
$$;

revoke all on function public.resolve_incentive_program_nomination_fee(uuid, uuid, integer) from public, anon, authenticated;

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
  effective_fee numeric;
  horse_age_at_january_first integer;
  used_age_tier boolean;
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

  select pricing.fee, pricing.horse_age, pricing.used_age_tier
  into effective_fee, horse_age_at_january_first, used_age_tier
  from public.resolve_incentive_program_nomination_fee(
    program_record.id,
    p_horse_id,
    p_season_year
  ) pricing;

  initial_status := case
    when effective_fee > 0 then 'pending'
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
    metadata,
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
    jsonb_strip_nulls(jsonb_build_object(
      'nomination_fee', effective_fee,
      'horse_age_at_january_first', horse_age_at_january_first,
      'used_age_price_tier', used_age_tier
    )),
    public.current_profile_id()
  ) returning * into nomination_record;

  if effective_fee > 0 then
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
      effective_fee,
      program_record.tax_applicable,
      jsonb_strip_nulls(jsonb_build_object(
        'source', 'incentive_program_nomination',
        'incentive_program_id', program_record.id,
        'nomination_id', nomination_record.id,
        'horse_id', p_horse_id,
        'horse_age_at_january_first', horse_age_at_january_first,
        'used_age_price_tier', used_age_tier
      ))
    ) returning * into sale_record;

    update public.incentive_program_nominations
    set manual_sale_id = sale_record.id
    where id = nomination_record.id
    returning * into nomination_record;
  end if;

  return nomination_record;
end;
$$;

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
  target_birth_date date;
  stored_birth_date date;
  nrha_issuer_id uuid;
  has_age_tiers boolean;
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

  select id into nrha_issuer_id
  from public.external_credential_issuers
  where upper(code) = 'NRHA'
  limit 1;

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
      if nullif(btrim(row_data ->> 'nrha_number'), '') is not null then
        select identifier.horse_id into target_horse_id
        from public.horse_external_identifiers identifier
        where identifier.external_credential_issuer_id = nrha_issuer_id
          and identifier.normalized_identifier_value = upper(btrim(row_data ->> 'nrha_number'))
          and identifier.status = 'active'
          and exists (
            select 1
            from public.directory_horses directory_horse
            join public.organization_disciplines directory
              on directory.id = directory_horse.organization_discipline_id
            where directory_horse.horse_id = identifier.horse_id
              and directory.organization_id = p_organization_id
              and directory.is_active
          )
        limit 1;

        if target_horse_id is null then
          raise exception 'Active NRHA horse profile was not found in the association directory';
        end if;
      elsif nullif(btrim(row_data ->> 'registration_number'), '') is not null then
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

      target_birth_date := nullif(row_data ->> 'date_of_birth', '')::date;
      select date_of_birth into stored_birth_date
      from public.horses
      where id = target_horse_id;

      if target_birth_date is not null and stored_birth_date is null then
        update public.horses
        set date_of_birth = target_birth_date,
            birth_year = extract(year from target_birth_date)::smallint
        where id = target_horse_id;
        stored_birth_date := target_birth_date;
      elsif target_birth_date is not null and stored_birth_date is distinct from target_birth_date then
        raise exception 'CSV date of birth does not match the horse profile';
      end if;

      has_age_tiers := jsonb_typeof(target_program.settings -> 'age_price_tiers') = 'array'
        and jsonb_array_length(target_program.settings -> 'age_price_tiers') > 0;
      if has_age_tiers and stored_birth_date is null then
        raise exception 'Horse date of birth is required for this age-priced program';
      end if;

      target_role := coalesce(nullif(lower(btrim(row_data ->> 'nomination_role')), ''), 'horse');
      target_status := coalesce(nullif(lower(btrim(row_data ->> 'status')), ''), 'active');
      target_season := coalesce(nullif(row_data ->> 'season_year', '')::integer, extract(year from current_date)::integer);
      target_qualifying_id := null;

      if stored_birth_date is not null and target_season < extract(year from stored_birth_date)::integer then
        raise exception 'Nomination season cannot be earlier than the horse birth year';
      end if;

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
        metadata,
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
        jsonb_strip_nulls(jsonb_build_object(
          'nrha_number', nullif(btrim(row_data ->> 'nrha_number'), ''),
          'date_of_birth', stored_birth_date
        )),
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
        metadata = incentive_program_nominations.metadata || excluded.metadata,
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

grant execute on function public.purchase_incentive_program_nomination(uuid, uuid, uuid, text, integer, uuid, text, text) to authenticated;
grant execute on function public.import_incentive_program_nominations(uuid, jsonb) to authenticated;
