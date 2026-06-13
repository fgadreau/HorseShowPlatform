import { useEffect, useMemo, useRef, useState } from "react";
import { Globe2, Lock, X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { Locale } from "../lib/i18n";
import { contactLabel, findById, itemSearchLabel } from "../lib/display";
import type { Contact, ContactInput, ContactRole, ContactRoleName, Organization, PlanTier } from "../types/domain";
import type { Notice } from "../types/ui";
import { getPlanLabel } from "../utils/planFeatures";

function uiText(locale: Locale, fr: string, en: string) {
  return locale === "en" ? en : fr;
}

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

export function ModalDialog({
  children,
  className = "",
  description,
  eyebrow,
  title,
  onClose,
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  title: string;
  onClose: () => void;
}) {
  const titleId = useMemo(() => `modal-${Math.random().toString(36).slice(2)}`, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop">
      <section aria-labelledby={titleId} aria-modal="true" className={`assistant-modal form-modal ${className}`.trim()} role="dialog">
        <div className="assistant-modal-header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button aria-label="Close modal" className="icon-button" type="button" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function SearchSelect({
  allowEmpty = false,
  clearLabel = "Clear selection",
  disabled = false,
  emptyLabel = "No matches",
  items,
  maxVisibleItems = 30,
  placeholder,
  value,
  onChange,
}: {
  allowEmpty?: boolean;
  clearLabel?: string;
  disabled?: boolean;
  emptyLabel?: string;
  items: Array<{ id: string; label: string; detail?: string }>;
  maxVisibleItems?: number;
  placeholder: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const listId = useMemo(() => `search-${Math.random().toString(36).slice(2)}`, []);
  const selectedItem = findById(items, value);
  const selectedLabel = selectedItem ? itemSearchLabel(selectedItem) : "";
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(selectedLabel);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) {
      setInputValue(selectedLabel);
    }
  }, [open, selectedLabel]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = (normalizedQuery ? items.filter((item) => itemSearchLabel(item).toLowerCase().includes(normalizedQuery)) : items).slice(0, maxVisibleItems);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, items]);

  function handleInput(nextQuery: string) {
    setInputValue(nextQuery);
    setQuery(nextQuery);
    setOpen(true);

    if (allowEmpty && !nextQuery.trim()) {
      onChange("");
      return;
    }

    if (value && nextQuery !== selectedLabel) {
      onChange("");
    }
  }

  function handleSelect(item: { id: string; label: string; detail?: string }) {
    onChange(item.id);
    setInputValue(itemSearchLabel(item));
    setQuery("");
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setInputValue("");
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div className="search-select">
      <div className="search-select-control">
        <input
          ref={inputRef}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={open}
          aria-activedescendant={open && visibleItems[activeIndex] ? `${listId}-${visibleItems[activeIndex].id}` : undefined}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          value={inputValue}
          onBlur={() => {
            setOpen(false);
            setQuery("");
            setInputValue(selectedLabel);
          }}
          onChange={(event) => handleInput(event.target.value)}
          onFocus={(event) => {
            setOpen(true);
            setQuery("");
            setActiveIndex(0);
            event.currentTarget.select();
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.min(current + 1, Math.max(visibleItems.length - 1, 0)));
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((current) => Math.max(current - 1, 0));
            }

            if (event.key === "Enter" && open && visibleItems[activeIndex]) {
              event.preventDefault();
              handleSelect(visibleItems[activeIndex]);
            }

            if (event.key === "Escape") {
              setOpen(false);
              setQuery("");
              setInputValue(selectedLabel);
            }
          }}
        />
        {allowEmpty && selectedItem ? (
          <button aria-label={clearLabel} className="search-select-clear" title={clearLabel} type="button" onMouseDown={(event) => event.preventDefault()} onClick={handleClear}>
            <X size={14} />
          </button>
        ) : null}
      </div>
      {open && !disabled ? (
        <div className="search-select-menu" id={listId} role="listbox">
          {visibleItems.length ? (
            visibleItems.map((item, index) => (
              <button
                aria-selected={item.id === value}
                className={`${index === activeIndex ? "active" : ""} ${item.id === value ? "selected" : ""}`}
                id={`${listId}-${item.id}`}
                key={item.id}
                role="option"
                type="button"
                onClick={() => handleSelect(item)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span>{item.label}</span>
                {item.detail ? <small>{item.detail}</small> : null}
              </button>
            ))
          ) : (
            <span className="search-select-empty">{emptyLabel}</span>
          )}
        </div>
      ) : null}
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
  locale = "fr",
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
  locale?: Locale;
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
  const [errorMessage, setErrorMessage] = useState("");
  const visibleContacts = useMemo(() => {
    if (!createdContact || contacts.some((contact) => contact.id === createdContact.id)) {
      return contacts;
    }

    return [createdContact, ...contacts];
  }, [contacts, createdContact]);
  const roleLabel = contactRoleLabel(role, locale);

  async function handleCreate() {
    if (!organization || !firstName.trim() || !lastName.trim()) {
      return;
    }

    setBusy(true);
    setErrorMessage("");

    try {
      const contact = await onCreateContact({
        organization_id: organization.id,
        type: contactTypeForRole(role),
        roles: [role],
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        barn_name: barnName.trim(),
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
    } catch (error) {
      setErrorMessage(contactCreateErrorMessage(error, locale));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="contact-picker">
      <div className="contact-picker-field">
        <span className="contact-picker-label">{label}</span>
        <div className="contact-picker-row">
          <SearchSelect
            allowEmpty={allowEmpty}
            disabled={disabled || !visibleContacts.length}
            items={visibleContacts.map((contact) => ({
              id: contact.id,
              label: contactLabel(contact),
              detail: contactPickerDetail(contact, contactRoles, organization, locale),
            }))}
            clearLabel={uiText(locale, "Effacer la sélection", "Clear selection")}
            emptyLabel={uiText(locale, "Aucun résultat", "No matches")}
            placeholder={placeholder ?? uiText(locale, `Rechercher ${roleLabel.toLowerCase()}`, `Search ${roleLabel.toLowerCase()}`)}
            value={value}
            onChange={onChange}
          />
          <button
            className="ghost-button"
            disabled={disabled || !organization}
            type="button"
            onClick={() => {
              setCreating(true);
              setErrorMessage("");
            }}
          >
            + Contact
          </button>
        </div>
      </div>

      {creating ? (
        <ModalDialog
          className="contact-create-modal"
          description={uiText(locale, `Ce contact sera lié comme ${roleLabel.toLowerCase()}.`, `This contact will receive the ${roleLabel.toLowerCase()} role automatically.`)}
          eyebrow="Contact"
          title={uiText(locale, `Nouveau contact ${roleLabel.toLowerCase()}`, `New ${roleLabel.toLowerCase()}`)}
          onClose={() => {
            if (!busy) {
              setCreating(false);
              setErrorMessage("");
            }
          }}
        >
          <div className="contact-create-inline">
            <div className="form-grid">
              <label>
                {uiText(locale, "Prénom", "First name")}
                <input
                  required
                  value={firstName}
                  onChange={(event) => {
                    setFirstName(event.target.value);
                    setErrorMessage("");
                  }}
                />
              </label>
              <label>
                {uiText(locale, "Nom", "Last name")}
                <input
                  required
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    setErrorMessage("");
                  }}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                {uiText(locale, "Courriel", "Email")}
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setErrorMessage("");
                  }}
                />
              </label>
              <label>
                {uiText(locale, "Téléphone", "Phone")}
                <input
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    setErrorMessage("");
                  }}
                />
              </label>
            </div>
            <label>
              {uiText(locale, "Écurie", "Barn")}
              <input
                value={barnName}
                onChange={(event) => {
                  setBarnName(event.target.value);
                  setErrorMessage("");
                }}
              />
            </label>
            {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
            <button className="primary-button" disabled={busy || !firstName.trim() || !lastName.trim()} type="button" onClick={handleCreate}>
              {busy ? uiText(locale, "Création...", "Creating...") : uiText(locale, "Créer et sélectionner", "Create and select")}
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </div>
  );
}

function contactCreateErrorMessage(error: unknown, locale: Locale) {
  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message ?? "";

  if (maybeError.code === "23505" || message.toLowerCase().includes("duplicate key")) {
    return uiText(locale, "Un contact avec ces informations existe déjà. Cherche-le dans la liste et sélectionne-le.", "A contact with this information already exists. Search for it in the list and select it.");
  }

  return message || uiText(locale, "Impossible de créer le contact pour l'instant.", "Unable to create the contact right now.");
}

function contactRoleSummary(contact: Contact, contactRoles: ContactRole[], locale: Locale = "fr") {
  const roles = contactRoles.filter((role) => role.contact_id === contact.id).map((role) => contactRoleLabel(role.role, locale));

  return roles.length ? Array.from(new Set(roles)).join(" / ") : contactRoleLabel(contact.type, locale);
}

function contactPickerDetail(contact: Contact, contactRoles: ContactRole[], organization: Organization | null, locale: Locale) {
  const scope = organization && contact.organization_id !== organization.id ? uiText(locale, "Ailleurs dans l'app", "Elsewhere in the app") : uiText(locale, "Association active", "Active organization");
  return `${contactRoleSummary(contact, contactRoles, locale)} - ${scope}`;
}

function contactRoleLabel(role: ContactRoleName, locale: Locale = "fr") {
  switch (role) {
    case "owner":
      return uiText(locale, "Propriétaire", "Owner");
    case "agent":
      return "Agent";
    case "rider":
      return uiText(locale, "Cavalier", "Rider");
    case "payer":
      return uiText(locale, "Payeur", "Payer");
    case "booker":
      return uiText(locale, "Réservataire", "Booker");
    case "other":
      return uiText(locale, "Autre", "Other");
    default:
      return "Contact";
  }
}

function contactTypeForRole(role: ContactRoleName): Contact["type"] {
  return role === "booker" ? "payer" : role;
}

export function FormActions({
  busy,
  cancelLabel = "Cancel",
  disabled = false,
  saveLabel = "Save changes",
  onCancel,
}: {
  busy: boolean;
  cancelLabel?: string;
  disabled?: boolean;
  saveLabel?: string;
  onCancel: () => void;
}) {
  return (
    <div className="form-actions">
      <button className="primary-button" disabled={busy || disabled} type="submit">
        {saveLabel}
      </button>
      <button className="ghost-button" disabled={busy} type="button" onClick={onCancel}>
        {cancelLabel}
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

export function UpgradePrompt({
  feature,
  requiredPlan,
}: {
  feature: string;
  requiredPlan: PlanTier;
}) {
  return (
    <div className="upgrade-prompt">
      <Lock size={24} />
      <h3>{feature}</h3>
      <p>Cette fonctionnalité est disponible à partir du plan <strong>{getPlanLabel(requiredPlan)}</strong>.</p>
      <a className="button button-primary" href="mailto:support@horseshowplatform.com?subject=Upgrade plan">
        Contacter pour activer
      </a>
    </div>
  );
}
