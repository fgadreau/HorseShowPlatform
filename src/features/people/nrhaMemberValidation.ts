import type { Locale } from "../../lib/i18n";
import type { NrhaMemberLookupCheck, NrhaMemberLookupVerification } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership } from "../../types/domain";
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

function nrhaMemberVerificationPayload(verification: NrhaMemberLookupVerification): Record<string, unknown> {
  return {
    nrhaMemberLookup: verification as unknown,
  };
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
    compare: sameNumber,
  });
  maybePushRow(rows, {
    key: "expiresOn",
    label: uiText(locale, "Expiration NRHA", "NRHA expiration"),
    current: current.expiresOn,
    official: values.expiresOn,
    formatter: (value) => formatPlainValue(value, locale),
    compare: sameText,
  });
  maybePushRow(rows, {
    key: "firstName",
    label: uiText(locale, "Prénom", "First name"),
    current: current.firstName,
    official: values.firstName,
    formatter: (value) => formatPlainValue(value, locale),
    compare: sameText,
  });
  maybePushRow(rows, {
    key: "middleName",
    label: uiText(locale, "Deuxième prénom", "Middle name"),
    current: current.middleName,
    official: values.middleName,
    formatter: (value) => formatPlainValue(value, locale),
    compare: sameText,
  });
  maybePushRow(rows, {
    key: "lastName",
    label: uiText(locale, "Nom", "Last name"),
    current: current.lastName,
    official: values.lastName,
    formatter: (value) => formatPlainValue(value, locale),
    compare: sameText,
  });
  maybePushRow(rows, {
    key: "email",
    label: uiText(locale, "Courriel", "Email"),
    current: current.email,
    official: values.email,
    formatter: (value) => formatPlainValue(value, locale),
    compare: (currentValue, officialValue) => currentValue.trim().toLowerCase() === officialValue.trim().toLowerCase(),
  });
  maybePushRow(rows, {
    key: "phone",
    label: uiText(locale, "Téléphone", "Phone"),
    current: current.phone,
    official: values.phone,
    formatter: (value) => formatPlainValue(value, locale),
    compare: samePhone,
  });
  maybePushRow(rows, {
    key: "address",
    label: uiText(locale, "Adresse", "Address"),
    current: current.address,
    official: values.address,
    formatter: (value) => formatPlainValue(value, locale),
    compare: sameText,
  });
  maybePushRow(rows, {
    key: "addressLine2",
    label: uiText(locale, "Adresse 2", "Address 2"),
    current: current.addressLine2,
    official: values.addressLine2,
    formatter: (value) => formatPlainValue(value, locale),
    compare: sameText,
  });
  maybePushRow(rows, {
    key: "city",
    label: uiText(locale, "Ville", "City"),
    current: current.city,
    official: values.city,
    formatter: (value) => formatPlainValue(value, locale),
    compare: sameText,
  });
  maybePushRow(rows, {
    key: "state",
    label: uiText(locale, "Province / État", "Province / State"),
    current: current.state,
    official: values.state,
    formatter: (value) => formatPlainValue(value, locale),
    compare: sameText,
  });
  maybePushRow(rows, {
    key: "zipCode",
    label: uiText(locale, "Code postal", "Postal code"),
    current: current.zipCode,
    official: values.zipCode,
    formatter: (value) => formatPlainValue(value, locale),
    compare: sameText,
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
  const officialValue = input.official.trim();

  if (!officialValue) {
    return;
  }

  const currentValue = input.current.trim();
  const matches = input.compare ? input.compare(currentValue, officialValue) : currentValue === officialValue;

  if (matches) {
    return;
  }

  rows.push({
    key: input.key,
    label: input.label,
    current: input.formatter(currentValue),
    official: input.formatter(officialValue),
  });
}

function nrhaMemberMismatchMessage(verification: NrhaMemberLookupVerification, locale: Locale) {
  if (verification.status === "not_found") {
    return uiText(locale, "NRHA: aucun membre trouvé pour ce numéro.", "NRHA: no member found for this number.");
  }

  const mismatches = [
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

function nrhaCheckMismatchLabel(label: string, check: NrhaMemberLookupCheck | undefined, locale: Locale) {
  if (!check || check.matched) {
    return null;
  }

  return `${label}: ${check.official || uiText(locale, "NRHA inconnu", "unknown in NRHA")}`;
}

function nrhaMemberStatus(values: NrhaOfficialMemberValues): ContactExternalMembership["status"] {
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

function sameNumber(current: string, official: string) {
  const currentDigits = current.replace(/\D/g, "");
  const officialDigits = official.replace(/\D/g, "");

  return Boolean(currentDigits && officialDigits && currentDigits === officialDigits) || current.trim() === official.trim();
}

function samePhone(current: string, official: string) {
  const currentDigits = current.replace(/\D/g, "");
  const officialDigits = official.replace(/\D/g, "");

  return Boolean(currentDigits && officialDigits && currentDigits === officialDigits) || sameText(current, official);
}

function sameCountry(current: string, official: string) {
  return normalizeNrhaCountry(current) === normalizeNrhaCountry(official);
}

function sameText(current: string, official: string) {
  return normalizeText(current) === normalizeText(official);
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

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
  integerFromMembershipNumber,
  nrhaMemberDataImportRows,
  nrhaMemberMismatchMessage,
  nrhaMemberStatus,
  nrhaMemberVerificationFromPayload,
  nrhaMemberVerificationPayload,
  nrhaOfficialMemberValues,
};
export type { NrhaMemberDataImportRow, NrhaMemberLocalValues, NrhaMemberVerificationState, NrhaOfficialMemberValues };
