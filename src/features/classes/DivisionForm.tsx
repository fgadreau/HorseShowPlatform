import { useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { SearchSelect } from "../../components/ui";
import { findById, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createDivision } from "../../services/supabaseServices";
import type { ClassRecord, EligibilityRules, Organization, PayoutScheduleType, SanctioningBody, Show } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { isNrhaSanctioned, nrhaClassTypes, eligibilityRulesFromNotes, eligibilityNotesFromRules, applyNrhaApprovedClassChoice, NrhaApprovedClassSelect } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { PayoutSettingsFields } from "./PayoutSettingsFields";

function DivisionForm({
  locale = "fr",
  classes,
  defaultClassId,
  organization,
  sanctioningBodies,
  shows,
  onCreateDivision,
  onCreated,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  defaultClassId?: string;
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  shows: Show[];
  onCreateDivision: (input: Parameters<typeof createDivision>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const [classId, setClassId] = useState(defaultClassId ?? "");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [judgeFee, setJudgeFee] = useState("");
  const [payoutScheduleType, setPayoutScheduleType] = useState<PayoutScheduleType>("none");
  const [addedMoney, setAddedMoney] = useState("");
  const [retainagePercent, setRetainagePercent] = useState("");
  const [trophyOrPlaqueFee, setTrophyOrPlaqueFee] = useState("");
  const [sanctioningFeePercent, setSanctioningFeePercent] = useState("");
  const [payoutRules, setPayoutRules] = useState<Record<string, unknown>>({});
  const [payoutNotes, setPayoutNotes] = useState("");
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>([]);
  const [nrhaClassType, setNrhaClassType] = useState("");
  const [eligibilityNotes, setEligibilityNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedClass = findById(classes, classId) ?? null;
  const selectedShow = selectedClass ? findById(shows, selectedClass.show_id) : null;
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

    if (!organization || !selectedClass) {
      return;
    }

    setBusy(true);

    try {
      await onCreateDivision({
        organization_id: organization.id,
        show_id: selectedClass.show_id,
        class_id: selectedClass.id,
        name,
        code,
        entry_fee: numericValue(entryFee),
        judge_fee: numericValue(judgeFee),
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
      setName("");
      setCode("");
      setEntryFee("");
      setJudgeFee("");
      setPayoutScheduleType("none");
      setAddedMoney("");
      setRetainagePercent("");
      setTrophyOrPlaqueFee("");
      setSanctioningFeePercent("");
      setPayoutRules({});
      setPayoutNotes("");
      setSanctioningBodyCodes([]);
      setNrhaClassType("");
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
          <h2>{uiText(locale, "Nouvelle classe", "New class")}</h2>
          <p>{selectedShow ? selectedShow.name : uiText(locale, "Crée un bloc d'abord.", "Create a block first.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Bloc", "Block")}
          <SearchSelect
            disabled={!organization || !classes.length}
            items={classes.map((classRecord) => ({ id: classRecord.id, label: classRecord.name, detail: showLabel(findById(shows, classRecord.show_id)) }))}
            placeholder={uiText(locale, "Rechercher un bloc", "Search block")}
            value={selectedClass?.id ?? ""}
            onChange={setClassId}
          />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={selectedClass?.back_number_policy ?? "horse"}
          disabled={!organization || !classes.length}
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
            <input disabled={!organization || !classes.length} required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {divisionIsNrha ? uiText(locale, "Classe NRHA", "NRHA class") : "Code"}
            {divisionIsNrha ? (
              <NrhaApprovedClassSelect locale={locale} disabled={!organization || !classes.length} value={code} onChange={handleNrhaApprovedClassChange} />
            ) : (
              <input disabled={!organization || !classes.length} value={code} onChange={(event) => setCode(event.target.value)} />
            )}
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input disabled={!organization || !classes.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais de juge", "Judge fee")}
            <input disabled={!organization || !classes.length} min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <PayoutSettingsFields
          locale={locale}
          addedMoney={addedMoney}
          currency={organization?.currency ?? "CAD"}
          disabled={!organization || !classes.length}
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
            <select disabled={!organization || !classes.length} value={nrhaClassType} onChange={(event) => setNrhaClassType(event.target.value)}>
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
          <textarea disabled={!organization || !classes.length} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !classes.length} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer la classe", "Create class")}
        </button>
      </form>
    </section>
  );
}


export { DivisionForm };
