import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { EmptyState, ModalDialog, ViewIntro } from "../../components/ui";
import { contactLabel, formatCurrency, formatDate, findById, horseLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createContact, createContactOrganizationMembership, createHorse, createUploadedHorseHealthDocument, deleteContact, deleteHorse, reviewHorseHealthDocument, updateContact, updateHorse, verifyGvlCogginsDocument, verifyNrhaHorse } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership, ContactOrganizationMembership, ContactRole, ExternalOrganization, Horse, HorseContact, HorseExternalMembership, HorseHealthDocument, Organization, OrganizationExternalMembershipRequirement, OrganizationMembershipType } from "../../types/domain";
import { uiText, normalizeDirectorySearch, contactMatchesDirectorySearch, horseMatchesDirectorySearch, horseHealthDisplay, horseExternalReferenceChips, horseGenderLabel, cogginsValidityTagLabel, cogginsValidityBadgeClass, cogginsValidityMessage } from "../dashboard/shared";
import { ContactForm } from "./ContactForm";
import { ContactEditForm } from "./ContactEditForm";
import { HorseForm } from "../horses/HorseForm";
import { HorseEditForm } from "../horses/HorseEditForm";

function PeopleView({
  locale,
  contacts,
  contactExternalMemberships,
  contactOrganizationMemberships,
  contactRoles,
  canManageHealthDocuments,
  createdByUserId,
  externalOrganizations,
  horseExternalMemberships,
  horseHealthDocuments,
  horses,
  horseContacts,
  membershipRequirements,
  organizationMembershipTypes,
  organization,
  onCreateContact,
  onCreateContactOrganizationMembership,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onDeleteContact,
  onDeleteHorse,
  onReviewHorseHealthDocument,
  onUpdateContact,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaHorse,
}: {
  locale: Locale;
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactOrganizationMemberships: ContactOrganizationMembership[];
  contactRoles: ContactRole[];
  canManageHealthDocuments: boolean;
  createdByUserId: string;
  externalOrganizations: ExternalOrganization[];
  horseExternalMemberships: HorseExternalMembership[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  horseContacts: HorseContact[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organizationMembershipTypes: OrganizationMembershipType[];
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateContactOrganizationMembership: (input: Parameters<typeof createContactOrganizationMembership>[0]) => Promise<ContactOrganizationMembership>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onDeleteContact: (id: Parameters<typeof deleteContact>[0]) => Promise<void>;
  onDeleteHorse: (id: Parameters<typeof deleteHorse>[0]) => Promise<void>;
  onReviewHorseHealthDocument: (id: string, input: Parameters<typeof reviewHorseHealthDocument>[1]) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
}) {
  const [creatingContact, setCreatingContact] = useState(false);
  const [creatingHorse, setCreatingHorse] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [horseSearch, setHorseSearch] = useState("");
  const [membershipTypeByContact, setMembershipTypeByContact] = useState<Record<string, string>>({});
  const [sellingMembershipContactId, setSellingMembershipContactId] = useState("");
  const normalizedContactSearch = normalizeDirectorySearch(contactSearch);
  const normalizedHorseSearch = normalizeDirectorySearch(horseSearch);
  const filteredContacts = normalizedContactSearch
    ? contacts.filter((contact) => contactMatchesDirectorySearch(contact, contactRoles, normalizedContactSearch))
    : [];
  const filteredHorses = normalizedHorseSearch
    ? horses.filter((horse) => horseMatchesDirectorySearch(horse, contacts, horseExternalMemberships, externalOrganizations, normalizedHorseSearch))
    : [];
  const activeMembershipTypes = organizationMembershipTypes.filter((type) => type.is_active);

  function membershipsForContact(contactId: string) {
    return contactOrganizationMemberships.filter((membership) => membership.contact_id === contactId && membership.status !== "cancelled");
  }

  function selectedMembershipTypeId(contactId: string) {
    return membershipTypeByContact[contactId] ?? activeMembershipTypes[0]?.id ?? "";
  }

  function contactHasMembershipType(contactId: string, membershipTypeId: string) {
    return membershipsForContact(contactId).some((membership) => membership.membership_type_id === membershipTypeId);
  }

  async function handleSellMembership(contact: Contact) {
    const membershipTypeId = selectedMembershipTypeId(contact.id);

    if (!organization || !membershipTypeId || !createdByUserId) {
      return;
    }

    setSellingMembershipContactId(contact.id);

    try {
      await onCreateContactOrganizationMembership({
        organization_id: organization.id,
        contact_id: contact.id,
        membership_type_id: membershipTypeId,
        show_id: null,
        payer_contact_id: contact.id,
        status: "active",
        sold_by_user_id: createdByUserId,
      });
    } finally {
      setSellingMembershipContactId("");
    }
  }

  async function handleDeleteHorse(horse: Horse) {
    if (!window.confirm(`Supprimer ${horse.name} et les inscriptions/réservations liées?`)) {
      return;
    }

    await onDeleteHorse(horse.id);
    if (editingHorse?.id === horse.id) {
      setEditingHorse(null);
    }
  }

  async function handleDeleteContact(contact: Contact) {
    const label = contactLabel(contact);

    if (!window.confirm(`Supprimer ${label}? Si ce contact est utilisé comme cavalier dans une inscription de test, il sera détaché de l'inscription.`)) {
      return;
    }

    await onDeleteContact(contact.id);
    if (editingContact?.id === contact.id) {
      setEditingContact(null);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Répertoire", "Directory")}
        title={uiText(locale, "Répertoire", "Directory")}
        description={uiText(locale, "Centralise les propriétaires, cavaliers, payeurs et chevaux qui serviront aux inscriptions.", "Centralize owners, riders, payers and horses used for entries.")}
        stats={[
          { label: uiText(locale, "Contacts", "Contacts"), value: String(contacts.length) },
          { label: uiText(locale, "Chevaux", "Horses"), value: String(horses.length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Ajouter au répertoire", "Add to directory")}</h2>
            <p>{uiText(locale, "Ouvre le bon formulaire sans quitter la recherche de contacts et chevaux.", "Open the right form without leaving contact and horse search.")}</p>
          </div>
          <div className="row-actions">
            <button className="primary-button" disabled={!organization} type="button" onClick={() => setCreatingContact(true)}>
              <Plus size={18} />
              {uiText(locale, "Contact", "Contact")}
            </button>
            <button className="primary-button" disabled={!organization} type="button" onClick={() => setCreatingHorse(true)}>
              <Plus size={18} />
              {uiText(locale, "Cheval", "Horse")}
            </button>
          </div>
        </div>
      </section>

      {creatingContact ? (
        <ModalDialog description={organization ? organization.name : uiText(locale, "Crée une association d'abord.", "Create an organization first.")} eyebrow={uiText(locale, "Répertoire", "Directory")} title={uiText(locale, "Nouveau contact", "New contact")} onClose={() => setCreatingContact(false)}>
          <ContactForm
            locale={locale}
            externalOrganizations={externalOrganizations}
            membershipRequirements={membershipRequirements}
            organization={organization}
            onCreateContact={onCreateContact}
            onCreated={() => setCreatingContact(false)}
          />
        </ModalDialog>
      ) : null}

      {creatingHorse ? (
        <ModalDialog description={contacts.length ? uiText(locale, "Connecte le cheval à un propriétaire.", "Connect the horse to an owner.") : uiText(locale, "Crée un contact propriétaire directement dans ce formulaire au besoin.", "Create an owner contact directly in this form if needed.")} eyebrow={uiText(locale, "Répertoire", "Directory")} title={uiText(locale, "Nouveau cheval", "New horse")} onClose={() => setCreatingHorse(false)}>
          <HorseForm
            locale={locale}
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={createdByUserId}
            externalOrganizations={externalOrganizations}
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

      {editingContact ? (
        <ModalDialog description={contactLabel(editingContact)} eyebrow={uiText(locale, "Répertoire", "Directory")} title={uiText(locale, "Modifier le contact", "Edit contact")} onClose={() => setEditingContact(null)}>
          <ContactEditForm
            locale={locale}
            contact={editingContact}
            contactExternalMemberships={contactExternalMemberships}
            externalOrganizations={externalOrganizations}
            membershipRequirements={membershipRequirements}
            onCancel={() => setEditingContact(null)}
            onUpdateContact={async (id, input) => {
              await onUpdateContact(id, input);
              setEditingContact(null);
            }}
          />
        </ModalDialog>
      ) : null}

      {editingHorse ? (
        <ModalDialog className="horse-form-modal" description={editingHorse.name} eyebrow={uiText(locale, "Répertoire", "Directory")} title={uiText(locale, "Modifier le cheval", "Edit horse")} onClose={() => setEditingHorse(null)}>
          <HorseEditForm
            locale={locale}
            contacts={contacts}
            contactRoles={contactRoles}
            canManageHealthDocuments={canManageHealthDocuments}
            createdByUserId={createdByUserId}
            externalOrganizations={externalOrganizations}
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
          />
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Contacts", "Contacts")}</h2>
            <p>{normalizedContactSearch ? uiText(locale, `${filteredContacts.length} résultat${filteredContacts.length === 1 ? "" : "s"} sur ${contacts.length} contact${contacts.length === 1 ? "" : "s"}.`, `${filteredContacts.length} result${filteredContacts.length === 1 ? "" : "s"} across ${contacts.length} contact${contacts.length === 1 ? "" : "s"}.`) : uiText(locale, "Recherche par nom, courriel ou écurie.", "Search by name, email or barn.")}</p>
          </div>
        </div>
        <label className="directory-search-field">
          <span>{uiText(locale, "Rechercher un contact", "Search contacts")}</span>
          <div>
            <Search size={16} />
            <input placeholder={uiText(locale, "Nom, courriel, écurie...", "Name, email, barn...")} value={contactSearch} onChange={(event) => setContactSearch(event.target.value)} />
          </div>
        </label>
        <div className="horse-list directory-list">
          {normalizedContactSearch ? (
            <div className="horse-list-row horse-list-head">
              <span>{uiText(locale, "Contact", "Contact")}</span>
              <span>{uiText(locale, "Courriel", "Email")}</span>
              <span>Action</span>
            </div>
          ) : null}
          {filteredContacts.map((contact) => {
            const contactMemberships = membershipsForContact(contact.id);
            const membershipTypeId = selectedMembershipTypeId(contact.id);
            const selectedMembershipType = findById(activeMembershipTypes, membershipTypeId);
            const alreadyHasSelectedMembership = membershipTypeId ? contactHasMembershipType(contact.id, membershipTypeId) : false;
            const sellingMembership = sellingMembershipContactId === contact.id;
            const canSellMembership = Boolean(organization && selectedMembershipType && !alreadyHasSelectedMembership && !sellingMembership);

            return (
              <div className="horse-list-row" key={contact.id}>
                <div className="horse-list-identity">
                  <strong>{contactLabel(contact)}</strong>
                  <span>{contact.barn_name || uiText(locale, "Contact", "Contact")}</span>
                </div>
                <div className="horse-chip-row">
                  <span className="horse-status-chip neutral">
                    <span>{uiText(locale, "Courriel", "Email")}</span>
                    <strong>{contact.email || uiText(locale, "Aucun", "None")}</strong>
                  </span>
                  {contactMemberships.map((membership) => {
                    const membershipType = findById(organizationMembershipTypes, membership.membership_type_id);
                    return (
                      <span className="horse-status-chip success" key={membership.id}>
                        <span>{uiText(locale, "Carte", "Membership")}</span>
                        <strong>{membershipType ? `${membershipType.code ?? membershipType.name} ${membership.season_year}` : membership.season_year}</strong>
                      </span>
                    );
                  })}
                </div>
                <div className="row-actions horse-row-actions">
                  {activeMembershipTypes.length ? (
                    <>
                      <select
                        aria-label={uiText(locale, "Type de carte à vendre", "Membership type to sell")}
                        disabled={sellingMembership}
                        value={membershipTypeId}
                        onChange={(event) =>
                          setMembershipTypeByContact((current) => ({
                            ...current,
                            [contact.id]: event.target.value,
                          }))
                        }
                      >
                        {activeMembershipTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {`${type.code ?? type.name} ${type.season_year} · ${formatCurrency(type.price, organization?.currency ?? "CAD")}`}
                          </option>
                        ))}
                      </select>
                      <button className="text-button" disabled={!canSellMembership} type="button" onClick={() => void handleSellMembership(contact)}>
                        {sellingMembership
                          ? uiText(locale, "Vente...", "Selling...")
                            : alreadyHasSelectedMembership
                              ? uiText(locale, "Déjà vendue", "Already sold")
                              : uiText(locale, "Vendre carte", "Sell membership")}
                      </button>
                    </>
                  ) : null}
                  <button className="text-button" type="button" onClick={() => setEditingContact(contact)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button danger-text" type="button" onClick={() => handleDeleteContact(contact)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
              </div>
            );
          })}
          {!normalizedContactSearch ? <EmptyState label={uiText(locale, "Lance une recherche pour afficher les contacts de l'association.", "Search to display association contacts.")} /> : null}
          {normalizedContactSearch && !filteredContacts.length ? <EmptyState label={uiText(locale, "Aucun contact ne correspond à cette recherche.", "No contact matches this search.")} /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Chevaux", "Horses")}</h2>
            <p>{normalizedHorseSearch ? uiText(locale, `${filteredHorses.length} résultat${filteredHorses.length === 1 ? "" : "s"} sur ${horses.length} ${horses.length === 1 ? "cheval" : "chevaux"}.`, `${filteredHorses.length} result${filteredHorses.length === 1 ? "" : "s"} across ${horses.length} horse${horses.length === 1 ? "" : "s"}.`) : uiText(locale, "Recherche par nom, propriétaire, sexe ou numéro externe.", "Search by name, owner, sex or external number.")}</p>
          </div>
        </div>
        <label className="directory-search-field">
          <span>{uiText(locale, "Rechercher un cheval", "Search horses")}</span>
          <div>
            <Search size={16} />
            <input placeholder={uiText(locale, "Nom, propriétaire, référence...", "Name, owner, reference...")} value={horseSearch} onChange={(event) => setHorseSearch(event.target.value)} />
          </div>
        </label>
        <div className="horse-list directory-list">
          {normalizedHorseSearch ? (
            <div className="horse-list-row horse-list-head">
              <span>{uiText(locale, "Cheval", "Horse")}</span>
              <span>{uiText(locale, "Statut", "Status")}</span>
              <span>{uiText(locale, "Références", "References")}</span>
              <span>Action</span>
            </div>
          ) : null}
          {filteredHorses.map((horse) => {
            const healthDisplay = horseHealthDisplay(horse, horseHealthDocuments, organization);
            const referenceChips = horseExternalReferenceChips(horse, horseExternalMemberships, externalOrganizations);

            return (
              <div className={`horse-list-row ${healthDisplay.summary.tone}`} key={horse.id}>
                <div className="horse-list-identity">
                  <strong>{horse.name}</strong>
                  <span>
                    {contactLabel(findById(contacts, horse.primary_owner_contact_id))} · {horseGenderLabel(horse.gender)}
                  </span>
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
          {!normalizedHorseSearch ? <EmptyState label={uiText(locale, "Lance une recherche pour afficher les chevaux de l'association.", "Search to display association horses.")} /> : null}
          {normalizedHorseSearch && !filteredHorses.length ? <EmptyState label={uiText(locale, "Aucun cheval ne correspond à cette recherche.", "No horse matches this search.")} /> : null}
        </div>
      </section>
    </div>
  );
}

export { PeopleView };
