-- Bloc 3 / S8: appliquer le moteur central aux inscriptions et reservations.
-- La date de reference est toujours la date de debut du concours vise.
-- Une politique "warning" conserve les raisons, mais autorise l'operation.
-- Une politique "blocking" refuse l'operation avec un code d'erreur stable.
-- Impact ShowScore: SS-0. Les inscriptions acceptees conservent exactement le
-- meme schema et les memes identifiants transmis a ShowScore.

create or replace function public.assert_horse_health_compliance_for_show(
  p_horse_id uuid,
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target_show record;
  compliance record;
  result jsonb;
  horse_is_in_organization boolean;
begin
  select show_record.organization_id, show_record.start_date
  into target_show
  from public.shows show_record
  where show_record.id = p_show_id;

  if not found then
    raise exception 'Show % does not exist', p_show_id
      using errcode = 'foreign_key_violation';
  end if;

  if auth.uid() is not null and not public.is_platform_admin() then
    select exists (
      select 1
      from public.directory_horses directory_horse
      join public.organization_disciplines organization_discipline
        on organization_discipline.id = directory_horse.organization_discipline_id
      where directory_horse.horse_id = p_horse_id
        and organization_discipline.organization_id = target_show.organization_id
    ) into horse_is_in_organization;

    if not horse_is_in_organization or not (
      public.can_manage_horse_identity(p_horse_id)
      or public.is_org_member(target_show.organization_id)
    ) then
      raise exception 'HSP_HEALTH_COMPLIANCE_FORBIDDEN'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  select *
  into compliance
  from public.evaluate_horse_health_compliance(
    p_horse_id,
    target_show.organization_id,
    target_show.start_date
  );

  result := jsonb_build_object(
    'horse_id', compliance.horse_id,
    'organization_id', compliance.organization_id,
    'show_id', p_show_id,
    'reference_date', compliance.reference_date,
    'policy_id', compliance.policy_id,
    'compliance_status', compliance.compliance_status,
    'can_proceed', compliance.can_proceed,
    'enforcement_mode', compliance.enforcement_mode,
    'requirements', compliance.requirements,
    'reasons', compliance.reasons
  );

  if not compliance.can_proceed then
    raise exception 'HSP_HEALTH_COMPLIANCE_BLOCKED'
      using
        errcode = 'check_violation',
        detail = result::text;
  end if;

  return result;
end;
$$;

revoke all on function public.assert_horse_health_compliance_for_show(uuid, uuid) from public, anon;
grant execute on function public.assert_horse_health_compliance_for_show(uuid, uuid) to authenticated;

comment on function public.assert_horse_health_compliance_for_show(uuid, uuid) is
  'Returns the explainable health result for the show start date and raises HSP_HEALTH_COMPLIANCE_BLOCKED only when policy enforcement is blocking.';

create or replace function public.enforce_horse_health_compliance_for_show()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.horse_id is null then
    return new;
  end if;

  if tg_table_name = 'entries'
    and new.status in ('cancelled', 'scratched', 'scratched_pending_refund')
  then
    return new;
  end if;

  if tg_table_name = 'stall_bookings'
    and new.status in ('cancelled', 'completed')
  then
    return new;
  end if;

  perform public.assert_horse_health_compliance_for_show(new.horse_id, new.show_id);
  return new;
end;
$$;

drop trigger if exists entries_zz_enforce_coggins_health on public.entries;
drop trigger if exists entries_zz_enforce_health_compliance on public.entries;
create trigger entries_zz_enforce_health_compliance
before insert or update on public.entries
for each row execute function public.enforce_horse_health_compliance_for_show();

drop trigger if exists stall_bookings_zz_enforce_coggins_health on public.stall_bookings;
drop trigger if exists stall_bookings_zz_enforce_health_compliance on public.stall_bookings;
create trigger stall_bookings_zz_enforce_health_compliance
before insert or update on public.stall_bookings
for each row execute function public.enforce_horse_health_compliance_for_show();
