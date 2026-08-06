import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { EmptyState, ModalDialog, NoticeBanner, ViewIntro } from "../../components/ui";
import { contactLabel, errorMessage, findById, formatCurrency, horseLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createContact, createHorse, createUploadedHorseHealthDocument, deleteHorse, purchaseIncentiveProgramNomination, updateHorse, verifyGvlCogginsDocument, verifyNrhaHorse } from "../../services/supabaseServices";
import type { Contact, ContactRole, ExternalCredentialIssuer, Horse, HorseContact, HorseExternalIdentifier, HorseHealthDocument, IncentiveProgram, IncentiveProgramNomination, Organization, OrganizationExternalCredentialRequirement } from "../../types/domain";
import type { Notice } from "../../types/ui";
import { uiText, horseExternalReferenceChips, horseGenderLabel, todayDateValue } from "../dashboard/shared";
import { healthComplianceStatusLabel, healthComplianceTone, HorseAssociationComplianceGroups, useHorseHealthComplianceOverview } from "../health/HealthComplianceSummary";
import { HorseForm } from "./HorseForm";
import { HorseEditForm } from "./HorseEditForm";
import { incentiveProgramName, incentiveProgramTypeLabel, nominationRoleLabel, nominationStatusLabel, programUsesStallion } from "../programs/programLabels";

function MyHorsesView({
  locale,
  contacts,
  contactRoles,
  externalCredentialIssuers,
  membershipRequirements = [],
  horses,
  horseExternalIdentifiers,
  horseHealthDocuments,
  horseContacts,
  incentivePrograms = [],
  incentiveProgramNominations = [],
  payerContacts = [],
  programHorses = horses,
  healthComplianceRevision,
  organization,
  profileId,
  onCreateContact,
  onCreateHorse,
  onCreateHorseHealthDocument,
  onDeleteHorse,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaHorse,
  onRefresh,
}: {
  locale: Locale;
  contacts: Contact[];
  contactRoles: ContactRole[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  membershipRequirements?: OrganizationExternalCredentialRequirement[];
  horses: Horse[];
  horseExternalIdentifiers: HorseExternalIdentifier[];
  horseHealthDocuments: HorseHealthDocument[];
  horseContacts: HorseContact[];
  incentivePrograms?: IncentiveProgram[];
  incentiveProgramNominations?: IncentiveProgramNomination[];
  payerContacts?: Contact[];
  programHorses?: Horse[];
  healthComplianceRevision?: string;
  organization: Organization | null;
  profileId: string;
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorse: (input: Parameters<typeof createHorse>[0]) => Promise<Horse>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onDeleteHorse: (id: Parameters<typeof deleteHorse>[0]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
  onRefresh?: () => Promise<void> | void;
}) {
  const [creatingHorse, setCreatingHorse] = useState(false);
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);
  const activePrograms = incentivePrograms.filter((program) => program.is_active && program.organization_id === organization?.id);
  const [purchaseProgramId, setPurchaseProgramId] = useState(activePrograms[0]?.id ?? "");
  const [purchaseHorseId, setPurchaseHorseId] = useState("");
  const [purchasePayerId, setPurchasePayerId] = useState("");
  const [purchaseRole, setPurchaseRole] = useState<IncentiveProgramNomination["nomination_role"]>("horse");
  const [purchaseSeason, setPurchaseSeason] = useState(String(new Date().getFullYear()));
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [purchaseNotice, setPurchaseNotice] = useState<Notice | null>(null);
  const purchaseProgram = activePrograms.find((program) => program.id === purchaseProgramId) ?? null;
  const availablePurchaseRoles: IncentiveProgramNomination["nomination_role"][] = purchaseProgram && programUsesStallion(purchaseProgram)
    ? ["stallion", "foal"]
    : purchaseProgram?.program_type === "horse_foal_nomination"
      ? ["horse", "foal"]
      : ["horse"];
  useEffect(() => {
    if (!activePrograms.some((program) => program.id === purchaseProgramId)) {
      setPurchaseProgramId(activePrograms[0]?.id ?? "");
    }
  }, [activePrograms, purchaseProgramId]);
  const healthCompliance = useHorseHealthComplianceOverview({
    horseIds: horses.map((horse) => horse.id),
    referenceDate: todayDateValue(),
    refreshToken: healthComplianceRevision,
  });

  async function handleDeleteHorse(horse: Horse) {
    if (!window.confirm(uiText(locale, `Supprimer ${horse.name} et les inscriptions/réservations liées?`, `Delete ${horse.name} and linked entries/reservations?`))) {
      return;
    }

    await onDeleteHorse(horse.id);
    if (editingHorse?.id === horse.id) {
      setEditingHorse(null);
    }
  }

  async function handleNominationPurchase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!purchaseProgram || !purchaseHorseId || !purchasePayerId) return;
    setPurchaseBusy(true);
    setPurchaseNotice(null);
    try {
      const nomination = await purchaseIncentiveProgramNomination({
        incentive_program_id: purchaseProgram.id,
        horse_id: purchaseHorseId,
        payer_contact_id: purchasePayerId,
        nomination_role: availablePurchaseRoles.includes(purchaseRole) ? purchaseRole : availablePurchaseRoles[0],
        season_year: Number(purchaseSeason) || new Date().getFullYear(),
      });
      setPurchaseNotice({
        tone: "success",
        message: nomination.status === "active"
          ? uiText(locale, "Nomination active.", "Nomination active.")
          : uiText(locale, "Nomination créée. La facture se trouve dans Mes factures; une validation peut rester requise pour la progéniture d’un étalon.", "Nomination created. The invoice is in My invoices; stallion offspring may still require validation."),
      });
      await onRefresh?.();
    } catch (error) {
      setPurchaseNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setPurchaseBusy(false);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Mon espace", "My space")}
        title={uiText(locale, "Mes chevaux", "My horses")}
        description={uiText(locale, "Gère les chevaux liés à ton profil avant de les inscrire à un concours.", "Manage horses linked to your profile before entering them in a show.")}
        stats={[
          { label: uiText(locale, "Chevaux", "Horses"), value: String(horses.length) },
          { label: "Contacts", value: String(contacts.length) },
        ]}
      />

      <section className="panel span-2 form-launch-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Ajouter un cheval", "Add horse")}</h2>
            <p>{uiText(locale, "Ajoute ses infos, ses contacts et ses documents santé sans sortir de cette page.", "Add details, contacts and health documents without leaving this page.")}</p>
          </div>
          <button className="primary-button" disabled={!organization} type="button" onClick={() => setCreatingHorse(true)}>
            <Plus size={18} />
            {uiText(locale, "Cheval", "Horse")}
          </button>
        </div>
      </section>

      {activePrograms.length ? <section className="panel span-2">
        <div className="panel-header"><div><h2>{uiText(locale, "Acheter une nomination", "Buy a nomination")}</h2><p>{uiText(locale, "Choisis un programme facultatif pour l’un de tes chevaux. Une nomination payante crée une facture brouillon.", "Choose an optional program for one of your horses. A paid nomination creates a draft invoice.")}</p></div></div>
        {purchaseNotice ? <NoticeBanner notice={purchaseNotice} /> : null}
        <form className="stack" onSubmit={handleNominationPurchase}>
          <div className="form-grid">
            <label>{uiText(locale, "Programme", "Program")}<select required value={purchaseProgramId} onChange={(event) => { const programId = event.target.value; const program = activePrograms.find((candidate) => candidate.id === programId); setPurchaseProgramId(programId); setPurchaseRole(program && programUsesStallion(program) ? "stallion" : "horse"); }}>{activePrograms.map((program) => <option key={program.id} value={program.id}>{`${incentiveProgramName(program, locale)} · ${formatCurrency(program.nomination_fee, organization?.currency ?? "CAD")}`}</option>)}</select>{purchaseProgram ? <span className="input-help">{incentiveProgramTypeLabel(purchaseProgram.program_type, locale)}</span> : null}</label>
            <label>{uiText(locale, "Cheval", "Horse")}<select required value={purchaseHorseId} onChange={(event) => setPurchaseHorseId(event.target.value)}><option value="">{uiText(locale, "Choisir", "Choose")}</option>{programHorses.map((horse) => <option key={horse.id} value={horse.id}>{horse.name}</option>)}</select></label>
            <label>{uiText(locale, "Payeur", "Payer")}<select required value={purchasePayerId} onChange={(event) => setPurchasePayerId(event.target.value)}><option value="">{uiText(locale, "Choisir", "Choose")}</option>{payerContacts.map((contact) => <option key={contact.id} value={contact.id}>{contactLabel(contact)}</option>)}</select></label>
            <label>{uiText(locale, "Rôle", "Role")}<select value={availablePurchaseRoles.includes(purchaseRole) ? purchaseRole : availablePurchaseRoles[0]} onChange={(event) => setPurchaseRole(event.target.value as IncentiveProgramNomination["nomination_role"])}>{availablePurchaseRoles.map((role) => <option key={role} value={role}>{nominationRoleLabel(role, locale)}</option>)}</select></label>
            <label>{uiText(locale, "Saison", "Season")}<input min="1900" required type="number" value={purchaseSeason} onChange={(event) => setPurchaseSeason(event.target.value)} /></label>
          </div>
          {purchaseProgram && programUsesStallion(purchaseProgram) && purchaseRole === "foal" ? <p className="muted-line">{uiText(locale, "La nomination restera en attente jusqu’à ce que l’association confirme l’étalon admissible.", "The nomination remains pending until the association confirms the qualifying stallion.")}</p> : null}
          <button className="primary-button" disabled={purchaseBusy || !purchaseHorseId || !purchasePayerId} type="submit">{purchaseBusy ? uiText(locale, "Création...", "Creating...") : uiText(locale, "Créer la nomination", "Create nomination")}</button>
        </form>
        <div className="requirement-list">
          {incentiveProgramNominations.filter((nomination) => programHorses.some((horse) => horse.id === nomination.horse_id)).map((nomination) => {
            const program = incentivePrograms.find((candidate) => candidate.id === nomination.incentive_program_id);
            return <div className="membership-type-row" key={nomination.id}><span className="membership-type-main"><strong>{horses.find((horse) => horse.id === nomination.horse_id)?.name}</strong>{`${program ? incentiveProgramName(program, locale) : uiText(locale, "Programme", "Program")} · ${nomination.season_year}`}</span><small>{nominationStatusLabel(nomination.status, locale)}</small></div>;
          })}
        </div>
      </section> : null}

      {creatingHorse ? (
        <ModalDialog description={uiText(locale, "Ajoute le cheval à ton profil et complète les documents requis.", "Add the horse to your profile and complete required documents.")} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Nouveau cheval", "New horse")} onClose={() => setCreatingHorse(false)}>
          <HorseForm
            locale={locale}
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            externalCredentialIssuers={externalCredentialIssuers}
            membershipRequirements={membershipRequirements}
            organization={organization}
            onCreateContact={onCreateContact}
            onCreateHorse={onCreateHorse}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onVerifyNrhaHorse={onVerifyNrhaHorse}
            onCreated={() => setCreatingHorse(false)}
          />
        </ModalDialog>
      ) : null}

      {editingHorse ? (
        <ModalDialog className="horse-form-modal" description={editingHorse.name} eyebrow={uiText(locale, "Mon espace", "My space")} title={uiText(locale, "Modifier le cheval", "Edit horse")} onClose={() => setEditingHorse(null)}>
          <HorseEditForm
            locale={locale}
            contacts={contacts}
            contactRoles={contactRoles}
            createdByUserId={profileId}
            externalCredentialIssuers={externalCredentialIssuers}
            membershipRequirements={membershipRequirements}
            horseExternalIdentifiers={horseExternalIdentifiers}
            horseHealthDocuments={horseHealthDocuments}
            horseContacts={horseContacts}
            organization={organization}
            horse={editingHorse}
            onCancel={() => setEditingHorse(null)}
            onCreateContact={onCreateContact}
            onCreateHorseHealthDocument={onCreateHorseHealthDocument}
            onUpdateHorse={async (id, input) => {
              await onUpdateHorse(id, input);
              setEditingHorse(null);
            }}
            onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            onVerifyNrhaHorse={onVerifyNrhaHorse}
          />
        </ModalDialog>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Mes chevaux", "My horses")}</h2>
            <p>{uiText(locale, "Chevaux liés à mon profil utilisateur.", "Horses linked to my user profile.")}</p>
          </div>
        </div>
        <div className="horse-list">
          <div className="horse-list-row horse-list-head">
            <span>{uiText(locale, "Cheval", "Horse")}</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>{uiText(locale, "Références", "References")}</span>
            <span>Action</span>
          </div>
          {horses.map((horse) => {
            const associationResults = healthCompliance.results.filter((result) => result.horse_id === horse.id);
            const summaryStatus = associationResults.some((result) => result.compliance_status === "non_compliant")
              ? "non_compliant"
              : associationResults.some((result) => result.compliance_status === "pending_review")
                ? "pending_review"
                : associationResults.length
                  ? "compliant"
                  : null;
            const summaryTone = summaryStatus ? healthComplianceTone(summaryStatus) : "neutral";
            const referenceChips = horseExternalReferenceChips(horse, horseExternalIdentifiers, externalCredentialIssuers);

            return (
              <div className={`horse-list-row ${summaryTone}`} key={horse.id}>
                <div className="horse-list-identity">
                  <strong>{horse.name}</strong>
                  <span>
                    {contactLabel(findById(contacts, horse.primary_owner_contact_id))} · {horseGenderLabel(horse.gender)}
                  </span>
                  {horse.sire_name || horse.dam_name ? (
                    <span>
                      {[horse.sire_name ? `${uiText(locale, "Père", "Sire")}: ${horse.sire_name}` : null, horse.dam_name ? `${uiText(locale, "Mère", "Dam")}: ${horse.dam_name}` : null].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </div>
                <div className="horse-list-status">
                  <span className={`horse-summary-pill ${summaryTone}`}>
                    {healthCompliance.loading
                      ? uiText(locale, "Calcul en cours", "Calculating")
                      : healthCompliance.error
                        ? uiText(locale, "Statut indisponible", "Status unavailable")
                        : summaryStatus
                          ? healthComplianceStatusLabel(summaryStatus, locale)
                          : uiText(locale, "Aucune association liée", "No linked association")}
                  </span>
                  {healthCompliance.error ? <span className="muted-line">{healthCompliance.error}</span> : null}
                  {!healthCompliance.loading && !healthCompliance.error ? (
                    <HorseAssociationComplianceGroups locale={locale} results={associationResults} />
                  ) : null}
                </div>
                <div className="horse-chip-row reference-chip-row">
                  {referenceChips.map((chip) => (
                    <span className={`horse-status-chip ${chip.tone}`} key={`${horse.id}-${chip.label}-${chip.value}`}>
                      <span>{chip.label}</span>
                      <strong>{chip.value}</strong>
                    </span>
                  ))}
                </div>
                <div className="row-actions horse-row-actions">
                  <button className="text-button" type="button" onClick={() => setEditingHorse(horse)}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="text-button danger-text" type="button" onClick={() => handleDeleteHorse(horse)}>
                    {uiText(locale, "Supprimer", "Delete")}
                  </button>
                </div>
              </div>
            );
          })}
          {!horses.length ? <EmptyState label={uiText(locale, "Aucun cheval lié à ton profil pour l'instant.", "No horse linked to your profile yet.")} /> : null}
        </div>
      </section>
    </div>
  );
}

export { MyHorsesView };
