import { contactLabel, formatDate, horseLabel } from "./display";
import type {
  Contact,
  ContactExternalIdentifier,
  ExternalCredentialIssuer,
  Horse,
  HorseHealthCompliance,
  OrganizationExternalCredentialRequirement,
  Show,
} from "../types/domain";

export type ReadinessItemStatus = "ready" | "pending" | "blocked" | "not_required";

export type ReadinessItem = {
  blocking: boolean;
  detail: string;
  key: string;
  status: ReadinessItemStatus;
  title: string;
};

export type ReadinessResult = {
  blockingItems: ReadinessItem[];
  canProceed: boolean;
  items: ReadinessItem[];
  message: string;
  status: "ready" | "pending" | "blocked";
};

const proceedStatuses = new Set<ReadinessItemStatus>(["ready", "not_required"]);

export function buildHorseShowReadiness(input: {
  healthCompliance?: HorseHealthCompliance | null;
  healthComplianceLoading?: boolean;
  horse: Horse | null | undefined;
  show: Show | null | undefined;
  skipHealth?: boolean;
}): ReadinessResult {
  const items: ReadinessItem[] = [];

  if (!input.horse) {
    items.push({
      blocking: true,
      detail: "Choisir un cheval avant de continuer.",
      key: "horse.required",
      status: "blocked",
      title: "Cheval",
    });

    return summarizeReadiness(items, "Cheval pret pour le show.");
  }

  if (input.skipHealth) {
    return summarizeReadiness(items, "Verification sante ignoree pour ce statut.");
  }

  if (input.healthComplianceLoading || !input.healthCompliance) {
      items.push({
        blocking: true,
        detail: "Calcul de la conformite sante pour la date du concours en cours.",
        key: "horse.health_compliance",
        status: "pending",
        title: `Documents sante - ${horseLabel(input.horse)}`,
      });
  } else {
      const compliance = input.healthCompliance;
      items.push({
        blocking: !compliance.can_proceed,
        detail: horseHealthComplianceReadinessMessage(compliance, input.show),
        key: "horse.health_compliance",
        status:
          compliance.compliance_status === "not_required"
            ? "not_required"
            : compliance.compliance_status === "compliant"
              ? "ready"
              : compliance.can_proceed
                ? "pending"
                : compliance.compliance_status === "pending_review"
                  ? "pending"
                  : "blocked",
        title: `Documents sante - ${horseLabel(input.horse)}`,
      });
  }

  return summarizeReadiness(items, "Cheval pret pour le show.");
}

export function buildContactShowReadiness(input: {
  contact: Contact | null | undefined;
  contactExternalIdentifiers: ContactExternalIdentifier[];
  contactType: Contact["type"];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  membershipRequirements: OrganizationExternalCredentialRequirement[];
  referenceDate?: string | null;
  roleLabel: string;
}): ReadinessResult {
  const requiredCredentials = input.membershipRequirements
    .filter((requirement) => requirement.is_required && requirement.contact_type === input.contactType);

  if (!requiredCredentials.length) {
    return summarizeReadiness([], `${input.roleLabel} sans exigence de membership show-level.`);
  }

  if (!input.contact) {
    return summarizeReadiness(
      [
        {
          blocking: true,
          detail: `Choisir un ${input.roleLabel.toLowerCase()} pour verifier ses numeros obligatoires.`,
          key: `contact.${input.contactType}.required`,
          status: "blocked",
          title: input.roleLabel,
        },
      ],
      `${input.roleLabel} pret pour le show.`,
    );
  }

  const contact = input.contact;
  const memberships = input.contactExternalIdentifiers.filter((membership) => membership.contact_id === contact.id);
  const referenceDate = dateReferenceValue(input.referenceDate);
  const groupedCredentials = groupReadinessRequirements(requiredCredentials);
  const items = groupedCredentials.flatMap((group) => {
    if (group.matchRule === "at_least_one") {
      const validOption = group.requirements
        .map((requirement) => ({
          requirement,
          identifier: memberships.find(
            (candidate) =>
              candidate.external_credential_issuer_id === requirement.external_credential_issuer_id &&
              candidate.identifier_type === requirement.identifier_type,
          ),
        }))
        .find(({ identifier, requirement }) =>
          contactExternalIdentifierMeetsValidityRule(identifier, requirement.validity_rule, referenceDate),
        );
      const issuerLabels = group.requirements.map((requirement) => {
        const issuer = input.externalCredentialIssuers.find(
          (candidate) => candidate.id === requirement.external_credential_issuer_id,
        );
        return issuer?.code ?? issuer?.name ?? "Organisation externe";
      });
      const blocking = group.requirements.some((requirement) => requirement.enforcement_mode === "blocking");

      if (validOption?.identifier) {
        const issuer = input.externalCredentialIssuers.find(
          (candidate) => candidate.id === validOption.requirement.external_credential_issuer_id,
        );
        const issuerLabel = issuer?.code ?? issuer?.name ?? "Organisation externe";
        const expirationDetail = validOption.identifier.expires_on
          ? ` valide jusqu'au ${formatDate(validOption.identifier.expires_on)}`
          : "";
        return [{
          blocking: false,
          detail: `${issuerLabel} #${validOption.identifier.identifier_value}${expirationDetail} en dossier pour ${contactLabel(contact)}.`,
          key: `contact.${contact.id}.group.${group.key}`,
          status: "ready" as const,
          title: `${input.roleLabel} - ${issuerLabels.join(" ou ")}`,
        }];
      }

      return [{
        blocking,
        detail: `Une adhesion active (${issuerLabels.join(" ou ")}) est requise pour ${contactLabel(contact)}.`,
        key: `contact.${contact.id}.group.${group.key}`,
        status: blocking ? "blocked" as const : "pending" as const,
        title: `${input.roleLabel} - ${issuerLabels.join(" ou ")}`,
      }];
    }

    return group.requirements.map((requirement) => {
    const externalCredentialIssuerId = requirement.external_credential_issuer_id;
    const externalCredentialIssuer = input.externalCredentialIssuers.find((organization) => organization.id === externalCredentialIssuerId);
    const membership = memberships.find(
      (candidate) =>
        candidate.external_credential_issuer_id === externalCredentialIssuerId &&
        candidate.identifier_type === requirement.identifier_type,
    );
    const membershipNumber = membership?.identifier_value.trim();
    const organizationLabel = externalCredentialIssuer?.code ?? externalCredentialIssuer?.name ?? "Organisation externe";
    const blocking = requirement.enforcement_mode === "blocking";

    if (!membershipNumber) {
      return {
        blocking,
        detail: `${organizationLabel} # manquant pour ${contactLabel(contact)}.`,
        key: `contact.${contact.id}.${externalCredentialIssuerId}.${requirement.identifier_type}`,
        status: blocking ? "blocked" as const : "pending" as const,
        title: `${input.roleLabel} - ${organizationLabel}`,
      };
    }

    if (!contactExternalIdentifierMeetsValidityRule(membership, requirement.validity_rule, referenceDate)) {
      const expiryDetail = membership?.expires_on
        ? ` depuis le ${formatDate(membership.expires_on)}`
        : "";

      return {
        blocking,
        detail: `${organizationLabel} #${membershipNumber} n'est pas actif a la date du show${expiryDetail} pour ${contactLabel(contact)}.`,
        key: `contact.${contact.id}.${externalCredentialIssuerId}.${requirement.identifier_type}`,
        status: blocking ? "blocked" as const : "pending" as const,
        title: `${input.roleLabel} - ${organizationLabel}`,
      };
    }

    const expirationDetail = membership?.expires_on ? ` valide jusqu'au ${formatDate(membership.expires_on)}` : "";

    return {
      blocking: false,
      detail: `${organizationLabel} #${membershipNumber}${expirationDetail} en dossier pour ${contactLabel(contact)}.`,
      key: `contact.${contact.id}.${externalCredentialIssuerId}.${requirement.identifier_type}`,
      status: "ready" as const,
      title: `${input.roleLabel} - ${organizationLabel}`,
    };
    });
  });

  return summarizeReadiness(items, `${input.roleLabel} pret pour le show.`);
}

function groupReadinessRequirements(requirements: OrganizationExternalCredentialRequirement[]) {
  const groups = new Map<string, OrganizationExternalCredentialRequirement[]>();

  for (const requirement of requirements) {
    const key = requirement.requirement_group_code
      ? `${requirement.contact_type}:${requirement.requirement_group_code}`
      : `direct:${requirement.id}`;
    groups.set(key, [...(groups.get(key) ?? []), requirement]);
  }

  return Array.from(groups.entries()).map(([key, groupedRequirements]) => ({
    key,
    matchRule: groupedRequirements[0]?.match_rule ?? "all",
    requirements: groupedRequirements,
  }));
}

export function buildEntryShowReadiness(input: {
  contactExternalIdentifiers: ContactExternalIdentifier[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  healthCompliance?: HorseHealthCompliance | null;
  healthComplianceLoading?: boolean;
  horse: Horse | null | undefined;
  membershipRequirements: OrganizationExternalCredentialRequirement[];
  ownerContact: Contact | null | undefined;
  payerContact: Contact | null | undefined;
  riderContact: Contact | null | undefined;
  show: Show | null | undefined;
  skipContactRequirements?: boolean;
  skipHorseHealth?: boolean;
}): ReadinessResult {
  const horseReadiness = buildHorseShowReadiness({
    healthCompliance: input.healthCompliance,
    healthComplianceLoading: input.healthComplianceLoading,
    horse: input.horse,
    show: input.show,
    skipHealth: input.skipHorseHealth,
  });
  const contactResults: ReadinessResult[] = [];

  if (!input.skipContactRequirements) {
    const riderRequired = input.membershipRequirements.some((requirement) => requirement.is_required && requirement.contact_type === "rider");

    if (riderRequired || input.riderContact) {
      contactResults.push(
        buildContactShowReadiness({
          contact: input.riderContact,
          contactExternalIdentifiers: input.contactExternalIdentifiers,
          contactType: "rider",
          externalCredentialIssuers: input.externalCredentialIssuers,
          membershipRequirements: input.membershipRequirements,
          referenceDate: input.show?.start_date ?? null,
          roleLabel: "Cavalier",
        }),
      );
    }

    if (input.ownerContact) {
      contactResults.push(
        buildContactShowReadiness({
          contact: input.ownerContact,
          contactExternalIdentifiers: input.contactExternalIdentifiers,
          contactType: "owner",
          externalCredentialIssuers: input.externalCredentialIssuers,
          membershipRequirements: input.membershipRequirements,
          referenceDate: input.show?.start_date ?? null,
          roleLabel: "Proprietaire",
        }),
      );
    }

    if (input.payerContact) {
      contactResults.push(
        buildContactShowReadiness({
          contact: input.payerContact,
          contactExternalIdentifiers: input.contactExternalIdentifiers,
          contactType: "payer",
          externalCredentialIssuers: input.externalCredentialIssuers,
          membershipRequirements: input.membershipRequirements,
          referenceDate: input.show?.start_date ?? null,
          roleLabel: "Payeur",
        }),
      );
    }
  }

  return summarizeReadiness([horseReadiness, ...contactResults].flatMap((result) => result.items), "Pret pour creer l'inscription.");
}

function horseHealthComplianceReadinessMessage(
  compliance: HorseHealthCompliance,
  show: Show | null | undefined,
) {
  const reference = show ? `Date du concours: ${formatDate(show.start_date)}.` : `Date de reference: ${formatDate(compliance.reference_date)}.`;

  if (compliance.compliance_status === "not_required") {
    return `Cette association ne demande aucun document sante. ${reference}`;
  }

  if (compliance.compliance_status === "compliant") {
    return `Documents sante a jour. ${reference}`;
  }

  const reasons = compliance.reasons.map((reason) => {
    const requirement = reason.requirement === "coggins" ? "Coggins" : reason.requirement === "influenza" ? "Influenza" : "Rhino";
    const status = {
      expired: reason.expires_on ? `expire le ${formatDate(reason.expires_on)}` : "expire",
      identity_mismatch: "identite differente",
      identity_pending: "identite a confirmer",
      missing: "document manquant",
      missing_date: "date absente",
      future_date: "date posterieure au concours",
      rejected: "document refuse",
      review_pending: "revision de l'association requise",
      review_rejected: "refuse par l'association",
      valid: "valide",
      not_required: "non exige",
    }[reason.status];
    return `${requirement}: ${status}`;
  });
  const prefix = compliance.can_proceed ? "Avertissement" : "Inscription ou reservation bloquee";
  return `${prefix}: ${reasons.join("; ")}. ${reference}`;
}

function contactExternalIdentifierMeetsValidityRule(
  identifier: ContactExternalIdentifier | null | undefined,
  validityRule: OrganizationExternalCredentialRequirement["validity_rule"],
  referenceDate: string,
) {
  if (!identifier?.identifier_value.trim()) {
    return false;
  }

  if (validityRule === "present") {
    return true;
  }

  if (identifier.status !== "active") {
    return false;
  }

  if (identifier.valid_from && dateReferenceValue(identifier.valid_from) > referenceDate) {
    return false;
  }

  return !identifier.expires_on || dateReferenceValue(identifier.expires_on) >= referenceDate;
}

function dateReferenceValue(value: string | null | undefined) {
  return value?.slice(0, 10) || new Date().toISOString().slice(0, 10);
}

export function readinessTone(result: ReadinessResult): "success" | "info" | "error" {
  if (result.status === "blocked") {
    return "error";
  }

  if (result.status === "pending") {
    return "info";
  }

  return "success";
}

function summarizeReadiness(items: ReadinessItem[], readyMessage: string): ReadinessResult {
  const blockingItems = items.filter((item) => item.blocking);
  const hasBlocked = blockingItems.some((item) => item.status === "blocked");
  const hasPending = blockingItems.some((item) => item.status === "pending");
  const status = blockingItems.length ? (hasBlocked ? "blocked" : hasPending ? "pending" : "blocked") : "ready";

  return {
    blockingItems,
    canProceed: blockingItems.length === 0,
    items,
    message: blockingItems[0]?.detail ?? readyMessage,
    status,
  };
}

export function readinessItemClassName(item: ReadinessItem) {
  return `readiness-mini-item ${proceedStatuses.has(item.status) ? "ready" : item.status}`;
}
