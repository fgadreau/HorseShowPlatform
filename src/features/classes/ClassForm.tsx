import { useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { SearchSelect } from "../../components/ui";
import { findById, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createClass } from "../../services/supabaseServices";
import type { BackNumberPolicy, Block, Discipline, Organization, OrganizationDiscipline, OrganizationDisciplineGoverningBody, PayoutScheduleType, SanctioningBody, Show } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { governingBodyAssignmentsFromSelection, hasSelectedGoverningBodyCode, nrhaClassTypes, eligibilityRulesFromNotes, eligibilityNotesFromRules, applyNrhaApprovedClassChoice, NrhaApprovedClassSelect } from "./classUtils";
import { SanctioningFields } from "./SanctioningFields";
import { PayoutSettingsFields } from "./PayoutSettingsFields";
import { DisciplineSelect, defaultOrganizationDisciplineId } from "./DisciplineSelect";

function ClassForm({
  locale = "fr",
  blocks,
  defaultBlockId,
  disciplines,
  organization,
  organizationDisciplines,
  organizationDisciplineGoverningBodies,
  sanctioningBodies,
  shows,
  onCreateClass,
  onCreated,
}: {
  locale?: Locale;
  blocks: Block[];
  defaultBlockId?: string;
  disciplines: Discipline[];
  organization: Organization | null;
  organizationDisciplines: OrganizationDiscipline[];
  organizationDisciplineGoverningBodies: OrganizationDisciplineGoverningBody[];
  sanctioningBodies: SanctioningBody[];
  shows: Show[];
  onCreateClass: (input: Parameters<typeof createClass>[0]) => Promise<void>;
  onCreated?: () => void;
}) {
  const initialOrganizationDisciplineId = defaultOrganizationDisciplineId(organizationDisciplines);
  const [blockId, setBlockId] = useState(defaultBlockId ?? "");
  const [organizationDisciplineId, setOrganizationDisciplineId] = useState(() => initialOrganizationDisciplineId);
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
  const [governingBodyIds, setGoverningBodyIds] = useState<string[]>(() => organizationDisciplineGoverningBodies.filter((link) => link.organization_discipline_id === initialOrganizationDisciplineId && link.is_active && link.is_default).map((link) => link.governing_body_id));
  const [backNumberPolicy, setBackNumberPolicy] = useState<BackNumberPolicy>("horse");
  const [nrhaClassType, setNrhaClassType] = useState("");
  const [eligibilityCacheTtlHours, setEligibilityCacheTtlHours] = useState(6);
  const [sourceUnavailablePolicy, setSourceUnavailablePolicy] = useState<"block" | "allow_with_warning">("block");
  const [eligibilityNotes, setEligibilityNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const selectedBlock = findById(blocks, blockId) ?? null;
  const selectedShow = selectedBlock ? findById(shows, selectedBlock.show_id) : null;
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

    if (!organization || !selectedBlock || !organizationDisciplineId) {
      return;
    }

    setBusy(true);

    try {
      await onCreateClass({
        organization_id: organization.id,
        show_id: selectedBlock.show_id,
        block_id: selectedBlock.id,
        organization_discipline_id: organizationDisciplineId,
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
      setGoverningBodyIds(organizationDisciplineGoverningBodies.filter((link) => link.organization_discipline_id === initialOrganizationDisciplineId && link.is_active && link.is_default).map((link) => link.governing_body_id));
      setBackNumberPolicy("horse");
      setNrhaClassType("");
      setEligibilityCacheTtlHours(6);
      setSourceUnavailablePolicy("block");
      setEligibilityNotes("");
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
          <h2>{uiText(locale, "Nouvelle classe", "New class")}</h2>
          <p>{selectedShow ? selectedShow.name : uiText(locale, "Crée un bloc d'abord.", "Create a block first.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Bloc", "Block")}
          <SearchSelect
            disabled={!organization || !blocks.length}
            items={blocks.map((block) => ({ id: block.id, label: block.name, detail: showLabel(findById(shows, block.show_id)) }))}
            placeholder={uiText(locale, "Rechercher un bloc", "Search block")}
            value={selectedBlock?.id ?? ""}
            onChange={setBlockId}
          />
        </label>
        <DisciplineSelect
          locale={locale}
          disciplines={disciplines}
          organizationDisciplines={organizationDisciplines}
          value={organizationDisciplineId}
          disabled={!organization || !blocks.length}
          onChange={(value) => {
            setOrganizationDisciplineId(value);
            setGoverningBodyIds(organizationDisciplineGoverningBodies.filter((link) => link.organization_discipline_id === value && link.is_active && link.is_default).map((link) => link.governing_body_id));
          }}
        />
        <SanctioningFields
          locale={locale}
          backNumberPolicy={backNumberPolicy}
          disabled={!organization || !blocks.length}
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
            <input disabled={!organization || !blocks.length} required value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {classIsNrha ? uiText(locale, "Classe NRHA", "NRHA class") : "Code"}
            {classIsNrha ? (
              <NrhaApprovedClassSelect locale={locale} disabled={!organization || !blocks.length} value={code} onChange={handleNrhaApprovedClassChange} />
            ) : (
              <input disabled={!organization || !blocks.length} value={code} onChange={(event) => setCode(event.target.value)} />
            )}
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Frais d'inscription", "Entry fee")}
            <input disabled={!organization || !blocks.length} min="0" step="0.01" type="number" value={entryFee} onChange={(event) => setEntryFee(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais de juge", "Judge fee")}
            <input disabled={!organization || !blocks.length} min="0" step="0.01" type="number" value={judgeFee} onChange={(event) => setJudgeFee(event.target.value)} />
          </label>
        </div>
        <PayoutSettingsFields
          locale={locale}
          addedMoney={addedMoney}
          currency={organization?.currency ?? "CAD"}
          disabled={!organization || !blocks.length}
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
            <select disabled={!organization || !blocks.length} value={nrhaClassType} onChange={(event) => setNrhaClassType(event.target.value)}>
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
          <textarea disabled={!organization || !blocks.length} rows={3} value={eligibilityNotes} onChange={(event) => setEligibilityNotes(event.target.value)} />
        </label>
        <button className="primary-button" disabled={busy || !organization || !blocks.length || !organizationDisciplineId} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer la classe", "Create class")}
        </button>
      </form>
    </section>
  );
}


export { ClassForm };
