import { useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { SearchSelect } from "../../components/ui";
import { findById, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createBlock, createClass } from "../../services/supabaseServices";
import type { Block, BlockTemplate, ClassTemplate, Organization, ScheduleStartMode, Show, ShowDay, Slate } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { scheduleStartModeLabel, showDayLabel, datetimeLocalToIso, defaultEntriesCloseAtForShowDay } from "./classUtils";
import { ShowScorePatternSelect } from "./ShowScorePatternSelect";
import { patternForConcurrentClass, showScorePatternLabel, showScorePatternSelectValue } from "./showScorePatterns";

function BlockForm({
  locale = "fr",
  blocks,
  classTemplates,
  blockTemplates,
  defaultMode = "preset",
  defaultShowDayId,
  defaultShowId,
  defaultTemplateId,
  organization,
  showDays,
  slates,
  shows,
  onCreateBlock,
  onCreateClass,
  onCreated,
}: {
  locale?: Locale;
  blocks: Block[];
  classTemplates: ClassTemplate[];
  blockTemplates: BlockTemplate[];
  defaultMode?: "preset" | "custom";
  defaultShowDayId?: string;
  defaultShowId?: string;
  defaultTemplateId?: string;
  organization: Organization | null;
  showDays: ShowDay[];
  slates: Slate[];
  shows: Show[];
  onCreateBlock: (input: Parameters<typeof createBlock>[0]) => Promise<Block>;
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const initialTemplate = defaultTemplateId ? findById(blockTemplates, defaultTemplateId) : null;
  const [creationMode, setCreationMode] = useState<"preset" | "custom">(defaultMode);
  const [showId, setShowId] = useState(defaultShowId ?? "");
  const [showDayId, setShowDayId] = useState(defaultShowDayId ?? "");
  const [slateId, setSlateId] = useState("");
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const [name, setName] = useState(initialTemplate?.name ?? "");
  const [blockLabel, setBlockLabel] = useState(initialTemplate?.block_label ?? "");
  const [arena, setArena] = useState("");
  const [judgeDisplayName, setJudgeDisplayName] = useState("");
  const [pattern, setPattern] = useState(showScorePatternSelectValue(initialTemplate?.pattern));
  const [entriesCloseAt, setEntriesCloseAt] = useState("");
  const [concurrentClassId, setConcurrentClassId] = useState("");
  const [scheduleStartMode, setScheduleStartMode] = useState<ScheduleStartMode>("unscheduled");
  const [scheduledTime, setScheduledTime] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || shows[0]?.id || "";
  const selectedShowDays = showDays.filter((day) => day.show_id === selectedShowId);
  const selectedShowSlates = slates.filter((slate) => slate.show_id === selectedShowId);
  const selectedShowDayId = showDayId && selectedShowDays.some((day) => day.id === showDayId) ? showDayId : selectedShowDays[0]?.id || "";
  const selectedShowDay = findById(showDays, selectedShowDayId) ?? null;
  const effectiveEntriesCloseAt = entriesCloseAt || defaultEntriesCloseAtForShowDay(selectedShowDay);
  const activeBlockTemplates = blockTemplates.filter((template) => template.is_active);
  const selectedTemplate = findById(blockTemplates, templateId);
  const selectedTemplateClasses = selectedTemplate ? classTemplates.filter((classRecord) => classRecord.block_template_id === selectedTemplate.id) : [];
  const concurrentClassChoices = blocks.filter((block) => block.show_id === selectedShowId && block.show_day_id === selectedShowDayId);
  const selectedConcurrentClass = findById(blocks, concurrentClassId) ?? null;
  const patternLockedToConcurrent = Boolean(selectedConcurrentClass);
  const nextSortOrder = Math.max(0, ...blocks.filter((block) => block.show_day_id === selectedShowDayId).map((block) => block.sort_order)) + 10;

  function handleShowChange(nextShowId: string) {
    setShowId(nextShowId);
    setShowDayId("");
    setSlateId("");
    setConcurrentClassId("");
  }

  function handleCreationModeChange(nextMode: "preset" | "custom") {
    setCreationMode(nextMode);

    if (nextMode === "custom") {
      setTemplateId("");
    }
  }

  function handleTemplateChange(nextTemplateId: string) {
    setTemplateId(nextTemplateId);

    const template = findById(blockTemplates, nextTemplateId);
    if (!template) {
      return;
    }

    setName(template.name);
    setBlockLabel(template.block_label ?? "");
    setPattern(patternForConcurrentClass(template.pattern, selectedConcurrentClass));
  }

  function handleConcurrentClassChange(nextClassId: string) {
    setConcurrentClassId(nextClassId);

    const nextConcurrentClass = findById(blocks, nextClassId);
    if (nextConcurrentClass) {
      setPattern(patternForConcurrentClass(pattern, nextConcurrentClass));
      setArena(nextConcurrentClass.arena ?? "");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedShowId) {
      return;
    }

    setBusy(true);

    try {
      const patternForSave = patternForConcurrentClass(pattern, selectedConcurrentClass);
      const createdBlock = await onCreateBlock({
        organization_id: organization.id,
        show_id: selectedShowId,
        show_day_id: selectedShowDayId || undefined,
        slate_id: slateId || null,
        block_template_id: selectedTemplate?.id ?? null,
        name,
        display_label: blockLabel,
        arena: (selectedConcurrentClass?.arena ?? arena.trim()) || undefined,
        pattern: patternForSave || undefined,
        entries_close_at: datetimeLocalToIso(effectiveEntriesCloseAt),
        concurrent_block_id: selectedConcurrentClass?.id ?? null,
        schedule_start_mode: scheduleStartMode,
        scheduled_time: scheduleStartMode === "fixed" ? scheduledTime || null : null,
        judge_display_name: judgeDisplayName.trim() || undefined,
        sort_order: nextSortOrder,
      });

      for (const classTemplate of selectedTemplateClasses) {
        await onCreateClass({
          organization_id: organization.id,
          show_id: selectedShowId,
          block_id: createdBlock.id,
          organization_discipline_id: classTemplate.organization_discipline_id,
          class_template_id: classTemplate.id,
          name: classTemplate.name,
          code: classTemplate.code ?? undefined,
          level: classTemplate.level ?? undefined,
          entry_fee: classTemplate.default_entry_fee ?? undefined,
          judge_fee: classTemplate.default_judge_fee ?? undefined,
          payout_schedule_type: classTemplate.default_payout_schedule_type ?? "none",
          added_money: classTemplate.default_added_money ?? 0,
          retainage_percent: classTemplate.default_retainage_percent ?? null,
          trophy_or_plaque_fee: classTemplate.default_trophy_or_plaque_fee ?? 0,
          sanctioning_fee_percent: classTemplate.default_sanctioning_fee_percent ?? null,
          payout_rules: classTemplate.default_payout_rules ?? {},
          payout_notes: classTemplate.default_payout_notes ?? null,
          governing_body_assignments: classTemplate.governing_body_assignments.map((assignment) => ({
            governing_body_id: assignment.governing_body_id,
            reporting_class_code: assignment.reporting_class_code,
            eligibility_profile_code: assignment.eligibility_profile_code,
            sanction_metadata: assignment.sanction_metadata,
          })),
          eligibility_rules: classTemplate.eligibility_rules ?? {},
        });
      }

      setTemplateId("");
      setName("");
      setBlockLabel("");
      setArena("");
      setJudgeDisplayName("");
      setPattern("");
      setEntriesCloseAt("");
      setSlateId("");
      setConcurrentClassId("");
      setScheduleStartMode("unscheduled");
      setScheduledTime("");
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Nouveau bloc", "New block")}</h2>
          <p>{shows.length ? uiText(locale, "Crée des blocs pour un concours.", "Create schedule blocks for a show.") : uiText(locale, "Crée un concours d'abord.", "Create a show first.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="segmented-control">
          <button className={creationMode === "preset" ? "active" : ""} disabled={!organization || !activeBlockTemplates.length} type="button" onClick={() => handleCreationModeChange("preset")}>
            {uiText(locale, "Depuis un bloc récurrent", "From recurring block")}
          </button>
          <button className={creationMode === "custom" ? "active" : ""} disabled={!organization} type="button" onClick={() => handleCreationModeChange("custom")}>
            {uiText(locale, "Bloc libre", "Custom block")}
          </button>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Concours", "Show")}
            <select disabled={!organization || !shows.length} value={selectedShowId} onChange={(event) => handleShowChange(event.target.value)}>
              {shows.map((show) => (
                <option key={show.id} value={show.id}>
                  {show.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {uiText(locale, "Journée", "Day")}
            <select disabled={!organization || !selectedShowDays.length} value={selectedShowDayId} onChange={(event) => setShowDayId(event.target.value)}>
              {!selectedShowDays.length ? <option value="">{uiText(locale, "Aucune journée", "No day")}</option> : null}
              {selectedShowDays.map((day) => (
                <option key={day.id} value={day.id}>
                  {showDayLabel(day)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Slate
            <select disabled={!organization || !shows.length} value={slateId} onChange={(event) => setSlateId(event.target.value)}>
              <option value="">{uiText(locale, "Aucune slate", "No slate")}</option>
              {selectedShowSlates.map((slate) => (
                <option key={slate.id} value={slate.id}>
                  {slate.name}{slate.technical_number ? ` — ${slate.technical_number}` : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Manège / arène", "Arena")}
            <input disabled={!organization || !shows.length || patternLockedToConcurrent} value={arena} onChange={(event) => setArena(event.target.value)} />
            {patternLockedToConcurrent ? <span className="input-help">{uiText(locale, "Synchronisé avec le bloc concurrent.", "Synced with the concurrent block.")}</span> : null}
          </label>
          <label>
            {uiText(locale, "Juge(s)", "Judge(s)")}
            <input disabled={!organization || !shows.length} placeholder={uiText(locale, "Ex.: Lyle Jackson", "Example: Lyle Jackson")} value={judgeDisplayName} onChange={(event) => setJudgeDisplayName(event.target.value)} />
          </label>
        </div>
        <fieldset className="stack nested-fieldset">
          <legend>{uiText(locale, "Départ du bloc", "Block start")}</legend>
          <div className="form-grid">
            <label>
              {uiText(locale, "Mode de départ", "Start mode")}
              <select disabled={!organization || !shows.length} value={scheduleStartMode} onChange={(event) => setScheduleStartMode(event.target.value as ScheduleStartMode)}>
                <option value="unscheduled">{scheduleStartModeLabel("unscheduled", locale)}</option>
                <option value="fixed">{scheduleStartModeLabel("fixed", locale)}</option>
                <option value="after_previous">{scheduleStartModeLabel("after_previous", locale)}</option>
              </select>
            </label>
            <label>
              {uiText(locale, "Heure", "Time")}
              <input disabled={!organization || !shows.length || scheduleStartMode !== "fixed"} required={scheduleStartMode === "fixed"} type="time" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} />
            </label>
          </div>
        </fieldset>
        {creationMode === "preset" ? (
          <label>
            {uiText(locale, "Bloc récurrent", "Recurring block")}
            <SearchSelect
              allowEmpty
              disabled={!organization || !activeBlockTemplates.length}
              items={activeBlockTemplates.map((template) => {
                const templateClasses = classTemplates.filter((classRecord) => classRecord.block_template_id === template.id);

                return {
                  id: template.id,
                  label: template.name,
                  detail: [
                    template.pattern ? `${uiText(locale, "Patron", "Pattern")} ${showScorePatternLabel(template.pattern)}` : null,
                    uiText(locale, `${templateClasses.length} classe${templateClasses.length === 1 ? "" : "s"}`, `${templateClasses.length} class${templateClasses.length === 1 ? "" : "es"}`),
                  ]
                    .filter(Boolean)
                    .join(" - "),
                };
              })}
              placeholder={uiText(locale, "Rechercher un bloc récurrent", "Search recurring block")}
              value={templateId}
              onChange={handleTemplateChange}
            />
          </label>
        ) : null}
        <label>
          {uiText(locale, "Nom du bloc", "Block name")}
          <input disabled={!organization || !shows.length} required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Libellé d'horaire", "Schedule label")}
            <input disabled={!organization || !shows.length} value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <ShowScorePatternSelect disabled={!organization || !shows.length || patternLockedToConcurrent} locale={locale} value={pattern} onChange={setPattern} />
            {patternLockedToConcurrent ? (
              <span className="input-help">
                {uiText(locale, "Synchronise avec le bloc concurrent choisi.", "Synced with the selected concurrent block.")}
              </span>
            ) : null}
          </label>
        </div>
        <fieldset className="stack nested-fieldset">
          <legend>{uiText(locale, "Inscriptions", "Entries")}</legend>
          <label>
            {uiText(locale, "Fermeture des inscriptions", "Entries close at")}
            <input disabled={!organization || !shows.length} type="datetime-local" value={effectiveEntriesCloseAt} onChange={(event) => setEntriesCloseAt(event.target.value)} />
            <span className="input-help">{uiText(locale, "Par défaut: veille du bloc à 18 h. Les règles de retard sont configurées sur le concours.", "Default: day before the block at 6 p.m. Late-entry rules are configured on the show.")}</span>
          </label>
        </fieldset>
        <label>
          {uiText(locale, "Court en même temps qu'un autre bloc", "Runs at the same time as another block")}
          <SearchSelect
            allowEmpty
            disabled={!organization || !concurrentClassChoices.length}
            items={concurrentClassChoices.map((block) => ({
              id: block.id,
              label: block.name,
              detail: [
                block.display_label || uiText(locale, "Libellé d'horaire absent", "Missing schedule label"),
                showScorePatternLabel(block.pattern) ? `${uiText(locale, "Patron", "Pattern")} ${showScorePatternLabel(block.pattern)}` : null,
                block.show_day_id && findById(showDays, block.show_day_id) ? showDayLabel(findById(showDays, block.show_day_id) as ShowDay) : null,
              ]
                .filter(Boolean)
                .join(" - "),
            }))}
            placeholder={uiText(locale, "Rechercher un bloc concurrent", "Search concurrent block")}
            value={concurrentClassId}
            onChange={handleConcurrentClassChange}
          />
        </label>
        <button className="primary-button" disabled={busy || !organization || !shows.length} type="submit">
          <Plus size={18} />
          {selectedTemplate ? uiText(locale, `Créer le bloc + ${selectedTemplateClasses.length} classe${selectedTemplateClasses.length === 1 ? "" : "s"}`, `Create block + ${selectedTemplateClasses.length} class${selectedTemplateClasses.length === 1 ? "" : "es"}`) : uiText(locale, "Créer le bloc", "Create block")}
        </button>
      </form>
    </section>
  );
}

export { BlockForm };
