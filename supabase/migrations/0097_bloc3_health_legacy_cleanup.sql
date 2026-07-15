-- Bloc 3 / S9: fermeture du modele de documents et conformite sante.
-- Les politiques versionnees sont maintenant l'unique source de regles.
-- Impact ShowScore: SS-0. Aucun objet, payload, passage, score ou resultat
-- ShowScore n'est modifie.

-- Une nouvelle association recoit directement une politique canonique. Cette
-- fonction ne lit plus les colonnes historiques de organizations.
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
    true,
    'rolling_months',
    12,
    true,
    true,
    true,
    6,
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

-- Ces fonctions n'ont plus de declencheur ni d'appel applicatif depuis S8.
drop function if exists public.enforce_entry_coggins_health();
drop function if exists public.enforce_stall_booking_coggins_health();
drop function if exists public.assert_horse_health_valid_for_show(uuid, uuid);
drop function if exists public.assert_horse_vaccine_valid_for_show(uuid, uuid);
drop function if exists public.horse_vaccine_valid_for_show(uuid, uuid);
drop function if exists public.assert_horse_coggins_valid_for_show(uuid, uuid);
drop function if exists public.horse_coggins_valid_for_show(uuid, uuid);
drop function if exists public.coggins_expires_on(date, uuid);

-- La vue n'etait qu'un pont de lecture pour les fonctions ci-dessus.
drop view if exists public.horse_health_documents;

alter table public.organizations
  drop constraint if exists organizations_coggins_validity_months_check,
  drop column if exists health_verification_required,
  drop column if exists coggins_validity_months;
