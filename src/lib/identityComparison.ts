import type { Horse } from "../types/domain";

export type IdentityMatchConfidence = "certain" | "probable" | "weak";
export type IdentityComparisonProfile =
  | "duplicate_contact"
  | "duplicate_horse"
  | "external_contact"
  | "external_horse"
  | "health_document_horse";
export type IdentityComparisonVerdict = "match" | "possible_match" | "mismatch" | "insufficient_data";
export type IdentityEvidenceOutcome = "exact" | "similar" | "different" | "missing";
export type IdentityField =
  | "name"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "date_of_birth"
  | "birth_year"
  | "gender"
  | "breed"
  | "identifier"
  | "owner";

export type IdentityEvidence = {
  field: IdentityField;
  outcome: IdentityEvidenceOutcome;
  reason: string;
  reference: string | null;
  candidate: string | null;
  similarity?: number;
};

export type IdentityComparison = {
  score: number;
  confidence: IdentityMatchConfidence;
  reasons: string[];
  profile: IdentityComparisonProfile;
  verdict: IdentityComparisonVerdict;
  evidence: IdentityEvidence[];
};

export type ContactIdentity = {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  external_identifier?: string | null;
};

export type HorseIdentity = {
  name: string;
  registration_number?: string | null;
  external_identifier?: string | null;
  date_of_birth?: string | null;
  birth_year?: number | null;
  gender?: Horse["gender"] | string | null;
  breed?: string | null;
  primary_owner_contact_id?: string | null;
  owner_name?: string | null;
};

function normalizeIdentityText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeIdentifier(value?: string | null) {
  return (value ?? "").replace(/[^a-z0-9]+/gi, "").toUpperCase();
}

function normalizeIdentityDate(value?: string | null) {
  const cleanValue = value?.trim() ?? "";
  const isoMatch = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const northAmericanMatch = cleanValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (northAmericanMatch) {
    return `${northAmericanMatch[3]}-${northAmericanMatch[1].padStart(2, "0")}-${northAmericanMatch[2].padStart(2, "0")}`;
  }

  return cleanValue;
}

function normalizeGender(value?: string | null): "F" | "G" | "M" | "" {
  const normalized = normalizeIdentityText(value).toUpperCase();
  if (["F", "FEMALE", "FILLY", "MARE", "FEMELLE", "JUMENT"].includes(normalized)) return "F";
  if (["G", "GELDING", "HONGRE"].includes(normalized)) return "G";
  if (["M", "MALE", "COLT", "STALLION", "ETALON"].includes(normalized)) return "M";
  return "";
}

function normalizedContactName(contact: ContactIdentity) {
  return normalizeIdentityText([contact.first_name, contact.middle_name, contact.last_name].filter(Boolean).join(" "));
}

function stringSimilarity(leftValue?: string | null, rightValue?: string | null) {
  const left = normalizeIdentityText(leftValue);
  const right = normalizeIdentityText(rightValue);

  if (!left || !right) return 0;
  if (left === right) return 1;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }

    previous.splice(0, previous.length, ...current);
  }

  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function boundedScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function result(input: {
  profile: IdentityComparisonProfile;
  score: number;
  verdict: IdentityComparisonVerdict;
  evidence: IdentityEvidence[];
  certain?: boolean;
}): IdentityComparison {
  const score = boundedScore(input.score);
  return {
    score,
    confidence: input.certain || input.verdict === "match" ? "certain" : score >= 60 ? "probable" : "weak",
    reasons: input.evidence.filter((item) => item.outcome !== "missing").map((item) => item.reason),
    profile: input.profile,
    verdict: input.verdict,
    evidence: input.evidence,
  };
}

function textEvidence(
  field: IdentityField,
  referenceValue: string | null | undefined,
  candidateValue: string | null | undefined,
  similarThreshold: number,
) {
  const reference = referenceValue?.trim() || null;
  const candidate = candidateValue?.trim() || null;
  if (!reference || !candidate) {
    return evidence(field, "missing", `missing_${field}`, reference, candidate);
  }

  const similarity = stringSimilarity(reference, candidate);
  if (similarity === 1) return evidence(field, "exact", `same_${field}`, reference, candidate, similarity);
  if (similarity >= similarThreshold) return evidence(field, "similar", `similar_${field}`, reference, candidate, similarity);
  return evidence(field, "different", `different_${field}`, reference, candidate, similarity);
}

function exactEvidence(
  field: IdentityField,
  referenceValue: string | null | undefined,
  candidateValue: string | null | undefined,
  normalizer: (value?: string | null) => string,
) {
  const reference = referenceValue?.trim() || null;
  const candidate = candidateValue?.trim() || null;
  if (!reference || !candidate) {
    return evidence(field, "missing", `missing_${field}`, reference, candidate);
  }

  const normalizedReference = normalizer(reference);
  const normalizedCandidate = normalizer(candidate);
  if (!normalizedReference || !normalizedCandidate) {
    return evidence(field, "missing", `missing_${field}`, reference, candidate);
  }

  return normalizedReference === normalizedCandidate
    ? evidence(field, "exact", `same_${field}`, reference, candidate)
    : evidence(field, "different", `different_${field}`, reference, candidate);
}

function evidence(
  field: IdentityField,
  outcome: IdentityEvidenceOutcome,
  reason: string,
  reference: string | null,
  candidate: string | null,
  similarity?: number,
): IdentityEvidence {
  return { field, outcome, reason, reference, candidate, similarity };
}

export function compareContactIdentity(reference: ContactIdentity, candidate: ContactIdentity) {
  let score = 0;
  const evidenceItems: IdentityEvidence[] = [];
  const referenceEmail = normalizeEmail(reference.email);
  const candidateEmail = normalizeEmail(candidate.email);
  const sameEmail = Boolean(referenceEmail && candidateEmail && referenceEmail === candidateEmail);
  const referencePhone = normalizePhone(reference.phone);
  const candidatePhone = normalizePhone(candidate.phone);
  const samePhone = Boolean(referencePhone.length >= 7 && candidatePhone.length >= 7 && referencePhone === candidatePhone);
  const nameSimilarity = stringSimilarity(normalizedContactName(reference), normalizedContactName(candidate));
  const sameBirthDate = Boolean(reference.date_of_birth && candidate.date_of_birth && normalizeIdentityDate(reference.date_of_birth) === normalizeIdentityDate(candidate.date_of_birth));

  if (sameEmail) {
    score += 100;
    evidenceItems.push(evidence("email", "exact", "same_email", reference.email ?? null, candidate.email ?? null));
  }
  if (samePhone) {
    score += 45;
    evidenceItems.push(evidence("phone", "exact", "same_phone", reference.phone ?? null, candidate.phone ?? null));
  }
  if (nameSimilarity === 1) {
    score += 40;
    evidenceItems.push(evidence("name", "exact", "same_name", normalizedContactName(reference), normalizedContactName(candidate), nameSimilarity));
  } else if (nameSimilarity >= 0.82) {
    score += 25;
    evidenceItems.push(evidence("name", "similar", "similar_name", normalizedContactName(reference), normalizedContactName(candidate), nameSimilarity));
  }
  if (sameBirthDate) {
    score += 35;
    evidenceItems.push(evidence("date_of_birth", "exact", "same_birth_date", reference.date_of_birth ?? null, candidate.date_of_birth ?? null));
  } else if (reference.date_of_birth && candidate.date_of_birth) {
    score -= 30;
    evidenceItems.push(evidence("date_of_birth", "different", "different_birth_date", reference.date_of_birth, candidate.date_of_birth));
  }

  const certain = sameEmail || (samePhone && nameSimilarity >= 0.82) || (sameBirthDate && nameSimilarity >= 0.82);
  const scoreValue = boundedScore(score);
  if (!certain && scoreValue < 30) return null;

  return result({
    profile: "duplicate_contact",
    score,
    verdict: certain ? "match" : scoreValue >= 60 ? "possible_match" : "possible_match",
    evidence: evidenceItems,
    certain,
  });
}

export function compareHorseIdentity(reference: HorseIdentity, candidate: HorseIdentity) {
  let score = 0;
  const evidenceItems: IdentityEvidence[] = [];
  const referenceRegistration = normalizeIdentifier(reference.registration_number);
  const candidateRegistration = normalizeIdentifier(candidate.registration_number);
  const sameRegistration = Boolean(referenceRegistration && candidateRegistration && referenceRegistration === candidateRegistration);
  const nameSimilarity = stringSimilarity(reference.name, candidate.name);
  const sameBirthDate = Boolean(reference.date_of_birth && candidate.date_of_birth && normalizeIdentityDate(reference.date_of_birth) === normalizeIdentityDate(candidate.date_of_birth));
  const referenceYear = reference.birth_year ?? (reference.date_of_birth ? Number(normalizeIdentityDate(reference.date_of_birth).slice(0, 4)) : null);
  const candidateYear = candidate.birth_year ?? (candidate.date_of_birth ? Number(normalizeIdentityDate(candidate.date_of_birth).slice(0, 4)) : null);
  const sameBirthYear = Boolean(referenceYear && candidateYear && referenceYear === candidateYear);

  if (sameRegistration) {
    score += 100;
    evidenceItems.push(evidence("identifier", "exact", "same_registration_number", reference.registration_number ?? null, candidate.registration_number ?? null));
  }
  if (nameSimilarity === 1) {
    score += 40;
    evidenceItems.push(evidence("name", "exact", "same_name", reference.name, candidate.name, nameSimilarity));
  } else if (nameSimilarity >= 0.78) {
    score += 28;
    evidenceItems.push(evidence("name", "similar", "similar_name", reference.name, candidate.name, nameSimilarity));
  }
  if (sameBirthDate) {
    score += 35;
    evidenceItems.push(evidence("date_of_birth", "exact", "same_birth_date", reference.date_of_birth ?? null, candidate.date_of_birth ?? null));
  } else if (sameBirthYear) {
    score += 18;
    evidenceItems.push(evidence("birth_year", "exact", "same_birth_year", String(referenceYear), String(candidateYear)));
  } else if (referenceYear && candidateYear) {
    score -= 20;
    evidenceItems.push(evidence("birth_year", "different", "different_birth_year", String(referenceYear), String(candidateYear)));
  }
  if (reference.gender && candidate.gender) {
    if (normalizeGender(reference.gender) === normalizeGender(candidate.gender)) {
      score += 10;
      evidenceItems.push(evidence("gender", "exact", "same_gender", String(reference.gender), String(candidate.gender)));
    } else {
      score -= 10;
      evidenceItems.push(evidence("gender", "different", "different_gender", String(reference.gender), String(candidate.gender)));
    }
  }
  if (reference.primary_owner_contact_id && reference.primary_owner_contact_id === candidate.primary_owner_contact_id) {
    score += 12;
    evidenceItems.push(evidence("owner", "exact", "same_owner", reference.primary_owner_contact_id, candidate.primary_owner_contact_id ?? null));
  }

  const certain = sameRegistration || (nameSimilarity >= 0.9 && sameBirthDate);
  const scoreValue = boundedScore(score);
  if (!certain && scoreValue < 30) return null;

  return result({
    profile: "duplicate_horse",
    score,
    verdict: certain ? "match" : "possible_match",
    evidence: evidenceItems,
    certain,
  });
}

export function compareExternalContactIdentity(reference: ContactIdentity, candidate: ContactIdentity) {
  const firstName = textEvidence("first_name", reference.first_name, candidate.first_name, 0.8);
  const lastName = textEvidence("last_name", reference.last_name, candidate.last_name, 0.82);
  const identifier = exactEvidence("identifier", reference.external_identifier, candidate.external_identifier, normalizeIdentifier);
  const birthDate = exactEvidence("date_of_birth", reference.date_of_birth, candidate.date_of_birth, normalizeIdentityDate);
  const email = exactEvidence("email", reference.email, candidate.email, normalizeEmail);
  const phone = exactEvidence("phone", reference.phone, candidate.phone, normalizePhone);
  const evidenceItems = [identifier, firstName, lastName, birthDate, email, phone];
  const conflicts = [identifier, firstName, lastName, birthDate].filter((item) => item.outcome === "different");
  const nameAligned = [firstName, lastName].every((item) => item.outcome === "exact" || item.outcome === "similar");
  const identifierAligned = identifier.outcome === "exact";
  const supportingEvidence = [birthDate, email, phone].some((item) => item.outcome === "exact");
  const hasEnoughData = identifier.outcome !== "missing" && firstName.outcome !== "missing" && lastName.outcome !== "missing";
  const verdict: IdentityComparisonVerdict = conflicts.length
    ? "mismatch"
    : identifierAligned && nameAligned
      ? "match"
      : nameAligned && supportingEvidence
        ? "match"
        : hasEnoughData
          ? "possible_match"
          : "insufficient_data";
  const score = (identifierAligned ? 45 : 0) + (nameAligned ? 40 : 0) + (supportingEvidence ? 15 : 0) - conflicts.length * 35;

  return result({ profile: "external_contact", score, verdict, evidence: evidenceItems });
}

export function compareExternalHorseIdentity(reference: HorseIdentity, candidate: HorseIdentity) {
  return compareStructuredHorseIdentity("external_horse", reference, candidate);
}

export function compareHorseHealthIdentity(reference: HorseIdentity, candidate: HorseIdentity) {
  return compareStructuredHorseIdentity("health_document_horse", reference, candidate);
}

function compareStructuredHorseIdentity(
  profile: "external_horse" | "health_document_horse",
  reference: HorseIdentity,
  candidate: HorseIdentity,
) {
  const identifier = exactEvidence(
    "identifier",
    reference.external_identifier ?? reference.registration_number,
    candidate.external_identifier ?? candidate.registration_number,
    normalizeIdentifier,
  );
  const name = textEvidence("name", reference.name, candidate.name, profile === "health_document_horse" ? 0.9 : 0.8);
  const referenceBirthYear = reference.birth_year ?? (reference.date_of_birth ? Number(normalizeIdentityDate(reference.date_of_birth).slice(0, 4)) : null);
  const candidateBirthYear = candidate.birth_year ?? (candidate.date_of_birth ? Number(normalizeIdentityDate(candidate.date_of_birth).slice(0, 4)) : null);
  const birthDate = reference.date_of_birth && candidate.date_of_birth
    ? exactEvidence("date_of_birth", reference.date_of_birth, candidate.date_of_birth, normalizeIdentityDate)
    : exactEvidence(
        "birth_year",
        referenceBirthYear ? String(referenceBirthYear) : null,
        candidateBirthYear ? String(candidateBirthYear) : null,
        (value) => value?.trim() ?? "",
      );
  const gender = exactEvidence("gender", reference.gender ? String(reference.gender) : null, candidate.gender ? String(candidate.gender) : null, normalizeGender);
  const breed = textEvidence("breed", reference.breed, candidate.breed, 0.85);
  const owner = textEvidence("owner", reference.owner_name, candidate.owner_name, 0.82);
  const evidenceItems = [identifier, name, birthDate, gender, breed, owner];
  const conflicts = [identifier, name, birthDate, gender, breed].filter((item) => item.outcome === "different");
  const nameAligned = name.outcome === "exact" || name.outcome === "similar";
  const identifierAligned = identifier.outcome === "exact";
  const supportingEvidence = [birthDate, gender, breed, owner].some((item) => item.outcome === "exact" || item.outcome === "similar");
  const hasEnoughData = name.outcome !== "missing" && (identifier.outcome !== "missing" || supportingEvidence);
  const verdict: IdentityComparisonVerdict = conflicts.length
    ? "mismatch"
    : profile === "external_horse" && identifierAligned && nameAligned
      ? "match"
      : nameAligned && supportingEvidence
        ? "match"
        : hasEnoughData
          ? "possible_match"
          : "insufficient_data";
  const score = (identifierAligned ? 45 : 0) + (nameAligned ? 35 : 0) + (supportingEvidence ? 20 : 0) - conflicts.length * 40;

  return result({ profile, score, verdict, evidence: evidenceItems });
}

export function contactIdentitySignature(contact: ContactIdentity) {
  return [normalizedContactName(contact), normalizeEmail(contact.email), normalizePhone(contact.phone), normalizeIdentityDate(contact.date_of_birth)].join("|");
}

export function horseIdentitySignature(horse: HorseIdentity) {
  return [normalizeIdentityText(horse.name), normalizeIdentifier(horse.registration_number), normalizeIdentityDate(horse.date_of_birth) || horse.birth_year || "", normalizeGender(horse.gender)].join("|");
}

export function identityTextEqual(left?: string | null, right?: string | null) {
  return Boolean(normalizeIdentityText(left) && normalizeIdentityText(left) === normalizeIdentityText(right));
}

export function identityEmailEqual(left?: string | null, right?: string | null) {
  return Boolean(normalizeEmail(left) && normalizeEmail(left) === normalizeEmail(right));
}

export function identityPhoneEqual(left?: string | null, right?: string | null) {
  const leftPhone = normalizePhone(left);
  const rightPhone = normalizePhone(right);
  return Boolean(leftPhone.length >= 7 && leftPhone === rightPhone);
}

export function identityIdentifierEqual(left?: string | null, right?: string | null) {
  return Boolean(normalizeIdentifier(left) && normalizeIdentifier(left) === normalizeIdentifier(right));
}

export function identityDateEqual(left?: string | null, right?: string | null) {
  return Boolean(normalizeIdentityDate(left) && normalizeIdentityDate(left) === normalizeIdentityDate(right));
}

export function identityGenderEqual(left?: string | null, right?: string | null) {
  return Boolean(normalizeGender(left) && normalizeGender(left) === normalizeGender(right));
}

export { normalizeEmail as normalizeIdentityEmail, normalizeGender as normalizeIdentityGender, normalizeIdentifier as normalizeIdentityIdentifier, normalizeIdentityDate, normalizeIdentityText, normalizePhone, stringSimilarity };
