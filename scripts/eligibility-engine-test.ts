import {
  buildEligibilityFingerprint,
  eligibilityExpiresAt,
  eligibilityPolicyFromAssignment,
  evaluateTeamEligibility,
  isEligibilityCacheFresh,
  type GoverningBodyEligibilityEvidence,
} from "../src/lib/eligibilityEngine";
import type { GoverningBodyAssignment } from "../src/types/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const nrha: GoverningBodyAssignment = {
  governing_body_id: "body-nrha",
  code: "NRHA",
  name: "NRHA",
  reporting_class_code: "1100",
  eligibility_profile_code: "category_1_ancillary_year_end",
  sanction_metadata: {},
};
const aqrNoProfile: GoverningBodyAssignment = {
  governing_body_id: "body-aqr",
  code: "AQR",
  name: "AQR",
  reporting_class_code: "OR-1",
  eligibility_profile_code: null,
  sanction_metadata: {},
};

const pending = evaluateTeamEligibility({ assignments: [nrha, aqrNoProfile], evidence: [], supportedGoverningBodyCodes: ["NRHA"] });
assert(pending.applies && !pending.canProceed && pending.status === "pending", "A configured NRHA profile must wait for a team check");
assert(pending.decisions.find((decision) => decision.governingBodyCode === "AQR")?.status === "not_required", "A governing body without an eligibility profile must not invent a check");

const eligibleEvidence: GoverningBodyEligibilityEvidence = {
  governingBodyId: nrha.governing_body_id,
  status: "eligible",
  reasons: [],
  sourceMode: "cache",
  checkedAt: "2026-07-15T12:00:00.000Z",
  expiresAt: "2026-07-15T18:00:00.000Z",
};
const eligible = evaluateTeamEligibility({ assignments: [nrha, aqrNoProfile], evidence: [eligibleEvidence], supportedGoverningBodyCodes: ["NRHA"] });
assert(eligible.canProceed && eligible.status === "eligible", "Fresh cached eligible evidence must allow the team");

const sourceReason = [{ code: "source_unavailable", message: "NRHA unavailable", subject: "source" as const, blocking: true }];
const unavailableBlocked = evaluateTeamEligibility({
  assignments: [nrha],
  evidence: [{ governingBodyId: nrha.governing_body_id, status: "unavailable", reasons: sourceReason, sourceMode: "live_external" }],
  supportedGoverningBodyCodes: ["NRHA"],
});
assert(!unavailableBlocked.canProceed && unavailableBlocked.reasons[0]?.blocking, "External outages must block by default");

const nrhaWarning = { ...nrha, sanction_metadata: { source_unavailable_policy: "allow_with_warning", eligibility_cache_ttl_hours: 12 } };
const unavailableWarning = evaluateTeamEligibility({
  assignments: [nrhaWarning],
  evidence: [{ governingBodyId: nrha.governing_body_id, status: "unavailable", reasons: sourceReason, sourceMode: "live_external" }],
  supportedGoverningBodyCodes: ["NRHA"],
});
assert(unavailableWarning.canProceed && unavailableWarning.reasons[0]?.blocking === false, "A class may explicitly allow entry with a source-outage warning");
assert(eligibilityPolicyFromAssignment(nrhaWarning).cacheTtlHours === 12, "TTL must come from the class/body assignment");

const unsupported = evaluateTeamEligibility({
  assignments: [{ ...aqrNoProfile, eligibility_profile_code: "aqr_open_2026" }],
  evidence: [],
  supportedGoverningBodyCodes: ["NRHA"],
});
assert(!unsupported.canProceed && unsupported.reasons[0]?.code === "adapter_not_configured", "A configured profile without an adapter must fail explicitly");

const checkedAt = "2026-07-15T12:00:00.000Z";
const expiresAt = eligibilityExpiresAt(checkedAt, 6);
assert(expiresAt === "2026-07-15T18:00:00.000Z", "Eligibility TTL must produce a deterministic expiration");
assert(isEligibilityCacheFresh(expiresAt, "2026-07-15T17:59:59.000Z"), "A cache is reusable before expiration");
assert(!isEligibilityCacheFresh(expiresAt, expiresAt ?? checkedAt), "A cache is stale at its exact expiration");
assert(
  buildEligibilityFingerprint(["NRHA", "1100", 123, 456, "2026-06-12"]) === buildEligibilityFingerprint(["nrha", "1100", 123, 456, "2026-06-12"]),
  "Eligibility fingerprints must normalize stable text values",
);

console.log("eligibility engine tests passed");
