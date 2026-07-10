import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { divisionLabel, formatCurrency, formatDate, findById, horseLabel, contactLabel } from "../../lib/display";
import { normalizeGvlUrl } from "../../lib/gvlUrl";
import { getHorseCogginsValidity, getHorseVaccineValidity, organizationRequiresHealthVerification, type HealthGateStatus, type HorseCogginsValidity, type HorseVaccineValidity } from "../../lib/health";
import type { Locale } from "../../lib/i18n";
import { buildEntryShowReadiness, readinessItemClassName, readinessTone, type ReadinessResult } from "../../lib/readiness";
import type {
  ClassRecord,
  Contact,
  ContactExternalMembership,
  ContactRole,
  ContactRoleName,
  Division,
  Entry,
  ExternalOrganization,
  Horse,
  HorseContact,
  HorseExternalMembership,
  HorseHealthDocument,
  Invoice,
  InvoiceLineItem,
  Organization,
  OrganizationBackNumber,
  OrganizationExternalMembershipRequirement,
  SanctioningBody,
  Show,
  ShowDay,
  ShowScoreClassSetup,
  StallOption,
} from "../../types/domain";
import type { ViewKey } from "../../types/ui";

export function uiText(locale: Locale, fr: string, en: string) {
  return locale === "en" ? en : fr;
}

export function sortRecordsForOrganization<T extends { id: string }>(records: T[], organizationRecordIds: Set<string>) {
  return [...records].sort((a, b) => {
    const aLocal = organizationRecordIds.has(a.id);
    const bLocal = organizationRecordIds.has(b.id);

    if (aLocal === bLocal) {
      return 0;
    }

    return aLocal ? -1 : 1;
  });
}

export function buildExternalMembershipFields(
  contactType: Contact["type"],
  externalOrganizations: ExternalOrganization[],
  requirements: OrganizationExternalMembershipRequirement[],
  existingMemberships: ContactExternalMembership[] = [],
) {
  const requiredOrganizationIds = new Set(
    requirements
      .filter((requirement) => requirement.is_required && requirement.contact_type === contactType)
      .map((requirement) => requirement.external_organization_id),
  );
  const existingOrganizationIds = new Set(existingMemberships.map((membership) => membership.external_organization_id));
  const visibleOrganizations = [...externalOrganizations].sort((a, b) => {
    const aPinned = requiredOrganizationIds.has(a.id) || existingOrganizationIds.has(a.id);
    const bPinned = requiredOrganizationIds.has(b.id) || existingOrganizationIds.has(b.id);

    if (aPinned === bPinned) {
      return a.name.localeCompare(b.name);
    }

    return aPinned ? -1 : 1;
  });

  return visibleOrganizations.map((organization) => ({
    organization,
    required: requiredOrganizationIds.has(organization.id),
  }));
}

export function horseReferenceTypeForOrganization(organization: ExternalOrganization): HorseExternalMembership["reference_type"] {
  return organization.code.toUpperCase() === "NRHA" ? "competition_license" : "registration";
}

export function horseExternalReferenceLabel(organization: ExternalOrganization) {
  return organization.code.toUpperCase() === "NRHA" ? "NRHA Competition licence #" : `${organization.code} #`;
}

export function buildHorseExternalMembershipFields(externalOrganizations: ExternalOrganization[], existingMemberships: HorseExternalMembership[] = []) {
  const existingOrganizationIds = new Set(existingMemberships.map((membership) => membership.external_organization_id));

  return [...externalOrganizations].sort((a, b) => {
    const aPinned = existingOrganizationIds.has(a.id);
    const bPinned = existingOrganizationIds.has(b.id);

    if (aPinned === bPinned) {
      return a.name.localeCompare(b.name);
    }

    return aPinned ? -1 : 1;
  });
}

export function horseExternalReferenceSummary(horse: Horse, memberships: HorseExternalMembership[], externalOrganizations: ExternalOrganization[]) {
  const references = memberships
    .filter((membership) => membership.horse_id === horse.id)
    .map((membership) => {
      const organization = externalOrganizations.find((externalOrganization) => externalOrganization.id === membership.external_organization_id);
      return `${organization?.code ?? "Ext."} ${membership.reference_number}`;
    });

  return references.length ? references.join(" · ") : "Aucune référence externe";
}

export function latestHorseHealthDocument(horseId: string, documents: HorseHealthDocument[], documentType: HorseHealthDocument["document_type"]) {
  return [...documents]
    .filter((document) => document.horse_id === horseId && document.document_type === documentType)
    .sort((a, b) => {
      const aDate = a.test_or_administered_on ?? a.created_at;
      const bDate = b.test_or_administered_on ?? b.created_at;
      return bDate.localeCompare(aDate);
    })[0];
}

export function horseHealthStatusLabel(status: HorseHealthDocument["status"], locale: Locale = "fr") {
  const labels: Record<HorseHealthDocument["status"], { en: string; fr: string }> = {
    pending_review: { fr: "Révision", en: "Review" },
    verified: { fr: "Vérifié", en: "Verified" },
    approved: { fr: "Approuvé", en: "Approved" },
    rejected: { fr: "Refusé", en: "Rejected" },
    expired: { fr: "Expiré", en: "Expired" },
  };

  return labels[status][locale];
}

export type InlineHealthMessage = {
  tone: "success" | "info" | "error";
  message: string;
};

export type HorseHealthValidity = {
  coggins: HorseCogginsValidity;
  vaccine: HorseVaccineValidity;
  valid: boolean;
};

export function horseHealthResultMessage(document: HorseHealthDocument): InlineHealthMessage {
  if (document.status === "verified") {
    return {
      tone: "success",
      message: "Coggins GVL vérifié. Le PDF n'a pas été conservé parce que le lien GVL suffit.",
    };
  }

  if (document.status === "approved") {
    return {
      tone: "success",
      message: "Document santé approuvé.",
    };
  }

  if (document.document_url) {
    return {
      tone: "info",
      message: "Coggins en révision manuelle. Le PDF a été conservé dans les documents santé.",
    };
  }

  return {
    tone: "info",
    message: "Coggins en révision manuelle.",
  };
}

export function cogginsValidityMessage(validity: HorseCogginsValidity) {
  if (validity.status === "not_required") {
    return "Coggins non exigé par cette association.";
  }

  if (validity.status === "valid" && validity.expiresOn) {
    return `Coggins valide jusqu'au ${formatDate(validity.expiresOn)} (${validity.months} mois).`;
  }

  if (validity.status === "expired" && validity.expiresOn) {
    return `Coggins expiré depuis le ${formatDate(validity.expiresOn)}.`;
  }

  if (validity.status === "pending_review") {
    return "Coggins en révision manuelle.";
  }

  if (validity.status === "rejected") {
    return "Coggins refusé.";
  }

  return "Coggins manquant.";
}

export function cogginsValidityTagLabel(validity: HorseCogginsValidity, locale: Locale = "fr") {
  if (validity.status === "not_required") {
    return uiText(locale, "Non exigé", "Not required");
  }

  if (validity.status === "valid" && validity.expiresOn) {
    return uiText(locale, `Valide jusqu'au ${formatDate(validity.expiresOn)}`, `Valid until ${formatDate(validity.expiresOn)}`);
  }

  if (validity.status === "expired" && validity.expiresOn) {
    return uiText(locale, `Expiré le ${formatDate(validity.expiresOn)}`, `Expired on ${formatDate(validity.expiresOn)}`);
  }

  if (validity.status === "pending_review") {
    return uiText(locale, "En révision", "In review");
  }

  if (validity.status === "rejected") {
    return uiText(locale, "Refusé", "Rejected");
  }

  return uiText(locale, "Manquant", "Missing");
}

export function cogginsValidityBadgeClass(validity: HorseCogginsValidity) {
  if (validity.valid) {
    return "verified";
  }

  if (validity.status === "pending_review" || validity.status === "expired") {
    return validity.status;
  }

  return "rejected";
}

export function cogginsValidityTone(validity: HorseCogginsValidity): InlineHealthMessage["tone"] {
  return validity.valid ? "success" : validity.status === "pending_review" || validity.status === "not_required" ? "info" : "error";
}

export function vaccineValidityMessage(validity: HorseVaccineValidity) {
  if (validity.status === "not_required") {
    return "Vaccin non exigé par cette association.";
  }

  if (validity.status === "valid" && validity.expiresOn) {
    return `Vaccin valide jusqu'au ${formatDate(validity.expiresOn)} (${validity.months} mois).`;
  }

  if (validity.status === "expired" && validity.expiresOn) {
    return `Vaccin expiré depuis le ${formatDate(validity.expiresOn)}.`;
  }

  if (validity.status === "pending_review") {
    return "Vaccin en révision manuelle.";
  }

  if (validity.status === "rejected") {
    return "Vaccin refusé.";
  }

  return "Vaccin manquant.";
}

export function getHorseHealthValidity(input: {
  documents: HorseHealthDocument[];
  horseId: string;
  organization: Organization | null | undefined;
  referenceDate?: string | null;
}): HorseHealthValidity {
  const coggins = getHorseCogginsValidity(input);
  const vaccine = getHorseVaccineValidity(input);

  return {
    coggins,
    vaccine,
    valid: coggins.valid && vaccine.valid,
  };
}

export function horseHealthValidityMessage(validity: HorseHealthValidity) {
  if (!validity.coggins.valid) {
    return cogginsValidityMessage(validity.coggins);
  }

  if (!validity.vaccine.valid) {
    return vaccineValidityMessage(validity.vaccine);
  }

  if (validity.coggins.status === "not_required" && validity.vaccine.status === "not_required") {
    return "Documents santé non exigés par cette association.";
  }

  return [cogginsValidityMessage(validity.coggins), vaccineValidityMessage(validity.vaccine)].join(" · ");
}

export function horseHealthValidityTone(validity: HorseHealthValidity): InlineHealthMessage["tone"] {
  if (validity.valid) {
    return "success";
  }

  return validity.coggins.status === "pending_review" || validity.vaccine.status === "pending_review" ? "info" : "error";
}

export function horseHealthSummary(horse: Horse, documents: HorseHealthDocument[], organization: Organization | null | undefined) {
  const validity = getHorseHealthValidity({
    documents,
    horseId: horse.id,
    organization,
  });

  return horseHealthValidityMessage(validity);
}

export type HorseStatusTone = "success" | "warning" | "error" | "neutral";

export type HorseStatusChip = {
  label: string;
  tone: HorseStatusTone;
  value: string;
};

export function horseHealthDisplay(horse: Horse, documents: HorseHealthDocument[], organization: Organization | null | undefined) {
  const validity = getHorseHealthValidity({
    documents,
    horseId: horse.id,
    organization,
  });
  const chips = [healthGateChip("Coggins", validity.coggins), healthGateChip("Vaccin", validity.vaccine)];
  const hasPendingReview = validity.coggins.status === "pending_review" || validity.vaccine.status === "pending_review";
  const hasMissingInfo = validity.coggins.status === "missing" || validity.vaccine.status === "missing";
  const hasRejected = validity.coggins.status === "rejected" || validity.vaccine.status === "rejected";
  const hasExpired = validity.coggins.status === "expired" || validity.vaccine.status === "expired";
  const healthRequired = organizationRequiresHealthVerification(organization);

  if (!healthRequired) {
    return {
      chips,
      summary: {
        label: "Prêt",
        tone: "success" as const,
      },
    };
  }

  if (validity.valid) {
    return {
      chips,
      summary: {
        label: "Santé vérifiée",
        tone: "success" as const,
      },
    };
  }

  if (hasPendingReview) {
    return {
      chips,
      summary: {
        label: "En révision",
        tone: "warning" as const,
      },
    };
  }

  return {
    chips,
    summary: {
      label: hasMissingInfo ? "Info manquante" : hasRejected ? "À corriger" : hasExpired ? "Expiré" : "À vérifier",
      tone: "error" as const,
    },
  };
}

export function healthGateChip(label: string, validity: HorseCogginsValidity | HorseVaccineValidity): HorseStatusChip {
  if (validity.status === "not_required") {
    return { label, tone: "neutral", value: "Non requis" };
  }

  if (validity.status === "valid") {
    return { label, tone: "success", value: validity.expiresOn ? `Jusqu'au ${formatDate(validity.expiresOn)}` : "Vérifié" };
  }

  if (validity.status === "pending_review") {
    return { label, tone: "warning", value: "En révision" };
  }

  if (validity.status === "expired") {
    return { label, tone: "error", value: validity.expiresOn ? `Expiré ${formatDate(validity.expiresOn)}` : "Expiré" };
  }

  if (validity.status === "rejected") {
    return { label, tone: "error", value: "Refusé" };
  }

  return { label, tone: "error", value: "Manquant" };
}

export function horseExternalReferenceChips(horse: Horse, memberships: HorseExternalMembership[], externalOrganizations: ExternalOrganization[]): HorseStatusChip[] {
  const references = memberships
    .filter((membership) => membership.horse_id === horse.id)
    .sort((a, b) => {
      const aOrganization = externalOrganizations.find((organization) => organization.id === a.external_organization_id);
      const bOrganization = externalOrganizations.find((organization) => organization.id === b.external_organization_id);
      return (aOrganization?.code ?? "").localeCompare(bOrganization?.code ?? "");
    })
    .map((membership) => {
      const organization = externalOrganizations.find((externalOrganization) => externalOrganization.id === membership.external_organization_id);
      return {
        label: organization?.code ?? "Ext.",
        tone: horseExternalReferenceTone(membership.status),
        value: membership.reference_number || horseExternalReferenceStatusLabel(membership.status),
      };
    });

  return references.length ? references : [{ label: "Références", tone: "neutral", value: "Aucune" }];
}

export function horseExternalReferenceTone(status: HorseExternalMembership["status"]): HorseStatusTone {
  if (status === "active") {
    return "success";
  }

  if (status === "pending") {
    return "warning";
  }

  if (status === "expired") {
    return "error";
  }

  return "neutral";
}

export function horseExternalReferenceStatusLabel(status: HorseExternalMembership["status"]) {
  const labels: Record<HorseExternalMembership["status"], string> = {
    active: "Active",
    pending: "En révision",
    expired: "Expirée",
    unknown: "À valider",
  };

  return labels[status];
}

export function horseGenderLabel(gender: Horse["gender"]) {
  if (gender === "M") {
    return "Mâle";
  }

  if (gender === "F") {
    return "Femelle";
  }

  if (gender === "G") {
    return "Hongre";
  }

  return "Genre non indiqué";
}

export type HealthAlert = {
  detail: string;
  horse: Horse;
  key: string;
  label: string;
  referenceLabel: string;
  tone: "error" | "warning" | "info";
};

export function buildHealthAlerts(input: {
  documents: HorseHealthDocument[];
  horses: Horse[];
  organization: Organization | null | undefined;
  referenceShow: Show | null;
  today: string;
}) {
  if (!organizationRequiresHealthVerification(input.organization)) {
    return [];
  }

  const referenceDate = input.referenceShow?.start_date ?? input.today;
  const referenceLabel = input.referenceShow ? `${input.referenceShow.name} - ${formatDate(input.referenceShow.start_date)}` : formatDate(input.today);
  const alerts: HealthAlert[] = [];

  for (const horse of input.horses) {
    const validity = getHorseCogginsValidity({
      documents: input.documents,
      horseId: horse.id,
      organization: input.organization,
      referenceDate,
    });

    if (validity.status === "not_required") {
      continue;
    }

    if (!validity.valid) {
      alerts.push({
        detail: cogginsValidityMessage(validity),
        horse,
        key: `${horse.id}-${validity.status}`,
        label: healthAlertLabel(validity.status),
        referenceLabel,
        tone: validity.status === "pending_review" ? "warning" : "error",
      });
    } else if (validity.expiresOn) {
      const daysUntilExpiry = daysBetween(input.today, validity.expiresOn);

      if (daysUntilExpiry <= 30) {
        alerts.push({
          detail: `Coggins expire dans ${Math.max(daysUntilExpiry, 0)} jour${daysUntilExpiry === 1 ? "" : "s"} (${formatDate(validity.expiresOn)}).`,
          horse,
          key: `${horse.id}-coggins-expires-${validity.expiresOn}`,
          label: "Bientôt expiré",
          referenceLabel,
          tone: "warning",
        });
      }
    }

    const vaccineValidity = getHorseVaccineValidity({
      documents: input.documents,
      horseId: horse.id,
      organization: input.organization,
      referenceDate,
    });

    if (vaccineValidity.status === "not_required") {
      continue;
    }

    if (!vaccineValidity.valid) {
      alerts.push({
        detail: vaccineValidityMessage(vaccineValidity),
        horse,
        key: `${horse.id}-vaccine-${vaccineValidity.status}`,
        label: healthAlertLabel(vaccineValidity.status),
        referenceLabel,
        tone: vaccineValidity.status === "pending_review" ? "warning" : "error",
      });
    } else if (vaccineValidity.expiresOn) {
      const daysUntilExpiry = daysBetween(input.today, vaccineValidity.expiresOn);

      if (daysUntilExpiry <= 30) {
        alerts.push({
          detail: `Vaccin expire dans ${Math.max(daysUntilExpiry, 0)} jour${daysUntilExpiry === 1 ? "" : "s"} (${formatDate(vaccineValidity.expiresOn)}).`,
          horse,
          key: `${horse.id}-vaccine-expires-${vaccineValidity.expiresOn}`,
          label: "Bientôt expiré",
          referenceLabel,
          tone: "warning",
        });
      }
    }
  }

  return alerts.sort((a, b) => {
    const toneRank = { error: 0, warning: 1, info: 2 };
    return toneRank[a.tone] - toneRank[b.tone] || a.horse.name.localeCompare(b.horse.name);
  });
}

export function healthAlertLabel(status: HealthGateStatus) {
  if (status === "pending_review") {
    return "En révision";
  }

  if (status === "expired") {
    return "Expiré";
  }

  if (status === "rejected") {
    return "Refusé";
  }

  return "Bloquant";
}

export function healthDocumentTypeLabel(type: HorseHealthDocument["document_type"], locale: Locale = "fr") {
  const labels: Record<HorseHealthDocument["document_type"], { en: string; fr: string }> = {
    coggins_eia: { fr: "Coggins / EIA", en: "Coggins / EIA" },
    combo_vaccine: { fr: "Vaccin influenza/rhino", en: "Influenza/rhino vaccine" },
    influenza_vaccine: { fr: "Vaccin influenza", en: "Influenza vaccine" },
    other: { fr: "Autre document", en: "Other document" },
    rhino_vaccine: { fr: "Vaccin rhino", en: "Rhino vaccine" },
  };

  return labels[type][locale];
}

export function isVaccineHealthDocument(document: Pick<HorseHealthDocument, "document_type">) {
  return document.document_type === "combo_vaccine" || document.document_type === "influenza_vaccine" || document.document_type === "rhino_vaccine";
}

export function healthVerificationSourceLabel(source: HorseHealthDocument["verification_source"], locale: Locale = "fr") {
  const labels: Record<HorseHealthDocument["verification_source"], { en: string; fr: string }> = {
    gvl_api: { fr: "API GVL", en: "GVL API" },
    gvl_qr: { fr: "QR GVL", en: "GVL QR" },
    gvl_url: { fr: "Lien GVL", en: "GVL link" },
    manual: { fr: "Manuel", en: "Manual" },
    upload: { fr: "Fichier déposé", en: "Uploaded file" },
  };

  return labels[source][locale];
}

export function healthDocumentDateValue(document: HorseHealthDocument) {
  return document.test_or_administered_on ?? document.created_at.slice(0, 10);
}

export function healthDocumentDateLabel(document: HorseHealthDocument, locale: Locale = "fr") {
  const label = document.document_type === "coggins_eia" ? "Test" : uiText(locale, "Date", "Date");
  return `${label}: ${formatDate(healthDocumentDateValue(document))}`;
}

export function healthReviewNote(document: HorseHealthDocument, status: Extract<HorseHealthDocument["status"], "approved" | "rejected">) {
  const action = status === "approved" ? "approuvé" : "refusé";
  return `${healthDocumentTypeLabel(document.document_type)} ${action} depuis le centre de validation santé.`;
}

export function latestHorseVaccineDocument(horseId: string, documents: HorseHealthDocument[]) {
  const vaccineTypes: HorseHealthDocument["document_type"][] = ["combo_vaccine", "influenza_vaccine", "rhino_vaccine"];

  return [...documents]
    .filter((document) => document.horse_id === horseId && vaccineTypes.includes(document.document_type))
    .sort((a, b) => {
      const aDate = a.test_or_administered_on ?? a.created_at;
      const bDate = b.test_or_administered_on ?? b.created_at;
      return bDate.localeCompare(aDate);
    })[0];
}

export function todayDateValue() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.ceil((end - start) / 86_400_000);
}

export function birthYearFromDateValue(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const year = Number(value.slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

export async function resolveGvlCogginsUrl(pdfFile: File | null, fallbackUrl: string) {
  if (pdfFile) {
    const { extractGvlUrlFromPdf } = await import("../../lib/gvlPdf");
    return extractGvlUrlFromPdf(pdfFile);
  }

  const cleanUrl = fallbackUrl.trim();
  return cleanUrl ? normalizeGvlUrl(cleanUrl) ?? cleanUrl : null;
}

export function InlineHealthMessage({ value }: { value: InlineHealthMessage | null }) {
  if (!value) {
    return null;
  }

  return <p className={`inline-health-message ${value.tone}`}>{value.message}</p>;
}

export function ReadinessChecklist({ readiness }: { readiness: ReadinessResult | null }) {
  if (!readiness?.items.length) {
    return null;
  }

  return (
    <div className={`readiness-mini-list ${readiness.status}`}>
      <div className={`inline-health-message ${readinessTone(readiness)}`}>{readiness.message}</div>
      {readiness.items.map((item) => {
        const Icon = item.blocking ? AlertCircle : CheckCircle2;

        return (
          <div className={readinessItemClassName(item)} key={item.key}>
            <Icon size={16} />
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export type NotificationCategory = "health" | "entries" | "back-numbers" | "billing" | "memberships" | "shows";
export type NotificationPriority = "critical" | "warning" | "info";

export type NotificationItem = {
  actionLabel: string;
  category: NotificationCategory;
  detail: string;
  id: string;
  meta: string;
  priority: NotificationPriority;
  title: string;
  view: ViewKey;
};

export const notificationCategoryFilters: Array<{ key: "all" | NotificationCategory; label: string }> = [
  { key: "all", label: "Toutes" },
  { key: "health", label: "Santé" },
  { key: "entries", label: "Inscriptions" },
  { key: "back-numbers", label: "Dossards" },
  { key: "memberships", label: "Memberships" },
  { key: "billing", label: "Facturation" },
  { key: "shows", label: "Concours" },
];


export function buildNotificationItems(input: {
  backNumbers: OrganizationBackNumber[];
  classes: ClassRecord[];
  contactExternalMemberships: ContactExternalMembership[];
  contacts: Contact[];
  divisions: Division[];
  entries: Entry[];
  externalOrganizations: ExternalOrganization[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  invoices: Invoice[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  showDays: ShowDay[];
  showScoreClassSetups: ShowScoreClassSetup[];
  shows: Show[];
  stallOptions: StallOption[];
}) {
  const today = todayDateValue();
  const referenceShow = referenceShowForNotifications(input.shows, today);
  const activeEntries = input.entries.filter((entry) => !inactiveProgramEntryStatuses.has(entry.status));
  const notifications: NotificationItem[] = [];

  for (const document of input.horseHealthDocuments.filter((candidate) => candidate.status === "pending_review")) {
    const horse = findById(input.horses, document.horse_id);
    notifications.push({
      actionLabel: "Valider",
      category: "health",
      detail: `${healthDocumentTypeLabel(document.document_type)} pour ${horseLabel(horse)}.`,
      id: `health-document-${document.id}`,
      meta: `${healthVerificationSourceLabel(document.verification_source)} - ${healthDocumentDateLabel(document)}`,
      priority: "warning",
      title: "Document santé à valider",
      view: "health",
    });
  }

  for (const alert of buildHealthAlerts({
    documents: input.horseHealthDocuments,
    horses: input.horses,
    organization: input.organization,
    referenceShow,
    today,
  }).filter((alert) => alert.label !== "En révision")) {
    notifications.push({
      actionLabel: "Voir santé",
      category: "health",
      detail: `${alert.horse.name}: ${alert.detail}`,
      id: `health-alert-${alert.key}`,
      meta: alert.referenceLabel,
      priority: alert.tone === "error" ? "critical" : "warning",
      title: `Santé cheval - ${alert.label}`,
      view: "health",
    });
  }

  for (const entry of activeEntries.filter((candidate) => !candidate.entry_number)) {
    const division = findById(input.divisions, entry.division_id);
    const classRecord = division ? findById(input.classes, division.class_id) : null;
    const show = findById(input.shows, entry.show_id);
    const cutoffPassed = classRecord ? classEntriesAreClosed(classRecord) : false;

    notifications.push({
      actionLabel: "Assigner",
      category: "back-numbers",
      detail: `${horseLabel(findById(input.horses, entry.horse_id))} - ${divisionLabel(division, input.classes)}.`,
      id: `entry-back-number-${entry.id}`,
      meta: [show?.name, cutoffPassed ? "fermeture passée" : "avant fermeture"].filter(Boolean).join(" - "),
      priority: cutoffPassed ? "critical" : "warning",
      title: "Dossard manquant",
      view: "back-numbers",
    });
  }

  buildMembershipNotificationItems({
    activeEntries,
    contactExternalMemberships: input.contactExternalMemberships,
    contacts: input.contacts,
    divisions: input.divisions,
    externalOrganizations: input.externalOrganizations,
    horseHealthDocuments: input.horseHealthDocuments,
    horses: input.horses,
    membershipRequirements: input.membershipRequirements,
    organization: input.organization,
    shows: input.shows,
  }).forEach((notification) => notifications.push(notification));

  for (const invoice of input.invoices.filter((candidate) => !["paid", "void"].includes(candidate.status) && Number(candidate.balance_due ?? 0) > 0)) {
    const show = findById(input.shows, invoice.show_id);
    notifications.push({
      actionLabel: "Voir facture",
      category: "billing",
      detail: `#${formatInvoiceNumber(invoice.invoice_number)}: ${formatCurrency(invoice.balance_due, input.organization?.currency ?? "CAD")} à recevoir.`,
      id: `invoice-${invoice.id}`,
      meta: [show?.name, invoice.due_date ? `Échéance ${formatDate(invoice.due_date)}` : null].filter(Boolean).join(" - ") || "Facturation",
      priority: invoice.status === "overdue" ? "critical" : "warning",
      title: invoice.status === "overdue" ? "Facture en retard" : "Solde de facture ouvert",
      view: "billing",
    });
  }

  for (const classRecord of input.classes) {
    const classDivisionIds = new Set(input.divisions.filter((division) => division.class_id === classRecord.id).map((division) => division.id));
    const classEntries = activeEntries.filter((entry) => classDivisionIds.has(entry.division_id));

    if (!classEntries.length || !classEntriesAreClosed(classRecord) || classRecord.draw_prepared_at) {
      continue;
    }

    const missingBackNumberCount = classEntries.filter((entry) => !entry.entry_number).length;
    notifications.push({
      actionLabel: "Préparer",
      category: "entries",
      detail: `${classRecord.name}: ${classEntries.length} inscription${classEntries.length === 1 ? "" : "s"} prête${classEntries.length === 1 ? "" : "s"} pour l'ordre de passage.`,
      id: `draw-ready-${classRecord.id}`,
      meta: missingBackNumberCount ? `${missingBackNumberCount} dossard${missingBackNumberCount === 1 ? "" : "s"} manquant${missingBackNumberCount === 1 ? "" : "s"}` : "Fermeture passée",
      priority: missingBackNumberCount ? "critical" : "warning",
      title: "Ordre de passage à sortir",
      view: missingBackNumberCount ? "back-numbers" : "scoring",
    });
  }

  for (const show of input.shows.filter((candidate) => candidate.status !== "archived" && candidate.end_date >= today)) {
    const incompleteItems = buildShowReadinessItems(show, {
      classes: input.classes,
      divisions: input.divisions,
      entries: input.entries,
      invoices: input.invoices,
      showDays: input.showDays,
      showScoreClassSetups: input.showScoreClassSetups,
      stallOptions: input.stallOptions,
    }).filter((item) => !item.done && item.key !== "publication" && item.key !== "billing");

    if (!incompleteItems.length) {
      continue;
    }

    notifications.push({
      actionLabel: "Ouvrir concours",
      category: "shows",
      detail: `${show.name}: ${incompleteItems.map((item) => item.title.toLowerCase()).join(", ")} à compléter.`,
      id: `show-readiness-${show.id}`,
      meta: `${formatDate(show.start_date)} - ${formatDate(show.end_date)}`,
      priority: show.status === "open" ? "warning" : "info",
      title: "Concours incomplet",
      view: "shows",
    });
  }

  return notifications.sort((first, second) => notificationPriorityRank(first.priority) - notificationPriorityRank(second.priority) || first.category.localeCompare(second.category) || first.title.localeCompare(second.title));
}

export function buildMembershipNotificationItems(input: {
  activeEntries: Entry[];
  contactExternalMemberships: ContactExternalMembership[];
  contacts: Contact[];
  divisions: Division[];
  externalOrganizations: ExternalOrganization[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  shows: Show[];
}) {
  const grouped = new Map<string, NotificationItem & { count: number }>();

  for (const entry of input.activeEntries) {
    const horse = findById(input.horses, entry.horse_id);
    const readiness = buildEntryShowReadiness({
      contactExternalMemberships: input.contactExternalMemberships,
      documents: input.horseHealthDocuments,
      externalOrganizations: input.externalOrganizations,
      horse,
      membershipRequirements: input.membershipRequirements,
      organization: input.organization,
      ownerContact: findById(input.contacts, entry.owner_contact_id),
      payerContact: findById(input.contacts, entry.payer_contact_id),
      riderContact: findById(input.contacts, entry.rider_contact_id),
      show: findById(input.shows, entry.show_id),
      skipHorseHealth: true,
    });

    for (const item of readiness.blockingItems.filter((candidate) => candidate.key.startsWith("contact."))) {
      const existing = grouped.get(item.key);

      if (existing) {
        existing.count += 1;
        existing.meta = `${existing.count} inscription${existing.count === 1 ? "" : "s"} touchée${existing.count === 1 ? "" : "s"}`;
        continue;
      }

      grouped.set(item.key, {
        actionLabel: "Corriger contact",
        category: "memberships",
        count: 1,
        detail: item.detail,
        id: `membership-${item.key}`,
        meta: "1 inscription touchée",
        priority: item.status === "pending" ? "warning" : "critical",
        title: item.title,
        view: "people",
      });
    }
  }

  return Array.from(grouped.values()).map(({ count: _count, ...notification }) => notification);
}

export function referenceShowForNotifications(shows: Show[], today: string) {
  const upcomingShows = [...shows]
    .filter((show) => show.status !== "archived" && show.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  return upcomingShows[0] ?? [...shows].filter((show) => show.status !== "archived").sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
}

export function notificationPriorityLabel(priority: NotificationPriority) {
  if (priority === "critical") {
    return "Urgent";
  }

  if (priority === "warning") {
    return "À traiter";
  }

  return "Info";
}

export function notificationPriorityRank(priority: NotificationPriority) {
  if (priority === "critical") {
    return 0;
  }

  if (priority === "warning") {
    return 1;
  }

  return 2;
}

export function contactRoleSummary(contact: Contact, contactRoles: ContactRole[], locale: Locale = "fr") {
  const roles = contactRoles.filter((role) => role.contact_id === contact.id).map((role) => role.role);
  const unique = Array.from(new Set(roles.length ? roles : [contact.type]));

  return unique.map((role) => contactRoleDisplayLabel(role, locale)).join(" / ");
}

export function contactRoleDisplayLabel(role: ContactRoleName, locale: Locale) {
  switch (role) {
    case "owner":
      return uiText(locale, "Propriétaire", "Owner");
    case "agent":
      return "Agent";
    case "rider":
      return uiText(locale, "Cavalier", "Rider");
    case "payer":
      return uiText(locale, "Payeur", "Payer");
    case "booker":
      return uiText(locale, "Réservataire", "Booker");
    case "other":
    default:
      return uiText(locale, "Autre", "Other");
  }
}

export function normalizeDirectorySearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function matchesDirectorySearch(values: Array<string | null | undefined>, query: string) {
  return values.some((value) => normalizeDirectorySearch(value ?? "").includes(query));
}

export function contactMatchesDirectorySearch(contact: Contact, contactRoles: ContactRole[], query: string) {
  return matchesDirectorySearch(
    [
      contactLabel(contact),
      contactRoleSummary(contact, contactRoles),
      contact.type,
      contact.email,
      contact.phone,
      contact.barn_name,
    ],
    query,
  );
}

export function horseMatchesDirectorySearch(
  horse: Horse,
  contacts: Contact[],
  memberships: HorseExternalMembership[],
  externalOrganizations: ExternalOrganization[],
  query: string,
) {
  const owner = findById(contacts, horse.primary_owner_contact_id);
  const membershipValues = memberships
    .filter((membership) => membership.horse_id === horse.id)
    .flatMap((membership) => {
      const externalOrganization = findById(externalOrganizations, membership.external_organization_id);
      return [externalOrganization?.code, externalOrganization?.name, membership.reference_number, membership.status];
    });

  return matchesDirectorySearch(
    [
      horse.name,
      horse.breed,
      horse.color,
      horse.gender,
      horseGenderLabel(horse.gender),
      horse.registration_number,
      horse.sire_name,
      horse.dam_name,
      contactLabel(owner),
      owner?.email,
      owner?.barn_name,
      horseExternalReferenceSummary(horse, memberships, externalOrganizations),
      ...membershipValues,
    ],
    query,
  );
}

export function entryNumberValue(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : null;
}

export function organizationBackNumberMode(organization: Organization | null | undefined): OrganizationBackNumber["assignment_mode"] {
  return organization?.back_number_policy === "rider" || organization?.back_number_policy === "horse_rider_team" ? organization.back_number_policy : "horse";
}

export function backNumberModeNeedsHorse(mode: OrganizationBackNumber["assignment_mode"]) {
  return mode === "horse" || mode === "horse_rider_team";
}

export function backNumberModeNeedsRider(mode: OrganizationBackNumber["assignment_mode"]) {
  return mode === "rider" || mode === "horse_rider_team";
}

export function backNumberAssignmentMatchesTarget(
  backNumber: OrganizationBackNumber,
  mode: OrganizationBackNumber["assignment_mode"],
  horseId: string | null,
  riderContactId: string | null,
) {
  if (backNumber.assignment_mode !== mode) {
    return false;
  }

  if (mode === "horse") {
    return backNumber.assigned_horse_id === horseId;
  }

  if (mode === "rider") {
    return backNumber.assigned_rider_contact_id === riderContactId;
  }

  return backNumber.assigned_horse_id === horseId && backNumber.assigned_rider_contact_id === riderContactId;
}

export function backNumberAssigneeLabel(backNumber: OrganizationBackNumber, horses: Horse[], contacts: Contact[], locale: Locale = "fr") {
  const horse = backNumber.assigned_horse_id ? findById(horses, backNumber.assigned_horse_id) : undefined;
  const rider = backNumber.assigned_rider_contact_id ? findById(contacts, backNumber.assigned_rider_contact_id) : undefined;

  if (backNumber.status !== "assigned") {
    return uiText(locale, "Non assigné", "Unassigned");
  }

  if (backNumber.assignment_mode === "horse_rider_team") {
    return `${horseLabel(horse)} + ${contactLabel(rider)}`;
  }

  if (backNumber.assignment_mode === "rider") {
    return contactLabel(rider);
  }

  return horseLabel(horse);
}

export function backNumberAssignmentMeta(backNumber: OrganizationBackNumber, locale: Locale = "fr") {
  if (backNumber.status === "assigned" && backNumber.assigned_at) {
    return uiText(locale, `Assigné le ${formatDate(backNumber.assigned_at.slice(0, 10))}`, `Assigned on ${formatDate(backNumber.assigned_at.slice(0, 10))}`);
  }

  return uiText(locale, "Inventaire association", "Association inventory");
}

export function backNumberModeLabel(mode: OrganizationBackNumber["assignment_mode"], locale: Locale = "fr") {
  if (mode === "horse_rider_team") {
    return uiText(locale, "Équipe cheval+cavalier", "Horse+rider team");
  }

  if (mode === "rider") {
    return uiText(locale, "Cavalier", "Rider");
  }

  return uiText(locale, "Cheval", "Horse");
}

export function backNumberStatusLabel(status: OrganizationBackNumber["status"], locale: Locale = "fr") {
  if (status === "available") {
    return uiText(locale, "Disponible", "Available");
  }

  if (status === "assigned") {
    return uiText(locale, "Assigné", "Assigned");
  }

  if (status === "reserved") {
    return uiText(locale, "Réservé", "Reserved");
  }

  if (status === "lost") {
    return uiText(locale, "Perdu", "Lost");
  }

  return uiText(locale, "Retiré", "Retired");
}

export function backNumberStatusBadgeClass(status: OrganizationBackNumber["status"]) {
  if (status === "available" || status === "assigned") {
    return "info";
  }

  if (status === "reserved") {
    return "warning";
  }

  return "error";
}

export function contactBackNumberDetail(contact: Contact, selectedHorse: Horse | null, horseContacts: HorseContact[]) {
  if (!selectedHorse) {
    return contact.email || contact.type;
  }

  const horseContact = horseContacts.find((candidate) => candidate.horse_id === selectedHorse.id && candidate.contact_id === contact.id);
  return horseContact ? `Lie au cheval - ${horseContact.role}` : contact.email || contact.type;
}

export function buildShowReadinessItems(
  show: Show,
  context: {
    locale?: Locale;
    classes: ClassRecord[];
    divisions: Division[];
    entries: Entry[];
    invoices: Invoice[];
    showDays: ShowDay[];
    showScoreClassSetups: ShowScoreClassSetup[];
    stallOptions: StallOption[];
  },
): ShowReadinessItem[] {
  const locale = context.locale ?? "fr";
  const showDays = context.showDays.filter((day) => day.show_id === show.id);
  const showClasses = context.classes.filter((classRecord) => classRecord.show_id === show.id);
  const showDivisions = context.divisions.filter((division) => division.show_id === show.id);
  const showEntries = context.entries.filter((entry) => entry.show_id === show.id);
  const showStallOptions = context.stallOptions.filter((option) => option.show_id === show.id);
  const showInvoices = context.invoices.filter((invoice) => invoice.show_id === show.id);
  const preparedClassIds = new Set(context.showScoreClassSetups.filter((setup) => setup.show_id === show.id).map((setup) => setup.class_id));
  const preparedClasses = showClasses.filter((classRecord) => preparedClassIds.has(classRecord.id)).length;

  return [
    {
      key: "days",
      title: uiText(locale, "Journées", "Show days"),
      detail: showDays.length ? uiText(locale, `${showDays.length} journée${showDays.length === 1 ? "" : "s"} générée${showDays.length === 1 ? "" : "s"}.`, `${showDays.length} day${showDays.length === 1 ? "" : "s"} generated.`) : uiText(locale, "Les journées apparaîtront depuis les dates du concours.", "Days will be generated from show dates."),
      done: showDays.length > 0,
      view: "shows",
      actionLabel: uiText(locale, "Vérifier", "Review"),
    },
    {
      key: "classes",
      title: uiText(locale, "Blocs", "Schedule blocks"),
      detail: showClasses.length ? uiText(locale, `${showClasses.length} bloc${showClasses.length === 1 ? "" : "s"} à l'horaire.`, `${showClasses.length} schedule block${showClasses.length === 1 ? "" : "s"} in the schedule.`) : uiText(locale, "Aucun bloc créé.", "No schedule blocks created."),
      done: showClasses.length > 0,
      view: "classes",
      actionLabel: showClasses.length ? uiText(locale, "Ajuster", "Adjust") : uiText(locale, "Ajouter", "Add"),
    },
    {
      key: "divisions",
      title: uiText(locale, "Classes", "Classes"),
      detail: showDivisions.length ? uiText(locale, `${showDivisions.length} classe${showDivisions.length === 1 ? "" : "s"} disponible${showDivisions.length === 1 ? "" : "s"}.`, `${showDivisions.length} class${showDivisions.length === 1 ? "" : "es"} available.`) : uiText(locale, "Aucune classe disponible.", "No classes available."),
      done: showDivisions.length > 0,
      view: "classes",
      actionLabel: showDivisions.length ? uiText(locale, "Ajuster", "Adjust") : uiText(locale, "Ajouter", "Add"),
    },
    {
      key: "stalls",
      title: uiText(locale, "Stalls et extras", "Stalls and extras"),
      detail: showStallOptions.length ? uiText(locale, `${showStallOptions.length} produit${showStallOptions.length === 1 ? "" : "s"} réservable${showStallOptions.length === 1 ? "" : "s"}.`, `${showStallOptions.length} reservable item${showStallOptions.length === 1 ? "" : "s"}.`) : uiText(locale, "Aucun produit de réservation.", "No reservation products."),
      done: showStallOptions.length > 0,
      view: "stalls",
      actionLabel: showStallOptions.length ? uiText(locale, "Ajuster", "Adjust") : uiText(locale, "Configurer", "Configure"),
    },
    {
      key: "entries",
      title: uiText(locale, "Inscriptions", "Entries"),
      detail: showEntries.length ? uiText(locale, `${showEntries.length} inscription${showEntries.length === 1 ? "" : "s"} créée${showEntries.length === 1 ? "" : "s"}.`, `${showEntries.length} entr${showEntries.length === 1 ? "y" : "ies"} created.`) : uiText(locale, "Les inscriptions arriveront ici.", "Entries will appear here."),
      done: showEntries.length > 0,
      view: "entries",
      actionLabel: uiText(locale, "Ouvrir", "Open"),
    },
    {
      key: "scoring",
      title: uiText(locale, "Pointage", "Scoring"),
      detail: showClasses.length ? uiText(locale, `${preparedClasses}/${showClasses.length} bloc${showClasses.length === 1 ? "" : "s"} préparé${showClasses.length === 1 ? "" : "s"}.`, `${preparedClasses}/${showClasses.length} schedule block${showClasses.length === 1 ? "" : "s"} prepared.`) : uiText(locale, "Crée des blocs avant le pointage.", "Create schedule blocks before scoring."),
      done: showClasses.length > 0 && preparedClasses === showClasses.length,
      view: "scoring",
      actionLabel: uiText(locale, "Préparer", "Prepare"),
    },
    {
      key: "billing",
      title: uiText(locale, "Facturation", "Billing"),
      detail: showInvoices.length ? uiText(locale, `${showInvoices.length} facture${showInvoices.length === 1 ? "" : "s"} liée${showInvoices.length === 1 ? "" : "s"} au concours.`, `${showInvoices.length} invoice${showInvoices.length === 1 ? "" : "s"} linked to the show.`) : uiText(locale, "Aucune facture liée au concours.", "No invoices linked to the show."),
      done: showInvoices.length > 0,
      view: "billing",
      actionLabel: uiText(locale, "Voir", "View"),
    },
    {
      key: "publication",
      title: "Publication",
      detail: show.status === "open" ? uiText(locale, "Les inscriptions sont ouvertes.", "Entries are open.") : uiText(locale, "Le concours est encore en brouillon.", "The show is still in draft."),
      done: show.status === "open",
    },
  ];
}


export function formatInvoiceNumber(value: string) {
  const normalized = value.trim();
  return /^\d{1,4}$/.test(normalized) ? normalized.padStart(4, "0") : normalized;
}

export function classEntriesCloseDate(classRecord: ClassRecord | null | undefined) {
  if (!classRecord?.entries_close_at) {
    return null;
  }

  const closeDate = new Date(classRecord.entries_close_at);
  return Number.isNaN(closeDate.getTime()) ? null : closeDate;
}

export function classEntriesAreClosed(classRecord: ClassRecord | null | undefined) {
  const closeDate = classEntriesCloseDate(classRecord);
  return !closeDate || Date.now() >= closeDate.getTime();
}

export const inactiveProgramEntryStatuses = new Set<Entry["status"]>(["cancelled", "scratched", "scratched_pending_refund"]);

export type ShowReadinessItem = {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  view?: ViewKey;
  actionLabel?: string;
};

export function showStatusLabel(status: Show["status"], locale: Locale = "fr") {
  switch (status) {
    case "open":
      return uiText(locale, "Ouvert", "Open");
    case "closed":
      return uiText(locale, "Fermé", "Closed");
    case "archived":
      return uiText(locale, "Archivé", "Archived");
    case "draft":
    default:
      return uiText(locale, "Brouillon", "Draft");
  }
}
