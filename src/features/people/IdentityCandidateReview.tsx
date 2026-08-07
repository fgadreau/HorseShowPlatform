import { AlertTriangle, Link2, UserRoundCheck } from "lucide-react";
import type { ReactNode } from "react";
import { formatDate } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { ContactIdentityCandidate, HorseIdentityCandidate } from "../../services/supabaseServices";
import { uiText } from "../dashboard/shared";

function reasonLabel(reason: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    same_email: ["Même courriel", "Same email"],
    same_phone: ["Même téléphone", "Same phone"],
    same_name: ["Même nom", "Same name"],
    similar_name: ["Nom semblable", "Similar name"],
    same_birth_date: ["Même date de naissance", "Same birth date"],
    different_birth_date: ["Date de naissance différente", "Different birth date"],
    same_registration_number: ["Même numéro d’enregistrement", "Same registration number"],
    same_birth_year: ["Même année de naissance", "Same birth year"],
    different_birth_year: ["Année de naissance différente", "Different birth year"],
    same_gender: ["Même sexe", "Same sex"],
    different_gender: ["Sexe différent", "Different sex"],
    same_owner: ["Même propriétaire", "Same owner"],
  };
  const label = labels[reason];
  return label ? uiText(locale, label[0], label[1]) : reason;
}

function confidenceLabel(confidence: ContactIdentityCandidate["confidence"], locale: Locale) {
  if (confidence === "certain") return uiText(locale, "Correspondance forte", "Strong match");
  if (confidence === "probable") return uiText(locale, "Correspondance probable", "Probable match");
  return uiText(locale, "À vérifier", "Review suggested");
}

function CandidateShell({
  locale,
  children,
  canCreateDistinct,
  blockedMessage,
  busy,
  onEdit,
  onCreateDistinct,
}: {
  locale: Locale;
  children: ReactNode;
  canCreateDistinct: boolean;
  blockedMessage?: string;
  busy: boolean;
  onEdit: () => void;
  onCreateDistinct: () => void;
}) {
  return (
    <div className="identity-candidate-review">
      <div className="inline-form-header">
        <strong>
          <AlertTriangle size={18} />
          {uiText(locale, "Une fiche semblable existe peut-être déjà", "A similar record may already exist")}
        </strong>
        <span>{uiText(locale, "Vérifie la fiche avant d’en créer une nouvelle. Aucun rapprochement n’est automatique.", "Review it before creating a new record. Nothing is merged automatically.")}</span>
      </div>
      <div className="identity-candidate-list">{children}</div>
      <button className="ghost-button" disabled={busy} type="button" onClick={onEdit}>
        {uiText(locale, "Modifier les informations saisies", "Edit the entered information")}
      </button>
      {canCreateDistinct ? (
        <button className="ghost-button" disabled={busy} type="button" onClick={onCreateDistinct}>
          {uiText(locale, "Ce sont des fiches différentes — créer quand même", "These are different records — create anyway")}
        </button>
      ) : (
        <p className="muted-line">
          {blockedMessage ?? uiText(locale, "Le même numéro officiel est déjà utilisé. Choisis la fiche existante ou corrige le numéro.", "The same official number is already in use. Choose the existing record or correct the number.")}
        </p>
      )}
    </div>
  );
}

export function ContactIdentityCandidateReview({
  locale,
  candidates,
  busy,
  onCreateDistinct,
  onEdit,
  onUseExisting,
}: {
  locale: Locale;
  candidates: ContactIdentityCandidate[];
  busy: boolean;
  onCreateDistinct: () => void;
  onEdit: () => void;
  onUseExisting: (candidate: ContactIdentityCandidate) => void;
}) {
  const hasExactEmail = candidates.some((candidate) => candidate.reasons.includes("same_email"));

  return (
    <CandidateShell
      locale={locale}
      canCreateDistinct={!hasExactEmail}
      blockedMessage={uiText(locale, "Ce courriel appartient déjà à une fiche. Choisis la fiche existante ou corrige le courriel.", "This email already belongs to a record. Choose the existing record or correct the email.")}
      busy={busy}
      onEdit={onEdit}
      onCreateDistinct={onCreateDistinct}
    >
      {candidates.map((candidate) => (
        <article className="identity-candidate-card" key={candidate.contact_id}>
          <div>
            <strong>{[candidate.first_name, candidate.middle_name, candidate.last_name].filter(Boolean).join(" ")}</strong>
            <span>{confidenceLabel(candidate.confidence, locale)} · {candidate.score}%</span>
            {candidate.date_of_birth ? <span>{uiText(locale, "Naissance", "Birth")}: {formatDate(candidate.date_of_birth)}</span> : null}
            {candidate.email_hint ? <span>{candidate.email_hint}</span> : null}
            {candidate.phone_hint ? <span>{candidate.phone_hint}</span> : null}
            <span>{candidate.reasons.map((reason) => reasonLabel(reason, locale)).join(" · ")}</span>
          </div>
          <button className="primary-button" disabled={busy} type="button" onClick={() => onUseExisting(candidate)}>
            <UserRoundCheck size={18} />
            {candidate.already_linked ? uiText(locale, "Utiliser cette fiche", "Use this record") : uiText(locale, "Ajouter cette fiche aux répertoires", "Add this record to directories")}
          </button>
        </article>
      ))}
    </CandidateShell>
  );
}

export function HorseIdentityCandidateReview({
  locale,
  candidates,
  busy,
  onCreateDistinct,
  onEdit,
  onUseExisting,
}: {
  locale: Locale;
  candidates: HorseIdentityCandidate[];
  busy: boolean;
  onCreateDistinct: () => void;
  onEdit: () => void;
  onUseExisting: (candidate: HorseIdentityCandidate) => void;
}) {
  const hasOfficialDuplicate = candidates.some((candidate) => candidate.reasons.includes("same_registration_number"));

  return (
    <CandidateShell locale={locale} canCreateDistinct={!hasOfficialDuplicate} busy={busy} onEdit={onEdit} onCreateDistinct={onCreateDistinct}>
      {candidates.map((candidate) => (
        <article className="identity-candidate-card" key={candidate.horse_id}>
          <div>
            <strong>{candidate.name}</strong>
            <span>{confidenceLabel(candidate.confidence, locale)} · {candidate.score}%</span>
            {candidate.registration_number ? <span>{uiText(locale, "Enregistrement", "Registration")}: {candidate.registration_number}</span> : null}
            {candidate.date_of_birth ? <span>{uiText(locale, "Naissance", "Birth")}: {formatDate(candidate.date_of_birth)}</span> : candidate.birth_year ? <span>{uiText(locale, "Année", "Year")}: {candidate.birth_year}</span> : null}
            <span>{candidate.reasons.map((reason) => reasonLabel(reason, locale)).join(" · ")}</span>
          </div>
          <button className="primary-button" disabled={busy} type="button" onClick={() => onUseExisting(candidate)}>
            <Link2 size={18} />
            {candidate.already_linked ? uiText(locale, "Utiliser ce cheval", "Use this horse") : uiText(locale, "Ajouter ce cheval aux répertoires", "Add this horse to directories")}
          </button>
        </article>
      ))}
    </CandidateShell>
  );
}
