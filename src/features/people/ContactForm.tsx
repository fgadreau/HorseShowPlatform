import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Search, ShieldCheck } from "lucide-react";
import { errorMessage } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createContact, verifyNrhaMember } from "../../services/supabaseServices";
import type { NrhaMemberLookupVerification } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership, ExternalOrganization, Organization, OrganizationExternalMembershipRequirement } from "../../types/domain";
import { uiText, buildExternalMembershipFields, InlineHealthMessage } from "../dashboard/shared";
import { integerFromMembershipNumber, nrhaMemberDataImportRows, nrhaMemberMismatchMessage, nrhaMemberStatus, nrhaMemberVerificationPayload, nrhaOfficialMemberValues, type NrhaMemberDataImportRow, type NrhaMemberVerificationState } from "./nrhaMemberValidation";

type ContactCreationMode = "manual" | "import";

type NrhaMemberImportResult = {
  memberNumber: string;
  verification: NrhaMemberLookupVerification;
};

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
  onVerifyNrhaMember,
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
  onVerifyNrhaMember: (input: Parameters<typeof verifyNrhaMember>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaMember>>>;
  onCreated?: () => void;
}) {
  const [creationMode, setCreationMode] = useState<ContactCreationMode>("manual");
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
  const [nrhaMemberBusy, setNrhaMemberBusy] = useState(false);
  const [nrhaMemberMessage, setNrhaMemberMessage] = useState<InlineHealthMessage | null>(null);
  const [nrhaMemberLookup, setNrhaMemberLookup] = useState<NrhaMemberLookupVerification | null>(null);
  const [nrhaMemberVerification, setNrhaMemberVerification] = useState<NrhaMemberVerificationState | null>(null);
  const [nrhaImportMemberNumber, setNrhaImportMemberNumber] = useState("");
  const [nrhaImportBusy, setNrhaImportBusy] = useState(false);
  const [nrhaImportMessage, setNrhaImportMessage] = useState<InlineHealthMessage | null>(null);
  const [nrhaImportResult, setNrhaImportResult] = useState<NrhaMemberImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const externalMembershipFields = useMemo(
    () => buildExternalMembershipFields(defaultType, externalOrganizations, membershipRequirements),
    [defaultType, externalOrganizations, membershipRequirements],
  );
  const nrhaExternalOrganization = externalMembershipFields.find((field) => field.organization.code.toUpperCase() === "NRHA")?.organization ?? null;
  const nrhaOrganizationId = nrhaExternalOrganization?.id ?? null;
  const currentNrhaMemberNumber = nrhaOrganizationId ? membershipNumbers[nrhaOrganizationId]?.trim() ?? "" : "";
  const activeNrhaLookupValues = nrhaMemberLookup ? nrhaOfficialMemberValues(nrhaMemberLookup, { memberNumber: currentNrhaMemberNumber }) : null;
  const verifiedNrhaMember =
    nrhaMemberVerification &&
    nrhaMemberVerification.organizationId === nrhaOrganizationId &&
    nrhaMemberVerification.memberNumber === currentNrhaMemberNumber
      ? nrhaMemberVerification
      : null;
  const nrhaMemberRows = activeNrhaLookupValues
    ? nrhaMemberDataImportRows(
        activeNrhaLookupValues,
        {
          address,
          city,
          country,
          email,
          firstName,
          lastName,
          memberNumber: currentNrhaMemberNumber,
          phone,
          state,
          zipCode,
        },
        locale,
      )
    : [];
  const missingRequiredMembership = externalMembershipFields.some((field) => field.required && !membershipNumbers[field.organization.id]?.trim());
  const canCreateImportedContact = Boolean(organization && nrhaImportResult);
  const canCreateContact = creationMode === "manual" ? Boolean(organization && !missingRequiredMembership) : canCreateImportedContact;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (creationMode === "import") {
      await handleCreateImportedMember();
      return;
    }

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
          status: verifiedNrhaMember && field.organization.id === verifiedNrhaMember.organizationId ? nrhaMemberStatus(verifiedNrhaMember.officialValues) : "unknown",
          expires_on: verifiedNrhaMember && field.organization.id === verifiedNrhaMember.organizationId ? verifiedNrhaMember.officialValues.expiresOn || null : null,
          verified_at: verifiedNrhaMember && field.organization.id === verifiedNrhaMember.organizationId ? new Date().toISOString() : null,
          verification_payload: verifiedNrhaMember && field.organization.id === verifiedNrhaMember.organizationId ? verifiedNrhaMember.payload : undefined,
          verification_source: verifiedNrhaMember && field.organization.id === verifiedNrhaMember.organizationId ? "nrha_api" : null,
        })),
      });
      resetForm();
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
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
    clearNrhaMemberValidation();
    setNrhaImportMemberNumber("");
    setNrhaImportMessage(null);
    setNrhaImportResult(null);
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

  async function handleSearchNrhaImport() {
    const memberNumber = integerFromMembershipNumber(nrhaImportMemberNumber);

    setNrhaImportMessage(null);
    setNrhaImportResult(null);

    if (!nrhaOrganizationId) {
      setNrhaImportMessage({
        tone: "error",
        message: uiText(locale, "L'organisation externe NRHA doit être configurée avant l'import.", "The NRHA external organization must be configured before import."),
      });
      return;
    }

    if (!memberNumber) {
      setNrhaImportMessage({
        tone: "error",
        message: uiText(locale, "Entre un numéro de membre NRHA valide avant l'import.", "Enter a valid NRHA member number before import."),
      });
      return;
    }

    setNrhaImportBusy(true);

    try {
      const verification = await onVerifyNrhaMember({ memberNumber });

      if (verification.status === "not_found" || !verification.member) {
        setNrhaImportMessage({
          tone: "error",
          message: uiText(locale, "NRHA: aucun membre trouvé pour ce numéro.", "NRHA: no member found for this number."),
        });
        return;
      }

      const values = nrhaOfficialMemberValues(verification, { memberNumber });
      setNrhaImportResult({
        memberNumber: values.memberNumber || String(memberNumber),
        verification,
      });
      setNrhaImportMessage({
        tone: "success",
        message: uiText(locale, "Fiche membre NRHA trouvée.", "NRHA member record found."),
      });
    } catch (error) {
      setNrhaImportMessage({
        tone: "error",
        message: errorMessage(error),
      });
    } finally {
      setNrhaImportBusy(false);
    }
  }

  async function handleCreateImportedMember() {
    if (!organization || !nrhaImportResult || !nrhaOrganizationId) {
      return;
    }

    setBusy(true);
    setNrhaImportMessage(null);

    try {
      const values = nrhaOfficialMemberValues(nrhaImportResult.verification, { memberNumber: nrhaImportResult.memberNumber });
      const nameParts = splitFullName(values.fullName || [values.firstName, values.lastName].filter(Boolean).join(" "));
      await onCreateContact({
        organization_id: organization.id,
        type: defaultType,
        first_name: values.firstName || nameParts.firstName || values.fullName || "NRHA",
        last_name: values.lastName || nameParts.lastName || values.fullName || "Member",
        email: values.email,
        phone: values.phone,
        barn_name: "",
        address: values.address,
        address_line2: values.addressLine2,
        city: values.city,
        state: values.state,
        zip_code: values.zipCode,
        country: values.country,
        date_of_birth: "",
        linked_user_id: linkedUserId,
        created_by_user_id: createdByUserId,
        external_memberships: externalMembershipFields.map((field) => ({
          external_organization_id: field.organization.id,
          membership_number: field.organization.id === nrhaOrganizationId ? values.memberNumber : membershipNumbers[field.organization.id] ?? "",
          status: field.organization.id === nrhaOrganizationId ? nrhaMemberStatus(values) : "unknown",
          expires_on: field.organization.id === nrhaOrganizationId ? values.expiresOn || null : null,
          verified_at: field.organization.id === nrhaOrganizationId ? new Date().toISOString() : null,
          verification_payload: field.organization.id === nrhaOrganizationId ? nrhaMemberVerificationPayload(nrhaImportResult.verification) : undefined,
          verification_source: field.organization.id === nrhaOrganizationId ? "nrha_api" : null,
        })),
      });
      resetForm();
      onCreated?.();
    } catch (error) {
      setNrhaImportMessage({
        tone: "error",
        message: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  function handleApplyNrhaMemberData() {
    if (!activeNrhaLookupValues || !nrhaOrganizationId || !nrhaMemberLookup) {
      return;
    }

    applyMemberValues(activeNrhaLookupValues);
    setNrhaMemberVerification({
      memberNumber: activeNrhaLookupValues.memberNumber || currentNrhaMemberNumber,
      officialValues: activeNrhaLookupValues,
      organizationId: nrhaOrganizationId,
      payload: nrhaMemberVerificationPayload(nrhaMemberLookup),
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
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title ?? uiText(locale, "Nouveau contact", "New contact")}</h2>
          <p>{description ?? (organization ? organization.name : uiText(locale, "Crée une association d'abord.", "Create an organization first."))}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="segmented-control compact-segmented">
          <button className={creationMode === "manual" ? "active" : ""} type="button" onClick={() => setCreationMode("manual")}>
            {uiText(locale, "Création manuelle", "Manual creation")}
          </button>
          <button className={creationMode === "import" ? "active" : ""} type="button" onClick={() => setCreationMode("import")}>
            {uiText(locale, "Importer NRHA", "Import NRHA")}
          </button>
        </div>

        {creationMode === "manual" ? (
          <>
            <div className="form-grid">
              <label>
                {uiText(locale, "Prénom", "First name")}
                <input
                  disabled={!organization}
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
                  disabled={!organization}
                  required
                  value={lastName}
                  onChange={(event) => {
                    setLastName(event.target.value);
                    clearNrhaMemberValidation();
                  }}
                />
              </label>
            </div>
            <label>
              {uiText(locale, "Courriel", "Email")}
              <input
                disabled={!organization}
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearNrhaMemberValidation();
                }}
              />
            </label>
            <div className="form-grid">
              <label>
                {uiText(locale, "Téléphone", "Phone")}
                <input
                  disabled={!organization}
                  value={phone}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    clearNrhaMemberValidation();
                  }}
                />
              </label>
              <label>
                {uiText(locale, "Écurie", "Barn")}
                <input disabled={!organization} value={barnName} onChange={(event) => setBarnName(event.target.value)} />
              </label>
            </div>
            <label>
              {uiText(locale, "Adresse", "Address")}
              <input
                disabled={!organization}
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value);
                  clearNrhaMemberValidation();
                }}
              />
            </label>
            <label>
              {uiText(locale, "Appartement, suite, unité", "Apartment, suite, unit")}
              <input disabled={!organization} value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} />
            </label>
            <div className="form-grid">
              <label>
                {uiText(locale, "Ville", "City")}
                <input
                  disabled={!organization}
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
                  disabled={!organization}
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
                  disabled={!organization}
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
                  disabled={!organization}
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
                        <button className="ghost-button" disabled={busy || nrhaMemberBusy || !organization || !membershipNumbers[field.organization.id]?.trim()} type="button" onClick={handleVerifyNrhaMember}>
                          <ShieldCheck size={18} />
                          {nrhaMemberBusy ? uiText(locale, "Validation...", "Validating...") : uiText(locale, "Valider NRHA", "Validate NRHA")}
                        </button>
                      </div>
                    ) : null}
                  </label>
                ))}
                <InlineHealthMessage value={nrhaMemberMessage} />
                {nrhaMemberRows.length ? (
                  <NrhaMemberDataPanel rows={nrhaMemberRows} locale={locale} onApply={handleApplyNrhaMemberData} />
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          <div className="external-membership-fields horse-import-fields">
            <div className="inline-form-header">
              <strong>{uiText(locale, "Importer un membre NRHA", "Import an NRHA member")}</strong>
              <span>{uiText(locale, "Entre le numéro de membre pour créer un contact avec les données officielles disponibles.", "Enter the member number to create a contact with available official data.")}</span>
            </div>
            <label>
              {uiText(locale, "Numéro de membre NRHA", "NRHA member number")}
              <input
                disabled={!organization || nrhaImportBusy}
                inputMode="numeric"
                value={nrhaImportMemberNumber}
                onChange={(event) => {
                  setNrhaImportMemberNumber(event.target.value);
                  setNrhaImportResult(null);
                  setNrhaImportMessage(null);
                }}
              />
            </label>
            <div className="row-actions">
              <button className="ghost-button" disabled={!organization || nrhaImportBusy || busy} type="button" onClick={handleSearchNrhaImport}>
                <Search size={18} />
                {nrhaImportBusy ? uiText(locale, "Recherche...", "Searching...") : uiText(locale, "Rechercher NRHA", "Search NRHA")}
              </button>
            </div>
            <InlineHealthMessage value={nrhaImportMessage} />
            {nrhaImportResult ? (
              <NrhaMemberPreview verification={nrhaImportResult.verification} memberNumber={nrhaImportResult.memberNumber} locale={locale} />
            ) : null}
          </div>
        )}

        <button className="primary-button" disabled={busy || !canCreateContact} type="submit">
          <Plus size={18} />
          {creationMode === "import" ? uiText(locale, "Créer le contact importé", "Create imported contact") : uiText(locale, "Créer le contact", "Create contact")}
        </button>
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

function NrhaMemberPreview({
  locale,
  memberNumber,
  verification,
}: {
  locale: Locale;
  memberNumber: string;
  verification: NrhaMemberLookupVerification;
}) {
  const values = nrhaOfficialMemberValues(verification, { memberNumber });

  return (
    <div className="nrha-import-preview">
      <div className="inline-form-header">
        <strong>{uiText(locale, "Fiche membre NRHA importée", "Imported NRHA member record")}</strong>
        <span>{uiText(locale, "Ces valeurs seront utilisées pour créer le contact.", "These values will be used to create the contact.")}</span>
      </div>
      <div className="nrha-import-preview-grid">
        <div>
          <span>{uiText(locale, "Membre", "Member")}</span>
          <strong>{values.fullName || [values.firstName, values.lastName].filter(Boolean).join(" ") || uiText(locale, "Non fourni", "Not provided")}</strong>
        </div>
        <div>
          <span>{uiText(locale, "Numéro NRHA", "NRHA number")}</span>
          <strong>{values.memberNumber || memberNumber}</strong>
        </div>
        <div>
          <span>{uiText(locale, "Expiration", "Expiration")}</span>
          <strong>{values.expiresOn || uiText(locale, "Non fourni", "Not provided")}</strong>
        </div>
        <div>
          <span>{uiText(locale, "Courriel", "Email")}</span>
          <strong>{values.email || uiText(locale, "Non fourni", "Not provided")}</strong>
        </div>
        <div>
          <span>{uiText(locale, "Téléphone", "Phone")}</span>
          <strong>{values.phone || uiText(locale, "Non fourni", "Not provided")}</strong>
        </div>
        <div>
          <span>{uiText(locale, "Adresse", "Address")}</span>
          <strong>{[values.address, values.addressLine2].filter(Boolean).join(", ") || uiText(locale, "Non fourni", "Not provided")}</strong>
        </div>
        <div>
          <span>{uiText(locale, "Ville", "City")}</span>
          <strong>{values.city || uiText(locale, "Non fourni", "Not provided")}</strong>
        </div>
        <div>
          <span>{uiText(locale, "Province / État", "Province / State")}</span>
          <strong>{values.state || uiText(locale, "Non fourni", "Not provided")}</strong>
        </div>
        <div>
          <span>{uiText(locale, "Code postal", "Postal code")}</span>
          <strong>{values.zipCode || uiText(locale, "Non fourni", "Not provided")}</strong>
        </div>
        <div>
          <span>{uiText(locale, "Pays", "Country")}</span>
          <strong>{values.country || uiText(locale, "Non fourni", "Not provided")}</strong>
        </div>
      </div>
    </div>
  );
}

function splitFullName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1] ?? "",
  };
}

export { ContactForm };
