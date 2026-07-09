import { useState } from "react";
import type { FormEvent } from "react";
import { ContactPicker, FormActions, SearchSelect } from "../../components/ui";
import { contactLabel, findById, formatCurrency, formatDate, horseLabel, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { buildEntryShowReadiness } from "../../lib/readiness";
import { createContact, createHorse, createUploadedHorseHealthDocument, updateEntry, verifyGvlCogginsDocument, verifyNrhaEligibility } from "../../services/supabaseServices";
import type { ClassRecord, Contact, ContactExternalMembership, ContactRole, Division, Entry, ExternalOrganization, Horse, HorseExternalMembership, HorseHealthDocument, Invoice, Organization, OrganizationExternalMembershipRequirement, Show, ShowDay } from "../../types/domain";
import { uiText, InlineHealthMessage, ReadinessChecklist, getHorseHealthValidity, horseHealthValidityMessage, horseHealthValidityTone, entryNumberValue } from "../dashboard/shared";
import { buildEntryDeadlineReadiness, buildEntryProgramLimitReadiness, inactiveProgramEntryStatuses, showDayLabel } from "../classes/classUtils";
import { NrhaEligibilityCheck } from "./NrhaEligibilityCheck";
import { entryDivisionBlockDetail, entryDivisionLabel } from "./entryDisplay";

function EntryEditForm({
  locale = "fr",
  classes,
  contacts,
  contactExternalMemberships,
  contactRoles,
  divisions,
  entries,
  entry,
  externalOrganizations,
  horseExternalMemberships,
  horseHealthDocuments,
  horses,
  membershipRequirements,
  organization,
  profileId,
  shows,
  onCancel,
  onCreateContact,
  onUpdateEntry,
  onVerifyNrhaEligibility,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactRoles: ContactRole[];
  divisions: Division[];
  entries: Entry[];
  entry: Entry;
  externalOrganizations: ExternalOrganization[];
  horseExternalMemberships: HorseExternalMembership[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCancel: () => void;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
  onVerifyNrhaEligibility: (input: Parameters<typeof verifyNrhaEligibility>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaEligibility>>>;
}) {
  const [horseId, setHorseId] = useState(entry.horse_id);
  const [divisionId, setDivisionId] = useState(entry.division_id);
  const [riderContactId, setRiderContactId] = useState(entry.rider_contact_id ?? "");
  const [payerContactId, setPayerContactId] = useState(entry.payer_contact_id);
  const [entryNumber, setEntryNumber] = useState(entry.entry_number == null ? "" : String(entry.entry_number));
  const [status, setStatus] = useState<Entry["status"]>(entry.status);
  const [baseFee, setBaseFee] = useState(entry.base_fee == null ? "" : String(entry.base_fee));
  const [busy, setBusy] = useState(false);
  const selectedHorse = findById(horses, horseId) ?? null;
  const selectedDivision = findById(divisions, divisionId) ?? null;
  const selectedClass = selectedDivision ? findById(classes, selectedDivision.class_id) ?? null : null;
  const selectedShow = findById(shows, entry.show_id) ?? null;
  const selectedOwnerContact = findById(contacts, selectedHorse?.primary_owner_contact_id) ?? null;
  const selectedRiderContact = findById(contacts, riderContactId) ?? null;
  const selectedNrhaRiderContact = selectedRiderContact ?? selectedOwnerContact;
  const selectedPayerContact = findById(contacts, payerContactId) ?? null;
  const skipsEntryReadiness = ["cancelled", "scratched", "scratched_pending_refund"].includes(status);
  const selectedHealthValidity = selectedHorse
    ? getHorseHealthValidity({
        documents: horseHealthDocuments,
        horseId: selectedHorse.id,
        organization,
        referenceDate: selectedShow?.start_date ?? null,
      })
    : null;
  const entryReadiness = buildEntryShowReadiness({
    contactExternalMemberships,
    documents: horseHealthDocuments,
    externalOrganizations,
    horse: selectedHorse,
    membershipRequirements,
    organization,
    ownerContact: selectedOwnerContact,
    payerContact: selectedPayerContact,
    riderContact: selectedRiderContact,
    show: selectedShow,
    skipContactRequirements: skipsEntryReadiness,
    skipHorseHealth: skipsEntryReadiness,
  });
  const entryProgramLimitReadiness = buildEntryProgramLimitReadiness({
    division: selectedDivision,
    divisions,
    entries,
    existingEntryId: entry.id,
    horse: selectedHorse,
    ownerContact: selectedOwnerContact,
    riderContact: selectedRiderContact,
    skip: skipsEntryReadiness,
  });
  const effectiveFee = numericValue(baseFee) ?? selectedDivision?.entry_fee ?? selectedClass?.entry_fee ?? null;
  const canUpdate = Boolean(selectedHorse && selectedDivision && payerContactId && entryReadiness.canProceed && entryProgramLimitReadiness.canProceed);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canUpdate || !selectedHorse || !selectedDivision || !payerContactId) {
      return;
    }

    setBusy(true);

    try {
      await onUpdateEntry(entry.id, {
        horse_id: selectedHorse.id,
        division_id: selectedDivision.id,
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
          <p>{entryReadiness.canProceed ? entryProgramLimitReadiness.message?.message ?? horseLabel(selectedHorse ?? undefined) : entryReadiness.message}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Cheval", "Horse")}
          <SearchSelect
            items={horses.map((horse) => {
              const validity = getHorseHealthValidity({
                documents: horseHealthDocuments,
                horseId: horse.id,
                organization,
                referenceDate: selectedShow?.start_date ?? null,
              });

              return {
                id: horse.id,
                label: horse.name,
                detail: `${contactLabel(findById(contacts, horse.primary_owner_contact_id))} - ${horseHealthValidityMessage(validity)}`,
              };
            })}
            placeholder={uiText(locale, "Rechercher un cheval", "Search horse")}
            value={horseId}
            onChange={setHorseId}
          />
        </label>
        <InlineHealthMessage
          value={
            selectedHealthValidity
              ? {
                  tone: horseHealthValidityTone(selectedHealthValidity),
                  message: `${horseHealthValidityMessage(selectedHealthValidity)} ${uiText(locale, "Référence", "Reference")}: ${selectedShow ? formatDate(selectedShow.start_date) : uiText(locale, "concours", "show")}.`,
                }
              : null
          }
        />
        <label>
          {uiText(locale, "Classe", "Class")}
          <SearchSelect
            items={divisions.map((division) => {
              const classRecord = findById(classes, division.class_id);
              const effectiveEntryFee = division.entry_fee ?? classRecord?.entry_fee ?? null;

              return {
                id: division.id,
                label: entryDivisionLabel(division, locale),
                detail: [
                  entryDivisionBlockDetail(division, classes, locale),
                  effectiveEntryFee == null ? null : `${uiText(locale, "Inscription", "Entry")} ${formatCurrency(effectiveEntryFee, organization?.currency ?? "CAD")}`,
                  division.judge_fee == null ? null : `${uiText(locale, "Juge", "Judge")} ${formatCurrency(division.judge_fee, organization?.currency ?? "CAD")}`,
                ]
                  .filter(Boolean)
                  .join(" - "),
              };
            })}
            placeholder={uiText(locale, "Rechercher une classe", "Search class")}
            value={divisionId}
            onChange={setDivisionId}
          />
        </label>
        <InlineHealthMessage value={selectedDivision ? entryProgramLimitReadiness.message : null} />
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
        <NrhaEligibilityCheck
          classRecord={selectedClass}
          contactExternalMemberships={contactExternalMemberships}
          division={selectedDivision}
          externalOrganizations={externalOrganizations}
          horse={selectedHorse ?? null}
          horseExternalMemberships={horseExternalMemberships}
          locale={locale}
          riderContact={selectedNrhaRiderContact}
          show={selectedShow}
          onVerifyNrhaEligibility={onVerifyNrhaEligibility}
        />
        <ReadinessChecklist readiness={selectedHorse ? entryReadiness : null} />
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
