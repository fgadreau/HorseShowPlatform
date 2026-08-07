import type { Locale } from "../../lib/i18n";
import {
  buildExternalImportFields,
  buildExternalImportProposal,
  decideExternalImport,
  withExternalImportDecision,
  type ExternalImportChangeType,
} from "../../lib/externalImportProposal";
import {
  compareExternalHorseIdentity,
  identityDateEqual,
  identityGenderEqual,
  identityIdentifierEqual,
  identityTextEqual,
  type IdentityComparison,
} from "../../lib/identityComparison";
import type { NrhaHorseLookupCheck, NrhaHorseLookupVerification } from "../../services/supabaseServices";
import type { Horse } from "../../types/domain";
import { uiText } from "../dashboard/shared";

type NrhaHorseVerificationState = {
  dateOfBirth: string;
  name: string;
  organizationId: string;
  ownerContactId: string;
  ownerName: string;
  officialValues: NrhaOfficialHorseValues;
  payload: Record<string, unknown>;
  referenceNumber: string;
};

type NrhaOfficialHorseValues = {
  damName: string;
  dateOfBirth: string;
  gender: "" | NonNullable<Horse["gender"]>;
  name: string;
  ownerName: string;
  rawSex: string;
  registrationNumber: string;
  sireName: string;
};

type NrhaHorseDataImportRow = {
  key: keyof NrhaOfficialHorseValues | "nrhaReferenceNumber";
  label: string;
  current: string;
  official: string;
  currentValue: string;
  proposedValue: string;
  changeType: ExternalImportChangeType;
};

type NrhaHorseLocalValues = {
  damName: string;
  dateOfBirth: string;
  gender: "" | NonNullable<Horse["gender"]>;
  name: string;
  nrhaReferenceNumber: string;
  ownerName?: string;
  registrationNumber: string;
  sireName: string;
};

function integerFromReference(value: string) {
  const digits = value.trim().replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const parsed = Number(digits);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function verificationPayload(verification: NrhaHorseLookupVerification, identityComparison?: IdentityComparison): Record<string, unknown> {
  return {
    nrhaHorseLookup: verification as unknown,
    ...(identityComparison ? { identityComparison } : {}),
  };
}

function nrhaHorseImportDecisionPayload(
  verification: NrhaHorseLookupVerification,
  rows: NrhaHorseDataImportRow[],
  acceptedKeys: Iterable<NrhaHorseDataImportRow["key"]>,
  identityComparison?: IdentityComparison,
) {
  const values = nrhaOfficialHorseValues(verification);
  const proposal = buildExternalImportProposal({
    subjectType: "horse",
    sourceCode: "NRHA_MEMBER_LOOKUP",
    sourceRecordKey: values.registrationNumber,
    comparison: identityComparison,
    fields: rows.map(({ key, currentValue, proposedValue, changeType }) => ({ key, currentValue, proposedValue, changeType })),
  });

  return withExternalImportDecision(
    verificationPayload(verification, identityComparison),
    decideExternalImport(proposal, acceptedKeys),
  );
}

function nrhaOfficialHorseValues(
  verification: NrhaHorseLookupVerification,
  fallback: {
    licenseNumber?: number | null;
    name?: string;
  } = {},
): NrhaOfficialHorseValues {
  const horse = verification.horse;
  const registrationNumber = horse?.licenseNumber ?? verification.licenseNumber ?? fallback.licenseNumber ?? null;

  return {
    damName: horse?.damName?.trim() ?? "",
    dateOfBirth: normalizeNrhaDate(horse?.foalDate ?? verification.officialFoalDate ?? ""),
    gender: mapNrhaSex(horse?.sex),
    name: horse?.horseName?.trim() || verification.officialHorseName || fallback.name?.trim() || "",
    ownerName: horse?.ownerName?.trim() || verification.officialOwnerName || "",
    rawSex: horse?.sex?.trim() ?? "",
    registrationNumber: registrationNumber ? String(registrationNumber) : "",
    sireName: horse?.sireName?.trim() ?? "",
  };
}

function nrhaHorseDataImportRows(values: NrhaOfficialHorseValues, current: NrhaHorseLocalValues, locale: Locale): NrhaHorseDataImportRow[] {
  const rows: NrhaHorseDataImportRow[] = [];

  maybePushRow(rows, {
    key: "name",
    label: uiText(locale, "Nom", "Name"),
    current: current.name,
    official: values.name,
    formatter: (value) => formatPlainNrhaValue(value, locale),
    compare: identityTextEqual,
  });
  maybePushRow(rows, {
    key: "dateOfBirth",
    label: uiText(locale, "Naissance", "Birth date"),
    current: current.dateOfBirth,
    official: values.dateOfBirth,
    formatter: (value) => value || uiText(locale, "Non renseigné", "Not set"),
    compare: identityDateEqual,
  });
  maybePushRow(rows, {
    key: "gender",
    label: uiText(locale, "Sexe", "Sex"),
    current: current.gender,
    official: values.gender,
    formatter: (value) => nrhaGenderLabel(value as "" | NonNullable<Horse["gender"]>, locale),
    officialDisplay: values.rawSex ? `${values.rawSex} -> ${nrhaGenderLabel(values.gender, locale)}` : undefined,
    compare: identityGenderEqual,
  });
  maybePushRow(rows, {
    key: "nrhaReferenceNumber",
    label: uiText(locale, "Numéro NRHA", "NRHA number"),
    current: current.nrhaReferenceNumber || current.registrationNumber,
    official: values.registrationNumber,
    formatter: (value) => formatPlainNrhaValue(value, locale),
    compare: identityIdentifierEqual,
  });
  maybePushRow(rows, {
    key: "sireName",
    label: uiText(locale, "Père", "Sire"),
    current: current.sireName,
    official: values.sireName,
    formatter: (value) => formatPlainNrhaValue(value, locale),
    compare: identityTextEqual,
  });
  maybePushRow(rows, {
    key: "damName",
    label: uiText(locale, "Mère", "Dam"),
    current: current.damName,
    official: values.damName,
    formatter: (value) => formatPlainNrhaValue(value, locale),
    compare: identityTextEqual,
  });

  return rows;
}

function maybePushRow(
  rows: NrhaHorseDataImportRow[],
  input: {
    key: NrhaHorseDataImportRow["key"];
    label: string;
    current: string;
    official: string;
    formatter: (value: string) => string;
    officialDisplay?: string;
    compare?: (current: string, official: string) => boolean;
  },
) {
  const field = buildExternalImportFields([{
    key: input.key,
    currentValue: input.current,
    proposedValue: input.official,
    equals: input.compare,
  }])[0];

  if (!field) {
    return;
  }

  rows.push({
    ...field,
    label: input.label,
    current: input.formatter(field.currentValue),
    official: input.officialDisplay ?? input.formatter(field.proposedValue),
  });
}

function normalizeNrhaDate(value: string | null | undefined) {
  const cleanValue = value?.trim() ?? "";

  if (!cleanValue) {
    return "";
  }

  const isoMatch = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const usMatch = cleanValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
  }

  return cleanValue;
}

function mapNrhaSex(value: string | null | undefined): "" | NonNullable<Horse["gender"]> {
  const normalized = (value ?? "").trim().toUpperCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");

  if (["MARE", "FILLY", "FEMALE", "F"].includes(normalized)) {
    return "F";
  }

  if (["GELDING", "G"].includes(normalized)) {
    return "G";
  }

  if (["STALLION", "COLT", "MALE", "M"].includes(normalized)) {
    return "M";
  }

  return "";
}

function formatImportedSex(value: string | null | undefined, locale: Locale) {
  const rawValue = value?.trim() ?? "";
  const mappedSex = mapNrhaSex(value);

  if (!rawValue) {
    return uiText(locale, "Non défini", "Unset");
  }

  if (mappedSex) {
    return `${rawValue} -> ${nrhaGenderLabel(mappedSex, locale)}`;
  }

  return rawValue;
}

function formatPlainNrhaValue(value: string, locale: Locale) {
  return value || uiText(locale, "Non renseigné", "Not set");
}

function nrhaGenderLabel(gender: "" | NonNullable<Horse["gender"]>, locale: Locale) {
  if (gender === "M") {
    return uiText(locale, "Mâle", "Male");
  }

  if (gender === "F") {
    return uiText(locale, "Femelle", "Female");
  }

  if (gender === "G") {
    return uiText(locale, "Hongre", "Gelding");
  }

  return uiText(locale, "Non défini", "Unset");
}

function nrhaHorseMismatchMessage(verification: NrhaHorseLookupVerification, locale: Locale, identityComparison?: IdentityComparison) {
  if (verification.status === "not_found") {
    return uiText(locale, "NRHA: aucune fiche cheval trouvée pour ce numéro.", "NRHA: no horse record found for this number.");
  }

  const comparisonMismatches = identityComparison?.evidence
    .filter((item) => item.outcome === "different")
    .map((item) => `${horseIdentityFieldLabel(item.field, locale)}: ${item.candidate || uiText(locale, "NRHA inconnu", "unknown in NRHA")}`) ?? [];
  const mismatches = comparisonMismatches.length ? comparisonMismatches : [
    nrhaCheckMismatchLabel(uiText(locale, "nom", "name"), verification.checks?.name, locale),
    nrhaCheckMismatchLabel(uiText(locale, "date de naissance", "birth date"), verification.checks?.dateOfBirth, locale),
    nrhaCheckMismatchLabel(uiText(locale, "propriétaire", "owner"), verification.checks?.ownerName, locale),
  ].filter(Boolean);

  if (!mismatches.length) {
    return uiText(locale, "NRHA: les informations du cheval ne correspondent pas.", "NRHA: horse details do not match.");
  }

  return `${uiText(locale, "NRHA: informations non concordantes", "NRHA: details do not match")}: ${mismatches.join(" · ")}`;
}

function compareNrhaHorseIdentity(current: NrhaHorseLocalValues, official: NrhaOfficialHorseValues) {
  return compareExternalHorseIdentity(
    {
      name: current.name,
      date_of_birth: current.dateOfBirth,
      gender: current.gender,
      external_identifier: current.nrhaReferenceNumber || current.registrationNumber,
      owner_name: current.ownerName,
    },
    {
      name: official.name,
      date_of_birth: official.dateOfBirth,
      gender: official.gender,
      external_identifier: official.registrationNumber,
      owner_name: official.ownerName,
    },
  );
}

function horseIdentityFieldLabel(field: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    identifier: ["numéro", "number"],
    name: ["nom", "name"],
    date_of_birth: ["date de naissance", "birth date"],
    gender: ["sexe", "sex"],
    owner: ["propriétaire", "owner"],
  };
  const label = labels[field] ?? [field, field];
  return uiText(locale, label[0], label[1]);
}

function nrhaCheckMismatchLabel(label: string, check: NrhaHorseLookupCheck | undefined, locale: Locale) {
  if (!check || check.matched) {
    return null;
  }

  return `${label}: ${check.official || uiText(locale, "NRHA inconnu", "unknown in NRHA")}`;
}

export { compareNrhaHorseIdentity, formatImportedSex, integerFromReference, mapNrhaSex, normalizeNrhaDate, nrhaHorseDataImportRows, nrhaHorseImportDecisionPayload, nrhaHorseMismatchMessage, nrhaOfficialHorseValues, verificationPayload };
export type { NrhaHorseDataImportRow, NrhaHorseVerificationState, NrhaOfficialHorseValues };
