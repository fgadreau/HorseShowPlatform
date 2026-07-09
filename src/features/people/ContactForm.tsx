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
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [barnName, setBarnName] = useState("");
  const [address, setAddress] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country, setCountry] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [membershipNumbers, setMembershipNumbers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const externalMembershipFields = useMemo(
    () => buildExternalMembershipFields(defaultType, externalOrganizations, membershipRequirements),
    [defaultType, externalOrganizations, membershipRequirements],
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
        type: defaultType,
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        barn_name: barnName,
        address,
        address_line2: addressLine2,
        city,
        state,
        zip_code: zipCode,
        country,
        date_of_birth: dateOfBirth,
        linked_user_id: linkedUserId,
        created_by_user_id: createdByUserId,
        external_memberships: externalMembershipFields.map((field) => ({
          external_organization_id: field.organization.id,
          membership_number: membershipNumbers[field.organization.id] ?? "",
          status: "unknown",
        })),
      });
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setBarnName("");
      setAddress("");
      setAddressLine2("");
      setCity("");
      setState("");
      setZipCode("");
      setCountry("");
      setDateOfBirth("");
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
        <label>
          {uiText(locale, "Adresse", "Address")}
          <input disabled={!organization} value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label>
          {uiText(locale, "Appartement, suite, unité", "Apartment, suite, unit")}
          <input disabled={!organization} value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Ville", "City")}
            <input disabled={!organization} value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Province / État", "Province / State")}
            <input disabled={!organization} value={state} onChange={(event) => setState(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Code postal", "Postal code")}
            <input disabled={!organization} value={zipCode} onChange={(event) => setZipCode(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Pays", "Country")}
            <input disabled={!organization} value={country} onChange={(event) => setCountry(event.target.value)} />
          </label>
        </div>
        <label>
          {uiText(locale, "Date de naissance", "Date of birth")}
          <input disabled={!organization} type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
        </label>
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
