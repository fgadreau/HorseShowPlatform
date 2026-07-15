import type { GoverningBodyAssignment } from "../types/domain";

export type EligibilityStatus = "eligible" | "ineligible" | "pending" | "unavailable" | "not_required";
export type EligibilitySourceMode = "live_external" | "cache" | "local" | "manual" | "none";
export type SourceUnavailablePolicy = "block" | "allow_with_warning";

export type EligibilityReason = {
  code: string;
  message: string;
  subject: "horse" | "rider" | "team" | "class" | "source";
  blocking: boolean;
};

export type GoverningBodyEligibilityEvidence = {
  governingBodyId: string;
  status: Exclude<EligibilityStatus, "not_required">;
  reasons: EligibilityReason[];
  sourceMode: Exclude<EligibilitySourceMode, "none">;
  checkedAt?: string | null;
  expiresAt?: string | null;
};

export type GoverningBodyEligibilityDecision = {
  governingBodyId: string;
  governingBodyCode: string;
  governingBodyName: string;
  profileCode: string | null;
  status: EligibilityStatus;
  canProceed: boolean;
  reasons: EligibilityReason[];
  sourceMode: EligibilitySourceMode;
  checkedAt: string | null;
  expiresAt: string | null;
};

export type TeamEligibilityDecision = {
  applies: boolean;
  canProceed: boolean;
  status: "eligible" | "ineligible" | "pending";
  decisions: GoverningBodyEligibilityDecision[];
  reasons: EligibilityReason[];
};

const defaultCacheTtlHours = 6;

export function eligibilityPolicyFromAssignment(assignment: GoverningBodyAssignment) {
  const ttlValue = assignment.sanction_metadata.eligibility_cache_ttl_hours;
  const unavailableValue = assignment.sanction_metadata.source_unavailable_policy;
  const cacheTtlHours = typeof ttlValue === "number" && Number.isFinite(ttlValue) && ttlValue > 0 && ttlValue <= 168 ? ttlValue : defaultCacheTtlHours;
  const sourceUnavailablePolicy: SourceUnavailablePolicy = unavailableValue === "allow_with_warning" ? "allow_with_warning" : "block";

  return { cacheTtlHours, sourceUnavailablePolicy };
}
export function eligibilityExpiresAt(checkedAt: string, ttlHours: number) {
  const checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(checkedAtMs)) return null;
  return new Date(checkedAtMs + ttlHours * 60 * 60 * 1000).toISOString();
}

export function isEligibilityCacheFresh(expiresAt: string | null | undefined, now = new Date().toISOString()) {
  if (!expiresAt) return false;
  const expiresAtMs = Date.parse(expiresAt);
  const nowMs = Date.parse(now);
  return Number.isFinite(expiresAtMs) && Number.isFinite(nowMs) && expiresAtMs > nowMs;
}

export function buildEligibilityFingerprint(parts: Array<string | number | boolean | null | undefined>) {
  return parts.map((part) => String(part ?? "").trim().toLowerCase()).join("|");
}

export function evaluateTeamEligibility(input: {
  assignments: GoverningBodyAssignment[];
  evidence: GoverningBodyEligibilityEvidence[];
  supportedGoverningBodyCodes: string[];
}): TeamEligibilityDecision {
  const supportedCodes = new Set(input.supportedGoverningBodyCodes.map((code) => code.trim().toUpperCase()));
  const evidenceByBodyId = new Map(input.evidence.map((item) => [item.governingBodyId, item]));
  const decisions = input.assignments.map((assignment): GoverningBodyEligibilityDecision => {
    const profileCode = assignment.eligibility_profile_code?.trim() || null;
    if (!profileCode) {
      return {
        governingBodyId: assignment.governing_body_id,
        governingBodyCode: assignment.code,
        governingBodyName: assignment.name,
        profileCode,
        status: "not_required",
        canProceed: true,
        reasons: [],
        sourceMode: "none",
        checkedAt: null,
        expiresAt: null,
      };
    }

    if (!supportedCodes.has(assignment.code.trim().toUpperCase())) {
      const reason: EligibilityReason = {
        code: "adapter_not_configured",
        message: `Aucun moteur d'admissibilité n'est configuré pour ${assignment.name} (${profileCode}).`,
        subject: "class",
        blocking: true,
      };
      return {
        governingBodyId: assignment.governing_body_id,
        governingBodyCode: assignment.code,
        governingBodyName: assignment.name,
        profileCode,
        status: "ineligible",
        canProceed: false,
        reasons: [reason],
        sourceMode: "none",
        checkedAt: null,
        expiresAt: null,
      };
    }

    const evidence = evidenceByBodyId.get(assignment.governing_body_id);
    if (!evidence) {
      return {
        governingBodyId: assignment.governing_body_id,
        governingBodyCode: assignment.code,
        governingBodyName: assignment.name,
        profileCode,
        status: "pending",
        canProceed: false,
        reasons: [{ code: "verification_required", message: `Vérification ${assignment.name} requise.`, subject: "team", blocking: true }],
        sourceMode: "none",
        checkedAt: null,
        expiresAt: null,
      };
    }

    const unavailablePolicy = eligibilityPolicyFromAssignment(assignment).sourceUnavailablePolicy;
    const canProceed = evidence.status === "eligible" || (evidence.status === "unavailable" && unavailablePolicy === "allow_with_warning");
    const reasons = evidence.status === "unavailable" && unavailablePolicy === "allow_with_warning"
      ? evidence.reasons.map((reason) => ({ ...reason, blocking: false }))
      : evidence.reasons;

    return {
      governingBodyId: assignment.governing_body_id,
      governingBodyCode: assignment.code,
      governingBodyName: assignment.name,
      profileCode,
      status: evidence.status,
      canProceed,
      reasons,
      sourceMode: evidence.sourceMode,
      checkedAt: evidence.checkedAt ?? null,
      expiresAt: evidence.expiresAt ?? null,
    };
  });
  const applicableDecisions = decisions.filter((decision) => decision.status !== "not_required");
  const canProceed = applicableDecisions.every((decision) => decision.canProceed);
  const hasPending = applicableDecisions.some((decision) => decision.status === "pending");

  return {
    applies: applicableDecisions.length > 0,
    canProceed,
    status: canProceed ? "eligible" : hasPending ? "pending" : "ineligible",
    decisions,
    reasons: applicableDecisions.flatMap((decision) => decision.reasons),
  };
}
