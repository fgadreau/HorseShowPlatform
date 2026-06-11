import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { EmptyState, FormActions, NoticeBanner, ViewIntro } from "../../components/ui";
import { canadianProvinceOptions, countryOptions, currencyOptions, taxPresetById, taxPresetForLocation, taxPresetIdForValues, taxPresetsForLocation, type TaxPreset } from "../../lib/billingSettings";
import { errorMessage, numericValue } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { AppContext } from "../../services/supabaseServices";
import { setOrganizationExternalMembershipRequirement, updateOrganizationHealthSettings } from "../../services/supabaseServices";
import { organizationCogginsValidityMonths, organizationRequiresHealthVerification } from "../../lib/health";
import type { ExternalOrganization, Organization, OrganizationBackNumber, OrganizationExternalMembershipRequirement, SanctioningBody } from "../../types/domain";
import { uiText, organizationBackNumberMode } from "../dashboard/shared";
import { backNumberPolicyLabel } from "../classes/classUtils";

type OrganizationBillingFormState = {
  name: string;
  shortName: string;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  billingName: string;
  billingEmail: string;
  billingPhone: string;
  address: string;
  addressLine2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  currency: string;
  taxPresetId: string;
  taxName: string;
  taxRate: string;
  taxNumber: string;
  secondaryTaxName: string;
  secondaryTaxNumber: string;
};

function organizationBillingFormState(organization: Organization | null): OrganizationBillingFormState {
  const country = (organization?.country ?? "CA").toUpperCase();
  const state = (organization?.state ?? (country === "CA" ? "QC" : "")).toUpperCase();
  const locationPreset = taxPresetForLocation(country, state);
  const taxName = organization?.tax_name ?? locationPreset.taxName;
  const taxRate = organization?.tax_rate ?? locationPreset.rate ?? 0;

  return {
    name: organization?.name ?? "",
    shortName: organization?.short_name ?? "",
    primaryContactName: organization?.primary_contact_name ?? "",
    primaryContactEmail: organization?.primary_contact_email ?? "",
    primaryContactPhone: organization?.primary_contact_phone ?? "",
    billingName: organization?.billing_name ?? organization?.name ?? "",
    billingEmail: organization?.billing_email ?? organization?.primary_contact_email ?? "",
    billingPhone: organization?.billing_phone ?? organization?.primary_contact_phone ?? "",
    address: organization?.address ?? "",
    addressLine2: organization?.address_line2 ?? "",
    city: organization?.city ?? "",
    state,
    zipCode: organization?.zip_code ?? "",
    country,
    currency: organization?.currency ?? "CAD",
    taxPresetId: taxPresetIdForValues(country, state, taxRate, taxName),
    taxName,
    taxRate: taxRateValue(taxRate),
    taxNumber: organization?.tax_number ?? "",
    secondaryTaxName: organization?.secondary_tax_name ?? locationPreset.secondaryTaxName ?? "",
    secondaryTaxNumber: organization?.secondary_tax_number ?? "",
  };
}

function applyTaxPresetToBillingForm(current: OrganizationBillingFormState, preset: TaxPreset, preserveManualRate = false): OrganizationBillingFormState {
  return {
    ...current,
    taxPresetId: preset.id,
    taxName: preset.taxName,
    taxRate: preset.rate == null ? (preserveManualRate ? current.taxRate : "0") : taxRateValue(preset.rate),
    secondaryTaxName: preset.secondaryTaxName ?? "",
  };
}

function taxRateValue(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function taxRateNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function SettingsView({
  locale = "fr",
  context,
  externalOrganizations,
  membershipRequirements,
  organization,
  onSetExternalMembershipRequirement,
  onUpdateOrganizationHealthSettings,
}: {
  locale?: Locale;
  context: AppContext | null;
  externalOrganizations: ExternalOrganization[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  organization: Organization | null;
  onSetExternalMembershipRequirement: (input: Parameters<typeof setOrganizationExternalMembershipRequirement>[0]) => Promise<void>;
  onUpdateOrganizationHealthSettings: (id: string, input: Parameters<typeof updateOrganizationHealthSettings>[1]) => Promise<void>;
}) {
  const [busyRequirementId, setBusyRequirementId] = useState("");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingForm, setBillingForm] = useState<OrganizationBillingFormState>(() => organizationBillingFormState(organization));
  const [healthBusy, setHealthBusy] = useState(false);
  const [backNumberPolicy, setBackNumberPolicy] = useState<OrganizationBackNumber["assignment_mode"]>(organizationBackNumberMode(organization));
  const [healthRequired, setHealthRequired] = useState(organizationRequiresHealthVerification(organization));
  const [cogginsValidityMonths, setCogginsValidityMonths] = useState<6 | 12>(organizationCogginsValidityMonths(organization));
  const isCanadaBillingAddress = billingForm.country === "CA";
  const availableTaxPresets = taxPresetsForLocation(billingForm.country, billingForm.state);
  const selectedTaxPresetId = availableTaxPresets.some((preset) => preset.id === billingForm.taxPresetId) ? billingForm.taxPresetId : "manual";
  const riderRequirementIds = new Set(
    membershipRequirements
      .filter((requirement) => requirement.contact_type === "rider" && requirement.is_required)
      .map((requirement) => requirement.external_organization_id),
  );

  useEffect(() => {
    setBillingForm(organizationBillingFormState(organization));
    setBackNumberPolicy(organizationBackNumberMode(organization));
    setHealthRequired(organizationRequiresHealthVerification(organization));
    setCogginsValidityMonths(organizationCogginsValidityMonths(organization));
  }, [organization]);

  function handleBillingFieldChange(field: keyof OrganizationBillingFormState, value: string) {
    setBillingForm((current) => {
      let next = { ...current, [field]: value };

      if (field === "country") {
        next.country = value.toUpperCase();

        if (next.country === "CA" && !canadianProvinceOptions.some((province) => province.value === next.state)) {
          next.state = "QC";
        }

        next = applyTaxPresetToBillingForm(next, taxPresetForLocation(next.country, next.state));
      }

      if (field === "state") {
        next.state = value.toUpperCase();
        next = applyTaxPresetToBillingForm(next, taxPresetForLocation(next.country, next.state));
      }

      return next;
    });
  }

  function handleTaxPresetChange(presetId: string) {
    const preset = taxPresetById(presetId);
    setBillingForm((current) => applyTaxPresetToBillingForm({ ...current, taxPresetId: preset.id }, preset, true));
  }

  async function handleRequirementToggle(externalOrganizationId: string, isRequired: boolean) {
    if (!organization) {
      return;
    }

    setBusyRequirementId(externalOrganizationId);

    try {
      await onSetExternalMembershipRequirement({
        organization_id: organization.id,
        external_organization_id: externalOrganizationId,
        contact_type: "rider",
        is_required: isRequired,
      });
    } finally {
      setBusyRequirementId("");
    }
  }

  async function handleHealthSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization) {
      return;
    }

    setHealthBusy(true);

    try {
      await onUpdateOrganizationHealthSettings(organization.id, {
        back_number_policy: backNumberPolicy,
        health_verification_required: healthRequired,
        coggins_validity_months: cogginsValidityMonths,
      });
    } finally {
      setHealthBusy(false);
    }
  }

  async function handleBillingSettingsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !billingForm.name.trim()) {
      return;
    }

    setBillingBusy(true);

    try {
      await onUpdateOrganizationHealthSettings(organization.id, {
        name: billingForm.name,
        short_name: billingForm.shortName,
        primary_contact_name: billingForm.primaryContactName,
        primary_contact_email: billingForm.primaryContactEmail,
        primary_contact_phone: billingForm.primaryContactPhone,
        billing_name: billingForm.billingName,
        billing_email: billingForm.billingEmail,
        billing_phone: billingForm.billingPhone,
        address: billingForm.address,
        address_line2: billingForm.addressLine2,
        city: billingForm.city,
        state: billingForm.state,
        zip_code: billingForm.zipCode,
        country: billingForm.country,
        currency: billingForm.currency,
        tax_rate: taxRateNumber(billingForm.taxRate),
        tax_name: billingForm.taxName,
        tax_number: billingForm.taxNumber,
        secondary_tax_name: billingForm.secondaryTaxName,
        secondary_tax_number: billingForm.secondaryTaxNumber,
      });
    } finally {
      setBillingBusy(false);
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Paramètres", "Settings")}
        title={uiText(locale, "Profil et association", "Profile and association")}
        description={uiText(locale, "Vérifie le profil connecté, le rôle, la devise, les taxes et les règles de l'association.", "Review the signed-in profile, role, currency, taxes and association rules.")}
      />

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Profil", "Profile")}</h2>
            <p>{context?.profile ? `${context.profile.first_name ?? ""} ${context.profile.last_name ?? ""}`.trim() || uiText(locale, "Utilisateur connecté", "Signed-in user") : uiText(locale, "Chargement", "Loading")}</p>
          </div>
        </div>
        <dl className="detail-list">
          <div>
            <dt>{uiText(locale, "Type de rôle", "Role type")}</dt>
            <dd>{context?.profile.type_user ?? uiText(locale, "Non défini", "Unset")}</dd>
          </div>
          <div>
            <dt>{uiText(locale, "ID du profil", "Profile ID")}</dt>
            <dd>{context?.profile.id ?? uiText(locale, "En attente", "Pending")}</dd>
          </div>
        </dl>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Informations de facturation", "Billing information")}</h2>
            <p>{organization?.slug ?? uiText(locale, "Aucune association sélectionnée", "No association selected")}</p>
          </div>
        </div>
        <form className="stack" onSubmit={handleBillingSettingsSubmit}>
          <div className="form-grid">
            <label>
              {uiText(locale, "Nom de l'association", "Association name")}
              <input disabled={!organization || billingBusy} value={billingForm.name} onChange={(event) => handleBillingFieldChange("name", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Abréviation", "Short name")}
              <input disabled={!organization || billingBusy} value={billingForm.shortName} onChange={(event) => handleBillingFieldChange("shortName", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Contact principal", "Primary contact")}
              <input disabled={!organization || billingBusy} value={billingForm.primaryContactName} onChange={(event) => handleBillingFieldChange("primaryContactName", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Courriel principal", "Primary email")}
              <input disabled={!organization || billingBusy} type="email" value={billingForm.primaryContactEmail} onChange={(event) => handleBillingFieldChange("primaryContactEmail", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Téléphone principal", "Primary phone")}
              <input disabled={!organization || billingBusy} value={billingForm.primaryContactPhone} onChange={(event) => handleBillingFieldChange("primaryContactPhone", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Nom légal sur facture", "Legal billing name")}
              <input disabled={!organization || billingBusy} value={billingForm.billingName} onChange={(event) => handleBillingFieldChange("billingName", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Courriel de facturation", "Billing email")}
              <input disabled={!organization || billingBusy} type="email" value={billingForm.billingEmail} onChange={(event) => handleBillingFieldChange("billingEmail", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Téléphone de facturation", "Billing phone")}
              <input disabled={!organization || billingBusy} value={billingForm.billingPhone} onChange={(event) => handleBillingFieldChange("billingPhone", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Adresse", "Address")}
              <input disabled={!organization || billingBusy} value={billingForm.address} onChange={(event) => handleBillingFieldChange("address", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Appartement, bureau ou suite", "Apartment, office or suite")}
              <input disabled={!organization || billingBusy} value={billingForm.addressLine2} onChange={(event) => handleBillingFieldChange("addressLine2", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Ville", "City")}
              <input disabled={!organization || billingBusy} value={billingForm.city} onChange={(event) => handleBillingFieldChange("city", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Pays", "Country")}
              <select disabled={!organization || billingBusy} value={billingForm.country} onChange={(event) => handleBillingFieldChange("country", event.target.value)}>
                {countryOptions.map((country) => (
                  <option key={country.value} value={country.value}>
                    {country.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {isCanadaBillingAddress ? uiText(locale, "Province", "Province") : uiText(locale, "État / région", "State / region")}
              {isCanadaBillingAddress ? (
                <select disabled={!organization || billingBusy} value={billingForm.state} onChange={(event) => handleBillingFieldChange("state", event.target.value)}>
                  {canadianProvinceOptions.map((province) => (
                    <option key={province.value} value={province.value}>
                      {province.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input disabled={!organization || billingBusy} value={billingForm.state} onChange={(event) => handleBillingFieldChange("state", event.target.value)} />
              )}
            </label>
            <label>
              {uiText(locale, "Code postal", "Postal code")}
              <input disabled={!organization || billingBusy} value={billingForm.zipCode} onChange={(event) => handleBillingFieldChange("zipCode", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Devise", "Currency")}
              <select disabled={!organization || billingBusy} value={billingForm.currency} onChange={(event) => handleBillingFieldChange("currency", event.target.value)}>
                {currencyOptions.map((currency) => (
                  <option key={currency.value} value={currency.value}>
                    {currency.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {uiText(locale, "Taxe de vente", "Sales tax")}
              <select disabled={!organization || billingBusy} value={selectedTaxPresetId} onChange={(event) => handleTaxPresetChange(event.target.value)}>
                {availableTaxPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <span className="input-help">{uiText(locale, "Le taux reste modifiable pour les exemptions, exceptions ou taxes locales.", "The rate remains editable for exemptions, exceptions or local taxes.")}</span>
            </label>
            <label>
              {uiText(locale, "Taux de taxe effectif (%)", "Effective tax rate (%)")}
              <input disabled={!organization || billingBusy} min="0" step="0.001" type="number" value={billingForm.taxRate} onChange={(event) => handleBillingFieldChange("taxRate", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Libellé de taxe principale", "Primary tax label")}
              <input disabled={!organization || billingBusy} value={billingForm.taxName} onChange={(event) => handleBillingFieldChange("taxName", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "No de taxe principale", "Primary tax number")}
              <input disabled={!organization || billingBusy} value={billingForm.taxNumber} onChange={(event) => handleBillingFieldChange("taxNumber", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Libellé de taxe secondaire", "Secondary tax label")}
              <input disabled={!organization || billingBusy} placeholder="TVQ, PST, RST..." value={billingForm.secondaryTaxName} onChange={(event) => handleBillingFieldChange("secondaryTaxName", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "No de taxe secondaire", "Secondary tax number")}
              <input disabled={!organization || billingBusy} value={billingForm.secondaryTaxNumber} onChange={(event) => handleBillingFieldChange("secondaryTaxNumber", event.target.value)} />
            </label>
          </div>
          <button className="primary-button" disabled={!organization || billingBusy || !billingForm.name.trim()} type="submit">
            {billingBusy ? uiText(locale, "Enregistrement...", "Saving...") : uiText(locale, "Enregistrer les infos de facturation", "Save billing information")}
          </button>
        </form>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Numéros externes obligatoires", "Required external numbers")}</h2>
            <p>{uiText(locale, "Exigences appliquées aux fiches de cavalier de cette association.", "Requirements applied to rider records for this association.")}</p>
          </div>
        </div>
        <div className="requirement-list">
          {externalOrganizations.map((externalOrganization) => {
            const checked = riderRequirementIds.has(externalOrganization.id);
            return (
              <label className="requirement-row" key={externalOrganization.id}>
                <input
                  checked={checked}
                  disabled={!organization || busyRequirementId === externalOrganization.id}
                  type="checkbox"
                  onChange={(event) => void handleRequirementToggle(externalOrganization.id, event.target.checked)}
                />
                <span>
                  <strong>{externalOrganization.code}</strong>
                  {externalOrganization.name}
                </span>
                <small>{externalOrganization.verification_enabled ? uiText(locale, "Validation externe prête", "External validation ready") : uiText(locale, "Validation manuelle", "Manual validation")}</small>
              </label>
            );
          })}
          {!externalOrganizations.length ? <EmptyState label={uiText(locale, "Aucune organisation externe configurée.", "No external organization configured.")} /> : null}
        </div>
      </section>

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Dossards et statut santé", "Back numbers and health status")}</h2>
            <p>{uiText(locale, "Règles utilisées pour les dossards, les inscriptions et les réservations de stalls.", "Rules used for back numbers, entries and stall reservations.")}</p>
          </div>
        </div>
        <form className="stack" onSubmit={handleHealthSettingsSubmit}>
          <label>
            {uiText(locale, "Politique de dossard de l'association", "Association back number policy")}
            <select disabled={!organization || healthBusy} value={backNumberPolicy} onChange={(event) => setBackNumberPolicy(event.target.value as OrganizationBackNumber["assignment_mode"])}>
              <option value="horse">{uiText(locale, "Par cheval", "By horse")}</option>
              <option value="rider">{uiText(locale, "Par cavalier", "By rider")}</option>
              <option value="horse_rider_team">{uiText(locale, "Par équipe cheval+cavalier", "By horse+rider team")}</option>
            </select>
            <span className="input-help">{uiText(locale, "Les utilisateurs ne choisissent pas ce mode: l'app applique automatiquement la politique de l'association active.", "Users do not choose this mode: the app automatically applies the active association policy.")}</span>
          </label>
          <label className="requirement-row">
            <input checked={healthRequired} disabled={!organization || healthBusy} type="checkbox" onChange={(event) => setHealthRequired(event.target.checked)} />
            <span>
              <strong>{uiText(locale, "Exiger les documents santé valides", "Require valid health documents")}</strong>
              {uiText(locale, "Bloque les inscriptions et les stalls rattachés à un cheval si le Coggins ou le vaccin influenza/rhino ne couvre pas la date du concours.", "Blocks entries and stalls linked to a horse if the Coggins or influenza/rhino vaccine does not cover the show date.")}
            </span>
            <small>{healthRequired ? uiText(locale, "Validation obligatoire", "Validation required") : uiText(locale, "Validation non exigée", "Validation not required")}</small>
          </label>
          <label>
            {uiText(locale, "Durée de validité des documents santé", "Health document validity period")}
            <select disabled={!organization || healthBusy || !healthRequired} value={cogginsValidityMonths} onChange={(event) => setCogginsValidityMonths(Number(event.target.value) === 6 ? 6 : 12)}>
              <option value={6}>6 mois</option>
              <option value={12}>12 mois</option>
            </select>
          </label>
          <button className="primary-button" disabled={!organization || healthBusy} type="submit">
            {healthBusy ? uiText(locale, "Enregistrement...", "Saving...") : uiText(locale, "Enregistrer les règles", "Save rules")}
          </button>
        </form>
      </section>
    </div>
  );
}


export { SettingsView };
