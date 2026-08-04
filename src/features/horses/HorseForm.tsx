import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Plus, Search, ShieldCheck } from "lucide-react";
import { ExternalImportDataPanel } from "../../components/ExternalImportDataPanel";
import { ContactPicker, SearchSelect } from "../../components/ui";
import { contactLabel, errorMessage, findById, formatDate, horseLabel, numericValue } from "../../lib/display";
import { normalizeGvlUrl } from "../../lib/gvlUrl";
import type { Locale } from "../../lib/i18n";
import { createContact, createHorse, createUploadedHorseHealthDocument, verifyGvlCogginsDocument, verifyNrhaHorse } from "../../services/supabaseServices";
import type { ContactIdentityCandidate, HorseIdentityCandidate, NrhaHorseLookupVerification, NrhaHorseRecord } from "../../services/supabaseServices";
import type { Contact, ContactExternalIdentifier, ContactRole, ExternalCredentialIssuer, Horse, HorseContact, HorseExternalIdentifier, HorseHealthDocument, Organization, OrganizationExternalCredentialRequirement } from "../../types/domain";
import { uiText, birthYearFromDateValue, buildHorseExternalIdentifierFields, buildExternalMembershipFields, horseReferenceTypeForOrganization, horseExternalReferenceLabel, resolveGvlCogginsUrl, healthDocumentTypeLabel, isVaccineHealthDocument, healthReviewNote, todayDateValue, InlineHealthMessage, horseHealthResultMessage } from "../dashboard/shared";
import { compareNrhaHorseIdentity, formatImportedSex, integerFromReference, mapNrhaSex, normalizeNrhaDate, nrhaHorseDataImportRows, nrhaHorseImportDecisionPayload, nrhaHorseMismatchMessage, nrhaOfficialHorseValues, verificationPayload, type NrhaHorseDataImportRow, type NrhaHorseVerificationState } from "./nrhaHorseValidation";
import { HorseIdentityCandidateReview } from "../people/IdentityCandidateReview";

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
  externalCredentialIssuers = [],
  membershipRequirements = [],
  organization,
  onCreateContact,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onDismissContactIdentityCandidate,
  onDismissIdentityCandidate,
  onSearchContactIdentityCandidates,
  onSearchIdentityCandidates,
  onUseExistingContact,
  onUseExistingHorse,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaHorse,
  onCreated,
}: {
  locale?: Locale;
  contacts: Contact[];
  contactRoles: ContactRole[];
  createdByUserId?: string;
  externalCredentialIssuers?: ExternalCredentialIssuer[];
  membershipRequirements?: OrganizationExternalCredentialRequirement[];
  organization: Organization | null;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onDismissContactIdentityCandidate?: (candidate: ContactIdentityCandidate) => Promise<void>;
  onDismissIdentityCandidate?: (candidate: HorseIdentityCandidate) => Promise<void>;
  onSearchContactIdentityCandidates?: (input: Parameters<typeof createContact>[0]) => Promise<ContactIdentityCandidate[]>;
  onSearchIdentityCandidates?: (input: Parameters<typeof createHorse>[0]) => Promise<HorseIdentityCandidate[]>;
  onUseExistingContact?: (candidate: ContactIdentityCandidate) => Promise<void>;
  onUseExistingHorse?: (candidate: HorseIdentityCandidate) => Promise<void>;
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
  const [registrationStatus, setRegistrationStatus] = useState<Horse["registration_status"]>("unknown");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [sireName, setSireName] = useState("");
  const [damName, setDamName] = useState("");
  const [gvlCogginsUrl, setGvlCogginsUrl] = useState("");
  const [cogginsPdfFile, setCogginsPdfFile] = useState<File | null>(null);
  const [preparedGvlUrl, setPreparedGvlUrl] = useState("");
  const [vaccineCertificateFile, setVaccineCertificateFile] = useState<File | null>(null);
  const [vaccineAdministeredOn, setVaccineAdministeredOn] = useState("");
  const [externalReferenceNumbers, setExternalReferenceNumbers] = useState<Record<string, string>>({});
  const [nrhaHorseBusy, setNrhaHorseBusy] = useState(false);
  const [nrhaHorseMessage, setNrhaHorseMessage] = useState<InlineHealthMessage | null>(null);
  const [nrhaHorseVerification, setNrhaHorseVerification] = useState<NrhaHorseVerificationState | null>(null);
  const [nrhaHorseLookup, setNrhaHorseLookup] = useState<NrhaHorseLookupVerification | null>(null);
  const [nrhaHorseImportEvidence, setNrhaHorseImportEvidence] = useState<Record<string, unknown> | null>(null);
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
  const [identityCandidates, setIdentityCandidates] = useState<HorseIdentityCandidate[]>([]);
  const [pendingHorseInput, setPendingHorseInput] = useState<Parameters<typeof createHorse>[0] | null>(null);
  const [busy, setBusy] = useState(false);
  const [healthMessage, setHealthMessage] = useState<InlineHealthMessage | null>(null);
  const currentUserContact = createdByUserId ? contacts.find((contact) => contact.linked_user_id === createdByUserId) : null;
  const selectedOwnerId = ownerContactId || currentUserContact?.id || "";
  const selectedOwnerContact = findById(contacts, selectedOwnerId) ?? null;
  const defaultAgentId = currentUserContact && selectedOwnerId !== currentUserContact.id ? currentUserContact.id : "";
  const selectedAgentId = agentContactId ?? defaultAgentId;
  const externalReferenceFields = useMemo(() => buildHorseExternalIdentifierFields(externalCredentialIssuers), [externalCredentialIssuers]);
  const nrhaExternalCredentialIssuer = externalReferenceFields.find((externalCredentialIssuer) => externalCredentialIssuer.code.toUpperCase() === "NRHA") ?? null;
  const nrhaOrganizationId = nrhaExternalCredentialIssuer?.id ?? null;
  const importOwnerExternalMembershipFields = useMemo(
    () => buildExternalMembershipFields("owner", externalCredentialIssuers, membershipRequirements),
    [externalCredentialIssuers, membershipRequirements],
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
  const activeNrhaHorseOfficialValues = nrhaHorseLookup
    ? nrhaOfficialHorseValues(nrhaHorseLookup, { licenseNumber: integerFromReference(currentNrhaReferenceNumber), name })
    : verifiedNrhaHorse?.officialValues ?? null;
  const nrhaHorseDataRows = activeNrhaHorseOfficialValues
    ? nrhaHorseDataImportRows(
        activeNrhaHorseOfficialValues,
        {
          damName,
          dateOfBirth,
          gender,
          name,
          nrhaReferenceNumber: currentNrhaReferenceNumber,
          registrationNumber,
          sireName,
        },
        locale,
      )
    : [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (creationMode === "import") {
      await handleCreateImportedHorse();
      return;
    }

    if (!organization || !selectedOwnerId) {
      return;
    }

    setHealthMessage(null);
    await reviewOrCreateHorse({
        organization_id: organization.id,
        name,
        primary_owner_contact_id: selectedOwnerId,
        agent_contact_id: selectedAgentId && selectedAgentId !== selectedOwnerId ? selectedAgentId : null,
        breed,
        gender: gender || null,
        date_of_birth: dateOfBirth || null,
        registration_status: registrationStatus,
        registration_number: registrationStatus === "grade" ? "" : registrationNumber,
        sire_name: sireName,
        dam_name: damName,
        created_by_user_id: createdByUserId,
        external_memberships: externalReferenceFields.map((organization) => ({
          external_credential_issuer_id: organization.id,
          identifier_type: horseReferenceTypeForOrganization(organization),
          identifier_value: registrationStatus === "grade" && organization.issuer_type === "breed_registry" ? "" : externalReferenceNumbers[organization.id] ?? "",
          status: verifiedNrhaHorse && organization.id === verifiedNrhaHorse.organizationId ? "active" : "unknown",
          verified_at: verifiedNrhaHorse && organization.id === verifiedNrhaHorse.organizationId ? new Date().toISOString() : null,
          verification_payload: organization.id === nrhaOrganizationId ? verifiedNrhaHorse?.payload ?? nrhaHorseImportEvidence ?? undefined : undefined,
          verification_source: organization.id === nrhaOrganizationId && (verifiedNrhaHorse || nrhaHorseImportEvidence) ? "nrha_api" : null,
        })),
      });
  }

  async function reviewOrCreateHorse(input: Parameters<typeof createHorse>[0]) {
    setBusy(true);

    try {
      if (onSearchIdentityCandidates) {
        const candidates = await onSearchIdentityCandidates(input);

        if (candidates.length) {
          setPendingHorseInput(input);
          setIdentityCandidates(candidates);
          return;
        }
      }

      await finishHorseCreation(input);
    } finally {
      setBusy(false);
    }
  }

  async function finishHorseCreation(input: Parameters<typeof createHorse>[0]) {
    const horse = await onCreateHorse(input);
    await createInitialHealthDocuments(horse, input.name, input.date_of_birth || null);
    resetHorseCreationState();
    onCreated?.(horse);
  }

  async function handleUseExistingHorse(candidate: HorseIdentityCandidate) {
    if (!onUseExistingHorse) return;
    setBusy(true);

    try {
      await onUseExistingHorse(candidate);
      resetHorseCreationState();
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateDistinctHorse() {
    if (!pendingHorseInput) return;
    setBusy(true);

    try {
      if (onDismissIdentityCandidate) {
        await Promise.all(identityCandidates.map((candidate) => onDismissIdentityCandidate(candidate)));
      }
      await finishHorseCreation(pendingHorseInput);
    } finally {
      setBusy(false);
    }
  }

  async function handleSearchNrhaImport() {
    const licenseNumber = integerFromReference(nrhaImportReferenceNumber);

    setNrhaImportMessage(null);
    setNrhaImportResult(null);

    if (!nrhaExternalCredentialIssuer || !nrhaOrganizationId) {
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
      setSireName(importedHorse.sireName?.trim() ?? "");
      setDamName(importedHorse.damName?.trim() ?? "");
      setExternalReferenceNumbers((current) => ({
        ...current,
        [nrhaExternalCredentialIssuer.id]: referenceNumber,
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
    if (!organization || !nrhaImportResult || !nrhaExternalCredentialIssuer || !nrhaOrganizationId) {
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
                external_credential_issuer_id: field.organization.id,
                identifier_value: importOwnerMembershipNumbers[field.organization.id] ?? "",
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
      const officialValues = nrhaOfficialHorseValues(nrhaImportResult.verification, { licenseNumber: integerFromReference(importedReferenceNumber), name: importedName });
      const importedOwnerName = ownerContact ? contactLabel(ownerContact) : [importOwnerFirstName, importOwnerLastName].filter(Boolean).join(" ");
      const importRows = nrhaHorseDataImportRows(officialValues, {
        damName: "", dateOfBirth: "", gender: "", name: "", nrhaReferenceNumber: "", ownerName: "", registrationNumber: "", sireName: "",
      }, locale);
      const importComparison = compareNrhaHorseIdentity({
        damName: importedHorse.damName?.trim() ?? "",
        dateOfBirth: importedFoalDate,
        gender: mapNrhaSex(importedHorse.sex),
        name: importedName,
        nrhaReferenceNumber: importedReferenceNumber,
        ownerName: importedOwnerName,
        registrationNumber: importedReferenceNumber,
        sireName: importedHorse.sireName?.trim() ?? "",
      }, officialValues);
      const importPayload = nrhaHorseImportDecisionPayload(nrhaImportResult.verification, importRows, importRows.map((row) => row.key), importComparison);
      await reviewOrCreateHorse({
        organization_id: organization.id,
        name: importedName,
        primary_owner_contact_id: ownerContactIdForImport,
        agent_contact_id: importedAgentId || null,
        breed: "",
        gender: mapNrhaSex(importedHorse.sex) || null,
        date_of_birth: importedFoalDate || null,
        registration_number: importedReferenceNumber,
        registration_status: "registered",
        sire_name: importedHorse.sireName?.trim() ?? "",
        dam_name: importedHorse.damName?.trim() ?? "",
        created_by_user_id: createdByUserId,
        external_memberships: externalReferenceFields.map((externalCredentialIssuer) => ({
          external_credential_issuer_id: externalCredentialIssuer.id,
          identifier_type: horseReferenceTypeForOrganization(externalCredentialIssuer),
          identifier_value: externalCredentialIssuer.id === nrhaExternalCredentialIssuer.id ? importedReferenceNumber : externalReferenceNumbers[externalCredentialIssuer.id] ?? "",
          status: externalCredentialIssuer.id === nrhaExternalCredentialIssuer.id ? "active" : "unknown",
          verified_at: externalCredentialIssuer.id === nrhaExternalCredentialIssuer.id ? new Date().toISOString() : null,
          verification_payload: externalCredentialIssuer.id === nrhaExternalCredentialIssuer.id ? importPayload : undefined,
          verification_source: externalCredentialIssuer.id === nrhaExternalCredentialIssuer.id ? "nrha_api" : null,
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
    setSireName("");
    setDamName("");
    setGvlCogginsUrl("");
    setCogginsPdfFile(null);
    setPreparedGvlUrl("");
    setVaccineCertificateFile(null);
    setVaccineAdministeredOn("");
    setExternalReferenceNumbers({});
    setNrhaHorseMessage(null);
    setNrhaHorseVerification(null);
    setNrhaHorseLookup(null);
    setNrhaHorseImportEvidence(null);
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
    setIdentityCandidates([]);
    setPendingHorseInput(null);
  }

  function clearNrhaHorseValidation() {
    setNrhaHorseMessage(null);
    setNrhaHorseVerification(null);
    setNrhaHorseLookup(null);
    setNrhaHorseImportEvidence(null);
  }

  async function handleVerifyNrhaHorse(externalCredentialIssuer: ExternalCredentialIssuer) {
    const referenceNumber = externalReferenceNumbers[externalCredentialIssuer.id]?.trim() ?? "";
    const licenseNumber = integerFromReference(referenceNumber);
    const ownerName = selectedOwnerContact ? contactLabel(selectedOwnerContact) : "";

    setNrhaHorseMessage(null);
    setNrhaHorseVerification(null);
    setNrhaHorseLookup(null);
    setNrhaHorseImportEvidence(null);

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
      const officialValues = nrhaOfficialHorseValues(verification, { licenseNumber, name });
      const identityComparison = compareNrhaHorseIdentity(
        {
          damName,
          dateOfBirth,
          gender,
          name,
          nrhaReferenceNumber: referenceNumber,
          ownerName,
          registrationNumber,
          sireName,
        },
        officialValues,
      );
      setNrhaHorseLookup(verification);

      if (verification.status === "verified" && verification.matched && identityComparison.verdict === "match") {
        setNrhaHorseVerification({
          dateOfBirth,
          name: name.trim(),
          organizationId: externalCredentialIssuer.id,
          ownerContactId: selectedOwnerId,
          ownerName,
          officialValues,
          payload: verificationPayload(verification, identityComparison),
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
        message: nrhaHorseMismatchMessage(verification, locale, identityComparison),
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

  function handleApplyNrhaHorseData(keys: NrhaHorseDataImportRow["key"][]) {
    if (!nrhaHorseLookup || !activeNrhaHorseOfficialValues || !nrhaOrganizationId) {
      return;
    }

    const values = activeNrhaHorseOfficialValues;
    const selectedKeys = new Set(keys);
    const ownerName = selectedOwnerContact ? contactLabel(selectedOwnerContact) : "";
    const beforeComparison = compareNrhaHorseIdentity({
      damName, dateOfBirth, gender, name, nrhaReferenceNumber: currentNrhaReferenceNumber, ownerName, registrationNumber, sireName,
    }, values);
    const importPayload = nrhaHorseImportDecisionPayload(nrhaHorseLookup, nrhaHorseDataRows, selectedKeys, beforeComparison);
    setNrhaHorseImportEvidence(importPayload);
    const shouldApply = (key: NrhaHorseDataImportRow["key"]) => selectedKeys.has(key);

    if (values.name && shouldApply("name")) {
      setName(values.name);
    }

    if (values.dateOfBirth && shouldApply("dateOfBirth")) {
      setDateOfBirth(values.dateOfBirth);
    }

    if (values.gender && shouldApply("gender")) {
      setGender(values.gender);
    }

    if (values.registrationNumber && shouldApply("nrhaReferenceNumber")) {
      setRegistrationNumber(values.registrationNumber);

      if (nrhaOrganizationId) {
        setExternalReferenceNumbers((current) => ({
          ...current,
          [nrhaOrganizationId]: values.registrationNumber,
        }));
      }
    }

    if (values.sireName && shouldApply("sireName")) {
      setSireName(values.sireName);
    }

    if (values.damName && shouldApply("damName")) {
      setDamName(values.damName);
    }

    const intendedLocalValues = {
      damName: values.damName && shouldApply("damName") ? values.damName : damName,
      dateOfBirth: values.dateOfBirth && shouldApply("dateOfBirth") ? values.dateOfBirth : dateOfBirth,
      gender: values.gender && shouldApply("gender") ? values.gender : gender,
      name: values.name && shouldApply("name") ? values.name : name,
      nrhaReferenceNumber: values.registrationNumber && shouldApply("nrhaReferenceNumber") ? values.registrationNumber : currentNrhaReferenceNumber,
      ownerName,
      registrationNumber: values.registrationNumber && shouldApply("nrhaReferenceNumber") ? values.registrationNumber : registrationNumber,
      sireName: values.sireName && shouldApply("sireName") ? values.sireName : sireName,
    };
    const afterComparison = compareNrhaHorseIdentity(intendedLocalValues, values);
    setNrhaHorseVerification(afterComparison.verdict === "match" ? {
      dateOfBirth: intendedLocalValues.dateOfBirth,
      name: intendedLocalValues.name.trim(),
      organizationId: nrhaOrganizationId,
      ownerContactId: selectedOwnerId,
      ownerName,
      officialValues: values,
      payload: nrhaHorseImportDecisionPayload(nrhaHorseLookup, nrhaHorseDataRows, selectedKeys, afterComparison),
      referenceNumber: intendedLocalValues.nrhaReferenceNumber,
    } : null);
    setNrhaHorseMessage({
      tone: afterComparison.verdict === "match" ? "success" : "info",
      message: afterComparison.verdict === "match"
        ? uiText(locale, "Champs NRHA sélectionnés importés; la fiche concorde maintenant.", "Selected NRHA fields imported; the record now matches.")
        : uiText(locale, "Champs NRHA sélectionnés importés. Les autres différences restent inchangées.", "Selected NRHA fields imported. Other differences remain unchanged."),
    });
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
              externalCredentialIssuers={externalCredentialIssuers}
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
              onDismissIdentityCandidate={onDismissContactIdentityCandidate}
              onSearchIdentityCandidates={onSearchContactIdentityCandidates}
              onUseExistingContact={onUseExistingContact}
            />
            <ContactPicker
              allowEmpty
              contacts={contacts}
              contactRoles={contactRoles}
              createdByUserId={createdByUserId}
              disabled={!organization}
              externalCredentialIssuers={externalCredentialIssuers}
              label="Agent"
              locale={locale}
              membershipRequirements={membershipRequirements}
              organization={organization}
              role="agent"
              value={selectedAgentId}
              onChange={setAgentContactId}
              onCreateContact={onCreateContact}
              onDismissIdentityCandidate={onDismissContactIdentityCandidate}
              onSearchIdentityCandidates={onSearchContactIdentityCandidates}
              onUseExistingContact={onUseExistingContact}
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
            <div className="form-grid">
              <label>
                {uiText(locale, "Statut d’enregistrement", "Registration status")}
                <select
                  disabled={!organization}
                  value={registrationStatus}
                  onChange={(event) => {
                    const nextStatus = event.target.value as Horse["registration_status"];
                    setRegistrationStatus(nextStatus);
                    if (nextStatus === "grade") {
                      setRegistrationNumber("");
                      setExternalReferenceNumbers((current) => Object.fromEntries(Object.entries(current).filter(([issuerId]) => externalReferenceFields.find((issuer) => issuer.id === issuerId)?.issuer_type !== "breed_registry")));
                    }
                  }}
                >
                  <option value="unknown">{uiText(locale, "À préciser", "To be confirmed")}</option>
                  <option value="registered">{uiText(locale, "Enregistré — un ou plusieurs registres", "Registered — one or more registries")}</option>
                  <option value="grade">{uiText(locale, "Grade — sans enregistrement", "Grade — unregistered")}</option>
                </select>
              </label>
              {registrationStatus !== "grade" ? (
                <label>
                  {uiText(locale, "Numéro principal (facultatif)", "Primary number (optional)")}
                  <input disabled={!organization} value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} />
                </label>
              ) : (
                <span className="muted-line">{uiText(locale, "Aucun numéro d’enregistrement requis pour un cheval grade.", "No registration number is required for a grade horse.")}</span>
              )}
            </div>
            <div className="form-grid">
              <label>
                {uiText(locale, "Père", "Sire")}
                <input disabled={!organization} value={sireName} onChange={(event) => setSireName(event.target.value)} />
              </label>
              <label>
                {uiText(locale, "Mère", "Dam")}
                <input disabled={!organization} value={damName} onChange={(event) => setDamName(event.target.value)} />
              </label>
            </div>
            {renderInitialHealthDocumentFields(!organization)}
            {externalReferenceFields.length ? (
              <div className="external-membership-fields">
                <div className="inline-form-header">
                  <strong>{uiText(locale, "Références externes du cheval", "External horse references")}</strong>
                  <span>{uiText(locale, "Ex.: licence de compétition NRHA. Si tu ajoutes un numéro NRHA, valide-le avec le nom, la naissance et le propriétaire.", "Example: NRHA competition license. If you add an NRHA number, validate it against name, birth date and owner.")}</span>
                </div>
                {externalReferenceFields.map((externalCredentialIssuer) => (
                  <label key={externalCredentialIssuer.id}>
                    {horseExternalReferenceLabel(externalCredentialIssuer)}
                    <input
                      disabled={!organization || (registrationStatus === "grade" && externalCredentialIssuer.issuer_type === "breed_registry")}
                      value={externalReferenceNumbers[externalCredentialIssuer.id] ?? ""}
                      onChange={(event) => {
                        setExternalReferenceNumbers((current) => ({
                          ...current,
                          [externalCredentialIssuer.id]: event.target.value,
                        }));

                        if (externalCredentialIssuer.code.toUpperCase() === "NRHA") {
                          clearNrhaHorseValidation();
                        }
                      }}
                    />
                    {externalCredentialIssuer.code.toUpperCase() === "NRHA" ? (
                      <div className="row-actions">
                        <button
                          className="ghost-button"
                          disabled={busy || nrhaHorseBusy || !organization || !externalReferenceNumbers[externalCredentialIssuer.id]?.trim()}
                          type="button"
                          onClick={() => handleVerifyNrhaHorse(externalCredentialIssuer)}
                        >
                          <ShieldCheck size={18} />
                          {nrhaHorseBusy ? uiText(locale, "Validation...", "Validating...") : uiText(locale, "Valider NRHA", "Validate NRHA")}
                        </button>
                      </div>
                    ) : null}
                  </label>
                ))}
                <InlineHealthMessage value={nrhaHorseMessage} />
                {nrhaHorseDataRows.length ? <ExternalImportDataPanel locale={locale} rows={nrhaHorseDataRows} sourceLabel="NRHA" onApply={handleApplyNrhaHorseData} /> : null}
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
                  <div>
                    <span>{uiText(locale, "Père", "Sire")}</span>
                    <strong>{nrhaImportResult.horse.sireName || uiText(locale, "Non fourni", "Not provided")}</strong>
                  </div>
                  <div>
                    <span>{uiText(locale, "Mère", "Dam")}</span>
                    <strong>{nrhaImportResult.horse.damName || uiText(locale, "Non fourni", "Not provided")}</strong>
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

        {identityCandidates.length && pendingHorseInput ? (
          <HorseIdentityCandidateReview
            busy={busy}
            candidates={identityCandidates}
            locale={locale}
            onCreateDistinct={handleCreateDistinctHorse}
            onEdit={() => {
              setIdentityCandidates([]);
              setPendingHorseInput(null);
            }}
            onUseExisting={handleUseExistingHorse}
          />
        ) : (
          <button className="primary-button" disabled={busy || !canCreateHorse} type="submit">
            <Plus size={18} />
            {creationMode === "import" ? uiText(locale, "Créer le cheval importé", "Create imported horse") : uiText(locale, "Créer le cheval", "Create horse")}
          </button>
        )}
      </form>
    </section>
  );
}

function formatImportedDate(value: string | null | undefined, locale: Locale) {
  const normalized = normalizeNrhaDate(value);
  return normalized ? formatDate(normalized) : uiText(locale, "Non fourni", "Not provided");
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
