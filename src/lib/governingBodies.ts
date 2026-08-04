import type { GoverningBodyAssignment, GoverningBodyAssignmentInput, SanctioningBody } from "../types/domain";

function toggleGoverningBodyId(currentIds: string[], id: string) {
  return currentIds.includes(id) ? currentIds.filter((currentId) => currentId !== id) : [...currentIds, id];
}

function hasSelectedGoverningBodyCode(ids: string[] | null | undefined, governingBodies: SanctioningBody[], code: string) {
  const normalizedCode = code.trim().toUpperCase();
  return Boolean(ids?.some((id) => governingBodies.find((body) => body.id === id)?.code.toUpperCase() === normalizedCode));
}

function hasGoverningBodyCode(assignments: GoverningBodyAssignment[] | null | undefined, code: string) {
  const normalizedCode = code.trim().toUpperCase();
  return Boolean(assignments?.some((assignment) => assignment.code.toUpperCase() === normalizedCode));
}

function governingBodyAssignmentsFromSelection(input: {
  selectedIds: string[];
  sanctioningBodies: SanctioningBody[];
  existingAssignments?: GoverningBodyAssignment[];
  classCode?: string | null;
  nrhaEligibilityProfileCode?: string | null;
  eligibilityCacheTtlHours?: number;
  sourceUnavailablePolicy?: "block" | "allow_with_warning";
}): GoverningBodyAssignmentInput[] {
  const existingById = new Map((input.existingAssignments ?? []).map((assignment) => [assignment.governing_body_id, assignment]));

  return input.selectedIds.map((governingBodyId) => {
    const body = input.sanctioningBodies.find((candidate) => candidate.id === governingBodyId);
    const existing = existingById.get(governingBodyId);
    const isNrha = body?.code.toUpperCase() === "NRHA";

    return {
      governing_body_id: governingBodyId,
      reporting_class_code: isNrha ? input.classCode?.trim() || null : existing?.reporting_class_code ?? null,
      eligibility_profile_code: isNrha ? input.nrhaEligibilityProfileCode?.trim() || null : existing?.eligibility_profile_code ?? null,
      sanction_metadata: isNrha
        ? {
            ...(existing?.sanction_metadata ?? {}),
            eligibility_cache_ttl_hours: input.eligibilityCacheTtlHours ?? 6,
            source_unavailable_policy: input.sourceUnavailablePolicy ?? "block",
          }
        : existing?.sanction_metadata ?? {},
    };
  });
}

function nrhaClassTypeFromAssignments(assignments: GoverningBodyAssignment[] | null | undefined) {
  return assignments?.find((assignment) => assignment.code.toUpperCase() === "NRHA")?.eligibility_profile_code ?? "";
}

function nrhaEligibilityPolicyFromAssignments(assignments: GoverningBodyAssignment[] | null | undefined) {
  const metadata = assignments?.find((assignment) => assignment.code.toUpperCase() === "NRHA")?.sanction_metadata ?? {};
  const ttl = metadata.eligibility_cache_ttl_hours;
  return {
    cacheTtlHours: typeof ttl === "number" && Number.isFinite(ttl) && ttl > 0 && ttl <= 168 ? ttl : 6,
    sourceUnavailablePolicy: metadata.source_unavailable_policy === "allow_with_warning" ? "allow_with_warning" as const : "block" as const,
  };
}

export {
  governingBodyAssignmentsFromSelection,
  hasGoverningBodyCode,
  hasSelectedGoverningBodyCode,
  nrhaClassTypeFromAssignments,
  nrhaEligibilityPolicyFromAssignments,
  toggleGoverningBodyId,
};
