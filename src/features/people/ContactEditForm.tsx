import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { FormActions } from "../../components/ui";
import { contactLabel, errorMessage } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { updateContact, verifyNrhaMember } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership, ExternalOrganization, OrganizationExternalMembershipRequirement } from "../../types/domain";
import { uiText, buildExternalMembershipFields, InlineHealthMessage } from "../dashboard/shared";
import {
  integerFromMembershipNumber,
  nrhaMemberDataImportRows,
  nrhaMemberMismatchMessage,
  nrhaMemberStatus,
  nrhaMemberVerificationFromPayload,
  nrhaMemberVerificationPayload,
  nrhaOfficialMemberValues,
  type NrhaMemberDataImportRow,
  type NrhaMemberLocalValues,
  type NrhaMemberVerificationState,
} from "./nrhaMemberValidation";

function ContactEditForm({
  locale = "fr",
  contact,
  contactExternalMemberships,
  externalOrganizations = [],
  membershipRequirements = [],
  onCancel,
  onUpdateContact,
  onVerifyNrhaMember,
}: {
  locale?: Locale;
  contact: Contact;
  contactExternalMemberships?: ContactExternalMembership[];
  externalOrganizations?: ExternalOrganization[];
  membershipRequirements?: OrganizationExternalMembershipRequirement[];
  onCancel: () => void;
  onUpdateContact: (id: string, input: Parameters<typeof updateContact>[1]) => Promise<void>;
  onVerifyNrhaMember: (input: Parameters<typeof verifyNrhaMember>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaMember>>>;
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
  const [nrhaMemberBusy, setNrhaMemberBusy] = useState(false);
  const [nrhaMemberMessage, setNrhaMemberMessage] = useState<InlineHealthMessage | null>(null);
  const [nrhaMemberLookup, setNrhaMemberLookup] = useState<Awaited<ReturnType<typeof verifyNrhaMember>> | null>(null);
  const [nrhaMemberVerification, setNrhaMemberVerification] = useState<NrhaMemberVerificationState | null>(null);
  const [saveMessage, setSaveMessage] = useState<InlineHealthMessage | null>(null);
  const [busy, setBusy] = useState(false);
  const contactMemberships = useMemo(
    () => contactExternalMemberships?.filter((membership) => membership.contact_id === contact.id) ?? [],
    [contact.id, contactExternalMemberships],
  );
  const externalMembershipFields = useMemo(
    () => buildExternalMembershipFields(type, externalOrganizations, membershipRequirements, contactMemberships),
    [contactMemberships, externalOrganizations, membershipRequirements, type],
  );
  const nrhaExternalOrganization = externalMembershipFields.find((field) => field.organization.code.toUpperCase() === "NRHA")?.organization ?? null;
  const nrhaOrganizationId = nrhaExternalOrganization?.id ?? null;
  const currentNrhaMemberNumber = nrhaOrganizationId ? membershipNumbers[nrhaOrganizationId]?.trim() ?? "" : "";
  const existingNrhaMembership = nrhaOrganizationId
    ? contactMemberships.find((membership) => membership.external_organization_id === nrhaOrganizationId) ?? null
    : null;
  const existingNrhaLookup = nrhaMemberVerificationFromPayload(existingNrhaMembership?.verification_payload);
  const existingNrhaOfficialValues = existingNrhaLookup ? nrhaOfficialMemberValues(existingNrhaLookup, { memberNumber: existingNrhaMembership?.membership_number }) : null;
  const currentNrhaLocalValues: NrhaMemberLocalValues = {
    address,
    city,
    country,
    email,
    expiresOn: existingNrhaMembership?.expires_on ?? "",
    firstName,
    lastName,
    memberNumber: currentNrhaMemberNumber,
    phone,
    state,
    zipCode,
  };
  const existingNrhaRows = existingNrhaOfficialValues ? nrhaMemberDataImportRows(existingNrhaOfficialValues, currentNrhaLocalValues, locale) : [];
  const existingValidationStillCurrent =
    Boolean(existingNrhaMembership?.verification_source === "nrha_api" && existingNrhaLookup && existingNrhaRows.length === 0);
  const stateNrhaLocalValues: NrhaMemberLocalValues = {
    ...currentNrhaLocalValues,
    expiresOn: nrhaMemberVerification?.officialValues.expiresOn ?? currentNrhaLocalValues.expiresOn,
  };
  const stateNrhaRows = nrhaMemberVerification ? nrhaMemberDataImportRows(nrhaMemberVerification.officialValues, stateNrhaLocalValues, locale) : [];
  const stateValidationStillCurrent =
    Boolean(nrhaMemberVerification && nrhaMemberVerification.organizationId === nrhaOrganizationId && nrhaMemberVerification.memberNumber === currentNrhaMemberNumber && stateNrhaRows.length === 0);
  const verifiedNrhaMember: NrhaMemberVerificationState | null = stateValidationStillCurrent && nrhaMemberVerification
    ? nrhaMemberVerification
    : existingValidationStillCurrent && existingNrhaMembership && existingNrhaOfficialValues
      ? {
          memberNumber: currentNrhaMemberNumber,
          officialValues: existingNrhaOfficialValues,
          organizationId: existingNrhaMembership.external_organization_id,
          payload: existingNrhaMembership.verification_payload ?? (existingNrhaLookup ? nrhaMemberVerificationPayload(existingNrhaLookup) : {}),
        }
      : null;
  const activeNrhaOfficialValues = nrhaMemberLookup ? nrhaOfficialMemberValues(nrhaMemberLookup, { memberNumber: currentNrhaMemberNumber }) : existingNrhaOfficialValues;
  const displayNrhaLocalValues: NrhaMemberLocalValues = {
    ...currentNrhaLocalValues,
    expiresOn: verifiedNrhaMember?.officialValues.expiresOn ?? currentNrhaLocalValues.expiresOn,
  };
  const nrhaMemberRows = activeNrhaOfficialValues ? nrhaMemberDataImportRows(activeNrhaOfficialValues, displayNrhaLocalValues, locale) : [];
  const nrhaValidationWillReset =
    Boolean(existingNrhaMembership?.verification_source === "nrha_api" && existingNrhaLookup && !verifiedNrhaMember);
  const displayedNrhaMemberMessage: InlineHealthMessage | null =
    nrhaMemberMessage ??
    (verifiedNrhaMember
      ? {
          tone: "success",
          message: uiText(locale, "NRHA: membre validé. Si ces données changent, il faudra revalider.", "NRHA: member validated. If these details change, validation will be required again."),
        }
      : nrhaValidationWillReset
        ? {
            tone: "info",
            message: uiText(locale, "Validation NRHA à refaire: les données protégées ne correspondent plus à la fiche validée.", "NRHA validation required again: protected data no longer matches the validated record."),
          }
        : null);
  const missingRequiredMembership = externalMembershipFields.some((field) => field.required && !membershipNumbers[field.organization.id]?.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveMessage(null);
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
        external_memberships: externalMembershipFields.map((field) => {
          const verifiedMembership = verifiedNrhaMember && field.organization.id === verifiedNrhaMember.organizationId ? verifiedNrhaMember : null;

          return {
            external_organization_id: field.organization.id,
            membership_number: membershipNumbers[field.organization.id] ?? "",
            status: verifiedMembership ? nrhaMemberStatus(verifiedMembership.officialValues) : "unknown",
            expires_on: verifiedMembership ? verifiedMembership.officialValues.expiresOn || null : null,
            verified_at: verifiedMembership ? new Date().toISOString() : null,
            verification_payload: verifiedMembership ? verifiedMembership.payload : undefined,
            verification_source: verifiedMembership ? "nrha_api" : null,
          };
        }),
      });
    } catch (error) {
      setSaveMessage({
        tone: "error",
        message: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  function clearNrhaMemberValidation() {
    setNrhaMemberMessage(null);
    setNrhaMemberLookup(null);
    setNrhaMemberVerification(null);
  }

  async function handleVerifyNrhaMember() {
    const memberNumber = integerFromMembershipNumber(currentNrhaMemberNumber);

    setNrhaMemberMessage(null);
    setNrhaMemberLookup(null);
    setNrhaMemberVerification(null);

    if (!nrhaOrganizationId) {
      setNrhaMemberMessage({
        tone: "error",
        message: uiText(locale, "L'organisation externe NRHA doit être configurée avant la validation.", "The NRHA external organization must be configured before validation."),
      });
      return;
    }

    if (!memberNumber) {
      setNrhaMemberMessage({
        tone: "error",
        message: uiText(locale, "Entre un numéro de membre NRHA valide avant la validation.", "Enter a valid NRHA member number before validating."),
      });
      return;
    }

    if (!firstName.trim() || !lastName.trim()) {
      setNrhaMemberMessage({
        tone: "error",
        message: uiText(locale, "Prénom et nom sont requis pour valider NRHA.", "First name and last name are required for NRHA validation."),
      });
      return;
    }

    setNrhaMemberBusy(true);

    try {
      const verification = await onVerifyNrhaMember({
        emailAddress: email,
        firstName,
        fullName: [firstName, lastName].filter(Boolean).join(" "),
        lastName,
        memberNumber,
      });
      const officialValues = nrhaOfficialMemberValues(verification, { memberNumber });

      if (verification.status === "not_found" || !verification.member) {
        setNrhaMemberMessage({
          tone: "error",
          message: uiText(locale, "NRHA: aucun membre trouvé pour ce numéro.", "NRHA: no member found for this number."),
        });
        return;
      }

      setNrhaMemberLookup(verification);

      if (verification.status === "verified" && verification.matched) {
        setNrhaMemberVerification({
          memberNumber: String(memberNumber),
          officialValues,
          organizationId: nrhaOrganizationId,
          payload: nrhaMemberVerificationPayload(verification),
        });
        setNrhaMemberMessage({
          tone: "success",
          message: uiText(locale, "NRHA: membre confirmé.", "NRHA: member confirmed."),
        });
        return;
      }

      setNrhaMemberMessage({
        tone: "info",
        message: `${nrhaMemberMismatchMessage(verification, locale)} ${uiText(locale, "Tu peux importer les données officielles ci-dessous.", "You can import the official data below.")}`,
      });
    } catch (error) {
      setNrhaMemberMessage({
        tone: "error",
        message: errorMessage(error),
      });
    } finally {
      setNrhaMemberBusy(false);
    }
  }

  function handleApplyNrhaMemberData() {
    if (!activeNrhaOfficialValues || !nrhaOrganizationId) {
      return;
    }

    applyMemberValues(activeNrhaOfficialValues);
    setNrhaMemberVerification({
      memberNumber: activeNrhaOfficialValues.memberNumber || currentNrhaMemberNumber,
      officialValues: activeNrhaOfficialValues,
      organizationId: nrhaOrganizationId,
      payload: nrhaMemberLookup ? nrhaMemberVerificationPayload(nrhaMemberLookup) : existingNrhaMembership?.verification_payload ?? {},
    });
    setNrhaMemberMessage({
      tone: "success",
      message: uiText(locale, "Données NRHA importées et prêtes à enregistrer comme validées.", "NRHA data imported and ready to save as verified."),
    });
  }

  function applyMemberValues(values: ReturnType<typeof nrhaOfficialMemberValues>) {
    if (values.firstName) setFirstName(values.firstName);
    if (values.lastName) setLastName(values.lastName);
    if (values.email) setEmail(values.email);
    if (values.phone) setPhone(values.phone);
    if (values.address) setAddress(values.address);
    if (values.addressLine2) setAddressLine2(values.addressLine2);
    if (values.city) setCity(values.city);
    if (values.state) setState(values.state);
    if (values.zipCode) setZipCode(values.zipCode);
    if (values.country) setCountry(values.country);
    if (values.memberNumber && nrhaOrganizationId) {
      setMembershipNumbers((current) => ({
        ...current,
        [nrhaOrganizationId]: values.memberNumber,
      }));
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
            <input
              required
              value={firstName}
              onChange={(event) => {
                setFirstName(event.target.value);
                clearNrhaMemberValidation();
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
                clearNrhaMemberValidation();
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
                clearNrhaMemberValidation();
              }}
            />
          </label>
          <label>
            {uiText(locale, "Téléphone", "Phone")}
            <input
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                clearNrhaMemberValidation();
              }}
            />
          </label>
        </div>
        <label>
          {uiText(locale, "Écurie", "Barn")}
          <input value={barnName} onChange={(event) => setBarnName(event.target.value)} />
        </label>
        <label>
          {uiText(locale, "Adresse", "Address")}
          <input
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              clearNrhaMemberValidation();
            }}
          />
        </label>
        <label>
          {uiText(locale, "Appartement, suite, unité", "Apartment, suite, unit")}
          <input value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} />
        </label>
        <div className="form-grid">
          <label>
            {uiText(locale, "Ville", "City")}
            <input
              value={city}
              onChange={(event) => {
                setCity(event.target.value);
                clearNrhaMemberValidation();
              }}
            />
          </label>
          <label>
            {uiText(locale, "Province / État", "Province / State")}
            <input
              value={state}
              onChange={(event) => {
                setState(event.target.value);
                clearNrhaMemberValidation();
              }}
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Code postal", "Postal code")}
            <input
              value={zipCode}
              onChange={(event) => {
                setZipCode(event.target.value);
                clearNrhaMemberValidation();
              }}
            />
          </label>
          <label>
            {uiText(locale, "Pays", "Country")}
            <input
              value={country}
              onChange={(event) => {
                setCountry(event.target.value);
                clearNrhaMemberValidation();
              }}
            />
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
              <span>{uiText(locale, "Une validation NRHA existante est conservée seulement si les données protégées restent identiques.", "An existing NRHA validation is kept only if protected details remain identical.")}</span>
            </div>
            {externalMembershipFields.map((field) => (
              <label key={field.organization.id}>
                {field.organization.code} #
                <input
                  required={field.required}
                  value={membershipNumbers[field.organization.id] ?? ""}
                  onChange={(event) => {
                    setMembershipNumbers((current) => ({
                      ...current,
                      [field.organization.id]: event.target.value,
                    }));

                    if (field.organization.code.toUpperCase() === "NRHA") {
                      clearNrhaMemberValidation();
                    }
                  }}
                />
                {field.organization.code.toUpperCase() === "NRHA" ? (
                  <div className="row-actions">
                    <button className="ghost-button" disabled={busy || nrhaMemberBusy || !membershipNumbers[field.organization.id]?.trim()} type="button" onClick={handleVerifyNrhaMember}>
                      <ShieldCheck size={18} />
                      {nrhaMemberBusy ? uiText(locale, "Validation...", "Validating...") : uiText(locale, "Valider NRHA", "Validate NRHA")}
                    </button>
                  </div>
                ) : null}
              </label>
            ))}
            <InlineHealthMessage value={displayedNrhaMemberMessage} />
            {nrhaMemberRows.length ? (
              <NrhaMemberDataPanel rows={nrhaMemberRows} locale={locale} onApply={handleApplyNrhaMemberData} />
            ) : null}
          </div>
        ) : null}
        <InlineHealthMessage value={saveMessage} />
        {missingRequiredMembership ? (
          <InlineHealthMessage
            value={{
              tone: "info",
              message: uiText(locale, "Un numéro externe obligatoire est manquant.", "A required external membership number is missing."),
            }}
          />
        ) : null}
        <FormActions busy={busy} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

function NrhaMemberDataPanel({
  locale,
  rows,
  onApply,
}: {
  locale: Locale;
  rows: NrhaMemberDataImportRow[];
  onApply: () => void;
}) {
  return (
    <div className="nrha-data-import-panel">
      <div className="inline-form-header">
        <strong>{uiText(locale, "Données NRHA disponibles", "Available NRHA data")}</strong>
        <span>{uiText(locale, "Importe les valeurs officielles qui manquent ou qui ont changé dans HSP.", "Import official values missing or changed in HSP.")}</span>
      </div>
      <div className="nrha-data-import-list">
        {rows.map((row) => (
          <div className="nrha-data-import-row" key={row.key}>
            <span>{row.label}</span>
            <strong>HSP: {row.current}</strong>
            <strong>NRHA: {row.official}</strong>
          </div>
        ))}
      </div>
      <button className="ghost-button" type="button" onClick={onApply}>
        <Plus size={18} />
        {uiText(locale, "Importer les données NRHA", "Import NRHA data")}
      </button>
    </div>
  );
}

export { ContactEditForm };
