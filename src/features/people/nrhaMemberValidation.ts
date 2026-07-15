import type { Locale } from "../../lib/i18n";
import {
  buildExternalImportFields,
  buildExternalImportProposal,
  decideExternalImport,
  withExternalImportDecision,
  type ExternalImportChangeType,
} from "../../lib/externalImportProposal";
import {
  compareExternalContactIdentity,
  identityEmailEqual,
  identityIdentifierEqual,
  identityPhoneEqual,
  identityTextEqual,
  type IdentityComparison,
} from "../../lib/identityComparison";
import type { NrhaMemberLookupCheck, NrhaMemberLookupVerification } from "../../services/supabaseServices";
import type { Contact, ContactExternalIdentifier } from "../../types/domain";
import { uiText } from "../dashboard/shared";

type NrhaOfficialMemberValues = {
  address: string;
  addressLine2: string;
  city: string;
  country: string;
  email: string;
  expiresOn: string;
  firstName: string;
  fullName: string;
  lastName: string;
  middleName: string;
  memberNumber: string;
  phone: string;
  state: string;
  zipCode: string;
};

type NrhaMemberLocalValues = {
  address: string;
  addressLine2: string;
  city: string;
  country: string;
  email: string;
  expiresOn: string;
  firstName: string;
  lastName: string;
  middleName: string;
  memberNumber: string;
  phone: string;
  state: string;
  zipCode: string;
};

type NrhaMemberDataImportRow = {
  key: keyof NrhaOfficialMemberValues;
  label: string;
  current: string;
  official: string;
  currentValue: string;
  proposedValue: string;
  changeType: ExternalImportChangeType;
};

type NrhaMemberVerificationState = {
  memberNumber: string;
  officialValues: NrhaOfficialMemberValues;
  organizationId: string;
  payload: Record<string, unknown>;
};

function integerFromMembershipNumber(value: string) {
  const digits = value.trim().replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const parsed = Number(digits);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nrhaMemberVerificationPayload(verification: NrhaMemberLookupVerification, identityComparison?: IdentityComparison): Record<string, unknown> {
  return {
    nrhaMemberLookup: verification as unknown,
    ...(identityComparison ? { identityComparison } : {}),
  };
}

function nrhaMemberImportDecisionPayload(
  verification: NrhaMemberLookupVerification,
  rows: NrhaMemberDataImportRow[],
  acceptedKeys: Iterable<NrhaMemberDataImportRow["key"]>,
  identityComparison?: IdentityComparison,
) {
  const values = nrhaOfficialMemberValues(verification);
  const proposal = buildExternalImportProposal({
    subjectType: "contact",
    sourceCode: "NRHA_MEMBER_LOOKUP",
    sourceRecordKey: values.memberNumber,
    comparison: identityComparison,
    fields: rows.map(({ key, currentValue, proposedValue, changeType }) => ({ key, currentValue, proposedValue, changeType })),
  });

  return withExternalImportDecision(
    nrhaMemberVerificationPayload(verification, identityComparison),
    decideExternalImport(proposal, acceptedKeys),
  );
}

function nrhaMemberVerificationFromPayload(payload: Record<string, unknown> | null | undefined): NrhaMemberLookupVerification | null {
  const lookup = payload?.nrhaMemberLookup;
  return lookup && typeof lookup === "object" ? (lookup as NrhaMemberLookupVerification) : null;
}

function nrhaOfficialMemberValues(
  verification: NrhaMemberLookupVerification,
  fallback: {
    memberNumber?: number | string | null;
  } = {},
): NrhaOfficialMemberValues {
  const member = verification.member;
  const firstName = member?.firstName?.trim() || verification.officialFirstName || "";
  const lastName = member?.lastName?.trim() || verification.officialLastName || "";
  const fullName = member?.fullName?.trim() || verification.officialFullName || [firstName, lastName].filter(Boolean).join(" ");
  const middleName = member?.middleName?.trim() || deriveMiddleName(fullName, firstName, lastName);
  const memberNumber = member?.memberNumber ?? verification.memberNumber ?? fallback.memberNumber ?? null;

  return {
    address: member?.line1?.trim() ?? "",
    addressLine2: member?.line2?.trim() ?? "",
    city: member?.city?.trim() ?? "",
    country: normalizeNrhaCountry(member?.country),
    email: member?.emailAddress?.trim() || verification.officialEmailAddress || "",
    expiresOn: normalizeNrhaDate(member?.memberExpirationDate ?? verification.officialExpirationDate ?? ""),
    firstName,
    fullName,
    lastName,
    middleName,
    memberNumber: memberNumber ? String(memberNumber) : "",
    phone: member?.phoneNumber?.trim() ?? "",
    state: member?.state?.trim() ?? "",
    zipCode: member?.zip?.trim() ?? "",
  };
}

function nrhaMemberDataImportRows(values: NrhaOfficialMemberValues, current: NrhaMemberLocalValues, locale: Locale): NrhaMemberDataImportRow[] {
  const rows: NrhaMemberDataImportRow[] = [];

  maybePushRow(rows, {
    key: "memberNumber",
    label: uiText(locale, "Numéro NRHA", "NRHA number"),
    current: current.memberNumber,
    official: values.memberNumber,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityIdentifierEqual,
  });
  maybePushRow(rows, {
    key: "expiresOn",
    label: uiText(locale, "Expiration NRHA", "NRHA expiration"),
    current: current.expiresOn,
    official: values.expiresOn,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityTextEqual,
  });
  maybePushRow(rows, {
    key: "firstName",
    label: uiText(locale, "Prénom", "First name"),
    current: current.firstName,
    official: values.firstName,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityTextEqual,
  });
  maybePushRow(rows, {
    key: "middleName",
    label: uiText(locale, "Deuxième prénom", "Middle name"),
    current: current.middleName,
    official: values.middleName,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityTextEqual,
  });
  maybePushRow(rows, {
    key: "lastName",
    label: uiText(locale, "Nom", "Last name"),
    current: current.lastName,
    official: values.lastName,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityTextEqual,
  });
  maybePushRow(rows, {
    key: "email",
    label: uiText(locale, "Courriel", "Email"),
    current: current.email,
    official: values.email,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityEmailEqual,
  });
  maybePushRow(rows, {
    key: "phone",
    label: uiText(locale, "Téléphone", "Phone"),
    current: current.phone,
    official: values.phone,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityPhoneEqual,
  });
  maybePushRow(rows, {
    key: "address",
    label: uiText(locale, "Adresse", "Address"),
    current: current.address,
    official: values.address,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityTextEqual,
  });
  maybePushRow(rows, {
    key: "addressLine2",
    label: uiText(locale, "Adresse 2", "Address 2"),
    current: current.addressLine2,
    official: values.addressLine2,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityTextEqual,
  });
  maybePushRow(rows, {
    key: "city",
    label: uiText(locale, "Ville", "City"),
    current: current.city,
    official: values.city,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityTextEqual,
  });
  maybePushRow(rows, {
    key: "state",
    label: uiText(locale, "Province / État", "Province / State"),
    current: current.state,
    official: values.state,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityTextEqual,
  });
  maybePushRow(rows, {
    key: "zipCode",
    label: uiText(locale, "Code postal", "Postal code"),
    current: current.zipCode,
    official: values.zipCode,
    formatter: (value) => formatPlainValue(value, locale),
    compare: identityTextEqual,
  });
  maybePushRow(rows, {
    key: "country",
    label: uiText(locale, "Pays", "Country"),
    current: current.country,
    official: values.country,
    formatter: (value) => formatPlainValue(value, locale),
    compare: sameCountry,
  });

  return rows;
}

function maybePushRow(
  rows: NrhaMemberDataImportRow[],
  input: {
    key: NrhaMemberDataImportRow["key"];
    label: string;
    current: string;
    official: string;
    formatter: (value: string) => string;
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
    official: input.formatter(field.proposedValue),
  });
}

function nrhaMemberMismatchMessage(verification: NrhaMemberLookupVerification, locale: Locale, identityComparison?: IdentityComparison) {
  if (verification.status === "not_found") {
    return uiText(locale, "NRHA: aucun membre trouvé pour ce numéro.", "NRHA: no member found for this number.");
  }

  const comparisonMismatches = identityComparison?.evidence
    .filter((item) => item.outcome === "different")
    .map((item) => `${contactIdentityFieldLabel(item.field, locale)}: ${item.candidate || uiText(locale, "NRHA inconnu", "unknown in NRHA")}`) ?? [];
  const mismatches = comparisonMismatches.length ? comparisonMismatches : [
    nrhaCheckMismatchLabel(uiText(locale, "prénom", "first name"), verification.checks?.firstName, locale),
    nrhaCheckMismatchLabel(uiText(locale, "nom", "last name"), verification.checks?.lastName, locale),
    nrhaCheckMismatchLabel(uiText(locale, "nom complet", "full name"), verification.checks?.fullName, locale),
    nrhaCheckMismatchLabel(uiText(locale, "courriel", "email"), verification.checks?.emailAddress, locale),
  ].filter(Boolean);

  if (!mismatches.length) {
    return uiText(locale, "NRHA: les informations du membre ne correspondent pas.", "NRHA: member details do not match.");
  }

  return `${uiText(locale, "NRHA: informations non concordantes", "NRHA: details do not match")}: ${mismatches.join(" · ")}`;
}

function compareNrhaMemberIdentity(current: NrhaMemberLocalValues, official: NrhaOfficialMemberValues) {
  return compareExternalContactIdentity(
    {
      first_name: current.firstName,
      middle_name: current.middleName,
      last_name: current.lastName,
      email: current.email,
      phone: current.phone,
      external_identifier: current.memberNumber,
    },
    {
      first_name: official.firstName,
      middle_name: official.middleName,
      last_name: official.lastName,
      email: official.email,
      phone: official.phone,
      external_identifier: official.memberNumber,
    },
  );
}

function contactIdentityFieldLabel(field: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    identifier: ["numéro", "number"],
    first_name: ["prénom", "first name"],
    last_name: ["nom", "last name"],
    email: ["courriel", "email"],
    phone: ["téléphone", "phone"],
    date_of_birth: ["date de naissance", "birth date"],
  };
  const label = labels[field] ?? [field, field];
  return uiText(locale, label[0], label[1]);
}

function nrhaCheckMismatchLabel(label: string, check: NrhaMemberLookupCheck | undefined, locale: Locale) {
  if (!check || check.matched) {
    return null;
  }

  return `${label}: ${check.official || uiText(locale, "NRHA inconnu", "unknown in NRHA")}`;
}

function nrhaMemberStatus(values: NrhaOfficialMemberValues): ContactExternalIdentifier["status"] {
  if (!values.expiresOn) {
    return "active";
  }

  return values.expiresOn >= todayDateValue() ? "active" : "expired";
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

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatPlainValue(value: string, locale: Locale) {
  return value || uiText(locale, "Non renseigné", "Not set");
}

function sameCountry(current: string, official: string) {
  return normalizeNrhaCountry(current) === normalizeNrhaCountry(official);
}

function deriveMiddleName(fullName: string, firstName: string, lastName: string) {
  const fullParts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstParts = firstName.trim().split(/\s+/).filter(Boolean);
  const lastParts = lastName.trim().split(/\s+/).filter(Boolean);

  if (!fullParts.length || !firstParts.length || !lastParts.length) {
    return "";
  }

  const start = firstParts.length;
  const end = fullParts.length - lastParts.length;

  if (end <= start) {
    return "";
  }

  return fullParts.slice(start, end).join(" ");
}


function contactNrhaLocalValues(contact: Contact, memberNumber: string): NrhaMemberLocalValues {
  return {
    address: contact.address ?? "",
    addressLine2: contact.address_line2 ?? "",
    city: contact.city ?? "",
    country: contact.country ?? "",
    email: contact.email ?? "",
    expiresOn: "",
    firstName: contact.first_name,
    lastName: contact.last_name,
    middleName: contact.middle_name ?? "",
    memberNumber,
    phone: contact.phone ?? "",
    state: contact.state ?? "",
    zipCode: contact.zip_code ?? "",
  };
}

function normalizeNrhaCountry(value: string | null | undefined) {
  const cleanValue = value?.trim() ?? "";

  if (!cleanValue) {
    return "";
  }

  const upperValue = cleanValue.toUpperCase();

  if (/^[A-Z]{2}$/.test(upperValue)) {
    return upperValue;
  }

  const normalizedName = upperValue
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
  const countryByName: Record<string, string> = {
    AUSTRALIA: "AU",
    AUSTRALIE: "AU",
    BELGIQUE: "BE",
    BELGIUM: "BE",
    CAN: "CA",
    CANADA: "CA",
    FRANCE: "FR",
    "GREAT BRITAIN": "GB",
    MEXICO: "MX",
    MEXIQUE: "MX",
    "ROYAUME UNI": "GB",
    SUISSE: "CH",
    SWITZERLAND: "CH",
    UK: "GB",
    "UNITED KINGDOM": "GB",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    US: "US",
    USA: "US",
  };

  return countryByName[normalizedName] ?? upperValue.slice(0, 2);
}

export {
  contactNrhaLocalValues,
  compareNrhaMemberIdentity,
  integerFromMembershipNumber,
  nrhaMemberDataImportRows,
  nrhaMemberImportDecisionPayload,
  nrhaMemberMismatchMessage,
  nrhaMemberStatus,
  nrhaMemberVerificationFromPayload,
  nrhaMemberVerificationPayload,
  nrhaOfficialMemberValues,
};
export type { NrhaMemberDataImportRow, NrhaMemberLocalValues, NrhaMemberVerificationState, NrhaOfficialMemberValues };
