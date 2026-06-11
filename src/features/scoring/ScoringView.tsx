import { useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import { EmptyState, Metric, SearchSelect, ViewIntro } from "../../components/ui";
import { contactLabel, divisionLabel, findById, formatDate, horseLabel, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { buildShowScoreRunsForClass, type ShowScoreRun } from "../../services/showScoreAdapters";
import type { ClassRecord, Contact, Division, Entry, Horse, Organization, Show, ShowDay, ShowScoreClassSetup } from "../../types/domain";
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
  shows,
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
  shows: Show[];
  onPrepareShowScoreClass: (classRecord: ClassRecord) => Promise<void>;
}) {
  const [showId, setShowId] = useState("");
  const [busyClassId, setBusyClassId] = useState("");
  const [expandedDrawClassIds, setExpandedDrawClassIds] = useState<string[]>([]);
  const selectedShowId = showId || shows[0]?.id || "";
  const visibleClasses = selectedShowId ? classes.filter((classRecord) => classRecord.show_id === selectedShowId) : classes;
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

  function toggleDraw(classId: string) {
    setExpandedDrawClassIds((current) => (current.includes(classId) ? current.filter((candidate) => candidate !== classId) : [...current, classId]));
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
        ]}
      />

      <section className="metric-grid span-2">
        <Metric label={uiText(locale, "Blocs de pointage", "Scoring blocks")} value={String(visibleClasses.length)} />
        <Metric label={uiText(locale, "Runs depuis les inscriptions", "Runs from entries")} value={String(totalRuns)} />
        <Metric label={uiText(locale, "Préparations prêtes", "Prepared setups")} value={String(visibleClasses.filter((classRecord) => preparedClassIds.has(classRecord.id)).length)} />
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
        entryId,
        classId: stringFromRecord(run, "classId") || stringFromRecord(run, "class_id"),
        divisionId: stringFromRecord(run, "divisionId") || stringFromRecord(run, "division_id"),
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


export { ScoringView };
