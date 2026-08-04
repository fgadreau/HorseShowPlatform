import { useCallback, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ContactPicker, FormActions, SearchSelect } from "../../components/ui";
import { contactLabel, findById, formatCurrency, formatDate, horseLabel, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { buildEntryShowReadiness } from "../../lib/readiness";
import { createContact, createHorse, createUploadedHorseHealthDocument, updateEntry, verifyGvlCogginsDocument, verifyNrhaEligibility } from "../../services/supabaseServices";
import type { Block, Contact, ContactExternalIdentifier, ContactRole, ClassRecord, Entry, ExternalCredentialIssuer, Horse, HorseExternalIdentifier, HorseHealthDocument, Invoice, NrhaRiderRanking, Organization, OrganizationExternalCredentialRequirement, Show, ShowDay } from "../../types/domain";
import { uiText, InlineHealthMessage, ReadinessChecklist, entryNumberValue } from "../dashboard/shared";
import { healthComplianceReasonSummary, healthComplianceStatusLabel, healthComplianceTone, useHorseHealthComplianceOverview } from "../health/HealthComplianceSummary";
import { buildEntryDeadlineReadiness, buildEntryProgramLimitReadiness, inactiveProgramEntryStatuses, showDayLabel } from "../classes/classUtils";
import { ClassEligibilityCheck, sameClassEligibilityGate, withClassEligibilityReadiness, type ClassEligibilityGate } from "./NrhaEligibilityCheck";
import { entryClassBlockDetail, entryClassLabel } from "./entryDisplay";

function EntryEditForm({
  locale = "fr",
  blocks,
  contacts,
  contactExternalIdentifiers,
  contactRoles,
  classes,
  entries,
  entry,
  externalCredentialIssuers,
  horseExternalIdentifiers,
  horseHealthDocuments,
  horses,
  membershipRequirements,
  nrhaRiderRankings,
  organization,
  profileId,
  shows,
  onCancel,
  onCreateContact,
  onUpdateEntry,
  onVerifyNrhaEligibility,
}: {
  locale?: Locale;
  blocks: Block[];
  contacts: Contact[];
  contactExternalIdentifiers: ContactExternalIdentifier[];
  contactRoles: ContactRole[];
  classes: ClassRecord[];
  entries: Entry[];
  entry: Entry;
  externalCredentialIssuers: ExternalCredentialIssuer[];
  horseExternalIdentifiers: HorseExternalIdentifier[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalCredentialRequirement[];
  nrhaRiderRankings: NrhaRiderRanking[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCancel: () => void;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
  onVerifyNrhaEligibility: (input: Parameters<typeof verifyNrhaEligibility>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaEligibility>>>;
}) {
  const [horseId, setHorseId] = useState(entry.horse_id);
  const [classId, setClassId] = useState(entry.class_id);
  const [riderContactId, setRiderContactId] = useState(entry.rider_contact_id ?? "");
  const [payerContactId, setPayerContactId] = useState(entry.payer_contact_id);
  const [entryNumber, setEntryNumber] = useState(entry.entry_number == null ? "" : String(entry.entry_number));
  const [status, setStatus] = useState<Entry["status"]>(entry.status);
  const [baseFee, setBaseFee] = useState(entry.base_fee == null ? "" : String(entry.base_fee));
  const [nrhaEligibilityGate, setNrhaEligibilityGate] = useState<ClassEligibilityGate | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedHorse = findById(horses, horseId) ?? null;
  const selectedClass = findById(classes, classId) ?? null;
  const selectedBlock = selectedClass ? findById(blocks, selectedClass.block_id) ?? null : null;
  const selectedShow = findById(shows, entry.show_id) ?? null;
  const selectedOwnerContact = findById(contacts, selectedHorse?.primary_owner_contact_id) ?? null;
  const selectedRiderContact = findById(contacts, riderContactId) ?? null;
  const selectedNrhaRiderContact = selectedRiderContact ?? selectedOwnerContact;
  const selectedPayerContact = findById(contacts, payerContactId) ?? null;
  const skipsEntryReadiness = ["cancelled", "scratched", "scratched_pending_refund"].includes(status);
  const healthComplianceRevision = horseHealthDocuments.map((document) => `${document.id}:${document.status}:${document.updated_at}`).join("|");
  const healthComplianceOverview = useHorseHealthComplianceOverview({
    horseIds: selectedShow && organization ? horses.map((horse) => horse.id) : [],
    organizationId: selectedShow ? organization?.id : undefined,
    referenceDate: selectedShow?.start_date ?? "1970-01-01",
    refreshToken: healthComplianceRevision,
  });
  const healthComplianceByHorseId = useMemo(
    () => new Map(healthComplianceOverview.results.map((result) => [result.horse_id, result])),
    [healthComplianceOverview.results],
  );
  const selectedHealthCompliance = selectedHorse ? healthComplianceByHorseId.get(selectedHorse.id) ?? null : null;
  const entryReadiness = buildEntryShowReadiness({
    contactExternalIdentifiers,
    externalCredentialIssuers,
    healthCompliance: selectedHorse ? selectedHealthCompliance : undefined,
    healthComplianceLoading: Boolean(selectedHorse && healthComplianceOverview.loading),
    horse: selectedHorse,
    membershipRequirements,
    ownerContact: selectedOwnerContact,
    payerContact: selectedPayerContact,
    riderContact: selectedRiderContact,
    show: selectedShow,
    skipContactRequirements: skipsEntryReadiness,
    skipHorseHealth: skipsEntryReadiness,
  });
  const entryProgramLimitReadiness = buildEntryProgramLimitReadiness({
    classRecord: selectedClass,
    classes,
    entries,
    existingEntryId: entry.id,
    horse: selectedHorse,
    ownerContact: selectedOwnerContact,
    riderContact: selectedRiderContact,
    skip: skipsEntryReadiness,
  });
  const effectiveFee = numericValue(baseFee) ?? selectedClass?.entry_fee ?? null;
  const combinedEntryReadiness = withClassEligibilityReadiness(entryReadiness, nrhaEligibilityGate, locale);
  const nrhaEligibilityCanProceed = skipsEntryReadiness ? true : nrhaEligibilityGate?.canProceed ?? false;
  const nrhaEligibilityBlockingMessage =
    nrhaEligibilityGate?.applies && !nrhaEligibilityGate.canProceed
      ? nrhaEligibilityGate.message?.message ?? uiText(locale, "Vérification d'admissibilité requise.", "Eligibility check required.")
      : null;
  const canUpdate = Boolean(selectedHorse && selectedClass && payerContactId && entryReadiness.canProceed && entryProgramLimitReadiness.canProceed && nrhaEligibilityCanProceed);
  const entryHeaderMessage = entryReadiness.canProceed
    ? entryProgramLimitReadiness.canProceed
      ? nrhaEligibilityBlockingMessage ?? horseLabel(selectedHorse ?? undefined)
      : entryProgramLimitReadiness.message?.message ?? horseLabel(selectedHorse ?? undefined)
    : entryReadiness.message;
  const handleNrhaEligibilityStatusChange = useCallback((gate: ClassEligibilityGate) => {
    setNrhaEligibilityGate((currentGate) => (sameClassEligibilityGate(currentGate, gate) ? currentGate : gate));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canUpdate || !selectedHorse || !selectedClass || !payerContactId) {
      return;
    }

    setBusy(true);

    try {
      await onUpdateEntry(entry.id, {
        horse_id: selectedHorse.id,
        class_id: selectedClass.id,
        owner_contact_id: selectedHorse.primary_owner_contact_id,
        rider_contact_id: riderContactId || null,
        payer_contact_id: payerContactId,
        entry_number: entryNumberValue(entryNumber),
        status,
        base_fee: effectiveFee,
        total_fees: effectiveFee,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier l'inscription", "Edit entry")}</h2>
          <p>{entryHeaderMessage}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Cheval", "Horse")}
          <SearchSelect
            items={horses.map((horse) => {
              const compliance = healthComplianceByHorseId.get(horse.id);

              return {
                id: horse.id,
                label: horse.name,
                detail: `${contactLabel(findById(contacts, horse.primary_owner_contact_id))} - ${
                  compliance
                    ? `${healthComplianceStatusLabel(compliance.compliance_status, locale)} · ${healthComplianceReasonSummary(compliance, locale)}`
                    : healthComplianceOverview.loading
                      ? uiText(locale, "Vérification santé…", "Checking health…")
                      : uiText(locale, "Conformité santé indisponible", "Health compliance unavailable")
                }`,
              };
            })}
            placeholder={uiText(locale, "Rechercher un cheval", "Search horse")}
            value={horseId}
            onChange={setHorseId}
          />
        </label>
        <InlineHealthMessage
          value={
            selectedHealthCompliance
              ? {
                  tone: healthComplianceTone(selectedHealthCompliance.compliance_status) === "success" ? "success" : selectedHealthCompliance.can_proceed ? "info" : "error",
                  message: `${healthComplianceReasonSummary(selectedHealthCompliance, locale)} ${uiText(locale, "Référence", "Reference")}: ${selectedShow ? formatDate(selectedShow.start_date) : uiText(locale, "concours", "show")}.`,
                }
              : healthComplianceOverview.error
                ? { tone: "error", message: healthComplianceOverview.error }
                : healthComplianceOverview.loading && selectedHorse
                  ? { tone: "info", message: uiText(locale, "Calcul de la conformité santé…", "Calculating health compliance…") }
                  : null
          }
        />
        <label>
          {uiText(locale, "Classe", "Class")}
          <SearchSelect
            items={classes.map((classRecord) => {
              const block = findById(blocks, classRecord.block_id);
              const effectiveEntryFee = classRecord.entry_fee ?? null;

              return {
                id: classRecord.id,
                label: entryClassLabel(classRecord, locale),
                detail: [
                  entryClassBlockDetail(classRecord, blocks, locale),
                  effectiveEntryFee == null ? null : `${uiText(locale, "Inscription", "Entry")} ${formatCurrency(effectiveEntryFee, organization?.currency ?? "CAD")}`,
                  classRecord.judge_fee == null ? null : `${uiText(locale, "Juge", "Judge")} ${formatCurrency(classRecord.judge_fee, organization?.currency ?? "CAD")}`,
                ]
                  .filter(Boolean)
                  .join(" - "),
              };
            })}
            placeholder={uiText(locale, "Rechercher une classe", "Search class")}
            value={classId}
            onChange={setClassId}
          />
        </label>
        <InlineHealthMessage value={selectedClass ? entryProgramLimitReadiness.message : null} />
        <div className="form-grid">
          <ContactPicker
            allowEmpty
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            label={uiText(locale, "Cavalier", "Rider")}
            locale={locale}
            organization={organization}
            role="rider"
            value={riderContactId}
            onChange={setRiderContactId}
            onCreateContact={onCreateContact}
          />
          <ContactPicker
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            label={uiText(locale, "Payeur", "Payer")}
            locale={locale}
            organization={organization}
            role="payer"
            value={payerContactId}
            onChange={setPayerContactId}
            onCreateContact={onCreateContact}
          />
        </div>
        <ClassEligibilityCheck
          block={selectedBlock}
          contactExternalIdentifiers={contactExternalIdentifiers}
          classRecord={selectedClass}
          externalCredentialIssuers={externalCredentialIssuers}
          horse={selectedHorse ?? null}
          horseExternalIdentifiers={horseExternalIdentifiers}
          locale={locale}
          nrhaRiderRankings={nrhaRiderRankings}
          organization={organization}
          onStatusChange={handleNrhaEligibilityStatusChange}
          riderContact={selectedNrhaRiderContact}
          skip={skipsEntryReadiness}
          show={selectedShow}
          onVerifyNrhaEligibility={onVerifyNrhaEligibility}
        />
        <ReadinessChecklist readiness={selectedHorse ? combinedEntryReadiness : null} />
        <div className="form-grid">
          <label>
            {uiText(locale, "Statut", "Status")}
            <select value={status} onChange={(event) => setStatus(event.target.value as Entry["status"])}>
              <option value="draft">{uiText(locale, "Brouillon", "Draft")}</option>
              <option value="pending_checkout">{uiText(locale, "Paiement en attente", "Pending checkout")}</option>
              <option value="active">{uiText(locale, "Active", "Active")}</option>
              <option value="scratched_pending_refund">{uiText(locale, "Scratch avec remboursement en attente", "Scratch pending refund")}</option>
              <option value="scratched">{uiText(locale, "Scratch", "Scratched")}</option>
              <option value="completed">{uiText(locale, "Terminée", "Completed")}</option>
              <option value="cancelled">{uiText(locale, "Annulée", "Cancelled")}</option>
            </select>
          </label>
          <label>
            {uiText(locale, "Numéro de dossard", "Back number")}
            <input min="1" step="1" type="number" value={entryNumber} onChange={(event) => setEntryNumber(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Frais de base", "Base fee")}
            <input min="0" step="0.01" type="number" value={baseFee} onChange={(event) => setBaseFee(event.target.value)} />
          </label>
        </div>
        <FormActions busy={busy || !canUpdate} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

export { EntryEditForm };
