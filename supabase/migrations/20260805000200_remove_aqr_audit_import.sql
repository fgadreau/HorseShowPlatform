-- Retire l'ancien import inverse « Audit AQR » ShowScore -> HSP.
-- Les inscriptions déjà créées sont conservées comme inscriptions normales;
-- seuls le suivi de batch et les exceptions de validation dédiées sont retirés.

create or replace function public.enforce_entry_program_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_rider_contact_id uuid;
  rider_entry_count integer;
begin
  if new.status in ('cancelled', 'scratched', 'scratched_pending_refund') then
    return new;
  end if;

  if exists (
    select 1
    from public.entries entry
    where entry.id <> new.id
      and entry.horse_id = new.horse_id
      and entry.class_id = new.class_id
      and entry.status not in ('cancelled', 'scratched', 'scratched_pending_refund')
  ) then
    raise exception 'The same horse cannot be entered twice in the same class.';
  end if;

  active_rider_contact_id := coalesce(new.rider_contact_id, new.owner_contact_id);

  select count(*) into rider_entry_count
  from public.entries entry
  where entry.id <> new.id
    and entry.class_id = new.class_id
    and coalesce(entry.rider_contact_id, entry.owner_contact_id) = active_rider_contact_id
    and entry.status not in ('cancelled', 'scratched', 'scratched_pending_refund');

  if rider_entry_count >= 3 then
    raise exception 'A rider cannot be entered more than three times in the same class.';
  end if;

  return new;
end;
$$;

create or replace function public.enforce_entry_coggins_health()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'scratched', 'scratched_pending_refund') then
    return new;
  end if;

  perform public.assert_horse_health_valid_for_show(new.horse_id, new.show_id);
  return new;
end;
$$;

-- Ne conserve pas de marqueur de batch obsolète dans les payloads partagés
-- avec ShowScore. Les identifiants normaux de run/entry restent intacts.
update public.show_score_block_setups setup
set runs = coalesce(
  (
    select jsonb_agg(run_item - 'hspImportBatchId' order by run_ordinality)
    from jsonb_array_elements(setup.runs) with ordinality as source(run_item, run_ordinality)
  ),
  '[]'::jsonb
)
where jsonb_typeof(setup.runs) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(setup.runs) as source(run_item)
    where run_item ? 'hspImportBatchId'
  );

alter table public.payout_calculations
  drop column if exists import_batch_id;

alter table public.entries
  drop column if exists import_batch_id,
  drop column if exists import_source,
  drop column if exists external_source_key,
  drop column if exists source_payload;

drop table if exists public.entry_import_batches;

notify pgrst, 'reload schema';
