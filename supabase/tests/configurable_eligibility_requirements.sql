\set ON_ERROR_STOP on

begin;

insert into public.external_credential_issuers (id, code, name, issuer_type)
values
  ('91000000-0000-0000-0000-000000000001', 'TEST-OPTS', 'Test OPTS', 'provincial_territorial_sport_organization'),
  ('91000000-0000-0000-0000-000000000002', 'TEST-BREED', 'Test Breed Registry', 'breed_registry'),
  ('91000000-0000-0000-0000-000000000003', 'TEST-SANCTION', 'Test Sanctioning Organization', 'sanctioning_organization');

insert into public.discipline_credential_issuers (discipline_id, external_credential_issuer_id)
values
  ('32000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000001'),
  ('32000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000002'),
  ('32000000-0000-0000-0000-000000000001', '91000000-0000-0000-0000-000000000003');

insert into public.external_credential_products (
  id, external_credential_issuer_id, code, name, credential_type, includes_liability_insurance
)
values (
  '92000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000001',
  'MEMBER-INSURED',
  'Membership with liability insurance',
  'membership',
  true
);

insert into public.eligibility_requirements (
  id, organization_id, scope_type, organization_discipline_id, requirement_type, subject_type, label
)
values (
  '93000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'organization_discipline',
  '33000000-0000-0000-0000-000000000001',
  'host_membership',
  'rider',
  'Host membership'
);

insert into public.eligibility_requirements (
  id, organization_id, scope_type, block_id, requirement_type, subject_type,
  external_credential_issuer_id, credential_type, label
)
values (
  '93000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  'block',
  '50000000-0000-0000-0000-000000000001',
  'horse_registration',
  'horse',
  '91000000-0000-0000-0000-000000000002',
  'registration',
  'Breed registration for every class in the block'
);

insert into public.eligibility_requirements (
  id, organization_id, scope_type, block_id, requirement_type, subject_type,
  external_credential_issuer_id, credential_product_id, credential_type,
  requirement_group_code, match_rule, label
)
values
  (
    '93000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000001',
    'block',
    '50000000-0000-0000-0000-000000000001',
    'rider_insurance',
    'rider',
    '91000000-0000-0000-0000-000000000001',
    '92000000-0000-0000-0000-000000000001',
    'membership',
    'test-block-insurance',
    'at_least_one',
    'Accepted insured OPTS membership'
  ),
  (
    '93000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000001',
    'block',
    '50000000-0000-0000-0000-000000000001',
    'rider_insurance',
    'rider',
    null,
    null,
    'insurance',
    'test-block-insurance',
    'at_least_one',
    'Approved private insurance evidence'
  );

insert into public.eligibility_requirements (
  id, organization_id, scope_type, class_id, requirement_type, subject_type,
  external_credential_issuer_id, credential_type, label
)
values (
  '93000000-0000-0000-0000-000000000005',
  '30000000-0000-0000-0000-000000000001',
  'class',
  '60000000-0000-0000-0000-000000000001',
  'external_contact_credential',
  'rider',
  '91000000-0000-0000-0000-000000000003',
  'membership',
  'Additional class membership'
);

do $$
declare
  assessment jsonb;
begin
  assessment := public.evaluate_entry_eligibility_requirements(
    '90000000-0000-0000-0000-000000000001', '2026-06-12'
  );
  if assessment ->> 'status' <> 'non_compliant' or (assessment ->> 'can_proceed')::boolean then
    raise exception 'Expected the entry to fail before credentials are supplied: %', assessment;
  end if;
  raise notice 'ok - organization, block and class requirements are cumulative';
end;
$$;

insert into public.organization_membership_types (
  id, organization_id, name, code, season_year, price, valid_from, valid_until
)
values (
  '94000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Test host membership',
  'TEST-HOST',
  2026,
  0,
  '2026-01-01',
  '2026-12-31'
);

insert into public.contact_organization_memberships (
  id, organization_id, contact_id, membership_type_id, season_year, status,
  valid_from, valid_until, sold_by_user_id
)
values (
  '94100000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002',
  '94000000-0000-0000-0000-000000000001',
  2026,
  'active',
  '2026-01-01',
  '2026-12-31',
  '20000000-0000-0000-0000-000000000002'
);

insert into public.horse_external_identifiers (
  id, horse_id, external_credential_issuer_id, identifier_type, identifier_value,
  status, valid_from, expires_on, credential_product_id
)
values (
  '94200000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '91000000-0000-0000-0000-000000000002',
  'registration',
  'BREED-TEST-1',
  'active',
  '2020-01-01',
  null,
  null
);

insert into public.contact_external_identifiers (
  id, contact_id, external_credential_issuer_id, identifier_type, identifier_value,
  status, valid_from, expires_on, credential_product_id
)
values
  (
    '94300000-0000-0000-0000-000000000001',
    '70000000-0000-0000-0000-000000000002',
    '91000000-0000-0000-0000-000000000003',
    'membership',
    'SANCTION-TEST-1',
    'active',
    '2026-01-01',
    '2026-12-31',
    null
  ),
  (
    '94300000-0000-0000-0000-000000000002',
    '70000000-0000-0000-0000-000000000002',
    '91000000-0000-0000-0000-000000000001',
    'membership',
    'OPTS-TEST-1',
    'active',
    '2026-01-01',
    '2026-12-31',
    '92000000-0000-0000-0000-000000000001'
  );

do $$
declare
  assessment jsonb;
begin
  assessment := public.evaluate_entry_eligibility_requirements(
    '90000000-0000-0000-0000-000000000001', '2026-06-12'
  );
  if assessment ->> 'status' <> 'compliant' or not (assessment ->> 'can_proceed')::boolean then
    raise exception 'Expected an insured OPTS membership to satisfy the insurance alternative: %', assessment;
  end if;
  raise notice 'ok - an accepted membership product can satisfy rider insurance';
end;
$$;

delete from public.contact_external_identifiers
where id = '94300000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.contact_insurance_evidence (
  id, contact_id, provider_name, policy_number, valid_from, expires_on,
  coverage_amount, coverage_currency, document_storage_path, created_by_user_id
)
values (
  '95000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002',
  'Private Test Insurance',
  'POLICY-TEST-1',
  '2026-01-01',
  '2026-12-31',
  5000000,
  'CAD',
  '70000000-0000-0000-0000-000000000002/test-proof.pdf',
  '20000000-0000-0000-0000-000000000004'
);

do $$
begin
  begin
    update public.contact_insurance_evidence
    set status = 'approved', reviewed_at = now(), reviewed_by_user_id = '20000000-0000-0000-0000-000000000004'
    where id = '95000000-0000-0000-0000-000000000001';
    raise exception 'Expected self-approval of insurance evidence to be refused';
  exception
    when insufficient_privilege then null;
  end;
  raise notice 'ok - a rider cannot approve their own insurance evidence';
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

update public.contact_insurance_evidence
set status = 'approved', reviewed_at = now(), reviewed_by_user_id = '20000000-0000-0000-0000-000000000002'
where id = '95000000-0000-0000-0000-000000000001';

reset role;

do $$
declare
  assessment jsonb;
begin
  assessment := public.evaluate_entry_eligibility_requirements(
    '90000000-0000-0000-0000-000000000001', '2026-06-12'
  );
  if assessment ->> 'status' <> 'compliant' then
    raise exception 'Expected approved private evidence to satisfy the insurance alternative: %', assessment;
  end if;
  raise notice 'ok - approved private insurance is an alternative to optional OPTS membership';
end;
$$;

insert into public.classes (
  id, organization_id, show_id, block_id, organization_discipline_id, name, code, sort_order
)
values (
  '96000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  'Second class in tested block',
  'TEST-SECOND',
  2
);

insert into public.entries (
  id, organization_id, show_id, horse_id, class_id, created_by_user_id,
  owner_contact_id, rider_contact_id, payer_contact_id, status
)
values (
  '97000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000004',
  '70000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000002',
  '70000000-0000-0000-0000-000000000001',
  'draft'
);

do $$
declare
  first_assessment jsonb;
  second_assessment jsonb;
begin
  first_assessment := public.evaluate_entry_eligibility_requirements('90000000-0000-0000-0000-000000000001', '2026-06-12');
  second_assessment := public.evaluate_entry_eligibility_requirements('97000000-0000-0000-0000-000000000001', '2026-06-12');
  if second_assessment ->> 'status' <> 'compliant'
    or not jsonb_path_exists(second_assessment, '$.groups[*].checks[*] ? (@.scope_type == "block")') then
    raise exception 'Expected block requirements on the second class entry: %', second_assessment;
  end if;
  if not jsonb_path_exists(first_assessment, '$.groups[*].checks[*] ? (@.scope_type == "class")')
    or jsonb_path_exists(second_assessment, '$.groups[*].checks[*] ? (@.scope_type == "class")') then
    raise exception 'Expected the additional class rule only on the selected class';
  end if;
  raise notice 'ok - block rules affect every class while class rules remain additional';
end;
$$;

delete from public.contact_external_identifiers
where id = '94300000-0000-0000-0000-000000000001';

update public.entries
set status = 'draft'
where id = '90000000-0000-0000-0000-000000000001';

do $$
begin
  begin
    update public.entries
    set status = 'active'
    where id = '90000000-0000-0000-0000-000000000001';
    raise exception 'Expected activation to be blocked by the additional class requirement';
  exception
    when check_violation then null;
  end;
  raise notice 'ok - unmet blocking requirements prevent entry activation';
end;
$$;

insert into public.block_templates (id, organization_id, name, code)
values (
  '98000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'Eligibility test recurring block',
  'ELIG-TEST'
);

insert into public.class_templates (
  id, organization_id, block_template_id, organization_discipline_id, name, code
)
values (
  '98100000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '98000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  'Eligibility test recurring class',
  'ELIG-CLASS'
);

insert into public.eligibility_requirements (
  id, organization_id, scope_type, block_template_id, requirement_type, subject_type, label
)
values (
  '98200000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'block_template',
  '98000000-0000-0000-0000-000000000001',
  'host_membership',
  'rider',
  'Recurring block host membership'
);

insert into public.eligibility_requirements (
  id, organization_id, scope_type, class_template_id, requirement_type, subject_type,
  external_credential_issuer_id, credential_type, label
)
values (
  '98300000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'class_template',
  '98100000-0000-0000-0000-000000000001',
  'horse_registration',
  'horse',
  '91000000-0000-0000-0000-000000000002',
  'registration',
  'Recurring class breed registration'
);

insert into public.blocks (
  id, organization_id, show_id, show_day_id, name, sort_order, block_template_id
)
values (
  '98400000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  'Copied eligibility test block',
  99,
  '98000000-0000-0000-0000-000000000001'
);

insert into public.classes (
  id, organization_id, show_id, block_id, organization_discipline_id,
  class_template_id, name, code, sort_order
)
values (
  '98500000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '98400000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000001',
  '98100000-0000-0000-0000-000000000001',
  'Copied eligibility test class',
  'COPIED-ELIG',
  1
);

do $$
begin
  if not exists (
    select 1 from public.eligibility_requirements
    where scope_type = 'block'
      and block_id = '98400000-0000-0000-0000-000000000001'
      and settings ->> 'copied_from_template_requirement_id' = '98200000-0000-0000-0000-000000000001'
  ) or not exists (
    select 1 from public.eligibility_requirements
    where scope_type = 'class'
      and class_id = '98500000-0000-0000-0000-000000000001'
      and settings ->> 'copied_from_template_requirement_id' = '98300000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Expected recurring block and class requirements to be copied';
  end if;
  raise notice 'ok - recurring requirements are copied to real blocks and classes';
end;
$$;

insert into public.governing_bodies (id, code, name)
values
  ('99000000-0000-0000-0000-000000000001', 'TEST-BODY-OK', 'Compatible test body'),
  ('99000000-0000-0000-0000-000000000002', 'TEST-BODY-NO', 'Incompatible test body');

insert into public.discipline_governing_bodies (discipline_id, governing_body_id)
values ('32000000-0000-0000-0000-000000000001', '99000000-0000-0000-0000-000000000001');

insert into public.organization_discipline_governing_bodies (organization_discipline_id, governing_body_id)
values ('33000000-0000-0000-0000-000000000001', '99000000-0000-0000-0000-000000000001');

do $$
begin
  begin
    insert into public.organization_discipline_governing_bodies (organization_discipline_id, governing_body_id)
    values ('33000000-0000-0000-0000-000000000001', '99000000-0000-0000-0000-000000000002');
    raise exception 'Expected an incompatible governing body to be refused';
  exception
    when check_violation then null;
  end;
  raise notice 'ok - associations can only select governing bodies allowed for the discipline';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
begin
  begin
    perform public.configure_organization_discipline(
      '30000000-0000-0000-0000-000000000001',
      '32000000-0000-0000-0000-000000000001',
      false,
      false,
      true
    );
    raise exception 'Expected a directory used by classes to remain active';
  exception
    when dependent_objects_still_exist then null;
  end;
  raise notice 'ok - a discipline directory in use cannot be deactivated accidentally';
end;
$$;

rollback;
