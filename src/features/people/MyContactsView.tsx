import { useState } from "react";
import { Plus } from "lucide-react";
import { EmptyState, ModalDialog, ViewIntro } from "../../components/ui";
import { contactLabel, findById, formatCurrency, formatDate } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createContact, createContactOrganizationMembership, deleteContact, updateContact } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership, ContactOrganizationLink, ContactOrganizationMembership, ContactRole, ExternalOrganization, Organization, OrganizationExternalMembershipRequirement, OrganizationMembershipType } from "../../types/domain";
import { uiText, contactRoleSummary } from "../dashboard/shared";
import { ContactForm } from "./ContactForm";
import { ContactEditForm } from "./ContactEditForm";

function MyContactsView({
  locale,
  contacts,
  contactExternalMemberships,
  contactOrganizationLinks,
  contactOrganizationMemberships,
  contactRoles,
  externalOrganizations,
  membershipRequirements,
  organizationMembershipTypes,
  organizations,
  organization,
  profileId,
  onCreateContact,
  onCreateContactOrganizationMembership,
  onDeleteContact,
  onUpdateContact,
}: {
  locale: Locale;
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactOrganizationLinks: ContactOrganizationLink[];
  contactOrganizationMemberships: ContactOrganizationMembership[];
  contactRoles: ContactRole[];
  externalOrganizations: ExternalOrganization[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organizationMembershipTypes: OrganizationMembershipType[];
  organizations: Organization[];
  organization: Organization | null;
  profileId: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateContactOrganizationMembership: (input: Parameters<typeof createContactOrganizationMembership>[0]) => Promise<ContactOrganizationMembership>;
  onDeleteContact: (id: Parameters<typeof deleteContact>[0]) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
}) {
  const [creatingContact, setCreatingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [membershipContact, setMembershipContact] = useState<Contact | null>(null);
  const [membershipAssociationSearch, setMembershipAssociationSearch] = useState("");
  const [selectedMembershipOrganizationId, setSelectedMembershipOrganizationId] = useState("");
  const [buyingMembershipTypeId, setBuyingMembershipTypeId] = useState("");
  const canCreateLinkedContact = Boolean(organization && profileId);
  const defaultContactType: Contact["type"] = contacts.length ? "rider" : "owner";
  const activeMembershipTypes = organizationMembershipTypes.filter((type) => type.is_active);

  function membershipsForContact(contactId: string) {
    return contactOrganizationMemberships.filter((membership) => membership.contact_id === contactId && membership.status !== "cancelled");
  }

  function contactIsLinkedToOrganization(contact: Contact, organizationId: string) {
    return (
      contact.organization_id === organizationId
      || contactOrganizationLinks.some((link) => link.contact_id === contact.id && link.organization_id === organizationId)
    );
  }

  function membershipTypesForOrganization(organizationId: string) {
    return activeMembershipTypes.filter((type) => type.organization_id === organizationId);
  }

  function membershipOrganizationsForContact(contact: Contact) {
    return organizations.filter((candidate) => (
      contactIsLinkedToOrganization(contact, candidate.id)
      && membershipTypesForOrganization(candidate.id).length > 0
    ));
  }

  function contactHasMembershipType(contactId: string, membershipTypeId: string) {
    return membershipsForContact(contactId).some((membership) => membership.membership_type_id === membershipTypeId);
  }

  function openMembershipModal(contact: Contact) {
    const candidateOrganizations = membershipOrganizationsForContact(contact);
    const defaultOrganizationId = organization && candidateOrganizations.some((candidate) => candidate.id === organization.id)
      ? organization.id
      : candidateOrganizations[0]?.id ?? "";

    setMembershipAssociationSearch("");
    setSelectedMembershipOrganizationId(defaultOrganizationId);
    setMembershipContact(contact);
  }

  async function handleBuyMembership(membershipType: OrganizationMembershipType) {
    if (!membershipContact || !profileId) {
      return;
    }

    setBuyingMembershipTypeId(membershipType.id);

    try {
      await onCreateContactOrganizationMembership({
        organization_id: membershipType.organization_id,
        contact_id: membershipContact.id,
        membership_type_id: membershipType.id,
        show_id: null,
        payer_contact_id: membershipContact.id,
        status: "active",
        sold_by_user_id: profileId,
      });
      setMembershipContact(null);
    } finally {
      setBuyingMembershipTypeId("");
    }
  }

  async function handleDeleteContact(contact: Contact) {
    const label = contactLabel(contact);

    if (!window.confirm(uiText(locale, `Supprimer ${label}? Si ce contact est utilisé comme cavalier dans une inscription de test, il sera détaché de l'inscription.`, `Delete ${label}? If this contact is used as a rider in a test entry, it will be detached from the entry.`))) {
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
        eyebrow={uiText(locale, "Mon espace", "My space")}
        title={uiText(locale, "Mes cavaliers et contacts", "My riders and contacts")}
        description={uiText(locale, "Gère les propriétaires, cavaliers et payeurs liés à ton compte.", "Manage owners, riders and payers linked to your account.")}
        stats={[
          { label: "Contacts", value: String(contacts.length) },
          { label: uiText(locale, "Cavaliers", "Riders"), value: String(contacts.filter((contact) => contact.type === "rider").length) },
          { label: uiText(locale, "Cartes", "Memberships"), value: String(contactOrganizationMemberships.filter((membership) => membership.status !== "cancelled").length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{contacts.length ? uiText(locale, "Ajouter un cavalier / contact", "Add rider / contact") : uiText(locale, "Créer mon premier contact", "Create my first contact")}</h2>
            <p>{contacts.length ? uiText(locale, "Ajoute autant de cavaliers ou contacts que nécessaire sous ce compte.", "Add as many riders or contacts as needed under this account.") : uiText(locale, "Crée d'abord le contact principal du compte.", "Create the account's primary contact first.")}</p>
          </div>
          <button className="primary-button" disabled={!canCreateLinkedContact} type="button" onClick={() => setCreatingContact(true)}>
            <Plus size={18} />
            Contact
          </button>
        </div>
      </section>

      {creatingContact && canCreateLinkedContact ? (
        <ModalDialog eyebrow={uiText(locale, "Mon espace", "My space")} title={contacts.length ? uiText(locale, "Nouveau cavalier / contact", "New rider / contact") : uiText(locale, "Premier contact", "First contact")} onClose={() => setCreatingContact(false)}>
          <ContactForm
            locale={locale}
            key={defaultContactType}
            createdByUserId={profileId}
            defaultType={defaultContactType}
            linkedUserId={profileId}
            externalOrganizations={externalOrganizations}
            membershipRequirements={membershipRequirements}
            organization={organization}
            title={contacts.length ? uiText(locale, "Ajouter un cavalier / contact", "Add rider / contact") : uiText(locale, "Créer mon premier contact", "Create my first contact")}
            description={contacts.length ? uiText(locale, "Ajoute autant de cavaliers ou contacts que nécessaire sous ce compte.", "Add as many riders or contacts as needed under this account.") : uiText(locale, "Crée d'abord le contact principal du compte.", "Create the account's primary contact first.")}
            onCreateContact={onCreateContact}
            onCreated={() => setCreatingContact(false)}
          />
        </ModalDialog>
      ) : null}

      {editingContact ? (
        <ModalDialog description={contactLabel(editingContact)} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Modifier le contact", "Edit contact")} onClose={() => setEditingContact(null)}>
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

      {membershipContact ? (
        <ModalDialog description={contactLabel(membershipContact)} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Acheter une carte de membre", "Buy a membership")} onClose={() => setMembershipContact(null)}>
          {(() => {
            const availableOrganizations = membershipOrganizationsForContact(membershipContact);
            const normalizedSearch = membershipAssociationSearch.trim().toLowerCase();
            const filteredOrganizations = normalizedSearch
              ? availableOrganizations.filter((candidate) =>
                  [candidate.name, candidate.short_name, candidate.slug].filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch),
                )
              : availableOrganizations;
            const selectedOrganization = findById(availableOrganizations, selectedMembershipOrganizationId) ?? filteredOrganizations[0] ?? null;
            const selectedTypes = selectedOrganization ? membershipTypesForOrganization(selectedOrganization.id) : [];

            return (
              <div className="content-grid">
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>{uiText(locale, "Association", "Association")}</h2>
                      <p>{uiText(locale, "Recherche l'association qui vend la carte.", "Search the association selling the membership.")}</p>
                    </div>
                  </div>
                  <label>
                    {uiText(locale, "Rechercher", "Search")}
                    <input
                      placeholder={uiText(locale, "Nom de l'association", "Association name")}
                      value={membershipAssociationSearch}
                      onChange={(event) => setMembershipAssociationSearch(event.target.value)}
                    />
                  </label>
                  <div className="table">
                    {filteredOrganizations.map((candidate) => {
                      const typeCount = membershipTypesForOrganization(candidate.id).length;
                      return (
                        <button
                          className="text-button"
                          key={candidate.id}
                          type="button"
                          onClick={() => setSelectedMembershipOrganizationId(candidate.id)}
                        >
                          {candidate.name}
                          {candidate.id === selectedOrganization?.id ? ` · ${uiText(locale, "sélectionnée", "selected")}` : ""}
                          {` · ${typeCount} ${uiText(locale, "carte", "membership")}${typeCount > 1 ? "s" : ""}`}
                        </button>
                      );
                    })}
                    {!filteredOrganizations.length ? <EmptyState label={uiText(locale, "Aucune association disponible pour ce cavalier.", "No association is available for this rider.")} /> : null}
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>{uiText(locale, "Cartes disponibles", "Available memberships")}</h2>
                      <p>{selectedOrganization ? selectedOrganization.name : uiText(locale, "Choisis une association.", "Choose an association.")}</p>
                    </div>
                  </div>
                  <div className="table">
                    {selectedTypes.map((membershipType) => {
                      const alreadyLinked = contactHasMembershipType(membershipContact.id, membershipType.id);
                      const buying = buyingMembershipTypeId === membershipType.id;
                      return (
                        <div className="table-row" key={membershipType.id}>
                          <div>
                            <strong>{membershipType.name}</strong>
                            <p className="muted-line">
                              {membershipType.code ? `${membershipType.code} · ` : ""}
                              {membershipType.season_year} · {formatDate(membershipType.valid_from)} - {formatDate(membershipType.valid_until)}
                            </p>
                          </div>
                          <span>{formatCurrency(membershipType.price, selectedOrganization?.currency ?? "CAD")}</span>
                          <button className="text-button" disabled={alreadyLinked || buying} type="button" onClick={() => void handleBuyMembership(membershipType)}>
                            {buying
                              ? uiText(locale, "Achat...", "Buying...")
                              : alreadyLinked
                                ? uiText(locale, "Déjà liée", "Already linked")
                                : uiText(locale, "Acheter", "Buy")}
                          </button>
                        </div>
                      );
                    })}
                    {!selectedTypes.length ? <EmptyState label={uiText(locale, "Aucune carte active pour cette association.", "No active membership for this association.")} /> : null}
                  </div>
                </section>
              </div>
            );
          })()}
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Mes cavaliers", "My riders")}</h2>
            <p>{uiText(locale, "Contacts liés à mon compte.", "Contacts linked to my account.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Nom", "Name")}</span>
            <span>{uiText(locale, "Rôles", "Roles")}</span>
            <span>{uiText(locale, "Cartes", "Memberships")}</span>
            <span>Action</span>
          </div>
          {contacts.map((contact) => {
            const contactMemberships = membershipsForContact(contact.id);
            const availableMembershipOrganizationCount = membershipOrganizationsForContact(contact).length;

            return (
              <div className="table-row" key={contact.id}>
                <div>
                  <strong>{contactLabel(contact)}</strong>
                  <p className="muted-line">{contact.email || uiText(locale, "Aucun courriel", "No email")}</p>
                </div>
                <span>{contactRoleSummary(contact, contactRoles, locale)}</span>
                <div className="horse-chip-row">
                  {contactMemberships.map((membership) => {
                    const membershipType = findById(organizationMembershipTypes, membership.membership_type_id);
                    const membershipOrganization = findById(organizations, membership.organization_id);
                    return (
                      <span className={membership.status === "active" ? "horse-status-chip success" : "horse-status-chip neutral"} key={membership.id}>
                        <span>{membershipOrganization?.short_name || membershipOrganization?.name || uiText(locale, "Carte", "Membership")}</span>
                        <strong>
                          {membershipType ? `${membershipType.code ?? membershipType.name} ${membership.season_year}` : membership.season_year}
                        </strong>
                        <span>{formatDate(membership.valid_until)}</span>
                      </span>
                    );
                  })}
                  {!contactMemberships.length ? <span className="muted-line">{uiText(locale, "Aucune carte", "No membership")}</span> : null}
                </div>
                <div className="row-actions">
                  <button className="text-button" disabled={!availableMembershipOrganizationCount} type="button" onClick={() => openMembershipModal(contact)}>
                    {uiText(locale, "Acheter une carte de membre", "Buy a membership")}
                  </button>
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
          {!contacts.length ? <EmptyState label={uiText(locale, "Crée ton premier contact pour commencer.", "Create your first contact to get started.")} /> : null}
        </div>
      </section>
    </div>
  );
}

export { MyContactsView };
