import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import type { ReadinessItem, ReadinessResult } from "../../lib/readiness";
import { verifyNrhaEligibility } from "../../services/supabaseServices";
import type { NrhaEligibilityVerification } from "../../services/supabaseServices";
import type { ClassRecord, Contact, ContactExternalMembership, Division, ExternalOrganization, Horse, HorseExternalMembership, NrhaRiderRanking, NrhaRiderRankingListType, Show } from "../../types/domain";
import { findNrhaApprovedClass, nrhaClassTypeFromRules } from "../classes/classUtils";
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
  nrhaRiderRankings,
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
  nrhaRiderRankings: NrhaRiderRanking[];
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
    memberExpiresOn: riderNrhaMembership?.expires_on ?? null,
    memberNumber: riderNrhaMembership?.membership_number ?? "",
    memberStatus: riderNrhaMembership?.status ?? null,
    riderContact,
    show,
  });
  const visibleResultMessage = resultMessage && resultMessage.key === context.key ? resultMessage : null;
  const category26RankingGate = buildNrhaCategory26RankingGate({
    classRecord,
    division,
    key: context.key,
    locale,
    nrhaRiderRankings,
    riderContact,
    show,
  });
  const gate = buildNrhaEligibilityGate(context, visibleResultMessage, locale, skip, category26RankingGate);

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
      <InlineHealthMessage value={gate.message} />
    </div>
  );
}

function buildNrhaEligibilityGate(
  context: ReturnType<typeof buildNrhaEligibilityContext>,
  resultMessage: NrhaEligibilityMessage | null,
  locale: Locale,
  skip: boolean,
  category26RankingGate: NrhaCategory26RankingGate,
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

  if (category26RankingGate.applies && !category26RankingGate.canProceed) {
    return {
      applies: true,
      canProceed: false,
      eligible: false,
      key: context.key,
      message: category26RankingGate.message,
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
  memberExpiresOn: string | null;
  memberNumber: string;
  memberStatus: ContactExternalMembership["status"] | null;
  riderContact: Contact | null;
  show: Show | null;
}) {
  const classCode = nrhaClassCodeForEligibility(input.division, input.classRecord);
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

  if (input.memberStatus === "expired" || (input.memberExpiresOn && input.memberExpiresOn.slice(0, 10) < date)) {
    const expiresOn = input.memberExpiresOn ? ` (${input.memberExpiresOn.slice(0, 10)})` : "";

    return {
      applies,
      key,
      message: {
        tone: "error" as const,
        message: uiText(input.locale, `Membre NRHA du cavalier expiré${expiresOn}; revalide le membre NRHA avant l'inscription.`, `Rider NRHA membership expired${expiresOn}; revalidate the NRHA member before entry.`),
      },
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

type NrhaCategory26RankingGate = {
  applies: boolean;
  canProceed: boolean;
  message: NrhaEligibilityMessage | null;
};

const nrhaCategory26OpenClassLevels = new Map([
  [2100, 4],
  [6210, 4],
  [2200, 3],
  [6220, 3],
  [2300, 2],
  [6230, 2],
  [2325, 1],
  [6231, 1],
]);

const nrhaCategory26NonProClassLevels = new Map([
  [2400, 4],
  [6240, 4],
  [2500, 3],
  [6250, 3],
  [2600, 2],
  [6260, 2],
  [2625, 1],
  [6261, 1],
]);

function buildNrhaCategory26RankingGate(input: {
  classRecord: ClassRecord | null;
  division: Division | null;
  key: string;
  locale: Locale;
  nrhaRiderRankings: NrhaRiderRanking[];
  riderContact: Contact | null;
  show: Show | null;
}): NrhaCategory26RankingGate {
  const classCode = nrhaClassCodeForEligibility(input.division, input.classRecord);
  const classType = nrhaClassTypeForEligibility(input.division, input.classRecord, classCode);
  const family = classCode && nrhaCategory26OpenClassLevels.has(classCode) ? "open" : classCode && nrhaCategory26NonProClassLevels.has(classCode) ? "non_pro" : null;
  const classLevel = family === "open" && classCode ? nrhaCategory26OpenClassLevels.get(classCode) ?? null : family === "non_pro" && classCode ? nrhaCategory26NonProClassLevels.get(classCode) ?? null : null;
  const applies = Boolean(classLevel && (classType === "category_2_aged_show" || classType === "category_6_closed_aged_show"));

  if (!applies || !family || !classLevel || !input.show || !input.riderContact) {
    return { applies, canProceed: true, message: null };
  }

  const eligibilityYear = eligibilityYearFromShow(input.show);
  const riderMatchKeys = contactNrhaRiderNameMatchKeys(input.riderContact);

  if (!eligibilityYear || !riderMatchKeys.length) {
    return { applies, canProceed: true, message: null };
  }

  const sources: Array<{ listType: NrhaRiderRankingListType; rank: number }> = [];
  let minimumLevel = 1;

  if (family === "open") {
    for (const listType of ["top_professional_riders", "top_200_lifetime_all_riders"] as const) {
      const ranking = findNrhaRiderRanking(input.nrhaRiderRankings, eligibilityYear, listType, riderMatchKeys);

      if (ranking) {
        minimumLevel = Math.max(minimumLevel, nrhaCategory26RankLevel(ranking.rank));
        sources.push({ listType, rank: ranking.rank });
      }
    }
  } else {
    const nonProRanking = findNrhaRiderRanking(input.nrhaRiderRankings, eligibilityYear, "top_200_non_pro_riders", riderMatchKeys);

    if (nonProRanking) {
      minimumLevel = Math.max(minimumLevel, nrhaCategory26RankLevel(nonProRanking.rank));
      sources.push({ listType: "top_200_non_pro_riders", rank: nonProRanking.rank });
    }

    const lifetimeRanking = findNrhaRiderRanking(input.nrhaRiderRankings, eligibilityYear, "top_200_lifetime_all_riders", riderMatchKeys);

    if (lifetimeRanking) {
      minimumLevel = Math.max(minimumLevel, 2);
      sources.push({ listType: "top_200_lifetime_all_riders", rank: lifetimeRanking.rank });
    }
  }

  if (classLevel >= minimumLevel) {
    return { applies, canProceed: true, message: null };
  }

  const sourceText = sources.length ? sources.map((source) => `${nrhaRankingListLabel(source.listType, input.locale)} #${source.rank}`).join(", ") : uiText(input.locale, "listes NRHA importées", "imported NRHA lists");
  const minimumLevelText =
    minimumLevel === 4
      ? uiText(input.locale, "Level 4 seulement", "Level 4 only")
      : uiText(input.locale, `Level ${minimumLevel} ou plus haut`, `Level ${minimumLevel} or higher`);

  return {
    applies,
    canProceed: false,
    message: {
      key: input.key,
      tone: "error",
      message: uiText(
        input.locale,
        `NRHA Cat. 2/6: ${sourceText}. Niveau minimal déduit: ${minimumLevelText}; cette classe est Level ${classLevel}.`,
        `NRHA Cat. 2/6: ${sourceText}. Deduced minimum level: ${minimumLevelText}; this class is Level ${classLevel}.`,
      ),
    },
  };
}

function nrhaClassCodeForEligibility(division: Division | null, classRecord: ClassRecord | null) {
  return integerFromExactReference(division?.code) ?? integerFromExactReference(classRecord?.code) ?? integerFromExactReference(classRecord?.nrha_slate_number);
}

function nrhaClassTypeForEligibility(division: Division | null, classRecord: ClassRecord | null, classCode: number | null) {
  return nrhaClassTypeFromRules(division?.eligibility_rules) || nrhaClassTypeFromRules(classRecord?.eligibility_rules) || findNrhaApprovedClass(String(classCode ?? ""))?.nrhaClassType || "";
}

function findNrhaRiderRanking(
  rankings: NrhaRiderRanking[],
  eligibilityYear: number,
  listType: NrhaRiderRankingListType,
  riderMatchKeys: string[],
) {
  const matchKeys = new Set(riderMatchKeys);

  return rankings.find(
    (ranking) =>
      ranking.eligibility_year === eligibilityYear &&
      ranking.list_type === listType &&
      matchKeys.has(ranking.rider_name_match_key),
  );
}

function nrhaCategory26RankLevel(rank: number) {
  if (rank <= 35) return 4;
  if (rank <= 90) return 3;
  if (rank <= 200) return 2;
  return 1;
}

function nrhaRankingListLabel(listType: NrhaRiderRankingListType, locale: Locale) {
  switch (listType) {
    case "top_professional_riders":
      return uiText(locale, "Top Pro Riders", "Top Pro Riders");
    case "top_200_non_pro_riders":
      return uiText(locale, "Top 200 Non Pro Riders", "Top 200 Non Pro Riders");
    case "top_200_lifetime_all_riders":
    default:
      return uiText(locale, "Top 200 Lifetime All Riders", "Top 200 Lifetime All Riders");
  }
}

function eligibilityYearFromShow(show: Show) {
  const year = Number(show.start_date.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

function contactNrhaRiderNameMatchKeys(contact: Contact) {
  const fullNameKey = normalizeNrhaRiderName([contact.first_name, contact.middle_name, contact.last_name].filter(Boolean).join(" "));
  const firstGivenName = contact.first_name.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  const firstNameLastNameKey = normalizeNrhaRiderName([firstGivenName, contact.last_name].filter(Boolean).join(" "));

  return [...new Set([fullNameKey, firstNameLastNameKey].filter(Boolean))];
}

function normalizeNrhaRiderName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
