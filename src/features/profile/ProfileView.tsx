import { useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, Circle, ChevronRight, ClipboardList, Stethoscope, User, Users } from "lucide-react";
import { ViewIntro } from "../../components/ui";
import type { Locale } from "../../lib/i18n";
import { updateUserProfile } from "../../services/supabaseServices";
import type { Horse as HorseType, HorseHealthDocument, UserProfile, UserProfileUpdateInput } from "../../types/domain";
import type { ViewKey } from "../../types/ui";
import { uiText } from "../dashboard/shared";

type OnboardingStep = {
  key: string;
  icon: typeof User;
  label: string;
  description: string;
  done: boolean;
  viewKey?: ViewKey;
  optional?: boolean;
};

function profileIsComplete(profile: UserProfile) {
  return Boolean(profile.first_name && profile.last_name && profile.address && profile.city);
}

function buildOnboardingSteps(
  profile: UserProfile,
  horses: HorseType[],
  horseHealthDocuments: HorseHealthDocument[],
  locale: Locale,
): OnboardingStep[] {
  const hasHealthDoc = horseHealthDocuments.some((d) => d.status === "approved" || d.status === "verified");

  return [
    {
      key: "profile",
      icon: User,
      label: uiText(locale, "Profil personnel", "Personal profile"),
      description: uiText(locale, "Nom, date de naissance, adresse complète pour la facturation.", "Name, date of birth, full address for billing."),
      done: profileIsComplete(profile),
    },
    {
      key: "horses",
      icon: ClipboardList,
      label: uiText(locale, "Mes chevaux", "My horses"),
      description: uiText(locale, "Ajoute au moins un cheval à ton profil.", "Add at least one horse to your profile."),
      done: horses.length > 0,
      viewKey: "my-horses",
    },
    {
      key: "riders",
      icon: Users,
      label: uiText(locale, "Mes cavaliers", "My riders"),
      description: uiText(locale, "Ajoute les cavaliers que tu gères (toi-même, tes enfants, tes clients).", "Add the riders you manage (yourself, your children, your clients)."),
      done: false,
      viewKey: "my-riders",
      optional: true,
    },
    {
      key: "health",
      icon: Stethoscope,
      label: uiText(locale, "Documents de santé", "Health documents"),
      description: uiText(locale, "Coggins et vaccins — requis pour la plupart des concours.", "Coggins and vaccines — required for most shows."),
      done: hasHealthDoc,
      viewKey: "my-horses",
      optional: true,
    },
  ];
}

function ChecklistItem({
  step,
  onNavigate,
}: {
  step: OnboardingStep;
  onNavigate: (view: ViewKey) => void;
}) {
  const Icon = step.icon;

  return (
    <div className={`onboarding-step ${step.done ? "done" : "pending"}`}>
      <div className="onboarding-step-status">
        {step.done ? <CheckCircle2 size={20} className="onboarding-check" /> : <Circle size={20} className="onboarding-circle" />}
      </div>
      <div className="onboarding-step-icon">
        <Icon size={18} />
      </div>
      <div className="onboarding-step-content">
        <strong>
          {step.label}
          {step.optional ? <span className="onboarding-optional"> — optionnel</span> : null}
        </strong>
        <p>{step.description}</p>
      </div>
      {!step.done && step.viewKey ? (
        <button className="text-button onboarding-step-cta" type="button" onClick={() => onNavigate(step.viewKey!)}>
          Compléter <ChevronRight size={14} />
        </button>
      ) : null}
    </div>
  );
}

function ProfileView({
  locale,
  horses,
  horseHealthDocuments,
  profile,
  onUpdateUserProfile,
  onViewChange,
}: {
  locale: Locale;
  horses: HorseType[];
  horseHealthDocuments: HorseHealthDocument[];
  profile: UserProfile;
  onUpdateUserProfile: (id: string, input: UserProfileUpdateInput) => Promise<void>;
  onViewChange: (view: ViewKey) => void;
}) {
  const steps = buildOnboardingSteps(profile, horses, horseHealthDocuments, locale);
  const completedCount = steps.filter((s) => s.done).length;
  const isFullyComplete = completedCount === steps.length;

  const [editingProfile, setEditingProfile] = useState(!profileIsComplete(profile));
  const [submitting, setSubmitting] = useState(false);

  const [firstName, setFirstName] = useState(profile.first_name ?? "");
  const [lastName, setLastName] = useState(profile.last_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(profile.date_of_birth ?? "");
  const [address, setAddress] = useState(profile.address ?? "");
  const [addressLine2, setAddressLine2] = useState(profile.address_line2 ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [state, setState] = useState(profile.state ?? "");
  const [zipCode, setZipCode] = useState(profile.zip_code ?? "");
  const [country, setCountry] = useState(profile.country ?? "CA");
  const [marketingOptIn, setMarketingOptIn] = useState(profile.marketing_opt_in);

  async function handleSubmitProfile(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onUpdateUserProfile(profile.id, {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        phone: phone.trim() || null,
        date_of_birth: dateOfBirth || null,
        address: address.trim() || null,
        address_line2: addressLine2.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        zip_code: zipCode.trim() || null,
        country: country.trim() || null,
        marketing_opt_in: marketingOptIn,
      });
      setEditingProfile(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Mon espace", "My space")}
        title={uiText(locale, "Mon profil", "My profile")}
        description={uiText(locale, "Tes informations personnelles, utilisées pour la facturation et tes inscriptions.", "Your personal information, used for billing and entries.")}
        stats={[
          { label: uiText(locale, "Étapes complétées", "Steps completed"), value: `${completedCount}/${steps.length}` },
        ]}
      />

      <section className="panel span-2 onboarding-checklist-panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Configuration du profil", "Profile setup")}</h2>
            <p>
              {isFullyComplete
                ? uiText(locale, "Ton profil est complet. Tu es prêt à t'inscrire à un concours.", "Your profile is complete. You're ready to enter a show.")
                : uiText(locale, "Complete les étapes ci-dessous pour participer à un concours.", "Complete the steps below to participate in a show.")}
            </p>
          </div>
          {isFullyComplete ? (
            <a className="primary-button" href="/">
              {uiText(locale, "Explorer les concours", "Browse shows")}
            </a>
          ) : null}
        </div>
        <div className="onboarding-steps">
          {steps.map((step) => (
            <ChecklistItem key={step.key} step={step} onNavigate={onViewChange} />
          ))}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Informations personnelles", "Personal information")}</h2>
            <p>{uiText(locale, "Utilisées pour tes factures et tes inscriptions.", "Used for your invoices and entries.")}</p>
          </div>
          {!editingProfile ? (
            <button className="ghost-button" type="button" onClick={() => setEditingProfile(true)}>
              {uiText(locale, "Modifier", "Edit")}
            </button>
          ) : null}
        </div>

        {!editingProfile ? (
          <div className="profile-summary">
            <div className="profile-summary-row">
              <span>{uiText(locale, "Nom complet", "Full name")}</span>
              <strong>{[profile.first_name, profile.last_name].filter(Boolean).join(" ") || <em className="muted-line">{uiText(locale, "Non renseigné", "Not set")}</em>}</strong>
            </div>
            <div className="profile-summary-row">
              <span>{uiText(locale, "Téléphone", "Phone")}</span>
              <strong>{profile.phone || <em className="muted-line">{uiText(locale, "Non renseigné", "Not set")}</em>}</strong>
            </div>
            <div className="profile-summary-row">
              <span>{uiText(locale, "Date de naissance", "Date of birth")}</span>
              <strong>{profile.date_of_birth || <em className="muted-line">{uiText(locale, "Non renseignée", "Not set")}</em>}</strong>
            </div>
            <div className="profile-summary-row">
              <span>{uiText(locale, "Adresse", "Address")}</span>
              <div>
                {profile.address ? (
                  <>
                    <strong>{profile.address}</strong>
                    {profile.address_line2 ? <div>{profile.address_line2}</div> : null}
                    <div className="muted-line">{[profile.city, profile.state, profile.zip_code, profile.country].filter(Boolean).join(", ")}</div>
                  </>
                ) : (
                  <em className="muted-line">{uiText(locale, "Non renseignée", "Not set")}</em>
                )}
              </div>
            </div>
            <div className="profile-summary-row">
              <span>{uiText(locale, "Infolettres", "Newsletter")}</span>
              <strong>{profile.marketing_opt_in ? uiText(locale, "Abonné", "Subscribed") : uiText(locale, "Non abonné", "Not subscribed")}</strong>
            </div>
          </div>
        ) : (
          <form className="form-grid profile-form" onSubmit={handleSubmitProfile}>
            <div className="form-row-2">
              <div className="form-field">
                <label>{uiText(locale, "Prénom", "First name")}</label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="form-field">
                <label>{uiText(locale, "Nom de famille", "Last name")}</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-field">
                <label>{uiText(locale, "Téléphone", "Phone")}</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="form-field">
                <label>{uiText(locale, "Date de naissance", "Date of birth")}</label>
                <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              </div>
            </div>
            <div className="form-field">
              <label>{uiText(locale, "Adresse", "Address")}</label>
              <input type="text" value={address} placeholder={uiText(locale, "123 Rue principale", "123 Main Street")} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="form-field">
              <label>{uiText(locale, "Appartement / suite (optionnel)", "Apartment / suite (optional)")}</label>
              <input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
            </div>
            <div className="form-row-2">
              <div className="form-field">
                <label>{uiText(locale, "Ville", "City")}</label>
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="form-field">
                <label>{uiText(locale, "Province / État", "Province / State")}</label>
                <input type="text" value={state} onChange={(e) => setState(e.target.value)} />
              </div>
            </div>
            <div className="form-row-2">
              <div className="form-field">
                <label>{uiText(locale, "Code postal", "Postal code")}</label>
                <input type="text" value={zipCode} onChange={(e) => setZipCode(e.target.value)} />
              </div>
              <div className="form-field">
                <label>{uiText(locale, "Pays", "Country")}</label>
                <select value={country} onChange={(e) => setCountry(e.target.value)}>
                  <option value="CA">Canada</option>
                  <option value="US">États-Unis / United States</option>
                  <option value="FR">France</option>
                  <option value="BE">Belgique / Belgium</option>
                  <option value="CH">Suisse / Switzerland</option>
                </select>
              </div>
            </div>
            <div className="form-field">
              <label className="checkbox-label">
                <input type="checkbox" checked={marketingOptIn} onChange={(e) => setMarketingOptIn(e.target.checked)} />
                {uiText(locale, "Je souhaite recevoir les nouvelles et offres par courriel", "I'd like to receive news and offers by email")}
              </label>
            </div>
            <div className="form-actions">
              <button className="primary-button" disabled={submitting} type="submit">
                {submitting ? uiText(locale, "Enregistrement...", "Saving...") : uiText(locale, "Enregistrer", "Save")}
              </button>
              {profileIsComplete(profile) ? (
                <button className="ghost-button" type="button" onClick={() => setEditingProfile(false)}>
                  {uiText(locale, "Annuler", "Cancel")}
                </button>
              ) : null}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

export { ProfileView, profileIsComplete };
