import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { ContactPicker, ModalDialog, SearchSelect, ViewIntro } from "../../components/ui";
import { contactLabel, divisionLabel, findById, formatCurrency, formatDate, horseLabel, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { buildEntryShowReadiness } from "../../lib/readiness";
import { createContact, createEntry, createHorse, createUploadedHorseHealthDocument, verifyGvlCogginsDocument, verifyNrhaEligibility } from "../../services/supabaseServices";
import type { NrhaEligibilityVerification } from "../../services/supabaseServices";
import type { ClassRecord, Contact, ContactExternalMembership, ContactRole, Division, Entry, ExternalOrganization, Horse, HorseExternalMembership, HorseHealthDocument, Invoice, Organization, OrganizationExternalMembershipRequirement, Show, ShowDay } from "../../types/domain";
import { uiText, getHorseHealthValidity, horseHealthValidityMessage, horseHealthValidityTone, entryNumberValue, InlineHealthMessage, ReadinessChecklist } from "../dashboard/shared";
import { classEntriesAreClosed, buildEntryDeadlineReadiness, buildEntryProgramLimitReadiness, inactiveProgramEntryStatuses, showDayLabel } from "../classes/classUtils";
import { HorseForm } from "../horses/HorseForm";

type NrhaEligibilityMessage = {
  key: string;
  message: string;
  tone: "success" | "info" | "error";
};

function EntryForm({
  locale = "fr",
  classes,
  contacts,
  contactExternalMemberships,
  contactRoles,
  divisions,
  entries,
  externalOrganizations,
  horseExternalMemberships,
  horseHealthDocuments,
  horses,
  membershipRequirements,
  organization,
  profileId,
  shows,
  onCreateContact,
  onCreateEntry,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaEligibility,
  onCreated,
}: {
  locale?: Locale;
  classes: ClassRecord[];
  contacts: Contact[];
  contactExternalMemberships: ContactExternalMembership[];
  contactRoles: ContactRole[];
  divisions: Division[];
  entries: Entry[];
  externalOrganizations: ExternalOrganization[];
  horseExternalMemberships: HorseExternalMembership[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaEligibility: (input: Parameters<typeof verifyNrhaEligibility>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaEligibility>>>;
  onCreated?: () => void;
}) {
  const [creatingHorse, setCreatingHorse] = useState(false);
  const [createdHorse, setCreatedHorse] = useState<Horse | null>(null);
  const [showId, setShowId] = useState("");
  const [horseId, setHorseId] = useState("");
  const [divisionId, setDivisionId] = useState("");
  const [payerContactId, setPayerContactId] = useState("");
  const [riderContactId, setRiderContactId] = useState("");
  const [entryNumber, setEntryNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [nrhaEligibilityBusy, setNrhaEligibilityBusy] = useState(false);
  const [nrhaEligibilityMessage, setNrhaEligibilityMessage] = useState<NrhaEligibilityMessage | null>(null);
  const selectedShowId = showId || shows[0]?.id || "";
  const availableDivisions = selectedShowId ? divisions.filter((division) => division.show_id === selectedShowId) : divisions;
  const selectedShow = findById(shows, selectedShowId) ?? null;
  const visibleHorses = useMemo(() => {
    if (!createdHorse || horses.some((horse) => horse.id === createdHorse.id)) {
      return horses;
    }

    return [createdHorse, ...horses];
  }, [createdHorse, horses]);
  const selectedHorse = findById(visibleHorses, horseId) ?? null;
  const selectedDivision = findById(availableDivisions, divisionId) ?? null;
  const selectedClass = selectedDivision ? findById(classes, selectedDivision.class_id) ?? null : null;
  const selectedPayerId = payerContactId || selectedHorse?.primary_owner_contact_id || contacts[0]?.id || "";
  const selectedOwnerContact = findById(contacts, selectedHorse?.primary_owner_contact_id) ?? null;
  const selectedRiderContact = findById(contacts, riderContactId) ?? null;
  const selectedNrhaRiderContact = selectedRiderContact ?? selectedOwnerContact;
  const selectedPayerContact = findById(contacts, selectedPayerId) ?? null;
  const nrhaOrganization = useMemo(
    () => externalOrganizations.find((externalOrganization) => externalOrganization.code.toUpperCase() === "NRHA") ?? null,
    [externalOrganizations],
  );
  const selectedHorseNrhaReference = useMemo(
    () =>
      nrhaOrganization && selectedHorse
        ? horseExternalMemberships.find(
            (membership) =>
              membership.horse_id === selectedHorse.id &&
              membership.external_organization_id === nrhaOrganization.id &&
              membership.reference_type === "competition_license",
          ) ?? null
        : null,
    [horseExternalMemberships, nrhaOrganization, selectedHorse],
  );
  const selectedRiderNrhaMembership = useMemo(
    () =>
      nrhaOrganization && selectedNrhaRiderContact
        ? contactExternalMemberships.find(
            (membership) =>
              membership.contact_id === selectedNrhaRiderContact.id &&
              membership.external_organization_id === nrhaOrganization.id,
          ) ?? null
        : null,
    [contactExternalMemberships, nrhaOrganization, selectedNrhaRiderContact],
  );
  const nrhaEligibilityContext = buildNrhaEligibilityContext({
    classRecord: selectedClass,
    division: selectedDivision,
    horse: selectedHorse,
    horseReferenceNumber: selectedHorseNrhaReference?.reference_number ?? "",
    locale,
    memberNumber: selectedRiderNrhaMembership?.membership_number ?? "",
    riderContact: selectedNrhaRiderContact,
    show: selectedShow,
  });
  const visibleNrhaEligibilityMessage =
    nrhaEligibilityMessage && nrhaEligibilityMessage.key === nrhaEligibilityContext.key ? nrhaEligibilityMessage : null;
  const selectedHealthValidity = selectedHorse
    ? getHorseHealthValidity({
        documents: horseHealthDocuments,
        horseId: selectedHorse.id,
        organization,
        referenceDate: selectedShow?.start_date ?? null,
      })
    : null;
  const entryReadiness = buildEntryShowReadiness({
    contactExternalMemberships,
    documents: horseHealthDocuments,
    externalOrganizations,
    horse: selectedHorse,
    membershipRequirements,
    organization,
    ownerContact: selectedOwnerContact,
    payerContact: selectedPayerContact,
    riderContact: selectedRiderContact,
    show: selectedShow,
  });
  const baseFee = selectedDivision?.entry_fee ?? selectedClass?.entry_fee ?? undefined;
  const entryDeadlineReadiness = buildEntryDeadlineReadiness(selectedClass, baseFee, organization?.currency ?? "CAD");
  const entryProgramLimitReadiness = buildEntryProgramLimitReadiness({
    division: selectedDivision,
    divisions,
    entries,
    horse: selectedHorse,
    ownerContact: selectedOwnerContact,
    riderContact: selectedRiderContact,
  });
  const canCreate = Boolean(
    organization &&
      profileId &&
      selectedShowId &&
      selectedHorse &&
      selectedDivision &&
      selectedPayerId &&
      entryReadiness.canProceed &&
      entryDeadlineReadiness.canProceed &&
      entryProgramLimitReadiness.canProceed,
  );
  const entryHeaderMessage = canCreate
    ? uiText(locale, "Brouillon maintenant, paiement plus tard.", "Draft now, checkout later.")
    : selectedHorse
      ? entryReadiness.canProceed
        ? entryDeadlineReadiness.canProceed
          ? entryProgramLimitReadiness.message?.message ?? uiText(locale, "Choisis une classe et un payeur.", "Choose a class and payer.")
          : entryDeadlineReadiness.message?.message ?? uiText(locale, "Choisis une classe et un payeur.", "Choose a class and payer.")
        : entryReadiness.message
      : uiText(locale, "Ajoute un concours, un cheval et une classe d'abord.", "Add a show, horse and class first.");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate || !organization || !profileId || !selectedHorse || !selectedDivision || !selectedShowId || !selectedPayerId) {
      return;
    }

    setBusy(true);

    try {
      await onCreateEntry({
        organization_id: organization.id,
        show_id: selectedShowId,
        horse_id: selectedHorse.id,
        division_id: selectedDivision.id,
        created_by_user_id: profileId,
        owner_contact_id: selectedHorse.primary_owner_contact_id,
        rider_contact_id: riderContactId || undefined,
        payer_contact_id: selectedPayerId,
        entry_number: entryNumberValue(entryNumber) ?? undefined,
        base_fee: baseFee,
      });
      setEntryNumber("");
      setRiderContactId("");
      setPayerContactId("");
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyNrhaEligibility() {
    if (!nrhaEligibilityContext.request) {
      return;
    }

    setNrhaEligibilityBusy(true);

    try {
      const verification = await onVerifyNrhaEligibility(nrhaEligibilityContext.request);
      setNrhaEligibilityMessage(formatNrhaEligibilityMessage(verification, nrhaEligibilityContext.key, locale));
    } catch (error) {
      setNrhaEligibilityMessage({
        key: nrhaEligibilityContext.key,
        tone: "error",
        message: error instanceof Error ? error.message : uiText(locale, "Validation NRHA impossible.", "NRHA validation unavailable."),
      });
    } finally {
      setNrhaEligibilityBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Nouvelle inscription brouillon", "New draft entry")}</h2>
          <p>{entryHeaderMessage}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <label>
          {uiText(locale, "Concours", "Show")}
          <select disabled={!shows.length} value={selectedShowId} onChange={(event) => setShowId(event.target.value)}>
            {shows.map((show) => (
              <option key={show.id} value={show.id}>
                {show.name}
              </option>
            ))}
          </select>
        </label>
        <div className="inline-picker-field">
          <span className="contact-picker-label">{uiText(locale, "Cheval", "Horse")}</span>
          <div className="contact-picker-row">
            <SearchSelect
              disabled={!visibleHorses.length}
              items={visibleHorses.map((horse) => {
                const validity = getHorseHealthValidity({
                  documents: horseHealthDocuments,
                  horseId: horse.id,
                  organization,
                  referenceDate: selectedShow?.start_date ?? null,
                });

                return {
                  id: horse.id,
                  label: horse.name,
                  detail: `${contactLabel(findById(contacts, horse.primary_owner_contact_id))} - ${horseHealthValidityMessage(validity)}`,
                };
              })}
              placeholder={uiText(locale, "Rechercher un cheval", "Search horse")}
              value={selectedHorse?.id ?? ""}
              onChange={setHorseId}
            />
            <button className="ghost-button" disabled={!organization} type="button" onClick={() => setCreatingHorse(true)}>
              {uiText(locale, "+ Cheval", "+ Horse")}
            </button>
          </div>
        </div>
        {creatingHorse ? (
          <ModalDialog className="horse-form-modal" description={uiText(locale, "Le cheval sera sélectionné dans l'inscription après sa création.", "The horse will be selected in the entry after it is created.")} eyebrow={uiText(locale, "Inscriptions", "Entries")} title={uiText(locale, "Ajouter un cheval", "Add horse")} onClose={() => setCreatingHorse(false)}>
            <HorseForm
              locale={locale}
              contacts={contacts}
              contactRoles={contactRoles}
              createdByUserId={profileId}
              externalOrganizations={externalOrganizations}
              organization={organization}
              onCreateContact={onCreateContact}
              onCreateHorse={onCreateHorse}
              onCreateHorseHealthDocument={onCreateHorseHealthDocument}
              onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
              onCreated={(horse) => {
                setCreatedHorse(horse);
                setHorseId(horse.id);
                setCreatingHorse(false);
              }}
            />
          </ModalDialog>
        ) : null}
        <InlineHealthMessage
          value={
            selectedHealthValidity
              ? {
                  tone: horseHealthValidityTone(selectedHealthValidity),
                  message: `${horseHealthValidityMessage(selectedHealthValidity)} ${uiText(locale, "Référence", "Reference")}: ${selectedShow ? formatDate(selectedShow.start_date) : uiText(locale, "concours", "show")}.`,
                }
              : null
          }
        />
        <label>
          {uiText(locale, "Classe", "Class")}
          <SearchSelect
            disabled={!availableDivisions.length}
            items={availableDivisions.map((division) => {
              const classRecord = findById(classes, division.class_id);
              const effectiveEntryFee = division.entry_fee ?? classRecord?.entry_fee ?? null;

              return {
                id: division.id,
                label: divisionLabel(division, classes),
                detail: [
                  effectiveEntryFee == null ? null : `${uiText(locale, "Inscription", "Entry")} ${formatCurrency(effectiveEntryFee, organization?.currency ?? "CAD")}`,
                  division.judge_fee == null ? null : `${uiText(locale, "Juge", "Judge")} ${formatCurrency(division.judge_fee, organization?.currency ?? "CAD")}`,
                ]
                  .filter(Boolean)
                  .join(" - "),
              };
            })}
            placeholder={uiText(locale, "Rechercher une classe", "Search class")}
            value={selectedDivision?.id ?? ""}
            onChange={setDivisionId}
          />
        </label>
        <InlineHealthMessage value={selectedDivision ? entryDeadlineReadiness.message : null} />
        <InlineHealthMessage value={selectedDivision ? entryProgramLimitReadiness.message : null} />
        {nrhaEligibilityContext.applies ? (
          <div className="entry-verification-row">
            <button className="ghost-button" disabled={!nrhaEligibilityContext.request || nrhaEligibilityBusy} type="button" onClick={handleVerifyNrhaEligibility}>
              <ShieldCheck size={18} />
              {nrhaEligibilityBusy ? uiText(locale, "Vérification...", "Checking...") : uiText(locale, "Vérifier NRHA", "Check NRHA")}
            </button>
            <InlineHealthMessage value={visibleNrhaEligibilityMessage ?? nrhaEligibilityContext.message} />
          </div>
        ) : null}
        <div className="form-grid">
          <label>
            {uiText(locale, "Numéro de dossard", "Back number")}
            <input min="1" step="1" type="number" value={entryNumber} onChange={(event) => setEntryNumber(event.target.value)} />
            <span className="input-help">{uiText(locale, "Peut être ajouté plus tard si le dossard n'est pas encore assigné.", "Can be added later if the back number is not assigned yet.")}</span>
          </label>
        </div>
        <div className="form-grid">
          <ContactPicker
            allowEmpty
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            disabled={!organization}
            label={uiText(locale, "Cavalier", "Rider")}
            locale={locale}
            organization={organization}
            role="rider"
            value={riderContactId}
            onChange={setRiderContactId}
            onCreateContact={onCreateContact}
          />
          <ContactPicker
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            disabled={!organization}
            label={uiText(locale, "Payeur", "Payer")}
            locale={locale}
            organization={organization}
            role="payer"
            value={selectedPayerId}
            onChange={setPayerContactId}
            onCreateContact={onCreateContact}
          />
        </div>
        <ReadinessChecklist readiness={selectedHorse ? entryReadiness : null} />
        <button className="primary-button" disabled={busy || !canCreate} type="submit">
          <Plus size={18} />
          {uiText(locale, "Créer le brouillon", "Create draft entry")}
        </button>
      </form>
    </section>
  );
}

function buildNrhaEligibilityContext(input: {
  classRecord: ClassRecord | null;
  division: Division | null;
  horse: Horse | null;
  horseReferenceNumber: string;
  locale: Locale;
  memberNumber: string;
  riderContact: Contact | null;
  show: Show | null;
}) {
  const sanctioningCodes = [...(input.division?.sanctioning_body_codes ?? []), ...(input.classRecord?.sanctioning_body_codes ?? [])];
  const applies = sanctioningCodes.includes("NRHA");
  const classCode = integerFromExactReference(input.division?.code ?? input.classRecord?.code ?? "");
  const competitionLicenseNumber = integerFromReference(input.horseReferenceNumber);
  const memberNumber = integerFromReference(input.memberNumber);
  const date = input.show?.start_date?.slice(0, 10) ?? "";
  const key = [
    input.division?.id ?? "",
    input.horse?.id ?? "",
    input.riderContact?.id ?? "",
    classCode ?? "",
    competitionLicenseNumber ?? "",
    memberNumber ?? "",
    date,
  ].join(":");

  if (!applies) {
    return { applies, key, message: null, request: null };
  }

  if (!input.horse || !input.division || !input.show) {
    return {
      applies,
      key,
      message: {
        tone: "info" as const,
        message: uiText(input.locale, "Choisis un cheval, une classe NRHA et un concours pour lancer la vérification.", "Choose a horse, NRHA class and show before checking eligibility."),
      },
      request: null,
    };
  }

  if (!input.riderContact) {
    return {
      applies,
      key,
      message: {
        tone: "info" as const,
        message: uiText(input.locale, "Choisis un cavalier ou confirme le propriétaire comme cavalier avant la vérification NRHA.", "Choose a rider or confirm the owner as rider before checking NRHA."),
      },
      request: null,
    };
  }

  if (classCode === null) {
    return {
      applies,
      key,
      message: { tone: "error" as const, message: uiText(input.locale, "Code de classe NRHA numérique manquant.", "Missing numeric NRHA class code.") },
      request: null,
    };
  }

  if (competitionLicenseNumber === null) {
    return {
      applies,
      key,
      message: {
        tone: "error" as const,
        message: uiText(input.locale, "Licence de compétition NRHA du cheval manquante.", "Missing horse NRHA competition license."),
      },
      request: null,
    };
  }

  if (memberNumber === null) {
    return {
      applies,
      key,
      message: { tone: "error" as const, message: uiText(input.locale, "Numéro de membre NRHA du cavalier manquant.", "Missing rider NRHA member number.") },
      request: null,
    };
  }

  if (!date) {
    return {
      applies,
      key,
      message: { tone: "error" as const, message: uiText(input.locale, "Date de concours manquante pour la vérification NRHA.", "Missing show date for NRHA check.") },
      request: null,
    };
  }

  return {
    applies,
    key,
    message: { tone: "info" as const, message: uiText(input.locale, "Vérification NRHA prête.", "NRHA check ready.") },
    request: {
      classCode,
      competitionLicenseNumber,
      date,
      memberNumber,
    },
  };
}

function integerFromReference(value: string) {
  const digits = value.trim().replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerFromExactReference(value: string | null | undefined) {
  const cleanValue = value?.trim() ?? "";

  if (!/^\d+$/.test(cleanValue)) {
    return null;
  }

  const parsed = Number(cleanValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNrhaEligibilityMessage(
  verification: NrhaEligibilityVerification,
  key: string,
  locale: Locale,
): NrhaEligibilityMessage {
  const reasons = (verification.reasons ?? []).map((reason) => reason.message?.trim()).filter(Boolean);
  const reasonText = reasons.length ? ` ${reasons.slice(0, 2).join(" ")}` : "";

  if (verification.eligible) {
    return {
      key,
      tone: "success",
      message: `${uiText(locale, "NRHA: équipe admissible.", "NRHA: team eligible.")}${reasonText}`,
    };
  }

  return {
    key,
    tone: "error",
    message: `${uiText(locale, "NRHA: équipe non admissible.", "NRHA: team not eligible.")}${reasonText}`,
  };
}


export { EntryForm };
