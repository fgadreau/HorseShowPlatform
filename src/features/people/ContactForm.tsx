import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { createContact } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership, ExternalOrganization, Organization, OrganizationExternalMembershipRequirement } from "../../types/domain";
import { uiText, buildExternalMembershipFields } from "../dashboard/shared";

function ContactForm({
  locale = "fr",
  createdByUserId,
  defaultType = "owner",
  description,
  externalOrganizations = [],
  linkedUserId,
  membershipRequirements = [],
  organization,
  title,
  onCreateContact,
  onCreated,
}: {
  locale?: Locale;
  createdByUserId?: string;
  defaultType?: Contact["type"];
  description?: string;
  externalOrganizations?: ExternalOrganization[];
  linkedUserId?: string;
  membershipRequirements?: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  title?: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreated?: () => void;
}) {
  const [type, setType] = useState<Contact["type"]>(defaultType);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [barnName, setBarnName] = useState("");
  const [membershipNumbers, setMembershipNumbers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const externalMembershipFields = useMemo(
    () => buildExternalMembershipFields(type, externalOrganizations, membershipRequirements),
    [externalOrganizations, membershipRequirements, type],
  );
  const missingRequiredMembership = externalMembershipFields.some((field) => field.required && !membershipNumbers[field.organization.id]?.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setBusy(true);

    try {
      await onCreateContact({
        organization_id: organization.id,
        type,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        barn_name: barnName,
        linked_user_id: linkedUserId,
        created_by_user_id: createdByUserId,
        external_memberships: externalMembershipFields.map((field) => ({
          external_organization_id: field.organization.id,
          membership_number: membershipNumbers[field.organization.id] ?? "",
          status: "unknown",
        })),
      });
      setType(defaultType);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setBarnName("");
      setMembershipNumbers({});
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title ?? uiText(locale, "Nouveau contact", "New contact")}</h2>
          <p>{description ?? (organization ? organization.name : uiText(locale, "Crée une association d'abord.", "Create an organization first."))}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Type
          <select disabled={!organization} value={type} onChange={(event) => setType(event.target.value as Contact["type"])}>
            <option value="owner">{uiText(locale, "Propriétaire", "Owner")}</option>
            <option value="agent">Agent</option>
            <option value="rider">{uiText(locale, "Cavalier", "Rider")}</option>
            <option value="payer">{uiText(locale, "Payeur", "Payer")}</option>
            <option value="other">{uiText(locale, "Autre", "Other")}</option>
          </select>
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Prénom", "First name")}
            <input disabled={!organization} required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Nom", "Last name")}
            <input disabled={!organization} required value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
        </div>
        <label>
          {uiText(locale, "Courriel", "Email")}
          <input disabled={!organization} type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Téléphone", "Phone")}
            <input disabled={!organization} value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Écurie", "Barn")}
            <input disabled={!organization} value={barnName} onChange={(event) => setBarnName(event.target.value)} />
          </label>
        </div>
        {externalMembershipFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>{uiText(locale, "Numéros de membre externes", "External membership numbers")}</strong>
              <span>{uiText(locale, "Les champs obligatoires dépendent de l'association active.", "Required fields depend on the active association.")}</span>
            </div>
            {externalMembershipFields.map((field) => (
              <label key={field.organization.id}>
                {field.organization.code} #
                <input
                  disabled={!organization}
                  required={field.required}
                  value={membershipNumbers[field.organization.id] ?? ""}
                  onChange={(event) =>
                    setMembershipNumbers((current) => ({
                      ...current,
                      [field.organization.id]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
          </div>
        ) : null}
        <button className="primary-button" disabled={busy || !organization || missingRequiredMembership} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer le contact", "Create contact")}
        </button>
      </form>
    </section>
  );
}

export { ContactForm };
