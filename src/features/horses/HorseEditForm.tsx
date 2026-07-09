import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, FileText, Plus, ShieldCheck } from "lucide-react";
import { ContactPicker, FormActions, SearchSelect } from "../../components/ui";
import { contactLabel, errorMessage, findById, formatDate, horseLabel, numericValue } from "../../lib/display";
import { normalizeGvlUrl } from "../../lib/gvlUrl";
import { getHorseCogginsValidity } from "../../lib/health";
import type { Locale } from "../../lib/i18n";
import { createContact, createUploadedHorseHealthDocument, getHorseHealthDocumentFileUrl, reviewHorseHealthDocument, updateHorse, verifyGvlCogginsDocument, verifyNrhaHorse } from "../../services/supabaseServices";
import type { Contact, ContactRole, ExternalOrganization, Horse, HorseContact, HorseExternalMembership, HorseHealthDocument, Organization } from "../../types/domain";
import { uiText, buildHorseExternalMembershipFields, horseHealthStatusLabel, horseReferenceTypeForOrganization, horseExternalReferenceLabel, resolveGvlCogginsUrl, healthDocumentTypeLabel, healthDocumentDateLabel, healthDocumentDateValue, isVaccineHealthDocument, healthVerificationSourceLabel, healthReviewNote, latestHorseHealthDocument, latestHorseVaccineDocument, todayDateValue, birthYearFromDateValue, InlineHealthMessage, horseHealthResultMessage, cogginsValidityBadgeClass, cogginsValidityTagLabel, cogginsValidityTone, horseGenderLabel } from "../dashboard/shared";
import { integerFromReference, nrhaHorseMismatchMessage, verificationPayload, type NrhaHorseVerificationState } from "./nrhaHorseValidation";

function HorseEditForm({
  locale = "fr",
  contacts,
  contactRoles,
  canManageHealthDocuments,
  createdByUserId,
  externalOrganizations = [],
  horse,
  horseExternalMemberships = [],
  horseHealthDocuments = [],
  horseContacts,
  organization,
  onCancel,
  onCreateContact,
  onCreateHorseHealthDocument,
  onReviewHorseHealthDocument,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaHorse,
}: {
  locale?: Locale;
  contacts: Contact[];
  contactRoles: ContactRole[];
  canManageHealthDocuments: boolean;
  createdByUserId?: string;
  externalOrganizations?: ExternalOrganization[];
  horse: Horse;
  horseExternalMemberships?: HorseExternalMembership[];
  horseHealthDocuments?: HorseHealthDocument[];
  horseContacts: HorseContact[];
  organization: Organization | null;
  onCancel: () => void;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onReviewHorseHealthDocument: (id: string, input: Parameters<typeof reviewHorseHealthDocument>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
}) {
  const currentAgentContactId = horseContacts.find((horseContact) => horseContact.horse_id === horse.id && horseContact.role === "agent")?.contact_id ?? "";
  const [name, setName] = useState(horse.name);
  const [ownerContactId, setOwnerContactId] = useState(horse.primary_owner_contact_id);
  const [agentContactId, setAgentContactId] = useState<string | null>(currentAgentContactId || null);
  const [breed, setBreed] = useState(horse.breed ?? "");
  const [gender, setGender] = useState<"" | NonNullable<Horse["gender"]>>(horse.gender ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(horse.date_of_birth ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(horse.registration_number ?? "");
  const [gvlCogginsUrl, setGvlCogginsUrl] = useState("");
  const [cogginsPdfFile, setCogginsPdfFile] = useState<File | null>(null);
  const [vaccineCertificateFile, setVaccineCertificateFile] = useState<File | null>(null);
  const [vaccineAdministeredOn, setVaccineAdministeredOn] = useState("");
  const [externalReferenceNumbers, setExternalReferenceNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(horseExternalMemberships.filter((membership) => membership.horse_id === horse.id).map((membership) => [membership.external_organization_id, membership.reference_number])),
  );
  const [nrhaHorseBusy, setNrhaHorseBusy] = useState(false);
  const [nrhaHorseMessage, setNrhaHorseMessage] = useState<InlineHealthMessage | null>(null);
  const [nrhaHorseVerification, setNrhaHorseVerification] = useState<NrhaHorseVerificationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [fileBusyDocumentId, setFileBusyDocumentId] = useState("");
  const [fileErrorDocumentId, setFileErrorDocumentId] = useState("");
  const [fileErrorMessageByDocumentId, setFileErrorMessageByDocumentId] = useState<Record<string, string>>({});
  const [healthMessage, setHealthMessage] = useState<InlineHealthMessage | null>(null);
  const currentUserContact = createdByUserId ? contacts.find((contact) => contact.linked_user_id === createdByUserId) : null;
  const selectedOwnerContact = findById(contacts, ownerContactId) ?? null;
  const becameAgentByOwnerChange = currentUserContact && horse.primary_owner_contact_id === currentUserContact.id && ownerContactId !== currentUserContact.id;
  const defaultAgentId = becameAgentByOwnerChange ? currentUserContact.id : "";
  const selectedAgentId = agentContactId ?? defaultAgentId;
  const externalReferenceFields = useMemo(
    () => buildHorseExternalMembershipFields(externalOrganizations, horseExternalMemberships.filter((membership) => membership.horse_id === horse.id)),
    [externalOrganizations, horse.id, horseExternalMemberships],
  );
  const nrhaOrganizationId = externalReferenceFields.find((externalOrganization) => externalOrganization.code.toUpperCase() === "NRHA")?.id ?? null;
  const currentNrhaReferenceNumber = nrhaOrganizationId ? externalReferenceNumbers[nrhaOrganizationId]?.trim() ?? "" : "";
  const verifiedNrhaHorse =
    nrhaHorseVerification &&
    nrhaHorseVerification.organizationId === nrhaOrganizationId &&
    nrhaHorseVerification.referenceNumber === currentNrhaReferenceNumber &&
    nrhaHorseVerification.name === name.trim() &&
    nrhaHorseVerification.dateOfBirth === dateOfBirth &&
    nrhaHorseVerification.ownerContactId === ownerContactId
      ? nrhaHorseVerification
      : null;
  const latestCoggins = useMemo(() => latestHorseHealthDocument(horse.id, horseHealthDocuments, "coggins_eia"), [horse.id, horseHealthDocuments]);
  const cogginsValidity = useMemo(
    () =>
      getHorseCogginsValidity({
        documents: horseHealthDocuments,
        horseId: horse.id,
        organization,
      }),
    [horse.id, horseHealthDocuments, organization],
  );
  const latestVaccine = useMemo(() => latestHorseVaccineDocument(horse.id, horseHealthDocuments), [horse.id, horseHealthDocuments]);
  const [vaccineReviewDate, setVaccineReviewDate] = useState(latestVaccine?.test_or_administered_on ?? "");

  useEffect(() => {
    setVaccineReviewDate(latestVaccine?.test_or_administered_on ?? "");
  }, [latestVaccine?.id, latestVaccine?.test_or_administered_on]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      await onUpdateHorse(horse.id, {
        name,
        primary_owner_contact_id: ownerContactId,
        agent_contact_id: selectedAgentId && selectedAgentId !== ownerContactId ? selectedAgentId : null,
        breed: breed || null,
        gender: gender || null,
        date_of_birth: dateOfBirth || null,
        registration_number: registrationNumber || null,
        external_memberships: externalReferenceFields.map((organization) => externalMembershipInputForOrganization(organization)),
      });
    } finally {
      setBusy(false);
    }
  }

  function externalMembershipInputForOrganization(externalOrganization: ExternalOrganization) {
    const referenceType = horseReferenceTypeForOrganization(externalOrganization);
    const referenceNumber = externalReferenceNumbers[externalOrganization.id] ?? "";
    const existingMembership =
      horseExternalMemberships.find(
        (membership) =>
          membership.horse_id === horse.id &&
          membership.external_organization_id === externalOrganization.id &&
          membership.reference_type === referenceType,
      ) ?? null;
    const isNrha = externalOrganization.code.toUpperCase() === "NRHA";
    const existingIdentityStillMatches =
      !isNrha ||
      (name.trim() === horse.name &&
        dateOfBirth === (horse.date_of_birth ?? "") &&
        ownerContactId === horse.primary_owner_contact_id);
    const existingReferenceStillMatches = existingMembership?.reference_number.trim() === referenceNumber.trim();
    const canPreserveExistingValidation = Boolean(existingMembership && existingReferenceStillMatches && existingIdentityStillMatches);

    if (verifiedNrhaHorse && externalOrganization.id === verifiedNrhaHorse.organizationId) {
      return {
        external_organization_id: externalOrganization.id,
        reference_type: referenceType,
        reference_number: referenceNumber,
        status: "active" as const,
        verified_at: new Date().toISOString(),
        verification_payload: verifiedNrhaHorse.payload,
        verification_source: "nrha_api",
      };
    }

    return {
      external_organization_id: externalOrganization.id,
      reference_type: referenceType,
      reference_number: referenceNumber,
      status: canPreserveExistingValidation ? existingMembership?.status ?? "unknown" : "unknown",
      expires_on: canPreserveExistingValidation ? existingMembership?.expires_on ?? null : null,
      verified_at: canPreserveExistingValidation ? existingMembership?.verified_at ?? null : null,
      verification_payload: canPreserveExistingValidation ? existingMembership?.verification_payload ?? {} : undefined,
      verification_source: canPreserveExistingValidation ? existingMembership?.verification_source ?? null : null,
    };
  }

  function clearNrhaHorseValidation() {
    setNrhaHorseMessage(null);
    setNrhaHorseVerification(null);
  }

  async function handleVerifyNrhaHorse(externalOrganization: ExternalOrganization) {
    const referenceNumber = externalReferenceNumbers[externalOrganization.id]?.trim() ?? "";
    const licenseNumber = integerFromReference(referenceNumber);
    const ownerName = selectedOwnerContact ? contactLabel(selectedOwnerContact) : "";

    setNrhaHorseMessage(null);
    setNrhaHorseVerification(null);

    if (!licenseNumber) {
      setNrhaHorseMessage({
        tone: "error",
        message: uiText(locale, "Entre un numéro de licence NRHA valide avant la validation.", "Enter a valid NRHA license number before validating."),
      });
      return;
    }

    if (!name.trim() || !dateOfBirth || !ownerName) {
      setNrhaHorseMessage({
        tone: "error",
        message: uiText(locale, "Nom, date de naissance et propriétaire sont requis pour valider NRHA.", "Horse name, birth date and owner are required for NRHA validation."),
      });
      return;
    }

    setNrhaHorseBusy(true);

    try {
      const verification = await onVerifyNrhaHorse({
        dateOfBirth,
        licenseNumber,
        name,
        ownerName,
      });

      if (verification.status === "verified" && verification.matched) {
        setNrhaHorseVerification({
          dateOfBirth,
          name: name.trim(),
          organizationId: externalOrganization.id,
          ownerContactId,
          ownerName,
          payload: verificationPayload(verification),
          referenceNumber,
        });
        setNrhaHorseMessage({
          tone: "success",
          message: uiText(locale, "NRHA: licence confirmée avec nom, date de naissance et propriétaire.", "NRHA: license confirmed with name, birth date and owner."),
        });
        return;
      }

      setNrhaHorseMessage({
        tone: "error",
        message: nrhaHorseMismatchMessage(verification, locale),
      });
    } catch (error) {
      setNrhaHorseMessage({
        tone: "error",
        message: errorMessage(error),
      });
    } finally {
      setNrhaHorseBusy(false);
    }
  }

  async function handleVerifyGvlCoggins() {
    if (!organization || (!gvlCogginsUrl.trim() && !cogginsPdfFile)) {
      return;
    }

    setHealthBusy(true);
    setHealthMessage(null);

    try {
      const sourceUrl = await resolveGvlCogginsUrl(cogginsPdfFile, gvlCogginsUrl);

      if (!sourceUrl) {
        return;
      }

      const document = await onVerifyGvlCogginsDocument({
        organization_id: organization.id,
        horse_id: horse.id,
        source_url: sourceUrl,
        document_file: cogginsPdfFile,
        horse_name: name.trim() || horse.name,
        horse_date_of_birth: dateOfBirth || horse.date_of_birth,
        horse_birth_year: birthYearFromDateValue(dateOfBirth) ?? horse.birth_year,
        created_by_user_id: createdByUserId,
      });
      setHealthMessage(horseHealthResultMessage(document));
      setGvlCogginsUrl("");
      setCogginsPdfFile(null);
    } catch (error) {
      if (organization && cogginsPdfFile) {
        const document = await onCreateHorseHealthDocument({
          organization_id: organization.id,
          horse_id: horse.id,
          document_type: "coggins_eia",
          file: cogginsPdfFile,
          source_url: normalizeGvlUrl(gvlCogginsUrl) ?? (gvlCogginsUrl.trim() || null),
          created_by_user_id: createdByUserId,
          review_notes: `Validation GVL impossible: ${errorMessage(error)}`,
        });
        setHealthMessage(horseHealthResultMessage(document));
        setGvlCogginsUrl("");
        setCogginsPdfFile(null);
      } else {
        setHealthMessage({
          tone: "error",
          message: errorMessage(error),
        });
      }
    } finally {
      setHealthBusy(false);
    }
  }

  async function handleReverifyLatestGvlCoggins() {
    if (!organization || !latestCoggins?.source_url) {
      return;
    }

    setHealthBusy(true);
    setHealthMessage(null);

    try {
      const document = await onVerifyGvlCogginsDocument({
        organization_id: organization.id,
        horse_id: horse.id,
        source_url: latestCoggins.source_url,
        horse_name: name.trim() || horse.name,
        horse_date_of_birth: dateOfBirth || horse.date_of_birth,
        horse_birth_year: birthYearFromDateValue(dateOfBirth) ?? horse.birth_year,
        created_by_user_id: createdByUserId,
      });
      setHealthMessage(horseHealthResultMessage(document));
    } catch (error) {
      setHealthMessage({
        tone: "error",
        message: errorMessage(error),
      });
    } finally {
      setHealthBusy(false);
    }
  }

  async function handleReviewCoggins(status: Extract<HorseHealthDocument["status"], "approved" | "rejected">) {
    if (!latestCoggins) {
      return;
    }

    await handleReviewHealthDocument(latestCoggins, status, "Coggins");
  }

  async function handleReviewVaccine(status: Extract<HorseHealthDocument["status"], "approved" | "rejected">) {
    if (!latestVaccine) {
      return;
    }

    if (status === "approved" && !vaccineReviewDate) {
      setHealthMessage({
        tone: "error",
        message: uiText(locale, "Entre la date du vaccin vue sur le certificat avant d'approuver.", "Enter the vaccine date shown on the certificate before approving."),
      });
      return;
    }

    await handleReviewHealthDocument(latestVaccine, status, "certificat vaccin", status === "approved" ? vaccineReviewDate || null : undefined);
  }

  async function handleReviewHealthDocument(
    document: HorseHealthDocument,
    status: Extract<HorseHealthDocument["status"], "approved" | "rejected">,
    label: string,
    testOrAdministeredOn?: string | null,
  ) {
    setHealthBusy(true);
    setHealthMessage(null);

    try {
      await onReviewHorseHealthDocument(document.id, {
        status,
        reviewed_by_user_id: createdByUserId,
        review_notes:
          status === "approved"
            ? `${label} approuvé manuellement par un gestionnaire de l'association.`
            : `${label} refusé manuellement par un gestionnaire de l'association.`,
        test_or_administered_on: testOrAdministeredOn,
      });
      setHealthMessage({
        tone: status === "approved" ? "success" : "info",
        message: status === "approved" ? `${label} approuvé.` : `${label} refusé.`,
      });
    } finally {
      setHealthBusy(false);
    }
  }

  async function handleUploadVaccineCertificate() {
    if (!organization || !vaccineCertificateFile) {
      return;
    }

    setHealthBusy(true);
    setHealthMessage(null);

    try {
      const document = await onCreateHorseHealthDocument({
        organization_id: organization.id,
        horse_id: horse.id,
        document_type: "combo_vaccine",
        file: vaccineCertificateFile,
        test_or_administered_on: vaccineAdministeredOn || null,
        created_by_user_id: createdByUserId,
      });
      setHealthMessage(horseHealthResultMessage(document));
      setVaccineCertificateFile(null);
      setVaccineAdministeredOn("");
    } finally {
      setHealthBusy(false);
    }
  }

  async function handleOpenStoredDocument(document: HorseHealthDocument) {
    if (!document.document_url) {
      return;
    }

    const documentWindow = window.open("about:blank", "_blank");
    setFileBusyDocumentId(document.id);
    setFileErrorDocumentId("");
    setFileErrorMessageByDocumentId((current) => ({ ...current, [document.id]: "" }));

    try {
      const signedUrl = await getHorseHealthDocumentFileUrl(document.document_url);
      if (documentWindow) {
        documentWindow.location.href = signedUrl;
      } else {
        window.open(signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      documentWindow?.close();
      setFileErrorDocumentId(document.id);
      setFileErrorMessageByDocumentId((current) => ({ ...current, [document.id]: errorMessage(error) }));
    } finally {
      setFileBusyDocumentId("");
    }
  }

  return (
    <section className="panel edit-panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Modifier le cheval", "Edit horse")}</h2>
          <p>{horse.name}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom du cheval", "Horse name")}
          <input
            required
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearNrhaHorseValidation();
            }}
          />
        </label>
        <ContactPicker
          contacts={contacts}
          contactRoles={contactRoles}
          createdByUserId={createdByUserId}
          label={uiText(locale, "Propriétaire", "Owner")}
          locale={locale}
          organization={organization}
          role="owner"
          value={ownerContactId}
          onChange={(value) => {
            setOwnerContactId(value);
            clearNrhaHorseValidation();
          }}
          onCreateContact={onCreateContact}
        />
        <ContactPicker
          allowEmpty
          contacts={contacts}
          contactRoles={contactRoles}
          createdByUserId={createdByUserId}
          label="Agent"
          locale={locale}
          organization={organization}
          role="agent"
          value={selectedAgentId}
          onChange={setAgentContactId}
          onCreateContact={onCreateContact}
        />
        <div className="form-grid">
          <label>
            {uiText(locale, "Race", "Breed")}
            <input value={breed} onChange={(event) => setBreed(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Sexe", "Sex")}
            <select value={gender} onChange={(event) => setGender(event.target.value as "" | NonNullable<Horse["gender"]>)}>
              <option value="">{uiText(locale, "Non défini", "Unset")}</option>
              <option value="M">{uiText(locale, "Mâle (Stallion / Colt)", "Male (Stallion / Colt)")}</option>
              <option value="F">{uiText(locale, "Femelle (Mare / Filly)", "Female (Mare / Filly)")}</option>
              <option value="G">{uiText(locale, "Hongre (Gelding)", "Gelding")}</option>
            </select>
          </label>
        </div>
        <label>
          {uiText(locale, "Date de naissance", "Date of birth")}
          <input
            type="date"
            value={dateOfBirth}
            onChange={(event) => {
              setDateOfBirth(event.target.value);
              clearNrhaHorseValidation();
            }}
          />
        </label>
        <label>
          {uiText(locale, "Enregistrement", "Registration")}
          <input value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} />
        </label>
        <div className="external-membership-fields health-document-fields">
          <div className="inline-form-header">
            <strong>Coggins / EIA GVL</strong>
            <span>{uiText(locale, "Validation automatique du résultat GVL.", "Automatic GVL result validation.")}</span>
          </div>
          {latestCoggins ? (
            <div className="health-document-summary">
              <div className="health-document-title">
                <span className={`badge ${latestCoggins.status}`}>{horseHealthStatusLabel(latestCoggins.status, locale)}</span>
                <span className={`badge ${cogginsValidityBadgeClass(cogginsValidity)}`}>{cogginsValidityTagLabel(cogginsValidity, locale)}</span>
                <strong>{latestCoggins.certificate_number ?? uiText(locale, "Certificat GVL", "GVL certificate")}</strong>
              </div>
              <span className="muted-line">
                {latestCoggins.test_or_administered_on ? `Test: ${formatDate(latestCoggins.test_or_administered_on)}` : uiText(locale, "Date de test inconnue", "Unknown test date")}
                {latestCoggins.result ? ` - ${latestCoggins.result}` : ""}
              </span>
              {latestCoggins.horse_name ? (
                <span className="muted-line">
                  GVL: {latestCoggins.horse_name}
                  {latestCoggins.horse_date_of_birth ? ` - ${uiText(locale, "né(e)", "born")} ${formatDate(latestCoggins.horse_date_of_birth)}` : ""}
                </span>
              ) : null}
              {latestCoggins.document_url ? <span className="muted-line">{uiText(locale, "PDF Coggins conservé pour révision.", "Coggins PDF stored for review.")}</span> : null}
              {latestCoggins.source_url ? (
                <a className="text-button inline-action" href={latestCoggins.source_url} rel="noreferrer" target="_blank">
                  {uiText(locale, "Ouvrir le lien GVL", "Open GVL link")}
                </a>
              ) : null}
              {latestCoggins.warnings.length ? <span className="muted-line">{uiText(locale, "Révision", "Review")}: {latestCoggins.warnings.join(", ")}</span> : null}
              <div className="row-actions health-review-actions">
                {latestCoggins.document_url ? (
                  <button className="text-button" disabled={fileBusyDocumentId === latestCoggins.id} type="button" onClick={() => void handleOpenStoredDocument(latestCoggins)}>
                    {fileBusyDocumentId === latestCoggins.id ? "Ouverture..." : "PDF"}
                  </button>
                ) : null}
                {latestCoggins.source_url ? (
                  <button className="text-button" disabled={healthBusy} type="button" onClick={() => void handleReverifyLatestGvlCoggins()}>
                    {uiText(locale, "Revérifier GVL", "Reverify GVL")}
                  </button>
                ) : null}
                {canManageHealthDocuments && latestCoggins.status === "pending_review" ? (
                  <>
                  <button className="text-button" disabled={healthBusy} type="button" onClick={() => handleReviewCoggins("approved")}>
                    {uiText(locale, "Approuver", "Approve")}
                  </button>
                  <button className="text-button danger-text" disabled={healthBusy} type="button" onClick={() => handleReviewCoggins("rejected")}>
                    {uiText(locale, "Refuser", "Reject")}
                  </button>
                  </>
                ) : null}
              </div>
              {fileErrorDocumentId === latestCoggins.id ? <span className="muted-line">{uiText(locale, "Impossible d'ouvrir le fichier", "Unable to open file")}: {fileErrorMessageByDocumentId[latestCoggins.id] || uiText(locale, "accès refusé.", "access denied.")}</span> : null}
            </div>
          ) : (
            <span className="muted-line">{uiText(locale, "Aucun Coggins GVL valide.", "No valid GVL Coggins.")}</span>
          )}
          <div className="health-document-actions">
            <label>
              PDF Coggins GVL
              <input accept="application/pdf" type="file" onChange={(event) => setCogginsPdfFile(event.target.files?.[0] ?? null)} />
              {cogginsPdfFile ? <span className="muted-line">{cogginsPdfFile.name}</span> : null}
            </label>
            <label>
              {uiText(locale, "Lien GVL en secours", "Fallback GVL link")}
              <input placeholder="https://gvlcertcheck.ai/check/..." type="url" value={gvlCogginsUrl} onChange={(event) => setGvlCogginsUrl(event.target.value)} />
            </label>
            <button className="primary-button" disabled={healthBusy || !organization || (!gvlCogginsUrl.trim() && !cogginsPdfFile)} type="button" onClick={handleVerifyGvlCoggins}>
              <CheckCircle2 size={18} />
              {healthBusy ? uiText(locale, "Validation...", "Validating...") : uiText(locale, "Valider GVL", "Validate GVL")}
            </button>
          </div>
          <InlineHealthMessage value={healthMessage} />
          <div className="inline-form-header">
            <strong>{uiText(locale, "Vaccin influenza/rhino", "Influenza/rhino vaccine")}</strong>
            <span>{uiText(locale, "Dépôt du certificat pour révision manuelle.", "Upload the certificate for manual review.")}</span>
          </div>
          {latestVaccine ? (
            <div className="health-document-summary">
              <div className="health-document-title">
                <span className={`badge ${latestVaccine.status}`}>{horseHealthStatusLabel(latestVaccine.status, locale)}</span>
                <strong>{uiText(locale, "Certificat vaccin", "Vaccine certificate")}</strong>
              </div>
              <span className="muted-line">
                {latestVaccine.test_or_administered_on ? `${uiText(locale, "Vaccin", "Vaccine")}: ${formatDate(latestVaccine.test_or_administered_on)}` : uiText(locale, "Date du vaccin inconnue", "Unknown vaccine date")}
                {latestVaccine.document_url ? uiText(locale, " - fichier déposé", " - file uploaded") : ""}
              </span>
              {canManageHealthDocuments && latestVaccine.status === "pending_review" ? (
                <label className="compact-label">
                  {uiText(locale, "Date vaccin validée", "Validated vaccine date")}
                  <input type="date" value={vaccineReviewDate} onChange={(event) => setVaccineReviewDate(event.target.value)} />
                </label>
              ) : null}
              <div className="row-actions health-review-actions">
                {latestVaccine.document_url ? (
                  <button className="text-button" disabled={fileBusyDocumentId === latestVaccine.id} type="button" onClick={() => void handleOpenStoredDocument(latestVaccine)}>
                    {fileBusyDocumentId === latestVaccine.id ? "Ouverture..." : "PDF"}
                  </button>
                ) : null}
              {canManageHealthDocuments && latestVaccine.status === "pending_review" ? (
                  <>
                  <button className="text-button" disabled={healthBusy || !vaccineReviewDate} type="button" onClick={() => handleReviewVaccine("approved")}>
                    {uiText(locale, "Approuver", "Approve")}
                  </button>
                  <button className="text-button danger-text" disabled={healthBusy} type="button" onClick={() => handleReviewVaccine("rejected")}>
                    {uiText(locale, "Refuser", "Reject")}
                  </button>
                  </>
              ) : null}
              </div>
              {fileErrorDocumentId === latestVaccine.id ? <span className="muted-line">{uiText(locale, "Impossible d'ouvrir le fichier", "Unable to open file")}: {fileErrorMessageByDocumentId[latestVaccine.id] || uiText(locale, "accès refusé.", "access denied.")}</span> : null}
            </div>
          ) : (
            <span className="muted-line">{uiText(locale, "Aucun certificat vaccin déposé.", "No vaccine certificate uploaded.")}</span>
          )}
          <div className="health-document-actions">
            <label>
              Certificat vaccin
              <input accept="application/pdf,image/*" type="file" onChange={(event) => setVaccineCertificateFile(event.target.files?.[0] ?? null)} />
              {vaccineCertificateFile ? <span className="muted-line">{vaccineCertificateFile.name}</span> : null}
            </label>
            <label>
              {uiText(locale, "Date du vaccin", "Vaccine date")}
              <input type="date" value={vaccineAdministeredOn} onChange={(event) => setVaccineAdministeredOn(event.target.value)} />
            </label>
            <button className="primary-button" disabled={healthBusy || !organization || !vaccineCertificateFile} type="button" onClick={handleUploadVaccineCertificate}>
              <FileText size={18} />
              {uiText(locale, "Ajouter vaccin", "Add vaccine")}
            </button>
          </div>
        </div>
        {externalReferenceFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>{uiText(locale, "Références externes du cheval", "External horse references")}</strong>
              <span>{uiText(locale, "Ex.: licence de compétition NRHA. Ces références pourront être validées par intégration externe plus tard.", "Example: NRHA competition license. These references can be validated through an external integration later.")}</span>
            </div>
            {externalReferenceFields.map((externalOrganization) => (
              <label key={externalOrganization.id}>
                {horseExternalReferenceLabel(externalOrganization)}
                <input
                  value={externalReferenceNumbers[externalOrganization.id] ?? ""}
                  onChange={(event) => {
                    setExternalReferenceNumbers((current) => ({
                      ...current,
                      [externalOrganization.id]: event.target.value,
                    }));

                    if (externalOrganization.code.toUpperCase() === "NRHA") {
                      clearNrhaHorseValidation();
                    }
                  }}
                />
                {externalOrganization.code.toUpperCase() === "NRHA" ? (
                  <div className="row-actions">
                    <button
                      className="ghost-button"
                      disabled={busy || nrhaHorseBusy || !organization || !externalReferenceNumbers[externalOrganization.id]?.trim()}
                      type="button"
                      onClick={() => handleVerifyNrhaHorse(externalOrganization)}
                    >
                      <ShieldCheck size={18} />
                      {nrhaHorseBusy ? uiText(locale, "Validation...", "Validating...") : uiText(locale, "Valider NRHA", "Validate NRHA")}
                    </button>
                  </div>
                ) : null}
              </label>
            ))}
            <InlineHealthMessage value={nrhaHorseMessage} />
          </div>
        ) : null}
        <FormActions busy={busy || !ownerContactId} cancelLabel={uiText(locale, "Annuler", "Cancel")} saveLabel={uiText(locale, "Sauvegarder", "Save changes")} onCancel={onCancel} />
      </form>
    </section>
  );
}

export { HorseEditForm };
