import { contactLabel, formatDate, horseLabel } from "./display";
import { getHorseCogginsValidity, getHorseVaccineValidity, type HorseCogginsValidity, type HorseVaccineValidity } from "./health";
import type {
  Contact,
  ContactExternalMembership,
  ExternalOrganization,
  Horse,
  HorseHealthDocument,
  Organization,
  OrganizationExternalMembershipRequirement,
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
  documents: HorseHealthDocument[];
  horse: Horse | null | undefined;
  organization: Organization | null | undefined;
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

  const cogginsValidity = getHorseCogginsValidity({
    documents: input.documents,
    horseId: input.horse.id,
    organization: input.organization,
    referenceDate: input.show?.start_date ?? null,
  });
  const vaccineValidity = getHorseVaccineValidity({
    documents: input.documents,
    horseId: input.horse.id,
    organization: input.organization,
    referenceDate: input.show?.start_date ?? null,
  });

  items.push({
    blocking: !cogginsValidity.valid,
    detail: horseCogginsReadinessMessage(cogginsValidity, input.show),
    key: "horse.coggins",
    status: horseCogginsReadinessStatus(cogginsValidity),
    title: `Coggins - ${horseLabel(input.horse)}`,
  });
  items.push({
    blocking: !vaccineValidity.valid,
    detail: horseVaccineReadinessMessage(vaccineValidity, input.show),
    key: "horse.vaccine",
    status: horseVaccineReadinessStatus(vaccineValidity),
    title: `Vaccin influenza/rhino - ${horseLabel(input.horse)}`,
  });

  return summarizeReadiness(items, "Cheval pret pour le show.");
}

export function buildContactShowReadiness(input: {
  contact: Contact | null | undefined;
  contactExternalMemberships: ContactExternalMembership[];
  contactType: Contact["type"];
  externalOrganizations: ExternalOrganization[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  roleLabel: string;
}): ReadinessResult {
  const requiredOrganizationIds = input.membershipRequirements
    .filter((requirement) => requirement.is_required && requirement.contact_type === input.contactType)
    .map((requirement) => requirement.external_organization_id);

  if (!requiredOrganizationIds.length) {
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
  const memberships = input.contactExternalMemberships.filter((membership) => membership.contact_id === contact.id);
  const items = requiredOrganizationIds.map((externalOrganizationId) => {
    const externalOrganization = input.externalOrganizations.find((organization) => organization.id === externalOrganizationId);
    const membership = memberships.find((candidate) => candidate.external_organization_id === externalOrganizationId);
    const membershipNumber = membership?.membership_number.trim();
    const organizationLabel = externalOrganization?.code ?? externalOrganization?.name ?? "Organisation externe";

    if (!membershipNumber) {
      return {
        blocking: true,
        detail: `${organizationLabel} # manquant pour ${contactLabel(contact)}.`,
        key: `contact.${contact.id}.${externalOrganizationId}`,
        status: "blocked" as const,
        title: `${input.roleLabel} - ${organizationLabel}`,
      };
    }

    if (membership?.status === "expired") {
      return {
        blocking: true,
        detail: `${organizationLabel} #${membershipNumber} est expire pour ${contactLabel(contact)}.`,
        key: `contact.${contact.id}.${externalOrganizationId}`,
        status: "blocked" as const,
        title: `${input.roleLabel} - ${organizationLabel}`,
      };
    }

    return {
      blocking: false,
      detail: `${organizationLabel} #${membershipNumber} en dossier pour ${contactLabel(contact)}.`,
      key: `contact.${contact.id}.${externalOrganizationId}`,
      status: "ready" as const,
      title: `${input.roleLabel} - ${organizationLabel}`,
    };
  });

  return summarizeReadiness(items, `${input.roleLabel} pret pour le show.`);
}

export function buildEntryShowReadiness(input: {
  contactExternalMemberships: ContactExternalMembership[];
  documents: HorseHealthDocument[];
  externalOrganizations: ExternalOrganization[];
  horse: Horse | null | undefined;
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null | undefined;
  ownerContact: Contact | null | undefined;
  payerContact: Contact | null | undefined;
  riderContact: Contact | null | undefined;
  show: Show | null | undefined;
  skipContactRequirements?: boolean;
  skipHorseHealth?: boolean;
}): ReadinessResult {
  const horseReadiness = buildHorseShowReadiness({
    documents: input.documents,
    horse: input.horse,
    organization: input.organization,
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
          contactExternalMemberships: input.contactExternalMemberships,
          contactType: "rider",
          externalOrganizations: input.externalOrganizations,
          membershipRequirements: input.membershipRequirements,
          roleLabel: "Cavalier",
        }),
      );
    }

    if (input.ownerContact) {
      contactResults.push(
        buildContactShowReadiness({
          contact: input.ownerContact,
          contactExternalMemberships: input.contactExternalMemberships,
          contactType: "owner",
          externalOrganizations: input.externalOrganizations,
          membershipRequirements: input.membershipRequirements,
          roleLabel: "Proprietaire",
        }),
      );
    }

    if (input.payerContact) {
      contactResults.push(
        buildContactShowReadiness({
          contact: input.payerContact,
          contactExternalMemberships: input.contactExternalMemberships,
          contactType: "payer",
          externalOrganizations: input.externalOrganizations,
          membershipRequirements: input.membershipRequirements,
          roleLabel: "Payeur",
        }),
      );
    }
  }

  return summarizeReadiness([horseReadiness, ...contactResults].flatMap((result) => result.items), "Pret pour creer l'inscription.");
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

function horseCogginsReadinessStatus(validity: HorseCogginsValidity): ReadinessItemStatus {
  if (validity.status === "not_required") {
    return "not_required";
  }

  if (validity.valid) {
    return "ready";
  }

  return validity.status === "pending_review" ? "pending" : "blocked";
}

function horseVaccineReadinessStatus(validity: HorseVaccineValidity): ReadinessItemStatus {
  if (validity.status === "not_required") {
    return "not_required";
  }

  if (validity.valid) {
    return "ready";
  }

  return validity.status === "pending_review" ? "pending" : "blocked";
}

function horseCogginsReadinessMessage(validity: HorseCogginsValidity, show: Show | null | undefined) {
  const reference = show ? ` pour l'arrivee du show (${formatDate(show.start_date)})` : "";

  if (!validity.required) {
    return "Coggins non exige par cette association.";
  }

  if (validity.status === "valid" && validity.expiresOn) {
    return `Coggins valide jusqu'au ${formatDate(validity.expiresOn)}${reference}.`;
  }

  if (validity.status === "expired" && validity.expiresOn) {
    return `Coggins expire le ${formatDate(validity.expiresOn)} et ne couvre pas${reference || " la date de reference"}.`;
  }

  if (validity.status === "pending_review") {
    return "Coggins en revision manuelle; il doit etre approuve avant de reserver ou inscrire.";
  }

  if (validity.status === "rejected") {
    return "Coggins refuse; deposer un nouveau document ou corriger la fiche.";
  }

  return "Coggins manquant; ajouter un GVL valide ou deposer le PDF pour revision.";
}

function horseVaccineReadinessMessage(validity: HorseVaccineValidity, show: Show | null | undefined) {
  const reference = show ? ` pour l'arrivee du show (${formatDate(show.start_date)})` : "";

  if (!validity.required) {
    return "Certificat vaccin non exige par cette association.";
  }

  if (validity.status === "valid" && validity.expiresOn) {
    return `Certificat vaccin valide jusqu'au ${formatDate(validity.expiresOn)}${reference}.`;
  }

  if (validity.status === "expired" && validity.expiresOn) {
    return `Certificat vaccin expire le ${formatDate(validity.expiresOn)} et ne couvre pas${reference || " la date de reference"}.`;
  }

  if (validity.status === "pending_review") {
    return "Certificat vaccin en revision manuelle; il doit etre approuve avant de reserver ou inscrire.";
  }

  if (validity.status === "rejected") {
    return "Certificat vaccin refuse; deposer un nouveau document ou corriger la fiche.";
  }

  return "Certificat vaccin influenza/rhino manquant.";
}

export function readinessItemClassName(item: ReadinessItem) {
  return `readiness-mini-item ${proceedStatuses.has(item.status) ? "ready" : item.status}`;
}
