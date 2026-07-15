import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../../components/ui";
import type { Locale } from "../../lib/i18n";
import { updateBlock } from "../../services/supabaseServices";
import type { Block, BlockConcurrencyGroupMember, ScheduleStartMode, ShowDay, Slate } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { scheduleStartModeForClass, scheduleStartModeLabel, showDayLabel, datetimeLocalToIso, datetimeLocalInputValue, timeInputValue } from "./classUtils";
import { ShowScorePatternSelect } from "./ShowScorePatternSelect";

function BlockEditForm({
  locale = "fr",
  block,
  blocks,
  blockConcurrencyGroupMembers,
  showDays,
  slates,
  onCancel,
  onUpdateBlock,
}: {
  locale?: Locale;
  block: Block;
  blocks: Block[];
  blockConcurrencyGroupMembers: BlockConcurrencyGroupMember[];
  showDays: ShowDay[];
  slates: Slate[];
  onCancel: () => void;
  onUpdateBlock: (id: string, input: Parameters<typeof updateBlock>[1]) => Promise<void>;
}) {
  const currentConcurrencyMembership = blockConcurrencyGroupMembers.find((member) => member.block_id === block.id);
  const currentConcurrentBlockId = currentConcurrencyMembership
    ? blockConcurrencyGroupMembers.find((member) => member.group_id === currentConcurrencyMembership.group_id && member.block_id !== block.id)?.block_id ?? ""
    : "";
  const [name, setName] = useState(block.name);
  const [showDayId, setShowDayId] = useState(block.show_day_id ?? "");
  const [slateId, setSlateId] = useState(block.slate_id ?? "");
  const [concurrentBlockId, setConcurrentBlockId] = useState(currentConcurrentBlockId);
  const [blockLabel, setBlockLabel] = useState(block.display_label ?? "");
  const [arena, setArena] = useState(block.arena ?? "");
  const [judgeDisplayName, setJudgeDisplayName] = useState(block.judge_display_name ?? "");
  const [pattern, setPattern] = useState(block.pattern ?? "");
  const [entriesCloseAt, setEntriesCloseAt] = useState(datetimeLocalInputValue(block.entries_close_at));
  const [scheduleStartMode, setScheduleStartMode] = useState<ScheduleStartMode>(scheduleStartModeForClass(block));
  const [scheduledTime, setScheduledTime] = useState(timeInputValue(block.scheduled_time));
  const [status, setStatus] = useState<Block["schedule_status"]>(block.schedule_status);
  const [busy, setBusy] = useState(false);
  const selectedShowDays = showDays.filter((day) => day.show_id === block.show_id);
  const selectedShowSlates = slates.filter((slate) => slate.show_id === block.show_id);
  const concurrentBlockChoices = blocks.filter(
    (candidate) =>
      candidate.id !== block.id &&
      candidate.block_type === "competition" &&
      candidate.show_id === block.show_id &&
      candidate.show_day_id === (showDayId || null) &&
      (candidate.arena ?? "") === arena.trim() &&
      (candidate.pattern ?? "") === pattern,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateBlock(block.id, {
        name,
        show_day_id: showDayId || null,
        slate_id: slateId || null,
        concurrent_block_id: concurrentBlockId || null,
        display_label: blockLabel || null,
        arena: arena.trim() || null,
        judge_display_name: judgeDisplayName.trim() || null,
        pattern: pattern || null,
        entries_close_at: datetimeLocalToIso(entriesCloseAt),
        schedule_start_mode: scheduleStartMode,
        scheduled_time: scheduleStartMode === "fixed" ? scheduledTime || null : null,
        schedule_status: status,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier le bloc", "Edit block")}</h2>
          <p>{block.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom du bloc", "Block name")}
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Journée", "Day")}
            <select value={showDayId} onChange={(event) => { setShowDayId(event.target.value); setConcurrentBlockId(""); }}>
              <option value="">{uiText(locale, "Aucune journée", "No day")}</option>
              {selectedShowDays.map((day) => (
                <option key={day.id} value={day.id}>
                  {showDayLabel(day)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Slate
            <select value={slateId} onChange={(event) => setSlateId(event.target.value)}>
              <option value="">{uiText(locale, "Aucune slate", "No slate")}</option>
              {selectedShowSlates.map((slate) => (
                <option key={slate.id} value={slate.id}>
                  {slate.name}{slate.technical_number ? ` — ${slate.technical_number}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset className="stack nested-fieldset">
          <legend>{uiText(locale, "Départ du bloc", "Block start")}</legend>
          <div className="form-grid">
            <label>
              {uiText(locale, "Mode de départ", "Start mode")}
              <select value={scheduleStartMode} onChange={(event) => setScheduleStartMode(event.target.value as ScheduleStartMode)}>
                <option value="unscheduled">{scheduleStartModeLabel("unscheduled", locale)}</option>
                <option value="fixed">{scheduleStartModeLabel("fixed", locale)}</option>
                <option value="after_previous">{scheduleStartModeLabel("after_previous", locale)}</option>
              </select>
            </label>
            <label>
              {uiText(locale, "Heure", "Time")}
              <input disabled={scheduleStartMode !== "fixed"} required={scheduleStartMode === "fixed"} type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} />
            </label>
          </div>
        </fieldset>
        <div className="form-grid">
          <label>
            {uiText(locale, "Libellé d'horaire", "Schedule label")}
            <input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <ShowScorePatternSelect locale={locale} value={pattern} onChange={(value) => { setPattern(value); setConcurrentBlockId(""); }} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Manège / arène", "Arena")}
            <input value={arena} onChange={(event) => { setArena(event.target.value); setConcurrentBlockId(""); }} />
          </label>
          <label>
            {uiText(locale, "Juge(s)", "Judge(s)")}
            <input value={judgeDisplayName} onChange={(event) => setJudgeDisplayName(event.target.value)} />
          </label>
        </div>
        <label>
          {uiText(locale, "Bloc concurrent", "Concurrent block")}
          <select value={concurrentBlockId} onChange={(event) => setConcurrentBlockId(event.target.value)}>
            <option value="">{uiText(locale, "Aucun", "None")}</option>
            {concurrentBlockChoices.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
          <span className="input-help">{uiText(locale, "Seuls les blocs de la même journée, du même manège et avec le même patron sont proposés.", "Only blocks on the same day, in the same arena, with the same pattern are offered.")}</span>
        </label>
        <fieldset className="stack nested-fieldset">
          <legend>{uiText(locale, "Inscriptions", "Entries")}</legend>
          <label>
            {uiText(locale, "Fermeture des inscriptions", "Entries close at")}
            <input type="datetime-local" value={entriesCloseAt} onChange={(event) => setEntriesCloseAt(event.target.value)} />
            <span className="input-help">{uiText(locale, "Les règles de retard sont configurées sur le concours.", "Late-entry rules are configured on the show.")}</span>
          </label>
        </fieldset>
        <label>
          {uiText(locale, "Statut", "Status")}
          <select value={status} onChange={(event) => setStatus(event.target.value as Block["schedule_status"])}>
            <option value="open">{uiText(locale, "Ouvert", "Open")}</option>
            <option value="closed">{uiText(locale, "Fermé", "Closed")}</option>
            <option value="running">{uiText(locale, "En cours", "Running")}</option>
            <option value="finished">{uiText(locale, "Terminé", "Finished")}</option>
          </select>
        </label>
        <FormActions busy={busy} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}


export { BlockEditForm };
