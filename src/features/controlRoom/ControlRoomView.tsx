import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CalendarDays, ChevronDown, ChevronRight, Clock3, FileDown, FileText, ListOrdered, Plus, Radio, Send, Trophy, UserRoundPlus } from "lucide-react";
import { EmptyState, ModalDialog, ViewIntro } from "../../components/ui";
import { formatDate } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type {
  Block,
  BlockDrawPublication,
  BlockJudgeAssignment,
  ClassRecord,
  Contact,
  ContactExternalIdentifier,
  ContactRole,
  Entry,
  EntryResult,
  ExternalCredentialIssuer,
  Horse,
  HorseExternalIdentifier,
  HorseHealthDocument,
  NrhaRiderRanking,
  Organization,
  OrganizationExternalCredentialRequirement,
  PayoutCalculation,
  Show,
  ShowDay,
  ShowScoreBlockSetup,
  ShowScorePaidWarmup,
} from "../../types/domain";
import type { ViewKey } from "../../types/ui";
import { createContact, createEntry, createHorse, createUploadedHorseHealthDocument, loadCurrentBlockDrawPublication, updatePayoutCalculationStatus, verifyGvlCogginsDocument, verifyNrhaEligibility, verifyNrhaHorse } from "../../services/supabaseServices";
import { classScheduleStartLabel, compareScheduleClasses, showDayLabel } from "../classes/classUtils";
import { uiText } from "../dashboard/shared";
import { EntryForm } from "../entries/EntryForm";

type ControlRoomViewProps = {
  locale: Locale;
  blocks: Block[];
  blockJudgeAssignments: BlockJudgeAssignment[];
  classes: ClassRecord[];
  contacts: Contact[];
  contactExternalIdentifiers: ContactExternalIdentifier[];
  contactRoles: ContactRole[];
  entries: Entry[];
  entryResults: EntryResult[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  horseExternalIdentifiers: HorseExternalIdentifier[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalCredentialRequirement[];
  nrhaRiderRankings: NrhaRiderRanking[];
  organization: Organization | null;
  payoutCalculations: PayoutCalculation[];
  profileId: string;
  show: Show | null;
  showDays: ShowDay[];
  showScoreClassSetups: ShowScoreBlockSetup[];
  showScorePaidWarmups: ShowScorePaidWarmup[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onPrepareShowScoreClass: (block: Block) => Promise<void>;
  onPublishBlockDraw: (block: Block) => Promise<void>;
  onUpdatePayoutCalculationStatus: (id: string, status: Parameters<typeof updatePayoutCalculationStatus>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaEligibility: (input: Parameters<typeof verifyNrhaEligibility>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaEligibility>>>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
  onViewChange: (view: ViewKey) => void;
};

export function ControlRoomView(props: ControlRoomViewProps) {
  const {
    locale, blocks, blockJudgeAssignments, classes, contacts, entries, entryResults, organization,
    payoutCalculations, show, showDays, showScoreClassSetups, showScorePaidWarmups,
    onPrepareShowScoreClass, onPublishBlockDraw, onUpdatePayoutCalculationStatus, onViewChange,
  } = props;
  const orderedDays = useMemo(() => [...showDays].sort((a, b) => a.sort_order - b.sort_order || a.day_date.localeCompare(b.day_date)), [showDays]);
  const [selectedDayId, setSelectedDayId] = useState(orderedDays[0]?.id ?? "unscheduled");
  const [expandedBlockId, setExpandedBlockId] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [actionError, setActionError] = useState("");
  const [choosingLateEntryBlock, setChoosingLateEntryBlock] = useState(false);
  const [lateEntryBlock, setLateEntryBlock] = useState<Block | null>(null);
  const [latePlacement, setLatePlacement] = useState<"negative" | "end">("negative");
  const [chargeLateFee, setChargeLateFee] = useState(true);
  const [printDraw, setPrintDraw] = useState<{ block: Block; publication: BlockDrawPublication } | null>(null);
  const effectiveDayId = orderedDays.some((day) => day.id === selectedDayId) ? selectedDayId : orderedDays[0]?.id ?? "unscheduled";
  const selectedDay = orderedDays.find((day) => day.id === effectiveDayId);
  const visibleBlocks = useMemo(
    () => blocks.filter((block) => (effectiveDayId === "unscheduled" ? !block.show_day_id : block.show_day_id === effectiveDayId)).sort(compareScheduleClasses),
    [blocks, effectiveDayId],
  );
  const standaloneWarmups = useMemo(
    () => showScorePaidWarmups.filter((warmup) => (effectiveDayId === "unscheduled" ? !warmup.show_day_id : warmup.show_day_id === effectiveDayId) && !blocks.some((block) => block.id === warmup.block_id)),
    [blocks, effectiveDayId, showScorePaidWarmups],
  );
  const activeBlocks = blocks.filter((block) => block.schedule_status === "running").length;
  const actionRequired = blocks.filter((block) => block.block_type === "competition" && block.draw_prepared_at && (block.draw_version ?? 1) !== (block.draw_published_version ?? 0)).length;
  const reviewedResults = payoutCalculations.filter((calculation) => calculation.status === "reviewed").length;
  const publishedResults = payoutCalculations.filter((calculation) => calculation.status === "published").length;

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setActionError("");
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : uiText(locale, "L'action a échoué.", "The action failed."));
    } finally {
      setBusyKey("");
    }
  }

  async function publishCompletedResults(block: Block) {
    const blockClassIds = new Set(classes.filter((classRecord) => classRecord.block_id === block.id).map((classRecord) => classRecord.id));
    const calculations = payoutCalculations.filter((calculation) => blockClassIds.has(calculation.class_id) && calculation.status === "reviewed");
    for (const calculation of calculations) {
      await onUpdatePayoutCalculationStatus(calculation.id, "published");
    }
  }

  function openLateEntry(block: Block) {
    setChoosingLateEntryBlock(false);
    setLateEntryBlock(block);
  }

  function printOfficialDraw() {
    const cleanup = () => {
      document.body.classList.remove("control-draw-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    document.body.classList.add("control-draw-printing");
    window.addEventListener("afterprint", cleanup);
    window.print();
    window.setTimeout(cleanup, 1_000);
  }

  async function openOfficialDraw(block: Block) {
    await runAction(`pdf:${block.id}`, async () => {
      const publication = await loadCurrentBlockDrawPublication(block.id);
      setPrintDraw({ block, publication });
    });
  }

  return (
    <div className="control-room stack">
      <ViewIntro
        eyebrow={uiText(locale, "Concours en cours", "Active show")}
        title={uiText(locale, "Poste de contrôle", "Show control")}
        description={uiText(locale, "L'horaire compact devient le fil conducteur des inscriptions, draws, opérations ShowScore et résultats.", "The compact schedule drives entries, draws, ShowScore operations, and results.")}
        stats={[
          { label: uiText(locale, "à traiter", "need action"), value: String(actionRequired + reviewedResults) },
          { label: uiText(locale, "blocs en cours", "live blocks"), value: String(activeBlocks) },
          { label: uiText(locale, "résultats publiés", "published results"), value: `${publishedResults}/${payoutCalculations.length}` },
        ]}
      />

      <section className="panel control-room-toolbar">
        <div className="control-day-tabs" role="tablist" aria-label={uiText(locale, "Journées", "Show days")}>
          {orderedDays.map((day) => (
            <button aria-selected={effectiveDayId === day.id} className={effectiveDayId === day.id ? "active" : ""} key={day.id} role="tab" type="button" onClick={() => setSelectedDayId(day.id)}>
              <CalendarDays size={15} />
              {showDayLabel(day)}
            </button>
          ))}
          {!orderedDays.length ? <button className="active" type="button">{uiText(locale, "Sans journée", "Unscheduled")}</button> : null}
        </div>
        <button className="primary-button" disabled={!visibleBlocks.some((block) => block.block_type === "competition")} type="button" onClick={() => setChoosingLateEntryBlock(true)}>
          <UserRoundPlus size={16} />
          {uiText(locale, "Inscription tardive", "Late entry")}
        </button>
      </section>

      {choosingLateEntryBlock ? (
        <ModalDialog
          eyebrow={uiText(locale, "Poste de contrôle", "Show control")}
          title={uiText(locale, "Choisir le bloc", "Choose a block")}
          description={uiText(locale, "Sélectionne la classe ou le bloc où ajouter l'inscription tardive.", "Select the class or block where the late entry belongs.")}
          onClose={() => setChoosingLateEntryBlock(false)}
        >
          <div className="control-late-block-list">
            {visibleBlocks.filter((block) => block.block_type === "competition").map((block) => (
              <button className="ghost-button" key={block.id} type="button" onClick={() => openLateEntry(block)}>
                <span><strong>{block.scheduled_time || "—"}</strong><small>{block.display_label || uiText(locale, "Bloc", "Block")}</small></span>
                <span>{block.name}</span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </ModalDialog>
      ) : null}

      {actionError ? <div className="inline-alert" role="alert"><AlertCircle size={17} />{actionError}</div> : null}

      <section className="control-schedule" aria-label={uiText(locale, "Horaire opérationnel", "Operational schedule")}>
        <div className="control-schedule-heading">
          <div><p className="eyebrow">{uiText(locale, "Horaire opérationnel", "Operational schedule")}</p><h2>{selectedDay ? showDayLabel(selectedDay) : show?.name}</h2></div>
          <span>{visibleBlocks.length + standaloneWarmups.length} {uiText(locale, "éléments planifiés", "scheduled items")}</span>
        </div>

        {visibleBlocks.map((block) => block.block_type === "competition"
          ? renderCompetitionBlock(block)
          : <ScheduleEvent key={block.id} block={block} blocks={blocks} locale={locale} />)}
        {standaloneWarmups.map((warmup) => <WarmupEvent key={warmup.id} locale={locale} warmup={warmup} />)}
        {!visibleBlocks.length && !standaloneWarmups.length ? <EmptyState label={uiText(locale, "Aucun élément dans l'horaire de cette journée.", "Nothing is scheduled for this day.")} /> : null}
      </section>

      {lateEntryBlock ? (
        <ModalDialog
          className="control-late-entry-modal"
          eyebrow={uiText(locale, "Poste de contrôle", "Show control")}
          title={uiText(locale, `Inscription tardive · ${lateEntryBlock.name}`, `Late entry · ${lateEntryBlock.name}`)}
          description={uiText(locale, "L'inscription sera confirmée immédiatement; le paiement demeure à régulariser au compte du payeur.", "The entry will be confirmed immediately; payment remains due on the payer account.")}
          onClose={() => setLateEntryBlock(null)}
        >
          <div className="control-late-options">
            <label>{uiText(locale, "Position dans le draw", "Draw position")}<select value={latePlacement} onChange={(event) => setLatePlacement(event.target.value as "negative" | "end")}><option value="negative">{uiText(locale, "Draw négatif", "Negative draw")}</option><option value="end">{uiText(locale, "Fin de la classe", "End of class")}</option></select></label>
            <label className="checkbox-line"><input checked={chargeLateFee} type="checkbox" onChange={(event) => setChargeLateFee(event.target.checked)} />{uiText(locale, `Ajouter les frais de retard (${show?.late_entry_fee_percent ?? 0} %)`, `Add late fee (${show?.late_entry_fee_percent ?? 0}%)`)}</label>
          </div>
          <EntryForm
            locale={locale}
            blocks={[lateEntryBlock]}
            contacts={props.contacts}
            contactExternalIdentifiers={props.contactExternalIdentifiers}
            contactRoles={props.contactRoles}
            classes={classes.filter((classRecord) => classRecord.block_id === lateEntryBlock.id)}
            entries={entries}
            externalCredentialIssuers={props.externalCredentialIssuers}
            horseExternalIdentifiers={props.horseExternalIdentifiers}
            horseHealthDocuments={props.horseHealthDocuments}
            horses={props.horses}
            membershipRequirements={props.membershipRequirements}
            nrhaRiderRankings={props.nrhaRiderRankings}
            organization={organization}
            profileId={props.profileId}
            showDays={showDays.filter((day) => day.id === lateEntryBlock.show_day_id)}
            shows={show ? [show] : []}
            staffLateEntry={{ chargeLateFee, lateFeePercent: show?.late_entry_fee_percent ?? 0, placement: latePlacement }}
            onCreateContact={props.onCreateContact}
            onCreateEntry={props.onCreateEntry}
            onCreateHorse={props.onCreateHorse}
            onCreateHorseHealthDocument={props.onCreateHorseHealthDocument}
            onVerifyGvlCogginsDocument={props.onVerifyGvlCogginsDocument}
            onVerifyNrhaEligibility={props.onVerifyNrhaEligibility}
            onVerifyNrhaHorse={props.onVerifyNrhaHorse}
            onCreated={() => setLateEntryBlock(null)}
          />
        </ModalDialog>
      ) : null}

      {printDraw ? (
        <ModalDialog className="control-draw-modal" eyebrow="PDF" title={uiText(locale, "Draw officiel", "Official draw")} description={`${printDraw.block.name} · v${printDraw.publication.version}`} onClose={() => setPrintDraw(null)}>
          <DrawSheet block={printDraw.block} classes={classes} locale={locale} publication={printDraw.publication} show={show} />
          <div className="form-actions"><button className="primary-button" type="button" onClick={printOfficialDraw}><FileDown size={16} />{uiText(locale, "Imprimer ou enregistrer en PDF", "Print or save as PDF")}</button></div>
        </ModalDialog>
      ) : null}
    </div>
  );

  function renderCompetitionBlock(block: Block) {
    const blockClasses = classes.filter((classRecord) => classRecord.block_id === block.id).sort((a, b) => a.sort_order - b.sort_order);
    const classIds = new Set(blockClasses.map((classRecord) => classRecord.id));
    const blockEntries = entries.filter((entry) => classIds.has(entry.class_id));
    const activeEntries = blockEntries.filter((entry) => !["cancelled", "scratched", "scratched_pending_refund"].includes(entry.status));
    const scratches = blockEntries.filter((entry) => ["scratched", "scratched_pending_refund"].includes(entry.status)).length;
    const unpaid = blockEntries.filter((entry) => entry.status === "pending_checkout").length;
    const setup = showScoreClassSetups.find((candidate) => candidate.block_id === block.id);
    const runs = normalizeRuns(setup?.runs ?? []);
    const resultRuns = new Set(entryResults.filter((result) => result.block_id === block.id).map((result) => result.block_run_id)).size;
    const judges = blockJudgeAssignments.filter((assignment) => assignment.block_id === block.id).sort((a, b) => a.sort_order - b.sort_order);
    const expanded = expandedBlockId === block.id;
    const version = block.draw_version ?? (block.draw_prepared_at ? 1 : 0);
    const publishedVersion = block.draw_published_version ?? 0;
    const hasUnpublishedDraw = version > publishedVersion;
    const isPublished = version > 0 && version === publishedVersion;
    const calculations = blockClasses.map((classRecord) => payoutCalculations.filter((item) => item.class_id === classRecord.id).sort((a, b) => b.calculated_at.localeCompare(a.calculated_at))[0]).filter((item): item is PayoutCalculation => Boolean(item));
    const publishableResults = calculations.filter((calculation) => calculation.status === "reviewed");
    const publishedClassResults = calculations.filter((calculation) => calculation.status === "published").length;

    return (
      <article className={`control-block${block.schedule_status === "running" ? " running" : ""}${hasUnpublishedDraw ? " attention" : ""}`} key={block.id}>
        <div className="control-block-main">
          <div className="control-time"><strong>{block.scheduled_time || "—"}</strong><span>{scheduleStatusLabel(block, locale)}</span></div>
          <button aria-expanded={expanded} className="control-block-toggle" type="button" onClick={() => setExpandedBlockId(expanded ? "" : block.id)}>{expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}<span><small>{block.display_label || uiText(locale, "Bloc", "Block")}</small><strong>{block.name}</strong><em>{blockClasses.map((item) => item.name).join(" · ") || uiText(locale, "Aucune classe", "No classes")}</em></span></button>
          <div className="control-block-next">
            {!version ? <button className="primary-button" disabled={!activeEntries.length || busyKey === `draw:${block.id}`} type="button" onClick={() => runAction(`draw:${block.id}`, () => onPrepareShowScoreClass(block))}><ListOrdered size={15} />{uiText(locale, "Générer le draw", "Create draw")}</button> : null}
            {hasUnpublishedDraw ? <button className="primary-button" disabled={busyKey === `publish:${block.id}`} type="button" onClick={() => runAction(`publish:${block.id}`, () => onPublishBlockDraw(block))}><Send size={15} />{uiText(locale, publishedVersion ? "Republier le draw" : "Publier le draw", publishedVersion ? "Republish draw" : "Publish draw")}</button> : null}
            {isPublished && block.schedule_status === "running" ? <button className="primary-button" type="button" onClick={() => onViewChange("scoring")}><Radio size={15} />ShowScore</button> : null}
            {!version && !activeEntries.length ? <span>{uiText(locale, "En attente d'inscriptions", "Waiting for entries")}</span> : null}
          </div>
        </div>
        <div className="control-block-status">
          <StatusCell icon={<UserRoundPlus size={15} />} label={uiText(locale, "Inscriptions", "Entries")} value={`${activeEntries.length}${scratches ? ` · ${scratches} scratch` : ""}${unpaid ? ` · ${unpaid} ${uiText(locale, "à payer", "unpaid")}` : ""}`} tone={unpaid ? "warning" : "ok"} />
          <StatusCell icon={<ListOrdered size={15} />} label="Draw" value={!version ? uiText(locale, "Non généré", "Not created") : hasUnpublishedDraw ? `v${version} · ${uiText(locale, "à publier", "unpublished")}` : `v${publishedVersion} · ${uiText(locale, "officiel", "official")}`} tone={hasUnpublishedDraw ? "warning" : isPublished ? "ok" : "neutral"} />
          <StatusCell icon={<Radio size={15} />} label="ShowScore" value={!setup ? uiText(locale, "Non préparé", "Not ready") : setup.finalized ? uiText(locale, "Finalisé", "Finalized") : setup.started_at || block.schedule_status === "running" ? `${resultRuns}/${runs.length} ${uiText(locale, "pointés", "scored")}` : uiText(locale, "Prêt", "Ready")} tone={setup?.started_at || block.schedule_status === "running" ? "live" : setup ? "ok" : "neutral"} />
          <StatusCell icon={<Trophy size={15} />} label={uiText(locale, "Résultats", "Results")} value={`${publishedClassResults}/${blockClasses.length} ${uiText(locale, "classes publiées", "classes published")}`} tone={publishableResults.length ? "warning" : publishedClassResults === blockClasses.length && blockClasses.length ? "ok" : "neutral"} />
        </div>
        <div className="control-block-meta"><span><Clock3 size={14} />{classScheduleStartLabel(block, locale, blocks)}</span><span>{judges.length ? `${uiText(locale, judges.length > 1 ? "Juges" : "Juge", judges.length > 1 ? "Judges" : "Judge")}: ${judges.map((judge) => judge.display_name).join(", ")}` : block.judge_display_name ? `${uiText(locale, "Juges", "Judges")}: ${block.judge_display_name}` : uiText(locale, "Juges à préciser", "Judges not set")}</span></div>
        {expanded ? (
          <div className="control-block-detail">
            <div className="control-draw-preview">
              <div className="control-section-head"><div><h3>{uiText(locale, "Ordre de passage", "Order of go")}</h3><p>{runs.length} {uiText(locale, "passages", "runs")}</p></div><div className="row-actions"><button className="ghost-button" type="button" onClick={() => setLateEntryBlock(block)}><Plus size={15} />{uiText(locale, "Inscription tardive", "Late entry")}</button>{publishedVersion > 0 ? <button className="ghost-button" disabled={busyKey === `pdf:${block.id}`} type="button" onClick={() => openOfficialDraw(block)}><FileText size={15} />PDF v{publishedVersion}</button> : null}</div></div>
              <div className="control-run-list">{runs.slice(0, 8).map((run) => <div className={run.scratch ? "scratch" : ""} key={run.id}><strong>{formatDraw(run.draw)}</strong><span>{run.horse || "—"}<small>{run.rider || "—"}{run.backNumber ? ` · #${run.backNumber}` : ""}</small></span><em>{run.scratch ? "SCRATCH" : run.draw < 0 ? uiText(locale, "Tardif", "Late") : ""}</em></div>)}{!runs.length ? <p className="muted-line">{uiText(locale, "Le draw n'est pas encore généré.", "The draw has not been created yet.")}</p> : null}</div>
            </div>
            <div className="control-results-preview">
              <div className="control-section-head"><div><h3>{uiText(locale, "Résultats par classe", "Results by class")}</h3><p>{resultRuns}/{runs.length || activeEntries.length} {uiText(locale, "passages reçus", "runs received")}</p></div>{publishableResults.length ? <button className="primary-button" disabled={busyKey === `results:${block.id}`} type="button" onClick={() => runAction(`results:${block.id}`, () => publishCompletedResults(block))}><Send size={15} />{uiText(locale, "Publier les classes terminées", "Publish completed classes")}</button> : null}</div>
              <div className="control-class-results">{blockClasses.map((classRecord) => { const calculation = calculations.find((item) => item.class_id === classRecord.id); return <div key={classRecord.id}><span><strong>{classRecord.name}</strong><small>{resultCountForClass(classRecord.id, entryResults)} {uiText(locale, "résultats synchronisés", "synced results")}</small></span><em className={`status-chip ${calculation?.status === "published" ? "success" : calculation?.status === "reviewed" ? "warning" : "neutral"}`}>{calculation ? resultStatusLabel(calculation, locale) : uiText(locale, "À préparer", "Not ready")}</em>{calculation?.status === "reviewed" ? <button className="text-button" disabled={busyKey === `class-result:${classRecord.id}`} type="button" onClick={() => runAction(`class-result:${classRecord.id}`, () => onUpdatePayoutCalculationStatus(calculation.id, "published"))}>{uiText(locale, "Publier", "Publish")}</button> : null}</div>; })}</div>
              <button className="text-button control-results-link" type="button" onClick={() => onViewChange("results")}>{uiText(locale, "Réviser les calculs et les bourses", "Review calculations and payouts")}</button>
            </div>
          </div>
        ) : null}
      </article>
    );
  }
}

function StatusCell({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "ok" | "warning" | "live" | "neutral" }) {
  return <div className={`control-status-cell ${tone}`}>{icon}<span><small>{label}</small><strong>{value}</strong></span></div>;
}

function ScheduleEvent({ block, blocks, locale }: { block: Block; blocks: Block[]; locale: Locale }) {
  return <article className="control-schedule-event"><div className="control-time"><strong>{block.scheduled_time || "—"}</strong><span>{eventTypeLabel(block, locale)}</span></div><Clock3 size={17} /><span><strong>{block.name}</strong><small>{classScheduleStartLabel(block, locale, blocks)}{block.estimated_duration ? ` · ${block.estimated_duration}` : ""}</small></span></article>;
}

function WarmupEvent({ locale, warmup }: { locale: Locale; warmup: ShowScorePaidWarmup }) {
  return <article className="control-schedule-event"><div className="control-time"><strong>{warmup.schedule_start_time || "—"}</strong><span>PAID WARMUP</span></div><Clock3 size={17} /><span><strong>{warmup.name}</strong><small>{warmup.entries.length} {uiText(locale, "inscriptions", "entries")} · {warmup.is_public_live ? uiText(locale, "public", "public") : uiText(locale, "privé", "private")}</small></span></article>;
}

type NormalizedRun = { id: string; draw: number; backNumber: string; rider: string; horse: string; scratch: boolean };
function normalizeRuns(runs: Array<Record<string, unknown>>): NormalizedRun[] {
  return runs.map((run, index) => ({
    id: String(run.blockRunId ?? run.runId ?? run.id ?? index),
    draw: Number(run.draw ?? run.order ?? index + 1),
    backNumber: String(run.backNumber ?? run.back_number ?? ""),
    rider: String(run.rider ?? run.riderName ?? ""),
    horse: String(run.horse ?? run.horseName ?? ""),
    scratch: String(run.status ?? "").toLowerCase() === "scratch",
  }));
}

function DrawSheet({ block, classes, locale, publication, show }: { block: Block; classes: ClassRecord[]; locale: Locale; publication: BlockDrawPublication; show: Show | null }) {
  const runs = normalizeRuns(publication.runs);
  const judgeNames = publication.judges.map((judge) => String(judge.name ?? judge.display_name ?? "")).filter(Boolean);
  return <section className="control-draw-sheet"><header><div className="control-pdf-brand"><img alt="Horse Show Platform" src="/branding/hsp-logo-aubergine.svg" /></div><div><p>{show?.name}</p><h2>{block.name}</h2><span>{classes.filter((item) => item.block_id === block.id).map((item) => item.name).join(" · ")}</span></div><div><strong>DRAW</strong><span>v{publication.version}</span></div></header><div className="control-pdf-meta"><span>{uiText(locale, "Juges", "Judges")}: {judgeNames.join(", ") || "—"}</span><span>{block.scheduled_time || "—"}</span><span>{formatDate(publication.published_at)}</span></div><table><thead><tr><th>Draw</th><th>{uiText(locale, "Dossard", "Back no.")}</th><th>{uiText(locale, "Cheval", "Horse")}</th><th>{uiText(locale, "Cavalier", "Rider")}</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td>{formatDraw(run.draw)}</td><td>{run.backNumber || "—"}</td><td>{run.horse || "—"}</td><td>{run.rider || "—"}</td></tr>)}</tbody></table><footer>{uiText(locale, "Généré par Horse Show Platform", "Generated by Horse Show Platform")} · {new Date().toLocaleString(locale === "fr" ? "fr-CA" : "en-CA")}</footer></section>;
}

function formatDraw(draw: number) { return draw > 0 ? String(draw).padStart(2, "0") : String(draw); }
function resultCountForClass(classId: string, results: EntryResult[]) { return results.filter((result) => result.class_id === classId).length; }
function resultStatusLabel(calculation: PayoutCalculation, locale: Locale) { return calculation.status === "published" ? uiText(locale, "Publié", "Published") : calculation.status === "reviewed" ? uiText(locale, "Révisé", "Reviewed") : uiText(locale, "Brouillon", "Draft"); }
function scheduleStatusLabel(block: Block, locale: Locale) { return block.schedule_status === "running" ? uiText(locale, "En cours", "Live") : block.schedule_status === "finished" ? uiText(locale, "Terminé", "Finished") : block.schedule_status === "closed" ? uiText(locale, "Fermé", "Closed") : uiText(locale, "À venir", "Upcoming"); }
function eventTypeLabel(block: Block, locale: Locale) { if (block.block_type === "break") return uiText(locale, "Pause", "Break"); if (block.block_type === "ceremony") return uiText(locale, "Cérémonie", "Ceremony"); if (block.block_type === "paid_warmup") return "Paid warmup"; return uiText(locale, "Événement", "Event"); }
