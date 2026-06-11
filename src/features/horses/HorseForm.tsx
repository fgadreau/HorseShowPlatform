import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { ContactPicker, SearchSelect } from "../../components/ui";
import { contactLabel, errorMessage, findById, formatDate, horseLabel, numericValue } from "../../lib/display";
import { normalizeGvlUrl } from "../../lib/gvlUrl";
import type { Locale } from "../../lib/i18n";
import { createContact, createHorse, createUploadedHorseHealthDocument, reviewHorseHealthDocument, verifyGvlCogginsDocument } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership, ContactRole, ExternalOrganization, Horse, HorseContact, HorseExternalMembership, HorseHealthDocument, Organization, OrganizationExternalMembershipRequirement } from "../../types/domain";
import { uiText, birthYearFromDateValue, buildHorseExternalMembershipFields, buildExternalMembershipFields, horseReferenceTypeForOrganization, horseExternalReferenceLabel, resolveGvlCogginsUrl, healthDocumentTypeLabel, isVaccineHealthDocument, healthReviewNote, todayDateValue, InlineHealthMessage, horseHealthResultMessage, cogginsValidityBadgeClass, cogginsValidityTagLabel, cogginsValidityTone } from "../dashboard/shared";

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
  const [busy, setBusy] = useState(false);
  const [healthMessage, setHealthMessage] = useState<InlineHealthMessage | null>(null);
  const currentUserContact = createdByUserId ? contacts.find((contact) => contact.linked_user_id === createdByUserId) : null;
  const selectedOwnerId = ownerContactId || currentUserContact?.id || "";
  const defaultAgentId = currentUserContact && selectedOwnerId !== currentUserContact.id ? currentUserContact.id : "";
  const selectedAgentId = agentContactId ?? defaultAgentId;
  const externalReferenceFields = useMemo(() => buildHorseExternalMembershipFields(externalOrganizations), [externalOrganizations]);

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
          status: "unknown",
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
      onCreated?.(horse);
    } finally {
      setBusy(false);
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
          <input disabled={!organization} required value={name} onChange={(event) => setName(event.target.value)} />
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
          onChange={setOwnerContactId}
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
          <input disabled={!organization} type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} />
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
                  onChange={(event) =>
                    setExternalReferenceNumbers((current) => ({
                      ...current,
                      [externalOrganization.id]: event.target.value,
                    }))
                  }
                />
              </label>
            ))}
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
