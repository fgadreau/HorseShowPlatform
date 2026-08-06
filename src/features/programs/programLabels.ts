import type { Locale } from "../../lib/i18n";
import type { Horse, IncentiveProgram, IncentiveProgramAgePriceTier, IncentiveProgramNomination } from "../../types/domain";

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

export function incentiveProgramAgePriceTiers(program: IncentiveProgram): IncentiveProgramAgePriceTier[] {
  const rawTiers = program.settings?.age_price_tiers;
  if (!Array.isArray(rawTiers)) return [];

  return rawTiers
    .map((tier) => {
      if (!tier || typeof tier !== "object") return null;
      const candidate = tier as Record<string, unknown>;
      const minAge = Number(candidate.min_age);
      const maxAge = candidate.max_age == null || candidate.max_age === "" ? null : Number(candidate.max_age);
      const fee = Number(candidate.fee);
      if (!Number.isInteger(minAge) || minAge < 0 || (maxAge !== null && (!Number.isInteger(maxAge) || maxAge < minAge)) || !Number.isFinite(fee) || fee < 0) return null;
      return { min_age: minAge, max_age: maxAge, fee };
    })
    .filter((tier): tier is IncentiveProgramAgePriceTier => Boolean(tier))
    .sort((left, right) => left.min_age - right.min_age);
}

export function horseAgeForSeason(horse: Pick<Horse, "birth_year" | "date_of_birth">, seasonYear: number) {
  const birthYear = horse.date_of_birth ? Number(horse.date_of_birth.slice(0, 4)) : null;
  if (!birthYear || !Number.isInteger(seasonYear) || seasonYear < birthYear) return null;
  return seasonYear - birthYear;
}

export function incentiveProgramFeeForHorse(program: IncentiveProgram, horse: Pick<Horse, "birth_year" | "date_of_birth"> | null, seasonYear: number) {
  const tiers = incentiveProgramAgePriceTiers(program);
  const age = horse ? horseAgeForSeason(horse, seasonYear) : null;
  const tier = age === null ? null : tiers.find((candidate) => age >= candidate.min_age && (candidate.max_age === null || age <= candidate.max_age)) ?? null;
  return {
    age,
    fee: tier?.fee ?? Number(program.nomination_fee),
    tier,
    usesFallback: !tier,
  };
}
