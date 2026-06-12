import { useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { SearchSelect } from "../../components/ui";
import { findById, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createClass, createDivision } from "../../services/supabaseServices";
import type { BackNumberPolicy, ClassRecord, ClassTemplate, ClassTemplateDivision, EligibilityRules, Organization, SanctioningBody, ScheduleStartMode, Show, ShowDay } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { defaultBackNumberPolicy, eligibilityRulesFromNotes, eligibilityNotesFromRules, sanctionLabel, scheduleStartModeLabel, showDayLabel, datetimeLocalToIso, defaultEntriesCloseAtForShowDay, classProgramRules } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { ShowScorePatternSelect } from "./ShowScorePatternSelect";
import { patternForConcurrentClass, showScorePatternLabel, showScorePatternSelectValue } from "./showScorePatterns";

function ClassForm({
  locale = "fr",
  classes,
  classTemplateDivisions,
  classTemplates,
  defaultMode = "preset",
  defaultShowDayId,
  defaultShowId,
  defaultTemplateId,
  organization,
  sanctioningBodies,
  showDays,
  shows,
  onCreateClass,
  onCreateDivision,
  onCreated,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  classTemplateDivisions: ClassTemplateDivision[];
  classTemplates: ClassTemplate[];
  defaultMode?: "preset" | "custom";
  defaultShowDayId?: string;
  defaultShowId?: string;
  defaultTemplateId?: string;
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  showDays: ShowDay[];
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<ClassRecord>;
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const initialTemplate = defaultTemplateId ? findById(classTemplates, defaultTemplateId) : null;
  const [creationMode, setCreationMode] = useState<"preset" | "custom">(defaultMode);
  const [showId, setShowId] = useState(defaultShowId ?? "");
  const [showDayId, setShowDayId] = useState(defaultShowDayId ?? "");
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const [name, setName] = useState(initialTemplate?.name ?? "");
  const [code, setCode] = useState(initialTemplate?.code ?? "");
  const [blockLabel, setBlockLabel] = useState(initialTemplate?.block_label ?? "");
  const [pattern, setPattern] = useState(showScorePatternSelectValue(initialTemplate?.default_pattern));
  const [entryFee, setEntryFee] = useState(initialTemplate?.default_entry_fee == null ? "" : String(initialTemplate.default_entry_fee));
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>(initialTemplate?.sanctioning_body_codes ?? []);
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>(initialTemplate?.back_number_policy ?? "horse");
  const [nrhaSlateNumber, setNrhaSlateNumber] = useState("");
  const [entriesCloseAt, setEntriesCloseAt] = useState("");
  const [lateEntriesAllowed, setLateEntriesAllowed] = useState(true);
  const [lateEntryFeePercent, setLateEntryFeePercent] = useState("50");
  const [concurrentClassId, setConcurrentClassId] = useState("");
  const [scheduleStartMode, setScheduleStartMode] = useState<ScheduleStartMode>("unscheduled");
  const [scheduledTime, setScheduledTime] = useState("");
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(initialTemplate?.eligibility_rules));
  const [busy, setBusy] = useState(false);
  const selectedShowId = showId || shows[0]?.id || "";
  const selectedShowDays = showDays.filter((day) => day.show_id === selectedShowId);
  const selectedShowDayId = showDayId && selectedShowDays.some((day) => day.id === showDayId) ? showDayId : selectedShowDays[0]?.id || "";
  const selectedShowDay = findById(showDays, selectedShowDayId) ?? null;
  const effectiveEntriesCloseAt = entriesCloseAt || defaultEntriesCloseAtForShowDay(selectedShowDay);
  const activeClassTemplates = classTemplates.filter((template) => template.is_active);
  const selectedTemplate = findById(classTemplates, templateId);
  const selectedTemplateDivisions = selectedTemplate ? classTemplateDivisions.filter((division) => division.class_template_id === selectedTemplate.id) : [];
  const concurrentClassChoices = classes.filter((classRecord) => classRecord.show_id === selectedShowId);
  const selectedConcurrentClass = findById(classes, concurrentClassId) ?? null;
  const patternLockedToConcurrent = Boolean(selectedConcurrentClass);
  const nextSortOrder = Math.max(0, ...classes.filter((classRecord) => classRecord.show_day_id === selectedShowDayId).map((classRecord) => classRecord.sort_order)) + 10;

  function handleShowChange(nextShowId: string) {
    setShowId(nextShowId);
    setShowDayId("");
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

    const template = findById(classTemplates, nextTemplateId);
    if (!template) {
      return;
    }

    setName(template.name);
    setCode(template.code ?? "");
    setBlockLabel(template.block_label ?? "");
    setPattern(patternForConcurrentClass(template.default_pattern, selectedConcurrentClass));
    setEntryFee(template.default_entry_fee == null ? "" : String(template.default_entry_fee));
    setSanctioningBodyCodes(template.sanctioning_body_codes ?? []);
    setBackNumberPolicy(template.back_number_policy ?? defaultBackNumberPolicy(template.sanctioning_body_codes ?? [], sanctioningBodies));
    setEligibilityNotes(eligibilityNotesFromRules(template.eligibility_rules));
  }

  function handleSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);
    setBackNumberPolicy(defaultBackNumberPolicy(nextCodes, sanctioningBodies));
  }

  function handleConcurrentClassChange(nextClassId: string) {
    setConcurrentClassId(nextClassId);

    const nextConcurrentClass = findById(classes, nextClassId);
    if (nextConcurrentClass) {
      setPattern(patternForConcurrentClass(pattern, nextConcurrentClass));
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
      const createdClass = await onCreateClass({
        organization_id: organization.id,
        show_id: selectedShowId,
        show_day_id: selectedShowDayId || undefined,
        class_template_id: selectedTemplate?.id ?? null,
        name,
        code,
        block_label: blockLabel,
        pattern: patternForSave || undefined,
        sanctioning_body_codes: sanctioningBodyCodes,
        back_number_policy: backNumberPolicy,
        nrha_slate_number: nrhaSlateNumber.trim() || null,
        entries_close_at: datetimeLocalToIso(effectiveEntriesCloseAt),
        late_entries_allowed: lateEntriesAllowed,
        late_entry_fee_percent: numericValue(lateEntryFeePercent) ?? 50,
        schedule_start_mode: scheduleStartMode,
        scheduled_time: scheduleStartMode === "fixed" ? scheduledTime || null : null,
        sort_order: nextSortOrder,
        eligibility_rules: classProgramRules(eligibilityNotes, {
          concurrentClass: selectedConcurrentClass,
        }),
        entry_fee: numericValue(entryFee),
      });

      for (const templateDivision of selectedTemplateDivisions) {
        await onCreateDivision({
          organization_id: organization.id,
          show_id: selectedShowId,
          class_id: createdClass.id,
          class_template_division_id: templateDivision.id,
          name: templateDivision.name,
          code: templateDivision.code ?? undefined,
          level: templateDivision.level ?? undefined,
          entry_fee: templateDivision.default_entry_fee ?? undefined,
          judge_fee: templateDivision.default_judge_fee ?? undefined,
          payout_schedule_type: templateDivision.default_payout_schedule_type ?? "none",
          added_money: templateDivision.default_added_money ?? 0,
          retainage_percent: templateDivision.default_retainage_percent ?? null,
          trophy_or_plaque_fee: templateDivision.default_trophy_or_plaque_fee ?? 0,
          sanctioning_fee_percent: templateDivision.default_sanctioning_fee_percent ?? null,
          payout_rules: templateDivision.default_payout_rules ?? {},
          payout_notes: templateDivision.default_payout_notes ?? null,
          sanctioning_body_codes: templateDivision.sanctioning_body_codes.length ? templateDivision.sanctioning_body_codes : sanctioningBodyCodes,
          eligibility_rules: templateDivision.eligibility_rules ?? {},
        });
      }

      setTemplateId("");
      setName("");
      setCode("");
      setBlockLabel("");
      setPattern("");
      setEntryFee("");
      setSanctioningBodyCodes([]);
      setBackNumberPolicy("horse");
      setNrhaSlateNumber("");
      setEntriesCloseAt("");
      setLateEntriesAllowed(true);
      setLateEntryFeePercent("50");
      setConcurrentClassId("");
      setScheduleStartMode("unscheduled");
      setScheduledTime("");
      setEligibilityNotes("");
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
          <button className={creationMode === "preset" ? "active" : ""} disabled={!organization || !activeClassTemplates.length} type="button" onClick={() => handleCreationModeChange("preset")}>
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
              disabled={!organization || !activeClassTemplates.length}
              items={activeClassTemplates.map((template) => {
                const templateDivisions = classTemplateDivisions.filter((division) => division.class_template_id === template.id);

                return {
                  id: template.id,
                  label: template.name,
                  detail: [
                    template.default_pattern ? `${uiText(locale, "Patron", "Pattern")} ${showScorePatternLabel(template.default_pattern)}` : null,
                    uiText(locale, `${templateDivisions.length} classe${templateDivisions.length === 1 ? "" : "s"}`, `${templateDivisions.length} class${templateDivisions.length === 1 ? "" : "es"}`),
                    sanctionLabel(template.sanctioning_body_codes, sanctioningBodies, locale),
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
            Code
            <input disabled={!organization || !shows.length} value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input disabled={!organization || !shows.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
        </div>
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
        <SanctioningFields
          locale={locale}
          backNumberPolicy={backNumberPolicy}
          disabled={!organization || !shows.length}
          label={uiText(locale, "Sanctions du bloc (optionnel)", "Block sanctioning (optional)")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        <label>
          {uiText(locale, "Slate / concours technique", "Slate / technical show")}
          <input disabled={!organization || !shows.length} placeholder="Ex.: Slate 1, Slate 2, NRHA A" value={nrhaSlateNumber} onChange={(event) => setNrhaSlateNumber(event.target.value)} />
        </label>
        <fieldset className="stack nested-fieldset">
          <legend>{uiText(locale, "Inscriptions", "Entries")}</legend>
          <div className="form-grid">
            <label>
              {uiText(locale, "Fermeture des inscriptions", "Entries close at")}
              <input disabled={!organization || !shows.length} type="datetime-local" value={effectiveEntriesCloseAt} onChange={(event) => setEntriesCloseAt(event.target.value)} />
              <span className="input-help">{uiText(locale, "Par défaut: veille du bloc à 18 h.", "Default: day before the block at 6 p.m.")}</span>
            </label>
            <label>
              {uiText(locale, "Pénalité d'inscription tardive (%)", "Late entry penalty (%)")}
              <input disabled={!organization || !shows.length || !lateEntriesAllowed} min="0" step="0.01" type="number" value={lateEntryFeePercent} onChange={(event) => setLateEntryFeePercent(event.target.value)} />
              <span className="input-help">{uiText(locale, "Ex.: 50 = 50 % du frais d'inscription.", "Example: 50 = 50% of the entry fee.")}</span>
            </label>
          </div>
          <label className="checkbox-row">
            <input checked={lateEntriesAllowed} disabled={!organization || !shows.length} type="checkbox" onChange={(event) => setLateEntriesAllowed(event.target.checked)} />
            <span>{uiText(locale, "Accepter les inscriptions tardives après la fermeture", "Allow late entries after closing")}</span>
          </label>
        </fieldset>
        <label>
          {uiText(locale, "Court en même temps qu'un autre bloc", "Runs at the same time as another block")}
          <SearchSelect
            allowEmpty
            disabled={!organization || !concurrentClassChoices.length}
            items={concurrentClassChoices.map((classRecord) => ({
              id: classRecord.id,
              label: classRecord.name,
              detail: [
                classRecord.block_label || uiText(locale, "Libellé d'horaire absent", "Missing schedule label"),
                showScorePatternLabel(classRecord.pattern) ? `${uiText(locale, "Patron", "Pattern")} ${showScorePatternLabel(classRecord.pattern)}` : null,
                classRecord.show_day_id && findById(showDays, classRecord.show_day_id) ? showDayLabel(findById(showDays, classRecord.show_day_id) as ShowDay) : null,
              ]
                .filter(Boolean)
                .join(" - "),
            }))}
            placeholder={uiText(locale, "Rechercher un bloc concurrent", "Search concurrent block")}
            value={concurrentClassId}
            onChange={handleConcurrentClassChange}
          />
        </label>
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea disabled={!organization || !shows.length} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !shows.length} type="submit">
          <Plus size={18} />
          {selectedTemplate ? uiText(locale, `Créer le bloc + ${selectedTemplateDivisions.length} classes`, `Create block + ${selectedTemplateDivisions.length} classes`) : uiText(locale, "Créer le bloc", "Create block")}
        </button>
      </form>
    </section>
  );
}

export { ClassForm };
