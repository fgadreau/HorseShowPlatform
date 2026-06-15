import { useState } from "react";
import { Trash2 } from "lucide-react";
import { EmptyState, Metric, SearchSelect, ViewIntro } from "../../components/ui";
import { divisionLabel, findById, formatDate, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { buildShowScoreRunsForClass, type ShowScoreRun } from "../../services/showScoreAdapters";
import type { ClassRecord, Contact, Division, Entry, Horse, Show, ShowDay, ShowScoreClassSetup, ShowScorePaidWarmup } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { classEntriesCloseLabel, showDayLabel } from "../classes/classUtils";
import { classEntriesAreClosed } from "../dashboard/shared";

function ScoringView({
  locale,
  classes,
  contacts,
  divisions,
  entries,
  horses,
  showDays,
  showScoreClassSetups,
  showScorePaidWarmups,
  shows,
  onDeleteShowScorePaidWarmup,
  onPrepareShowScoreClass,
}: {
  locale: Locale;
  classes: ClassRecord[];
  contacts: Contact[];
  divisions: Division[];
  entries: Entry[];
  horses: Horse[];
  showDays: ShowDay[];
  showScoreClassSetups: ShowScoreClassSetup[];
  showScorePaidWarmups: ShowScorePaidWarmup[];
  shows: Show[];
  onDeleteShowScorePaidWarmup: (id: string) => Promise<void>;
  onPrepareShowScoreClass: (classRecord: ClassRecord) => Promise<void>;
}) {
  const [showId, setShowId] = useState("");
  const [busyClassId, setBusyClassId] = useState("");
  const [busyWarmupId, setBusyWarmupId] = useState("");
  const [expandedDrawClassIds, setExpandedDrawClassIds] = useState<string[]>([]);
  const [expandedWarmupIds, setExpandedWarmupIds] = useState<string[]>([]);
  const selectedShowId = showId || shows[0]?.id || "";
  const visibleClasses = selectedShowId ? classes.filter((classRecord) => classRecord.show_id === selectedShowId) : classes;
  const visiblePaidWarmups = selectedShowId ? showScorePaidWarmups.filter((warmup) => warmup.show_id === selectedShowId) : showScorePaidWarmups;
  const sortedVisiblePaidWarmups = [...visiblePaidWarmups].sort(compareShowScorePaidWarmups);
  const preparedClassIds = new Set(showScoreClassSetups.map((setup) => setup.class_id));
  const totalRuns = visibleClasses.reduce(
    (sum, classRecord) =>
      sum +
      buildShowScoreRunsForClass(classRecord.id, entries, {
        contacts,
        divisions,
        horses,
      }).length,
    0,
  );

  async function handlePrepare(classRecord: ClassRecord) {
    setBusyClassId(classRecord.id);

    try {
      await onPrepareShowScoreClass(classRecord);
    } finally {
      setBusyClassId("");
    }
  }

  async function handleDeletePaidWarmup(warmup: ShowScorePaidWarmup) {
    if (!window.confirm(`Supprimer le paid warm up "${warmup.name}"?`)) {
      return;
    }

    setBusyWarmupId(warmup.id);

    try {
      await onDeleteShowScorePaidWarmup(warmup.id);
    } finally {
      setBusyWarmupId("");
    }
  }

  function toggleDraw(classId: string) {
    setExpandedDrawClassIds((current) => (current.includes(classId) ? current.filter((candidate) => candidate !== classId) : [...current, classId]));
  }

  function toggleWarmup(warmupId: string) {
    setExpandedWarmupIds((current) => (current.includes(warmupId) ? current.filter((candidate) => candidate !== warmupId) : [...current, warmupId]));
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Pointage", "Scoring")}
        title={uiText(locale, "Préparation ShowScore", "ShowScore preparation")}
        description={uiText(locale, "Prépare les blocs, passages, chevaux et cavaliers qui doivent être envoyés vers le pointage.", "Prepare schedule blocks, runs, horses and riders that need to be sent to scoring.")}
        stats={[
          { label: uiText(locale, "Blocs", "Blocks"), value: String(visibleClasses.length) },
          { label: "Runs", value: String(totalRuns) },
          { label: "Paid warmups", value: String(visiblePaidWarmups.length) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric label={uiText(locale, "Blocs de pointage", "Scoring blocks")} value={String(visibleClasses.length)} />
        <Metric label={uiText(locale, "Runs depuis les inscriptions", "Runs from entries")} value={String(totalRuns)} />
        <Metric label={uiText(locale, "Préparations prêtes", "Prepared setups")} value={String(visibleClasses.filter((classRecord) => preparedClassIds.has(classRecord.id)).length)} />
        <Metric label="Paid warmups" value={String(visiblePaidWarmups.length)} />
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>ShowScore bridge</h2>
            <p>{uiText(locale, "Prépare les runs de pointage depuis les inscriptions HSP en gardant associations, blocs, chevaux et cavaliers alignés.", "Prepare scoring setup runs from HSP entries while keeping associations, blocks, horses and riders aligned.")}</p>
          </div>
          <select value={selectedShowId} onChange={(event) => setShowId(event.target.value)}>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </select>
        </div>
        <div className="table scoring-table">
          <div className="table-row table-head">
            <span>Bloc</span>
            <span>{uiText(locale, "Horaire", "Schedule")}</span>
            <span>Runs</span>
            <span>ShowScore</span>
          </div>
          {visibleClasses.map((classRecord) => {
            const setup = showScoreClassSetups.find((candidate) => candidate.class_id === classRecord.id);
            const runs = buildShowScoreRunsForClass(classRecord.id, entries, {
              contacts,
              divisions,
              horses,
            });
            const day = findById(showDays, classRecord.show_day_id);
            const show = findById(shows, classRecord.show_id);
            const preparedRunCount = setup?.runs.length ?? 0;
            const entriesClosed = classEntriesAreClosed(classRecord);
            const status = !entriesClosed ? uiText(locale, "Inscriptions ouvertes", "Entries open") : setup?.finalized ? uiText(locale, "Finalisé", "Finalized") : setup ? uiText(locale, "Ordre sorti", "Draw created") : runs.length ? uiText(locale, "Prêt à sortir", "Ready to draw") : uiText(locale, "Aucune inscription", "No entries");
            const statusClass = !entriesClosed ? "warning" : setup?.finalized ? "closed" : setup ? "info" : runs.length ? "open" : "draft";
            const canPrepare = entriesClosed && runs.length > 0 && !setup?.locked_at && !setup?.finalized;
            const prepareLabel = !entriesClosed ? uiText(locale, "Sortie après cutoff", "Draw after cutoff") : busyClassId === classRecord.id ? uiText(locale, "Préparation", "Preparing") : setup ? uiText(locale, "Rafraîchir ordre", "Refresh draw") : uiText(locale, "Sortir ordre", "Create draw");

            const drawRuns = setup?.runs.length ? normalizeShowScoreRuns(setup.runs) : runs;
            const drawIsExpanded = expandedDrawClassIds.includes(classRecord.id);
            const lateRunCount = drawRuns.filter((run) => run.isLate || run.drawGroup === "late").length;
            const regularRunCount = Math.max(0, drawRuns.length - lateRunCount);
            const lastRegularDraw = drawRuns.reduce((highest, run) => (run.draw > 0 ? Math.max(highest, run.draw) : highest), 0);
            const missingBackNumberCount = drawRuns.filter((run) => !run.backNumber.trim()).length;

            return (
              <div className="scoring-class-group" key={classRecord.id}>
                <div className="table-row">
                  <div>
                    <strong>{classRecord.name}</strong>
                    <span className="muted-line">{classRecord.code || uiText(locale, "Sans code", "No code")}</span>
                  </div>
                  <div>
                    <span>{showLabel(show)}</span>
                    <span className="muted-line">{day ? `${day.day_name || uiText(locale, "Jour", "Day")} - ${formatDate(day.day_date)}` : uiText(locale, "Aucune journée assignée", "No day assigned")}</span>
                    <span className="muted-line">{classEntriesCloseLabel(classRecord)}</span>
                  </div>
                  <div>
                    <strong>{runs.length}</strong>
                    <span className="muted-line">{preparedRunCount ? uiText(locale, `${preparedRunCount} sauvegardé${preparedRunCount === 1 ? "" : "s"}`, `${preparedRunCount} saved`) : uiText(locale, "Pas encore sauvegardé", "Not saved yet")}</span>
                  </div>
                  <div className="row-actions">
                    <span className={`badge ${statusClass}`}>{status}</span>
                    <button className="text-button" disabled={!canPrepare || busyClassId === classRecord.id} type="button" onClick={() => handlePrepare(classRecord)}>
                      {prepareLabel}
                    </button>
                    <button className="text-button" disabled={!drawRuns.length} type="button" onClick={() => toggleDraw(classRecord.id)}>
                      {drawIsExpanded ? uiText(locale, "Masquer ordre", "Hide draw") : uiText(locale, "Voir ordre", "View draw")}
                    </button>
                  </div>
                </div>
                {drawIsExpanded ? (
                  <div className="draw-detail-panel">
                    <div className="draw-detail-summary">
                      <span>{drawRuns.length} {uiText(locale, "passages", "runs")}</span>
                      <span>{lateRunCount} {uiText(locale, "tardifs", "late")}</span>
                      <span>{regularRunCount} {uiText(locale, "réguliers", "regular")}</span>
                      <span>{uiText(locale, "Dernier draw", "Last draw")} {lastRegularDraw || "-"}</span>
                      <span>{missingBackNumberCount ? uiText(locale, `${missingBackNumberCount} dossard${missingBackNumberCount === 1 ? "" : "s"} à assigner`, `${missingBackNumberCount} back number${missingBackNumberCount === 1 ? "" : "s"} to assign`) : uiText(locale, "Dossards complets", "Back numbers complete")}</span>
                    </div>
                    <div className="draw-list">
                      <div className="draw-list-row draw-list-head">
                        <span>Draw</span>
                        <span>Dossard</span>
                        <span>{uiText(locale, "Cavalier", "Rider")}</span>
                        <span>{uiText(locale, "Cheval", "Horse")}</span>
                        <span>{uiText(locale, "Propriétaire", "Owner")}</span>
                        <span>{uiText(locale, "Classes inscrites", "Entered classes")}</span>
                        <span>{uiText(locale, "Statut", "Status")}</span>
                      </div>
                      {drawRuns.map((run) => (
                        <div className="draw-list-row" key={`${run.entryId}-${run.draw}`}>
                          <strong>{formatDrawNumber(run.draw)}</strong>
                          <span className={run.backNumber.trim() ? undefined : "draw-missing-value"}>{formatBackNumber(run.backNumber)}</span>
                          <span>{run.rider || "-"}</span>
                          <span>{run.horse || "-"}</span>
                          <span>{run.owner || "-"}</span>
                          <span>{formatRunDivisionNames(run, divisions, classes)}</span>
                          <span className={`badge ${run.isLate || run.drawGroup === "late" ? "warning" : "info"}`}>
                            {run.isLate || run.drawGroup === "late" ? uiText(locale, "Tardif", "Late") : uiText(locale, "Régulier", "Regular")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!visibleClasses.length ? <EmptyState label={uiText(locale, "Crée des blocs avant de préparer ShowScore.", "Create schedule blocks before preparing ShowScore.")} /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Paid warmups ShowScore", "ShowScore paid warmups")}</h2>
            <p>{uiText(locale, "Crée les paid warmups avec les inscriptions HSP, dans l'ordre de passage que ShowScore sait lire en live.", "Create paid warmups from HSP entries in the draw order ShowScore already reads live.")}</p>
          </div>
        </div>

        <div className="table scoring-table">
          <div className="table-row table-head">
            <span>Paid warmup</span>
            <span>{uiText(locale, "Horaire", "Schedule")}</span>
            <span>{uiText(locale, "Inscriptions", "Entries")}</span>
            <span>ShowScore</span>
          </div>
          {sortedVisiblePaidWarmups.map((warmup) => {
            const sourceClassId = sourceClassIdFromWarmup(warmup);
            const sourceClass = sourceClassId ? findById(classes, sourceClassId) : null;
            const day = findById(showDays, warmup.show_day_id);
            const warmupEntries = normalizePaidWarmupEntries(warmup.entries);
            const expanded = expandedWarmupIds.includes(warmup.id);
            const busy = busyWarmupId === warmup.id;

            return (
              <div className="scoring-class-group" key={warmup.id}>
                <div className="table-row">
                  <div>
                    <strong>{warmup.name}</strong>
                    <span className="muted-line">{warmup.arena || uiText(locale, "Arène non assignée", "No arena assigned")}</span>
                  </div>
                  <div>
                    <span>{day ? `${day.day_name || uiText(locale, "Jour", "Day")} - ${formatDate(day.day_date)}` : uiText(locale, "Aucune journée assignée", "No day assigned")}</span>
                    <span className="muted-line">{formatPaidWarmupSchedule(warmup, locale)}</span>
                  </div>
                  <div>
                    <strong>{warmupEntries.length}</strong>
                    <span className="muted-line">{formatPaidWarmupPacing(warmup, locale)}</span>
                  </div>
                  <div className="row-actions">
                    <span className={`badge ${warmup.is_public_live ? "open" : "draft"}`}>{warmup.is_public_live ? uiText(locale, "Public", "Public") : uiText(locale, "Privé", "Private")}</span>
                    <button className="text-button" disabled={!warmupEntries.length} type="button" onClick={() => toggleWarmup(warmup.id)}>
                      {expanded ? uiText(locale, "Masquer ordre", "Hide order") : uiText(locale, "Voir ordre", "View order")}
                    </button>
                    <button className="text-button danger-text inline-action" disabled={busy} type="button" onClick={() => handleDeletePaidWarmup(warmup)}>
                      <Trash2 size={14} aria-hidden="true" />
                      {uiText(locale, "Supprimer", "Delete")}
                    </button>
                  </div>
                </div>
                {expanded ? (
                  <div className="draw-detail-panel">
                    <div className="draw-detail-summary">
                      <span>{warmupEntries.length} {uiText(locale, "inscriptions", "entries")}</span>
                      <span>{uiText(locale, "Durée", "Duration")} {warmup.duration_minutes_per_rider} min</span>
                      <span>{uiText(locale, "Drag", "Drag")} {warmup.drag_interval || "-"} / {warmup.drag_duration_minutes} min</span>
                      <span>{sourceClass ? sourceClass.name : uiText(locale, "Source manuelle", "Manual source")}</span>
                    </div>
                    <div className="draw-list">
                      <div className="draw-list-row draw-list-head">
                        <span>{uiText(locale, "Ordre", "Order")}</span>
                        <span>ID</span>
                        <span>{uiText(locale, "Inscription", "Entry")}</span>
                        <span>{uiText(locale, "Statut", "Status")}</span>
                        <span />
                        <span />
                        <span />
                      </div>
                      {warmupEntries.map((entry) => (
                        <div className="draw-list-row" key={entry.id}>
                          <strong>#{entry.order}</strong>
                          <span>{entry.id.slice(0, 8)}</span>
                          <span>{entry.rider || "-"}</span>
                          <span className={`badge ${entry.status === "pending" ? "draft" : entry.status === "done" ? "completed" : "warning"}`}>{paidWarmupEntryStatusLabel(entry.status, locale)}</span>
                          <span />
                          <span />
                          <span />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!sortedVisiblePaidWarmups.length ? <EmptyState label={uiText(locale, "Aucun paid warmup préparé pour ce concours.", "No paid warmups prepared for this show.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function normalizeShowScoreRuns(runs: Array<Record<string, unknown>>): ShowScoreRun[] {
  return runs
    .map((run, index) => {
      const entryId = stringFromRecord(run, "entryId") || stringFromRecord(run, "entry_id") || stringFromRecord(run, "id");
      const draw = numberFromRecord(run, "draw") ?? numberFromRecord(run, "order") ?? index + 1;

      if (!entryId) {
        return null;
      }

      const drawGroup = stringFromRecord(run, "drawGroup") === "late" || booleanFromRecord(run, "isLate") ? "late" : "regular";
      const divisionNames = stringArrayFromRecord(run, "divisionNames");

      return {
        id: stringFromRecord(run, "id") || entryId,
        runId: stringFromRecord(run, "runId") || stringFromRecord(run, "run_id") || stringFromRecord(run, "id") || entryId,
        blockRunId:
          stringFromRecord(run, "blockRunId") ||
          stringFromRecord(run, "block_run_id") ||
          stringFromRecord(run, "id") ||
          entryId,
        entryId,
        entryIds: stringArrayFromRecord(run, "entryIds").length
          ? stringArrayFromRecord(run, "entryIds")
          : stringArrayFromRecord(run, "entry_ids").length
            ? stringArrayFromRecord(run, "entry_ids")
            : [entryId],
        classId: stringFromRecord(run, "classId") || stringFromRecord(run, "class_id"),
        divisionId: stringFromRecord(run, "divisionId") || stringFromRecord(run, "division_id"),
        divisionIds: stringArrayFromRecord(run, "divisionIds").length
          ? stringArrayFromRecord(run, "divisionIds")
          : stringArrayFromRecord(run, "division_ids").length
            ? stringArrayFromRecord(run, "division_ids")
            : [stringFromRecord(run, "divisionId") || stringFromRecord(run, "division_id")].filter(Boolean),
        horseId: stringFromRecord(run, "horseId") || stringFromRecord(run, "horse_id"),
        riderContactId: stringFromRecord(run, "riderContactId") || stringFromRecord(run, "rider_contact_id") || null,
        ownerContactId: stringFromRecord(run, "ownerContactId") || stringFromRecord(run, "owner_contact_id"),
        payerContactId: stringFromRecord(run, "payerContactId") || stringFromRecord(run, "payer_contact_id"),
        order: numberFromRecord(run, "order") ?? draw,
        draw,
        backNumber: stringFromRecord(run, "backNumber") || stringFromRecord(run, "back_number"),
        rider: stringFromRecord(run, "rider"),
        horse: stringFromRecord(run, "horse"),
        owner: stringFromRecord(run, "owner"),
        divisionNames: divisionNames.length ? divisionNames : stringArrayFromRecord(run, "division_names"),
        isLate: drawGroup === "late",
        drawGroup,
      };
    })
    .filter((run): run is ShowScoreRun => Boolean(run))
    .sort((first, second) => first.draw - second.draw);
}

function stringFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function stringArrayFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function numberFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function booleanFromRecord(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "boolean" ? value : false;
}

function formatDrawNumber(draw: number) {
  return draw < 0 ? String(draw) : `#${draw}`;
}

function formatBackNumber(backNumber: string) {
  return backNumber.trim() || "A assigner";
}

function formatRunDivisionNames(run: ShowScoreRun, divisions: Division[], classes: ClassRecord[]) {
  if (run.divisionNames.length) {
    return run.divisionNames.join(", ");
  }

  const division = findById(divisions, run.divisionId);
  return division ? divisionLabel(division, classes) : run.divisionId || "-";
}

function compareShowScorePaidWarmups(first: ShowScorePaidWarmup, second: ShowScorePaidWarmup) {
  return (
    first.show_day_id.localeCompare(second.show_day_id) ||
    first.sort_order - second.sort_order ||
    first.name.localeCompare(second.name)
  );
}

function sourceClassIdFromWarmup(warmup: ShowScorePaidWarmup) {
  const payload = warmup.legacy_payload;

  if (!payload || typeof payload !== "object") {
    return "";
  }

  const sourceClassId = payload.source_class_id ?? payload.sourceClassId;
  return typeof sourceClassId === "string" ? sourceClassId : "";
}

function normalizePaidWarmupEntries(entries: ShowScorePaidWarmup["entries"]) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry.id && entry.order > 0)
    .sort((first, second) => first.order - second.order);
}

function formatPaidWarmupSchedule(warmup: ShowScorePaidWarmup, locale: Locale) {
  if (warmup.schedule_start_mode === "after_previous") {
    return uiText(locale, "Après le bloc", "After block");
  }

  if (warmup.schedule_start_time) {
    return warmup.schedule_start_time;
  }

  return uiText(locale, "Départ non fixé", "Start not set");
}

function formatPaidWarmupPacing(warmup: ShowScorePaidWarmup, locale: Locale) {
  const dragInterval = warmup.drag_interval ? uiText(locale, `drag aux ${warmup.drag_interval}`, `drag every ${warmup.drag_interval}`) : uiText(locale, "drag manuel", "manual drag");
  return `${warmup.duration_minutes_per_rider} min / ${dragInterval}`;
}

function paidWarmupEntryStatusLabel(status: ShowScorePaidWarmup["entries"][number]["status"], locale: Locale) {
  switch (status) {
    case "done":
      return uiText(locale, "Fait", "Done");
    case "no_show":
      return uiText(locale, "Absent", "No show");
    case "scratch":
      return uiText(locale, "Scratch", "Scratch");
    default:
      return uiText(locale, "En attente", "Pending");
  }
}

export { ScoringView };
