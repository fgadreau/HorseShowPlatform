import { useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { SearchSelect } from "../../components/ui";
import { findById, numericValue } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createClassTemplateDivision } from "../../services/supabaseServices";
import type { ClassTemplate, Organization, PayoutScheduleType, SanctioningBody } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { isNrhaSanctioned, sanctionLabel, nrhaClassTypes, eligibilityRulesFromNotes, applyNrhaApprovedClassChoice, NrhaApprovedClassSelect } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { PayoutSettingsFields } from "./PayoutSettingsFields";

function ClassTemplateDivisionForm({
  locale = "fr",
  classTemplates,
  defaultTemplateId,
  organization,
  sanctioningBodies,
  onCreateClassTemplateDivision,
  onCreated,
}: {
  locale?: Locale;
  classTemplates: ClassTemplate[];
  defaultTemplateId?: string;
  organization: Organization | null;
  sanctioningBodies: SanctioningBody[];
  onCreateClassTemplateDivision: (input: Parameters<typeof createClassTemplateDivision>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? "");
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
  const [eligibilityNotes, setEligibilityNotes] = useState("");
  const [sanctioningBodyCodes, setSanctioningBodyCodes] = useState<string[] | null>(null);
  const [nrhaClassType, setNrhaClassType] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedTemplateId = templateId || classTemplates[0]?.id || "";
  const selectedTemplate = findById(classTemplates, selectedTemplateId);
  const selectedSanctioningBodyCodes = sanctioningBodyCodes ?? selectedTemplate?.sanctioning_body_codes ?? [];
  const divisionIsNrha = isNrhaSanctioned(selectedSanctioningBodyCodes);

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

    if (!organization || !selectedTemplate) {
      return;
    }

    setBusy(true);

    try {
      await onCreateClassTemplateDivision({
        organization_id: organization.id,
        class_template_id: selectedTemplate.id,
        name,
        code,
        default_entry_fee: numericValue(entryFee),
        default_judge_fee: numericValue(judgeFee),
        default_payout_schedule_type: payoutScheduleType,
        default_added_money: numericValue(addedMoney) ?? 0,
        default_retainage_percent: numericValue(retainagePercent) ?? null,
        default_trophy_or_plaque_fee: numericValue(trophyOrPlaqueFee) ?? 0,
        default_sanctioning_fee_percent: numericValue(sanctioningFeePercent) ?? null,
        default_payout_rules: payoutRules,
        default_payout_notes: payoutNotes.trim() || null,
        sanctioning_body_codes: selectedSanctioningBodyCodes,
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
      setEligibilityNotes("");
      setSanctioningBodyCodes(null);
      setNrhaClassType("");
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Classe de bloc récurrent", "Recurring block class")}</h2>
          <p>{selectedTemplate ? selectedTemplate.name : uiText(locale, "Crée un bloc récurrent d'abord.", "Create a recurring block first.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Bloc récurrent", "Recurring block")}
          <SearchSelect
            disabled={!organization || !classTemplates.length}
            items={classTemplates.map((template) => ({ id: template.id, label: template.name, detail: sanctionLabel(template.sanctioning_body_codes, sanctioningBodies, locale) }))}
            placeholder={uiText(locale, "Rechercher un bloc récurrent", "Search recurring block")}
            value={selectedTemplate?.id ?? ""}
            onChange={setTemplateId}
          />
        </label>
        <SanctioningFields
          locale={locale}
          backNumberPolicy={selectedTemplate?.back_number_policy ?? "horse"}
          disabled={!organization || !classTemplates.length}
          hideBackNumberPolicy
          label={uiText(locale, "Sanctions de la classe", "Class sanctioning")}
          sanctioningBodies={sanctioningBodies}
          sanctioningBodyCodes={selectedSanctioningBodyCodes}
          onBackNumberPolicyChange={() => undefined}
          onSanctioningBodyCodesChange={handleDivisionSanctioningBodyCodes}
        />
        <div className="form-grid">
          <label>
            {uiText(locale, "Nom de classe", "Class name")}
            <input disabled={!organization || !classTemplates.length} required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {divisionIsNrha ? uiText(locale, "Classe NRHA", "NRHA class") : "Code"}
            {divisionIsNrha ? (
              <NrhaApprovedClassSelect locale={locale} disabled={!organization || !classTemplates.length} value={code} onChange={handleNrhaApprovedClassChange} />
            ) : (
              <input disabled={!organization || !classTemplates.length} value={code} onChange={(event) => setCode(event.target.value)} />
            )}
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input disabled={!organization || !classTemplates.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais de juge", "Judge fee")}
            <input disabled={!organization || !classTemplates.length} min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <PayoutSettingsFields
          locale={locale}
          addedMoney={addedMoney}
          currency={organization?.currency ?? "CAD"}
          disabled={!organization || !classTemplates.length}
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
            <select disabled={!organization || !classTemplates.length} value={nrhaClassType} onChange={(event) => setNrhaClassType(event.target.value)}>
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
          <textarea disabled={!organization || !classTemplates.length} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !classTemplates.length} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer la classe récurrente", "Create recurring class")}
        </button>
      </form>
    </section>
  );
}

export { ClassTemplateDivisionForm };
