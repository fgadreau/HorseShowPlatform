import { useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { SearchSelect } from "../../components/ui";
import { findById, numericValue } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createClassTemplate } from "../../services/supabaseServices";
import type { BackNumberPolicy, BlockTemplate, Discipline, Organization, OrganizationDiscipline, OrganizationDisciplineGoverningBody, PayoutScheduleType, SanctioningBody } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { governingBodyAssignmentsFromSelection, hasSelectedGoverningBodyCode, nrhaClassTypes, eligibilityRulesFromNotes, applyNrhaApprovedClassChoice, NrhaApprovedClassSelect } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { PayoutSettingsFields } from "./PayoutSettingsFields";
import { DisciplineSelect, defaultOrganizationDisciplineId } from "./DisciplineSelect";

function ClassTemplateForm({
  locale = "fr",
  blockTemplates,
  defaultTemplateId,
  disciplines,
  organization,
  organizationDisciplines,
  organizationDisciplineGoverningBodies,
  sanctioningBodies,
  onCreateClassTemplate,
  onCreated,
}: {
  locale?: Locale;
  blockTemplates: BlockTemplate[];
  defaultTemplateId?: string;
  disciplines: Discipline[];
  organization: Organization | null;
  organizationDisciplines: OrganizationDiscipline[];
  organizationDisciplineGoverningBodies: OrganizationDisciplineGoverningBody[];
  sanctioningBodies: SanctioningBody[];
  onCreateClassTemplate: (input: Parameters<typeof createClassTemplate>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const [templateId, setTemplateId] = useState(defaultTemplateId ?? "");
  const [organizationDisciplineId, setOrganizationDisciplineId] = useState(() => defaultOrganizationDisciplineId(organizationDisciplines));
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
  const [governingBodyIds, setGoverningBodyIds] = useState<string[]>([]);
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>("horse");
  const [nrhaClassType, setNrhaClassType] = useState("");
  const [eligibilityCacheTtlHours, setEligibilityCacheTtlHours] = useState(6);
  const [sourceUnavailablePolicy, setSourceUnavailablePolicy] = useState<"block" | "allow_with_warning">("block");
  const [busy, setBusy] = useState(false);
  const selectedTemplateId = templateId || blockTemplates[0]?.id || "";
  const selectedTemplate = findById(blockTemplates, selectedTemplateId);
  const availableSanctioningBodies = sanctioningBodies.filter((body) => organizationDisciplineGoverningBodies.some((link) => link.organization_discipline_id === organizationDisciplineId && link.governing_body_id === body.id && link.is_active));
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

    if (!organization || !selectedTemplate || !organizationDisciplineId) {
      return;
    }

    setBusy(true);

    try {
      await onCreateClassTemplate({
        organization_id: organization.id,
        organization_discipline_id: organizationDisciplineId,
        block_template_id: selectedTemplate.id,
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
        governing_body_assignments: governingBodyAssignmentsFromSelection({
          selectedIds: governingBodyIds,
          sanctioningBodies: availableSanctioningBodies,
          classCode: code,
          nrhaEligibilityProfileCode: nrhaClassType,
          eligibilityCacheTtlHours,
          sourceUnavailablePolicy,
        }),
        back_number_policy_override: backNumberPolicy,
        eligibility_rules: eligibilityRulesFromNotes(eligibilityNotes),
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
      setGoverningBodyIds([]);
      setBackNumberPolicy("horse");
      setNrhaClassType("");
      setEligibilityCacheTtlHours(6);
      setSourceUnavailablePolicy("block");
      setOrganizationDisciplineId(defaultOrganizationDisciplineId(organizationDisciplines));
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
            disabled={!organization || !blockTemplates.length}
            items={blockTemplates.map((template) => ({ id: template.id, label: template.name, detail: template.category ?? template.block_label ?? "" }))}
            placeholder={uiText(locale, "Rechercher un bloc récurrent", "Search recurring block")}
            value={selectedTemplate?.id ?? ""}
            onChange={setTemplateId}
          />
        </label>
        <DisciplineSelect
          locale={locale}
          disciplines={disciplines}
          organizationDisciplines={organizationDisciplines}
          value={organizationDisciplineId}
          disabled={!organization || !blockTemplates.length}
          onChange={(value) => {
            setOrganizationDisciplineId(value);
            setGoverningBodyIds(organizationDisciplineGoverningBodies.filter((link) => link.organization_discipline_id === value && link.is_active && link.is_default).map((link) => link.governing_body_id));
          }}
        />
        <SanctioningFields
          locale={locale}
          backNumberPolicy={backNumberPolicy}
          disabled={!organization || !blockTemplates.length}
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
            <input disabled={!organization || !blockTemplates.length} required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {classIsNrha ? uiText(locale, "Classe NRHA", "NRHA class") : "Code"}
            {classIsNrha ? (
              <NrhaApprovedClassSelect locale={locale} disabled={!organization || !blockTemplates.length} value={code} onChange={handleNrhaApprovedClassChange} />
            ) : (
              <input disabled={!organization || !blockTemplates.length} value={code} onChange={(event) => setCode(event.target.value)} />
            )}
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input disabled={!organization || !blockTemplates.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais de juge", "Judge fee")}
            <input disabled={!organization || !blockTemplates.length} min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <PayoutSettingsFields
          locale={locale}
          addedMoney={addedMoney}
          currency={organization?.currency ?? "CAD"}
          disabled={!organization || !blockTemplates.length}
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
            <select disabled={!organization || !blockTemplates.length} value={nrhaClassType} onChange={(event) => setNrhaClassType(event.target.value)}>
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
          <textarea disabled={!organization || !blockTemplates.length} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !blockTemplates.length || !organizationDisciplineId} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer la classe récurrente", "Create recurring class")}
        </button>
      </form>
    </section>
  );
}

export { ClassTemplateForm };
