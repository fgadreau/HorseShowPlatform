import { useState } from "react";
import { Plus } from "lucide-react";
import { EmptyState, ModalDialog, ViewIntro } from "../../components/ui";
import { contactLabel, divisionLabel, findById, formatCurrency, formatDate, horseLabel, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createContact, createEntry, createHorse, createUploadedHorseHealthDocument, deleteEntry, updateEntry, verifyGvlCogginsDocument, verifyNrhaEligibility, verifyNrhaHorse } from "../../services/supabaseServices";
import type { ClassRecord, Contact, ContactExternalMembership, ContactRole, Division, Entry, ExternalOrganization, Horse, HorseExternalMembership, HorseHealthDocument, Invoice, Organization, OrganizationExternalMembershipRequirement, Show, ShowDay } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { EntryForm } from "./EntryForm";
import { EntryEditForm } from "./EntryEditForm";
import { entryDivisionBlockDetail, entryDivisionLabel } from "./entryDisplay";

function MyEntriesView({
  locale,
  classes,
  contacts,
  contactExternalMemberships,
  contactRoles,
  divisions,
  entries,
  externalOrganizations,
  horseExternalMemberships,
  horseHealthDocuments,
  horses,
  membershipRequirements,
  organization,
  profileId,
  shows,
  onCreateContact,
  onCreateEntry,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onDeleteEntry,
  onUpdateEntry,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaEligibility,
  onVerifyNrhaHorse,
}: {
  locale: Locale;
  classes: ClassRecord[];
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactRoles: ContactRole[];
  divisions: Division[];
  entries: Entry[];
  externalOrganizations: ExternalOrganization[];
  horseExternalMemberships: HorseExternalMembership[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onDeleteEntry: (id: Parameters<typeof deleteEntry>[0]) => Promise<void>;
  onUpdateEntry: (id: string, input: Parameters<typeof updateEntry>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaEligibility: (input: Parameters<typeof verifyNrhaEligibility>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaEligibility>>>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
}) {
  const [creatingEntry, setCreatingEntry] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);

  async function handleDeleteEntry(entry: Entry) {
    const horseName = horseLabel(findById(horses, entry.horse_id));
    if (!window.confirm(uiText(locale, `Supprimer l'inscription de ${horseName}?`, `Delete ${horseName}'s entry?`))) {
      return;
    }

    await onDeleteEntry(entry.id);
    if (editingEntry?.id === entry.id) {
      setEditingEntry(null);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Mon espace", "My space")}
        title={uiText(locale, "Mes inscriptions", "My entries")}
        description={uiText(locale, "Consulte et modifie les inscriptions rattachées à tes chevaux ou contacts.", "Review and edit entries linked to your horses or contacts.")}
        stats={[
          { label: uiText(locale, "Inscriptions", "Entries"), value: String(entries.length) },
          { label: uiText(locale, "Chevaux", "Horses"), value: String(horses.length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Nouvelle inscription", "New entry")}</h2>
            <p>{uiText(locale, "Inscris un cheval et complète les infos manquantes sans quitter la page.", "Enter a horse and complete missing information without leaving the page.")}</p>
          </div>
          <button className="primary-button" disabled={!organization || !shows.length || !divisions.length} type="button" onClick={() => setCreatingEntry(true)}>
            <Plus size={18} />
            {uiText(locale, "Inscription", "Entry")}
          </button>
        </div>
      </section>

      {creatingEntry ? (
        <ModalDialog className="entry-form-modal" description={uiText(locale, "Brouillon maintenant, paiement plus tard.", "Draft now, checkout later.")} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Nouvelle inscription", "New entry")} onClose={() => setCreatingEntry(false)}>
          <EntryForm
            locale={locale}
            classes={classes}
            contacts={contacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={contactRoles}
            divisions={divisions}
            entries={entries}
            externalOrganizations={externalOrganizations}
            horseExternalMemberships={horseExternalMemberships}
            horseHealthDocuments={horseHealthDocuments}
            horses={horses}
            membershipRequirements={membershipRequirements}
            organization={organization}
            profileId={profileId}
            shows={shows}
            onCreateContact={onCreateContact}
            onCreateEntry={onCreateEntry}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onVerifyNrhaEligibility={onVerifyNrhaEligibility}
            onVerifyNrhaHorse={onVerifyNrhaHorse}
            onCreated={() => setCreatingEntry(false)}
          />
        </ModalDialog>
      ) : null}

      {editingEntry ? (
        <ModalDialog className="entry-form-modal" description={horseLabel(findById(horses, editingEntry.horse_id))} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Modifier l'inscription", "Edit entry")} onClose={() => setEditingEntry(null)}>
          <EntryEditForm
            locale={locale}
            classes={classes}
            contacts={contacts}
            contactExternalMemberships={contactExternalMemberships}
            contactRoles={contactRoles}
            divisions={divisions}
            entries={entries}
            entry={editingEntry}
            externalOrganizations={externalOrganizations}
            horseExternalMemberships={horseExternalMemberships}
            horseHealthDocuments={horseHealthDocuments}
            horses={horses}
            membershipRequirements={membershipRequirements}
            organization={organization}
            profileId={profileId}
            shows={shows}
            onCancel={() => setEditingEntry(null)}
            onCreateContact={onCreateContact}
            onVerifyNrhaEligibility={onVerifyNrhaEligibility}
            onUpdateEntry={async (id, input) => {
              await onUpdateEntry(id, input);
              setEditingEntry(null);
            }}
          />
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Mes inscriptions", "My entries")}</h2>
            <p>{uiText(locale, "Inscriptions liées à mes chevaux ou contacts.", "Entries linked to my horses or contacts.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Cheval", "Horse")}</span>
            <span>{uiText(locale, "Classe", "Class")}</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>Action</span>
          </div>
          {entries.map((entry) => (
            <div className="table-row" key={entry.id}>
              <strong>{horseLabel(findById(horses, entry.horse_id))}</strong>
              <div>
                <span>{entryDivisionLabel(findById(divisions, entry.division_id), locale)}</span>
                <span className="muted-line">{entryDivisionBlockDetail(findById(divisions, entry.division_id), classes, locale)}</span>
                {entry.is_late ? (
                  <span className="muted-line">
                    {uiText(locale, "Retard", "Late")} +{entry.late_fee_percent}%{entry.late_fee_amount ? ` - ${formatCurrency(entry.late_fee_amount, organization?.currency ?? "CAD")}` : ""}
                  </span>
                ) : null}
              </div>
              <span className={`badge ${entry.status}`}>{entry.status.replace("_", " ")}</span>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingEntry(entry)}>
                  {uiText(locale, "Modifier", "Edit")}
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteEntry(entry)}>
                  {uiText(locale, "Supprimer", "Delete")}
                </button>
              </div>
            </div>
          ))}
          {!entries.length ? <EmptyState label={uiText(locale, "Aucune inscription liée à ton profil pour l'instant.", "No entries linked to your profile yet.")} /> : null}
        </div>
      </section>
    </div>
  );
}

export { MyEntriesView };
