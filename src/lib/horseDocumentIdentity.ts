import type { Horse, HorseDocument, HorseDocumentValidation, HorseDocumentValidationSource } from "../types/domain";
import {
  compareExternalHorseIdentity,
  compareHorseHealthIdentity,
  type HorseIdentity,
  type IdentityComparison,
} from "./identityComparison";

export type HorseDocumentExtractedIdentity = {
  horse_name?: string | null;
  date_of_birth?: string | null;
  birth_year?: number | null;
  age_years?: number | null;
  age_reference_date?: string | null;
  gender?: string | null;
  breed?: string | null;
  color?: string | null;
  identifier?: string | null;
  owner_name?: string | null;
};

export type PreparedHorseDocumentValidation = {
  status: Exclude<HorseDocumentValidation["status"], "rejected" | "superseded" | "invalidated">;
  source: HorseDocumentValidationSource;
  comparison_profile: HorseDocumentValidation["comparison_profile"];
  extracted_identity: Required<{ [Key in keyof HorseDocumentExtractedIdentity]: HorseDocumentExtractedIdentity[Key] }>;
  horse_identity_snapshot: HorseIdentity;
  comparison: IdentityComparison;
  warnings: string[];
  source_payload: Record<string, unknown>;
};

function cleanText(value?: string | null) {
  return value?.trim() || null;
}

export function birthYearFromDocumentAge(ageYears?: number | null, referenceDate?: string | null) {
  if (ageYears === null || ageYears === undefined || !Number.isInteger(ageYears) || ageYears < 0 || ageYears > 60 || !referenceDate) return null;
  const year = Number(referenceDate.slice(0, 4));
  return Number.isInteger(year) && year >= 1900 && year <= 2200 ? year - ageYears : null;
}

export function prepareHorseDocumentValidation(input: {
  document: HorseDocument;
  horse: Horse;
  horseOwnerName?: string | null;
  expectedIdentifier?: string | null;
  extracted: HorseDocumentExtractedIdentity;
  source?: HorseDocumentValidationSource;
  warnings?: string[];
  source_payload?: Record<string, unknown>;
}): PreparedHorseDocumentValidation {
  const inferredBirthYear = input.extracted.birth_year
    ?? birthYearFromDocumentAge(input.extracted.age_years, input.extracted.age_reference_date);
  const extractedIdentity = {
    horse_name: cleanText(input.extracted.horse_name) ?? cleanText(input.document.horse_name),
    date_of_birth: cleanText(input.extracted.date_of_birth) ?? cleanText(input.document.horse_date_of_birth),
    birth_year: inferredBirthYear,
    age_years: input.extracted.age_years ?? null,
    age_reference_date: cleanText(input.extracted.age_reference_date),
    gender: cleanText(input.extracted.gender),
    breed: cleanText(input.extracted.breed) ?? cleanText(input.document.breed_name),
    color: cleanText(input.extracted.color),
    identifier: cleanText(input.extracted.identifier) ?? cleanText(input.document.registration_number) ?? cleanText(input.document.horse_external_id),
    owner_name: cleanText(input.extracted.owner_name),
  };
  const horseIdentity: HorseIdentity = {
    name: input.horse.name,
    date_of_birth: input.horse.date_of_birth,
    birth_year: input.horse.birth_year,
    gender: input.horse.gender,
    breed: input.horse.breed,
    external_identifier: cleanText(input.expectedIdentifier),
    registration_number: input.horse.registration_number,
    primary_owner_contact_id: input.horse.primary_owner_contact_id,
    owner_name: cleanText(input.horseOwnerName),
  };
  const candidateIdentity: HorseIdentity = {
    name: extractedIdentity.horse_name ?? "",
    date_of_birth: extractedIdentity.date_of_birth,
    birth_year: extractedIdentity.birth_year,
    gender: extractedIdentity.gender,
    breed: extractedIdentity.breed,
    external_identifier: extractedIdentity.identifier,
    owner_name: extractedIdentity.owner_name,
  };
  const comparisonProfile = input.document.document_category === "health" ? "health_document_horse" : "external_horse";
  const baseComparison = comparisonProfile === "health_document_horse"
    ? compareHorseHealthIdentity(horseIdentity, candidateIdentity)
    : compareExternalHorseIdentity(horseIdentity, candidateIdentity);
  const gradeRegistrationConflict = input.document.document_category === "registration"
    && input.horse.registration_status === "grade"
    && Boolean(extractedIdentity.identifier);
  const comparison: IdentityComparison = gradeRegistrationConflict
    ? {
        ...baseComparison,
        score: Math.max(0, baseComparison.score - 40),
        confidence: "weak",
        verdict: "mismatch",
        reasons: [...baseComparison.reasons, "grade_horse_has_registration_document"],
        evidence: [
          ...baseComparison.evidence,
          {
            field: "identifier",
            outcome: "different",
            reason: "grade_horse_has_registration_document",
            reference: "grade",
            candidate: extractedIdentity.identifier,
          },
        ],
      }
    : baseComparison;

  return {
    status: comparison.verdict === "match" ? "verified" : comparison.verdict === "mismatch" ? "mismatch" : "identified",
    source: input.source ?? "manual",
    comparison_profile: comparisonProfile,
    extracted_identity: extractedIdentity,
    horse_identity_snapshot: horseIdentity,
    comparison,
    warnings: input.warnings ?? [],
    source_payload: input.source_payload ?? {},
  };
}

export function horseDocumentValidationRpcPayload(validation: PreparedHorseDocumentValidation) {
  const extracted = validation.extracted_identity;
  return {
    status: validation.status,
    source: validation.source,
    comparison_profile: validation.comparison_profile,
    extracted_horse_name: extracted.horse_name,
    extracted_date_of_birth: extracted.date_of_birth,
    extracted_birth_year: extracted.birth_year,
    extracted_age_years: extracted.age_years,
    extracted_age_reference_date: extracted.age_reference_date,
    extracted_gender: extracted.gender,
    extracted_breed: extracted.breed,
    extracted_color: extracted.color,
    extracted_identifier: extracted.identifier,
    extracted_owner_name: extracted.owner_name,
    horse_identity_snapshot: validation.horse_identity_snapshot,
    comparison_result: validation.comparison,
    evidence: validation.comparison.evidence,
    source_payload: validation.source_payload,
    warnings: validation.warnings,
    verdict: validation.comparison.verdict,
    score: validation.comparison.score,
    confidence: validation.comparison.confidence,
  };
}
