import { useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { classLabel, formatCurrency, formatDate, findById, horseLabel, contactLabel } from "../../lib/display";
import { normalizeGvlUrl } from "../../lib/gvlUrl";
import type { Locale } from "../../lib/i18n";
import { buildEntryShowReadiness, readinessItemClassName, readinessTone, type ReadinessResult } from "../../lib/readiness";
import type {
  Block,
  Contact,
  ContactExternalIdentifier,
  ContactRole,
  ContactRoleName,
  ClassRecord,
  Entry,
  ExternalCredentialIssuer,
  Horse,
  HorseContact,
  HorseExternalIdentifier,
  HorseHealthComplianceOverview,
  HorseHealthDocument,
  Invoice,
  InvoiceLineItem,
  Organization,
  OrganizationBackNumber,
  OrganizationExternalCredentialRequirement,
  SanctioningBody,
  Show,
  ShowDay,
  ShowScoreBlockSetup,
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
  externalCredentialIssuers: ExternalCredentialIssuer[],
  requirements: OrganizationExternalCredentialRequirement[],
  existingMemberships: ContactExternalIdentifier[] = [],
) {
  const requiredOrganizationIds = new Set(
    requirements
      .filter((requirement) => requirement.is_required && requirement.contact_type === contactType)
      .map((requirement) => requirement.external_credential_issuer_id),
  );
  const existingOrganizationIds = new Set(existingMemberships.map((membership) => membership.external_credential_issuer_id));
  const visibleOrganizations = [...externalCredentialIssuers].sort((a, b) => {
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

export function horseReferenceTypeForOrganization(organization: ExternalCredentialIssuer): HorseExternalIdentifier["identifier_type"] {
  return organization.code.toUpperCase() === "NRHA" ? "competition_license" : "registration";
}

export function horseExternalReferenceLabel(organization: ExternalCredentialIssuer) {
  return organization.code.toUpperCase() === "NRHA" ? "NRHA Competition licence #" : `${organization.code} #`;
}

export function buildHorseExternalIdentifierFields(externalCredentialIssuers: ExternalCredentialIssuer[], existingMemberships: HorseExternalIdentifier[] = []) {
  const existingOrganizationIds = new Set(existingMemberships.map((membership) => membership.external_credential_issuer_id));

  return [...externalCredentialIssuers].sort((a, b) => {
    const aPinned = existingOrganizationIds.has(a.id);
    const bPinned = existingOrganizationIds.has(b.id);

    if (aPinned === bPinned) {
      return a.name.localeCompare(b.name);
    }

    return aPinned ? -1 : 1;
  });
}

export function horseExternalReferenceSummary(horse: Horse, memberships: HorseExternalIdentifier[], externalCredentialIssuers: ExternalCredentialIssuer[]) {
  const references = memberships
    .filter((membership) => membership.horse_id === horse.id)
    .map((membership) => {
      const organization = externalCredentialIssuers.find((externalCredentialIssuer) => externalCredentialIssuer.id === membership.external_credential_issuer_id);
      return `${organization?.code ?? "Ext."} ${membership.identifier_value}`;
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

export type HorseStatusTone = "success" | "warning" | "error" | "neutral";

export type HorseStatusChip = {
  label: string;
  tone: HorseStatusTone;
  value: string;
};

export function horseExternalReferenceChips(horse: Horse, memberships: HorseExternalIdentifier[], externalCredentialIssuers: ExternalCredentialIssuer[]): HorseStatusChip[] {
  const references = memberships
    .filter((membership) => membership.horse_id === horse.id)
    .sort((a, b) => {
      const aOrganization = externalCredentialIssuers.find((organization) => organization.id === a.external_credential_issuer_id);
      const bOrganization = externalCredentialIssuers.find((organization) => organization.id === b.external_credential_issuer_id);
      return (aOrganization?.code ?? "").localeCompare(bOrganization?.code ?? "");
    })
    .map((membership) => {
      const organization = externalCredentialIssuers.find((externalCredentialIssuer) => externalCredentialIssuer.id === membership.external_credential_issuer_id);
      return {
        label: organization?.code ?? "Ext.",
        tone: horseExternalReferenceTone(membership.status),
        value: membership.identifier_value || horseExternalReferenceStatusLabel(membership.status),
      };
    });

  return references.length ? references : [{ label: "Références", tone: "neutral", value: "Aucune" }];
}

export function horseExternalReferenceTone(status: HorseExternalIdentifier["status"]): HorseStatusTone {
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

export function horseExternalReferenceStatusLabel(status: HorseExternalIdentifier["status"]) {
  const labels: Record<HorseExternalIdentifier["status"], string> = {
    active: "Active",
    pending: "En révision",
    expired: "Expirée",
    inactive: "Inactive",
    revoked: "Révoquée",
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

export function healthDocumentTypeLabel(type: HorseHealthDocument["document_type"], locale: Locale = "fr") {
  const labels: Record<HorseHealthDocument["document_type"], { en: string; fr: string }> = {
    coggins_eia: { fr: "Coggins / EIA", en: "Coggins / EIA" },
    breed_registration: { fr: "Enregistrement de race", en: "Breed registration" },
    breed_pedigree: { fr: "Pedigree", en: "Pedigree" },
    combo_vaccine: { fr: "Vaccin influenza/rhino", en: "Influenza/rhino vaccine" },
    influenza_vaccine: { fr: "Vaccin influenza", en: "Influenza vaccine" },
    other: { fr: "Autre document", en: "Other document" },
    ownership_certificate: { fr: "Certificat de propriété", en: "Ownership certificate" },
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
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function healthComplianceNotificationReason(result: HorseHealthComplianceOverview) {
  if (!result.reasons.length) {
    return "conformité santé à vérifier";
  }

  return result.reasons.map((reason) => {
    const requirement = reason.requirement === "coggins" ? "Coggins" : reason.requirement === "influenza" ? "Influenza" : "Rhino";
    const status = {
      expired: reason.expires_on ? `expiré le ${formatDate(reason.expires_on)}` : "expiré",
      identity_mismatch: "identité différente",
      identity_pending: "identité à confirmer",
      missing: "document manquant",
      missing_date: "date absente",
      future_date: "date postérieure au concours",
      not_required: "non exigé",
      rejected: "document refusé",
      review_pending: "révision de l'association requise",
      review_rejected: "refusé par l'association",
      valid: "valide",
    }[reason.status];
    return `${requirement}: ${status}`;
  }).join(" · ");
}

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
  blocks: Block[];
  contactExternalIdentifiers: ContactExternalIdentifier[];
  contacts: Contact[];
  classes: ClassRecord[];
  entries: Entry[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  healthComplianceResults: HorseHealthComplianceOverview[];
  horses: Horse[];
  invoices: Invoice[];
  membershipRequirements: OrganizationExternalCredentialRequirement[];
  organization: Organization | null;
  showDays: ShowDay[];
  showScoreClassSetups: ShowScoreBlockSetup[];
  shows: Show[];
  stallOptions: StallOption[];
}) {
  const today = todayDateValue();
  const activeEntries = input.entries.filter((entry) => !inactiveProgramEntryStatuses.has(entry.status));
  const notifications: NotificationItem[] = [];

  for (const result of input.healthComplianceResults.filter(
    (candidate) => candidate.compliance_status !== "compliant" && candidate.compliance_status !== "not_required",
  )) {
    const horse = findById(input.horses, result.horse_id);
    notifications.push({
      actionLabel: "Voir santé",
      category: "health",
      detail: `${horseLabel(horse)}: ${healthComplianceNotificationReason(result)}.`,
      id: `health-compliance-${result.organization_id}-${result.horse_id}-${result.reference_date}`,
      meta: `${result.organization_short_name || result.organization_name} - ${formatDate(result.reference_date)}`,
      priority: result.can_proceed ? "warning" : "critical",
      title: result.can_proceed ? "Conformité santé - Avertissement" : "Conformité santé bloquante",
      view: "health",
    });
  }

  for (const entry of activeEntries.filter((candidate) => !candidate.entry_number)) {
    const classRecord = findById(input.classes, entry.class_id);
    const block = classRecord ? findById(input.blocks, classRecord.block_id) : null;
    const show = findById(input.shows, entry.show_id);
    const cutoffPassed = block ? classEntriesAreClosed(block) : false;

    notifications.push({
      actionLabel: "Assigner",
      category: "back-numbers",
      detail: `${horseLabel(findById(input.horses, entry.horse_id))} - ${classLabel(classRecord, input.blocks)}.`,
      id: `entry-back-number-${entry.id}`,
      meta: [show?.name, cutoffPassed ? "fermeture passée" : "avant fermeture"].filter(Boolean).join(" - "),
      priority: cutoffPassed ? "critical" : "warning",
      title: "Dossard manquant",
      view: "back-numbers",
    });
  }

  buildMembershipNotificationItems({
    activeEntries,
    contactExternalIdentifiers: input.contactExternalIdentifiers,
    contacts: input.contacts,
    classes: input.classes,
    externalCredentialIssuers: input.externalCredentialIssuers,
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

  for (const block of input.blocks) {
    const blockClassIds = new Set(input.classes.filter((classRecord) => classRecord.block_id === block.id).map((classRecord) => classRecord.id));
    const classEntries = activeEntries.filter((entry) => blockClassIds.has(entry.class_id));

    if (!classEntries.length || !classEntriesAreClosed(block) || block.draw_prepared_at) {
      continue;
    }

    const missingBackNumberCount = classEntries.filter((entry) => !entry.entry_number).length;
    notifications.push({
      actionLabel: "Préparer",
      category: "entries",
      detail: `${block.name}: ${classEntries.length} inscription${classEntries.length === 1 ? "" : "s"} prête${classEntries.length === 1 ? "" : "s"} pour l'ordre de passage.`,
      id: `draw-ready-${block.id}`,
      meta: missingBackNumberCount ? `${missingBackNumberCount} dossard${missingBackNumberCount === 1 ? "" : "s"} manquant${missingBackNumberCount === 1 ? "" : "s"}` : "Fermeture passée",
      priority: missingBackNumberCount ? "critical" : "warning",
      title: "Ordre de passage à sortir",
      view: missingBackNumberCount ? "back-numbers" : "scoring",
    });
  }

  for (const show of input.shows.filter((candidate) => candidate.status !== "archived" && candidate.end_date >= today)) {
    const incompleteItems = buildShowReadinessItems(show, {
      blocks: input.blocks,
      classes: input.classes,
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
  contactExternalIdentifiers: ContactExternalIdentifier[];
  contacts: Contact[];
  classes: ClassRecord[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalCredentialRequirement[];
  organization: Organization | null;
  shows: Show[];
}) {
  const grouped = new Map<string, NotificationItem & { count: number }>();

  for (const entry of input.activeEntries) {
    const horse = findById(input.horses, entry.horse_id);
    const readiness = buildEntryShowReadiness({
      contactExternalIdentifiers: input.contactExternalIdentifiers,
      externalCredentialIssuers: input.externalCredentialIssuers,
      horse,
      membershipRequirements: input.membershipRequirements,
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
  memberships: HorseExternalIdentifier[],
  externalCredentialIssuers: ExternalCredentialIssuer[],
  query: string,
) {
  const owner = findById(contacts, horse.primary_owner_contact_id);
  const membershipValues = memberships
    .filter((membership) => membership.horse_id === horse.id)
    .flatMap((membership) => {
      const externalCredentialIssuer = findById(externalCredentialIssuers, membership.external_credential_issuer_id);
      return [externalCredentialIssuer?.code, externalCredentialIssuer?.name, membership.identifier_value, membership.status];
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
      horseExternalReferenceSummary(horse, memberships, externalCredentialIssuers),
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
    blocks: Block[];
    classes: ClassRecord[];
    entries: Entry[];
    invoices: Invoice[];
    showDays: ShowDay[];
    showScoreClassSetups: ShowScoreBlockSetup[];
    stallOptions: StallOption[];
  },
): ShowReadinessItem[] {
  const locale = context.locale ?? "fr";
  const showDays = context.showDays.filter((day) => day.show_id === show.id);
  const showBlocks = context.blocks.filter((block) => block.show_id === show.id);
  const showClasses = context.classes.filter((classRecord) => classRecord.show_id === show.id);
  const showEntries = context.entries.filter((entry) => entry.show_id === show.id);
  const showStallOptions = context.stallOptions.filter((option) => option.show_id === show.id);
  const showInvoices = context.invoices.filter((invoice) => invoice.show_id === show.id);
  const preparedClassIds = new Set(context.showScoreClassSetups.filter((setup) => setup.show_id === show.id).map((setup) => setup.block_id));
  const preparedBlocks = showBlocks.filter((block) => preparedClassIds.has(block.id)).length;

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
      key: "blocks",
      title: uiText(locale, "Blocs", "Schedule blocks"),
      detail: showBlocks.length ? uiText(locale, `${showBlocks.length} bloc${showBlocks.length === 1 ? "" : "s"} à l'horaire.`, `${showBlocks.length} schedule block${showBlocks.length === 1 ? "" : "s"} in the schedule.`) : uiText(locale, "Aucun bloc créé.", "No schedule blocks created."),
      done: showBlocks.length > 0,
      view: "blocks",
      actionLabel: showBlocks.length ? uiText(locale, "Ajuster", "Adjust") : uiText(locale, "Ajouter", "Add"),
    },
    {
      key: "classes",
      title: uiText(locale, "Classes", "Classes"),
      detail: showClasses.length ? uiText(locale, `${showClasses.length} classe${showClasses.length === 1 ? "" : "s"} disponible${showClasses.length === 1 ? "" : "s"}.`, `${showClasses.length} class${showClasses.length === 1 ? "" : "es"} available.`) : uiText(locale, "Aucune classe disponible.", "No blocks available."),
      done: showClasses.length > 0,
      view: "blocks",
      actionLabel: showClasses.length ? uiText(locale, "Ajuster", "Adjust") : uiText(locale, "Ajouter", "Add"),
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
      detail: showBlocks.length ? uiText(locale, `${preparedBlocks}/${showBlocks.length} bloc${showBlocks.length === 1 ? "" : "s"} préparé${showBlocks.length === 1 ? "" : "s"}.`, `${preparedBlocks}/${showBlocks.length} schedule block${showBlocks.length === 1 ? "" : "s"} prepared.`) : uiText(locale, "Crée des blocs avant le pointage.", "Create schedule blocks before scoring."),
      done: showBlocks.length > 0 && preparedBlocks === showBlocks.length,
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

export function classEntriesCloseDate(block: Block | null | undefined) {
  if (!block?.entries_close_at) {
    return null;
  }

  const closeDate = new Date(block.entries_close_at);
  return Number.isNaN(closeDate.getTime()) ? null : closeDate;
}

export function classEntriesAreClosed(block: Block | null | undefined) {
  const closeDate = classEntriesCloseDate(block);
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
