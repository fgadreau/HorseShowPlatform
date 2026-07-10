import { useState } from "react";
import { Plus } from "lucide-react";
import { EmptyState, ModalDialog, ViewIntro } from "../../components/ui";
import { contactLabel, findById, horseLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createContact, createHorse, createUploadedHorseHealthDocument, deleteHorse, reviewHorseHealthDocument, updateHorse, verifyGvlCogginsDocument, verifyNrhaHorse } from "../../services/supabaseServices";
import type { Contact, ContactRole, ExternalOrganization, Horse, HorseContact, HorseExternalMembership, HorseHealthDocument, Organization, OrganizationExternalMembershipRequirement } from "../../types/domain";
import { uiText, horseHealthDisplay, horseExternalReferenceChips, horseGenderLabel } from "../dashboard/shared";
import { HorseForm } from "./HorseForm";
import { HorseEditForm } from "./HorseEditForm";

function MyHorsesView({
  locale,
  contacts,
  contactRoles,
  canManageHealthDocuments,
  externalOrganizations,
  membershipRequirements = [],
  horses,
  horseExternalMemberships,
  horseHealthDocuments,
  horseContacts,
  organization,
  profileId,
  onCreateContact,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onDeleteHorse,
  onReviewHorseHealthDocument,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaHorse,
}: {
  locale: Locale;
  contacts: Contact[];
  contactRoles: ContactRole[];
  canManageHealthDocuments: boolean;
  externalOrganizations: ExternalOrganization[];
  membershipRequirements?: OrganizationExternalMembershipRequirement[];
  horses: Horse[];
  horseExternalMemberships: HorseExternalMembership[];
  horseHealthDocuments: HorseHealthDocument[];
  horseContacts: HorseContact[];
  organization: Organization | null;
  profileId: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onDeleteHorse: (id: Parameters<typeof deleteHorse>[0]) => Promise<void>;
  onReviewHorseHealthDocument: (id: string, input: Parameters<typeof reviewHorseHealthDocument>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
}) {
  const [creatingHorse, setCreatingHorse] = useState(false);
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);

  async function handleDeleteHorse(horse: Horse) {
    if (!window.confirm(uiText(locale, `Supprimer ${horse.name} et les inscriptions/réservations liées?`, `Delete ${horse.name} and linked entries/reservations?`))) {
      return;
    }

    await onDeleteHorse(horse.id);
    if (editingHorse?.id === horse.id) {
      setEditingHorse(null);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Mon espace", "My space")}
        title={uiText(locale, "Mes chevaux", "My horses")}
        description={uiText(locale, "Gère les chevaux liés à ton profil avant de les inscrire à un concours.", "Manage horses linked to your profile before entering them in a show.")}
        stats={[
          { label: uiText(locale, "Chevaux", "Horses"), value: String(horses.length) },
          { label: "Contacts", value: String(contacts.length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Ajouter un cheval", "Add horse")}</h2>
            <p>{uiText(locale, "Ajoute ses infos, ses contacts et ses documents santé sans sortir de cette page.", "Add details, contacts and health documents without leaving this page.")}</p>
          </div>
          <button className="primary-button" disabled={!organization} type="button" onClick={() => setCreatingHorse(true)}>
            <Plus size={18} />
            {uiText(locale, "Cheval", "Horse")}
          </button>
        </div>
      </section>

      {creatingHorse ? (
        <ModalDialog description={uiText(locale, "Ajoute le cheval à ton profil et complète les documents requis.", "Add the horse to your profile and complete required documents.")} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Nouveau cheval", "New horse")} onClose={() => setCreatingHorse(false)}>
          <HorseForm
            locale={locale}
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            externalOrganizations={externalOrganizations}
            membershipRequirements={membershipRequirements}
            organization={organization}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onVerifyNrhaHorse={onVerifyNrhaHorse}
            onCreated={() => setCreatingHorse(false)}
          />
        </ModalDialog>
      ) : null}

      {editingHorse ? (
        <ModalDialog className="horse-form-modal" description={editingHorse.name} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Modifier le cheval", "Edit horse")} onClose={() => setEditingHorse(null)}>
          <HorseEditForm
            locale={locale}
            contacts={contacts}
            contactRoles={contactRoles}
            canManageHealthDocuments={canManageHealthDocuments}
            createdByUserId={profileId}
            externalOrganizations={externalOrganizations}
            membershipRequirements={membershipRequirements}
            horseExternalMemberships={horseExternalMemberships}
            horseHealthDocuments={horseHealthDocuments}
            horseContacts={horseContacts}
            organization={organization}
            horse={editingHorse}
            onCancel={() => setEditingHorse(null)}
            onCreateContact={onCreateContact}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onReviewHorseHealthDocument={onReviewHorseHealthDocument}
            onUpdateHorse={async (id, input) => {
              await onUpdateHorse(id, input);
              setEditingHorse(null);
            }}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onVerifyNrhaHorse={onVerifyNrhaHorse}
          />
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Mes chevaux", "My horses")}</h2>
            <p>{uiText(locale, "Chevaux liés à mon profil utilisateur.", "Horses linked to my user profile.")}</p>
          </div>
        </div>
        <div className="horse-list">
          <div className="horse-list-row horse-list-head">
            <span>{uiText(locale, "Cheval", "Horse")}</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>{uiText(locale, "Références", "References")}</span>
            <span>Action</span>
          </div>
          {horses.map((horse) => {
            const healthDisplay = horseHealthDisplay(horse, horseHealthDocuments, organization);
            const referenceChips = horseExternalReferenceChips(horse, horseExternalMemberships, externalOrganizations);

            return (
              <div className={`horse-list-row ${healthDisplay.summary.tone}`} key={horse.id}>
                <div className="horse-list-identity">
                  <strong>{horse.name}</strong>
                  <span>
                    {contactLabel(findById(contacts, horse.primary_owner_contact_id))} · {horseGenderLabel(horse.gender)}
                  </span>
                  {horse.sire_name || horse.dam_name ? (
                    <span>
                      {[horse.sire_name ? `${uiText(locale, "Père", "Sire")}: ${horse.sire_name}` : null, horse.dam_name ? `${uiText(locale, "Mère", "Dam")}: ${horse.dam_name}` : null].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </div>
                <div className="horse-list-status">
                  <span className={`horse-summary-pill ${healthDisplay.summary.tone}`}>{healthDisplay.summary.label}</span>
                  <div className="horse-chip-row">
                    {healthDisplay.chips.map((chip) => (
                      <span className={`horse-status-chip ${chip.tone}`} key={`${horse.id}-${chip.label}`}>
                        <span>{chip.label}</span>
                        <strong>{chip.value}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="horse-chip-row reference-chip-row">
                  {referenceChips.map((chip) => (
                    <span className={`horse-status-chip ${chip.tone}`} key={`${horse.id}-${chip.label}-${chip.value}`}>
                      <span>{chip.label}</span>
                      <strong>{chip.value}</strong>
                    </span>
                  ))}
                </div>
                <div className="row-actions horse-row-actions">
                  <button className="text-button" type="button" onClick={() => setEditingHorse(horse)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button danger-text" type="button" onClick={() => handleDeleteHorse(horse)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
              </div>
            );
          })}
          {!horses.length ? <EmptyState label={uiText(locale, "Aucun cheval lié à ton profil pour l'instant.", "No horse linked to your profile yet.")} /> : null}
        </div>
      </section>
    </div>
  );
}

export { MyHorsesView };
