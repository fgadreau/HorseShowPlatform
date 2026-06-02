import { useEffect, useMemo, useState } from "react";
import { Globe2 } from "lucide-react";
import type { ComponentType, FormEvent } from "react";
import type { Locale } from "../lib/i18n";
import { contactLabel, findById, itemSearchLabel } from "../lib/display";
import type { Contact, ContactInput, ContactRole, ContactRoleName, Organization } from "../types/domain";
import type { Notice } from "../types/ui";

export function LanguageToggle({ locale, onLocaleChange }: { locale: Locale; onLocaleChange: (locale: Locale) => void }) {
  return (
    <div className="language-toggle" aria-label="Language">
      <Globe2 size={16} />
      <button className={locale === "fr" ? "active" : ""} type="button" onClick={() => onLocaleChange("fr")}>
        FR
      </button>
      <button className={locale === "en" ? "active" : ""} type="button" onClick={() => onLocaleChange("en")}>
        EN
      </button>
    </div>
  );
}

export function SearchSelect({
  allowEmpty = false,
  disabled = false,
  items,
  placeholder,
  value,
  onChange,
}: {
  allowEmpty?: boolean;
  disabled?: boolean;
  items: Array<{ id: string; label: string; detail?: string }>;
  placeholder: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const listId = useMemo(() => `search-${Math.random().toString(36).slice(2)}`, []);
  const selectedItem = findById(items, value);
  const [query, setQuery] = useState(selectedItem ? itemSearchLabel(selectedItem) : "");

  useEffect(() => {
    const nextItem = findById(items, value);
    setQuery(nextItem ? itemSearchLabel(nextItem) : "");
  }, [items, value]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = items.filter((item) => itemSearchLabel(item).toLowerCase().includes(normalizedQuery)).slice(0, 30);

  function handleInput(nextQuery: string) {
    setQuery(nextQuery);

    if (allowEmpty && !nextQuery.trim()) {
      onChange("");
      return;
    }

    const exactMatch = items.find((item) => itemSearchLabel(item).toLowerCase() === nextQuery.trim().toLowerCase());
    onChange(exactMatch?.id ?? "");
  }

  return (
    <div className="search-select">
      <input
        disabled={disabled}
        list={listId}
        placeholder={placeholder}
        value={query}
        onBlur={() => {
          if (!allowEmpty && !findById(items, value)) {
            setQuery("");
          }
        }}
        onChange={(event) => handleInput(event.target.value)}
      />
      <datalist id={listId}>
        {visibleItems.map((item) => (
          <option key={item.id} value={itemSearchLabel(item)} />
        ))}
      </datalist>
    </div>
  );
}

export function ContactPicker({
  allowEmpty = false,
  contacts,
  contactRoles = [],
  createdByUserId,
  disabled = false,
  label,
  linkedUserId,
  organization,
  placeholder,
  role,
  value,
  onChange,
  onCreateContact,
}: {
  allowEmpty?: boolean;
  contacts: Contact[];
  contactRoles?: ContactRole[];
  createdByUserId?: string;
  disabled?: boolean;
  label: string;
  linkedUserId?: string;
  organization: Organization | null;
  placeholder?: string;
  role: ContactRoleName;
  value: string;
  onChange: (contactId: string) => void;
  onCreateContact: (input: ContactInput) => Promise<Contact>;
}) {
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createdContact, setCreatedContact] = useState<Contact | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [barnName, setBarnName] = useState("");
  const visibleContacts = useMemo(() => {
    if (!createdContact || contacts.some((contact) => contact.id === createdContact.id)) {
      return contacts;
    }

    return [createdContact, ...contacts];
  }, [contacts, createdContact]);
  const roleLabel = contactRoleLabel(role);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setBusy(true);

    try {
      const contact = await onCreateContact({
        organization_id: organization.id,
        type: contactTypeForRole(role),
        roles: [role],
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        barn_name: barnName,
        linked_user_id: linkedUserId,
        created_by_user_id: createdByUserId,
      });
      setCreatedContact(contact);
      onChange(contact.id);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setBarnName("");
      setCreating(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="contact-picker">
      <label>
        {label}
        <div className="contact-picker-row">
          <SearchSelect
            allowEmpty={allowEmpty}
            disabled={disabled || !visibleContacts.length}
            items={visibleContacts.map((contact) => ({
              id: contact.id,
              label: contactLabel(contact),
              detail: contactRoleSummary(contact, contactRoles),
            }))}
            placeholder={placeholder ?? `Search ${roleLabel.toLowerCase()}`}
            value={value}
            onChange={onChange}
          />
          <button className="ghost-button" disabled={disabled || !organization} type="button" onClick={() => setCreating((current) => !current)}>
            {creating ? "Close" : "+ Contact"}
          </button>
        </div>
      </label>

      {creating ? (
        <form className="contact-create-inline" onSubmit={handleCreate}>
          <div className="inline-form-header">
            <strong>New {roleLabel.toLowerCase()}</strong>
            <span>This contact will receive the {roleLabel.toLowerCase()} role automatically.</span>
          </div>
          <div className="form-grid">
            <label>
              First name
              <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
            </label>
            <label>
              Last name
              <input required value={lastName} onChange={(event) => setLastName(event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              Phone
              <input value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
          </div>
          <label>
            Barn
            <input value={barnName} onChange={(event) => setBarnName(event.target.value)} />
          </label>
          <button className="primary-button" disabled={busy} type="submit">
            Create and select
          </button>
        </form>
      ) : null}
    </div>
  );
}

function contactRoleSummary(contact: Contact, contactRoles: ContactRole[]) {
  const roles = contactRoles.filter((role) => role.contact_id === contact.id).map((role) => contactRoleLabel(role.role));

  return roles.length ? Array.from(new Set(roles)).join(" / ") : contactRoleLabel(contact.type);
}

function contactRoleLabel(role: ContactRoleName) {
  switch (role) {
    case "owner":
      return "Owner";
    case "agent":
      return "Agent";
    case "rider":
      return "Rider";
    case "payer":
      return "Payer";
    case "booker":
      return "Booker";
    case "other":
      return "Other";
    default:
      return "Contact";
  }
}

function contactTypeForRole(role: ContactRoleName): Contact["type"] {
  return role === "booker" ? "payer" : role;
}

export function FormActions({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="form-actions">
      <button className="primary-button" disabled={busy} type="submit">
        Save changes
      </button>
      <button className="ghost-button" disabled={busy} type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

export function Metric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail?: string;
  icon?: ComponentType<{ size?: number }>;
  label: string;
  value: string;
}) {
  return (
    <section className="metric">
      <div className="metric-label">
        <span>{label}</span>
        {Icon ? <Icon size={18} /> : null}
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </section>
  );
}

export function ViewIntro({
  description,
  eyebrow,
  stats = [],
  title,
}: {
  description: string;
  eyebrow: string;
  stats?: Array<{ label: string; value: string }>;
  title: string;
}) {
  return (
    <section className="view-intro span-2">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {stats.length ? (
        <div className="view-intro-stats">
          {stats.map((stat) => (
            <span key={stat.label}>
              <strong>{stat.value}</strong>
              {stat.label}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function WorkflowStep({ icon: Icon, label, state }: { icon: ComponentType<{ size?: number }>; label: string; state: string }) {
  return (
    <div className="workflow-step">
      <Icon size={20} />
      <div>
        <strong>{label}</strong>
        <span>{state}</span>
      </div>
    </div>
  );
}

export function NoticeBanner({ notice }: { notice: Notice }) {
  return <div className={`notice ${notice.tone}`}>{notice.message}</div>;
}

export function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}
