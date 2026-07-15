import type { IdentityComparison } from "./identityComparison";

type ExternalImportSubjectType = "contact" | "horse";
type ExternalImportChangeType = "fill_missing" | "replace_existing";

type ExternalImportField<Key extends string = string> = {
  key: Key;
  currentValue: string;
  proposedValue: string;
  changeType: ExternalImportChangeType;
};

type ExternalImportFieldCandidate<Key extends string = string> = {
  key: Key;
  currentValue: string | null | undefined;
  proposedValue: string | null | undefined;
  equals?: (currentValue: string, proposedValue: string) => boolean;
};

type ExternalImportProposal<Key extends string = string> = {
  schemaVersion: 1;
  subjectType: ExternalImportSubjectType;
  sourceCode: string;
  sourceRecordKey: string | null;
  capturedAt: string;
  comparison: IdentityComparison | null;
  fields: ExternalImportField<Key>[];
};

type ExternalImportFieldDecision<Key extends string = string> = ExternalImportField<Key> & {
  decision: "accepted" | "rejected";
};

type ExternalImportDecision<Key extends string = string> = {
  schemaVersion: 1;
  subjectType: ExternalImportSubjectType;
  sourceCode: string;
  sourceRecordKey: string | null;
  capturedAt: string;
  decidedAt: string;
  comparison: IdentityComparison | null;
  acceptedFields: Key[];
  rejectedFields: Key[];
  fields: ExternalImportFieldDecision<Key>[];
};

function buildExternalImportFields<Key extends string>(
  candidates: ExternalImportFieldCandidate<Key>[],
): ExternalImportField<Key>[] {
  const fields: ExternalImportField<Key>[] = [];

  for (const candidate of candidates) {
    const currentValue = candidate.currentValue?.trim() ?? "";
    const proposedValue = candidate.proposedValue?.trim() ?? "";

    if (!proposedValue) {
      continue;
    }

    const matches = candidate.equals
      ? candidate.equals(currentValue, proposedValue)
      : currentValue === proposedValue;

    if (matches) {
      continue;
    }

    fields.push({
      key: candidate.key,
      currentValue,
      proposedValue,
      changeType: currentValue ? "replace_existing" : "fill_missing",
    });
  }

  return fields;
}

function defaultAcceptedExternalImportKeys<Key extends string>(fields: Array<Pick<ExternalImportField<Key>, "key" | "changeType">>) {
  return fields.filter((field) => field.changeType === "fill_missing").map((field) => field.key);
}

function buildExternalImportProposal<Key extends string>(input: {
  subjectType: ExternalImportSubjectType;
  sourceCode: string;
  sourceRecordKey?: string | null;
  capturedAt?: string;
  comparison?: IdentityComparison | null;
  fields: ExternalImportField<Key>[];
}): ExternalImportProposal<Key> {
  return {
    schemaVersion: 1,
    subjectType: input.subjectType,
    sourceCode: input.sourceCode.trim().toUpperCase(),
    sourceRecordKey: input.sourceRecordKey?.trim() || null,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    comparison: input.comparison ?? null,
    fields: input.fields.map((field) => ({ ...field })),
  };
}

function decideExternalImport<Key extends string>(
  proposal: ExternalImportProposal<Key>,
  acceptedKeys: Iterable<Key>,
  decidedAt = new Date().toISOString(),
): ExternalImportDecision<Key> {
  const proposedKeys = new Set(proposal.fields.map((field) => field.key));
  const acceptedKeySet = new Set(Array.from(acceptedKeys).filter((key) => proposedKeys.has(key)));
  const fields = proposal.fields.map((field) => ({
    ...field,
    decision: acceptedKeySet.has(field.key) ? "accepted" as const : "rejected" as const,
  }));

  return {
    schemaVersion: 1,
    subjectType: proposal.subjectType,
    sourceCode: proposal.sourceCode,
    sourceRecordKey: proposal.sourceRecordKey,
    capturedAt: proposal.capturedAt,
    decidedAt,
    comparison: proposal.comparison,
    acceptedFields: fields.filter((field) => field.decision === "accepted").map((field) => field.key),
    rejectedFields: fields.filter((field) => field.decision === "rejected").map((field) => field.key),
    fields,
  };
}

function withExternalImportDecision(
  payload: Record<string, unknown>,
  decision: ExternalImportDecision,
): Record<string, unknown> {
  return {
    ...payload,
    externalImportDecision: decision,
  };
}

function applyExternalImportDecision<Key extends string>(
  values: Partial<Record<Key, string>>,
  decision: ExternalImportDecision<Key>,
): Partial<Record<Key, string>> {
  const nextValues = { ...values };

  for (const field of decision.fields) {
    if (field.decision === "accepted") {
      nextValues[field.key] = field.proposedValue;
    }
  }

  return nextValues;
}

export {
  buildExternalImportFields,
  buildExternalImportProposal,
  decideExternalImport,
  defaultAcceptedExternalImportKeys,
  applyExternalImportDecision,
  withExternalImportDecision,
};
export type {
  ExternalImportChangeType,
  ExternalImportDecision,
  ExternalImportField,
  ExternalImportFieldCandidate,
  ExternalImportProposal,
  ExternalImportSubjectType,
};
