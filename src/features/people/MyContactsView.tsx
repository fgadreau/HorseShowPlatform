import { useState } from "react";
import { Plus } from "lucide-react";
import { EmptyState, ModalDialog, ViewIntro } from "../../components/ui";
import { contactLabel, findById, formatCurrency, formatDate } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createContact, createContactOrganizationMembership, deleteContact, updateContact } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership, ContactOrganizationMembership, ContactRole, ExternalOrganization, Organization, OrganizationExternalMembershipRequirement, OrganizationMembershipType } from "../../types/domain";
import { uiText, contactRoleSummary } from "../dashboard/shared";
import { ContactForm } from "./ContactForm";
import { ContactEditForm } from "./ContactEditForm";

function MyContactsView({
  locale,
  contacts,
  contactExternalMemberships,
  contactOrganizationMemberships,
  contactRoles,
  externalOrganizations,
  membershipRequirements,
  organizationMembershipTypes,
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
  contactOrganizationMemberships: ContactOrganizationMembership[];
  contactRoles: ContactRole[];
  externalOrganizations: ExternalOrganization[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organizationMembershipTypes: OrganizationMembershipType[];
  organization: Organization | null;
  profileId: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateContactOrganizationMembership: (input: Parameters<typeof createContactOrganizationMembership>[0]) => Promise<ContactOrganizationMembership>;
  onDeleteContact: (id: Parameters<typeof deleteContact>[0]) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
}) {
  const [creatingContact, setCreatingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [membershipTypeByContact, setMembershipTypeByContact] = useState<Record<string, string>>({});
  const [buyingMembershipContactId, setBuyingMembershipContactId] = useState("");
  const canCreateLinkedContact = Boolean(organization && profileId);
  const defaultContactType: Contact["type"] = contacts.length ? "rider" : "owner";
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

  async function handleBuyMembership(contact: Contact) {
    const membershipTypeId = selectedMembershipTypeId(contact.id);

    if (!organization || !membershipTypeId || !profileId) {
      return;
    }

    setBuyingMembershipContactId(contact.id);

    try {
      await onCreateContactOrganizationMembership({
        organization_id: organization.id,
        contact_id: contact.id,
        membership_type_id: membershipTypeId,
        show_id: null,
        payer_contact_id: contact.id,
        status: "active",
        sold_by_user_id: profileId,
      });
    } finally {
      setBuyingMembershipContactId("");
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
            const membershipTypeId = selectedMembershipTypeId(contact.id);
            const selectedMembershipType = findById(activeMembershipTypes, membershipTypeId);
            const alreadyHasSelectedMembership = membershipTypeId ? contactHasMembershipType(contact.id, membershipTypeId) : false;
            const buyingMembership = buyingMembershipContactId === contact.id;
            const canBuyMembership = Boolean(organization && selectedMembershipType && !alreadyHasSelectedMembership && !buyingMembership);

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
                    return (
                      <span className={membership.status === "active" ? "horse-status-chip success" : "horse-status-chip neutral"} key={membership.id}>
                        <span>{uiText(locale, "Carte", "Membership")}</span>
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
                  {activeMembershipTypes.length ? (
                    <>
                      <select
                        aria-label={uiText(locale, "Type de carte à acheter", "Membership type to buy")}
                        disabled={buyingMembership}
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
                      <button className="text-button" disabled={!canBuyMembership} type="button" onClick={() => void handleBuyMembership(contact)}>
                        {buyingMembership
                          ? uiText(locale, "Achat...", "Buying...")
                          : alreadyHasSelectedMembership
                            ? uiText(locale, "Déjà liée", "Already linked")
                            : uiText(locale, "Acheter carte", "Buy membership")}
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
          {!contacts.length ? <EmptyState label={uiText(locale, "Crée ton premier contact pour commencer.", "Create your first contact to get started.")} /> : null}
        </div>
      </section>
    </div>
  );
}

export { MyContactsView };
