import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import type { ReadinessItem, ReadinessResult } from "../../lib/readiness";
import { verifyNrhaEligibility } from "../../services/supabaseServices";
import type { NrhaEligibilityVerification } from "../../services/supabaseServices";
import type { ClassRecord, Contact, ContactExternalMembership, Division, ExternalOrganization, Horse, HorseExternalMembership, Show } from "../../types/domain";
import { findNrhaApprovedClass } from "../classes/classUtils";
import { InlineHealthMessage, uiText } from "../dashboard/shared";

type NrhaEligibilityMessage = {
  key: string;
  message: string;
  tone: "success" | "info" | "error";
};

type NrhaEligibilityGate = {
  applies: boolean;
  canProceed: boolean;
  eligible: boolean | null;
  key: string;
  message: NrhaEligibilityMessage | null;
  verified: boolean;
};

function NrhaEligibilityCheck({
  classRecord,
  contactExternalMemberships,
  division,
  externalOrganizations,
  horse,
  horseExternalMemberships,
  locale = "fr",
  onStatusChange,
  riderContact,
  show,
  skip = false,
  onVerifyNrhaEligibility,
}: {
  classRecord: ClassRecord | null;
  contactExternalMemberships: ContactExternalMembership[];
  division: Division | null;
  externalOrganizations: ExternalOrganization[];
  horse: Horse | null;
  horseExternalMemberships: HorseExternalMembership[];
  locale?: Locale;
  onStatusChange?: (status: NrhaEligibilityGate) => void;
  riderContact: Contact | null;
  skip?: boolean;
  show: Show | null;
  onVerifyNrhaEligibility: (input: Parameters<typeof verifyNrhaEligibility>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaEligibility>>>;
}) {
  const [busy, setBusy] = useState(false);
  const [resultMessage, setResultMessage] = useState<NrhaEligibilityMessage | null>(null);
  const nrhaOrganization = useMemo(
    () => externalOrganizations.find((externalOrganization) => externalOrganization.code.toUpperCase() === "NRHA") ?? null,
    [externalOrganizations],
  );
  const horseNrhaReference = useMemo(
    () =>
      nrhaOrganization && horse
        ? horseExternalMemberships.find(
            (membership) =>
              membership.horse_id === horse.id &&
              membership.external_organization_id === nrhaOrganization.id &&
              membership.reference_type === "competition_license",
          ) ?? null
        : null,
    [horse, horseExternalMemberships, nrhaOrganization],
  );
  const riderNrhaMembership = useMemo(
    () =>
      nrhaOrganization && riderContact
        ? contactExternalMemberships.find(
            (membership) =>
              membership.contact_id === riderContact.id &&
              membership.external_organization_id === nrhaOrganization.id,
          ) ?? null
        : null,
    [contactExternalMemberships, nrhaOrganization, riderContact],
  );
  const context = buildNrhaEligibilityContext({
    classRecord,
    division,
    horse,
    horseReferenceNumber: horseNrhaReference?.reference_number ?? "",
    locale,
    memberNumber: riderNrhaMembership?.membership_number ?? "",
    riderContact,
    show,
  });
  const visibleResultMessage = resultMessage && resultMessage.key === context.key ? resultMessage : null;
  const gate = buildNrhaEligibilityGate(context, visibleResultMessage, locale, skip);

  useEffect(() => {
    onStatusChange?.(gate);
  }, [gate, onStatusChange]);

  async function handleVerify() {
    if (!context.request) {
      return;
    }

    setBusy(true);

    try {
      const verification = await onVerifyNrhaEligibility(context.request);
      setResultMessage(formatNrhaEligibilityMessage(verification, context.key, locale));
    } catch (error) {
      setResultMessage({
        key: context.key,
        tone: "error",
        message: error instanceof Error ? error.message : uiText(locale, "Validation NRHA impossible.", "NRHA validation unavailable."),
      });
    } finally {
      setBusy(false);
    }
  }

  if (skip || !context.applies) {
    return null;
  }

  return (
    <div className="entry-verification-row">
      <button className="ghost-button" disabled={!context.request || busy} type="button" onClick={handleVerify}>
        <ShieldCheck size={18} />
        {busy ? uiText(locale, "Vérification...", "Checking...") : uiText(locale, "Vérifier NRHA", "Check NRHA")}
      </button>
      <InlineHealthMessage value={visibleResultMessage ?? context.message} />
    </div>
  );
}

function buildNrhaEligibilityGate(
  context: ReturnType<typeof buildNrhaEligibilityContext>,
  resultMessage: NrhaEligibilityMessage | null,
  locale: Locale,
  skip: boolean,
): NrhaEligibilityGate {
  if (skip || !context.applies) {
    return {
      applies: false,
      canProceed: true,
      eligible: null,
      key: context.key,
      message: null,
      verified: false,
    };
  }

  if (!context.request) {
    return {
      applies: true,
      canProceed: false,
      eligible: null,
      key: context.key,
      message: context.message ? { key: context.key, ...context.message } : null,
      verified: false,
    };
  }

  if (!resultMessage) {
    return {
      applies: true,
      canProceed: false,
      eligible: null,
      key: context.key,
      message: {
        key: context.key,
        tone: "info",
        message: uiText(locale, "Vérifie l'éligibilité NRHA avant de continuer.", "Check NRHA eligibility before continuing."),
      },
      verified: false,
    };
  }

  const eligible = resultMessage.tone === "success";

  return {
    applies: true,
    canProceed: eligible,
    eligible,
    key: context.key,
    message: resultMessage,
    verified: true,
  };
}

function withNrhaEligibilityReadiness(
  readiness: ReadinessResult,
  gate: NrhaEligibilityGate | null,
  locale: Locale,
): ReadinessResult {
  if (!gate?.applies) {
    return readiness;
  }

  const nrhaItem: ReadinessItem = {
    blocking: !gate.canProceed,
    detail: gate.message?.message ?? uiText(locale, "Vérification NRHA requise.", "NRHA check required."),
    key: `entry.nrha.${gate.key}`,
    status: gate.canProceed ? "ready" : gate.message?.tone === "info" ? "pending" : "blocked",
    title: uiText(locale, "Éligibilité NRHA", "NRHA eligibility"),
  };
  const items = [...readiness.items.filter((item) => !item.key.startsWith("entry.nrha.")), nrhaItem];
  const blockingItems = items.filter((item) => item.blocking);
  const hasBlocked = blockingItems.some((item) => item.status === "blocked");
  const hasPending = blockingItems.some((item) => item.status === "pending");
  const status = blockingItems.length ? (hasBlocked ? "blocked" : hasPending ? "pending" : "blocked") : "ready";

  return {
    ...readiness,
    blockingItems,
    canProceed: blockingItems.length === 0,
    items,
    message: blockingItems[0]?.detail ?? readiness.message,
    status,
  };
}

function sameNrhaEligibilityGate(a: NrhaEligibilityGate | null, b: NrhaEligibilityGate) {
  return (
    a?.applies === b.applies &&
    a.canProceed === b.canProceed &&
    a.eligible === b.eligible &&
    a.key === b.key &&
    a.verified === b.verified &&
    a.message?.message === b.message?.message &&
    a.message?.tone === b.message?.tone
  );
}

function buildNrhaEligibilityContext(input: {
  classRecord: ClassRecord | null;
  division: Division | null;
  horse: Horse | null;
  horseReferenceNumber: string;
  locale: Locale;
  memberNumber: string;
  riderContact: Contact | null;
  show: Show | null;
}) {
  const classCode = integerFromExactReference(input.division?.code ?? input.classRecord?.code ?? "");
  const applies = nrhaApplies(input.division, input.classRecord, classCode);
  const competitionLicenseNumber = integerFromReference(input.horseReferenceNumber);
  const memberNumber = integerFromReference(input.memberNumber);
  const date = input.show?.start_date?.slice(0, 10) ?? "";
  const key = [
    input.division?.id ?? "",
    input.horse?.id ?? "",
    input.riderContact?.id ?? "",
    classCode ?? "",
    competitionLicenseNumber ?? "",
    memberNumber ?? "",
    date,
  ].join(":");

  if (!applies) {
    return { applies, key, message: null, request: null };
  }

  if (!input.horse || !input.division || !input.show) {
    return {
      applies,
      key,
      message: {
        tone: "info" as const,
        message: uiText(input.locale, "Choisis un cheval, une classe NRHA et un concours pour lancer la vérification.", "Choose a horse, NRHA class and show before checking eligibility."),
      },
      request: null,
    };
  }

  if (!input.riderContact) {
    return {
      applies,
      key,
      message: {
        tone: "info" as const,
        message: uiText(input.locale, "Choisis un cavalier ou confirme le propriétaire comme cavalier avant la vérification NRHA.", "Choose a rider or confirm the owner as rider before checking NRHA."),
      },
      request: null,
    };
  }

  if (classCode === null) {
    return {
      applies,
      key,
      message: { tone: "error" as const, message: uiText(input.locale, "Code de classe NRHA numérique manquant.", "Missing numeric NRHA class code.") },
      request: null,
    };
  }

  if (competitionLicenseNumber === null) {
    return {
      applies,
      key,
      message: {
        tone: "error" as const,
        message: uiText(input.locale, "Licence de compétition NRHA du cheval manquante.", "Missing horse NRHA competition license."),
      },
      request: null,
    };
  }

  if (memberNumber === null) {
    return {
      applies,
      key,
      message: { tone: "error" as const, message: uiText(input.locale, "Numéro de membre NRHA du cavalier manquant.", "Missing rider NRHA member number.") },
      request: null,
    };
  }

  if (!date) {
    return {
      applies,
      key,
      message: { tone: "error" as const, message: uiText(input.locale, "Date de concours manquante pour la vérification NRHA.", "Missing show date for NRHA check.") },
      request: null,
    };
  }

  return {
    applies,
    key,
    message: { tone: "info" as const, message: uiText(input.locale, "Vérification NRHA prête.", "NRHA check ready.") },
    request: {
      classCode,
      competitionLicenseNumber,
      date,
      memberNumber,
    },
  };
}

function nrhaApplies(division: Division | null, classRecord: ClassRecord | null, classCode: number | null) {
  const sanctioningCodes = [...(division?.sanctioning_body_codes ?? []), ...(classRecord?.sanctioning_body_codes ?? [])];
  const labels = [division?.name, classRecord?.name, division?.code, classRecord?.code, classRecord?.nrha_slate_number].filter(Boolean).join(" ");

  return (
    sanctioningCodes.includes("NRHA") ||
    division?.payout_schedule_type?.startsWith("nrha_") ||
    Boolean(classRecord?.nrha_slate_number?.trim()) ||
    Boolean(findNrhaApprovedClass(String(classCode ?? ""))) ||
    /\bNRHA\b/i.test(labels)
  );
}

function integerFromReference(value: string) {
  const digits = value.trim().replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerFromExactReference(value: string | null | undefined) {
  const cleanValue = value?.trim() ?? "";

  if (!/^\d+$/.test(cleanValue)) {
    return null;
  }

  const parsed = Number(cleanValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNrhaEligibilityMessage(
  verification: NrhaEligibilityVerification,
  key: string,
  locale: Locale,
): NrhaEligibilityMessage {
  const reasons = (verification.reasons ?? []).map((reason) => reason.message?.trim()).filter(Boolean);
  const reasonText = reasons.length ? ` ${reasons.slice(0, 2).join(" ")}` : "";

  if (verification.eligible) {
    return {
      key,
      tone: "success",
      message: `${uiText(locale, "NRHA: équipe admissible.", "NRHA: team eligible.")}${reasonText}`,
    };
  }

  return {
    key,
    tone: "error",
    message: `${uiText(locale, "NRHA: équipe non admissible.", "NRHA: team not eligible.")}${reasonText}`,
  };
}

export { NrhaEligibilityCheck, sameNrhaEligibilityGate, withNrhaEligibilityReadiness };
export type { NrhaEligibilityGate };
