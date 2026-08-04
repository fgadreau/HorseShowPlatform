import { useState } from "react";
import { X } from "lucide-react";
import { EmptyState, Metric, ViewIntro } from "../../components/ui";
import { contactLabel, findById, formatDate, horseLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { createContact, createOrganizationHealthDocumentReview, createUploadedHorseHealthDocument, updateHorse, verifyGvlCogginsDocument, verifyNrhaHorse } from "../../services/supabaseServices";
import type { Contact, ContactRole, ExternalCredentialIssuer, Horse, HorseContact, HorseExternalIdentifier, HorseHealthComplianceOverview, HorseHealthDocument, Organization, Show } from "../../types/domain";
import { uiText, todayDateValue } from "../dashboard/shared";
import { HorseEditForm } from "../horses/HorseEditForm";
import { healthComplianceReasonSummary, healthComplianceStatusLabel, healthComplianceTone, useHorseHealthComplianceOverview } from "./HealthComplianceSummary";

function HealthCenterView({
  locale,
  canManageHealthDocuments,
  complianceRevision,
  contacts,
  contactRoles,
  createdByUserId,
  externalCredentialIssuers,
  horseContacts,
  horseExternalIdentifiers,
  horseHealthDocuments,
  horses,
  organization,
  shows,
  onCreateContact,
  onCreateHorseHealthDocument,
  onReviewOrganizationHealthDocuments,
  onUpdateHorse,
  onVerifyGvlCogginsDocument,
  onVerifyNrhaHorse,
}: {
  locale: Locale;
  canManageHealthDocuments: boolean;
  complianceRevision?: string;
  contacts: Contact[];
  contactRoles: ContactRole[];
  createdByUserId: string;
  externalCredentialIssuers: ExternalCredentialIssuer[];
  horseContacts: HorseContact[];
  horseExternalIdentifiers: HorseExternalIdentifier[];
  horseHealthDocuments: HorseHealthDocument[];
  horses: Horse[];
  organization: Organization | null;
  shows: Show[];
  onCreateContact: (input: Parameters<typeof createContact>[0]) => Promise<Contact>;
  onCreateHorseHealthDocument: (input: Parameters<typeof createUploadedHorseHealthDocument>[0]) => Promise<HorseHealthDocument>;
  onReviewOrganizationHealthDocuments: (inputs: Parameters<typeof createOrganizationHealthDocumentReview>[0][]) => Promise<void>;
  onUpdateHorse: (id: string, input: Parameters<typeof updateHorse>[1]) => Promise<void>;
  onVerifyGvlCogginsDocument: (input: Parameters<typeof verifyGvlCogginsDocument>[0]) => Promise<HorseHealthDocument>;
  onVerifyNrhaHorse: (input: Parameters<typeof verifyNrhaHorse>[0]) => Promise<Awaited<ReturnType<typeof verifyNrhaHorse>>>;
}) {
  const [editingHorse, setEditingHorse] = useState<Horse | null>(null);
  const [busyReviewKey, setBusyReviewKey] = useState("");
  const today = todayDateValue();
  const upcomingShows = [...shows]
    .filter((show) => show.status !== "archived" && show.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const referenceShow = upcomingShows[0] ?? null;
  const referenceDate = referenceShow?.start_date ?? today;
  const compliance = useHorseHealthComplianceOverview({
    horseIds: horses.map((horse) => horse.id),
    organizationId: organization?.id,
    referenceDate,
    refreshToken: complianceRevision,
  });
  const currentEditingHorse = editingHorse ? findById(horses, editingHorse.id) ?? editingHorse : null;
  const currentResults = compliance.results.filter((result) => result.compliance_status === "compliant" || result.compliance_status === "not_required");
  const pendingResults = compliance.results.filter((result) => result.compliance_status === "pending_review");
  const requiredResults = compliance.results.filter((result) => result.compliance_status === "non_compliant");
  const groups = [
    {
      key: "current",
      title: uiText(locale, "À jour", "Up to date"),
      description: uiText(locale, "Toutes les exigences de l'association sont satisfaites.", "All association requirements are satisfied."),
      tone: "success" as const,
      results: currentResults,
    },
    {
      key: "pending",
      title: uiText(locale, "En attente", "Pending"),
      description: uiText(locale, "Une identification ou une révision doit être complétée.", "An identification or review still needs completion."),
      tone: "warning" as const,
      results: pendingResults,
    },
    {
      key: "required",
      title: uiText(locale, "Mise à jour requise", "Update required"),
      description: uiText(locale, "Un document est manquant, expiré, différent ou refusé.", "A document is missing, expired, mismatched, or rejected."),
      tone: "error" as const,
      results: requiredResults,
    },
  ];

  function reviewableDocumentIds(result: HorseHealthComplianceOverview) {
    return [...new Set(
      Object.values(result.requirements)
        .filter((requirement) => requirement.document_id && (requirement.status === "review_pending" || requirement.status === "review_rejected"))
        .map((requirement) => requirement.document_id as string),
    )];
  }

  async function handleAssociationReview(result: HorseHealthComplianceOverview, status: "approved" | "rejected") {
    const documentIds = reviewableDocumentIds(result);
    if (!organization || !documentIds.length) {
      return;
    }

    const reviewKey = `${result.horse_id}:${status}`;
    setBusyReviewKey(reviewKey);
    try {
      await onReviewOrganizationHealthDocuments(documentIds.map((horseDocumentId) => ({
        organization_id: organization.id,
        horse_document_id: horseDocumentId,
        status,
        review_notes: status === "approved"
          ? uiText(locale, "Document accepté par l'association.", "Document accepted by the association.")
          : uiText(locale, "Mise à jour demandée par l'association.", "Update requested by the association."),
      })));
    } finally {
      setBusyReviewKey("");
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Santé", "Health")}
        title={uiText(locale, "Centre de conformité", "Compliance center")}
        description={uiText(locale, "Consulte la conformité calculée pour chaque cheval selon la politique de l'association et la date choisie.", "Review calculated compliance for every horse using the association policy and reference date.")}
        stats={[
          { label: uiText(locale, "À jour", "Up to date"), value: compliance.loading ? "…" : String(currentResults.length) },
          { label: uiText(locale, "En attente", "Pending"), value: compliance.loading ? "…" : String(pendingResults.length) },
          { label: uiText(locale, "À mettre à jour", "Needs update"), value: compliance.loading ? "…" : String(requiredResults.length) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric detail={uiText(locale, "Documents valides ou non requis.", "Documents valid or not required.")} label={uiText(locale, "À jour", "Up to date")} value={compliance.loading ? "…" : String(currentResults.length)} />
        <Metric detail={uiText(locale, "Identification ou révision locale.", "Identity or local review pending.")} label={uiText(locale, "En attente", "Pending")} value={compliance.loading ? "…" : String(pendingResults.length)} />
        <Metric detail={referenceShow ? `${referenceShow.name} · ${formatDate(referenceDate)}` : formatDate(referenceDate)} label={uiText(locale, "Date de référence", "Reference date")} value={compliance.loading ? "…" : String(requiredResults.length)} />
      </section>

      {currentEditingHorse ? (
        <div className="modal-backdrop">
          <section aria-labelledby="health-horse-edit-title" aria-modal="true" className="assistant-modal health-horse-modal" role="dialog">
            <div className="assistant-modal-header">
              <div>
                <p className="eyebrow">{uiText(locale, "Santé", "Health")}</p>
                <h2 id="health-horse-edit-title">{uiText(locale, "Modifier le cheval", "Edit horse")}</h2>
                <p>{uiText(locale, "Ajoute ou identifie les documents indiqués dans les raisons de conformité.", "Add or identify the documents listed in the compliance reasons.")}</p>
              </div>
              <button className="icon-button" type="button" aria-label={uiText(locale, "Fermer l'édition du cheval", "Close horse editor")} onClick={() => setEditingHorse(null)}>
                <X size={18} />
              </button>
            </div>
            <HorseEditForm
              locale={locale}
              contacts={contacts}
              contactRoles={contactRoles}
              createdByUserId={createdByUserId}
              externalCredentialIssuers={externalCredentialIssuers}
              horse={currentEditingHorse}
              horseContacts={horseContacts}
              horseExternalIdentifiers={horseExternalIdentifiers}
              horseHealthDocuments={horseHealthDocuments}
              organization={organization}
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
          </section>
        </div>
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Conformité par cheval", "Compliance by horse")}</h2>
            <p>
              {referenceShow
                ? uiText(locale, `Évaluée au ${formatDate(referenceDate)} pour ${referenceShow.name}.`, `Evaluated on ${formatDate(referenceDate)} for ${referenceShow.name}.`)
                : uiText(locale, `Évaluée aujourd'hui, le ${formatDate(referenceDate)}.`, `Evaluated today, ${formatDate(referenceDate)}.`)}
            </p>
          </div>
        </div>

        {compliance.error ? <div className="notice error">{compliance.error}</div> : null}
        {compliance.loading ? <EmptyState label={uiText(locale, "Calcul de la conformité en cours…", "Calculating compliance…")} /> : null}

        {!compliance.loading && !compliance.error ? (
          <div className="health-compliance-board">
            {groups.map((group) => (
              <section className={`health-compliance-group ${group.tone}`} key={group.key}>
                <header>
                  <div>
                    <h3>{group.title}</h3>
                    <p>{group.description}</p>
                  </div>
                  <strong>{group.results.length}</strong>
                </header>
                <div className="health-compliance-rows">
                  {group.results.map((result) => {
                    const horse = findById(horses, result.horse_id);
                    const owner = findById(contacts, horse?.primary_owner_contact_id);
                    const reviewableIds = reviewableDocumentIds(result);
                    const hasPendingReview = Object.values(result.requirements).some((requirement) => requirement.status === "review_pending");
                    const reviewBusy = busyReviewKey.startsWith(`${result.horse_id}:`);

                    return (
                      <article className={`health-compliance-row ${healthComplianceTone(result.compliance_status)}`} key={`${result.horse_id}:${result.organization_id}`}>
                        <div className="horse-list-identity">
                          <strong>{horseLabel(horse)}</strong>
                          <span>{contactLabel(owner)}</span>
                        </div>
                        <div className="horse-list-status">
                          <span className={`horse-summary-pill ${healthComplianceTone(result.compliance_status)}`}>{healthComplianceStatusLabel(result.compliance_status, locale)}</span>
                          <span className="muted-line">{healthComplianceReasonSummary(result, locale)}</span>
                          {!result.can_proceed ? <span className="muted-line strong-line">{uiText(locale, "La politique bloque la poursuite.", "The policy blocks proceeding.")}</span> : null}
                        </div>
                        <div className="row-actions">
                          {horse ? (
                            <button className="text-button" type="button" onClick={() => setEditingHorse(horse)}>
                              {uiText(locale, "Voir le cheval", "View horse")}
                            </button>
                          ) : null}
                          {canManageHealthDocuments && reviewableIds.length ? (
                            <button className="text-button" disabled={reviewBusy} type="button" onClick={() => void handleAssociationReview(result, "approved")}>
                              {uiText(locale, "Accepter pour l'association", "Accept for association")}
                            </button>
                          ) : null}
                          {canManageHealthDocuments && hasPendingReview ? (
                            <button className="text-button danger-text" disabled={reviewBusy} type="button" onClick={() => void handleAssociationReview(result, "rejected")}>
                              {uiText(locale, "Demander une mise à jour", "Request update")}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                  {!group.results.length ? <EmptyState label={uiText(locale, "Aucun cheval dans ce groupe.", "No horse in this group.")} /> : null}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export { HealthCenterView };
