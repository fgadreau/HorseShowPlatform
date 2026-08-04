import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Search, ShieldCheck } from "lucide-react";
import { errorMessage } from "../../lib/display";
import { defaultAcceptedExternalImportKeys } from "../../lib/externalImportProposal";
import type { Locale } from "../../lib/i18n";
import { createContact, verifyNrhaMember } from "../../services/supabaseServices";
import type { ContactIdentityCandidate, NrhaMemberLookupVerification } from "../../services/supabaseServices";
import type { Contact, ContactExternalIdentifier, ExternalCredentialIssuer, ExternalCredentialProduct, Organization, OrganizationExternalCredentialRequirement } from "../../types/domain";
import { uiText, buildExternalMembershipFields, InlineHealthMessage } from "../dashboard/shared";
import { compareNrhaMemberIdentity, integerFromMembershipNumber, nrhaMemberDataImportRows, nrhaMemberImportDecisionPayload, nrhaMemberMismatchMessage, nrhaMemberStatus, nrhaMemberVerificationPayload, nrhaOfficialMemberValues, type NrhaMemberDataImportRow, type NrhaMemberLocalValues, type NrhaMemberVerificationState } from "./nrhaMemberValidation";
import { ContactIdentityCandidateReview } from "./IdentityCandidateReview";

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
  externalCredentialProducts = [],
  externalCredentialIssuers = [],
  allowCredentialReview = false,
  linkedUserId,
  membershipRequirements = [],
  organization,
  title,
  onCreateContact,
  onDismissIdentityCandidate,
  onSearchIdentityCandidates,
  onUseExistingContact,
  onVerifyNrhaMember,
  onCreated,
}: {
  locale?: Locale;
  createdByUserId?: string;
  defaultType?: Contact["type"];
  description?: string;
  externalCredentialProducts?: ExternalCredentialProduct[];
  externalCredentialIssuers?: ExternalCredentialIssuer[];
  allowCredentialReview?: boolean;
  linkedUserId?: string;
  membershipRequirements?: OrganizationExternalCredentialRequirement[];
  organization: Organization | null;
  title?: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onDismissIdentityCandidate?: (candidate: ContactIdentityCandidate) => Promise<void>;
  onSearchIdentityCandidates?: (input: Parameters<typeof createContact>[0]) => Promise<ContactIdentityCandidate[]>;
  onUseExistingContact?: (candidate: ContactIdentityCandidate) => Promise<void>;
  onVerifyNrhaMember: (input: Parameters<typeof verifyNrhaMember>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaMember>>>;
  onCreated?: () => void;
}) {
  const [creationMode, setCreationMode] = useState<ContactCreationMode>("manual");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
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
  const [membershipProductIds, setMembershipProductIds] = useState<Record<string, string>>({});
  const [membershipStatuses, setMembershipStatuses] = useState<Record<string, ContactExternalIdentifier["status"]>>({});
  const [membershipExpiries, setMembershipExpiries] = useState<Record<string, string>>({});
  const [nrhaMemberBusy, setNrhaMemberBusy] = useState(false);
  const [nrhaMemberMessage, setNrhaMemberMessage] = useState<InlineHealthMessage | null>(null);
  const [nrhaMemberLookup, setNrhaMemberLookup] = useState<NrhaMemberLookupVerification | null>(null);
  const [nrhaMemberVerification, setNrhaMemberVerification] = useState<NrhaMemberVerificationState | null>(null);
  const [nrhaMemberImportEvidence, setNrhaMemberImportEvidence] = useState<Record<string, unknown> | null>(null);
  const [nrhaImportMemberNumber, setNrhaImportMemberNumber] = useState("");
  const [nrhaImportBusy, setNrhaImportBusy] = useState(false);
  const [nrhaImportMessage, setNrhaImportMessage] = useState<InlineHealthMessage | null>(null);
  const [nrhaImportResult, setNrhaImportResult] = useState<NrhaMemberImportResult | null>(null);
  const [identityCandidates, setIdentityCandidates] = useState<ContactIdentityCandidate[]>([]);
  const [pendingContactInput, setPendingContactInput] = useState<Parameters<typeof createContact>[0] | null>(null);
  const [busy, setBusy] = useState(false);
  const externalMembershipFields = useMemo(
    () => buildExternalMembershipFields(defaultType, externalCredentialIssuers, membershipRequirements),
    [defaultType, externalCredentialIssuers, membershipRequirements],
  );
  const nrhaExternalCredentialIssuer = externalMembershipFields.find((field) => field.organization.code.toUpperCase() === "NRHA")?.organization ?? null;
  const nrhaOrganizationId = nrhaExternalCredentialIssuer?.id ?? null;
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
          expiresOn: verifiedNrhaMember?.officialValues.expiresOn ?? "",
          firstName,
          middleName,
          lastName,
          memberNumber: currentNrhaMemberNumber,
          phone,
          state,
          zipCode,
          addressLine2,
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

    await reviewOrCreateContact({
        organization_id: organization.id,
        type: defaultType,
        first_name: firstName,
        middle_name: middleName,
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
          external_credential_issuer_id: field.organization.id,
          credential_product_id: membershipProductIds[field.organization.id] || null,
          identifier_value: membershipNumbers[field.organization.id] ?? "",
          status: verifiedNrhaMember && field.organization.id === verifiedNrhaMember.organizationId ? nrhaMemberStatus(verifiedNrhaMember.officialValues) : membershipStatuses[field.organization.id] ?? "pending",
          expires_on: verifiedNrhaMember && field.organization.id === verifiedNrhaMember.organizationId ? verifiedNrhaMember.officialValues.expiresOn || null : membershipExpiries[field.organization.id] || null,
          verified_at: verifiedNrhaMember && field.organization.id === verifiedNrhaMember.organizationId ? new Date().toISOString() : null,
          verification_payload: field.organization.id === nrhaOrganizationId ? verifiedNrhaMember?.payload ?? nrhaMemberImportEvidence ?? undefined : undefined,
          verification_source: field.organization.id === nrhaOrganizationId && (verifiedNrhaMember || nrhaMemberImportEvidence) ? "nrha_api" : null,
        })),
      });
  }

  async function reviewOrCreateContact(input: Parameters<typeof createContact>[0]) {
    setBusy(true);

    try {
      if (onSearchIdentityCandidates) {
        const candidates = await onSearchIdentityCandidates(input);

        if (candidates.length) {
          setPendingContactInput(input);
          setIdentityCandidates(candidates);
          return;
        }
      }

      await finishContactCreation(input);
    } finally {
      setBusy(false);
    }
  }

  async function finishContactCreation(input: Parameters<typeof createContact>[0]) {
    await onCreateContact(input);
    resetForm();
    onCreated?.();
  }

  async function handleUseExistingContact(candidate: ContactIdentityCandidate) {
    if (!onUseExistingContact) return;
    setBusy(true);

    try {
      await onUseExistingContact(candidate);
      resetForm();
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateDistinctContact() {
    if (!pendingContactInput) return;
    setBusy(true);

    try {
      if (onDismissIdentityCandidate) {
        await Promise.all(identityCandidates.map((candidate) => onDismissIdentityCandidate(candidate)));
      }
      await finishContactCreation(pendingContactInput);
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setFirstName("");
    setMiddleName("");
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
    setIdentityCandidates([]);
    setPendingContactInput(null);
  }

  function clearNrhaMemberValidation() {
    setNrhaMemberMessage(null);
    setNrhaMemberLookup(null);
    setNrhaMemberVerification(null);
    setNrhaMemberImportEvidence(null);
  }

  async function handleVerifyNrhaMember() {
    const memberNumber = integerFromMembershipNumber(currentNrhaMemberNumber);

    setNrhaMemberMessage(null);
    setNrhaMemberLookup(null);
    setNrhaMemberVerification(null);
    setNrhaMemberImportEvidence(null);

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
        fullName: [firstName, middleName, lastName].filter(Boolean).join(" "),
        lastName,
        memberNumber,
      });
      const officialValues = nrhaOfficialMemberValues(verification, { memberNumber });
      const localValues: NrhaMemberLocalValues = {
        address,
        addressLine2,
        city,
        country,
        email,
        expiresOn: "",
        firstName,
        lastName,
        middleName,
        memberNumber: String(memberNumber),
        phone,
        state,
        zipCode,
      };
      const identityComparison = compareNrhaMemberIdentity(localValues, officialValues);

      if (verification.status === "not_found" || !verification.member) {
        setNrhaMemberMessage({
          tone: "error",
          message: uiText(locale, "NRHA: aucun membre trouvé pour ce numéro.", "NRHA: no member found for this number."),
        });
        return;
      }

      setNrhaMemberLookup(verification);

      if (verification.status === "verified" && verification.matched && identityComparison.verdict === "match") {
        setNrhaMemberVerification({
          memberNumber: String(memberNumber),
          officialValues,
          organizationId: nrhaOrganizationId,
          payload: nrhaMemberVerificationPayload(verification, identityComparison),
        });
        setNrhaMemberMessage({
          tone: "success",
        message: uiText(locale, "NRHA: membre confirmé.", "NRHA: member confirmed."),
        });
        return;
      }

      setNrhaMemberMessage({
        tone: "info",
        message: `${nrhaMemberMismatchMessage(verification, locale, identityComparison)} ${uiText(locale, "Tu peux importer les données officielles ci-dessous.", "You can import the official data below.")}`,
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
      const importedLocalValues: NrhaMemberLocalValues = {
        address: values.address,
        addressLine2: values.addressLine2,
        city: values.city,
        country: values.country,
        email: values.email,
        expiresOn: values.expiresOn,
        firstName: values.firstName || nameParts.firstName || values.fullName || "NRHA",
        lastName: values.lastName || nameParts.lastName || values.fullName || "Member",
        middleName: values.middleName || nameParts.middleName,
        memberNumber: values.memberNumber,
        phone: values.phone,
        state: values.state,
        zipCode: values.zipCode,
      };
      const importRows = nrhaMemberDataImportRows(values, {
        address: "", addressLine2: "", city: "", country: "", email: "", expiresOn: "", firstName: "", lastName: "", middleName: "", memberNumber: "", phone: "", state: "", zipCode: "",
      }, locale);
      const importComparison = compareNrhaMemberIdentity(importedLocalValues, values);
      const importPayload = nrhaMemberImportDecisionPayload(nrhaImportResult.verification, importRows, importRows.map((row) => row.key), importComparison);
      await reviewOrCreateContact({
        organization_id: organization.id,
        type: defaultType,
        first_name: values.firstName || nameParts.firstName || values.fullName || "NRHA",
        middle_name: values.middleName || nameParts.middleName,
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
          external_credential_issuer_id: field.organization.id,
          identifier_value: field.organization.id === nrhaOrganizationId ? values.memberNumber : membershipNumbers[field.organization.id] ?? "",
          status: field.organization.id === nrhaOrganizationId ? nrhaMemberStatus(values) : "unknown",
          expires_on: field.organization.id === nrhaOrganizationId ? values.expiresOn || null : null,
          verified_at: field.organization.id === nrhaOrganizationId ? new Date().toISOString() : null,
          verification_payload: field.organization.id === nrhaOrganizationId ? importPayload : undefined,
          verification_source: field.organization.id === nrhaOrganizationId ? "nrha_api" : null,
        })),
      });
    } catch (error) {
      setNrhaImportMessage({
        tone: "error",
        message: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  function handleApplyNrhaMemberData(keys: NrhaMemberDataImportRow["key"][]) {
    if (!activeNrhaLookupValues || !nrhaOrganizationId || !nrhaMemberLookup) {
      return;
    }

    const selectedKeys = new Set(keys);
    const intendedValues: NrhaMemberLocalValues = {
      address: selectedKeys.has("address") ? activeNrhaLookupValues.address : address,
      addressLine2: selectedKeys.has("addressLine2") ? activeNrhaLookupValues.addressLine2 : addressLine2,
      city: selectedKeys.has("city") ? activeNrhaLookupValues.city : city,
      country: selectedKeys.has("country") ? activeNrhaLookupValues.country : country,
      email: selectedKeys.has("email") ? activeNrhaLookupValues.email : email,
      expiresOn: selectedKeys.has("expiresOn") ? activeNrhaLookupValues.expiresOn : verifiedNrhaMember?.officialValues.expiresOn ?? "",
      firstName: selectedKeys.has("firstName") ? activeNrhaLookupValues.firstName : firstName,
      lastName: selectedKeys.has("lastName") ? activeNrhaLookupValues.lastName : lastName,
      middleName: selectedKeys.has("middleName") ? activeNrhaLookupValues.middleName : middleName,
      memberNumber: selectedKeys.has("memberNumber") ? activeNrhaLookupValues.memberNumber : currentNrhaMemberNumber,
      phone: selectedKeys.has("phone") ? activeNrhaLookupValues.phone : phone,
      state: selectedKeys.has("state") ? activeNrhaLookupValues.state : state,
      zipCode: selectedKeys.has("zipCode") ? activeNrhaLookupValues.zipCode : zipCode,
    };
    const comparison = compareNrhaMemberIdentity(intendedValues, activeNrhaLookupValues);
    const importPayload = nrhaMemberImportDecisionPayload(nrhaMemberLookup, nrhaMemberRows, selectedKeys, comparison);
    setNrhaMemberImportEvidence(importPayload);
    applyMemberValues(activeNrhaLookupValues, selectedKeys);

    if (nrhaMemberRows.every((row) => selectedKeys.has(row.key))) {
      setNrhaMemberVerification({
        memberNumber: activeNrhaLookupValues.memberNumber || currentNrhaMemberNumber,
        officialValues: activeNrhaLookupValues,
        organizationId: nrhaOrganizationId,
        payload: importPayload,
      });
      setNrhaMemberMessage({
        tone: "success",
        message: uiText(locale, "Données NRHA importées et prêtes à enregistrer comme validées.", "NRHA data imported and ready to save as verified."),
      });
      return;
    }

    setNrhaMemberVerification(null);
    setNrhaMemberMessage({
      tone: "info",
      message: uiText(locale, "Champs NRHA sélectionnés importés. Les différences restantes devront être résolues avant d'enregistrer comme validé.", "Selected NRHA fields imported. Remaining differences must be resolved before saving as verified."),
    });
  }

  function applyMemberValues(values: ReturnType<typeof nrhaOfficialMemberValues>, selectedKeys?: Set<NrhaMemberDataImportRow["key"]>) {
    const shouldApply = (key: NrhaMemberDataImportRow["key"]) => !selectedKeys || selectedKeys.has(key);

    if (values.firstName && shouldApply("firstName")) setFirstName(values.firstName);
    if (values.middleName && shouldApply("middleName")) setMiddleName(values.middleName);
    if (values.lastName && shouldApply("lastName")) setLastName(values.lastName);
    if (values.email && shouldApply("email")) setEmail(values.email);
    if (values.phone && shouldApply("phone")) setPhone(values.phone);
    if (values.address && shouldApply("address")) setAddress(values.address);
    if (values.addressLine2 && shouldApply("addressLine2")) setAddressLine2(values.addressLine2);
    if (values.city && shouldApply("city")) setCity(values.city);
    if (values.state && shouldApply("state")) setState(values.state);
    if (values.zipCode && shouldApply("zipCode")) setZipCode(values.zipCode);
    if (values.country && shouldApply("country")) setCountry(values.country);
    if (values.memberNumber && nrhaOrganizationId && shouldApply("memberNumber")) {
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
                {uiText(locale, "Deuxième prénom", "Middle name")}
                <input
                  disabled={!organization}
                  value={middleName}
                  onChange={(event) => {
                    setMiddleName(event.target.value);
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
              <input
                disabled={!organization}
                value={addressLine2}
                onChange={(event) => {
                  setAddressLine2(event.target.value);
                  clearNrhaMemberValidation();
                }}
              />
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
                {externalMembershipFields.map((field) => {
                  const issuerProducts = externalCredentialProducts.filter((product) => product.external_credential_issuer_id === field.organization.id && product.is_active);
                  return <div className="stack compact-stack nested-fieldset" key={field.organization.id}>
                  <label>{field.organization.code} #
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
                  {issuerProducts.length ? <label>{uiText(locale, "Type de carte ou produit", "Membership or product type")}<select value={membershipProductIds[field.organization.id] ?? ""} onChange={(event) => setMembershipProductIds((current) => ({ ...current, [field.organization.id]: event.target.value }))}><option value="">Non précisé</option>{issuerProducts.map((product) => <option key={product.id} value={product.id}>{product.name}{product.includes_liability_insurance ? ` — ${uiText(locale, "assurance incluse", "insurance included")}` : ""}</option>)}</select></label> : null}
                  {allowCredentialReview ? <div className="form-grid"><label>{uiText(locale, "Statut", "Status")}<select value={membershipStatuses[field.organization.id] ?? "pending"} onChange={(event) => setMembershipStatuses((current) => ({ ...current, [field.organization.id]: event.target.value as ContactExternalIdentifier["status"] }))}><option value="pending">À vérifier</option><option value="active">Active</option><option value="expired">Expirée</option><option value="inactive">Inactive</option><option value="revoked">Révoquée</option></select></label><label>{uiText(locale, "Expiration", "Expiry")}<input type="date" value={membershipExpiries[field.organization.id] ?? ""} onChange={(event) => setMembershipExpiries((current) => ({ ...current, [field.organization.id]: event.target.value }))} /></label></div> : null}
                  </div>;
                })}
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

        {identityCandidates.length && pendingContactInput ? (
          <ContactIdentityCandidateReview
            busy={busy}
            candidates={identityCandidates}
            locale={locale}
            onCreateDistinct={handleCreateDistinctContact}
            onEdit={() => {
              setIdentityCandidates([]);
              setPendingContactInput(null);
            }}
            onUseExisting={handleUseExistingContact}
          />
        ) : (
          <button className="primary-button" disabled={busy || !canCreateContact} type="submit">
            <Plus size={18} />
            {creationMode === "import" ? uiText(locale, "Créer le contact importé", "Create imported contact") : uiText(locale, "Créer le contact", "Create contact")}
          </button>
        )}
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
  onApply: (keys: NrhaMemberDataImportRow["key"][]) => void;
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<NrhaMemberDataImportRow["key"]>>(() => new Set(defaultAcceptedExternalImportKeys(rows)));
  const rowSelectionSignature = rows.map((row) => `${row.key}:${row.current}:${row.official}`).join("|");

  useEffect(() => {
    setSelectedKeys(new Set(defaultAcceptedExternalImportKeys(rows)));
  }, [rowSelectionSignature]);

  function toggleKey(key: NrhaMemberDataImportRow["key"]) {
    setSelectedKeys((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  return (
    <div className="nrha-data-import-panel">
      <div className="inline-form-header">
        <strong>{uiText(locale, "Données NRHA disponibles", "Available NRHA data")}</strong>
        <span>{uiText(locale, "Les champs vides sont présélectionnés. Toute valeur HSP existante à remplacer doit être cochée explicitement.", "Missing fields are preselected. Any existing HSP value to replace must be checked explicitly.")}</span>
      </div>
      <div className="nrha-data-import-list">
        {rows.map((row) => (
          <div className="nrha-data-import-row" key={row.key}>
            <span>{row.label}</span>
            <strong>HSP: {row.current}</strong>
            <strong>NRHA: {row.official}</strong>
            <label className="nrha-data-import-choice">
              <input checked={selectedKeys.has(row.key)} type="checkbox" onChange={() => toggleKey(row.key)} />
              {uiText(locale, "Utiliser NRHA", "Use NRHA")}
            </label>
          </div>
        ))}
      </div>
      <button className="ghost-button" disabled={!selectedKeys.size} type="button" onClick={() => onApply(Array.from(selectedKeys))}>
        <Plus size={18} />
        {uiText(locale, "Importer les champs sélectionnés", "Import selected fields")}
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
    return { firstName: "", middleName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], middleName: "", lastName: "" };
  }

  return {
    firstName: parts[0] ?? "",
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1] ?? "",
  };
}

export { ContactForm };
