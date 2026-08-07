import { useState } from "react";
import type { FormEvent } from "react";
import { NoticeBanner } from "../../components/ui";
import { errorMessage } from "../../lib/display";
import { createContactInsuranceEvidence, getContactInsuranceDocumentFileUrl, reviewContactInsuranceEvidence, uploadContactInsuranceDocument } from "../../services/supabaseServices";
import type { Contact, ContactInsuranceEvidence, ExternalCredentialIssuer, ExternalCredentialProduct } from "../../types/domain";
import type { Notice } from "../../types/ui";

export function InsuranceEvidenceForm({ contact, createdByUserId, evidence, issuers, products, onRefresh }: {
  contact: Contact;
  createdByUserId: string;
  evidence: ContactInsuranceEvidence[];
  issuers: ExternalCredentialIssuer[];
  products: ExternalCredentialProduct[];
  onRefresh: () => Promise<void> | void;
}) {
  const [issuerId, setIssuerId] = useState("");
  const [productId, setProductId] = useState("");
  const [providerName, setProviderName] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [coverageAmount, setCoverageAmount] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const insuranceProviders = issuers.filter((issuer) => issuer.issuer_type === "insurance_provider");
  const issuerProducts = products.filter((product) => product.external_credential_issuer_id === issuerId && product.includes_liability_insurance);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      const documentPath = documentFile ? await uploadContactInsuranceDocument({ contact_id: contact.id, file: documentFile }) : null;
      await createContactInsuranceEvidence({
        contact_id: contact.id,
        external_credential_issuer_id: issuerId || null,
        credential_product_id: productId || null,
        policy_number: policyNumber.trim() || null,
        provider_name: providerName.trim() || null,
        valid_from: validFrom || null,
        expires_on: expiresOn,
        coverage_amount: coverageAmount ? Number(coverageAmount) : null,
        coverage_currency: coverageAmount ? "CAD" : null,
        document_storage_path: documentPath,
        status: "pending",
        notes: null,
        metadata: {},
        created_by_user_id: createdByUserId,
      });
      setNotice({ tone: "success", message: "Preuve ajoutée et placée en attente de vérification." });
      setPolicyNumber(""); setValidFrom(""); setExpiresOn(""); setCoverageAmount(""); setDocumentFile(null);
      await onRefresh();
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, status: "approved" | "rejected") {
    setBusy(true);
    try {
      await reviewContactInsuranceEvidence(id, { status, reviewed_by_user_id: createdByUserId });
      await onRefresh();
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(objectPath: string) {
    setNotice(null);
    try {
      const url = await getContactInsuranceDocumentFileUrl(objectPath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    }
  }

  return <div className="stack">
    {notice ? <NoticeBanner notice={notice} /> : null}
    <div className="stack compact-stack">
      {evidence.map((item) => <div className="nested-fieldset" key={item.id}>
        <strong>{item.provider_name || issuers.find((issuer) => issuer.id === item.external_credential_issuer_id)?.name || "Assurance personnelle"}</strong>
        <span className="muted-line">{item.policy_number || "Sans numéro"} · expire le {item.expires_on} · {item.status}</span>
        {item.document_storage_path ? <button className="text-button" type="button" onClick={() => void openDocument(item.document_storage_path!)}>Consulter la preuve</button> : null}
        {item.status === "pending" ? <div className="row-actions"><button className="text-button" disabled={busy} type="button" onClick={() => void review(item.id, "approved")}>Approuver</button><button className="text-button danger-text" disabled={busy} type="button" onClick={() => void review(item.id, "rejected")}>Refuser</button></div> : null}
      </div>)}
      {!evidence.length ? <span className="muted-line">Aucune preuve d’assurance.</span> : null}
    </div>
    <form className="stack nested-fieldset" onSubmit={handleSubmit}>
      <strong>Ajouter une preuve</strong>
      <div className="form-grid">
        <label>Fournisseur reconnu<select value={issuerId} onChange={(event) => { setIssuerId(event.target.value); setProductId(""); }}><option value="">Assurance personnelle / autre</option>{insuranceProviders.map((issuer) => <option key={issuer.id} value={issuer.id}>{issuer.name}</option>)}</select></label>
        <label>Nom du fournisseur<input value={providerName} onChange={(event) => setProviderName(event.target.value)} /></label>
        <label>Produit<select disabled={!issuerProducts.length} value={productId} onChange={(event) => setProductId(event.target.value)}><option value="">Non précisé</option>{issuerProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
        <label>Numéro de police<input value={policyNumber} onChange={(event) => setPolicyNumber(event.target.value)} /></label>
        <label>Valide à partir du<input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} /></label>
        <label>Expire le<input required type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label>
        <label>Couverture (CAD)<input min="0" step="0.01" type="number" value={coverageAmount} onChange={(event) => setCoverageAmount(event.target.value)} /></label>
        <label>Document justificatif<input accept=".pdf,image/jpeg,image/png,image/webp" required type="file" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} /></label>
      </div>
      <button className="primary-button" disabled={busy || !expiresOn || !documentFile} type="submit">Ajouter la preuve</button>
    </form>
  </div>;
}
