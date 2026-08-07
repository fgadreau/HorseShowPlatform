import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { EmptyState, ModalDialog, ViewIntro } from "../../components/ui";
import { contactLabel, formatCurrency, formatDate, findById, horseLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createContact, createContactOrganizationMembership, createHorse, createUploadedHorseHealthDocument, deleteContact, deleteHorse, dismissContactIdentityCandidate, dismissHorseIdentityCandidate, linkContactToDirectory, linkHorseToDirectory, searchContactIdentityCandidates, searchHorseIdentityCandidates, unlinkContactFromDirectory, unlinkHorseFromDirectory, updateContact, updateHorse, verifyGvlCogginsDocument, verifyNrhaHorse, verifyNrhaMember } from "../../services/supabaseServices";
import type { ContactIdentityCandidate, HorseIdentityCandidate } from "../../services/supabaseServices";
import type { Contact, ContactExternalIdentifier, ContactInsuranceEvidence, ContactOrganizationMembership, ContactRole, DirectoryContact, DirectoryHorse, Discipline, ExternalCredentialIssuer, ExternalCredentialProduct, Horse, HorseContact, HorseExternalIdentifier, HorseHealthDocument, Organization, OrganizationDiscipline, OrganizationExternalCredentialRequirement, OrganizationMembershipType } from "../../types/domain";
import { uiText, normalizeDirectorySearch, contactMatchesDirectorySearch, horseMatchesDirectorySearch, horseExternalReferenceChips, horseGenderLabel, todayDateValue } from "../dashboard/shared";
import { healthComplianceReasonSummary, healthComplianceStatusLabel, healthComplianceTone, useHorseHealthComplianceOverview } from "../health/HealthComplianceSummary";
import { ContactForm } from "./ContactForm";
import { ContactEditForm } from "./ContactEditForm";
import { HorseForm } from "../horses/HorseForm";
import { HorseEditForm } from "../horses/HorseEditForm";
import { DirectoryCreationPicker, DirectoryDisciplinePicker } from "./DirectoryDisciplinePicker";
import { InsuranceEvidenceForm } from "./InsuranceEvidenceForm";

function PeopleView({
  locale,
  contacts,
  contactExternalIdentifiers,
  contactInsuranceEvidence,
  contactOrganizationMemberships,
  contactRoles,
  createdByUserId,
  directoryContacts,
  directoryHorses,
  disciplines,
  externalCredentialIssuers,
  externalCredentialProducts,
  horseExternalIdentifiers,
  horseHealthDocuments,
  horses,
  horseContacts,
  healthComplianceRevision,
  membershipRequirements,
  organizationMembershipTypes,
  organization,
  organizationDisciplines,
  onCreateContact,
  onCreateContactOrganizationMembership,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onLinkContactToDirectory,
  onLinkHorseToDirectory,
  onDeleteContact,
  onDeleteHorse,
  onUnlinkContactFromDirectory,
  onUnlinkHorseFromDirectory,
  onUpdateContact,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaHorse,
  onVerifyNrhaMember,
  onRefresh,
}: {
  locale: Locale;
  contacts: Contact[];
  contactExternalIdentifiers: ContactExternalIdentifier[];
  contactInsuranceEvidence: ContactInsuranceEvidence[];
  contactOrganizationMemberships: ContactOrganizationMembership[];
  contactRoles: ContactRole[];
  createdByUserId: string;
  directoryContacts: DirectoryContact[];
  directoryHorses: DirectoryHorse[];
  disciplines: Discipline[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  externalCredentialProducts: ExternalCredentialProduct[];
  horseExternalIdentifiers: HorseExternalIdentifier[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  horseContacts: HorseContact[];
  healthComplianceRevision?: string;
  membershipRequirements: OrganizationExternalCredentialRequirement[];
  organizationMembershipTypes: OrganizationMembershipType[];
  organization: Organization | null;
  organizationDisciplines: OrganizationDiscipline[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateContactOrganizationMembership: (input: Parameters<typeof createContactOrganizationMembership>[0]) => Promise<ContactOrganizationMembership>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onLinkContactToDirectory: (input: Parameters<typeof linkContactToDirectory>[0]) => Promise<void>;
  onLinkHorseToDirectory: (input: Parameters<typeof linkHorseToDirectory>[0]) => Promise<void>;
  onDeleteContact: (id: Parameters<typeof deleteContact>[0]) => Promise<void>;
  onDeleteHorse: (id: Parameters<typeof deleteHorse>[0]) => Promise<void>;
  onUnlinkContactFromDirectory: (...args: Parameters<typeof unlinkContactFromDirectory>) => Promise<void>;
  onUnlinkHorseFromDirectory: (...args: Parameters<typeof unlinkHorseFromDirectory>) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
  onVerifyNrhaMember: (input: Parameters<typeof verifyNrhaMember>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaMember>>>;
  onRefresh: () => Promise<void> | void;
}) {
  const [creatingContact, setCreatingContact] = useState(false);
  const [creatingHorse, setCreatingHorse] = useState(false);
  const [contactCreationDirectoryIds, setContactCreationDirectoryIds] = useState<Set<string>>(new Set());
  const [horseCreationDirectoryIds, setHorseCreationDirectoryIds] = useState<Set<string>>(new Set());
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [insuranceContact, setInsuranceContact] = useState<Contact | null>(null);
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [horseSearch, setHorseSearch] = useState("");
  const [membershipTypeByContact, setMembershipTypeByContact] = useState<Record<string, string>>({});
  const [sellingMembershipContactId, setSellingMembershipContactId] = useState("");
  const healthCompliance = useHorseHealthComplianceOverview({
    horseIds: horses.map((horse) => horse.id),
    organizationId: organization?.id,
    referenceDate: todayDateValue(),
    refreshToken: healthComplianceRevision,
  });
  const normalizedContactSearch = normalizeDirectorySearch(contactSearch);
  const normalizedHorseSearch = normalizeDirectorySearch(horseSearch);
  const filteredContacts = normalizedContactSearch
    ? contacts.filter((contact) => contactMatchesDirectorySearch(contact, contactRoles, normalizedContactSearch))
    : [];
  const filteredHorses = normalizedHorseSearch
    ? horses.filter((horse) => horseMatchesDirectorySearch(horse, contacts, horseExternalIdentifiers, externalCredentialIssuers, normalizedHorseSearch))
    : [];
  const activeMembershipTypes = organizationMembershipTypes.filter((type) => type.is_active);

  function initialDirectoryIds() {
    const defaultDirectory = organizationDisciplines.find((discipline) => discipline.is_default) ?? organizationDisciplines[0];
    return new Set(defaultDirectory ? [defaultDirectory.id] : []);
  }

  function startCreatingContact() {
    setContactCreationDirectoryIds(initialDirectoryIds());
    setCreatingContact(true);
  }

  function startCreatingHorse() {
    setHorseCreationDirectoryIds(initialDirectoryIds());
    setCreatingHorse(true);
  }

  async function syncContactDirectories(contact: Contact, selectedIds: Set<string>) {
    for (const organizationDiscipline of organizationDisciplines) {
      if (selectedIds.has(organizationDiscipline.id)) {
        await onLinkContactToDirectory({
          organization_discipline_id: organizationDiscipline.id,
          contact_id: contact.id,
          created_by_user_id: createdByUserId,
        });
      } else {
        await onUnlinkContactFromDirectory(organizationDiscipline.id, contact.id);
      }
    }
  }

  async function syncHorseDirectories(horse: Horse, selectedIds: Set<string>) {
    for (const organizationDiscipline of organizationDisciplines) {
      if (selectedIds.has(organizationDiscipline.id)) {
        await onLinkHorseToDirectory({
          organization_discipline_id: organizationDiscipline.id,
          horse_id: horse.id,
          created_by_user_id: createdByUserId,
        });
      } else {
        await onUnlinkHorseFromDirectory(organizationDiscipline.id, horse.id);
      }
    }
  }

  async function createContactInSelectedDirectories(input: Parameters<typeof createContact>[0], selectedIds: Set<string>) {
    const contact = await onCreateContact(input);
    await syncContactDirectories(contact, selectedIds);
    return contact;
  }

  async function createHorseInSelectedDirectories(input: Parameters<typeof createHorse>[0]) {
    const horse = await onCreateHorse(input);
    await syncHorseDirectories(horse, horseCreationDirectoryIds);
    return horse;
  }

  async function linkExistingContactToSelectedDirectories(candidate: ContactIdentityCandidate) {
    for (const organizationDisciplineId of contactCreationDirectoryIds) {
      await onLinkContactToDirectory({
        organization_discipline_id: organizationDisciplineId,
        contact_id: candidate.contact_id,
        created_by_user_id: createdByUserId,
      });
    }
    setCreatingContact(false);
  }

  async function linkExistingHorseToSelectedDirectories(candidate: HorseIdentityCandidate) {
    for (const organizationDisciplineId of horseCreationDirectoryIds) {
      await onLinkHorseToDirectory({
        organization_discipline_id: organizationDisciplineId,
        horse_id: candidate.horse_id,
        created_by_user_id: createdByUserId,
      });
    }
    setCreatingHorse(false);
  }

  async function linkExistingContactToHorseDirectories(candidate: ContactIdentityCandidate) {
    for (const organizationDisciplineId of horseCreationDirectoryIds) {
      await onLinkContactToDirectory({
        organization_discipline_id: organizationDisciplineId,
        contact_id: candidate.contact_id,
        created_by_user_id: createdByUserId,
      });
    }
  }

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
            <button className="primary-button" data-testid="create-contact-button" disabled={!organization || !organizationDisciplines.length} type="button" onClick={startCreatingContact}>
              <Plus size={18} />
              {uiText(locale, "Contact", "Contact")}
            </button>
            <button className="primary-button" data-testid="create-horse-button" disabled={!organization || !organizationDisciplines.length} type="button" onClick={startCreatingHorse}>
              <Plus size={18} />
              {uiText(locale, "Cheval", "Horse")}
            </button>
          </div>
        </div>
      </section>

      {creatingContact ? (
        <ModalDialog description={organization ? organization.name : uiText(locale, "Crée une association d'abord.", "Create an organization first.")} eyebrow={uiText(locale, "Répertoire", "Directory")} title={uiText(locale, "Nouveau contact", "New contact")} onClose={() => setCreatingContact(false)}>
          <DirectoryCreationPicker
            locale={locale}
            disciplines={disciplines}
            organizationDisciplines={organizationDisciplines}
            selectedIds={contactCreationDirectoryIds}
            onChange={setContactCreationDirectoryIds}
          />
          <ContactForm
            locale={locale}
            allowCredentialReview
            createdByUserId={createdByUserId}
            externalCredentialIssuers={externalCredentialIssuers}
            externalCredentialProducts={externalCredentialProducts}
            membershipRequirements={membershipRequirements}
            organization={organization}
            onCreateContact={(input) => createContactInSelectedDirectories(input, contactCreationDirectoryIds)}
            onDismissIdentityCandidate={(candidate) => dismissContactIdentityCandidate({
              organization_id: organization?.id ?? "",
              contact_id: candidate.contact_id,
              search_signature: candidate.search_signature,
              reason: "confirmed_distinct_by_staff",
            })}
            onSearchIdentityCandidates={searchContactIdentityCandidates}
            onUseExistingContact={linkExistingContactToSelectedDirectories}
            onVerifyNrhaMember={onVerifyNrhaMember}
            onCreated={() => setCreatingContact(false)}
          />
        </ModalDialog>
      ) : null}

      {creatingHorse ? (
        <ModalDialog description={contacts.length ? uiText(locale, "Connecte le cheval à un propriétaire.", "Connect the horse to an owner.") : uiText(locale, "Crée un contact propriétaire directement dans ce formulaire au besoin.", "Create an owner contact directly in this form if needed.")} eyebrow={uiText(locale, "Répertoire", "Directory")} title={uiText(locale, "Nouveau cheval", "New horse")} onClose={() => setCreatingHorse(false)}>
          <DirectoryCreationPicker
            locale={locale}
            disciplines={disciplines}
            organizationDisciplines={organizationDisciplines}
            selectedIds={horseCreationDirectoryIds}
            onChange={setHorseCreationDirectoryIds}
          />
          <HorseForm
            locale={locale}
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={createdByUserId}
            externalCredentialIssuers={externalCredentialIssuers}
            organization={organization}
            onCreateContact={(input) => createContactInSelectedDirectories(input, horseCreationDirectoryIds)}
            onCreateHorse={createHorseInSelectedDirectories}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onDismissContactIdentityCandidate={(candidate) => dismissContactIdentityCandidate({
              organization_id: organization?.id ?? "",
              contact_id: candidate.contact_id,
              search_signature: candidate.search_signature,
              reason: "confirmed_distinct_by_staff",
            })}
            onDismissIdentityCandidate={(candidate) => dismissHorseIdentityCandidate({
              organization_id: organization?.id ?? "",
              horse_id: candidate.horse_id,
              search_signature: candidate.search_signature,
              reason: "confirmed_distinct_by_staff",
            })}
            onSearchContactIdentityCandidates={searchContactIdentityCandidates}
            onSearchIdentityCandidates={searchHorseIdentityCandidates}
            onUseExistingContact={linkExistingContactToHorseDirectories}
            onUseExistingHorse={linkExistingHorseToSelectedDirectories}
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
            allowCredentialReview
            contact={editingContact}
            contactExternalIdentifiers={contactExternalIdentifiers}
            externalCredentialIssuers={externalCredentialIssuers}
            externalCredentialProducts={externalCredentialProducts}
            membershipRequirements={membershipRequirements}
            onCancel={() => setEditingContact(null)}
            onVerifyNrhaMember={onVerifyNrhaMember}
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
            createdByUserId={createdByUserId}
            externalCredentialIssuers={externalCredentialIssuers}
            horseExternalIdentifiers={horseExternalIdentifiers}
            horseHealthDocuments={horseHealthDocuments}
            horseContacts={horseContacts}
            organization={organization}
            horse={editingHorse}
            onCancel={() => setEditingHorse(null)}
            onCreateContact={onCreateContact}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onUpdateHorse={async (id, input) => {
              await onUpdateHorse(id, input);
              setEditingHorse(null);
            }}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onVerifyNrhaHorse={onVerifyNrhaHorse}
          />
        </ModalDialog>
      ) : null}

      {insuranceContact ? (
        <ModalDialog
          className="class-program-modal"
          description={contactLabel(insuranceContact)}
          eyebrow={uiText(locale, "Admissibilité", "Eligibility")}
          title={uiText(locale, "Preuves d’assurance", "Insurance evidence")}
          onClose={() => setInsuranceContact(null)}
        >
          <InsuranceEvidenceForm
            contact={insuranceContact}
            createdByUserId={createdByUserId}
            evidence={contactInsuranceEvidence.filter((item) => item.contact_id === insuranceContact.id)}
            issuers={externalCredentialIssuers}
            products={externalCredentialProducts}
            onRefresh={onRefresh}
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
            const contactDirectoryIds = new Set(
              directoryContacts
                .filter((directoryContact) => directoryContact.contact_id === contact.id)
                .map((directoryContact) => directoryContact.organization_discipline_id),
            );

            return (
              <div className="horse-list-row" key={contact.id}>
                <div className="horse-list-identity">
                  <strong>{contactLabel(contact)}</strong>
                  <span>{contact.barn_name || uiText(locale, "Contact", "Contact")}</span>
                  <DirectoryDisciplinePicker
                    locale={locale}
                    disciplines={disciplines}
                    organizationDisciplines={organizationDisciplines}
                    linkedOrganizationDisciplineIds={contactDirectoryIds}
                    onLink={(organizationDisciplineId) =>
                      onLinkContactToDirectory({
                        organization_discipline_id: organizationDisciplineId,
                        contact_id: contact.id,
                        created_by_user_id: createdByUserId,
                      })
                    }
                    onUnlink={(organizationDisciplineId) => onUnlinkContactFromDirectory(organizationDisciplineId, contact.id)}
                  />
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
                  <button className="text-button" type="button" onClick={() => setInsuranceContact(contact)}>
                    {uiText(locale, "Assurance", "Insurance")}
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
            const complianceResult = healthCompliance.results.find((result) => result.horse_id === horse.id);
            const healthTone = complianceResult ? healthComplianceTone(complianceResult.compliance_status) : "neutral";
            const referenceChips = horseExternalReferenceChips(horse, horseExternalIdentifiers, externalCredentialIssuers);
            const horseDirectoryIds = new Set(
              directoryHorses
                .filter((directoryHorse) => directoryHorse.horse_id === horse.id)
                .map((directoryHorse) => directoryHorse.organization_discipline_id),
            );

            return (
              <div className={`horse-list-row ${healthTone}`} key={horse.id}>
                <div className="horse-list-identity">
                  <strong>{horse.name}</strong>
                  <span>
                    {contactLabel(findById(contacts, horse.primary_owner_contact_id))} · {horseGenderLabel(horse.gender)}
                  </span>
                  <DirectoryDisciplinePicker
                    locale={locale}
                    disciplines={disciplines}
                    organizationDisciplines={organizationDisciplines}
                    linkedOrganizationDisciplineIds={horseDirectoryIds}
                    onLink={(organizationDisciplineId) =>
                      onLinkHorseToDirectory({
                        organization_discipline_id: organizationDisciplineId,
                        horse_id: horse.id,
                        created_by_user_id: createdByUserId,
                      })
                    }
                    onUnlink={(organizationDisciplineId) => onUnlinkHorseFromDirectory(organizationDisciplineId, horse.id)}
                  />
                </div>
                <div className="horse-list-status">
                  <span className={`horse-summary-pill ${healthTone}`}>
                    {healthCompliance.loading
                      ? uiText(locale, "Calcul en cours", "Calculating")
                      : healthCompliance.error
                        ? uiText(locale, "Statut indisponible", "Status unavailable")
                        : complianceResult
                          ? healthComplianceStatusLabel(complianceResult.compliance_status, locale)
                          : uiText(locale, "Non répertorié", "Not listed")}
                  </span>
                  {complianceResult ? <span className="muted-line">{healthComplianceReasonSummary(complianceResult, locale)}</span> : null}
                  {healthCompliance.error ? <span className="muted-line">{healthCompliance.error}</span> : null}
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
