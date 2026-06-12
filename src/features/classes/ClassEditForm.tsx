import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions, SearchSelect } from "../../components/ui";
import { findById, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { updateClass } from "../../services/supabaseServices";
import type { BackNumberPolicy, ClassRecord, EligibilityRules, Organization, SanctioningBody, ScheduleStartMode, Show, ShowDay } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { defaultBackNumberPolicy, eligibilityRulesFromNotes, eligibilityNotesFromRules, scheduleStartModeForClass, scheduleStartModeLabel, showDayLabel, datetimeLocalToIso, datetimeLocalInputValue, classProgramRules, concurrentClassIdFromRules, concurrentGroupLabelFromRules, timeInputValue } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { ShowScorePatternSelect } from "./ShowScorePatternSelect";
import { patternForConcurrentClass, showScorePatternLabel } from "./showScorePatterns";

function ClassEditForm({
  locale = "fr",
  classes,
  classRecord,
  sanctioningBodies,
  showDays,
  onCancel,
  onUpdateClass,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  classRecord: ClassRecord;
  sanctioningBodies: SanctioningBody[];
  showDays: ShowDay[];
  onCancel: () => void;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
}) {
  const initialConcurrentClassId = concurrentClassIdFromRules(classRecord.eligibility_rules);
  const initialConcurrentClass = findById(classes, initialConcurrentClassId);
  const [name, setName] = useState(classRecord.name);
  const [code, setCode] = useState(classRecord.code ?? "");
  const [showDayId, setShowDayId] = useState(classRecord.show_day_id ?? "");
  const [blockLabel, setBlockLabel] = useState(classRecord.block_label ?? "");
  const [pattern, setPattern] = useState(patternForConcurrentClass(classRecord.pattern, initialConcurrentClass));
  const [entryFee, setEntryFee] = useState(classRecord.entry_fee == null ? "" : String(classRecord.entry_fee));
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>(classRecord.sanctioning_body_codes ?? []);
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>(classRecord.back_number_policy ?? "horse");
  const [nrhaSlateNumber, setNrhaSlateNumber] = useState(classRecord.nrha_slate_number ?? "");
  const [entriesCloseAt, setEntriesCloseAt] = useState(datetimeLocalInputValue(classRecord.entries_close_at));
  const [lateEntriesAllowed, setLateEntriesAllowed] = useState(classRecord.late_entries_allowed ?? true);
  const [lateEntryFeePercent, setLateEntryFeePercent] = useState(classRecord.late_entry_fee_percent == null ? "50" : String(classRecord.late_entry_fee_percent));
  const [concurrentClassId, setConcurrentClassId] = useState(initialConcurrentClassId);
  const [scheduleStartMode, setScheduleStartMode] = useState<ScheduleStartMode>(scheduleStartModeForClass(classRecord));
  const [scheduledTime, setScheduledTime] = useState(timeInputValue(classRecord.scheduled_time));
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(classRecord.eligibility_rules));
  const [status, setStatus] = useState<ClassRecord["status"]>(classRecord.status);
  const [busy, setBusy] = useState(false);
  const concurrentClassChoices = classes.filter((candidate) => candidate.show_id === classRecord.show_id && candidate.id !== classRecord.id);
  const selectedConcurrentClass = findById(classes, concurrentClassId) ?? null;
  const patternLockedToConcurrent = Boolean(selectedConcurrentClass);
  const selectedShowDays = showDays.filter((day) => day.show_id === classRecord.show_id);

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
    setBusy(true);

    try {
      const patternForSave = patternForConcurrentClass(pattern, selectedConcurrentClass);
      await onUpdateClass(classRecord.id, {
        name,
        code: code || null,
        show_day_id: showDayId || null,
        block_label: blockLabel || null,
        pattern: patternForSave || null,
        sanctioning_body_codes: sanctioningBodyCodes,
        back_number_policy: backNumberPolicy,
        nrha_slate_number: nrhaSlateNumber.trim() || null,
        entries_close_at: datetimeLocalToIso(entriesCloseAt),
        late_entries_allowed: lateEntriesAllowed,
        late_entry_fee_percent: numericValue(lateEntryFeePercent) ?? 50,
        schedule_start_mode: scheduleStartMode,
        scheduled_time: scheduleStartMode === "fixed" ? scheduledTime || null : null,
        eligibility_rules: classProgramRules(eligibilityNotes, {
          concurrentClass: selectedConcurrentClass,
        }),
        entry_fee: numericValue(entryFee) ?? null,
        status,
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
          <p>{classRecord.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom du bloc", "Block name")}
          <input required value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            Code
            <input value={code} onChange={(event) => setCode(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Journée", "Day")}
            <select value={showDayId} onChange={(event) => setShowDayId(event.target.value)}>
              <option value="">{uiText(locale, "Aucune journée", "No day")}</option>
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
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Libellé d'horaire", "Schedule label")}
            <input value={blockLabel} onChange={(event) => setBlockLabel(event.target.value)} />
          </label>
          <label>
            Patron
            <ShowScorePatternSelect disabled={patternLockedToConcurrent} locale={locale} value={pattern} onChange={setPattern} />
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
          label={uiText(locale, "Sanctions du bloc (optionnel)", "Block sanctioning (optional)")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onSanctioningBodyCodesChange={handleSanctioningBodyCodes}
        />
        <label>
          {uiText(locale, "Slate / concours technique", "Slate / technical show")}
          <input placeholder="Ex.: Slate 1, Slate 2, NRHA A" value={nrhaSlateNumber} onChange={(event) => setNrhaSlateNumber(event.target.value)} />
        </label>
        <fieldset className="stack nested-fieldset">
          <legend>{uiText(locale, "Inscriptions", "Entries")}</legend>
          <div className="form-grid">
            <label>
              {uiText(locale, "Fermeture des inscriptions", "Entries close at")}
              <input type="datetime-local" value={entriesCloseAt} onChange={(event) => setEntriesCloseAt(event.target.value)} />
              <span className="input-help">{uiText(locale, "L'ordre de passage peut être sorti manuellement après cette heure.", "The draw can be generated manually after this time.")}</span>
            </label>
            <label>
              {uiText(locale, "Pénalité d'inscription tardive (%)", "Late entry penalty (%)")}
              <input disabled={!lateEntriesAllowed} min="0" step="0.01" type="number" value={lateEntryFeePercent} onChange={(event) => setLateEntryFeePercent(event.target.value)} />
              <span className="input-help">{uiText(locale, "Ex.: 50 = 50 % du frais d'inscription.", "Example: 50 = 50% of the entry fee.")}</span>
            </label>
          </div>
          <label className="checkbox-row">
            <input checked={lateEntriesAllowed} type="checkbox" onChange={(event) => setLateEntriesAllowed(event.target.checked)} />
            <span>{uiText(locale, "Accepter les inscriptions tardives après la fermeture", "Allow late entries after closing")}</span>
          </label>
        </fieldset>
        <label>
          {uiText(locale, "Court en même temps qu'un autre bloc", "Runs at the same time as another block")}
          <SearchSelect
            allowEmpty
            disabled={!concurrentClassChoices.length}
            items={concurrentClassChoices.map((candidate) => ({
              id: candidate.id,
              label: candidate.name,
              detail: [
                candidate.block_label || uiText(locale, "Libellé d'horaire absent", "Missing schedule label"),
                showScorePatternLabel(candidate.pattern) ? `${uiText(locale, "Patron", "Pattern")} ${showScorePatternLabel(candidate.pattern)}` : null,
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
          <textarea rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <label>
          {uiText(locale, "Statut", "Status")}
          <select value={status} onChange={(event) => setStatus(event.target.value as ClassRecord["status"])}>
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


export { ClassEditForm };
