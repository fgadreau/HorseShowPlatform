import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Plus, ShieldCheck } from "lucide-react";
import { ContactPicker, SearchSelect } from "../../components/ui";
import { contactLabel, errorMessage, findById, formatDate, horseLabel, numericValue } from "../../lib/display";
import { normalizeGvlUrl } from "../../lib/gvlUrl";
import type { Locale } from "../../lib/i18n";
import { createContact, createHorse, createUploadedHorseHealthDocument, reviewHorseHealthDocument, verifyGvlCogginsDocument, verifyNrhaHorse } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership, ContactRole, ExternalOrganization, Horse, HorseContact, HorseExternalMembership, HorseHealthDocument, Organization, OrganizationExternalMembershipRequirement } from "../../types/domain";
import { uiText, birthYearFromDateValue, buildHorseExternalMembershipFields, buildExternalMembershipFields, horseReferenceTypeForOrganization, horseExternalReferenceLabel, resolveGvlCogginsUrl, healthDocumentTypeLabel, isVaccineHealthDocument, healthReviewNote, todayDateValue, InlineHealthMessage, horseHealthResultMessage, cogginsValidityBadgeClass, cogginsValidityTagLabel, cogginsValidityTone } from "../dashboard/shared";
import { integerFromReference, nrhaHorseMismatchMessage, verificationPayload, type NrhaHorseVerificationState } from "./nrhaHorseValidation";

function HorseForm({
  locale = "fr",
  contacts,
  contactRoles,
  createdByUserId,
  externalOrganizations = [],
  organization,
  onCreateContact,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaHorse,
  onCreated,
}: {
  locale?: Locale;
  contacts: Contact[];
  contactRoles: ContactRole[];
  createdByUserId?: string;
  externalOrganizations?: ExternalOrganization[];
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
  onCreated?: (horse: Horse) => void;
}) {
  const [name, setName] = useState("");
  const [ownerContactId, setOwnerContactId] = useState("");
  const [agentContactId, setAgentContactId] = useState<string | null>(null);
  const [breed, setBreed] = useState("");
  const [gender, setGender] = useState<"" | NonNullable<Horse["gender"]>>("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [gvlCogginsUrl, setGvlCogginsUrl] = useState("");
  const [cogginsPdfFile, setCogginsPdfFile] = useState<File | null>(null);
  const [preparedGvlUrl, setPreparedGvlUrl] = useState("");
  const [vaccineCertificateFile, setVaccineCertificateFile] = useState<File | null>(null);
  const [vaccineAdministeredOn, setVaccineAdministeredOn] = useState("");
  const [externalReferenceNumbers, setExternalReferenceNumbers] = useState<Record<string, string>>({});
  const [nrhaHorseBusy, setNrhaHorseBusy] = useState(false);
  const [nrhaHorseMessage, setNrhaHorseMessage] = useState<InlineHealthMessage | null>(null);
  const [nrhaHorseVerification, setNrhaHorseVerification] = useState<NrhaHorseVerificationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [healthMessage, setHealthMessage] = useState<InlineHealthMessage | null>(null);
  const currentUserContact = createdByUserId ? contacts.find((contact) => contact.linked_user_id === createdByUserId) : null;
  const selectedOwnerId = ownerContactId || currentUserContact?.id || "";
  const selectedOwnerContact = findById(contacts, selectedOwnerId) ?? null;
  const defaultAgentId = currentUserContact && selectedOwnerId !== currentUserContact.id ? currentUserContact.id : "";
  const selectedAgentId = agentContactId ?? defaultAgentId;
  const externalReferenceFields = useMemo(() => buildHorseExternalMembershipFields(externalOrganizations), [externalOrganizations]);
  const nrhaOrganizationId = externalReferenceFields.find((externalOrganization) => externalOrganization.code.toUpperCase() === "NRHA")?.id ?? null;
  const currentNrhaReferenceNumber = nrhaOrganizationId ? externalReferenceNumbers[nrhaOrganizationId]?.trim() ?? "" : "";
  const verifiedNrhaHorse =
    nrhaHorseVerification &&
    nrhaHorseVerification.organizationId === nrhaOrganizationId &&
    nrhaHorseVerification.referenceNumber === currentNrhaReferenceNumber &&
    nrhaHorseVerification.name === name.trim() &&
    nrhaHorseVerification.dateOfBirth === dateOfBirth &&
    nrhaHorseVerification.ownerContactId === selectedOwnerId
      ? nrhaHorseVerification
      : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !selectedOwnerId) {
      return;
    }

    setBusy(true);
    setHealthMessage(null);

    try {
      const horse = await onCreateHorse({
        organization_id: organization.id,
        name,
        primary_owner_contact_id: selectedOwnerId,
        agent_contact_id: selectedAgentId && selectedAgentId !== selectedOwnerId ? selectedAgentId : null,
        breed,
        gender: gender || null,
        date_of_birth: dateOfBirth || null,
        registration_number: registrationNumber,
        created_by_user_id: createdByUserId,
        external_memberships: externalReferenceFields.map((organization) => ({
          external_organization_id: organization.id,
          reference_type: horseReferenceTypeForOrganization(organization),
          reference_number: externalReferenceNumbers[organization.id] ?? "",
          status: verifiedNrhaHorse && organization.id === verifiedNrhaHorse.organizationId ? "active" : "unknown",
          verified_at: verifiedNrhaHorse && organization.id === verifiedNrhaHorse.organizationId ? new Date().toISOString() : null,
          verification_payload: verifiedNrhaHorse && organization.id === verifiedNrhaHorse.organizationId ? verifiedNrhaHorse.payload : undefined,
          verification_source: verifiedNrhaHorse && organization.id === verifiedNrhaHorse.organizationId ? "nrha_api" : null,
        })),
      });

      if (preparedGvlUrl || cogginsPdfFile || gvlCogginsUrl.trim()) {
        try {
          const sourceUrl = preparedGvlUrl || (await resolveGvlCogginsUrl(cogginsPdfFile, gvlCogginsUrl));

          if (sourceUrl) {
            const document = await onVerifyGvlCogginsDocument({
              organization_id: organization.id,
              horse_id: horse.id,
              source_url: sourceUrl,
              document_file: cogginsPdfFile,
              horse_name: name,
              horse_date_of_birth: dateOfBirth || null,
              horse_birth_year: birthYearFromDateValue(dateOfBirth),
              created_by_user_id: createdByUserId,
            });
            setHealthMessage(horseHealthResultMessage(document));
          }
        } catch (error) {
          if (cogginsPdfFile) {
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
          } else {
            setHealthMessage({
              tone: "error",
              message: uiText(locale, `Cheval créé, mais Coggins GVL non valide: ${errorMessage(error)}`, `Horse created, but GVL Coggins is not valid: ${errorMessage(error)}`),
            });
          }
        }
      }

      if (vaccineCertificateFile) {
        await onCreateHorseHealthDocument({
          organization_id: organization.id,
          horse_id: horse.id,
          document_type: "combo_vaccine",
          file: vaccineCertificateFile,
          test_or_administered_on: vaccineAdministeredOn || null,
          created_by_user_id: createdByUserId,
        });
      }

      setName("");
      setOwnerContactId("");
      setAgentContactId(null);
      setBreed("");
      setGender("");
      setDateOfBirth("");
      setRegistrationNumber("");
      setGvlCogginsUrl("");
      setCogginsPdfFile(null);
      setPreparedGvlUrl("");
      setVaccineCertificateFile(null);
      setVaccineAdministeredOn("");
      setExternalReferenceNumbers({});
      setNrhaHorseMessage(null);
      setNrhaHorseVerification(null);
      onCreated?.(horse);
    } finally {
      setBusy(false);
    }
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
          ownerContactId: selectedOwnerId,
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

  async function handlePrepareCogginsUrl() {
    setHealthMessage(null);
    setBusy(true);

    try {
      const sourceUrl = await resolveGvlCogginsUrl(cogginsPdfFile, gvlCogginsUrl);

      if (!sourceUrl) {
        setHealthMessage({
          tone: "error",
          message: uiText(locale, "Ajoute un PDF Coggins GVL ou colle un lien GVL avant de valider.", "Add a GVL Coggins PDF or paste a GVL link before validating."),
        });
        return;
      }

      setPreparedGvlUrl(sourceUrl);
      setGvlCogginsUrl(sourceUrl);
      setHealthMessage({
        tone: "success",
        message: uiText(locale, "Lien GVL prêt. Il sera validé et enregistré quand tu créeras le cheval.", "GVL link ready. It will be validated and saved when you create the horse."),
      });
    } catch (error) {
      setPreparedGvlUrl("");
      setHealthMessage({
        tone: "error",
        message: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Nouveau cheval", "New horse")}</h2>
          <p>{contacts.length ? uiText(locale, "Connecte le cheval à un propriétaire.", "Connect a horse to an owner.") : uiText(locale, "Crée un contact propriétaire depuis ce formulaire.", "Create an owner contact from this form.")}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Nom du cheval", "Horse name")}
          <input
            disabled={!organization}
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
          disabled={!organization}
          label={uiText(locale, "Propriétaire", "Owner")}
          locale={locale}
          organization={organization}
          role="owner"
          value={selectedOwnerId}
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
          disabled={!organization}
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
            <input disabled={!organization} value={breed} onChange={(event) => setBreed(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Sexe", "Sex")}
            <select disabled={!organization} value={gender} onChange={(event) => setGender(event.target.value as "" | NonNullable<Horse["gender"]>)}>
              <option value="">{uiText(locale, "Non défini", "Unset")}</option>
              <option value="M">M</option>
              <option value="F">F</option>
              <option value="G">G</option>
            </select>
          </label>
        </div>
        <label>
          {uiText(locale, "Date de naissance", "Date of birth")}
          <input
            disabled={!organization}
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
          <input disabled={!organization} value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} />
        </label>
        <div className="external-membership-fields health-document-fields">
          <div className="inline-form-header">
            <strong>{uiText(locale, "Documents santé initiaux", "Initial health documents")}</strong>
            <span>{uiText(locale, "Ajoute le Coggins GVL et le certificat de vaccin pendant la création du cheval.", "Add the GVL Coggins and vaccine certificate while creating the horse.")}</span>
          </div>
          <label>
            PDF Coggins GVL
            <input accept="application/pdf" disabled={!organization} type="file" onChange={(event) => setCogginsPdfFile(event.target.files?.[0] ?? null)} />
            {cogginsPdfFile ? <span className="muted-line">{cogginsPdfFile.name}</span> : null}
          </label>
          <label>
            {uiText(locale, "Lien GVL en secours", "Backup GVL link")}
            <input disabled={!organization} placeholder="https://gvlcertcheck.ai/check/..." type="url" value={gvlCogginsUrl} onChange={(event) => setGvlCogginsUrl(event.target.value)} />
          </label>
          <div className="row-actions">
            <button className="primary-button" disabled={busy || !organization || (!cogginsPdfFile && !gvlCogginsUrl.trim())} type="button" onClick={handlePrepareCogginsUrl}>
              <CheckCircle2 size={18} />
              {uiText(locale, "Valider le lien GVL", "Validate GVL link")}
            </button>
            {preparedGvlUrl ? <span className="muted-line">{uiText(locale, "Lien détecté", "Detected link")}: {preparedGvlUrl}</span> : null}
          </div>
          <InlineHealthMessage value={healthMessage} />
          <div className="health-document-actions">
            <label>
              {uiText(locale, "Certificat vaccin influenza/rhino", "Influenza/rhino vaccine certificate")}
              <input accept="application/pdf,image/*" disabled={!organization} type="file" onChange={(event) => setVaccineCertificateFile(event.target.files?.[0] ?? null)} />
              {vaccineCertificateFile ? <span className="muted-line">{vaccineCertificateFile.name}</span> : null}
            </label>
            <label>
              {uiText(locale, "Date du vaccin", "Vaccine date")}
              <input disabled={!organization} type="date" value={vaccineAdministeredOn} onChange={(event) => setVaccineAdministeredOn(event.target.value)} />
            </label>
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
                  disabled={!organization}
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
        <button className="primary-button" disabled={busy || !organization || !selectedOwnerId} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer le cheval", "Create horse")}
        </button>
      </form>
    </section>
  );
}

export { HorseForm };
