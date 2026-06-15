import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions, SearchSelect } from "../../components/ui";
import { findById, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { updateDivision } from "../../services/supabaseServices";
import type { ClassRecord, Division, EligibilityRules, Organization, PayoutScheduleType, SanctioningBody, Show } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { isNrhaSanctioned, nrhaClassTypes, eligibilityRulesFromNotes, eligibilityNotesFromRules, nrhaClassTypeFromRules, applyNrhaApprovedClassChoice, NrhaApprovedClassSelect } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { PayoutSettingsFields } from "./PayoutSettingsFields";

function DivisionEditForm({
  locale = "fr",
  classes,
  division,
  sanctioningBodies,
  onCancel,
  onUpdateDivision,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  division: Division;
  sanctioningBodies: SanctioningBody[];
  onCancel: () => void;
  onUpdateDivision: (id: string, input: Parameters<typeof updateDivision>[1]) => Promise<void>;
}) {
  const [classId, setClassId] = useState(division.class_id);
  const [name, setName] = useState(division.name);
  const [code, setCode] = useState(division.code ?? "");
  const [entryFee, setEntryFee] = useState(division.entry_fee == null ? "" : String(division.entry_fee));
  const [judgeFee, setJudgeFee] = useState(division.judge_fee == null ? "" : String(division.judge_fee));
  const [payoutScheduleType, setPayoutScheduleType] = useState<PayoutScheduleType>(division.payout_schedule_type ?? "none");
  const [addedMoney, setAddedMoney] = useState(division.added_money == null ? "" : String(division.added_money));
  const [retainagePercent, setRetainagePercent] = useState(division.retainage_percent == null ? "" : String(division.retainage_percent));
  const [trophyOrPlaqueFee, setTrophyOrPlaqueFee] = useState(division.trophy_or_plaque_fee == null ? "" : String(division.trophy_or_plaque_fee));
  const [sanctioningFeePercent, setSanctioningFeePercent] = useState(division.sanctioning_fee_percent == null ? "" : String(division.sanctioning_fee_percent));
  const [payoutRules, setPayoutRules] = useState<Record<string, unknown>>(division.payout_rules ?? {});
  const [payoutNotes, setPayoutNotes] = useState(division.payout_notes ?? "");
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>(division.sanctioning_body_codes ?? []);
  const [nrhaClassType, setNrhaClassType] = useState(nrhaClassTypeFromRules(division.eligibility_rules));
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(division.eligibility_rules));
  const [busy, setBusy] = useState(false);
  const selectedClass = findById(classes, classId);
  const divisionIsNrha = isNrhaSanctioned(sanctioningBodyCodes);

  function handleDivisionSanctioningBodyCodes(nextCodes: string[]) {
    setSanctioningBodyCodes(nextCodes);

    if (!isNrhaSanctioned(nextCodes)) {
      setNrhaClassType("");
    }
  }

  function handleNrhaApprovedClassChange(nextCode: string) {
    applyNrhaApprovedClassChoice(nextCode, {
      setCode,
      setName,
      setNrhaClassType,
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClass) {
      return;
    }

    setBusy(true);

    try {
      await onUpdateDivision(division.id, {
        class_id: selectedClass.id,
        show_id: selectedClass.show_id,
        name,
        code: code || null,
        entry_fee: numericValue(entryFee) ?? null,
        judge_fee: numericValue(judgeFee) ?? null,
        payout_schedule_type: payoutScheduleType,
        added_money: numericValue(addedMoney) ?? 0,
        retainage_percent: numericValue(retainagePercent) ?? null,
        trophy_or_plaque_fee: numericValue(trophyOrPlaqueFee) ?? 0,
        sanctioning_fee_percent: numericValue(sanctioningFeePercent) ?? null,
        payout_rules: payoutRules,
        payout_notes: payoutNotes.trim() || null,
        sanctioning_body_codes: sanctioningBodyCodes,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes, divisionIsNrha && nrhaClassType ? { nrha_class_type: nrhaClassType } : {}),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier la classe", "Edit class")}</h2>
          <p>{division.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Bloc", "Block")}
          <SearchSelect
            items={classes.map((classRecord) => ({ id: classRecord.id, label: classRecord.name, detail: classRecord.code ?? "" }))}
            placeholder={uiText(locale, "Rechercher un bloc", "Search block")}
            value={classId}
            onChange={setClassId}
          />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={selectedClass?.back_number_policy ?? "horse"}
          hideBackNumberPolicy
          label={uiText(locale, "Sanctions de la classe", "Class sanctioning")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={sanctioningBodyCodes}
          onBackNumberPolicyChange={() => undefined}
          onSanctioningBodyCodesChange={handleDivisionSanctioningBodyCodes}
        />
        <div className="form-grid">
          <label>
            {uiText(locale, "Nom de classe", "Class name")}
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {divisionIsNrha ? uiText(locale, "Classe NRHA", "NRHA class") : "Code"}
            {divisionIsNrha ? <NrhaApprovedClassSelect locale={locale} value={code} onChange={handleNrhaApprovedClassChange} /> : <input value={code} onChange={(event) => setCode(event.target.value)} />}
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais de juge", "Judge fee")}
            <input min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <PayoutSettingsFields
          locale={locale}
          addedMoney={addedMoney}
          divisionName={name}
          entryFee={entryFee}
          isNrha={divisionIsNrha}
          payoutNotes={payoutNotes}
          payoutRules={payoutRules}
          payoutScheduleType={payoutScheduleType}
          retainagePercent={retainagePercent}
          sanctioningFeePercent={sanctioningFeePercent}
          trophyOrPlaqueFee={trophyOrPlaqueFee}
          onAddedMoneyChange={setAddedMoney}
          onPayoutNotesChange={setPayoutNotes}
          onPayoutRulesChange={setPayoutRules}
          onPayoutScheduleTypeChange={setPayoutScheduleType}
          onRetainagePercentChange={setRetainagePercent}
          onSanctioningFeePercentChange={setSanctioningFeePercent}
          onTrophyOrPlaqueFeeChange={setTrophyOrPlaqueFee}
        />
        {divisionIsNrha ? (
          <label>
            {uiText(locale, "Type de classe NRHA", "NRHA class type")}
            <select value={nrhaClassType} onChange={(event) => setNrhaClassType(event.target.value)}>
              <option value="">{uiText(locale, "À préciser", "To be specified")}</option>
              {nrhaClassTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          {uiText(locale, "Critères d'éligibilité", "Eligibility criteria")}
          <textarea rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <FormActions busy={busy || !selectedClass} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}


export { DivisionEditForm };
