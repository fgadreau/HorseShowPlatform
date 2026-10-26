import { useEffect, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { ModalDialog } from "../../components/ui";
import { contactLabel, errorMessage, formatDate } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { Contact, ExternalCredentialIssuer, Horse, HorseExternalIdentifier, HorseHealthComplianceOverview, HorseHealthDocument, OrganizationHealthDocumentReview } from "../../types/domain";
import { getHorseHealthDocumentFileUrl, reviewVaccinationDocument, reviewCogginsDocument } from "../../services/supabaseServices";
import { HorseReviewSummary } from "./HorseReviewSummary";
import { healthDocumentTypeLabel, matchesDirectorySearch, normalizeDirectorySearch, todayDateValue, uiText } from "../dashboard/shared";

export function VaccinationReviewQueue({ locale, organizationId, horses, documents, reviews, onReviewed, kind = "vaccination", contacts = [], identifiers = [], issuers = [], compliance = [] }: {
  locale: Locale; organizationId: string; horses: Horse[]; documents: HorseHealthDocument[];
  kind?: "vaccination" | "coggins"; contacts?: Contact[]; identifiers?: HorseExternalIdentifier[]; issuers?: ExternalCredentialIssuer[];
  reviews: OrganizationHealthDocumentReview[]; onReviewed: () => Promise<void> | void;
  compliance?: HorseHealthComplianceOverview[];
}) {
  const isCoggins = kind === "coggins";
  const [reason, setReason] = useState("");
  const [selected, setSelected] = useState<HorseHealthDocument | null>(null);
  const [administeredOn, setAdministeredOn] = useState("");
  const [localDates, setLocalDates] = useState<Record<string, string>>({});
  const [showDecisions, setShowDecisions] = useState(false);
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(4);
  const [fileUrl, setFileUrl] = useState("");
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [localDecisions, setLocalDecisions] = useState<Record<string, "approved" | "rejected">>({});
  const selectedPath = selected?.document_url;
  useEffect(() => {
    let cancelled = false;
    setFileUrl(""); setFileError("");
    if (selectedPath) void getHorseHealthDocumentFileUrl(selectedPath).then(url => {
      if (!cancelled) setFileUrl(url);
    }).catch(error => { if (!cancelled) setFileError(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [selectedPath]);

  function latestReview(id: string) {
    return reviews.filter(review => review.organization_id === organizationId && review.horse_document_id === id)
      .sort((a, b) => b.version - a.version)[0];
  }
  function decisionKey(document: HorseHealthDocument) { return isCoggins ? `${document.id}:${document.updated_at}` : document.id; }
  function decision(id: string) {
    const document = documents.find(item => item.id === id);
    const review = latestReview(id);
    // Legacy association approvals remain effective in the compliance evaluator.
    // Version-bound Coggins overrides must still match the current certificate.
    const current = !isCoggins || review?.status === "rejected" || review?.review_method !== "manual_coggins" || review.coggins_document_updated_at === document?.updated_at;
    return (document ? localDecisions[decisionKey(document)] : undefined) ?? (current ? review?.status : undefined);
  }
  function acceptedAutomatically(document: HorseHealthDocument) {
    if (!isCoggins || document.status !== "verified" || decision(document.id)) return false;
    return compliance.some(result => result.organization_id === organizationId && result.horse_id === document.horse_id
      && result.requirements.coggins.status === "valid" && result.requirements.coggins.document_id === document.id);
  }
  function documentActivity(document: HorseHealthDocument) {
    return Math.max(Date.parse(latestReview(document.id)?.reviewed_at ?? "") || 0, Date.parse(document.updated_at || document.created_at) || 0);
  }
  const vaccinationDocuments = documents.filter(document =>
    (isCoggins ? document.document_type === "coggins_eia" : ["combo_vaccine", "influenza_vaccine", "rhino_vaccine"].includes(document.document_type))
    && horses.some(horse => horse.id === document.horse_id));
  const normalizedSearch = normalizeDirectorySearch(search);
  const matchingDocuments = vaccinationDocuments.filter(document => {
    if (!showDecisions && (decision(document.id) || acceptedAutomatically(document))) return false;
    const horse = horses.find(horse => horse.id === document.horse_id);
    const owner = contacts.find(contact => contact.id === horse?.primary_owner_contact_id);
    return !normalizedSearch || matchesDirectorySearch([horse?.name, horse?.registration_number, owner ? contactLabel(owner) : "", document.certificate_number], normalizedSearch);
  }).sort((a, b) => documentActivity(b) - documentActivity(a) || a.id.localeCompare(b.id));
  const visibleDocuments = matchingDocuments.slice(0, visibleCount);
  const pendingCount = vaccinationDocuments.filter(document => !decision(document.id) && !acceptedAutomatically(document)).length;
  const processedCount = vaccinationDocuments.length - pendingCount;
  const rejectedCount = vaccinationDocuments.filter(document => decision(document.id) === "rejected").length;
  const selectedAcceptedAutomatically = selected ? acceptedAutomatically(selected) : false;
  const selectedHorse = horses.find(horse => horse.id === selected?.horse_id);
  const reasonReady = reason.trim().length >= 10 && reason.length <= 2000;
  const cogginsCertificateReady = Boolean(selected?.document_url && selected.result?.trim().toLowerCase() === "negative"
    && !["rejected", "expired"].includes(selected.status) && selected.test_or_administered_on
    && selected.test_or_administered_on >= "1900-01-01" && selected.test_or_administered_on <= todayDateValue()
    && !selected.warnings?.some(warning => ["NOT_EIA_DOCUMENT", "NOT_SIGNED", "VOIDED", "NOT_NEGATIVE", "MISSING_SAMPLE_DATE", "FUTURE_SAMPLE_DATE"].includes(warning)));


  function reviewedDate(document: HorseHealthDocument) {
    return localDates[document.id] ?? latestReview(document.id)?.vaccination_administered_on ?? document.test_or_administered_on;
  }
  function openReview(document: HorseHealthDocument) {
    setNotice(null); setReason(""); setAdministeredOn(reviewedDate(document) ?? ""); setSelected(document);
  }

  async function decide(status: "approved" | "rejected") {
    if (!selected || busy || selectedAcceptedAutomatically) return;
    setBusy(true); setNotice(null);
    try {
      if (isCoggins) await reviewCogginsDocument({ organization_id: organizationId, horse_document_id: selected.id, status, reason });
      else await reviewVaccinationDocument({ organization_id: organizationId, horse_document_id: selected.id, status, administered_on: status === "approved" ? administeredOn : null });
      setLocalDates(current => { const next = { ...current }; if (status === "approved") next[selected.id] = administeredOn; else delete next[selected.id]; return next; });
      setLocalDecisions(current => ({ ...current, [decisionKey(selected)]: status }));
      setSelected(null);
      setNotice({ error: false, text: status === "approved" ? uiText(locale, "Certificat approuvé par l’association.", "Certificate approved by the association.") : uiText(locale, "Certificat refusé par l’association.", "Certificate rejected by the association.") });
      try { await onReviewed(); } catch {
        setNotice({ error: false, text: uiText(locale, "Décision enregistrée. Recharge la page pour actualiser la conformité.", "Decision saved. Reload to refresh compliance.") });
      }
    } catch (error) { setNotice({ error: true, text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  return <details className="panel span-2 health-review-queue">
    <summary className="health-review-queue-summary"><h2>{isCoggins ? "Coggins" : uiText(locale, "Vaccinations", "Vaccinations")}</h2>
      <span className={`badge ${pendingCount ? "pending_review" : "approved"}`}>{pendingCount ? uiText(locale, `${pendingCount} document${pendingCount === 1 ? "" : "s"} à approuver`, `${pendingCount} document${pendingCount === 1 ? "" : "s"} awaiting approval`) : vaccinationDocuments.length && !rejectedCount ? uiText(locale, "Tout approuvé", "All approved") : uiText(locale, "Rien à approuver", "Nothing to approve")}</span>
      <ChevronDown size={18} aria-hidden="true" />
    </summary>
    <div className="health-review-queue-content"><div className="panel-header"><div>
      <h2>{isCoggins ? uiText(locale,"Coggins à approuver","Coggins certificates to review") : uiText(locale, "Certificats de vaccination à approuver", "Vaccination certificates to review")}</h2>
      <p>{uiText(locale, "Ouvre le document soumis par le membre, puis approuve-le ou refuse-le.", "Open the document submitted by the member, then approve or reject it.")}</p>
    </div></div>
    {notice ? <div role="status" className={`notice ${notice.error ? "error" : "success"}`}>{notice.text}</div> : null}
    <div className="health-review-toolbar">
      <p className="muted-line">{uiText(locale, `${pendingCount} à traiter · ${processedCount} traité${processedCount === 1 ? "" : "s"}`, `${pendingCount} awaiting review · ${processedCount} processed`)}</p>
      <label className="health-review-history"><input type="checkbox" checked={showDecisions} onChange={event => { setShowDecisions(event.target.checked); setVisibleCount(4); }} /><span>{uiText(locale, "Afficher aussi les documents traités", "Also show processed documents")}</span></label>
    </div>
    <label className="directory-search-field"><span>{isCoggins ? uiText(locale, "Rechercher un Coggins", "Search Coggins certificates") : uiText(locale, "Rechercher un certificat de vaccination", "Search vaccination certificates")}</span><div><Search size={16} aria-hidden="true" /><input type="search" placeholder={uiText(locale, "Cheval, propriétaire ou numéro de certificat…", "Horse, owner or certificate number…")} value={search} onChange={event => { setSearch(event.target.value); setVisibleCount(4); }} /></div></label>
    {!visibleDocuments.length ? <p className="empty-state">{normalizedSearch ? uiText(locale, "Aucun certificat ne correspond à cette recherche.", "No certificates match this search.") : showDecisions ? uiText(locale, "Aucun document à afficher.", "No documents to display.") : isCoggins ? uiText(locale,"Aucun Coggins en attente.","No Coggins awaiting review.") : uiText(locale, "Aucun certificat de vaccination en attente.", "No vaccination certificates awaiting review.")}</p> : null}
    <div className="stack">{visibleDocuments.map(document => {
      const horse = horses.find(candidate => candidate.id === document.horse_id);
      const review = latestReview(document.id);
      const savedDecision = decision(document.id);
      const automatic = acceptedAutomatically(document);
      return <article className="health-document-summary health-review-card" key={document.id}>
        <div className="health-review-card-header"><strong>{horse?.name}</strong>
          <span className={`badge ${savedDecision ?? (automatic ? "verified" : "pending_review")}`}>{savedDecision === "approved" ? uiText(locale, "Approuvé par l’association", "Approved by association") : savedDecision === "rejected" ? uiText(locale, "Refusé par l’association", "Rejected by association") : automatic ? uiText(locale, "Accepté automatiquement", "Automatically accepted") : uiText(locale, "À approuver par l’association", "Awaiting association approval")}</span>
        </div>
        <div className="health-review-card-meta"><span>{healthDocumentTypeLabel(document.document_type, locale)}</span>
          <span>{reviewedDate(document) ? `${isCoggins ? uiText(locale, "Prélèvement", "Sample") : uiText(locale, "Vaccination", "Vaccination")} : ${formatDate(reviewedDate(document)!)}` : isCoggins ? uiText(locale,"Date du prélèvement non fournie","Sample date not provided") : uiText(locale, "Date du vaccin non fournie", "Vaccination date not provided")}</span>
          {isCoggins && document.status === "verified" ? <span>{uiText(locale, "Vérifié auprès de GVL", "Verified with GVL")}</span> : null}
          {savedDecision && review ? <span>{uiText(locale, "Décision", "Decision")} : {formatDate(review.reviewed_at.slice(0, 10))}</span> : null}
        </div>
        {isCoggins && savedDecision && review?.review_notes ? <p>{review.review_notes}</p> : null}
        {isCoggins && review?.status === "approved" && !savedDecision && !automatic ? <p>{uiText(locale, "Le certificat a été mis à jour depuis la décision précédente. Une nouvelle approbation est nécessaire.", "The certificate has changed since the previous decision. A new approval is required.")}</p> : null}
        <div className="row-actions"><button type="button" className="primary-button" onClick={() => openReview(document)}>{uiText(locale, "Ouvrir le document", "Open document")}</button>
          {!automatic ? <button type="button" className="ghost-button" onClick={() => openReview(document)}>{savedDecision ? uiText(locale, "Modifier la décision", "Change decision") : uiText(locale, "Approuver", "Approve")}</button> : null}</div>
      </article>;
    })}</div>
    {matchingDocuments.length ? <div className="row-actions"><span className="muted-line">{uiText(locale, `${visibleDocuments.length} sur ${matchingDocuments.length} certificats · les plus récents d’abord`, `${visibleDocuments.length} of ${matchingDocuments.length} certificates · most recent first`)}</span>{matchingDocuments.length > visibleCount ? <button className="ghost-button" type="button" onClick={() => setVisibleCount(count => count + 4)}>{uiText(locale, "Afficher les 4 suivants", "Show next 4")}</button> : null}</div> : null}
    {selected ? <ModalDialog className="vaccination-review-modal" title={selectedAcceptedAutomatically ? uiText(locale, "Consulter le certificat", "View certificate") : uiText(locale, "Vérifier le certificat", "Review certificate")} description={`${selectedHorse?.name ?? ""} · ${healthDocumentTypeLabel(selected.document_type, locale)}`} onClose={() => { if (!busy) setSelected(null); }}>
      <HorseReviewSummary locale={locale} horse={selectedHorse} contacts={contacts} identifiers={identifiers} issuers={issuers} />
      {isCoggins ? <>
        <p><strong>{uiText(locale,"Nom sur le certificat","Name on certificate")} :</strong> {selected.horse_name || "—"}</p>
        <p><strong>{uiText(locale,"Date du prélèvement","Sample date")} :</strong> {selected.test_or_administered_on ? formatDate(selected.test_or_administered_on) : "—"} · {selected.result || "—"}</p>
        {selectedAcceptedAutomatically ? <p>{uiText(locale, "Ce certificat est accepté automatiquement selon les règles de l’association. Aucune approbation supplémentaire n’est requise.", "This certificate is automatically accepted under the association’s rules. No additional approval is required.")}</p> : <><p>{uiText(locale,"Cette décision s’applique à cette association seulement. Vérifie que le certificat correspond au cheval avant de confirmer. Elle ne modifie ni la fiche du cheval, ni le certificat, ni sa date d’expiration.","This decision applies to this association only. Check that the certificate matches the horse before confirming. It does not change the horse record, the certificate or its expiration.")}</p>
        <label>{uiText(locale,"Motif de la décision","Reason for the decision")}<textarea required minLength={10} maxLength={2000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label></>}
      </> : <label>{uiText(locale, "Date du vaccin indiquée sur le document", "Vaccination date shown on the document")}
        <input type="date" required min="1900-01-01" max={todayDateValue()} value={administeredOn} disabled={busy} onChange={event => setAdministeredOn(event.target.value)} />
      </label>}
      {!selectedAcceptedAutomatically ? <p>{uiText(locale, "Vérification manuelle de l’association : l’approbation ne dépend pas de la lecture automatique.", "Manual association review: approval does not depend on automatic reading.")}</p> : null}
      {fileError ? <p role="alert">{uiText(locale, "L’aperçu est indisponible. La vérification manuelle reste possible.", "Preview unavailable. Manual review is still available.")}</p> : null}
      {!selectedPath ? <p role="alert">{uiText(locale, "Aucun fichier joint. Demande au membre de déposer son certificat.", "No file attached. Ask the member to upload their certificate.")}</p> : null}
      {selectedPath && !fileUrl && !fileError ? <p role="status">{uiText(locale, "Chargement du document…", "Loading document…")}</p> : null}
      {fileUrl ? <a className="text-button" href={fileUrl} target="_blank" rel="noreferrer">{uiText(locale, "Ouvrir ou télécharger le fichier original", "Open or download the original file")}</a> : null}
      {fileUrl ? selected.mime_type?.startsWith("image/") ? <img className="vaccination-certificate-image" src={fileUrl} alt={uiText(locale, "Certificat soumis par le membre", "Certificate submitted by the member")} /> : <iframe className="vaccination-certificate-preview" src={fileUrl} title={uiText(locale, "Certificat soumis par le membre", "Certificate submitted by the member")} /> : null}
      {isCoggins && !cogginsCertificateReady ? <p role="alert">{uiText(locale,"Pour accepter une différence d’identité, le certificat joint doit être négatif, daté et non invalidé. Cette action ne permet pas d’accepter un test positif ou non signé.","Accepting an identity difference requires an attached, dated, negative certificate that has not been invalidated. This action cannot accept a positive or unsigned test.")}</p> : null}
      {isCoggins && !reasonReady && !selectedAcceptedAutomatically ? <p>{uiText(locale,"Indique un motif de 10 à 2000 caractères pour enregistrer la décision.","Enter a reason of 10–2000 characters to record the decision.")}</p> : null}
      {notice?.error ? <p role="alert">{notice.text}</p> : null}
      {!selectedAcceptedAutomatically ? <div className="row-actions vaccination-review-actions">
        <button className="primary-button" type="button" disabled={busy || !selectedPath || (isCoggins ? !reasonReady || !cogginsCertificateReady : !administeredOn || administeredOn > todayDateValue() || administeredOn < "1900-01-01")} onClick={() => void decide("approved")}>{uiText(locale, "Confirmer l’approbation", "Confirm approval")}</button>
        <button className="ghost-button danger-text" type="button" disabled={busy || (isCoggins && !reasonReady)} onClick={() => void decide("rejected")}>{uiText(locale, "Refuser", "Reject")}</button>
      </div> : null}
    </ModalDialog> : null}
    </div>
  </details>;
}
