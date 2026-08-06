\set ON_ERROR_STOP on

begin;

insert into public.incentive_programs (
  id, organization_id, code, name_fr, name_en, program_type,
  valid_from, valid_until, nomination_deadline, nomination_fee, settings, created_by_user_id
) values (
  'a1000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'TEST-NOM',
  'Programme test',
  'Test program',
  'horse_foal_nomination',
  '2026-01-01',
  '2026-12-31',
  '2200-12-31',
  75,
  '{"age_price_tiers":[{"min_age":0,"max_age":2,"fee":50},{"min_age":3,"max_age":5,"fee":90},{"min_age":6,"max_age":null,"fee":125}]}'::jsonb,
  '20000000-0000-0000-0000-000000000002'
);

do $$
declare
  assessment jsonb;
begin
  assessment := public.evaluate_entry_eligibility_requirements(
    '90000000-0000-0000-0000-000000000001', '2026-05-01'
  );
  if assessment ->> 'status' <> 'not_required' then
    raise exception 'Creating a program must not make it mandatory: %', assessment;
  end if;
  raise notice 'ok - programs remain optional until a class selects one';
end;
$$;

insert into public.eligibility_requirements (
  id, organization_id, scope_type, class_id, requirement_type, subject_type,
  incentive_program_id, label
) values (
  'a1100000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'class',
  '60000000-0000-0000-0000-000000000001',
  'program_nomination',
  'horse',
  'a1000000-0000-0000-0000-000000000001',
  'Nomination test obligatoire'
);

insert into public.horses (
  id, name, primary_owner_contact_id, created_by_user_id, registration_status
) values (
  'a1300000-0000-0000-0000-000000000001',
  'Test Eligible Stallion',
  '70000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  'registered'
);

insert into public.directory_horses (
  id, organization_discipline_id, horse_id, source, created_by_user_id
) values (
  'a1310000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  'a1300000-0000-0000-0000-000000000001',
  'manual',
  '20000000-0000-0000-0000-000000000002'
);

insert into public.incentive_programs (
  id, organization_id, code, name_fr, program_type, valid_from, valid_until
) values (
  'a1000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  'TEST-STALLION-FOAL',
  'Souscription étalon et poulain test',
  'stallion_subscription_foal_nomination',
  '2026-01-01',
  '2026-12-31'
);

insert into public.incentive_program_nominations (
  id, organization_id, incentive_program_id, horse_id, nomination_role,
  season_year, status, valid_from, valid_until, reference_number
) values (
  'a1320000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'a1300000-0000-0000-0000-000000000001',
  'stallion',
  2026,
  'active',
  '2026-01-01',
  '2026-12-31',
  'STALLION-2026-001'
);

insert into public.incentive_program_nominations (
  id, organization_id, incentive_program_id, horse_id, nomination_role,
  season_year, status, valid_from, valid_until,
  qualifying_stallion_nomination_id, reference_number
) values (
  'a1320000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000001',
  'foal',
  2026,
  'active',
  '2026-01-01',
  '2026-12-31',
  'a1320000-0000-0000-0000-000000000001',
  'FOAL-2026-001'
);

update public.eligibility_requirements
set incentive_program_id = 'a1000000-0000-0000-0000-000000000002'
where id = 'a1100000-0000-0000-0000-000000000001';

do $$
declare
  assessment jsonb;
begin
  assessment := public.evaluate_entry_eligibility_requirements(
    '90000000-0000-0000-0000-000000000001', '2026-05-01'
  );
  if assessment ->> 'status' <> 'compliant' then
    raise exception 'Expected a foal linked to an active stallion nomination to qualify: %', assessment;
  end if;

  update public.incentive_program_nominations
  set status = 'withdrawn'
  where id = 'a1320000-0000-0000-0000-000000000001';

  assessment := public.evaluate_entry_eligibility_requirements(
    '90000000-0000-0000-0000-000000000001', '2026-05-01'
  );
  if assessment ->> 'status' <> 'non_compliant' then
    raise exception 'Expected the foal to lose eligibility with its stallion nomination: %', assessment;
  end if;
  raise notice 'ok - combined stallion and foal programs require both active records';
end;
$$;

update public.eligibility_requirements
set incentive_program_id = 'a1000000-0000-0000-0000-000000000001'
where id = 'a1100000-0000-0000-0000-000000000001';

update public.horses
set date_of_birth = '2026-06-15',
    birth_year = 2026
where id = '80000000-0000-0000-0000-000000000001';

insert into public.horse_external_identifiers (
  horse_id,
  external_credential_issuer_id,
  identifier_type,
  identifier_value,
  status,
  verified_at
)
select
  '80000000-0000-0000-0000-000000000001',
  issuer.id,
  'competition_license',
  'NRHA-AGE-TEST-001',
  'active',
  now()
from public.external_credential_issuers issuer
where issuer.code = 'NRHA';

do $$
declare
  pricing record;
begin
  select * into pricing
  from public.resolve_incentive_program_nomination_fee(
    'a1000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    2028
  );
  if pricing.fee <> 50 or pricing.horse_age <> 2 or not pricing.used_age_tier then
    raise exception 'Expected January 1 age pricing to resolve age 2 at $50: %', row_to_json(pricing);
  end if;
  raise notice 'ok - nomination price uses the horse age on January 1 of the season';
end;
$$;

do $$
begin
  perform public.resolve_incentive_program_nomination_fee(
    'a1000000-0000-0000-0000-000000000001',
    'a1300000-0000-0000-0000-000000000001',
    2028
  );
  raise exception 'Expected age-based pricing to require a horse date of birth';
exception
  when check_violation then
    raise notice 'ok - age-priced nominations require the horse date of birth';
end;
$$;

do $$
declare
  assessment jsonb;
begin
  assessment := public.evaluate_entry_eligibility_requirements(
    '90000000-0000-0000-0000-000000000001', '2026-05-01'
  );
  if assessment ->> 'status' <> 'non_compliant'
    or (assessment ->> 'can_proceed')::boolean then
    raise exception 'The selected class program should be blocking without a nomination: %', assessment;
  end if;
  raise notice 'ok - an explicitly selected class program is blocking';
end;
$$;

insert into public.incentive_program_nominations (
  id, organization_id, incentive_program_id, horse_id, nomination_role,
  season_year, status, valid_from, valid_until, reference_number, created_by_user_id
) values (
  'a1200000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  'horse',
  2026,
  'active',
  '2026-01-01',
  '2026-12-31',
  'TEST-2026-001',
  '20000000-0000-0000-0000-000000000002'
);

do $$
declare
  assessment jsonb;
begin
  assessment := public.evaluate_entry_eligibility_requirements(
    '90000000-0000-0000-0000-000000000001', '2026-05-01'
  );
  if assessment ->> 'status' <> 'compliant'
    or not (assessment ->> 'can_proceed')::boolean then
    raise exception 'The active nomination should satisfy the class: %', assessment;
  end if;
  raise notice 'ok - an active nomination satisfies the optional class rule';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.import_incentive_program_nominations(
  '30000000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'program_code', 'TEST-NOM',
    'horse_name', (select name from public.horses where id = '80000000-0000-0000-0000-000000000001'),
    'registration_number', (select registration_number from public.horses where id = '80000000-0000-0000-0000-000000000001'),
    'nomination_role', 'horse',
    'season_year', '2027',
    'status', 'active',
    'reference_number', 'TEST-2027-001'
  ))
);

select public.import_incentive_program_nominations(
  '30000000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object(
    'program_code', 'TEST-NOM',
    'nrha_number', 'NRHA-AGE-TEST-001',
    'date_of_birth', '2026-06-15',
    'nomination_role', 'horse',
    'season_year', '2029',
    'status', 'active',
    'reference_number', 'TEST-NRHA-2029-001'
  ))
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

do $$
declare
  nomination public.incentive_program_nominations;
begin
  nomination := public.purchase_incentive_program_nomination(
    'a1000000-0000-0000-0000-000000000001',
    '80000000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000002',
    'horse',
    2028,
    null,
    'TEST-2028-001',
    null
  );
  if nomination.status <> 'pending' or nomination.manual_sale_id is null then
    raise exception 'A paid program purchase should create a pending nomination and sale: %', row_to_json(nomination);
  end if;
  raise notice 'ok - a horse owner can purchase a nomination directly';
end;
$$;

reset role;

do $$
begin
  if not exists (
    select 1
    from public.incentive_program_nominations nomination
    join public.manual_sales sale on sale.id = nomination.manual_sale_id
    join public.invoices invoice on invoice.id = sale.invoice_id
    where nomination.reference_number = 'TEST-2028-001'
      and invoice.status = 'draft'
      and invoice.total_amount = 50
  ) then
    raise exception 'Expected a draft invoice for the nomination fee';
  end if;
  raise notice 'ok - a direct nomination purchase creates a draft invoice';
end;
$$;

update public.invoices invoice
set status = 'paid'
where exists (
  select 1
  from public.manual_sales sale
  join public.incentive_program_nominations nomination on nomination.manual_sale_id = sale.id
  where sale.invoice_id = invoice.id
    and nomination.reference_number = 'TEST-2028-001'
);

do $$
begin
  if not exists (
    select 1 from public.incentive_program_nominations
    where reference_number = 'TEST-2028-001'
      and status = 'active'
  ) then
    raise exception 'Expected the paid invoice to activate the nomination';
  end if;
  raise notice 'ok - paying the invoice activates the nomination';
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.incentive_program_nominations
    where incentive_program_id = 'a1000000-0000-0000-0000-000000000001'
      and horse_id = '80000000-0000-0000-0000-000000000001'
      and season_year = 2027
      and source = 'import'
  ) then
    raise exception 'Expected the CSV import RPC to create the nomination';
  end if;
  raise notice 'ok - CSV rows import by registration number';
end;
$$;

do $$
begin
  if not exists (
    select 1 from public.incentive_program_nominations
    where incentive_program_id = 'a1000000-0000-0000-0000-000000000001'
      and horse_id = '80000000-0000-0000-0000-000000000001'
      and season_year = 2029
      and source = 'import'
      and metadata ->> 'nrha_number' = 'NRHA-AGE-TEST-001'
      and metadata ->> 'date_of_birth' = '2026-06-15'
  ) then
    raise exception 'Expected the NRHA profile import to match the horse and retain birth data';
  end if;
  raise notice 'ok - CSV rows import through an active NRHA horse profile';
end;
$$;

rollback;
