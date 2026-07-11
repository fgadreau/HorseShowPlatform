import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Plus, ShieldCheck } from "lucide-react";
import { ContactPicker, ModalDialog, SearchSelect } from "../../components/ui";
import { contactLabel, findById, formatCurrency, formatDate, horseLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { buildEntryShowReadiness } from "../../lib/readiness";
import { createContact, createEntry, createHorse, createUploadedHorseHealthDocument, verifyGvlCogginsDocument, verifyNrhaEligibility, verifyNrhaHorse } from "../../services/supabaseServices";
import type { ClassRecord, Contact, ContactExternalMembership, ContactRole, Division, Entry, ExternalOrganization, Horse, HorseExternalMembership, HorseHealthDocument, NrhaRiderRanking, Organization, OrganizationExternalMembershipRequirement, Show, ShowDay } from "../../types/domain";
import { classEntriesCloseDate, classScheduleStartLabel, buildEntryDeadlineReadiness, buildEntryProgramLimitReadiness, compareScheduleClasses, showDayLabel } from "../classes/classUtils";
import { uiText, getHorseHealthValidity, horseHealthValidityMessage, horseHealthValidityTone, entryNumberValue, InlineHealthMessage, ReadinessChecklist } from "../dashboard/shared";
import { HorseForm } from "../horses/HorseForm";
import { buildNrhaEligibilityGateForEntry, formatNrhaEligibilityMessage, type NrhaEligibilityMessage } from "./NrhaEligibilityCheck";
import { entryDivisionLabel } from "./entryDisplay";

type DivisionEvaluation = {
  canSelect: boolean;
  classRecord: ClassRecord | null;
  division: Division;
  fee: number | null;
  message: InlineHealthMessage | null;
  nrhaMessage: InlineHealthMessage | null;
  nrhaKey: string;
  nrhaResult: NrhaEligibilityMessage | null;
  nrhaRequiresVerification: boolean;
  nrhaRequest: Parameters<typeof verifyNrhaEligibility>[0] | null;
};

type ShowbillBlock = {
  classRecord: ClassRecord;
  evaluations: DivisionEvaluation[];
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
  nrhaRiderRankings,
  organization,
  profileId,
  showDays,
  shows,
  onCreateContact,
  onCreateEntry,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaEligibility,
  onVerifyNrhaHorse,
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
  nrhaRiderRankings: NrhaRiderRanking[];
  organization: Organization | null;
  profileId: string;
  showDays: ShowDay[];
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateEntry: (input: Parameters<typeof createEntry>[0]) => Promise<void>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaEligibility: (input: Parameters<typeof verifyNrhaEligibility>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaEligibility>>>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
  onCreated?: () => void;
}) {
  const [creatingHorse, setCreatingHorse] = useState(false);
  const [createdHorse, setCreatedHorse] = useState<Horse | null>(null);
  const [showId, setShowId] = useState("");
  const [horseId, setHorseId] = useState("");
  const [payerContactId, setPayerContactId] = useState("");
  const [riderContactId, setRiderContactId] = useState("");
  const [entryNumber, setEntryNumber] = useState("");
  const [activeDayId, setActiveDayId] = useState("");
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([]);
  const [nrhaResults, setNrhaResults] = useState<Record<string, NrhaEligibilityMessage>>({});
  const [nrhaVerifyBusy, setNrhaVerifyBusy] = useState(false);
  const [preauthAccepted, setPreauthAccepted] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<InlineHealthMessage | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedShowId = showId || shows[0]?.id || "";
  const selectedShow = findById(shows, selectedShowId) ?? null;
  const selectedShowDays = useMemo(
    () => showDays.filter((day) => day.show_id === selectedShowId).sort(compareShowDays),
    [selectedShowId, showDays],
  );
  const effectiveActiveDayId = activeDayId && selectedShowDays.some((day) => day.id === activeDayId) ? activeDayId : selectedShowDays[0]?.id || "unscheduled";
  const activeDay = findById(selectedShowDays, effectiveActiveDayId) ?? null;
  const activeDayIndex = Math.max(0, selectedShowDays.findIndex((day) => day.id === effectiveActiveDayId));
  const visibleHorses = useMemo(() => {
    if (!createdHorse || horses.some((horse) => horse.id === createdHorse.id)) {
      return horses;
    }

    return [createdHorse, ...horses];
  }, [createdHorse, horses]);
  const selectedHorse = findById(visibleHorses, horseId) ?? null;
  const selectedOwnerContact = findById(contacts, selectedHorse?.primary_owner_contact_id) ?? null;
  const selectedRiderContact = findById(contacts, riderContactId) ?? null;
  const selectedPayerId = payerContactId || selectedHorse?.primary_owner_contact_id || contacts[0]?.id || "";
  const selectedPayerContact = findById(contacts, selectedPayerId) ?? null;
  const teamIsDefined = Boolean(selectedShow && selectedHorse && selectedRiderContact && selectedPayerContact);
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
  const selectedNrhaOrganization = externalOrganizations.find((externalOrganization) => externalOrganization.code.toUpperCase() === "NRHA") ?? null;
  const horseNrhaReference = selectedNrhaOrganization && selectedHorse
    ? horseExternalMemberships.find((membership) => membership.horse_id === selectedHorse.id && membership.external_organization_id === selectedNrhaOrganization.id && membership.reference_type === "competition_license") ?? null
    : null;
  const riderNrhaMembership = selectedNrhaOrganization && selectedRiderContact
    ? contactExternalMemberships.find((membership) => membership.contact_id === selectedRiderContact.id && membership.external_organization_id === selectedNrhaOrganization.id) ?? null
    : null;
  const showbillEvaluations = useMemo(
    () =>
      divisions.map((division) =>
        evaluateDivision({
          classes,
          contactExternalMemberships,
          division,
          divisions,
          entries,
          entryReadinessCanProceed: entryReadiness.canProceed,
          externalOrganizations,
          horse: selectedHorse,
          horseExternalMemberships,
          locale,
          nrhaResult: nrhaResults[division.id] ?? null,
          nrhaRiderRankings,
          organization,
          riderContact: selectedRiderContact,
          selectedShow,
        }),
      ),
    [classes, contactExternalMemberships, divisions, selectedRiderContact, entries, entryReadiness.canProceed, externalOrganizations, horseExternalMemberships, locale, nrhaResults, nrhaRiderRankings, organization, selectedHorse, selectedShow],
  );
  const evaluationByDivisionId = useMemo(() => new Map(showbillEvaluations.map((evaluation) => [evaluation.division.id, evaluation])), [showbillEvaluations]);
  const dayBlocks = useMemo(
    () => buildShowbillBlocks({ classes, evaluations: showbillEvaluations, showDayId: effectiveActiveDayId === "unscheduled" ? null : effectiveActiveDayId }),
    [classes, effectiveActiveDayId, showbillEvaluations],
  );
  const selectedEvaluations = selectedDivisionIds.map((divisionId) => evaluationByDivisionId.get(divisionId)).filter((evaluation): evaluation is DivisionEvaluation => Boolean(evaluation));
  const selectedTotal = selectedEvaluations.reduce((total, evaluation) => total + (evaluation.fee ?? 0), 0);
  const selectedNrhaPending = selectedEvaluations.filter((evaluation) => evaluation.nrhaRequiresVerification);
  const selectedBlocked = selectedEvaluations.filter((evaluation) => !evaluation.canSelect);
  const checkoutPreview = buildEntryCheckoutPreview({
    evaluations: selectedEvaluations,
    organization,
    show: selectedShow,
  });
  const requiresPreauthAcceptance = checkoutPreview.preauthRequired && selectedDivisionIds.length > 0;
  const canCreate = Boolean(
    organization &&
      profileId &&
      selectedShow &&
      selectedHorse &&
      selectedOwnerContact &&
      selectedRiderContact &&
      selectedPayerId &&
      selectedDivisionIds.length &&
      entryReadiness.canProceed &&
      !selectedBlocked.length &&
      !selectedNrhaPending.length &&
      (!requiresPreauthAcceptance || preauthAccepted),
  );
  const entryHeaderMessage = selectedDivisionIds.length
    ? uiText(locale, `${selectedDivisionIds.length} classe${selectedDivisionIds.length === 1 ? "" : "s"} sélectionnée${selectedDivisionIds.length === 1 ? "" : "s"}.`, `${selectedDivisionIds.length} class${selectedDivisionIds.length === 1 ? "" : "es"} selected.`)
    : teamIsDefined
      ? uiText(locale, "Choisis les classes dans le showbill par journée.", "Choose classes from the day-by-day showbill.")
      : uiText(locale, "Commence par choisir le cheval, le cavalier et le payeur.", "Start by choosing the horse, rider and payer.");

  function handleShowChange(nextShowId: string) {
    setShowId(nextShowId);
    setActiveDayId("");
    setSelectedDivisionIds([]);
    setNrhaResults({});
    setPreauthAccepted(false);
    setSubmitMessage(null);
  }

  function handleTeamChange(updater: () => void) {
    updater();
    setNrhaResults({});
    setPreauthAccepted(false);
    setSubmitMessage(null);
  }

  function toggleDivision(divisionId: string) {
    const evaluation = evaluationByDivisionId.get(divisionId);
    const alreadySelected = selectedDivisionIds.includes(divisionId);

    if (!alreadySelected && !evaluation?.canSelect) {
      return;
    }

    setSelectedDivisionIds((current) => (current.includes(divisionId) ? current.filter((id) => id !== divisionId) : [...current, divisionId]));
    setPreauthAccepted(false);
    setSubmitMessage(null);
  }

  async function handleVerifySelectedNrha() {
    if (!selectedNrhaPending.length) {
      return;
    }

    setNrhaVerifyBusy(true);
    setSubmitMessage(null);

    try {
      const nextResults: Record<string, NrhaEligibilityMessage> = {};

      for (const evaluation of selectedNrhaPending) {
        if (!evaluation.nrhaRequest) {
          continue;
        }

        const verification = await onVerifyNrhaEligibility(evaluation.nrhaRequest);
        nextResults[evaluation.division.id] = formatNrhaEligibilityMessage(verification, evaluation.nrhaKey, locale);
      }

      setNrhaResults((current) => ({ ...current, ...nextResults }));
    } catch (error) {
      setSubmitMessage({
        tone: "error",
        message: error instanceof Error ? error.message : uiText(locale, "Validation NRHA impossible pour les classes sélectionnées.", "Unable to validate selected NRHA classes."),
      });
    } finally {
      setNrhaVerifyBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreate || !organization || !profileId || !selectedHorse || !selectedOwnerContact || !selectedRiderContact || !selectedShow || !selectedPayerId) {
      return;
    }

    setBusy(true);
    setSubmitMessage(null);

    try {
      for (const evaluation of selectedEvaluations) {
        await onCreateEntry({
          organization_id: organization.id,
          show_id: selectedShow.id,
          horse_id: selectedHorse.id,
          division_id: evaluation.division.id,
          created_by_user_id: profileId,
          owner_contact_id: selectedHorse.primary_owner_contact_id,
          rider_contact_id: selectedRiderContact.id,
          payer_contact_id: selectedPayerId,
          entry_number: entryNumberValue(entryNumber) ?? undefined,
          base_fee: evaluation.fee ?? undefined,
        });
      }

      setEntryNumber("");
      setRiderContactId("");
      setPayerContactId("");
      setSelectedDivisionIds([]);
      setNrhaResults({});
      setPreauthAccepted(false);
      onCreated?.();
    } catch (error) {
      setSubmitMessage({
        tone: "error",
        message: error instanceof Error ? error.message : uiText(locale, "Impossible de créer les inscriptions sélectionnées.", "Unable to create selected entries."),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel entry-showbill-panel">
      <div className="panel-header">
        <div>
          <h2>{uiText(locale, "Nouvelle inscription", "New entry")}</h2>
          <p>{entryHeaderMessage}</p>
        </div>
      </div>
      <form className="stack" onSubmit={handleSubmit}>
        <section className="entry-flow-section">
          <div className="entry-flow-section-header">
            <span>1</span>
            <div>
              <strong>{uiText(locale, "Équipe", "Team")}</strong>
              <p>{uiText(locale, "Définis le cheval, le cavalier et le payeur avant de choisir les classes.", "Set the horse, rider and payer before choosing classes.")}</p>
            </div>
          </div>
          <label>
            {uiText(locale, "Concours", "Show")}
            <select disabled={!shows.length} value={selectedShowId} onChange={(event) => handleShowChange(event.target.value)}>
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
                onChange={(nextHorseId) => handleTeamChange(() => setHorseId(nextHorseId))}
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
                onVerifyNrhaHorse={onVerifyNrhaHorse}
                onCreated={(horse) => {
                  setCreatedHorse(horse);
                  handleTeamChange(() => setHorseId(horse.id));
                  setCreatingHorse(false);
                }}
              />
            </ModalDialog>
          ) : null}
          <div className="form-grid">
            <ContactPicker
              contacts={contacts}
              contactRoles={contactRoles}
              createdByUserId={profileId}
              disabled={!organization}
              label={uiText(locale, "Cavalier", "Rider")}
              locale={locale}
              organization={organization}
              role="rider"
              value={riderContactId}
              onChange={(nextContactId) => handleTeamChange(() => setRiderContactId(nextContactId))}
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
              onChange={(nextContactId) => handleTeamChange(() => setPayerContactId(nextContactId))}
              onCreateContact={onCreateContact}
            />
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Numéro de dossard", "Back number")}
              <input min="1" step="1" type="number" value={entryNumber} onChange={(event) => setEntryNumber(event.target.value)} />
              <span className="input-help">{uiText(locale, "Le même dossard sera proposé pour les classes sélectionnées.", "The same back number will be used for selected classes.")}</span>
            </label>
          </div>
        </section>

        <section className="entry-flow-section">
          <div className="entry-flow-section-header">
            <span>2</span>
            <div>
              <strong>{uiText(locale, "Profil déduit", "Deduced profile")}</strong>
              <p>{uiText(locale, "HSP résume les données qui influencent la sélection des classes.", "HSP summarizes the details that affect class selection.")}</p>
            </div>
          </div>
          <div className="entry-team-profile">
            <ProfileFact label={uiText(locale, "Cheval", "Horse")} value={selectedHorse ? horseLabel(selectedHorse) : uiText(locale, "À choisir", "Choose one")} />
            <ProfileFact label={uiText(locale, "Cavalier", "Rider")} value={selectedRiderContact ? contactLabel(selectedRiderContact) : uiText(locale, "À choisir", "Choose one")} />
            <ProfileFact label="NRHA cheval" value={horseNrhaReference?.reference_number || uiText(locale, "Non validé", "Not validated")} />
            <ProfileFact label="NRHA cavalier" value={riderNrhaMembership ? `${riderNrhaMembership.membership_number}${riderNrhaMembership.expires_on ? ` · ${uiText(locale, "expire", "expires")} ${riderNrhaMembership.expires_on}` : ""}` : uiText(locale, "Non validé", "Not validated")} />
            <ProfileFact label={uiText(locale, "Santé", "Health")} value={selectedHealthValidity ? horseHealthValidityMessage(selectedHealthValidity) : uiText(locale, "Cheval requis", "Horse required")} />
            <ProfileFact label={uiText(locale, "Sélection", "Selection")} value={`${selectedDivisionIds.length} · ${formatCurrency(selectedTotal, organization?.currency ?? "CAD")}`} />
          </div>
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
          <ReadinessChecklist readiness={selectedHorse ? entryReadiness : null} />
        </section>

        <section className="entry-flow-section">
          <div className="entry-flow-section-header">
            <span>3</span>
            <div>
              <strong>{uiText(locale, "Showbill", "Showbill")}</strong>
              <p>{uiText(locale, "Avance journée par journée et sélectionne les classes admissibles.", "Move day by day and choose eligible classes.")}</p>
            </div>
          </div>
          <div className="entry-day-tabs">
            {selectedShowDays.map((day) => (
              <button className={effectiveActiveDayId === day.id ? "active" : ""} key={day.id} type="button" onClick={() => setActiveDayId(day.id)}>
                {showDayLabel(day)}
              </button>
            ))}
            {!selectedShowDays.length ? (
              <button className="active" type="button">
                {uiText(locale, "Sans journée", "No day")}
              </button>
            ) : null}
          </div>
          <div className="entry-day-nav">
            <button className="ghost-button" disabled={!selectedShowDays.length || activeDayIndex <= 0} type="button" onClick={() => setActiveDayId(selectedShowDays[activeDayIndex - 1]?.id ?? "")}>
              <ChevronLeft size={18} />
              {uiText(locale, "Jour précédent", "Previous day")}
            </button>
            <span>{activeDay ? showDayLabel(activeDay) : uiText(locale, "Classes sans journée assignée", "Classes without assigned day")}</span>
            <button className="ghost-button" disabled={!selectedShowDays.length || activeDayIndex >= selectedShowDays.length - 1} type="button" onClick={() => setActiveDayId(selectedShowDays[activeDayIndex + 1]?.id ?? "")}>
              {uiText(locale, "Jour suivant", "Next day")}
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="entry-showbill-list">
            {dayBlocks.map((block) => (
              <section className="entry-showbill-block" key={block.classRecord.id}>
                <div className="entry-showbill-block-header">
                  <div>
                    <strong>{block.classRecord.block_label || block.classRecord.name}</strong>
                    <span>{[classScheduleStartLabel(block.classRecord, locale), block.classRecord.arena].filter(Boolean).join(" · ")}</span>
                  </div>
                </div>
                <div className="entry-showbill-class-list">
                  {block.evaluations.map((evaluation) => {
                    const selected = selectedDivisionIds.includes(evaluation.division.id);
                    const Icon = evaluation.canSelect ? CheckCircle2 : AlertCircle;

                    return (
                      <button
                        className={`entry-showbill-class${selected ? " selected" : ""}${evaluation.canSelect ? "" : " disabled"}`}
                        disabled={!evaluation.canSelect && !selected}
                        key={evaluation.division.id}
                        type="button"
                        onClick={() => toggleDivision(evaluation.division.id)}
                      >
                        <Icon size={18} />
                        <span>
                          <strong>{entryDivisionLabel(evaluation.division, locale)}</strong>
                          <small>{evaluation.fee == null ? uiText(locale, "Frais à confirmer", "Fee to confirm") : formatCurrency(evaluation.fee, organization?.currency ?? "CAD")}</small>
                        </span>
                        {evaluation.nrhaResult ? <small className={`entry-class-status ${evaluation.nrhaResult.tone}`}>{evaluation.nrhaResult.message}</small> : null}
                        {!evaluation.nrhaResult && evaluation.message ? <small className={`entry-class-status ${evaluation.message.tone}`}>{evaluation.message.message}</small> : null}
                        {!evaluation.nrhaResult && !evaluation.message && evaluation.nrhaMessage ? <small className={`entry-class-status ${evaluation.nrhaMessage.tone}`}>{evaluation.nrhaMessage.message}</small> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {!dayBlocks.length ? <p className="muted-line">{uiText(locale, "Aucun bloc pour cette journée.", "No blocks for this day.")}</p> : null}
          </div>
        </section>

        <section className="entry-flow-section">
          <div className="entry-flow-section-header">
            <span>4</span>
            <div>
              <strong>{uiText(locale, "Confirmer", "Confirm")}</strong>
              <p>{uiText(locale, "Révise la facture estimée et accepte la préautorisation avant de créer les brouillons.", "Review the estimated invoice and accept preauthorization before creating draft entries.")}</p>
            </div>
          </div>
          {selectedEvaluations.length ? (
            <div className="entry-checkout-preview">
              <div className="entry-checkout-lines">
                {checkoutPreview.lines.map((line) => (
                  <div className="entry-checkout-line" key={line.evaluation.division.id}>
                    <div>
                      <strong>{entryDivisionLabel(line.evaluation.division, locale)}</strong>
                      <span>{line.evaluation.classRecord?.block_label || line.evaluation.classRecord?.name || uiText(locale, "Bloc", "Block")}</span>
                      {line.fee.isLate ? (
                        <small>
                          {uiText(locale, "Inscription tardive", "Late entry")} +{line.fee.lateFeePercent}%
                        </small>
                      ) : null}
                    </div>
                    <strong>{formatCurrency(line.fee.total, checkoutPreview.currency)}</strong>
                  </div>
                ))}
              </div>
              <div className="entry-checkout-grid">
                <CheckoutFact label={uiText(locale, "Classes", "Classes")} value={formatCurrency(checkoutPreview.entryBaseSubtotal, checkoutPreview.currency)} />
                <CheckoutFact label={uiText(locale, "Frais tardifs", "Late fees")} value={formatCurrency(checkoutPreview.lateFeeTotal, checkoutPreview.currency)} />
                <CheckoutFact label={uiText(locale, "Frais juge", "Judge fees")} value={formatCurrency(checkoutPreview.judgeFeeTotal, checkoutPreview.currency)} />
                <CheckoutFact label={uiText(locale, "Taxes estimées", "Estimated taxes")} value={formatCurrency(checkoutPreview.taxAmount, checkoutPreview.currency)} />
                <CheckoutFact emphasized label={uiText(locale, "Total estimé", "Estimated total")} value={formatCurrency(checkoutPreview.invoiceTotal, checkoutPreview.currency)} />
                <CheckoutFact
                  emphasized
                  label={uiText(locale, "Préautorisation", "Preauthorization")}
                  value={checkoutPreview.preauthRequired ? formatCurrency(checkoutPreview.preauthAmount, checkoutPreview.currency) : uiText(locale, "Manuelle", "Manual")}
                />
              </div>
              <div className="entry-preauth-consent">
                {checkoutPreview.preauthRequired ? (
                  <label className="checkbox-row">
                    <input checked={preauthAccepted} type="checkbox" onChange={(event) => setPreauthAccepted(event.target.checked)} />
                    <span>
                      <strong>{uiText(locale, "J'accepte la préautorisation de la carte au dossier.", "I accept the card-on-file preauthorization.")}</strong>
                      <small>{preauthorizationDetail(checkoutPreview, selectedShow, locale)}</small>
                    </span>
                  </label>
                ) : (
                  <InlineHealthMessage
                    value={{
                      tone: "info",
                      message: uiText(locale, "Ce concours utilise un paiement manuel pour les inscriptions.", "This show uses manual payment for entries."),
                    }}
                  />
                )}
              </div>
            </div>
          ) : (
            <p className="muted-line">{uiText(locale, "Aucune classe sélectionnée.", "No selected classes.")}</p>
          )}
          {selectedNrhaPending.length ? (
            <button className="ghost-button" disabled={nrhaVerifyBusy} type="button" onClick={handleVerifySelectedNrha}>
              <ShieldCheck size={18} />
              {nrhaVerifyBusy ? uiText(locale, "Validation NRHA...", "Checking NRHA...") : uiText(locale, "Vérifier les classes NRHA sélectionnées", "Check selected NRHA classes")}
            </button>
          ) : null}
          <InlineHealthMessage value={submitMessage} />
          {selectedBlocked.length ? (
            <InlineHealthMessage
              value={{
                tone: "error",
                message: uiText(locale, "Une classe sélectionnée n'est plus admissible. Retire-la avant de continuer.", "A selected class is no longer eligible. Remove it before continuing."),
              }}
            />
          ) : null}
          {selectedNrhaPending.length ? (
            <InlineHealthMessage
              value={{
                tone: "info",
                message: uiText(locale, "Certaines classes NRHA sélectionnées doivent être vérifiées avant de créer les brouillons.", "Some selected NRHA classes must be checked before draft entries can be created."),
              }}
            />
          ) : null}
          {requiresPreauthAcceptance && !preauthAccepted ? (
            <InlineHealthMessage
              value={{
                tone: "info",
                message: uiText(locale, "Accepte la préautorisation pour continuer.", "Accept preauthorization to continue."),
              }}
            />
          ) : null}
          <button className="primary-button" disabled={busy || !canCreate} type="submit">
            <Plus size={18} />
            {busy
              ? uiText(locale, "Création...", "Creating...")
              : uiText(locale, selectedDivisionIds.length > 1 ? "Créer les brouillons et la facture" : "Créer le brouillon et la facture", selectedDivisionIds.length > 1 ? "Create draft entries and invoice" : "Create draft entry and invoice")}
          </button>
        </section>
      </form>
    </section>
  );
}

function evaluateDivision({
  classes,
  contactExternalMemberships,
  division,
  divisions,
  entries,
  entryReadinessCanProceed,
  externalOrganizations,
  horse,
  horseExternalMemberships,
  locale,
  nrhaResult,
  nrhaRiderRankings,
  organization,
  riderContact,
  selectedShow,
}: {
  classes: ClassRecord[];
  contactExternalMemberships: ContactExternalMembership[];
  division: Division;
  divisions: Division[];
  entries: Entry[];
  entryReadinessCanProceed: boolean;
  externalOrganizations: ExternalOrganization[];
  horse: Horse | null;
  horseExternalMemberships: HorseExternalMembership[];
  locale: Locale;
  nrhaResult: NrhaEligibilityMessage | null;
  nrhaRiderRankings: NrhaRiderRanking[];
  organization: Organization | null;
  riderContact: Contact | null;
  selectedShow: Show | null;
}): DivisionEvaluation {
  const classRecord = findById(classes, division.class_id) ?? null;
  const fee = division.entry_fee ?? classRecord?.entry_fee ?? null;
  const deadlineReadiness = buildEntryDeadlineReadiness(classRecord, fee, organization?.currency ?? "CAD");
  const programLimitReadiness = buildEntryProgramLimitReadiness({
    division,
    divisions,
    entries,
    horse,
    ownerContact: horse ? null : null,
    riderContact,
  });
  const nrhaGate = buildNrhaEligibilityGateForEntry({
    classRecord,
    contactExternalMemberships,
    division,
    externalOrganizations,
    horse,
    horseExternalMemberships,
    locale,
    nrhaRiderRankings,
    resultMessage: nrhaResult,
    riderContact,
    show: selectedShow,
  });
  const message = !entryReadinessCanProceed
    ? { tone: "info" as const, message: uiText(locale, "Complète l'équipe avant de choisir cette classe.", "Complete the team before choosing this class.") }
    : !riderContact
      ? { tone: "info" as const, message: uiText(locale, "Choisis un cavalier avant de sélectionner cette classe.", "Choose a rider before selecting this class.") }
    : !deadlineReadiness.canProceed
      ? deadlineReadiness.message
      : !programLimitReadiness.canProceed
        ? programLimitReadiness.message
        : nrhaGate.message && !nrhaGate.canProceed && nrhaGate.message.tone === "error"
          ? nrhaGate.message
          : null;
  const nrhaRequiresVerification = Boolean(nrhaGate.applies && nrhaGate.request && !nrhaGate.verified);
  const canSelect = Boolean(
    horse &&
      riderContact &&
      entryReadinessCanProceed &&
      deadlineReadiness.canProceed &&
      programLimitReadiness.canProceed &&
      (!nrhaGate.applies || Boolean(nrhaGate.request)) &&
      (!nrhaGate.applies || nrhaGate.canProceed || nrhaRequiresVerification),
  );

  return {
    canSelect,
    classRecord,
    division,
    fee,
    message,
    nrhaMessage: nrhaGate.message,
    nrhaKey: nrhaGate.key,
    nrhaRequest: nrhaGate.request ?? null,
    nrhaRequiresVerification,
    nrhaResult,
  };
}

function buildShowbillBlocks({
  classes,
  evaluations,
  showDayId,
}: {
  classes: ClassRecord[];
  evaluations: DivisionEvaluation[];
  showDayId: string | null;
}): ShowbillBlock[] {
  const blockClasses = classes
    .filter((classRecord) => classRecord.show_day_id === showDayId && !classRecord.is_event_block)
    .sort(compareScheduleClasses);

  return blockClasses
    .map((classRecord) => ({
      classRecord,
      evaluations: evaluations.filter((evaluation) => evaluation.division.class_id === classRecord.id).sort(compareDivisionEvaluations),
    }))
    .filter((block) => block.evaluations.length);
}

function compareShowDays(a: ShowDay, b: ShowDay) {
  return a.sort_order - b.sort_order || a.day_date.localeCompare(b.day_date) || (a.day_number ?? 0) - (b.day_number ?? 0);
}

function compareDivisionEvaluations(a: DivisionEvaluation, b: DivisionEvaluation) {
  return (a.division.code ?? "").localeCompare(b.division.code ?? "") || a.division.name.localeCompare(b.division.name);
}

type EntryCheckoutLine = {
  evaluation: DivisionEvaluation;
  fee: {
    base: number;
    isLate: boolean;
    lateFee: number;
    lateFeePercent: number;
    total: number;
  };
};

type EntryCheckoutPreview = {
  currency: string;
  entryBaseSubtotal: number;
  entrySubtotal: number;
  invoiceSubtotal: number;
  invoiceTotal: number;
  judgeFeeTotal: number;
  lateFeeTotal: number;
  lines: EntryCheckoutLine[];
  preauthAmount: number;
  preauthRequired: boolean;
  taxAmount: number;
  taxRate: number;
};

function buildEntryCheckoutPreview({
  evaluations,
  organization,
  show,
}: {
  evaluations: DivisionEvaluation[];
  organization: Organization | null;
  show: Show | null;
}): EntryCheckoutPreview {
  const currency = show?.default_currency || organization?.currency || "CAD";
  const taxRate = show?.tax_rate ?? organization?.tax_rate ?? 0;
  const lines = evaluations.map((evaluation) => ({
    evaluation,
    fee: entryFeePreview(evaluation),
  }));
  const entryBaseSubtotal = roundMoney(lines.reduce((total, line) => total + line.fee.base, 0));
  const lateFeeTotal = roundMoney(lines.reduce((total, line) => total + line.fee.lateFee, 0));
  const entrySubtotal = roundMoney(lines.reduce((total, line) => total + line.fee.total, 0));
  const judgeFeeTotal = roundMoney(buildJudgeFeePreviewLines(lines).reduce((total, line) => total + line.amount, 0));
  const invoiceSubtotal = roundMoney(entrySubtotal + judgeFeeTotal);
  const taxAmount = roundMoney(invoiceSubtotal * (taxRate / 100));
  const invoiceTotal = roundMoney(invoiceSubtotal + taxAmount);
  const preauthRequired = show?.entry_payment_policy === "card_on_file_preauth";
  const marginPercent = preauthRequired && show?.entry_preauth_amount_strategy === "entry_balance_with_margin" ? show.entry_preauth_margin_percent ?? 0 : 0;
  const preauthAmount = preauthRequired ? roundMoney(invoiceTotal * (1 + marginPercent / 100)) : 0;

  return {
    currency,
    entryBaseSubtotal,
    entrySubtotal,
    invoiceSubtotal,
    invoiceTotal,
    judgeFeeTotal,
    lateFeeTotal,
    lines,
    preauthAmount,
    preauthRequired,
    taxAmount,
    taxRate,
  };
}

function entryFeePreview(evaluation: DivisionEvaluation): EntryCheckoutLine["fee"] {
  const base = evaluation.fee ?? 0;
  const closeDate = classEntriesCloseDate(evaluation.classRecord);
  const isLate = Boolean(closeDate && Date.now() > closeDate.getTime());
  const lateFeePercent = isLate ? evaluation.classRecord?.late_entry_fee_percent ?? 50 : 0;
  const lateFee = isLate ? roundMoney(base * (lateFeePercent / 100)) : 0;

  return {
    base,
    isLate,
    lateFee,
    lateFeePercent,
    total: roundMoney(base + lateFee),
  };
}

function buildJudgeFeePreviewLines(lines: EntryCheckoutLine[]) {
  const groups = new Map<string, EntryCheckoutLine[]>();

  for (const line of lines) {
    if (!line.evaluation.classRecord) {
      continue;
    }

    const current = groups.get(line.evaluation.classRecord.id) ?? [];
    current.push(line);
    groups.set(line.evaluation.classRecord.id, current);
  }

  return [...groups.values()]
    .map((group) =>
      [...group].sort((a, b) => b.fee.base - a.fee.base || a.evaluation.division.name.localeCompare(b.evaluation.division.name))[0],
    )
    .filter((line): line is EntryCheckoutLine => Boolean(line && (line.evaluation.division.judge_fee ?? 0) > 0))
    .map((line) => ({
      amount: line.evaluation.division.judge_fee ?? 0,
      line,
    }));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function preauthorizationDetail(preview: EntryCheckoutPreview, show: Show | null, locale: Locale) {
  const preauthTime = showClock(show?.entry_preauth_time, "08:00");
  const settlementTime = showClock(show?.entry_settlement_due_time, "14:00");
  const marginLabel =
    show?.entry_preauth_amount_strategy === "entry_balance_with_margin" && Number(show.entry_preauth_margin_percent ?? 0) > 0
      ? uiText(locale, `Inclut une marge de ${show.entry_preauth_margin_percent}%.`, `Includes a ${show.entry_preauth_margin_percent}% margin.`)
      : uiText(locale, "Montant basé sur le solde estimé.", "Amount based on the estimated balance.");

  return uiText(
    locale,
    `${formatCurrency(preview.preauthAmount, preview.currency)} sera préautorisé vers ${preauthTime}; capture prévue vers ${settlementTime}. ${marginLabel}`,
    `${formatCurrency(preview.preauthAmount, preview.currency)} will be preauthorized around ${preauthTime}; capture is planned around ${settlementTime}. ${marginLabel}`,
  );
}

function showClock(value: string | null | undefined, fallback: string) {
  return (value || fallback).slice(0, 5);
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="entry-profile-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CheckoutFact({ emphasized = false, label, value }: { emphasized?: boolean; label: string; value: string }) {
  return (
    <div className={`entry-checkout-fact${emphasized ? " emphasized" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export { EntryForm };
