import type { ClassRecord, Division, ShowScoreClassSetup } from "../types/domain";

export const AQR_AUDIT_IMPORT_SOURCE = "showscore_draw_aqr_audit";

export const SHOWSCORE_RUN_TECHNICAL_FIELDS = [
  "runId",
  "blockRunId",
  "entryId",
  "entryIds",
  "divisionId",
  "divisionIds",
  "horseId",
  "ownerContactId",
  "riderContactId",
  "payerContactId",
  "hspImportBatchId",
] as const;

export type ShowScoreRunTechnicalField = (typeof SHOWSCORE_RUN_TECHNICAL_FIELDS)[number];

export type RunTechnicalSnapshot = {
  presentFields: ShowScoreRunTechnicalField[];
  values: Partial<Record<ShowScoreRunTechnicalField, unknown>>;
};

export type NormalizedShowScoreDrawRun = {
  sourceRunId: string;
  order: number;
  draw: number;
  backNumber: string;
  rider: string;
  horse: string;
  owner: string;
  status: string;
  classCodes: string[];
  raw: Record<string, unknown>;
};

export type AqrAuditRunPreview = {
  run: NormalizedShowScoreDrawRun;
  matchedDivisions: Division[];
  errors: string[];
  warnings: string[];
};

export type AqrAuditClassPreview = {
  classRecord: ClassRecord;
  setup: ShowScoreClassSetup;
  runs: AqrAuditRunPreview[];
  entryCount: number;
  errors: string[];
  warnings: string[];
};

export type AqrAuditImportPreview = {
  showId: string;
  classPreviews: AqrAuditClassPreview[];
  totalRuns: number;
  totalEntries: number;
  errors: string[];
  warnings: string[];
};

export function previewShowScoreDrawEntryImport(input: {
  showId: string;
  classIds?: string[];
  classes: ClassRecord[];
  divisions: Division[];
  showScoreClassSetups: ShowScoreClassSetup[];
}): AqrAuditImportPreview {
  const selectedClassIds = input.classIds?.length ? new Set(input.classIds) : null;
  const classesById = new Map(input.classes.map((classRecord) => [classRecord.id, classRecord]));
  const divisionsByClassId = groupBy(input.divisions, (division) => division.class_id);
  const classPreviews: AqrAuditClassPreview[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const setups = input.showScoreClassSetups
    .filter((setup) => setup.show_id === input.showId)
    .filter((setup) => setup.is_draw_imported)
    .filter((setup) => !selectedClassIds || selectedClassIds.has(setup.class_id));

  for (const setup of setups) {
    const classRecord = classesById.get(setup.class_id);

    if (!classRecord) {
      errors.push(`Bloc ShowScore ${setup.class_id} introuvable dans HSP.`);
      continue;
    }

    const classErrors: string[] = [];
    const classWarnings: string[] = [];

    if (setup.finalized) {
      classErrors.push(`${classRecord.name}: setup ShowScore finalise.`);
    }

    if (setup.started_at || setup.locked_at) {
      classErrors.push(`${classRecord.name}: pointage ShowScore deja demarre ou verrouille.`);
    }

    const classDivisions = divisionsByClassId.get(classRecord.id) ?? [];
    const runPreviews = setup.runs.map((run, index) => {
      const normalizedRun = normalizeShowScoreDrawRun(run, index);
      const matchedDivisions = matchRunDivisions(normalizedRun, classRecord, classDivisions);
      const runErrors: string[] = [];
      const runWarnings: string[] = [];

      if (!normalizedRun.horse) {
        runErrors.push(`Draw ${formatDrawLabel(normalizedRun)}: cheval manquant.`);
      }

      if (!normalizedRun.owner && !normalizedRun.rider) {
        runErrors.push(`Draw ${formatDrawLabel(normalizedRun)}: proprietaire/cavalier manquant.`);
      }

      if (!matchedDivisions.length) {
        runErrors.push(`Draw ${formatDrawLabel(normalizedRun)}: aucun code de classe HSP reconnu (${normalizedRun.classCodes.join(", ") || "aucun code"}).`);
      }

      if (!normalizedRun.classCodes.length && classDivisions.length === 1) {
        runWarnings.push(`Draw ${formatDrawLabel(normalizedRun)}: division unique utilisee par defaut.`);
      }

      return {
        run: normalizedRun,
        matchedDivisions,
        errors: runErrors,
        warnings: runWarnings,
      };
    });

    classErrors.push(...runPreviews.flatMap((runPreview) => runPreview.errors));
    classWarnings.push(...runPreviews.flatMap((runPreview) => runPreview.warnings));
    errors.push(...classErrors);
    warnings.push(...classWarnings);

    classPreviews.push({
      classRecord,
      setup,
      runs: runPreviews,
      entryCount: runPreviews.reduce((sum, runPreview) => sum + runPreview.matchedDivisions.length, 0),
      errors: classErrors,
      warnings: classWarnings,
    });
  }

  if (!setups.length) {
    warnings.push("Aucun draw ShowScore importe pour ce show.");
  }

  return {
    showId: input.showId,
    classPreviews,
    totalRuns: classPreviews.reduce((sum, classPreview) => sum + classPreview.runs.length, 0),
    totalEntries: classPreviews.reduce((sum, classPreview) => sum + classPreview.entryCount, 0),
    errors,
    warnings,
  };
}

export function normalizeShowScoreDrawRun(run: Record<string, unknown>, index = 0): NormalizedShowScoreDrawRun {
  const draw = getNumber(run, "draw") ?? getNumber(run, "order") ?? index + 1;
  const order = getNumber(run, "order") ?? draw;
  const sourceRunId = getString(run, "id") || getString(run, "runId") || getString(run, "run_id") || `${order}-${draw}`;

  return {
    sourceRunId,
    order,
    draw,
    backNumber: getString(run, "backNumber") || getString(run, "back_number"),
    rider: getString(run, "rider") || getString(run, "riderName"),
    horse: getString(run, "horse") || getString(run, "horseName"),
    owner: getString(run, "owner") || getString(run, "ownerName"),
    status: (getString(run, "status") || "active").toLowerCase(),
    classCodes: getStringArray(run, "classCodes"),
    raw: run,
  };
}

export function matchRunDivisions(
  run: NormalizedShowScoreDrawRun,
  classRecord: ClassRecord,
  classDivisions: Division[],
) {
  if (!run.classCodes.length && classDivisions.length === 1) {
    return classDivisions;
  }

  const normalizedCodes = new Set(run.classCodes.map(normalizeCode).filter(Boolean));
  const matched = classDivisions.filter((division) => {
    const candidates = [division.code, division.name].map((value) => normalizeCode(value ?? ""));
    return candidates.some((candidate) => candidate && normalizedCodes.has(candidate));
  });

  if (!matched.length && classDivisions.length === 1 && normalizedCodes.has(normalizeCode(classRecord.code ?? ""))) {
    return classDivisions;
  }

  return matched;
}

export function buildAqrExternalSourceKey(input: {
  classId: string;
  divisionId: string;
  run: NormalizedShowScoreDrawRun;
}) {
  return `${input.classId}:${input.run.sourceRunId}:${input.divisionId}`;
}

export function isAqrScratchRun(run: NormalizedShowScoreDrawRun) {
  return ["scratch", "scratched", "scratched_pending_refund"].includes(run.status);
}

export function captureRunTechnicalSnapshot(run: Record<string, unknown>): RunTechnicalSnapshot {
  const presentFields = SHOWSCORE_RUN_TECHNICAL_FIELDS.filter((field) => Object.prototype.hasOwnProperty.call(run, field));
  const values = presentFields.reduce<RunTechnicalSnapshot["values"]>((snapshot, field) => {
    snapshot[field] = run[field];
    return snapshot;
  }, {});

  return { presentFields, values };
}

export function restoreRunTechnicalSnapshot(
  run: Record<string, unknown>,
  snapshot: RunTechnicalSnapshot | null | undefined,
) {
  const restored = { ...run };

  for (const field of SHOWSCORE_RUN_TECHNICAL_FIELDS) {
    if (snapshot?.presentFields.includes(field)) {
      restored[field] = snapshot.values[field] ?? null;
    } else {
      delete restored[field];
    }
  }

  return restored;
}

export function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function getString(run: Record<string, unknown>, key: string) {
  const value = run[key];
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(run: Record<string, unknown>, key: string) {
  const value = run[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getStringArray(run: Record<string, unknown>, key: string) {
  const value = run[key];

  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,;/]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function formatDrawLabel(run: NormalizedShowScoreDrawRun) {
  return run.draw || run.order || run.sourceRunId;
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = getKey(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }

  return grouped;
}
