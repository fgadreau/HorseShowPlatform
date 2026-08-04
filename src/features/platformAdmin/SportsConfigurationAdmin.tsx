import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { NoticeBanner } from "../../components/ui";
import { errorMessage } from "../../lib/display";
import {
  createDiscipline,
  createExternalCredentialIssuer,
  createExternalCredentialProduct,
  createGoverningBody,
  setDisciplineCredentialIssuer,
  setDisciplineGoverningBody,
} from "../../services/supabaseServices";
import type {
  Discipline,
  DisciplineCredentialIssuer,
  DisciplineGoverningBody,
  ExternalCredentialIssuer,
  ExternalCredentialIssuerType,
  ExternalCredentialProduct,
  SanctioningBody,
} from "../../types/domain";
import type { Notice } from "../../types/ui";

export function SportsConfigurationAdmin({
  currentUserProfileId,
  disciplines,
  disciplineCredentialIssuers,
  disciplineGoverningBodies,
  externalCredentialIssuers,
  externalCredentialProducts,
  governingBodies,
  onRefresh,
}: {
  currentUserProfileId: string | null;
  disciplines: Discipline[];
  disciplineCredentialIssuers: DisciplineCredentialIssuer[];
  disciplineGoverningBodies: DisciplineGoverningBody[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  externalCredentialProducts: ExternalCredentialProduct[];
  governingBodies: SanctioningBody[];
  onRefresh: () => void;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedDisciplineId, setSelectedDisciplineId] = useState(disciplines[0]?.id ?? "");
  const [disciplineCode, setDisciplineCode] = useState("");
  const [disciplineName, setDisciplineName] = useState("");
  const [bodyCode, setBodyCode] = useState("");
  const [bodyName, setBodyName] = useState("");
  const [issuerCode, setIssuerCode] = useState("");
  const [issuerName, setIssuerName] = useState("");
  const [issuerType, setIssuerType] = useState<ExternalCredentialIssuerType>("provincial_territorial_sport_organization");
  const [productIssuerId, setProductIssuerId] = useState("");
  const [productCode, setProductCode] = useState("");
  const [productName, setProductName] = useState("");
  const [productType, setProductType] = useState<ExternalCredentialProduct["credential_type"]>("membership");
  const [productIncludesInsurance, setProductIncludesInsurance] = useState(false);

  const activeGoverningBodyIds = useMemo(() => new Set(
    disciplineGoverningBodies
      .filter((link) => link.discipline_id === selectedDisciplineId && link.is_active)
      .map((link) => link.governing_body_id),
  ), [disciplineGoverningBodies, selectedDisciplineId]);
  const activeIssuerIds = useMemo(() => new Set(
    disciplineCredentialIssuers
      .filter((link) => link.discipline_id === selectedDisciplineId && link.is_active)
      .map((link) => link.external_credential_issuer_id),
  ), [disciplineCredentialIssuers, selectedDisciplineId]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      await action();
      setNotice({ tone: "success", message: success });
      await onRefresh();
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateDiscipline(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const created = await createDiscipline({ code: disciplineCode, name: disciplineName });
      setSelectedDisciplineId(created.id);
      setDisciplineCode("");
      setDisciplineName("");
    }, "Discipline créée.");
  }

  async function handleCreateBody(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await createGoverningBody({ code: bodyCode, name: bodyName });
      setBodyCode("");
      setBodyName("");
    }, "Organisme sanctionneur créé.");
  }

  async function handleCreateIssuer(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await createExternalCredentialIssuer({ code: issuerCode, name: issuerName, issuer_type: issuerType });
      setIssuerCode("");
      setIssuerName("");
    }, "Organisme émetteur créé.");
  }

  async function handleCreateProduct(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await createExternalCredentialProduct({
        external_credential_issuer_id: productIssuerId,
        code: productCode,
        name: productName,
        credential_type: productType,
        includes_liability_insurance: productIncludesInsurance,
      });
      setProductCode("");
      setProductName("");
    }, "Produit de preuve créé.");
  }

  return (
    <section className="panel span-2">
      <div className="panel-header">
        <div>
          <h2>Configuration sportive</h2>
          <p>Catalogues globaux gérés par le Platform Admin. Les associations choisissent ensuite leurs exigences.</p>
        </div>
      </div>
      {notice ? <NoticeBanner notice={notice} /> : null}

      <div className="form-grid">
        <form className="stack nested-fieldset" onSubmit={handleCreateDiscipline}>
          <strong>Nouvelle discipline</strong>
          <label>Code<input required value={disciplineCode} onChange={(event) => setDisciplineCode(event.target.value)} /></label>
          <label>Nom<input required value={disciplineName} onChange={(event) => setDisciplineName(event.target.value)} /></label>
          <button className="primary-button" disabled={busy} type="submit">Créer la discipline</button>
        </form>
        <form className="stack nested-fieldset" onSubmit={handleCreateBody}>
          <strong>Nouvel organisme sanctionneur</strong>
          <label>Code<input required value={bodyCode} onChange={(event) => setBodyCode(event.target.value)} /></label>
          <label>Nom<input required value={bodyName} onChange={(event) => setBodyName(event.target.value)} /></label>
          <button className="primary-button" disabled={busy} type="submit">Créer l’organisme</button>
        </form>
      </div>

      <div className="form-grid">
        <form className="stack nested-fieldset" onSubmit={handleCreateIssuer}>
          <strong>Nouvel organisme émetteur</strong>
          <label>Type
            <select value={issuerType} onChange={(event) => setIssuerType(event.target.value as ExternalCredentialIssuerType)}>
              <option value="national_sport_organization">Organisme sportif national</option>
              <option value="provincial_territorial_sport_organization">OPTS provincial ou territorial</option>
              <option value="breed_registry">Organisme de race</option>
              <option value="sanctioning_organization">Organisme sanctionneur</option>
              <option value="insurance_provider">Fournisseur d’assurance</option>
              <option value="other">Autre</option>
            </select>
          </label>
          <label>Code<input required value={issuerCode} onChange={(event) => setIssuerCode(event.target.value)} /></label>
          <label>Nom<input required value={issuerName} onChange={(event) => setIssuerName(event.target.value)} /></label>
          <button className="primary-button" disabled={busy} type="submit">Créer l’émetteur</button>
        </form>
        <form className="stack nested-fieldset" onSubmit={handleCreateProduct}>
          <strong>Nouveau produit ou preuve</strong>
          <label>Organisme
            <select required value={productIssuerId} onChange={(event) => setProductIssuerId(event.target.value)}>
              <option value="">Choisir</option>
              {externalCredentialIssuers.map((issuer) => <option key={issuer.id} value={issuer.id}>{issuer.name}</option>)}
            </select>
          </label>
          <label>Type
            <select value={productType} onChange={(event) => setProductType(event.target.value as ExternalCredentialProduct["credential_type"])}>
              <option value="membership">Adhésion</option><option value="license">Licence</option><option value="registration">Enregistrement</option><option value="certification">Certification</option><option value="insurance">Assurance</option><option value="other">Autre</option>
            </select>
          </label>
          <label>Code<input required value={productCode} onChange={(event) => setProductCode(event.target.value)} /></label>
          <label>Nom<input required value={productName} onChange={(event) => setProductName(event.target.value)} /></label>
          <label className="check-row"><input checked={productIncludesInsurance} type="checkbox" onChange={(event) => setProductIncludesInsurance(event.target.checked)} /><span>Ce produit inclut une assurance responsabilité admissible</span></label>
          <button className="primary-button" disabled={busy || !productIssuerId} type="submit">Créer le produit</button>
        </form>
      </div>

      <div className="stack nested-fieldset">
        <strong>Disponibilités par discipline</strong>
        <label>Discipline
          <select value={selectedDisciplineId} onChange={(event) => setSelectedDisciplineId(event.target.value)}>
            <option value="">Choisir</option>
            {disciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
          </select>
        </label>
        <div className="form-grid">
          <fieldset className="stack nested-fieldset">
            <legend>Organismes sanctionneurs disponibles</legend>
            {governingBodies.map((body) => (
              <label className="check-row" key={body.id}><input checked={activeGoverningBodyIds.has(body.id)} disabled={busy || !selectedDisciplineId} type="checkbox" onChange={() => void run(() => setDisciplineGoverningBody({ discipline_id: selectedDisciplineId, governing_body_id: body.id, is_active: !activeGoverningBodyIds.has(body.id), created_by_user_id: currentUserProfileId }), "Compatibilité mise à jour.")} /><span>{body.name}</span></label>
            ))}
          </fieldset>
          <fieldset className="stack nested-fieldset">
            <legend>Organismes et preuves disponibles</legend>
            {externalCredentialIssuers.map((issuer) => (
              <label className="check-row" key={issuer.id}><input checked={activeIssuerIds.has(issuer.id)} disabled={busy || !selectedDisciplineId} type="checkbox" onChange={() => void run(() => setDisciplineCredentialIssuer({ discipline_id: selectedDisciplineId, external_credential_issuer_id: issuer.id, is_active: !activeIssuerIds.has(issuer.id), created_by_user_id: currentUserProfileId }), "Disponibilité mise à jour.")} /><span>{issuer.name}</span></label>
            ))}
          </fieldset>
        </div>
        <small>{externalCredentialProducts.length} produit(s) de preuve configuré(s).</small>
      </div>
    </section>
  );
}
