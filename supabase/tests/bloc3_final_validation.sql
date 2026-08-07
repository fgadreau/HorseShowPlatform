\set ON_ERROR_STOP on

begin;

do $$
begin
  if to_regclass('public.horse_health_documents') is not null then
    raise exception 'Legacy horse health compatibility view still exists';
  end if;

  if to_regprocedure('public.assert_horse_health_valid_for_show(uuid,uuid)') is not null
    or to_regprocedure('public.assert_horse_coggins_valid_for_show(uuid,uuid)') is not null
    or to_regprocedure('public.assert_horse_vaccine_valid_for_show(uuid,uuid)') is not null
    or to_regprocedure('public.horse_coggins_valid_for_show(uuid,uuid)') is not null
    or to_regprocedure('public.horse_vaccine_valid_for_show(uuid,uuid)') is not null
  then
    raise exception 'Legacy health rule functions still exist';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'organizations'
      and column_name in ('health_verification_required', 'coggins_validity_months')
  ) then
    raise exception 'Organization still carries legacy health rule columns';
  end if;

  raise notice 'ok - legacy health view, functions and organization columns are removed';
end;
$$;

-- Le meme cheval devient visible dans une deuxieme association sans dupliquer
-- son identite ni ses documents.
insert into public.directory_horses (
  id, organization_discipline_id, horse_id, source, created_by_user_id
) values (
  '97000000-0000-0000-0000-000000000001',
  '33000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000001',
  'manual',
  '20000000-0000-0000-0000-000000000006'
)
on conflict (organization_discipline_id, horse_id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);

select public.set_organization_health_policy(
  '30000000-0000-0000-0000-000000000002',
  current_date,
  jsonb_build_object(
    'coggins_required', false,
    'influenza_required', false,
    'rhino_required', false,
    'identity_validation_requirement', 'none',
    'association_review_required', false,
    'enforcement_mode', 'blocking',
    'notes', 'Matrice finale Bloc 3'
  )
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);

do $$
declare
  association_a record;
  association_b record;
begin
  select * into association_a
  from public.get_horse_health_compliance(
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    current_date
  );

  select * into association_b
  from public.get_horse_health_compliance(
    '80000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000002',
    current_date
  );

  if association_a.compliance_status <> 'compliant'
    or association_b.compliance_status <> 'not_required'
    or not association_a.can_proceed
    or not association_b.can_proceed
  then
    raise exception 'One global horse should have independent association results: A %, B %',
      row_to_json(association_a), row_to_json(association_b);
  end if;

  if association_a.horse_id is distinct from association_b.horse_id then
    raise exception 'Association compliance unexpectedly duplicated the horse identity';
  end if;

  raise notice 'ok - one horse and its documents produce independent association results';
end;
$$;

-- Le personnel de la deuxieme association voit les documents grace au
-- repertoire, mais n'acquiert jamais le droit de corriger l'identite globale.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);

do $$
begin
  if (select count(*) from public.horse_documents where horse_id = '80000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'Linked association staff should see the global horse documents';
  end if;

  if public.can_correct_horse_identity('80000000-0000-0000-0000-000000000001') then
    raise exception 'Association staff unexpectedly acquired global identity correction authority';
  end if;

  raise notice 'ok - document visibility and identity correction authority remain separate';
end;
$$;

reset role;

-- La creation d'une association prouve que le trigger par defaut ne depend
-- plus des colonnes supprimees.
insert into public.organizations (
  id, name, short_name, slug, timezone, currency, created_by_user_id
) values (
  '97000000-0000-0000-0000-000000000002',
  'Bloc 3 Final Association',
  'B3F',
  'bloc-3-final-association',
  'America/Toronto',
  'CAD',
  '20000000-0000-0000-0000-000000000001'
);

do $$
begin
  if not exists (
    select 1
    from public.organization_health_policies
    where organization_id = '97000000-0000-0000-0000-000000000002'
      and effective_from = '1900-01-01'
      and coggins_validity_rule = 'rolling_months'
      and coggins_validity_months = 12
      and vaccine_validity_months = 6
      and identity_validation_requirement = 'identified'
      and enforcement_mode = 'blocking'
  ) then
    raise exception 'New organization did not receive the canonical default health policy';
  end if;

  raise notice 'ok - new organizations receive a canonical versioned health policy';
end;
$$;

-- La frontiere ShowScore reste intacte pendant la fermeture du Bloc 3.
do $$
begin
  if to_regclass('public.show_score_block_setups') is null
    or to_regprocedure('public.can_manage_show_score_show(uuid,text[])') is null
    or to_regprocedure('public.sync_entry_results_for_scored_run()') is null
  then
    raise exception 'ShowScore contract changed during Bloc 3 cleanup';
  end if;

  raise notice 'ok - ShowScore schema and compatibility functions are unchanged';
end;
$$;

rollback;
