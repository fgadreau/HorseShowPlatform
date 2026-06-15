import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions, SearchSelect } from "../../components/ui";
import { findById, numericValue } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { updateClassTemplateDivision } from "../../services/supabaseServices";
import type { ClassTemplate, ClassTemplateDivision, PayoutScheduleType, SanctioningBody } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { isNrhaSanctioned, sanctionLabel, nrhaClassTypes, eligibilityRulesFromNotes, eligibilityNotesFromRules, nrhaClassTypeFromRules, applyNrhaApprovedClassChoice, NrhaApprovedClassSelect } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { PayoutSettingsFields } from "./PayoutSettingsFields";

function ClassTemplateDivisionEditForm({
  locale = "fr",
  classTemplates,
  classTemplateDivision,
  sanctioningBodies,
  onCancel,
  onUpdateClassTemplateDivision,
}: {
  locale?: Locale;
  classTemplates: ClassTemplate[];
  classTemplateDivision: ClassTemplateDivision;
  sanctioningBodies: SanctioningBody[];
  onCancel: () => void;
  onUpdateClassTemplateDivision: (id: string, input: Parameters<typeof updateClassTemplateDivision>[1]) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState(classTemplateDivision.class_template_id);
  const [name, setName] = useState(classTemplateDivision.name);
  const [code, setCode] = useState(classTemplateDivision.code ?? "");
  const [entryFee, setEntryFee] = useState(classTemplateDivision.default_entry_fee == null ? "" : String(classTemplateDivision.default_entry_fee));
  const [judgeFee, setJudgeFee] = useState(classTemplateDivision.default_judge_fee == null ? "" : String(classTemplateDivision.default_judge_fee));
  const [payoutScheduleType, setPayoutScheduleType] = useState<PayoutScheduleType>(classTemplateDivision.default_payout_schedule_type ?? "none");
  const [addedMoney, setAddedMoney] = useState(classTemplateDivision.default_added_money == null ? "" : String(classTemplateDivision.default_added_money));
  const [retainagePercent, setRetainagePercent] = useState(classTemplateDivision.default_retainage_percent == null ? "" : String(classTemplateDivision.default_retainage_percent));
  const [trophyOrPlaqueFee, setTrophyOrPlaqueFee] = useState(classTemplateDivision.default_trophy_or_plaque_fee == null ? "" : String(classTemplateDivision.default_trophy_or_plaque_fee));
  const [sanctioningFeePercent, setSanctioningFeePercent] = useState(
    classTemplateDivision.default_sanctioning_fee_percent == null ? "" : String(classTemplateDivision.default_sanctioning_fee_percent),
  );
  const [payoutRules, setPayoutRules] = useState<Record<string, unknown>>(classTemplateDivision.default_payout_rules ?? {});
  const [payoutNotes, setPayoutNotes] = useState(classTemplateDivision.default_payout_notes ?? "");
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(classTemplateDivision.eligibility_rules));
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[]>(classTemplateDivision.sanctioning_body_codes ?? []);
  const [nrhaClassType, setNrhaClassType] = useState(nrhaClassTypeFromRules(classTemplateDivision.eligibility_rules));
  const [busy, setBusy] = useState(false);
  const selectedTemplate = findById(classTemplates, templateId);
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

    if (!selectedTemplate) {
      return;
    }

    setBusy(true);

    try {
      await onUpdateClassTemplateDivision(classTemplateDivision.id, {
        class_template_id: selectedTemplate.id,
        name,
        code: code || null,
        default_entry_fee: numericValue(entryFee) ?? null,
        default_judge_fee: numericValue(judgeFee) ?? null,
        default_payout_schedule_type: payoutScheduleType,
        default_added_money: numericValue(addedMoney) ?? 0,
        default_retainage_percent: numericValue(retainagePercent) ?? null,
        default_trophy_or_plaque_fee: numericValue(trophyOrPlaqueFee) ?? 0,
        default_sanctioning_fee_percent: numericValue(sanctioningFeePercent) ?? null,
        default_payout_rules: payoutRules,
        default_payout_notes: payoutNotes.trim() || null,
        sanctioning_body_codes: sanctioningBodyCodes,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes, divisionIsNrha && nrhaClassType ? { nrha_class_type: nrhaClassType } : {}),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel span-2">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier la classe récurrente", "Edit recurring class")}</h2>
          <p>{classTemplateDivision.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Bloc récurrent", "Recurring block")}
          <SearchSelect
            items={classTemplates.map((template) => ({ id: template.id, label: template.name, detail: sanctionLabel(template.sanctioning_body_codes, sanctioningBodies, locale) }))}
            placeholder={uiText(locale, "Rechercher un bloc récurrent", "Search recurring block")}
            value={templateId}
            onChange={setTemplateId}
          />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={selectedTemplate?.back_number_policy ?? "horse"}
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
        <FormActions busy={busy || !selectedTemplate} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

export { ClassTemplateDivisionEditForm };
