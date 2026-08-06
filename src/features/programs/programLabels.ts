import type { Locale } from "../../lib/i18n";
import type { IncentiveProgram, IncentiveProgramNomination } from "../../types/domain";

export function incentiveProgramName(program: IncentiveProgram, locale: Locale) {
  return locale === "en" ? program.name_en?.trim() || program.name_fr : program.name_fr;
}

export function incentiveProgramTypeLabel(type: IncentiveProgram["program_type"], locale: Locale) {
  const labels = {
    horse_foal_nomination: ["Nomination cheval ou poulain", "Horse or foal nomination"],
    stallion_nomination: ["Nomination d’étalon", "Stallion nomination"],
    stallion_subscription_foal_nomination: ["Souscription étalon et nomination poulain", "Stallion subscription and foal nomination"],
    stallion_incentive: ["Programme incitatif pour étalons", "Stallion incentive program"],
    performance_incentive: ["Programme incitatif à la performance", "Performance incentive program"],
  } as const;
  return labels[type][locale === "fr" ? 0 : 1];
}

export function nominationRoleLabel(role: IncentiveProgramNomination["nomination_role"], locale: Locale) {
  const labels = {
    horse: ["Cheval", "Horse"],
    foal: ["Poulain / progéniture", "Foal / offspring"],
    stallion: ["Étalon", "Stallion"],
  } as const;
  return labels[role][locale === "fr" ? 0 : 1];
}

export function nominationStatusLabel(status: IncentiveProgramNomination["status"], locale: Locale) {
  const labels = {
    pending: ["En attente", "Pending"],
    active: ["Active", "Active"],
    expired: ["Expirée", "Expired"],
    rejected: ["Refusée", "Rejected"],
    withdrawn: ["Retirée", "Withdrawn"],
  } as const;
  return labels[status][locale === "fr" ? 0 : 1];
}

export function programUsesStallion(program: IncentiveProgram) {
  return ["stallion_nomination", "stallion_subscription_foal_nomination", "stallion_incentive"].includes(program.program_type);
}
