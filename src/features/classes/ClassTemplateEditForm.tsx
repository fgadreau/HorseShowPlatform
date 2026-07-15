import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions, SearchSelect } from "../../components/ui";
import { findById, numericValue } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { updateClassTemplate } from "../../services/supabaseServices";
import type { BackNumberPolicy, BlockTemplate, ClassTemplate, Discipline, OrganizationDiscipline, PayoutScheduleType, SanctioningBody } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { governingBodyAssignmentsFromSelection, hasSelectedGoverningBodyCode, nrhaClassTypes, eligibilityRulesFromNotes, eligibilityNotesFromRules, nrhaClassTypeFromAssignments, nrhaEligibilityPolicyFromAssignments, applyNrhaApprovedClassChoice, NrhaApprovedClassSelect } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { PayoutSettingsFields } from "./PayoutSettingsFields";
import { DisciplineSelect } from "./DisciplineSelect";

function ClassTemplateEditForm({
  locale = "fr",
  blockTemplates,
  classTemplate,
  disciplines,
  organizationDisciplines,
  sanctioningBodies,
  onCancel,
  onUpdateClassTemplate,
}: {
  locale?: Locale;
  blockTemplates: BlockTemplate[];
  classTemplate: ClassTemplate;
  disciplines: Discipline[];
  organizationDisciplines: OrganizationDiscipline[];
  sanctioningBodies: SanctioningBody[];
  onCancel: () => void;
  onUpdateClassTemplate: (id: string, input: Parameters<typeof updateClassTemplate>[1]) => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState(classTemplate.block_template_id);
  const [organizationDisciplineId, setOrganizationDisciplineId] = useState(classTemplate.organization_discipline_id);
  const [name, setName] = useState(classTemplate.name);
  const [code, setCode] = useState(classTemplate.code ?? "");
  const [entryFee, setEntryFee] = useState(classTemplate.default_entry_fee == null ? "" : String(classTemplate.default_entry_fee));
  const [judgeFee, setJudgeFee] = useState(classTemplate.default_judge_fee == null ? "" : String(classTemplate.default_judge_fee));
  const [payoutScheduleType, setPayoutScheduleType] = useState<PayoutScheduleType>(classTemplate.default_payout_schedule_type ?? "none");
  const [addedMoney, setAddedMoney] = useState(classTemplate.default_added_money == null ? "" : String(classTemplate.default_added_money));
  const [retainagePercent, setRetainagePercent] = useState(classTemplate.default_retainage_percent == null ? "" : String(classTemplate.default_retainage_percent));
  const [trophyOrPlaqueFee, setTrophyOrPlaqueFee] = useState(classTemplate.default_trophy_or_plaque_fee == null ? "" : String(classTemplate.default_trophy_or_plaque_fee));
  const [sanctioningFeePercent, setSanctioningFeePercent] = useState(
    classTemplate.default_sanctioning_fee_percent == null ? "" : String(classTemplate.default_sanctioning_fee_percent),
  );
  const [payoutRules, setPayoutRules] = useState<Record<string, unknown>>(classTemplate.default_payout_rules ?? {});
  const [payoutNotes, setPayoutNotes] = useState(classTemplate.default_payout_notes ?? "");
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(classTemplate.eligibility_rules));
  const [governingBodyIds, setGoverningBodyIds] = useState<string[]>(classTemplate.governing_body_assignments.map((assignment) => assignment.governing_body_id));
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>(classTemplate.back_number_policy_override ?? "horse");
  const [nrhaClassType, setNrhaClassType] = useState(nrhaClassTypeFromAssignments(classTemplate.governing_body_assignments));
  const initialEligibilityPolicy = nrhaEligibilityPolicyFromAssignments(classTemplate.governing_body_assignments);
  const [eligibilityCacheTtlHours, setEligibilityCacheTtlHours] = useState(initialEligibilityPolicy.cacheTtlHours);
  const [sourceUnavailablePolicy, setSourceUnavailablePolicy] = useState<"block" | "allow_with_warning">(initialEligibilityPolicy.sourceUnavailablePolicy);
  const [busy, setBusy] = useState(false);
  const selectedTemplate = findById(blockTemplates, templateId);
  const classIsNrha = hasSelectedGoverningBodyCode(governingBodyIds, sanctioningBodies, "NRHA");

  function handleGoverningBodyIds(nextIds: string[]) {
    setGoverningBodyIds(nextIds);

    if (!hasSelectedGoverningBodyCode(nextIds, sanctioningBodies, "NRHA")) {
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

    if (!selectedTemplate || !organizationDisciplineId) {
      return;
    }

    setBusy(true);

    try {
      await onUpdateClassTemplate(classTemplate.id, {
        block_template_id: selectedTemplate.id,
        organization_discipline_id: organizationDisciplineId,
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
        governing_body_assignments: governingBodyAssignmentsFromSelection({
          selectedIds: governingBodyIds,
          sanctioningBodies,
          existingAssignments: classTemplate.governing_body_assignments,
          classCode: code,
          nrhaEligibilityProfileCode: nrhaClassType,
          eligibilityCacheTtlHours,
          sourceUnavailablePolicy,
        }),
        back_number_policy_override: backNumberPolicy,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
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
          <p>{classTemplate.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Bloc récurrent", "Recurring block")}
          <SearchSelect
            items={blockTemplates.map((template) => ({ id: template.id, label: template.name, detail: template.category ?? template.block_label ?? "" }))}
            placeholder={uiText(locale, "Rechercher un bloc récurrent", "Search recurring block")}
            value={templateId}
            onChange={setTemplateId}
          />
        </label>
        <DisciplineSelect
          locale={locale}
          disciplines={disciplines}
          organizationDisciplines={organizationDisciplines}
          value={organizationDisciplineId}
          onChange={setOrganizationDisciplineId}
        />
        <SanctioningFields
          locale={locale}
          backNumberPolicy={backNumberPolicy}
          label={uiText(locale, "Sanctions de la classe", "Class sanctioning")}
          sanctioningBodies={sanctioningBodies}
          governingBodyIds={governingBodyIds}
          eligibilityCacheTtlHours={eligibilityCacheTtlHours}
          sourceUnavailablePolicy={sourceUnavailablePolicy}
          onBackNumberPolicyChange={setBackNumberPolicy}
          onGoverningBodyIdsChange={handleGoverningBodyIds}
          onEligibilityCacheTtlHoursChange={setEligibilityCacheTtlHours}
          onSourceUnavailablePolicyChange={setSourceUnavailablePolicy}
        />
        <div className="form-grid">
          <label>
            {uiText(locale, "Nom de classe", "Class name")}
            <input required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {classIsNrha ? uiText(locale, "Classe NRHA", "NRHA class") : "Code"}
            {classIsNrha ? <NrhaApprovedClassSelect locale={locale} value={code} onChange={handleNrhaApprovedClassChange} /> : <input value={code} onChange={(event) => setCode(event.target.value)} />}
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
          className={name}
          entryFee={entryFee}
          isNrha={classIsNrha}
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
        {classIsNrha ? (
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
        <FormActions busy={busy || !selectedTemplate || !organizationDisciplineId} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

export { ClassTemplateEditForm };
