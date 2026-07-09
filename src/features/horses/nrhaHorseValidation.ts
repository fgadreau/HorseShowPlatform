import type { Locale } from "../../lib/i18n";
import type { NrhaHorseLookupCheck, NrhaHorseLookupVerification } from "../../services/supabaseServices";
import { uiText } from "../dashboard/shared";

type NrhaHorseVerificationState = {
  dateOfBirth: string;
  name: string;
  organizationId: string;
  ownerContactId: string;
  ownerName: string;
  payload: Record<string, unknown>;
  referenceNumber: string;
};

function integerFromReference(value: string) {
  const digits = value.trim().replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const parsed = Number(digits);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function verificationPayload(verification: NrhaHorseLookupVerification): Record<string, unknown> {
  return {
    nrhaHorseLookup: verification as unknown,
  };
}

function nrhaHorseMismatchMessage(verification: NrhaHorseLookupVerification, locale: Locale) {
  if (verification.status === "not_found") {
    return uiText(locale, "NRHA: aucune fiche cheval trouvée pour ce numéro.", "NRHA: no horse record found for this number.");
  }

  const mismatches = [
    nrhaCheckMismatchLabel(uiText(locale, "nom", "name"), verification.checks?.name, locale),
    nrhaCheckMismatchLabel(uiText(locale, "date de naissance", "birth date"), verification.checks?.dateOfBirth, locale),
    nrhaCheckMismatchLabel(uiText(locale, "propriétaire", "owner"), verification.checks?.ownerName, locale),
  ].filter(Boolean);

  if (!mismatches.length) {
    return uiText(locale, "NRHA: les informations du cheval ne correspondent pas.", "NRHA: horse details do not match.");
  }

  return `${uiText(locale, "NRHA: informations non concordantes", "NRHA: details do not match")}: ${mismatches.join(" · ")}`;
}

function nrhaCheckMismatchLabel(label: string, check: NrhaHorseLookupCheck | undefined, locale: Locale) {
  if (!check || check.matched) {
    return null;
  }

  return `${label}: ${check.official || uiText(locale, "NRHA inconnu", "unknown in NRHA")}`;
}

export { integerFromReference, nrhaHorseMismatchMessage, verificationPayload };
export type { NrhaHorseVerificationState };
