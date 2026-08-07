import {
  governingBodyAssignmentsFromSelection,
  hasGoverningBodyCode,
  hasSelectedGoverningBodyCode,
  nrhaClassTypeFromAssignments,
} from "../src/lib/governingBodies";
import type { GoverningBodyAssignment, SanctioningBody } from "../src/types/domain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const now = "2026-07-14T12:00:00.000Z";
const governingBodies: SanctioningBody[] = [
  { id: "body-nrha", code: "NRHA", name: "NRHA", default_back_number_policy: "horse", description: null, is_active: true, metadata: {}, created_at: now, updated_at: now },
  { id: "body-aqr", code: "AQR", name: "AQR", default_back_number_policy: "horse", description: null, is_active: true, metadata: {}, created_at: now, updated_at: now },
];
const existingAssignments: GoverningBodyAssignment[] = [
  { governing_body_id: "body-aqr", code: "AQR", name: "AQR", reporting_class_code: "AQR-OPEN", eligibility_profile_code: null, sanction_metadata: { house: true } },
];

assert(hasSelectedGoverningBodyCode(["body-nrha", "body-aqr"], governingBodies, "nrha"), "NRHA selection must resolve through the governing-body catalog, not a stored code array");

const assignments = governingBodyAssignmentsFromSelection({
  selectedIds: ["body-nrha", "body-aqr"],
  sanctioningBodies: governingBodies,
  existingAssignments,
  classCode: "1100",
  nrhaEligibilityProfileCode: "category_1_ancillary_year_end",
});

const nrhaInput = assignments.find((assignment) => assignment.governing_body_id === "body-nrha");
const aqrInput = assignments.find((assignment) => assignment.governing_body_id === "body-aqr");
assert(assignments.length === 2, "One HSP class must support several governing bodies");
assert(nrhaInput?.reporting_class_code === "1100", "NRHA report code must live on the NRHA assignment");
assert(nrhaInput?.eligibility_profile_code === "category_1_ancillary_year_end", "NRHA eligibility profile must live on the NRHA assignment");
assert(aqrInput?.reporting_class_code === "AQR-OPEN" && aqrInput.sanction_metadata?.house === true, "Editing NRHA metadata must preserve another governing body's independent metadata");

const hydratedAssignments: GoverningBodyAssignment[] = assignments.map((assignment) => {
  const body = governingBodies.find((candidate) => candidate.id === assignment.governing_body_id)!;
  return {
    governing_body_id: body.id,
    code: body.code,
    name: body.name,
    reporting_class_code: assignment.reporting_class_code ?? null,
    eligibility_profile_code: assignment.eligibility_profile_code ?? null,
    sanction_metadata: assignment.sanction_metadata ?? {},
  };
});
assert(hasGoverningBodyCode(hydratedAssignments, "NRHA"), "Eligibility must be activated by the structured class assignment");
assert(nrhaClassTypeFromAssignments(hydratedAssignments) === "category_1_ancillary_year_end", "Eligibility must read the governing-body profile instead of generic eligibility notes");

const aqrOnly = governingBodyAssignmentsFromSelection({
  selectedIds: ["body-aqr"],
  sanctioningBodies: governingBodies,
  existingAssignments: hydratedAssignments,
  classCode: "1100",
  nrhaEligibilityProfileCode: "category_1_ancillary_year_end",
});
assert(aqrOnly.length === 1 && aqrOnly[0].governing_body_id === "body-aqr", "Removing NRHA must remove its reporting and eligibility assignment without affecting AQR");

console.log("governing body assignment tests passed");
