import { useState } from "react";
import type { FormEvent } from "react";
import { FormActions, SearchSelect } from "../../components/ui";
import { findById, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { updateClass } from "../../services/supabaseServices";
import type { BackNumberPolicy, Block, ClassRecord, Discipline, OrganizationDiscipline, OrganizationDisciplineGoverningBody, PayoutScheduleType, SanctioningBody } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { governingBodyAssignmentsFromSelection, hasSelectedGoverningBodyCode, nrhaClassTypes, eligibilityRulesFromNotes, eligibilityNotesFromRules, nrhaClassTypeFromAssignments, nrhaEligibilityPolicyFromAssignments, applyNrhaApprovedClassChoice, NrhaApprovedClassSelect } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { PayoutSettingsFields } from "./PayoutSettingsFields";
import { DisciplineSelect } from "./DisciplineSelect";

function ClassEditForm({
  locale = "fr",
  blocks,
  classRecord,
  disciplines,
  organizationDisciplines,
  organizationDisciplineGoverningBodies,
  sanctioningBodies,
  onCancel,
  onUpdateClass,
}: {
  locale?: Locale;
  blocks: Block[];
  classRecord: ClassRecord;
  disciplines: Discipline[];
  organizationDisciplines: OrganizationDiscipline[];
  organizationDisciplineGoverningBodies: OrganizationDisciplineGoverningBody[];
  sanctioningBodies: SanctioningBody[];
  onCancel: () => void;
  onUpdateClass: (id: string, input: Parameters<typeof updateClass>[1]) => Promise<void>;
}) {
  const [classId, setClassId] = useState(classRecord.block_id);
  const [organizationDisciplineId, setOrganizationDisciplineId] = useState(classRecord.organization_discipline_id);
  const [name, setName] = useState(classRecord.name);
  const [code, setCode] = useState(classRecord.code ?? "");
  const [entryFee, setEntryFee] = useState(classRecord.entry_fee == null ? "" : String(classRecord.entry_fee));
  const [judgeFee, setJudgeFee] = useState(classRecord.judge_fee == null ? "" : String(classRecord.judge_fee));
  const [payoutScheduleType, setPayoutScheduleType] = useState<PayoutScheduleType>(classRecord.payout_schedule_type ?? "none");
  const [addedMoney, setAddedMoney] = useState(classRecord.added_money == null ? "" : String(classRecord.added_money));
  const [retainagePercent, setRetainagePercent] = useState(classRecord.retainage_percent == null ? "" : String(classRecord.retainage_percent));
  const [trophyOrPlaqueFee, setTrophyOrPlaqueFee] = useState(classRecord.trophy_or_plaque_fee == null ? "" : String(classRecord.trophy_or_plaque_fee));
  const [sanctioningFeePercent, setSanctioningFeePercent] = useState(classRecord.sanctioning_fee_percent == null ? "" : String(classRecord.sanctioning_fee_percent));
  const [payoutRules, setPayoutRules] = useState<Record<string, unknown>>(classRecord.payout_rules ?? {});
  const [payoutNotes, setPayoutNotes] = useState(classRecord.payout_notes ?? "");
  const [governingBodyIds, setGoverningBodyIds] = useState<string[]>(classRecord.governing_body_assignments.map((assignment) => assignment.governing_body_id));
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>(classRecord.back_number_policy_override ?? "horse");
  const [nrhaClassType, setNrhaClassType] = useState(nrhaClassTypeFromAssignments(classRecord.governing_body_assignments));
  const initialEligibilityPolicy = nrhaEligibilityPolicyFromAssignments(classRecord.governing_body_assignments);
  const [eligibilityCacheTtlHours, setEligibilityCacheTtlHours] = useState(initialEligibilityPolicy.cacheTtlHours);
  const [sourceUnavailablePolicy, setSourceUnavailablePolicy] = useState<"block" | "allow_with_warning">(initialEligibilityPolicy.sourceUnavailablePolicy);
  const [eligibilityNotes, setEligibilityNotes] = useState(eligibilityNotesFromRules(classRecord.eligibility_rules));
  const [busy, setBusy] = useState(false);
  const selectedClass = findById(blocks, classId);
  const availableSanctioningBodies = sanctioningBodies.filter((body) =>
    governingBodyIds.includes(body.id)
    || organizationDisciplineGoverningBodies.some((link) => link.organization_discipline_id === organizationDisciplineId && link.governing_body_id === body.id && link.is_active),
  );
  const classIsNrha = hasSelectedGoverningBodyCode(governingBodyIds, availableSanctioningBodies, "NRHA");

  function handleGoverningBodyIds(nextIds: string[]) {
    setGoverningBodyIds(nextIds);

    if (!hasSelectedGoverningBodyCode(nextIds, availableSanctioningBodies, "NRHA")) {
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

    if (!selectedClass || !organizationDisciplineId) {
      return;
    }

    setBusy(true);

    try {
      await onUpdateClass(classRecord.id, {
        block_id: selectedClass.id,
        organization_discipline_id: organizationDisciplineId,
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
        governing_body_assignments: governingBodyAssignmentsFromSelection({
          selectedIds: governingBodyIds,
          sanctioningBodies,
          existingAssignments: classRecord.governing_body_assignments,
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
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier la classe", "Edit class")}</h2>
          <p>{classRecord.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Bloc", "Block")}
          <SearchSelect
            items={blocks.map((block) => ({ id: block.id, label: block.name, detail: block.display_label ?? "" }))}
            placeholder={uiText(locale, "Rechercher un bloc", "Search block")}
            value={classId}
            onChange={setClassId}
          />
        </label>
        <DisciplineSelect
          locale={locale}
          disciplines={disciplines}
          organizationDisciplines={organizationDisciplines}
          value={organizationDisciplineId}
          onChange={(value) => {
            setOrganizationDisciplineId(value);
            setGoverningBodyIds(organizationDisciplineGoverningBodies.filter((link) => link.organization_discipline_id === value && link.is_active && link.is_default).map((link) => link.governing_body_id));
          }}
        />
        <SanctioningFields
          locale={locale}
          backNumberPolicy={backNumberPolicy}
          label={uiText(locale, "Sanctions de la classe", "Class sanctioning")}
          sanctioningBodies={availableSanctioningBodies}
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
        <FormActions busy={busy || !selectedClass || !organizationDisciplineId} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}


export { ClassEditForm };
