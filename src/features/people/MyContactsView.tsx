import { useState } from "react";
import { Plus } from "lucide-react";
import { EmptyState, ModalDialog, ViewIntro } from "../../components/ui";
import { contactLabel, findById } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createContact, deleteContact, updateContact, setOrganizationExternalMembershipRequirement } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership, ContactRole, ExternalOrganization, Organization, OrganizationExternalMembershipRequirement } from "../../types/domain";
import { uiText, contactRoleSummary } from "../dashboard/shared";
import { ContactForm } from "./ContactForm";
import { ContactEditForm } from "./ContactEditForm";

function MyContactsView({
  locale,
  contacts,
  contactExternalMemberships,
  contactRoles,
  externalOrganizations,
  membershipRequirements,
  organization,
  profileId,
  onCreateContact,
  onDeleteContact,
  onUpdateContact,
}: {
  locale: Locale;
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactRoles: ContactRole[];
  externalOrganizations: ExternalOrganization[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  profileId: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onDeleteContact: (id: Parameters<typeof deleteContact>[0]) => Promise<void>;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
}) {
  const [creatingContact, setCreatingContact] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const canCreateLinkedContact = Boolean(organization && profileId);
  const defaultContactType: Contact["type"] = contacts.length ? "rider" : "owner";

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
            <span>{uiText(locale, "Courriel", "Email")}</span>
            <span>Action</span>
          </div>
          {contacts.map((contact) => (
            <div className="table-row" key={contact.id}>
              <strong>{contactLabel(contact)}</strong>
              <span>{contactRoleSummary(contact, contactRoles, locale)}</span>
              <span>{contact.email || uiText(locale, "Aucun courriel", "No email")}</span>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingContact(contact)}>
                  {uiText(locale, "Modifier", "Edit")}
                </button>
                <button className="text-button danger-text" type="button" onClick={() => handleDeleteContact(contact)}>
                  {uiText(locale, "Supprimer", "Delete")}
                </button>
              </div>
            </div>
          ))}
          {!contacts.length ? <EmptyState label={uiText(locale, "Crée ton premier contact pour commencer.", "Create your first contact to get started.")} /> : null}
        </div>
      </section>
    </div>
  );
}

export { MyContactsView };
