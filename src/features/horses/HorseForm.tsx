import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Plus, Search, ShieldCheck } from "lucide-react";
import { ContactPicker, SearchSelect } from "../../components/ui";
import { contactLabel, errorMessage, findById, formatDate, horseLabel, numericValue } from "../../lib/display";
import { normalizeGvlUrl } from "../../lib/gvlUrl";
import type { Locale } from "../../lib/i18n";
import { createContact, createHorse, createUploadedHorseHealthDocument, reviewHorseHealthDocument, verifyGvlCogginsDocument, verifyNrhaHorse } from "../../services/supabaseServices";
import type { NrhaHorseLookupVerification, NrhaHorseRecord } from "../../services/supabaseServices";
import type { Contact, ContactExternalMembership, ContactRole, ExternalOrganization, Horse, HorseContact, HorseExternalMembership, HorseHealthDocument, Organization, OrganizationExternalMembershipRequirement } from "../../types/domain";
import { uiText, birthYearFromDateValue, buildHorseExternalMembershipFields, buildExternalMembershipFields, horseReferenceTypeForOrganization, horseExternalReferenceLabel, resolveGvlCogginsUrl, healthDocumentTypeLabel, isVaccineHealthDocument, healthReviewNote, todayDateValue, InlineHealthMessage, horseHealthResultMessage, cogginsValidityBadgeClass, cogginsValidityTagLabel, cogginsValidityTone } from "../dashboard/shared";
import { integerFromReference, nrhaHorseMismatchMessage, verificationPayload, type NrhaHorseVerificationState } from "./nrhaHorseValidation";

type HorseCreationMode = "manual" | "import";
type ImportOwnerMode = "existing" | "new";

type NrhaImportResult = {
  horse: NrhaHorseRecord;
  referenceNumber: string;
  searchName: string;
  verification: NrhaHorseLookupVerification;
};

function HorseForm({
  locale = "fr",
  contacts,
  contactRoles,
  createdByUserId,
  externalOrganizations = [],
  membershipRequirements = [],
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
  membershipRequirements?: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
  onCreated?: (horse: Horse) => void;
}) {
  const [creationMode, setCreationMode] = useState<HorseCreationMode>("manual");
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
  const [nrhaImportReferenceNumber, setNrhaImportReferenceNumber] = useState("");
  const [nrhaImportName, setNrhaImportName] = useState("");
  const [nrhaImportBusy, setNrhaImportBusy] = useState(false);
  const [nrhaImportMessage, setNrhaImportMessage] = useState<InlineHealthMessage | null>(null);
  const [nrhaImportResult, setNrhaImportResult] = useState<NrhaImportResult | null>(null);
  const [importOwnerMode, setImportOwnerMode] = useState<ImportOwnerMode>("existing");
  const [importOwnerContactId, setImportOwnerContactId] = useState("");
  const [importOwnerFirstName, setImportOwnerFirstName] = useState("");
  const [importOwnerLastName, setImportOwnerLastName] = useState("");
  const [importOwnerEmail, setImportOwnerEmail] = useState("");
  const [importOwnerPhone, setImportOwnerPhone] = useState("");
  const [importOwnerBarnName, setImportOwnerBarnName] = useState("");
  const [importOwnerAddress, setImportOwnerAddress] = useState("");
  const [importOwnerAddressLine2, setImportOwnerAddressLine2] = useState("");
  const [importOwnerCity, setImportOwnerCity] = useState("");
  const [importOwnerState, setImportOwnerState] = useState("");
  const [importOwnerZipCode, setImportOwnerZipCode] = useState("");
  const [importOwnerCountry, setImportOwnerCountry] = useState("");
  const [importOwnerDateOfBirth, setImportOwnerDateOfBirth] = useState("");
  const [importOwnerMembershipNumbers, setImportOwnerMembershipNumbers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [healthMessage, setHealthMessage] = useState<InlineHealthMessage | null>(null);
  const currentUserContact = createdByUserId ? contacts.find((contact) => contact.linked_user_id === createdByUserId) : null;
  const selectedOwnerId = ownerContactId || currentUserContact?.id || "";
  const selectedOwnerContact = findById(contacts, selectedOwnerId) ?? null;
  const defaultAgentId = currentUserContact && selectedOwnerId !== currentUserContact.id ? currentUserContact.id : "";
  const selectedAgentId = agentContactId ?? defaultAgentId;
  const externalReferenceFields = useMemo(() => buildHorseExternalMembershipFields(externalOrganizations), [externalOrganizations]);
  const nrhaExternalOrganization = externalReferenceFields.find((externalOrganization) => externalOrganization.code.toUpperCase() === "NRHA") ?? null;
  const nrhaOrganizationId = nrhaExternalOrganization?.id ?? null;
  const importOwnerExternalMembershipFields = useMemo(
    () => buildExternalMembershipFields("owner", externalOrganizations, membershipRequirements),
    [externalOrganizations, membershipRequirements],
  );
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
  const canCreateImportedHorse = Boolean(
    organization &&
      nrhaImportResult &&
      ((importOwnerMode === "existing" && importOwnerContactId) ||
        (importOwnerMode === "new" &&
          importOwnerFirstName.trim() &&
          importOwnerLastName.trim() &&
          !importOwnerExternalMembershipFields.some((field) => field.required && !importOwnerMembershipNumbers[field.organization.id]?.trim()))),
  );
  const canCreateHorse = creationMode === "manual" ? Boolean(organization && selectedOwnerId) : canCreateImportedHorse;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (creationMode === "import") {
      await handleCreateImportedHorse();
      return;
    }

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

      await createInitialHealthDocuments(horse, name, dateOfBirth || null);

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
      setNrhaImportMessage(null);
      setNrhaImportResult(null);
      onCreated?.(horse);
    } finally {
      setBusy(false);
    }
  }

  async function handleSearchNrhaImport() {
    const licenseNumber = integerFromReference(nrhaImportReferenceNumber);

    setNrhaImportMessage(null);
    setNrhaImportResult(null);

    if (!nrhaExternalOrganization || !nrhaOrganizationId) {
      setNrhaImportMessage({
        tone: "error",
        message: uiText(locale, "L'organisation externe NRHA doit être configurée avant l'import.", "The NRHA external organization must be configured before import."),
      });
      return;
    }

    if (!licenseNumber) {
      setNrhaImportMessage({
        tone: "error",
        message: uiText(locale, "Entre un numéro NRHA valide avant l'import.", "Enter a valid NRHA number before import."),
      });
      return;
    }

    if (!nrhaImportName.trim()) {
      setNrhaImportMessage({
        tone: "error",
        message: uiText(locale, "Entre le nom du cheval à chercher dans NRHA.", "Enter the horse name to search in NRHA."),
      });
      return;
    }

    setNrhaImportBusy(true);

    try {
      const verification = await onVerifyNrhaHorse({
        licenseNumber,
        name: nrhaImportName,
      });

      if (verification.status === "not_found" || !verification.horse) {
        setNrhaImportMessage({
          tone: "error",
          message: uiText(locale, "NRHA: aucune fiche cheval trouvée pour ce numéro et ce nom.", "NRHA: no horse record found for this number and name."),
        });
        return;
      }

      const referenceNumber = String(verification.horse.licenseNumber ?? verification.licenseNumber ?? licenseNumber);
      const importedHorse = verification.horse;
      const officialName = importedHorse.horseName?.trim() || verification.officialHorseName || nrhaImportName.trim();
      const officialFoalDate = normalizeNrhaDate(importedHorse.foalDate ?? verification.officialFoalDate ?? "");
      const ownerName = importedHorse.ownerName?.trim() || verification.officialOwnerName || "";
      const ownerParts = splitOwnerName(ownerName);
      const suggestedOwner = findMatchingContactByName(contacts, ownerName);

      setNrhaImportResult({
        horse: importedHorse,
        referenceNumber,
        searchName: nrhaImportName.trim(),
        verification,
      });
      setName(officialName);
      setDateOfBirth(officialFoalDate);
      setGender(mapNrhaSex(importedHorse.sex));
      setRegistrationNumber(referenceNumber);
      setExternalReferenceNumbers((current) => ({
        ...current,
        [nrhaExternalOrganization.id]: referenceNumber,
      }));
      setImportOwnerContactId(suggestedOwner?.id ?? "");
      setImportOwnerMode(suggestedOwner ? "existing" : "new");
      setImportOwnerFirstName(ownerParts.firstName);
      setImportOwnerLastName(ownerParts.lastName);
      setImportOwnerEmail("");
      setImportOwnerPhone("");
      setImportOwnerBarnName("");
      setImportOwnerAddress("");
      setImportOwnerAddressLine2("");
      setImportOwnerCity(importedHorse.city?.trim() ?? "");
      setImportOwnerState(importedHorse.state?.trim() ?? "");
      setImportOwnerZipCode("");
      setImportOwnerCountry(importedHorse.country?.trim() ?? "");
      setImportOwnerDateOfBirth("");
      setImportOwnerMembershipNumbers(
        importedHorse.ownerMemberNumber && nrhaOrganizationId
          ? {
              [nrhaOrganizationId]: String(importedHorse.ownerMemberNumber),
            }
          : {},
      );
      setNrhaImportMessage({
        tone: "success",
        message: uiText(locale, "Fiche NRHA trouvée. Choisis comment jumeler le propriétaire avant de créer le cheval.", "NRHA record found. Choose how to match the owner before creating the horse."),
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

  async function handleCreateImportedHorse() {
    if (!organization || !nrhaImportResult || !nrhaExternalOrganization || !nrhaOrganizationId) {
      return;
    }

    if (importOwnerMode === "existing" && !importOwnerContactId) {
      setNrhaImportMessage({
        tone: "error",
        message: uiText(locale, "Choisis un contact propriétaire existant avant de créer le cheval.", "Choose an existing owner contact before creating the horse."),
      });
      return;
    }

    if (importOwnerMode === "new" && (!importOwnerFirstName.trim() || !importOwnerLastName.trim())) {
      setNrhaImportMessage({
        tone: "error",
        message: uiText(locale, "Prénom et nom sont requis pour créer le nouveau propriétaire.", "First name and last name are required to create the new owner."),
      });
      return;
    }

    if (importOwnerMode === "new" && importOwnerExternalMembershipFields.some((field) => field.required && !importOwnerMembershipNumbers[field.organization.id]?.trim())) {
      setNrhaImportMessage({
        tone: "error",
        message: uiText(locale, "Complète les numéros de membre obligatoires du propriétaire.", "Complete the owner's required membership numbers."),
      });
      return;
    }

    setBusy(true);
    setNrhaImportMessage(null);
    setHealthMessage(null);

    try {
      const importedHorse = nrhaImportResult.horse;
      const ownerContact =
        importOwnerMode === "existing"
          ? findById(contacts, importOwnerContactId)
          : await onCreateContact({
              organization_id: organization.id,
              type: "owner",
              roles: ["owner"],
              first_name: importOwnerFirstName.trim(),
              last_name: importOwnerLastName.trim(),
              email: importOwnerEmail.trim(),
              phone: importOwnerPhone.trim(),
              barn_name: importOwnerBarnName.trim(),
              address: importOwnerAddress.trim(),
              address_line2: importOwnerAddressLine2.trim(),
              city: importOwnerCity.trim(),
              state: importOwnerState.trim(),
              zip_code: importOwnerZipCode.trim(),
              country: importOwnerCountry.trim(),
              date_of_birth: importOwnerDateOfBirth,
              created_by_user_id: createdByUserId,
              external_memberships: importOwnerExternalMembershipFields.map((field) => ({
                external_organization_id: field.organization.id,
                membership_number: importOwnerMembershipNumbers[field.organization.id] ?? "",
                status: field.organization.id === nrhaOrganizationId && importedHorse.ownerMemberNumber ? "active" : "unknown",
              })),
            });
      const ownerContactIdForImport = ownerContact?.id ?? importOwnerContactId;

      if (!ownerContactIdForImport) {
        setNrhaImportMessage({
          tone: "error",
          message: uiText(locale, "Le propriétaire importé n'a pas pu être résolu.", "The imported owner could not be resolved."),
        });
        return;
      }

      const importedName = importedHorse.horseName?.trim() || nrhaImportResult.verification.officialHorseName || nrhaImportResult.searchName;
      const importedFoalDate = normalizeNrhaDate(importedHorse.foalDate ?? nrhaImportResult.verification.officialFoalDate ?? "");
      const importedReferenceNumber = nrhaImportResult.referenceNumber;
      const importedAgentId = currentUserContact && ownerContactIdForImport !== currentUserContact.id ? currentUserContact.id : "";
      const horse = await onCreateHorse({
        organization_id: organization.id,
        name: importedName,
        primary_owner_contact_id: ownerContactIdForImport,
        agent_contact_id: importedAgentId || null,
        breed: "",
        gender: mapNrhaSex(importedHorse.sex) || null,
        date_of_birth: importedFoalDate || null,
        registration_number: importedReferenceNumber,
        created_by_user_id: createdByUserId,
        external_memberships: externalReferenceFields.map((externalOrganization) => ({
          external_organization_id: externalOrganization.id,
          reference_type: horseReferenceTypeForOrganization(externalOrganization),
          reference_number: externalOrganization.id === nrhaExternalOrganization.id ? importedReferenceNumber : externalReferenceNumbers[externalOrganization.id] ?? "",
          status: externalOrganization.id === nrhaExternalOrganization.id ? "active" : "unknown",
          verified_at: externalOrganization.id === nrhaExternalOrganization.id ? new Date().toISOString() : null,
          verification_payload: externalOrganization.id === nrhaExternalOrganization.id ? verificationPayload(nrhaImportResult.verification) : undefined,
          verification_source: externalOrganization.id === nrhaExternalOrganization.id ? "nrha_api" : null,
        })),
      });

      await createInitialHealthDocuments(horse, importedName, importedFoalDate || null);

      resetHorseCreationState();
      onCreated?.(horse);
    } catch (error) {
      setNrhaImportMessage({
        tone: "error",
        message: errorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  async function createInitialHealthDocuments(horse: Horse, horseName: string, horseDateOfBirth: string | null) {
    if (!organization) {
      return;
    }

    if (preparedGvlUrl || cogginsPdfFile || gvlCogginsUrl.trim()) {
      try {
        const sourceUrl = preparedGvlUrl || (await resolveGvlCogginsUrl(cogginsPdfFile, gvlCogginsUrl));

        if (sourceUrl) {
          const document = await onVerifyGvlCogginsDocument({
            organization_id: organization.id,
            horse_id: horse.id,
            source_url: sourceUrl,
            document_file: cogginsPdfFile,
            horse_name: horseName,
            horse_date_of_birth: horseDateOfBirth,
            horse_birth_year: birthYearFromDateValue(horseDateOfBirth ?? ""),
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
  }

  function resetHorseCreationState() {
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
    setNrhaImportReferenceNumber("");
    setNrhaImportName("");
    setNrhaImportMessage(null);
    setNrhaImportResult(null);
    setImportOwnerMode("existing");
    setImportOwnerContactId("");
    setImportOwnerFirstName("");
    setImportOwnerLastName("");
    setImportOwnerEmail("");
    setImportOwnerPhone("");
    setImportOwnerBarnName("");
    setImportOwnerAddress("");
    setImportOwnerAddressLine2("");
    setImportOwnerCity("");
    setImportOwnerState("");
    setImportOwnerZipCode("");
    setImportOwnerCountry("");
    setImportOwnerDateOfBirth("");
    setImportOwnerMembershipNumbers({});
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

  function renderInitialHealthDocumentFields(disabled = !organization) {
    const controlsDisabled = disabled || !organization;

    return (
      <div className="external-membership-fields health-document-fields">
        <div className="inline-form-header">
          <strong>{uiText(locale, "Documents santé initiaux", "Initial health documents")}</strong>
          <span>{uiText(locale, "Ajoute le Coggins GVL et le certificat de vaccin pendant la création du cheval.", "Add the GVL Coggins and vaccine certificate while creating the horse.")}</span>
        </div>
        <label>
          PDF Coggins GVL
          <input accept="application/pdf" disabled={controlsDisabled} type="file" onChange={(event) => setCogginsPdfFile(event.target.files?.[0] ?? null)} />
          {cogginsPdfFile ? <span className="muted-line">{cogginsPdfFile.name}</span> : null}
        </label>
        <label>
          {uiText(locale, "Lien GVL en secours", "Backup GVL link")}
          <input disabled={controlsDisabled} placeholder="https://gvlcertcheck.ai/check/..." type="url" value={gvlCogginsUrl} onChange={(event) => setGvlCogginsUrl(event.target.value)} />
        </label>
        <div className="row-actions">
          <button className="primary-button" disabled={controlsDisabled || busy || (!cogginsPdfFile && !gvlCogginsUrl.trim())} type="button" onClick={handlePrepareCogginsUrl}>
            <CheckCircle2 size={18} />
            {uiText(locale, "Valider le lien GVL", "Validate GVL link")}
          </button>
          {preparedGvlUrl ? <span className="muted-line">{uiText(locale, "Lien détecté", "Detected link")}: {preparedGvlUrl}</span> : null}
        </div>
        <InlineHealthMessage value={healthMessage} />
        <div className="health-document-actions">
          <label>
            {uiText(locale, "Certificat vaccin influenza/rhino", "Influenza/rhino vaccine certificate")}
            <input accept="application/pdf,image/*" disabled={controlsDisabled} type="file" onChange={(event) => setVaccineCertificateFile(event.target.files?.[0] ?? null)} />
            {vaccineCertificateFile ? <span className="muted-line">{vaccineCertificateFile.name}</span> : null}
          </label>
          <label>
            {uiText(locale, "Date du vaccin", "Vaccine date")}
            <input disabled={controlsDisabled} type="date" value={vaccineAdministeredOn} onChange={(event) => setVaccineAdministeredOn(event.target.value)} />
          </label>
        </div>
      </div>
    );
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
        <div className="segmented-control compact-segmented">
          <button className={creationMode === "manual" ? "active" : ""} type="button" onClick={() => setCreationMode("manual")}>
            {uiText(locale, "Création manuelle", "Manual creation")}
          </button>
          <button className={creationMode === "import" ? "active" : ""} type="button" onClick={() => setCreationMode("import")}>
            {uiText(locale, "Importer", "Import")}
          </button>
        </div>

        {creationMode === "manual" ? (
          <>
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
              externalOrganizations={externalOrganizations}
              label={uiText(locale, "Propriétaire", "Owner")}
              locale={locale}
              membershipRequirements={membershipRequirements}
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
              externalOrganizations={externalOrganizations}
              label="Agent"
              locale={locale}
              membershipRequirements={membershipRequirements}
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
                  <option value="M">{uiText(locale, "Mâle (Stallion / Colt)", "Male (Stallion / Colt)")}</option>
                  <option value="F">{uiText(locale, "Femelle (Mare / Filly)", "Female (Mare / Filly)")}</option>
                  <option value="G">{uiText(locale, "Hongre (Gelding)", "Gelding")}</option>
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
            {renderInitialHealthDocumentFields(!organization)}
            {externalReferenceFields.length ? (
              <div className="external-membership-fields">
                <div className="inline-form-header">
                  <strong>{uiText(locale, "Références externes du cheval", "External horse references")}</strong>
                  <span>{uiText(locale, "Ex.: licence de compétition NRHA. Si tu ajoutes un numéro NRHA, valide-le avec le nom, la naissance et le propriétaire.", "Example: NRHA competition license. If you add an NRHA number, validate it against name, birth date and owner.")}</span>
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
          </>
        ) : (
          <div className="external-membership-fields horse-import-fields">
            <div className="inline-form-header">
              <strong>{uiText(locale, "Importer d'un organisme", "Import from an organization")}</strong>
              <span>{uiText(locale, "Pour l'instant, l'import officiel disponible est NRHA.", "For now, the available official import is NRHA.")}</span>
            </div>
            <div className="form-grid">
              <label>
                {uiText(locale, "Organisme", "Organization")}
                <select disabled value="NRHA">
                  <option value="NRHA">NRHA</option>
                </select>
              </label>
              <label>
                {uiText(locale, "Numéro NRHA", "NRHA number")}
                <input
                  disabled={!organization || nrhaImportBusy}
                  inputMode="numeric"
                  value={nrhaImportReferenceNumber}
                  onChange={(event) => {
                    setNrhaImportReferenceNumber(event.target.value);
                    setNrhaImportResult(null);
                    setNrhaImportMessage(null);
                  }}
                />
              </label>
            </div>
            <label>
              {uiText(locale, "Nom du cheval dans NRHA", "Horse name in NRHA")}
              <input
                disabled={!organization || nrhaImportBusy}
                value={nrhaImportName}
                onChange={(event) => {
                  setNrhaImportName(event.target.value);
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
              <div className="nrha-import-preview">
                <div className="inline-form-header">
                  <strong>{uiText(locale, "Fiche NRHA importée", "Imported NRHA record")}</strong>
                  <span>{uiText(locale, "Ces valeurs seront utilisées pour créer le cheval.", "These values will be used to create the horse.")}</span>
                </div>
                <div className="nrha-import-preview-grid">
                  <div>
                    <span>{uiText(locale, "Cheval", "Horse")}</span>
                    <strong>{nrhaImportResult.horse.horseName || nrhaImportResult.verification.officialHorseName || nrhaImportResult.searchName}</strong>
                  </div>
                  <div>
                    <span>{uiText(locale, "Naissance", "Birth date")}</span>
                    <strong>{formatImportedDate(nrhaImportResult.horse.foalDate ?? nrhaImportResult.verification.officialFoalDate, locale)}</strong>
                  </div>
                  <div>
                    <span>{uiText(locale, "Sexe", "Sex")}</span>
                    <strong>{formatImportedSex(nrhaImportResult.horse.sex, locale)}</strong>
                  </div>
                  <div>
                    <span>{uiText(locale, "Licence", "License")}</span>
                    <strong>{nrhaImportResult.referenceNumber}</strong>
                  </div>
                  <div>
                    <span>{uiText(locale, "Propriétaire NRHA", "NRHA owner")}</span>
                    <strong>{nrhaImportResult.horse.ownerName || nrhaImportResult.verification.officialOwnerName || uiText(locale, "Non fourni", "Not provided")}</strong>
                  </div>
                  <div>
                    <span>{uiText(locale, "Membre propriétaire", "Owner member")}</span>
                    <strong>{nrhaImportResult.horse.ownerMemberNumber || uiText(locale, "Non fourni", "Not provided")}</strong>
                  </div>
                </div>

                <div className="nrha-import-owner-panel">
                  <div className="inline-form-header">
                    <strong>{uiText(locale, "Propriétaire dans HSP", "Owner in HSP")}</strong>
                    <span>{uiText(locale, "Choisis si le propriétaire NRHA correspond à un contact existant ou s'il faut en créer un nouveau.", "Choose whether the NRHA owner matches an existing contact or a new one should be created.")}</span>
                  </div>
                  <div className="segmented-control compact-segmented">
                    <button className={importOwnerMode === "existing" ? "active" : ""} type="button" onClick={() => setImportOwnerMode("existing")}>
                      {uiText(locale, "Jumeler existant", "Match existing")}
                    </button>
                    <button className={importOwnerMode === "new" ? "active" : ""} type="button" onClick={() => setImportOwnerMode("new")}>
                      {uiText(locale, "Créer nouveau", "Create new")}
                    </button>
                  </div>

                  {importOwnerMode === "existing" ? (
                    <label>
                      {uiText(locale, "Contact existant", "Existing contact")}
                      <SearchSelect
                        disabled={!organization || !contacts.length}
                        emptyLabel={uiText(locale, "Aucun contact", "No contacts")}
                        items={contacts.map((contact) => ({
                          id: contact.id,
                          label: contactLabel(contact),
                          detail: contactImportDetail(contact),
                        }))}
                        placeholder={uiText(locale, "Rechercher un propriétaire", "Search an owner")}
                        value={importOwnerContactId}
                        onChange={setImportOwnerContactId}
                      />
                    </label>
                  ) : (
                    <>
                      <div className="form-grid">
                        <label>
                          {uiText(locale, "Prénom", "First name")}
                          <input disabled={!organization || busy} value={importOwnerFirstName} onChange={(event) => setImportOwnerFirstName(event.target.value)} />
                        </label>
                        <label>
                          {uiText(locale, "Nom", "Last name")}
                          <input disabled={!organization || busy} value={importOwnerLastName} onChange={(event) => setImportOwnerLastName(event.target.value)} />
                        </label>
                      </div>
                      <label>
                        {uiText(locale, "Courriel", "Email")}
                        <input disabled={!organization || busy} type="email" value={importOwnerEmail} onChange={(event) => setImportOwnerEmail(event.target.value)} />
                      </label>
                      <div className="form-grid">
                        <label>
                          {uiText(locale, "Téléphone", "Phone")}
                          <input disabled={!organization || busy} value={importOwnerPhone} onChange={(event) => setImportOwnerPhone(event.target.value)} />
                        </label>
                        <label>
                          {uiText(locale, "Écurie", "Barn")}
                          <input disabled={!organization || busy} value={importOwnerBarnName} onChange={(event) => setImportOwnerBarnName(event.target.value)} />
                        </label>
                      </div>
                      <label>
                        {uiText(locale, "Adresse", "Address")}
                        <input disabled={!organization || busy} value={importOwnerAddress} onChange={(event) => setImportOwnerAddress(event.target.value)} />
                      </label>
                      <label>
                        {uiText(locale, "Appartement, suite, unité", "Apartment, suite, unit")}
                        <input disabled={!organization || busy} value={importOwnerAddressLine2} onChange={(event) => setImportOwnerAddressLine2(event.target.value)} />
                      </label>
                      <div className="form-grid">
                        <label>
                          {uiText(locale, "Ville", "City")}
                          <input disabled={!organization || busy} value={importOwnerCity} onChange={(event) => setImportOwnerCity(event.target.value)} />
                        </label>
                        <label>
                          {uiText(locale, "Province / État", "Province / State")}
                          <input disabled={!organization || busy} value={importOwnerState} onChange={(event) => setImportOwnerState(event.target.value)} />
                        </label>
                      </div>
                      <div className="form-grid">
                        <label>
                          {uiText(locale, "Code postal", "Postal code")}
                          <input disabled={!organization || busy} value={importOwnerZipCode} onChange={(event) => setImportOwnerZipCode(event.target.value)} />
                        </label>
                        <label>
                          {uiText(locale, "Pays", "Country")}
                          <input disabled={!organization || busy} value={importOwnerCountry} onChange={(event) => setImportOwnerCountry(event.target.value)} />
                        </label>
                      </div>
                      <label>
                        {uiText(locale, "Date de naissance", "Date of birth")}
                        <input disabled={!organization || busy} type="date" value={importOwnerDateOfBirth} onChange={(event) => setImportOwnerDateOfBirth(event.target.value)} />
                      </label>
                      {importOwnerExternalMembershipFields.length ? (
                        <div className="external-membership-fields">
                          <div className="inline-form-header">
                            <strong>{uiText(locale, "Numéros de membre externes", "External membership numbers")}</strong>
                            <span>{uiText(locale, "Les numéros connus de NRHA sont préremplis quand disponibles.", "Known NRHA numbers are prefilled when available.")}</span>
                          </div>
                          {importOwnerExternalMembershipFields.map((field) => (
                            <label key={field.organization.id}>
                              {field.organization.code} #
                              <input
                                disabled={!organization || busy}
                                required={field.required}
                                value={importOwnerMembershipNumbers[field.organization.id] ?? ""}
                                onChange={(event) =>
                                  setImportOwnerMembershipNumbers((current) => ({
                                    ...current,
                                    [field.organization.id]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>

                {renderInitialHealthDocumentFields(!organization || busy)}
              </div>
            ) : null}
          </div>
        )}

        <button className="primary-button" disabled={busy || !canCreateHorse} type="submit">
          <Plus size={18} />
          {creationMode === "import" ? uiText(locale, "Créer le cheval importé", "Create imported horse") : uiText(locale, "Créer le cheval", "Create horse")}
        </button>
      </form>
    </section>
  );
}

function normalizeNrhaDate(value: string | null | undefined) {
  const cleanValue = value?.trim() ?? "";

  if (!cleanValue) {
    return "";
  }

  const isoMatch = cleanValue.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const usMatch = cleanValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}-${usMatch[2].padStart(2, "0")}`;
  }

  return cleanValue;
}

function formatImportedDate(value: string | null | undefined, locale: Locale) {
  const normalized = normalizeNrhaDate(value);
  return normalized ? formatDate(normalized) : uiText(locale, "Non fourni", "Not provided");
}

function mapNrhaSex(value: string | null | undefined): "" | NonNullable<Horse["gender"]> {
  const normalized = (value ?? "").trim().toUpperCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ");

  if (["MARE", "FILLY", "FEMALE", "F"].includes(normalized)) {
    return "F";
  }

  if (["GELDING", "G"].includes(normalized)) {
    return "G";
  }

  if (["STALLION", "COLT", "MALE", "M"].includes(normalized)) {
    return "M";
  }

  return "";
}

function formatImportedSex(value: string | null | undefined, locale: Locale) {
  const rawValue = value?.trim() ?? "";
  const mappedSex = mapNrhaSex(value);

  if (!rawValue) {
    return uiText(locale, "Non défini", "Unset");
  }

  if (mappedSex === "F") {
    return `${rawValue} -> ${uiText(locale, "Femelle", "Female")}`;
  }

  if (mappedSex === "M") {
    return `${rawValue} -> ${uiText(locale, "Mâle", "Male")}`;
  }

  if (mappedSex === "G") {
    return `${rawValue} -> ${uiText(locale, "Hongre", "Gelding")}`;
  }

  return rawValue;
}

function splitOwnerName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return { firstName: "", lastName: "" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "Owner" };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}

function findMatchingContactByName(contacts: Contact[], ownerName: string) {
  const normalizedOwnerName = normalizeImportText(ownerName);

  if (!normalizedOwnerName) {
    return null;
  }

  return contacts.find((contact) => normalizeImportText(contactLabel(contact)) === normalizedOwnerName) ?? null;
}

function normalizeImportText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function contactImportDetail(contact: Contact) {
  return [contact.email, contact.barn_name, contact.city, contact.state].filter(Boolean).join(" · ");
}

export { HorseForm };
