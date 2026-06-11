import { useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { EmptyState, Metric, ModalDialog, ViewIntro } from "../../components/ui";
import { contactLabel, errorMessage, findById, formatDate, horseLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { getHorseHealthDocumentFileUrl, createContact, createHorse, createUploadedHorseHealthDocument, reviewHorseHealthDocument, updateHorse, verifyGvlCogginsDocument } from "../../services/supabaseServices";
import { organizationCogginsValidityMonths, organizationRequiresHealthVerification } from "../../lib/health";
import type { Contact, ContactRole, ExternalOrganization, Horse, HorseContact, HorseExternalMembership, HorseHealthDocument, Organization, Show } from "../../types/domain";
import { uiText, cogginsValidityBadgeClass, cogginsValidityTagLabel, cogginsValidityTone, cogginsValidityMessage, healthDocumentDateLabel, healthDocumentDateValue, healthDocumentTypeLabel, healthVerificationSourceLabel, healthReviewNote, isVaccineHealthDocument, latestHorseHealthDocument, latestHorseVaccineDocument, horseHealthDisplay, horseExternalReferenceChips, InlineHealthMessage, horseHealthResultMessage, todayDateValue, buildHealthAlerts, horseHealthStatusLabel } from "../dashboard/shared";
import { HorseEditForm } from "../horses/HorseEditForm";

function HealthCenterView({
  locale,
  canManageHealthDocuments,
  contacts,
  contactRoles,
  createdByUserId,
  externalOrganizations,
  horseContacts,
  horseExternalMemberships,
  horseHealthDocuments,
  horses,
  organization,
  profileId,
  shows,
  onCreateContact,
  onCreateHorseHealthDocument,
  onReviewHorseHealthDocument,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
}: {
  locale: Locale;
  canManageHealthDocuments: boolean;
  contacts: Contact[];
  contactRoles: ContactRole[];
  createdByUserId: string;
  externalOrganizations: ExternalOrganization[];
  horseContacts: HorseContact[];
  horseExternalMemberships: HorseExternalMembership[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  organization: Organization | null;
  profileId: string;
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onReviewHorseHealthDocument: (id: string, input: Parameters<typeof reviewHorseHealthDocument>[1]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
}) {
  const [busyDocumentId, setBusyDocumentId] = useState("");
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);
  const [fileBusyDocumentId, setFileBusyDocumentId] = useState("");
  const [fileErrorDocumentId, setFileErrorDocumentId] = useState("");
  const [fileErrorMessageByDocumentId, setFileErrorMessageByDocumentId] = useState<Record<string, string>>({});
  const [reviewDateByDocumentId, setReviewDateByDocumentId] = useState<Record<string, string>>({});
  const today = todayDateValue();
  const pendingDocuments = [...horseHealthDocuments]
    .filter((document) => document.status === "pending_review")
    .sort((a, b) => healthDocumentDateValue(b).localeCompare(healthDocumentDateValue(a)));
  const upcomingShows = [...shows]
    .filter((show) => show.status !== "archived" && show.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const referenceShow = upcomingShows[0] ?? [...shows].filter((show) => show.status !== "archived").sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ?? null;
  const healthAlerts = buildHealthAlerts({
    documents: horseHealthDocuments,
    horses,
    organization,
    referenceShow,
    today,
  });
  const currentEditingHorse = editingHorse ? findById(horses, editingHorse.id) ?? editingHorse : null;

  async function handleReview(document: HorseHealthDocument, status: Extract<HorseHealthDocument["status"], "approved" | "rejected">) {
    const reviewDate = reviewDateByDocumentId[document.id] ?? document.test_or_administered_on ?? "";

    if (status === "approved" && isVaccineHealthDocument(document) && !reviewDate) {
      return;
    }

    setBusyDocumentId(document.id);

    try {
      await onReviewHorseHealthDocument(document.id, {
        status,
        reviewed_by_user_id: profileId,
        review_notes: healthReviewNote(document, status),
        test_or_administered_on: status === "approved" && isVaccineHealthDocument(document) ? reviewDate || null : undefined,
      });
    } finally {
      setBusyDocumentId("");
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
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Santé", "Health")}
        title={uiText(locale, "Centre de validation", "Validation center")}
        description={uiText(locale, "Traite les documents en révision et surveille les échéances avant les réservations et inscriptions.", "Review health documents and monitor deadlines before reservations and entries.")}
        stats={[
          { label: uiText(locale, "À valider", "To review"), value: String(pendingDocuments.length) },
          { label: uiText(locale, "Alertes", "Alerts"), value: String(healthAlerts.length) },
          { label: uiText(locale, "Chevaux", "Horses"), value: String(horses.length) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric detail={uiText(locale, "Documents en attente d'un gestionnaire.", "Documents waiting for a manager review.")} label={uiText(locale, "À valider", "To review")} value={String(pendingDocuments.length)} />
        <Metric detail={referenceShow ? `${uiText(locale, "Référence", "Reference")}: ${referenceShow.name}` : uiText(locale, "Aucun concours actif.", "No active show.")} label={uiText(locale, "Échéances", "Deadlines")} value={String(healthAlerts.length)} />
        <Metric detail={organizationRequiresHealthVerification(organization) ? uiText(locale, "Coggins et vaccin obligatoires.", "Coggins and vaccine required.") : uiText(locale, "Vérification désactivée.", "Verification disabled.")} label={uiText(locale, "Règle santé", "Health rule")} value={`${organizationCogginsValidityMonths(organization)} ${uiText(locale, "mois", "months")}`} />
      </section>

      {currentEditingHorse ? (
        <div className="modal-backdrop">
          <section aria-labelledby="health-horse-edit-title" aria-modal="true" className="assistant-modal health-horse-modal" role="dialog">
            <div className="assistant-modal-header">
              <div>
                <p className="eyebrow">{uiText(locale, "Santé", "Health")}</p>
                <h2 id="health-horse-edit-title">{uiText(locale, "Modifier le cheval", "Edit horse")}</h2>
                <p>{uiText(locale, "Corrige la fiche, puis relance la validation GVL au besoin.", "Correct the record, then rerun GVL validation if needed.")}</p>
              </div>
              <button className="icon-button" type="button" aria-label={uiText(locale, "Fermer l'édition du cheval", "Close horse editor")} onClick={() => setEditingHorse(null)}>
                <X size={18} />
              </button>
            </div>
            <HorseEditForm
              locale={locale}
              canManageHealthDocuments={canManageHealthDocuments}
              contacts={contacts}
              contactRoles={contactRoles}
              createdByUserId={createdByUserId}
              externalOrganizations={externalOrganizations}
              horse={currentEditingHorse}
              horseContacts={horseContacts}
              horseExternalMemberships={horseExternalMemberships}
              horseHealthDocuments={horseHealthDocuments}
              organization={organization}
              onCancel={() => setEditingHorse(null)}
              onCreateContact={onCreateContact}
              onCreateHorseHealthDocument={onCreateHorseHealthDocument}
              onReviewHorseHealthDocument={onReviewHorseHealthDocument}
              onUpdateHorse={async (id, input) => {
                await onUpdateHorse(id, input);
                setEditingHorse(null);
              }}
              onVerifyGvlCogginsDocument={onVerifyGvlCogginsDocument}
            />
          </section>
        </div>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Documents à valider", "Documents to review")}</h2>
            <p>{pendingDocuments.length ? uiText(locale, `${pendingDocuments.length} document${pendingDocuments.length === 1 ? "" : "s"} en attente.`, `${pendingDocuments.length} document${pendingDocuments.length === 1 ? "" : "s"} pending.`) : uiText(locale, "Aucun document en révision manuelle.", "No documents in manual review.")}</p>
          </div>
        </div>
        <div className="table health-review-table">
          <div className="table-row table-head">
            <span>Document</span>
            <span>{uiText(locale, "Cheval", "Horse")}</span>
            <span>Source</span>
            <span>Action</span>
          </div>
          {pendingDocuments.map((document) => {
            const horse = findById(horses, document.horse_id);
            const owner = findById(contacts, horse?.primary_owner_contact_id);
            const busy = busyDocumentId === document.id;
            const reviewDate = reviewDateByDocumentId[document.id] ?? document.test_or_administered_on ?? "";
            const needsReviewDate = isVaccineHealthDocument(document);

            return (
              <div className="table-row" key={document.id}>
              <div>
                  <strong>{healthDocumentTypeLabel(document.document_type, locale)}</strong>
                  <span className="muted-line">
                    {healthDocumentDateLabel(document, locale)}
                    {document.result ? ` - ${document.result}` : ""}
                  </span>
                  {document.review_notes ? <span className="muted-line">{document.review_notes}</span> : null}
                  {needsReviewDate ? (
                    <label className="compact-label">
                      {uiText(locale, "Date vaccin validée", "Validated vaccine date")}
                      <input
                        type="date"
                        value={reviewDate}
                        onChange={(event) =>
                          setReviewDateByDocumentId((current) => ({
                            ...current,
                            [document.id]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </div>
                <div>
                  <strong>{horseLabel(horse)}</strong>
                  <span className="muted-line">{contactLabel(owner)}</span>
                  {document.horse_name ? (
                    <span className="muted-line">
                      Doc: {document.horse_name}
                      {document.horse_date_of_birth ? ` - ${formatDate(document.horse_date_of_birth)}` : ""}
                    </span>
                  ) : null}
                </div>
                <div>
                  <span className={`badge ${document.status}`}>{horseHealthStatusLabel(document.status, locale)}</span>
                  <span className="muted-line">{healthVerificationSourceLabel(document.verification_source, locale)}</span>
                  {document.warnings.length ? <span className="muted-line">{document.warnings.join(", ")}</span> : null}
                </div>
                <div className="row-actions">
                  {horse ? (
                    <button className="text-button" type="button" onClick={() => setEditingHorse(horse)}>
                      {uiText(locale, "Modifier le cheval", "Edit horse")}
                    </button>
                  ) : null}
                  {document.source_url ? (
                    <a className="text-button" href={document.source_url} rel="noreferrer" target="_blank">
                      Lien GVL
                    </a>
                  ) : null}
                  {document.document_url ? (
                    <button className="text-button" disabled={fileBusyDocumentId === document.id} type="button" onClick={() => void handleOpenStoredDocument(document)}>
                      {fileBusyDocumentId === document.id ? "Ouverture..." : "PDF"}
                    </button>
                  ) : null}
                  <button className="text-button" disabled={busy || (needsReviewDate && !reviewDate)} type="button" onClick={() => void handleReview(document, "approved")}>
                    {uiText(locale, "Approuver", "Approve")}
                  </button>
                  <button className="text-button danger-text" disabled={busy} type="button" onClick={() => void handleReview(document, "rejected")}>
                    {uiText(locale, "Refuser", "Reject")}
                  </button>
                  {fileErrorDocumentId === document.id ? <span className="muted-line">{uiText(locale, "Impossible d'ouvrir le fichier", "Unable to open file")}: {fileErrorMessageByDocumentId[document.id] || uiText(locale, "accès refusé.", "access denied.")}</span> : null}
                </div>
              </div>
            );
          })}
          {!pendingDocuments.length ? <EmptyState label={uiText(locale, "Aucun document santé en attente de validation.", "No health documents awaiting review.")} /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Échéances santé", "Health deadlines")}</h2>
            <p>{referenceShow ? uiText(locale, `Calculées avec la date d'arrivée du concours ${referenceShow.name}.`, `Calculated from the arrival date for ${referenceShow.name}.`) : uiText(locale, "Crée un concours pour calculer les échéances par date d'arrivée.", "Create a show to calculate deadlines from arrival dates.")}</p>
          </div>
        </div>
        <div className="table health-alert-table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Cheval", "Horse")}</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>{uiText(locale, "Référence", "Reference")}</span>
            <span>Action</span>
          </div>
          {healthAlerts.map((alert) => (
            <div className="table-row" key={alert.key}>
              <div>
                <strong>{alert.horse.name}</strong>
                <span className="muted-line">{contactLabel(findById(contacts, alert.horse.primary_owner_contact_id))}</span>
              </div>
              <div>
                <span className={`badge ${alert.tone}`}>{alert.label}</span>
                <span className="muted-line">{alert.detail}</span>
              </div>
              <span>{alert.referenceLabel}</span>
              <div className="row-actions">
                <button className="text-button" type="button" onClick={() => setEditingHorse(alert.horse)}>
                  {uiText(locale, "Modifier le cheval", "Edit horse")}
                </button>
              </div>
            </div>
          ))}
          {!healthAlerts.length ? <EmptyState label={uiText(locale, "Aucune échéance santé à surveiller pour l'instant.", "No health deadlines to watch right now.")} /> : null}
        </div>
      </section>
    </div>
  );
}

export { HealthCenterView };
