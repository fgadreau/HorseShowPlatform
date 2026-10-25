import { useEffect, useState } from "react";
import { ModalDialog } from "../../components/ui";
import { errorMessage, formatDate } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { Horse, HorseHealthDocument, OrganizationHealthDocumentReview } from "../../types/domain";
import { getHorseHealthDocumentFileUrl, reviewVaccinationDocument } from "../../services/supabaseServices";
import { healthDocumentTypeLabel, uiText } from "../dashboard/shared";

export function VaccinationReviewQueue({ locale, organizationId, horses, documents, reviews, onReviewed }: {
  locale: Locale; organizationId: string; horses: Horse[]; documents: HorseHealthDocument[];
  reviews: OrganizationHealthDocumentReview[]; onReviewed: () => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<HorseHealthDocument | null>(null);
  const [showDecisions, setShowDecisions] = useState(false);
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
  function decision(id: string) { return localDecisions[id] ?? latestReview(id)?.status; }
  const vaccinationDocuments = documents.filter(document =>
    ["combo_vaccine", "influenza_vaccine", "rhino_vaccine"].includes(document.document_type)
    && horses.some(horse => horse.id === document.horse_id));
  const visibleDocuments = vaccinationDocuments.filter(document => showDecisions || !decision(document.id));
  const selectedHorse = horses.find(horse => horse.id === selected?.horse_id);

  async function decide(status: "approved" | "rejected") {
    if (!selected || busy) return;
    setBusy(true); setNotice(null);
    try {
      await reviewVaccinationDocument({ organization_id: organizationId, horse_document_id: selected.id, status });
      setLocalDecisions(current => ({ ...current, [selected.id]: status }));
      setSelected(null);
      setNotice({ error: false, text: status === "approved" ? uiText(locale, "Certificat approuvé par l’association.", "Certificate approved by the association.") : uiText(locale, "Certificat refusé par l’association.", "Certificate rejected by the association.") });
      try { await onReviewed(); } catch {
        setNotice({ error: false, text: uiText(locale, "Décision enregistrée. Recharge la page pour actualiser la conformité.", "Decision saved. Reload to refresh compliance.") });
      }
    } catch (error) { setNotice({ error: true, text: errorMessage(error) }); }
    finally { setBusy(false); }
  }

  return <section className="panel span-2">
    <div className="panel-header"><div>
      <h2>{uiText(locale, "Certificats de vaccination à approuver", "Vaccination certificates to review")}</h2>
      <p>{uiText(locale, "Ouvre le document soumis par le membre, puis approuve-le ou refuse-le.", "Open the document submitted by the member, then approve or reject it.")}</p>
    </div></div>
    {notice ? <div role="status" className={`notice ${notice.error ? "error" : "success"}`}>{notice.text}</div> : null}
    <label className="checkbox-line"><input type="checkbox" checked={showDecisions} onChange={event => setShowDecisions(event.target.checked)} />{uiText(locale, "Afficher aussi les décisions enregistrées", "Also show saved decisions")}</label>
    {!visibleDocuments.length ? <p>{uiText(locale, "Aucun certificat de vaccination en attente.", "No vaccination certificates awaiting review.")}</p> : null}
    <div className="stack">{visibleDocuments.map(document => {
      const horse = horses.find(candidate => candidate.id === document.horse_id);
      const review = latestReview(document.id);
      return <article className="health-document-summary" key={document.id}>
        <strong>{horse?.name}</strong><span>{healthDocumentTypeLabel(document.document_type, locale)}</span>
        <span>{document.test_or_administered_on ? formatDate(document.test_or_administered_on) : uiText(locale, "Date du vaccin non fournie", "Vaccination date not provided")}</span>
        {decision(document.id) ? <span className={`badge ${decision(document.id)}`}>{decision(document.id) === "approved" ? uiText(locale, "Approuvé", "Approved") : uiText(locale, "Refusé", "Rejected")}{review ? ` · ${formatDate(review.reviewed_at)}` : ""}</span> : null}
        <div className="row-actions"><button type="button" className="primary-button" onClick={() => { setNotice(null); setSelected(document); }}>{uiText(locale, "Ouvrir le document", "Open document")}</button></div>
      </article>;
    })}</div>
    {selected ? <ModalDialog className="vaccination-review-modal" title={uiText(locale, "Vérifier le certificat", "Review certificate")} description={`${selectedHorse?.name ?? ""} · ${healthDocumentTypeLabel(selected.document_type, locale)}`} onClose={() => { if (!busy) setSelected(null); }}>
      <p>{selected.test_or_administered_on ? `${uiText(locale, "Date du vaccin", "Vaccination date")} : ${formatDate(selected.test_or_administered_on)}` : uiText(locale, "La date n’a pas été fournie : approuver le document ne complétera pas sa conformité.", "No date was provided: approving the document will not complete its compliance.")}</p>
      {fileError ? <p role="alert">{uiText(locale, "Impossible d’afficher le document.", "Unable to display the document.")} {fileError}</p> : null}
      {!selectedPath ? <p role="alert">{uiText(locale, "Aucun fichier joint. Demande au membre de déposer son certificat.", "No file attached. Ask the member to upload their certificate.")}</p> : null}
      {selectedPath && !fileUrl && !fileError ? <p role="status">{uiText(locale, "Chargement du document…", "Loading document…")}</p> : null}
      {fileUrl ? selected.mime_type?.startsWith("image/") ? <img className="vaccination-certificate-image" src={fileUrl} alt={uiText(locale, "Certificat soumis par le membre", "Certificate submitted by the member")} /> : <iframe className="vaccination-certificate-preview" src={fileUrl} title={uiText(locale, "Certificat soumis par le membre", "Certificate submitted by the member")} /> : null}
      {notice?.error ? <p role="alert">{notice.text}</p> : null}
      <div className="row-actions vaccination-review-actions">
        <button className="primary-button" type="button" disabled={busy || !fileUrl || Boolean(fileError)} onClick={() => void decide("approved")}>{uiText(locale, "Approuver", "Approve")}</button>
        <button className="ghost-button danger-text" type="button" disabled={busy} onClick={() => void decide("rejected")}>{uiText(locale, "Refuser", "Reject")}</button>
      </div>
    </ModalDialog> : null}
  </section>;
}
