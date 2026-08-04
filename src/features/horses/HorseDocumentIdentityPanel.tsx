import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileSearch, TriangleAlert } from "lucide-react";
import { contactLabel, errorMessage } from "../../lib/display";
import {
  horseDocumentValidationRpcPayload,
  prepareHorseDocumentValidation,
  type HorseDocumentExtractedIdentity,
} from "../../lib/horseDocumentIdentity";
import type { Locale } from "../../lib/i18n";
import {
  createHorseDocumentValidation,
  listHorseDocumentValidations,
} from "../../services/supabaseServices";
import type {
  Contact,
  ExternalCredentialIssuer,
  Horse,
  HorseDocument,
  HorseDocumentValidation,
  HorseExternalIdentifier,
} from "../../types/domain";
import { healthDocumentTypeLabel, uiText } from "../dashboard/shared";

type EditableExtractedIdentity = {
  horse_name: string;
  date_of_birth: string;
  birth_year: string;
  age_years: string;
  age_reference_date: string;
  gender: string;
  breed: string;
  color: string;
  identifier: string;
  owner_name: string;
};

function validationLabel(validation: HorseDocumentValidation, locale: Locale) {
  if (validation.status === "verified") return uiText(locale, "Identité concordante", "Identity matched");
  if (validation.status === "mismatch") return uiText(locale, "Écart d’identité", "Identity mismatch");
  if (validation.status === "rejected") return uiText(locale, "Lecture refusée", "Reading rejected");
  if (validation.status === "superseded") return uiText(locale, "Ancienne version", "Previous version");
  if (validation.status === "invalidated") return uiText(locale, "Invalidée par une correction", "Invalidated by a correction");
  return validation.verdict === "possible_match"
    ? uiText(locale, "Concordance possible", "Possible match")
    : uiText(locale, "Information insuffisante", "Insufficient information");
}

function validationTone(validation: HorseDocumentValidation) {
  if (validation.status === "verified") return "approved";
  if (validation.status === "mismatch" || validation.status === "rejected") return "rejected";
  return "pending_review";
}

function reasonLabel(reason: string, locale: Locale) {
  const fr: Record<string, string> = {
    different_birth_year: "année de naissance différente",
    different_breed: "race différente",
    different_date_of_birth: "date de naissance différente",
    different_gender: "sexe différent",
    different_identifier: "numéro différent",
    different_name: "nom différent",
    grade_horse_has_registration_document: "le cheval HSP est déclaré grade, mais le document contient un enregistrement",
    same_birth_year: "même année de naissance",
    same_breed: "même race",
    same_date_of_birth: "même date de naissance",
    same_gender: "même sexe",
    same_identifier: "même numéro",
    same_name: "même nom",
    similar_breed: "race semblable",
    similar_name: "nom semblable",
  };
  const en: Record<string, string> = {
    different_birth_year: "different birth year",
    different_breed: "different breed",
    different_date_of_birth: "different date of birth",
    different_gender: "different sex",
    different_identifier: "different number",
    different_name: "different name",
    grade_horse_has_registration_document: "the HSP horse is declared grade, but the document contains a registration",
    same_birth_year: "same birth year",
    same_breed: "same breed",
    same_date_of_birth: "same date of birth",
    same_gender: "same sex",
    same_identifier: "same number",
    same_name: "same name",
    similar_breed: "similar breed",
    similar_name: "similar name",
  };
  return (locale === "en" ? en : fr)[reason] ?? reason.replace(/_/g, " ");
}

function initialExtractedIdentity(document: HorseDocument): EditableExtractedIdentity {
  return {
    horse_name: document.horse_name ?? "",
    date_of_birth: document.horse_date_of_birth ?? "",
    birth_year: "",
    age_years: "",
    age_reference_date: new Date().toISOString().slice(0, 10),
    gender: "",
    breed: document.breed_name ?? "",
    color: "",
    identifier: document.registration_number ?? document.horse_external_id ?? "",
    owner_name: "",
  };
}

export function HorseDocumentIdentityPanel({
  contacts,
  externalCredentialIssuers,
  horse,
  horseDocuments,
  horseExternalIdentifiers,
  locale,
  onValidationCreated,
}: {
  contacts: Contact[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  horse: Horse;
  horseDocuments: HorseDocument[];
  horseExternalIdentifiers: HorseExternalIdentifier[];
  locale: Locale;
  onValidationCreated?: () => void | Promise<void>;
}) {
  const [validations, setValidations] = useState<HorseDocumentValidation[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [extracted, setExtracted] = useState<EditableExtractedIdentity>(() => initialExtractedIdentity(horseDocuments[0] ?? ({} as HorseDocument)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const owner = contacts.find((contact) => contact.id === horse.primary_owner_contact_id);
  const selectedDocument = horseDocuments.find((document) => document.id === selectedDocumentId) ?? null;
  const latestByDocumentId = useMemo(() => {
    const result = new Map<string, HorseDocumentValidation>();
    validations
      .filter((validation) => !["superseded", "invalidated"].includes(validation.status))
      .forEach((validation) => result.set(validation.horse_document_id, validation));
    return result;
  }, [validations]);

  async function reloadValidations() {
    const rows = await listHorseDocumentValidations(horse.id);
    setValidations(rows);
  }

  useEffect(() => {
    let cancelled = false;
    void listHorseDocumentValidations(horse.id)
      .then((rows) => {
        if (!cancelled) setValidations(rows);
      })
      .catch((error) => {
        if (!cancelled) setMessage({ tone: "error", text: errorMessage(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [horse.id]);

  function beginIdentification(document: HorseDocument) {
    setSelectedDocumentId(document.id);
    setExtracted({
      ...initialExtractedIdentity(document),
      owner_name: owner ? contactLabel(owner) : "",
    });
    setMessage(null);
  }

  function setField<Key extends keyof EditableExtractedIdentity>(key: Key, value: EditableExtractedIdentity[Key]) {
    setExtracted((current) => ({ ...current, [key]: value }));
  }

  async function saveIdentification() {
    if (!selectedDocument) return;

    const expectedIdentifier = selectedDocument.external_credential_issuer_id
      ? horseExternalIdentifiers.find((identifier) => identifier.external_credential_issuer_id === selectedDocument.external_credential_issuer_id)?.identifier_value ?? null
      : horse.registration_number;
    const extractedValues: HorseDocumentExtractedIdentity = {
      horse_name: extracted.horse_name,
      date_of_birth: extracted.date_of_birth,
      birth_year: extracted.birth_year ? Number(extracted.birth_year) : null,
      age_years: extracted.age_years ? Number(extracted.age_years) : null,
      age_reference_date: extracted.age_reference_date,
      gender: extracted.gender,
      breed: extracted.breed,
      color: extracted.color,
      identifier: extracted.identifier,
      owner_name: extracted.owner_name,
    };
    const prepared = prepareHorseDocumentValidation({
      document: selectedDocument,
      horse,
      horseOwnerName: owner ? contactLabel(owner) : null,
      expectedIdentifier,
      extracted: extractedValues,
      source: "manual",
    });

    setBusy(true);
    setMessage(null);
    try {
      const validation = await createHorseDocumentValidation(
        selectedDocument.id,
        horseDocumentValidationRpcPayload(prepared),
      );
      await reloadValidations();
      await onValidationCreated?.();
      setSelectedDocumentId("");
      setMessage({
        tone: "success",
        text: `${uiText(locale, "Lecture enregistrée", "Reading saved")} — ${validationLabel(validation, locale)}.`,
      });
    } catch (error) {
      setMessage({ tone: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  if (!horseDocuments.length) return null;

  return (
    <div className="external-membership-fields health-document-fields">
      <div className="inline-form-header">
        <strong>{uiText(locale, "Identification des documents", "Document identification")}</strong>
        <span>
          {uiText(
            locale,
            "La lecture compare le document à la fiche HSP. Elle ne change jamais automatiquement le cheval.",
            "The reading compares the document with the HSP record. It never changes the horse automatically.",
          )}
        </span>
      </div>

      {horseDocuments.map((document) => {
        const validation = latestByDocumentId.get(document.id);
        const issuer = externalCredentialIssuers.find((candidate) => candidate.id === document.external_credential_issuer_id);
        const versions = validations.filter((candidate) => candidate.horse_document_id === document.id);
        return (
          <div className="health-document-summary" key={document.id}>
            <div className="health-document-title">
              {validation ? <span className={`badge ${validationTone(validation)}`}>{validationLabel(validation, locale)}</span> : <span className="badge pending_review">{uiText(locale, "Non identifié", "Not identified")}</span>}
              <strong>{healthDocumentTypeLabel(document.document_type, locale)}</strong>
            </div>
            <span className="muted-line">
              {[issuer?.name ?? document.issuer_name, document.original_file_name, document.registration_number].filter(Boolean).join(" — ")}
            </span>
            {validation ? (
              <span className="muted-line">
                v{validation.version} · {validation.score}/100
                {validation.evidence.filter((item) => item.outcome === "different").length
                  ? ` · ${validation.evidence.filter((item) => item.outcome === "different").map((item) => reasonLabel(String(item.reason), locale)).join(", ")}`
                  : ""}
              </span>
            ) : null}
            <div className="row-actions">
              <button className="text-button" type="button" onClick={() => beginIdentification(document)}>
                <FileSearch size={16} />
                {validation ? uiText(locale, "Nouvelle lecture", "New reading") : uiText(locale, "Identifier", "Identify")}
              </button>
              {versions.length > 1 ? <span className="muted-line">{versions.length} {uiText(locale, "versions conservées", "versions retained")}</span> : null}
            </div>
          </div>
        );
      })}

      {selectedDocument ? (
        <div className="stack health-document-identification-editor">
          <div className="inline-form-header">
            <strong>{uiText(locale, "Valeurs visibles sur le document", "Values shown on the document")}</strong>
            <span>{healthDocumentTypeLabel(selectedDocument.document_type, locale)}</span>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Nom du cheval", "Horse name")}
              <input value={extracted.horse_name} onChange={(event) => setField("horse_name", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Numéro officiel", "Official number")}
              <input value={extracted.identifier} onChange={(event) => setField("identifier", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Date de naissance", "Date of birth")}
              <input type="date" value={extracted.date_of_birth} onChange={(event) => setField("date_of_birth", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Année de naissance", "Birth year")}
              <input max="2200" min="1900" type="number" value={extracted.birth_year} onChange={(event) => setField("birth_year", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Âge indiqué", "Age shown")}
              <input max="60" min="0" type="number" value={extracted.age_years} onChange={(event) => setField("age_years", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Date de référence de l’âge", "Age reference date")}
              <input type="date" value={extracted.age_reference_date} onChange={(event) => setField("age_reference_date", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Sexe", "Sex")}
              <select value={extracted.gender} onChange={(event) => setField("gender", event.target.value)}>
                <option value="">{uiText(locale, "Non indiqué", "Not shown")}</option>
                <option value="M">{uiText(locale, "Mâle", "Male")}</option>
                <option value="F">{uiText(locale, "Femelle", "Female")}</option>
                <option value="G">{uiText(locale, "Hongre", "Gelding")}</option>
              </select>
            </label>
            <label>
              {uiText(locale, "Race", "Breed")}
              <input value={extracted.breed} onChange={(event) => setField("breed", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Couleur", "Color")}
              <input value={extracted.color} onChange={(event) => setField("color", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Propriétaire indiqué", "Owner shown")}
              <input value={extracted.owner_name} onChange={(event) => setField("owner_name", event.target.value)} />
            </label>
          </div>
          <span className="muted-line">
            <TriangleAlert size={15} /> {uiText(locale, "Enregistrer cette lecture ne modifie aucun champ de la fiche du cheval.", "Saving this reading does not modify any horse record field.")}
          </span>
          <div className="row-actions">
            <button className="primary-button" disabled={busy || !extracted.horse_name.trim()} type="button" onClick={() => void saveIdentification()}>
              <CheckCircle2 size={17} />
              {busy ? uiText(locale, "Comparaison...", "Comparing...") : uiText(locale, "Comparer et enregistrer", "Compare and save")}
            </button>
            <button className="ghost-button" disabled={busy} type="button" onClick={() => setSelectedDocumentId("")}>
              {uiText(locale, "Annuler", "Cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {message ? <span className={message.tone === "error" ? "error-banner" : "success-banner"}>{message.text}</span> : null}
    </div>
  );
}
