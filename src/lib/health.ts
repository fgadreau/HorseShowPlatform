import type { HorseHealthDocument, Organization } from "../types/domain";

export type CogginsGateStatus = "not_required" | "valid" | "expired" | "pending_review" | "rejected" | "missing";

export type HorseCogginsValidity = {
  document: HorseHealthDocument | null;
  expiresOn: string | null;
  months: 6 | 12;
  referenceDate: string | null;
  required: boolean;
  status: CogginsGateStatus;
  valid: boolean;
};

const acceptedCogginsStatuses = new Set<HorseHealthDocument["status"]>(["approved", "verified"]);

export function organizationRequiresHealthVerification(organization: Organization | null | undefined) {
  return organization?.health_verification_required !== false;
}

export function organizationCogginsValidityMonths(organization: Organization | null | undefined): 6 | 12 {
  return organization?.coggins_validity_months === 6 ? 6 : 12;
}

export function cogginsExpiresOn(testDate: string | null | undefined, organization: Organization | null | undefined) {
  if (!testDate) {
    return null;
  }

  return addMonthsToDateValue(testDate, organizationCogginsValidityMonths(organization));
}

export function getHorseCogginsValidity(input: {
  documents: HorseHealthDocument[];
  horseId: string;
  organization: Organization | null | undefined;
  referenceDate?: string | null;
}): HorseCogginsValidity {
  const required = organizationRequiresHealthVerification(input.organization);
  const months = organizationCogginsValidityMonths(input.organization);
  const referenceDate = input.referenceDate ?? todayDateValue();
  const cogginsDocuments = latestFirst(
    input.documents.filter((document) => document.horse_id === input.horseId && document.document_type === "coggins_eia"),
  );

  if (!required) {
    return {
      document: cogginsDocuments[0] ?? null,
      expiresOn: cogginsExpiresOn(cogginsDocuments[0]?.test_or_administered_on, input.organization),
      months,
      referenceDate,
      required,
      status: "not_required",
      valid: true,
    };
  }

  const acceptedDocuments: Array<{ document: HorseHealthDocument; expiresOn: string }> = [];

  for (const document of cogginsDocuments) {
    if (!acceptedCogginsStatuses.has(document.status) || !document.test_or_administered_on) {
      continue;
    }

    const expiresOn = addMonthsToDateValue(document.test_or_administered_on, months);

    if (expiresOn) {
      acceptedDocuments.push({ document, expiresOn });
    }
  }

  acceptedDocuments.sort((a, b) => b.expiresOn.localeCompare(a.expiresOn));
  const validDocument = acceptedDocuments.find((candidate) => candidate.expiresOn >= referenceDate);

  if (validDocument) {
    return {
      document: validDocument.document,
      expiresOn: validDocument.expiresOn,
      months,
      referenceDate,
      required,
      status: "valid",
      valid: true,
    };
  }

  if (acceptedDocuments.length) {
    return {
      document: acceptedDocuments[0].document,
      expiresOn: acceptedDocuments[0].expiresOn,
      months,
      referenceDate,
      required,
      status: "expired",
      valid: false,
    };
  }

  const latest = cogginsDocuments[0] ?? null;

  if (latest?.status === "pending_review") {
    return {
      document: latest,
      expiresOn: cogginsExpiresOn(latest.test_or_administered_on, input.organization),
      months,
      referenceDate,
      required,
      status: "pending_review",
      valid: false,
    };
  }

  if (latest?.status === "rejected") {
    return {
      document: latest,
      expiresOn: cogginsExpiresOn(latest.test_or_administered_on, input.organization),
      months,
      referenceDate,
      required,
      status: "rejected",
      valid: false,
    };
  }

  return {
    document: latest,
    expiresOn: cogginsExpiresOn(latest?.test_or_administered_on, input.organization),
    months,
    referenceDate,
    required,
    status: "missing",
    valid: false,
  };
}

function latestFirst(documents: HorseHealthDocument[]) {
  return [...documents].sort((a, b) => {
    const aDate = a.test_or_administered_on ?? a.created_at;
    const bDate = b.test_or_administered_on ?? b.created_at;
    return bDate.localeCompare(aDate);
  });
}

function addMonthsToDateValue(value: string, months: number) {
  const parts = value.split("-").map(Number);

  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [year, month, day] = parts;
  const result = new Date(Date.UTC(year, month - 1 + months, day));

  if (result.getUTCDate() !== day) {
    result.setUTCDate(0);
  }

  return result.toISOString().slice(0, 10);
}

function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}
