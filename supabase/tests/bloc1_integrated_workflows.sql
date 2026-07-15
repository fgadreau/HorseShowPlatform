\set ON_ERROR_STOP on

begin;

create schema if not exists bloc1_integrated_test;

create or replace function bloc1_integrated_test.as_user(auth_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', auth_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
end;
$$;

create or replace function bloc1_integrated_test.assert_count(
  label text,
  query text,
  expected_count bigint
)
returns void
language plpgsql
as $$
declare
  actual_count bigint;
begin
  execute query into actual_count;

  if actual_count is distinct from expected_count then
    raise exception '% expected %, got %', label, expected_count, actual_count;
  end if;

  raise notice 'ok - %', label;
end;
$$;

grant usage on schema bloc1_integrated_test to authenticated;
grant execute on all functions in schema bloc1_integrated_test to authenticated;

set local role authenticated;
select bloc1_integrated_test.as_user('10000000-0000-0000-0000-000000000006');

-- Une vraie classe supplémentaire dans le bloc B existant.
insert into public.classes (
  id,
  organization_id,
  show_id,
  block_id,
  organization_discipline_id,
  name,
  code,
  level,
  entry_fee,
  payout_schedule_type,
  sort_order
)
values (
  '60000000-0000-0000-0000-000000000901',
  '30000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000003',
  '33000000-0000-0000-0000-000000000002',
  'Bloc 1 integrated class',
  'B1-I',
  2,
  95.00,
  'house_concentrated',
  2
);

-- Le dossard dépend de l'appartenance du cheval au répertoire actif.
select public.claim_horse_back_number(
  '30000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000002',
  912,
  'horse',
  null
);

select bloc1_integrated_test.assert_count(
  'directory-linked horse receives an organization back number',
  $$select count(*)
    from public.organization_back_numbers
    where organization_id = '30000000-0000-0000-0000-000000000002'
      and number = 912
      and assigned_horse_id = '80000000-0000-0000-0000-000000000002'
      and status = 'assigned'$$,
  1
);

-- Le brouillon crée la ligne de facture; les documents santé du seed rendent
-- le cheval valide pour le concours sans changer la politique d'association.
insert into public.entries (
  id,
  organization_id,
  show_id,
  horse_id,
  class_id,
  created_by_user_id,
  owner_contact_id,
  rider_contact_id,
  payer_contact_id,
  status,
  entry_number,
  base_fee,
  total_fees
)
values (
  '90000000-0000-0000-0000-000000000901',
  '30000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002',
  '80000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-000000000901',
  '20000000-0000-0000-0000-000000000006',
  '70000000-0000-0000-0000-000000000003',
  null,
  '70000000-0000-0000-0000-000000000003',
  'draft',
  912,
  95.00,
  95.00
);

select bloc1_integrated_test.assert_count(
  'entry creates one invoice line for the true class',
  $$select count(*)
    from public.invoice_line_items
    where item_type = 'entry'
      and item_id = '90000000-0000-0000-0000-000000000901'
      and total_price = 95.00$$,
  1
);

-- Une réservation du même concours rejoint la facture ouverte du payeur.
insert into public.stall_bookings (
  id,
  organization_id,
  show_id,
  stall_option_id,
  horse_id,
  created_by_user_id,
  booker_contact_id,
  payer_contact_id,
  status,
  show_day_start_id,
  show_day_end_id,
  quantity,
  notes
)
values (
  'd1000000-0000-0000-0000-000000000901',
  '30000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002',
  'c0000000-0000-0000-0000-000000000006',
  '80000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000006',
  '70000000-0000-0000-0000-000000000003',
  '70000000-0000-0000-0000-000000000003',
  'requested',
  '41000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000002',
  1,
  'Bloc 1 integrated stall'
);

select bloc1_integrated_test.assert_count(
  'entry and stall share the same draft invoice',
  $$select count(distinct invoice_id)
    from public.invoice_line_items
    where (item_type = 'entry' and item_id = '90000000-0000-0000-0000-000000000901')
       or (item_type = 'stall' and item_id = 'd1000000-0000-0000-0000-000000000901')$$,
  1
);

-- ShowScore continue de travailler au niveau du bloc; ses payloads historiques
-- restent inchangés, mais les liens relationnels visent blocks/classes.
insert into public.show_score_block_setups (
  block_id,
  organization_id,
  show_id,
  show_day_id,
  pattern,
  runs,
  judges,
  is_draw_imported
)
values (
  '50000000-0000-0000-0000-000000000003',
  '30000000-0000-0000-0000-000000000002',
  '40000000-0000-0000-0000-000000000002',
  '41000000-0000-0000-0000-000000000002',
  '6',
  '[{"id":"bloc1-run","entryId":"90000000-0000-0000-0000-000000000901","draw":1,"backNumber":"912"}]'::jsonb,
  '[{"id":"judge-1","name":"Bloc 1 Judge","order":1}]'::jsonb,
  true
)
on conflict (block_id) do update
set runs = excluded.runs,
    judges = excluded.judges,
    is_draw_imported = excluded.is_draw_imported;

insert into public.block_run_entries (
  block_run_id,
  run_id,
  show_id,
  block_id,
  order_of_go
)
values (
  '91000000-0000-0000-0000-000000000901',
  '92000000-0000-0000-0000-000000000901',
  '40000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000003',
  1
);

insert into public.block_run_class_entries (block_run_id, entry_id)
values (
  '91000000-0000-0000-0000-000000000901',
  '90000000-0000-0000-0000-000000000901'
);

insert into public.scored_runs (
  run_id,
  show_id,
  back_number,
  horse_id,
  owner_id,
  status,
  final_score
)
values (
  '92000000-0000-0000-0000-000000000901',
  '40000000-0000-0000-0000-000000000002',
  '912',
  '80000000-0000-0000-0000-000000000002',
  '70000000-0000-0000-0000-000000000003',
  'scored',
  71.5
);

select bloc1_integrated_test.assert_count(
  'ShowScore result fans out to the entered true class',
  $$select count(*)
    from public.entry_results
    where entry_id = '90000000-0000-0000-0000-000000000901'
      and block_id = '50000000-0000-0000-0000-000000000003'
      and class_id = '60000000-0000-0000-0000-000000000901'
      and final_score = 71.5
      and status = 'scored'$$,
  1
);

insert into public.payout_calculations (
  id,
  show_id,
  class_id,
  status,
  currency,
  entry_count,
  gross_entry_fees,
  base_after_trophy_fee,
  net_entry_fee,
  final_net_entry_fee,
  net_purse,
  result_snapshot,
  calculated_by
)
values (
  '64640000-0000-0000-0000-000000000901',
  '40000000-0000-0000-0000-000000000002',
  '60000000-0000-0000-0000-000000000901',
  'draft',
  'CAD',
  1,
  95.00,
  95.00,
  95.00,
  95.00,
  95.00,
  '[{"entry_id":"90000000-0000-0000-0000-000000000901","rank":1,"final_score":71.5}]'::jsonb,
  '10000000-0000-0000-0000-000000000006'
);

select bloc1_integrated_test.assert_count(
  'payout is attached to the true class result',
  $$select count(*)
    from public.payout_calculations
    where id = '64640000-0000-0000-0000-000000000901'
      and class_id = '60000000-0000-0000-0000-000000000901'$$,
  1
);

reset role;

-- Un propriétaire de l'association A ne doit voir aucun détail privé du
-- parcours créé pour l'association B.
set local role authenticated;
select bloc1_integrated_test.as_user('10000000-0000-0000-0000-000000000004');

select bloc1_integrated_test.assert_count(
  'other organization user cannot see integrated entry',
  $$select count(*) from public.entries
    where id = '90000000-0000-0000-0000-000000000901'$$,
  0
);

select bloc1_integrated_test.assert_count(
  'other organization user cannot see integrated invoice lines',
  $$select count(*) from public.invoice_line_items
    where item_id in (
      '90000000-0000-0000-0000-000000000901',
      'd1000000-0000-0000-0000-000000000901'
    )$$,
  0
);

select bloc1_integrated_test.assert_count(
  'other organization user cannot see integrated ShowScore result',
  $$select count(*) from public.entry_results
    where entry_id = '90000000-0000-0000-0000-000000000901'$$,
  0
);

select bloc1_integrated_test.assert_count(
  'other organization user cannot see integrated payout',
  $$select count(*) from public.payout_calculations
    where id = '64640000-0000-0000-0000-000000000901'$$,
  0
);

select bloc1_integrated_test.assert_count(
  'other organization user cannot see integrated back number',
  $$select count(*) from public.organization_back_numbers
    where organization_id = '30000000-0000-0000-0000-000000000002'
      and number = 912$$,
  0
);

reset role;
rollback;
