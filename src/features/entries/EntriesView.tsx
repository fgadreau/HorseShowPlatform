import { useState } from "react";
import { Plus } from "lucide-react";
import { EmptyState, ModalDialog, ViewIntro } from "../../components/ui";
import { contactLabel, divisionLabel, findById, formatCurrency, formatDate, horseLabel, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createContact, createEntry, createHorse, createUploadedHorseHealthDocument, deleteEntry, updateEntry, verifyGvlCogginsDocument, verifyNrhaEligibility, verifyNrhaHorse } from "../../services/supabaseServices";
import type { ClassRecord, Contact, ContactExternalMembership, ContactRole, Division, Entry, ExternalOrganization, Horse, HorseExternalMembership, HorseHealthDocument, Invoice, NrhaRiderRanking, Organization, OrganizationExternalMembershipRequirement, Show, ShowDay } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { EntryForm } from "./EntryForm";
import { EntryEditForm } from "./EntryEditForm";
import { entryDivisionBlockDetail, entryDivisionLabel } from "./entryDisplay";

function EntriesView({
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
  nrhaRiderRankings,
  organization,
  profileId,
  showDays,
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
  nrhaRiderRankings: NrhaRiderRanking[];
  organization: Organization | null;
  profileId: string;
  showDays: ShowDay[];
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
    if (!window.confirm(`Supprimer l'inscription de ${horseName}?`)) {
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
        eyebrow={uiText(locale, "Inscriptions", "Entries")}
        title={uiText(locale, "Gestion des inscriptions", "Entry management")}
        description={uiText(locale, "Crée et ajuste les brouillons avant paiement, facturation ou préparation du pointage.", "Create and adjust drafts before checkout, billing or scoring preparation.")}
        stats={[
          { label: uiText(locale, "Inscriptions", "Entries"), value: String(entries.length) },
          { label: uiText(locale, "Brouillons", "Drafts"), value: String(entries.filter((entry) => entry.status === "draft").length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Nouvelle inscription", "New entry")}</h2>
            <p>{uiText(locale, "Ouvre le formulaire et complète les contacts ou chevaux manquants sans changer de page.", "Open the form and complete missing contacts or horses without leaving the page.")}</p>
          </div>
          <button className="primary-button" disabled={!organization || !shows.length || !divisions.length} type="button" onClick={() => setCreatingEntry(true)}>
            <Plus size={18} />
            {uiText(locale, "Inscription", "Entry")}
          </button>
        </div>
      </section>

      {creatingEntry ? (
        <ModalDialog className="entry-form-modal" description={uiText(locale, "Brouillon maintenant, paiement plus tard.", "Draft now, checkout later.")} eyebrow={uiText(locale, "Inscriptions", "Entries")} title={uiText(locale, "Nouvelle inscription", "New entry")} onClose={() => setCreatingEntry(false)}>
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
            nrhaRiderRankings={nrhaRiderRankings}
            organization={organization}
            profileId={profileId}
            showDays={showDays}
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
        <ModalDialog className="entry-form-modal" description={horseLabel(findById(horses, editingEntry.horse_id))} eyebrow={uiText(locale, "Inscriptions", "Entries")} title={uiText(locale, "Modifier l'inscription", "Edit entry")} onClose={() => setEditingEntry(null)}>
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
            nrhaRiderRankings={nrhaRiderRankings}
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
            <h2>{uiText(locale, "Inscriptions", "Entries")}</h2>
            <p>{entries.length ? uiText(locale, `${entries.length} inscription${entries.length === 1 ? "" : "s"} créée${entries.length === 1 ? "" : "s"}.`, `${entries.length} entr${entries.length === 1 ? "y" : "ies"} created.`) : uiText(locale, "Les brouillons d'inscription apparaissent ici avant paiement.", "Draft entries appear here before checkout.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Cheval", "Horse")}</span>
            <span>{uiText(locale, "Classe", "Class")}</span>
            <span>{uiText(locale, "Propriétaire", "Owner")}</span>
            <span>Action</span>
          </div>
          {entries.map((entry) => (
            <div className="table-row" key={entry.id}>
              <div>
                <strong>{horseLabel(findById(horses, entry.horse_id))}</strong>
                <span className="muted-line">{uiText(locale, "Dossard", "Back number")}: {entry.entry_number ?? uiText(locale, "à assigner", "to assign")}</span>
              </div>
              <div>
                <span>{entryDivisionLabel(findById(divisions, entry.division_id), locale)}</span>
                <span className="muted-line">{entryDivisionBlockDetail(findById(divisions, entry.division_id), classes, locale)}</span>
              </div>
              <span>{contactLabel(findById(contacts, entry.owner_contact_id))}</span>
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
          {!entries.length ? <EmptyState label={uiText(locale, "Crée un brouillon après avoir ajouté les contacts, chevaux, blocs et classes.", "Create a draft after adding contacts, horses, schedule blocks and classes.")} /> : null}
        </div>
      </section>
    </div>
  );
}

export { EntriesView };
