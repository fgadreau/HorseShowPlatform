import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, FileText, History, LockKeyhole, PencilLine, Plus, ShieldCheck } from "lucide-react";
import { ContactPicker, FormActions, SearchSelect } from "../../components/ui";
import { ExternalImportDataPanel } from "../../components/ExternalImportDataPanel";
import { contactLabel, errorMessage, findById, formatDate, horseLabel, numericValue } from "../../lib/display";
import { normalizeGvlUrl } from "../../lib/gvlUrl";
import type { Locale } from "../../lib/i18n";
import { canCorrectHorseIdentity, createContact, createUploadedHorseHealthDocument, getHorseHealthDocumentFileUrl, listHorseIdentityCorrections, listHorseIdentityLocks, updateHorse, verifyGvlCogginsDocument, verifyNrhaHorse, type NrhaHorseLookupVerification } from "../../services/supabaseServices";
import type { Contact, ContactRole, ExternalCredentialIssuer, Horse, HorseContact, HorseExternalIdentifier, HorseHealthDocument, HorseIdentityCorrection, HorseIdentityLock, HorseIdentityLockField, Organization, OrganizationExternalCredentialRequirement } from "../../types/domain";
import { uiText, buildHorseExternalIdentifierFields, horseHealthStatusLabel, horseReferenceTypeForOrganization, horseExternalReferenceLabel, resolveGvlCogginsUrl, healthDocumentTypeLabel, healthDocumentDateLabel, healthDocumentDateValue, isVaccineHealthDocument, healthVerificationSourceLabel, healthReviewNote, latestHorseHealthDocument, latestHorseVaccineDocument, todayDateValue, birthYearFromDateValue, InlineHealthMessage, horseHealthResultMessage, horseGenderLabel } from "../dashboard/shared";
import { healthComplianceReasonSummary, healthComplianceStatusLabel, useHorseHealthComplianceOverview } from "../health/HealthComplianceSummary";
import { compareNrhaHorseIdentity, integerFromReference, nrhaHorseDataImportRows, nrhaHorseImportDecisionPayload, nrhaHorseMismatchMessage, nrhaOfficialHorseValues, verificationPayload, type NrhaHorseDataImportRow, type NrhaHorseVerificationState } from "./nrhaHorseValidation";
import { HorseDocumentIdentityPanel } from "./HorseDocumentIdentityPanel";

function horseIdentityLockLabel(field: HorseIdentityLockField, locale: Locale) {
  const labels: Record<HorseIdentityLockField, { fr: string; en: string }> = {
    name: { fr: "nom", en: "name" },
    date_of_birth: { fr: "date de naissance", en: "date of birth" },
    birth_year: { fr: "année de naissance", en: "birth year" },
    gender: { fr: "sexe", en: "sex" },
    breed: { fr: "race", en: "breed" },
    registration_number: { fr: "numéro principal", en: "primary number" },
    registration_status: { fr: "statut d’enregistrement grade", en: "grade registration status" },
    external_identifier: { fr: "numéro externe", en: "external number" },
  };
  return labels[field][locale];
}

function horseIdentityLockErrorMessage(error: unknown, locale: Locale) {
  const message = errorMessage(error);
  if (message.includes("HSP_HORSE_IDENTITY_CORRECTION_FORBIDDEN")) {
    return uiText(locale, "Seuls un propriétaire, co-propriétaire, agent ou administrateur plateforme peuvent corriger cette identité.", "Only an owner, co-owner, agent, or platform administrator can correct this identity.");
  }
  if (message.includes("HSP_HORSE_IDENTITY_CORRECTION_REASON_REQUIRED")) {
    return uiText(locale, "Une raison d’au moins 10 caractères est obligatoire.", "A reason of at least 10 characters is required.");
  }
  if (message.includes("HSP_NO_IDENTITY_CHANGES")) {
    return uiText(locale, "Aucun changement d’identité n’a été détecté.", "No identity change was detected.");
  }
  const field = message.match(/HSP_HORSE_IDENTITY_LOCKED:([a-z_]+)/)?.[1] as HorseIdentityLockField | "birth" | "document" | undefined;
  if (!field) return message;
  if (field === "document") {
    return uiText(locale, "Ce document soutient une validation active et ne peut pas être supprimé.", "This document supports an active validation and cannot be deleted.");
  }
  const label = field === "birth" ? uiText(locale, "naissance", "birth information") : horseIdentityLockLabel(field, locale);
  return uiText(
    locale,
    `Le champ « ${label} » est protégé par un document vérifié. Utilisez le mode de correction auditée pour le modifier.`,
    `The “${label}” field is protected by a verified document. Use the audited correction mode to change it.`,
  );
}

function horseIdentityCorrectionFieldLabel(field: string, locale: Locale) {
  if (field.startsWith("external_identifier:")) return horseIdentityLockLabel("external_identifier", locale);
  if (field === "birth_year") return horseIdentityLockLabel("birth_year", locale);
  if (field in {
    name: true,
    date_of_birth: true,
    gender: true,
    breed: true,
    registration_number: true,
    registration_status: true,
  }) {
    return horseIdentityLockLabel(field as HorseIdentityLockField, locale);
  }
  return field;
}

function HorseEditForm({
  locale = "fr",
  contacts,
  contactRoles,
  createdByUserId,
  externalCredentialIssuers = [],
  membershipRequirements = [],
  horse,
  horseExternalIdentifiers = [],
  horseHealthDocuments = [],
  horseContacts,
  organization,
  onCancel,
  onCreateContact,
  onCreateHorseHealthDocument,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaHorse,
}: {
  locale?: Locale;
  contacts: Contact[];
  contactRoles: ContactRole[];
  createdByUserId?: string;
  externalCredentialIssuers?: ExternalCredentialIssuer[];
  membershipRequirements?: OrganizationExternalCredentialRequirement[];
  horse: Horse;
  horseExternalIdentifiers?: HorseExternalIdentifier[];
  horseHealthDocuments?: HorseHealthDocument[];
  horseContacts: HorseContact[];
  organization: Organization | null;
  onCancel: () => void;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
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
  const [registrationStatus, setRegistrationStatus] = useState<Horse["registration_status"]>(horse.registration_status ?? (horse.registration_number ? "registered" : "unknown"));
  const [registrationNumber, setRegistrationNumber] = useState(horse.registration_number ?? "");
  const [sireName, setSireName] = useState(horse.sire_name ?? "");
  const [damName, setDamName] = useState(horse.dam_name ?? "");
  const [gvlCogginsUrl, setGvlCogginsUrl] = useState("");
  const [cogginsPdfFile, setCogginsPdfFile] = useState<File | null>(null);
  const [vaccineCertificateFile, setVaccineCertificateFile] = useState<File | null>(null);
  const [vaccineAdministeredOn, setVaccineAdministeredOn] = useState("");
  const breedRegistryIssuers = useMemo(() => externalCredentialIssuers.filter((issuer) => issuer.issuer_type === "breed_registry" && issuer.is_active), [externalCredentialIssuers]);
  const registrationDocuments = useMemo(() => horseHealthDocuments.filter((document) => document.horse_id === horse.id && document.document_category === "registration"), [horse.id, horseHealthDocuments]);
  const [registrationDocumentIssuerId, setRegistrationDocumentIssuerId] = useState(() => externalCredentialIssuers.find((issuer) => issuer.issuer_type === "breed_registry" && issuer.is_active)?.id ?? "");
  const [registrationDocumentNumber, setRegistrationDocumentNumber] = useState("");
  const [registrationDocumentFile, setRegistrationDocumentFile] = useState<File | null>(null);
  const [registrationDocumentBusy, setRegistrationDocumentBusy] = useState(false);
  const [registrationDocumentMessage, setRegistrationDocumentMessage] = useState<InlineHealthMessage | null>(null);
  const [externalReferenceNumbers, setExternalReferenceNumbers] = useState<Record<string, string>>(() =>
    Object.fromEntries(horseExternalIdentifiers.filter((membership) => membership.horse_id === horse.id).map((membership) => [membership.external_credential_issuer_id, membership.identifier_value])),
  );
  const [nrhaHorseBusy, setNrhaHorseBusy] = useState(false);
  const [nrhaHorseMessage, setNrhaHorseMessage] = useState<InlineHealthMessage | null>(null);
  const [nrhaHorseVerification, setNrhaHorseVerification] = useState<NrhaHorseVerificationState | null>(null);
  const [nrhaHorseLookup, setNrhaHorseLookup] = useState<NrhaHorseLookupVerification | null>(null);
  const [nrhaHorseImportEvidence, setNrhaHorseImportEvidence] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [fileBusyDocumentId, setFileBusyDocumentId] = useState("");
  const [fileErrorDocumentId, setFileErrorDocumentId] = useState("");
  const [fileErrorMessageByDocumentId, setFileErrorMessageByDocumentId] = useState<Record<string, string>>({});
  const [healthMessage, setHealthMessage] = useState<InlineHealthMessage | null>(null);
  const [identityLocks, setIdentityLocks] = useState<HorseIdentityLock[]>([]);
  const [identityCorrections, setIdentityCorrections] = useState<HorseIdentityCorrection[]>([]);
  const [canCorrectIdentity, setCanCorrectIdentity] = useState(false);
  const [identityCorrectionMode, setIdentityCorrectionMode] = useState(false);
  const [identityCorrectionReason, setIdentityCorrectionReason] = useState("");
  const [identityLockBusy, setIdentityLockBusy] = useState(true);
  const [identityLockMessage, setIdentityLockMessage] = useState<InlineHealthMessage | null>(null);
  const currentUserContact = createdByUserId ? contacts.find((contact) => contact.linked_user_id === createdByUserId) : null;
  const selectedOwnerContact = findById(contacts, ownerContactId) ?? null;
  const becameAgentByOwnerChange = currentUserContact && horse.primary_owner_contact_id === currentUserContact.id && ownerContactId !== currentUserContact.id;
  const defaultAgentId = becameAgentByOwnerChange ? currentUserContact.id : "";
  const selectedAgentId = agentContactId ?? defaultAgentId;
  const externalReferenceFields = useMemo(
    () => buildHorseExternalIdentifierFields(externalCredentialIssuers, horseExternalIdentifiers.filter((membership) => membership.horse_id === horse.id)),
    [externalCredentialIssuers, horse.id, horseExternalIdentifiers],
  );
  const nrhaOrganizationId = externalReferenceFields.find((externalCredentialIssuer) => externalCredentialIssuer.code.toUpperCase() === "NRHA")?.id ?? null;
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
  const latestCoggins = useMemo(() => latestHorseHealthDocument(horse.id, horseHealthDocuments, "coggins_eia"), [horse.id, horseHealthDocuments]);
  const healthComplianceRevision = horseHealthDocuments.map((document) => `${document.id}:${document.status}:${document.updated_at}`).join("|");
  const horseHealthComplianceOverview = useHorseHealthComplianceOverview({
    horseIds: organization ? [horse.id] : [],
    organizationId: organization?.id,
    referenceDate: todayDateValue(),
    refreshToken: healthComplianceRevision,
  });
  const horseHealthCompliance = horseHealthComplianceOverview.results.find(
    (result) => result.horse_id === horse.id && result.organization_id === organization?.id,
  ) ?? null;
  const latestVaccine = useMemo(() => latestHorseVaccineDocument(horse.id, horseHealthDocuments), [horse.id, horseHealthDocuments]);
  const identityLockFields = useMemo(() => new Set(identityLocks.map((lock) => lock.lock_field)), [identityLocks]);
  const birthIdentityLocked = identityLockFields.has("date_of_birth") || identityLockFields.has("birth_year");
  const lockedNrhaImportKeys = useMemo(() => {
    const keys: NrhaHorseDataImportRow["key"][] = [];
    if (identityLockFields.has("name")) keys.push("name");
    if (birthIdentityLocked) keys.push("dateOfBirth");
    if (identityLockFields.has("gender")) keys.push("gender");
    if (
      identityLockFields.has("registration_number")
      || identityLocks.some((lock) => lock.lock_field === "external_identifier" && lock.external_credential_issuer_id === nrhaOrganizationId)
    ) {
      keys.push("nrhaReferenceNumber");
    }
    return keys;
  }, [birthIdentityLocked, identityLockFields, identityLocks, nrhaOrganizationId]);

  async function reloadIdentityLocks() {
    setIdentityLockBusy(true);
    try {
      const [locks, corrections, canCorrect] = await Promise.all([
        listHorseIdentityLocks(horse.id),
        listHorseIdentityCorrections(horse.id),
        canCorrectHorseIdentity(horse.id),
      ]);
      setIdentityLocks(locks);
      setIdentityCorrections(corrections);
      setCanCorrectIdentity(canCorrect);
      setIdentityLockMessage(null);
    } catch (error) {
      setIdentityLockMessage({ tone: "error", message: horseIdentityLockErrorMessage(error, locale) });
    } finally {
      setIdentityLockBusy(false);
    }
  }

  function cancelIdentityCorrection() {
    setName(horse.name);
    setBreed(horse.breed ?? "");
    setGender(horse.gender ?? "");
    setDateOfBirth(horse.date_of_birth ?? "");
    setRegistrationStatus(horse.registration_status ?? (horse.registration_number ? "registered" : "unknown"));
    setRegistrationNumber(horse.registration_number ?? "");
    setExternalReferenceNumbers(
      Object.fromEntries(
        horseExternalIdentifiers
          .filter((identifier) => identifier.horse_id === horse.id)
          .map((identifier) => [identifier.external_credential_issuer_id, identifier.identifier_value]),
      ),
    );
    setIdentityCorrectionMode(false);
    setIdentityCorrectionReason("");
    setIdentityLockMessage(null);
  }

  useEffect(() => {
    if (!registrationDocumentIssuerId && breedRegistryIssuers[0]) {
      setRegistrationDocumentIssuerId(breedRegistryIssuers[0].id);
    }
  }, [breedRegistryIssuers, registrationDocumentIssuerId]);

  useEffect(() => {
    void reloadIdentityLocks();
  }, [horse.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setIdentityLockMessage(null);

    try {
      await onUpdateHorse(horse.id, {
        name,
        primary_owner_contact_id: ownerContactId,
        agent_contact_id: selectedAgentId && selectedAgentId !== ownerContactId ? selectedAgentId : null,
        breed: breed || null,
        gender: gender || null,
        date_of_birth: dateOfBirth || null,
        registration_status: registrationStatus,
        registration_number: registrationStatus === "grade" ? null : registrationNumber || null,
        sire_name: sireName || null,
        dam_name: damName || null,
        external_memberships: externalReferenceFields.map((organization) => externalMembershipInputForOrganization(organization)),
        identity_correction_reason: identityCorrectionMode ? identityCorrectionReason.trim() : undefined,
      });
    } catch (error) {
      setIdentityLockMessage({ tone: "error", message: horseIdentityLockErrorMessage(error, locale) });
    } finally {
      setBusy(false);
    }
  }

  function externalMembershipInputForOrganization(externalCredentialIssuer: ExternalCredentialIssuer) {
    const referenceType = horseReferenceTypeForOrganization(externalCredentialIssuer);
    const referenceNumber = registrationStatus === "grade" && externalCredentialIssuer.issuer_type === "breed_registry" ? "" : externalReferenceNumbers[externalCredentialIssuer.id] ?? "";
    const existingMembership =
      horseExternalIdentifiers.find(
        (membership) =>
          membership.horse_id === horse.id &&
          membership.external_credential_issuer_id === externalCredentialIssuer.id &&
          membership.identifier_type === referenceType,
      ) ?? null;
    const isNrha = externalCredentialIssuer.code.toUpperCase() === "NRHA";
    const existingIdentityStillMatches =
      !isNrha ||
      (name.trim() === horse.name &&
        dateOfBirth === (horse.date_of_birth ?? "") &&
        ownerContactId === horse.primary_owner_contact_id);
    const existingReferenceStillMatches = existingMembership?.identifier_value.trim() === referenceNumber.trim();
    const canPreserveExistingValidation = Boolean(existingMembership && existingReferenceStillMatches && existingIdentityStillMatches);

    if (verifiedNrhaHorse && externalCredentialIssuer.id === verifiedNrhaHorse.organizationId) {
      return {
        external_credential_issuer_id: externalCredentialIssuer.id,
        identifier_type: referenceType,
        identifier_value: referenceNumber,
        status: "active" as const,
        verified_at: new Date().toISOString(),
        verification_payload: verifiedNrhaHorse.payload,
        verification_source: "nrha_api",
      };
    }

    if (isNrha && nrhaHorseImportEvidence) {
      return {
        external_credential_issuer_id: externalCredentialIssuer.id,
        identifier_type: referenceType,
        identifier_value: referenceNumber,
        status: "unknown" as const,
        verified_at: null,
        verification_payload: nrhaHorseImportEvidence,
        verification_source: "nrha_api",
      };
    }

    return {
      external_credential_issuer_id: externalCredentialIssuer.id,
      identifier_type: referenceType,
      identifier_value: referenceNumber,
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
          ownerContactId,
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
    const selectedKeys = new Set(keys.filter((key) => !lockedNrhaImportKeys.includes(key)));
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
      ownerContactId,
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

  async function handleUploadRegistrationDocument() {
    const issuer = breedRegistryIssuers.find((candidate) => candidate.id === registrationDocumentIssuerId);
    const registryNumber = registrationDocumentNumber.trim();
    if (!organization || !issuer || !registryNumber || !registrationDocumentFile || registrationStatus === "grade") return;

    setRegistrationDocumentBusy(true);
    setRegistrationDocumentMessage(null);
    try {
      await onCreateHorseHealthDocument({
        organization_id: organization.id,
        horse_id: horse.id,
        document_category: "registration",
        document_type: "breed_registration",
        external_credential_issuer_id: issuer.id,
        registration_number: registryNumber,
        breed_name: breed || null,
        issuer_name: issuer.name,
        file: registrationDocumentFile,
        created_by_user_id: createdByUserId,
      });
      setRegistrationDocumentFile(null);
      setRegistrationDocumentNumber("");
      setRegistrationDocumentMessage({ tone: "success", message: uiText(locale, "Document d’enregistrement ajouté au cheval.", "Registration document added to the horse.") });
    } catch (error) {
      setRegistrationDocumentMessage({ tone: "error", message: errorMessage(error) });
    } finally {
      setRegistrationDocumentBusy(false);
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
        {identityLockBusy ? (
          <span className="muted-line">{uiText(locale, "Vérification des protections d’identité...", "Checking identity protections...")}</span>
        ) : identityLocks.length ? (
          <div className="health-document-summary identity-lock-summary">
            <div className="health-document-title">
              <span className="badge approved"><LockKeyhole size={14} /> {uiText(locale, "Identité protégée", "Protected identity")}</span>
              <strong>{uiText(locale, "Champs liés à un document vérifié", "Fields linked to a verified document")}</strong>
            </div>
            <span className="muted-line">
              {Array.from(identityLockFields).map((field) => horseIdentityLockLabel(field, locale)).join(" · ")}
            </span>
            <span className="muted-line">
              {uiText(
                locale,
                "Les autres renseignements restent modifiables. Les champs protégés exigent une correction motivée et auditée.",
                "Other information remains editable. Protected fields require a reasoned, audited correction.",
              )}
            </span>
            {canCorrectIdentity ? (
              <div className="row-actions">
                <button className="ghost-button" type="button" onClick={() => setIdentityCorrectionMode(true)}>
                  <PencilLine size={16} />
                  {uiText(locale, "Corriger l’identité", "Correct identity")}
                </button>
              </div>
            ) : (
              <span className="muted-line">
                {uiText(
                  locale,
                  "La correction est réservée au propriétaire, co-propriétaire, agent ou administrateur plateforme.",
                  "Correction is restricted to the owner, co-owner, agent, or platform administrator.",
                )}
              </span>
            )}
          </div>
        ) : null}
        <InlineHealthMessage value={identityLockMessage} />
        {identityCorrectionMode ? (
          <div className="health-document-summary identity-correction-editor">
            <div className="health-document-title">
              <span className="badge pending_review"><PencilLine size={14} /> {uiText(locale, "Correction auditée", "Audited correction")}</span>
              <strong>{uiText(locale, "Modifier les champs protégés", "Edit protected fields")}</strong>
            </div>
            <span className="muted-line">
              {uiText(
                locale,
                "Les validations qui utilisent une valeur modifiée seront invalidées et devront être refaites. L’avant, l’après et la raison seront conservés.",
                "Validations using a changed value will be invalidated and must be completed again. Before, after, and reason are retained.",
              )}
            </span>
            <label>
              {uiText(locale, "Raison obligatoire", "Required reason")}
              <textarea
                minLength={10}
                placeholder={uiText(locale, "Ex. correction d’une erreur de saisie confirmée par le propriétaire", "Example: correcting a data-entry error confirmed by the owner")}
                required
                value={identityCorrectionReason}
                onChange={(event) => setIdentityCorrectionReason(event.target.value)}
              />
              <span className="muted-line">{identityCorrectionReason.trim().length}/10 {uiText(locale, "caractères minimum", "minimum characters")}</span>
            </label>
            <button className="text-button" type="button" onClick={cancelIdentityCorrection}>
              {uiText(locale, "Annuler la correction", "Cancel correction")}
            </button>
          </div>
        ) : null}
        {identityCorrections.length ? (
          <details className="health-document-summary identity-correction-history">
            <summary><History size={16} /> {uiText(locale, "Historique des corrections d’identité", "Identity correction history")} ({identityCorrections.length})</summary>
            <div className="stack">
              {identityCorrections.map((correction) => (
                <div key={correction.id}>
                  <strong>{formatDate(correction.applied_at ?? correction.created_at)}</strong>
                  <span className="muted-line">{correction.reason}</span>
                  <span className="muted-line">{correction.changed_fields.map((field) => horseIdentityCorrectionFieldLabel(field, locale)).join(" · ")}</span>
                </div>
              ))}
            </div>
          </details>
        ) : null}
        <label>
          {uiText(locale, "Nom du cheval", "Horse name")}
          <input
            disabled={identityLockFields.has("name") && !identityCorrectionMode}
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
          externalCredentialIssuers={externalCredentialIssuers}
          label={uiText(locale, "Propriétaire", "Owner")}
          locale={locale}
          membershipRequirements={membershipRequirements}
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
          externalCredentialIssuers={externalCredentialIssuers}
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
            <input disabled={identityLockFields.has("breed") && !identityCorrectionMode} value={breed} onChange={(event) => setBreed(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Sexe", "Sex")}
            <select disabled={identityLockFields.has("gender") && !identityCorrectionMode} value={gender} onChange={(event) => setGender(event.target.value as "" | NonNullable<Horse["gender"]>)}>
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
            disabled={birthIdentityLocked && !identityCorrectionMode}
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
              <option disabled={identityLockFields.has("registration_status") && !identityCorrectionMode} value="grade">{uiText(locale, "Grade — sans enregistrement", "Grade — unregistered")}</option>
            </select>
          </label>
          {registrationStatus !== "grade" ? (
            <label>
              {uiText(locale, "Numéro principal (facultatif)", "Primary number (optional)")}
              <input disabled={identityLockFields.has("registration_number") && !identityCorrectionMode} value={registrationNumber} onChange={(event) => setRegistrationNumber(event.target.value)} />
            </label>
          ) : (
            <span className="muted-line">{uiText(locale, "Cheval déclaré grade : aucun enregistrement requis.", "Declared grade horse: no registration required.")}</span>
          )}
        </div>
        <div className="form-grid">
          <label>
            {uiText(locale, "Père", "Sire")}
            <input value={sireName} onChange={(event) => setSireName(event.target.value)} />
          </label>
          <label>
            {uiText(locale, "Mère", "Dam")}
            <input value={damName} onChange={(event) => setDamName(event.target.value)} />
          </label>
        </div>
        <div className="external-membership-fields health-document-fields">
          <div className="inline-form-header">
            <strong>{uiText(locale, "Documents d’enregistrement de race", "Breed registration documents")}</strong>
            <span>{uiText(locale, "Un cheval peut avoir des enregistrements auprès de plusieurs registres. Le fichier demeure lié au cheval, pas à l’association.", "A horse may be registered with multiple registries. The file belongs to the horse, not the association.")}</span>
          </div>
          {registrationStatus === "grade" ? (
            <span className="muted-line">{uiText(locale, "Ce cheval est déclaré grade; aucun document d’enregistrement n’est attendu.", "This horse is declared grade; no registration document is expected.")}</span>
          ) : (
            <>
              {registrationDocuments.map((document) => {
                const issuer = externalCredentialIssuers.find((candidate) => candidate.id === document.external_credential_issuer_id);
                return (
                  <div className="health-document-summary" key={document.id}>
                    <div className="health-document-title">
                      <span className={`badge ${document.status}`}>{horseHealthStatusLabel(document.status, locale)}</span>
                      <strong>{issuer?.name ?? document.issuer_name ?? uiText(locale, "Registre de race", "Breed registry")}</strong>
                    </div>
                    <span className="muted-line">{document.registration_number ?? uiText(locale, "Numéro non lu", "Number not read")}{document.original_file_name ? ` — ${document.original_file_name}` : ""}</span>
                    {document.document_url ? (
                      <button className="text-button" disabled={fileBusyDocumentId === document.id} type="button" onClick={() => void handleOpenStoredDocument(document)}>
                        {fileBusyDocumentId === document.id ? uiText(locale, "Ouverture...", "Opening...") : uiText(locale, "Ouvrir le document", "Open document")}
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {!registrationDocuments.length ? <span className="muted-line">{uiText(locale, "Aucun document d’enregistrement importé.", "No registration document uploaded.")}</span> : null}
              <div className="health-document-actions">
                <label>
                  {uiText(locale, "Registre", "Registry")}
                  <select value={registrationDocumentIssuerId} onChange={(event) => setRegistrationDocumentIssuerId(event.target.value)}>
                    <option value="">{uiText(locale, "Choisir", "Choose")}</option>
                    {breedRegistryIssuers.map((issuer) => <option key={issuer.id} value={issuer.id}>{issuer.code} — {issuer.name}</option>)}
                  </select>
                </label>
                <label>
                  {uiText(locale, "Numéro lu sur le document", "Number shown on document")}
                  <input value={registrationDocumentNumber} onChange={(event) => setRegistrationDocumentNumber(event.target.value)} />
                </label>
                <label>
                  {uiText(locale, "Document", "Document")}
                  <input accept="application/pdf,image/*" type="file" onChange={(event) => setRegistrationDocumentFile(event.target.files?.[0] ?? null)} />
                  {registrationDocumentFile ? <span className="muted-line">{registrationDocumentFile.name}</span> : null}
                </label>
                <button
                  className="primary-button"
                  disabled={registrationDocumentBusy || !registrationDocumentFile || !registrationDocumentIssuerId || !registrationDocumentNumber.trim()}
                  type="button"
                  onClick={() => void handleUploadRegistrationDocument()}
                >
                  <FileText size={18} />
                  {registrationDocumentBusy ? uiText(locale, "Importation...", "Uploading...") : uiText(locale, "Importer l’enregistrement", "Upload registration")}
                </button>
              </div>
              <span className="muted-line">{uiText(locale, "Ce numéro est conservé comme valeur lue; il ne remplace pas automatiquement la fiche HSP.", "This number is stored as a read value; it does not automatically replace the HSP record.")}</span>
              <InlineHealthMessage value={registrationDocumentMessage} />
            </>
          )}
        </div>
        <div className="external-membership-fields health-document-fields">
          <div className="inline-form-header">
            <strong>Coggins / EIA GVL</strong>
            <span>{uiText(locale, "Validation automatique du résultat GVL.", "Automatic GVL result validation.")}</span>
          </div>
          {latestCoggins ? (
            <div className="health-document-summary">
              <div className="health-document-title">
                <span className={`badge ${latestCoggins.status}`}>{horseHealthStatusLabel(latestCoggins.status, locale)}</span>
                {horseHealthCompliance ? (
                  <span
                    className={`badge ${horseHealthCompliance.compliance_status === "compliant" || horseHealthCompliance.compliance_status === "not_required" ? "verified" : horseHealthCompliance.compliance_status === "pending_review" ? "pending_review" : "rejected"}`}
                    title={healthComplianceReasonSummary(horseHealthCompliance, locale)}
                  >
                    {healthComplianceStatusLabel(horseHealthCompliance.compliance_status, locale)}
                  </span>
                ) : null}
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
              <div className="row-actions health-review-actions">
                {latestVaccine.document_url ? (
                  <button className="text-button" disabled={fileBusyDocumentId === latestVaccine.id} type="button" onClick={() => void handleOpenStoredDocument(latestVaccine)}>
                    {fileBusyDocumentId === latestVaccine.id ? "Ouverture..." : "PDF"}
                  </button>
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
        <HorseDocumentIdentityPanel
          contacts={contacts}
          externalCredentialIssuers={externalCredentialIssuers}
          horse={horse}
          horseDocuments={horseHealthDocuments.filter((document) => document.horse_id === horse.id)}
          horseExternalIdentifiers={horseExternalIdentifiers.filter((identifier) => identifier.horse_id === horse.id)}
          locale={locale}
          onValidationCreated={reloadIdentityLocks}
        />
        {externalReferenceFields.length ? (
          <div className="external-membership-fields">
            <div className="inline-form-header">
              <strong>{uiText(locale, "Références externes du cheval", "External horse references")}</strong>
              <span>{uiText(locale, "Ex.: licence de compétition NRHA. Ces références pourront être validées par intégration externe plus tard.", "Example: NRHA competition license. These references can be validated through an external integration later.")}</span>
            </div>
            {externalReferenceFields.map((externalCredentialIssuer) => (
              <label key={externalCredentialIssuer.id}>
                {horseExternalReferenceLabel(externalCredentialIssuer)}
                <input
                  disabled={
                    (registrationStatus === "grade" && externalCredentialIssuer.issuer_type === "breed_registry")
                    || (
                      !identityCorrectionMode
                      && identityLocks.some(
                        (lock) => lock.lock_field === "external_identifier" && lock.external_credential_issuer_id === externalCredentialIssuer.id,
                      )
                    )
                  }
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
            {nrhaHorseDataRows.length ? <ExternalImportDataPanel disabledKeys={lockedNrhaImportKeys} locale={locale} rows={nrhaHorseDataRows} sourceLabel="NRHA" onApply={handleApplyNrhaHorseData} /> : null}
          </div>
        ) : null}
        <FormActions
          busy={busy || identityLockBusy || !ownerContactId}
          cancelLabel={identityCorrectionMode ? uiText(locale, "Annuler la correction", "Cancel correction") : uiText(locale, "Annuler", "Cancel")}
          disabled={identityCorrectionMode && identityCorrectionReason.trim().length < 10}
          saveLabel={identityCorrectionMode ? uiText(locale, "Appliquer la correction", "Apply correction") : uiText(locale, "Sauvegarder", "Save changes")}
          onCancel={identityCorrectionMode ? cancelIdentityCorrection : onCancel}
        />
      </form>
    </section>
  );
}

export { HorseEditForm };
