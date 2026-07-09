import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { FormActions } from "../../components/ui";
import { contactLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { updateContact } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership, ExternalOrganization, Organization, OrganizationExternalMembershipRequirement } from "../../types/domain";
import { uiText, buildExternalMembershipFields } from "../dashboard/shared";

function ContactEditForm({
  locale = "fr",
  contact,
  contactExternalMemberships,
  externalOrganizations = [],
  membershipRequirements = [],
  onCancel,
  onUpdateContact,
}: {
  locale?: Locale;
  contact: Contact;
  contactExternalMemberships?: ContactExternalMembership[];
  externalOrganizations?: ExternalOrganization[];
  membershipRequirements?: OrganizationExternalMembershipRequirement[];
  onCancel: () => void;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
}) {
  const [type, setType] = useState<Contact["type"]>(contact.type);
  const [firstName, setFirstName] = useState(contact.first_name);
  const [lastName, setLastName] = useState(contact.last_name);
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [barnName, setBarnName] = useState(contact.barn_name ?? "");
  const [address, setAddress] = useState(contact.address ?? "");
  const [addressLine2, setAddressLine2] = useState(contact.address_line2 ?? "");
  const [city, setCity] = useState(contact.city ?? "");
  const [state, setState] = useState(contact.state ?? "");
  const [zipCode, setZipCode] = useState(contact.zip_code ?? "");
  const [country, setCountry] = useState(contact.country ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(contact.date_of_birth ?? "");
  const [membershipNumbers, setMembershipNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries((contactExternalMemberships ?? []).filter((membership) => membership.contact_id === contact.id).map((membership) => [membership.external_organization_id, membership.membership_number])),
  );
  const [busy, setBusy] = useState(false);
  const externalMembershipFields = useMemo(
    () => buildExternalMembershipFields(type, externalOrganizations, membershipRequirements, contactExternalMemberships?.filter((membership) => membership.contact_id === contact.id) ?? []),
    [contact.id, contactExternalMemberships, externalOrganizations, membershipRequirements, type],
  );
  const missingRequiredMembership = externalMembershipFields.some((field) => field.required && !membershipNumbers[field.organization.id]?.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateContact(contact.id, {
        type,
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        barn_name: barnName || null,
        address: address || null,
        address_line2: addressLine2 || null,
        city: city || null,
        state: state || null,
        zip_code: zipCode || null,
        country: country || null,
        date_of_birth: dateOfBirth || null,
        external_memberships: externalMembershipFields.map((field) => ({
          external_organization_id: field.organization.id,
          membership_number: membershipNumbers[field.organization.id] ?? "",
          status: "unknown",
        })),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier le contact", "Edit contact")}</h2>
          <p>{contactLabel(contact)}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          Type
          <select value={type} onChange={(event) => setType(event.target.value as Contact["type"])}>
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
            <input required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Nom", "Last name")}
            <input required value={lastName} onChange={(event) => setLastName(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Courriel", "Email")}
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Téléphone", "Phone")}
            <input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </label>
        </div>
        <label>
          {uiText(locale, "Écurie", "Barn")}
          <input value={barnName} onChange={(event) => setBarnName(event.target.value)} />
        </label>
        <label>
          {uiText(locale, "Adresse", "Address")}
          <input value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label>
          {uiText(locale, "Appartement, suite, unité", "Apartment, suite, unit")}
          <input value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Ville", "City")}
            <input value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Province / État", "Province / State")}
            <input value={state} onChange={(event) => setState(event.target.value)} />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Code postal", "Postal code")}
            <input value={zipCode} onChange={(event) => setZipCode(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Pays", "Country")}
            <input value={country} onChange={(event) => setCountry(event.target.value)} />
          </label>
        </div>
        <label>
          {uiText(locale, "Date de naissance", "Date of birth")}
          <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
        </label>
        {externalMembershipFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>{uiText(locale, "Numéros de membre externes", "External membership numbers")}</strong>
              <span>{uiText(locale, "Ces informations pourront être vérifiées par intégration externe plus tard.", "This information can be verified through an external integration later.")}</span>
            </div>
            {externalMembershipFields.map((field) => (
              <label key={field.organization.id}>
                {field.organization.code} #
                <input
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
        <FormActions busy={busy} cancelLabel={uiText(locale, "Annuler", "Cancel")} disabled={missingRequiredMembership} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

export { ContactEditForm };
