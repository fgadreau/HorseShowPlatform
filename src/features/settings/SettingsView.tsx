import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EmptyState, ViewIntro } from "../../components/ui";
import { canadianProvinceOptions, countryOptions, currencyOptions, taxPresetById, taxPresetForLocation, taxPresetIdForValues, taxPresetsForLocation, type TaxPreset } from "../../lib/billingSettings";
import { errorMessage, formatCurrency, formatDate, numericValue } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { AppContext } from "../../services/supabaseServices";
import { createOrganizationMembershipType, createOrganizationProduct, setOrganizationExternalMembershipRequirement, updateOrganizationHealthSettings, updateOrganizationMembershipType, updateOrganizationProduct } from "../../services/supabaseServices";
import { organizationCogginsValidityMonths, organizationRequiresHealthVerification } from "../../lib/health";
import type { ExternalOrganization, Organization, OrganizationBackNumber, OrganizationExternalMembershipRequirement, OrganizationMembershipType, OrganizationProduct, ProductCategory, SanctioningBody } from "../../types/domain";
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

type MembershipTypeFormState = {
  id: string;
  name: string;
  code: string;
  description: string;
  seasonYear: string;
  price: string;
  taxApplicable: boolean;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
};

type ProductFormState = {
  id: string;
  name: string;
  code: string;
  description: string;
  category: ProductCategory;
  defaultPrice: string;
  taxApplicable: boolean;
  isActive: boolean;
};

const productCategoryOptions: ProductCategory[] = ["stall_extra", "feed", "merch", "ticket", "meal", "admin_fee", "manual"];

function currentSeasonYear() {
  return new Date().getFullYear();
}

function seasonStartDate(year: number) {
  return `${year}-01-01`;
}

function seasonEndDate(year: number) {
  return `${year}-12-31`;
}

function membershipTypeFormState(type?: OrganizationMembershipType | null): MembershipTypeFormState {
  const seasonYear = type?.season_year ?? currentSeasonYear();
  return {
    id: type?.id ?? "",
    name: type?.name ?? "",
    code: type?.code ?? "",
    description: type?.description ?? "",
    seasonYear: String(seasonYear),
    price: type ? String(type.price ?? 0) : "",
    taxApplicable: type?.tax_applicable ?? true,
    validFrom: type?.valid_from ?? seasonStartDate(seasonYear),
    validUntil: type?.valid_until ?? seasonEndDate(seasonYear),
    isActive: type?.is_active ?? true,
  };
}

function productFormState(product?: OrganizationProduct | null): ProductFormState {
  return {
    id: product?.id ?? "",
    name: product?.name ?? "",
    code: product?.code ?? "",
    description: product?.description ?? "",
    category: product?.category ?? "manual",
    defaultPrice: product ? String(product.default_price ?? 0) : "",
    taxApplicable: product?.tax_applicable ?? true,
    isActive: product?.is_active ?? true,
  };
}

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

function SettingsSection({
  children,
  className = "panel span-2",
  collapseLabel,
  defaultOpen = false,
  description,
  expandLabel,
  title,
}: {
  children: ReactNode;
  className?: string;
  collapseLabel: string;
  defaultOpen?: boolean;
  description?: ReactNode;
  expandLabel: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`${className} settings-section ${isOpen ? "is-open" : "is-collapsed"}`}>
      <div className="panel-header settings-section-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <button
          aria-expanded={isOpen}
          aria-label={`${isOpen ? collapseLabel : expandLabel} ${title}`}
          className="icon-button settings-section-toggle"
          type="button"
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>
      {isOpen ? <div className="settings-section-body">{children}</div> : null}
    </section>
  );
}

function SettingsView({
  locale = "fr",
  context,
  externalOrganizations,
  membershipRequirements,
  membershipTypes,
  organization,
  onCreateOrganizationMembershipType,
  onCreateOrganizationProduct,
  onSetExternalMembershipRequirement,
  onUpdateOrganizationHealthSettings,
  onUpdateOrganizationMembershipType,
  onUpdateOrganizationProduct,
  products,
}: {
  locale?: Locale;
  context: AppContext | null;
  externalOrganizations: ExternalOrganization[];
  membershipRequirements: OrganizationExternalMembershipRequirement[];
  membershipTypes: OrganizationMembershipType[];
  organization: Organization | null;
  onCreateOrganizationMembershipType: (input: Parameters<typeof createOrganizationMembershipType>[0]) => Promise<void>;
  onCreateOrganizationProduct: (input: Parameters<typeof createOrganizationProduct>[0]) => Promise<void>;
  onSetExternalMembershipRequirement: (input: Parameters<typeof setOrganizationExternalMembershipRequirement>[0]) => Promise<void>;
  onUpdateOrganizationHealthSettings: (id: string, input: Parameters<typeof updateOrganizationHealthSettings>[1]) => Promise<void>;
  onUpdateOrganizationMembershipType: (id: string, input: Parameters<typeof updateOrganizationMembershipType>[1]) => Promise<void>;
  onUpdateOrganizationProduct: (id: string, input: Parameters<typeof updateOrganizationProduct>[1]) => Promise<void>;
  products: OrganizationProduct[];
}) {
  const [busyRequirementId, setBusyRequirementId] = useState("");
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingForm, setBillingForm] = useState<OrganizationBillingFormState>(() => organizationBillingFormState(organization));
  const [membershipBusyId, setMembershipBusyId] = useState("");
  const [membershipTypeForm, setMembershipTypeForm] = useState<MembershipTypeFormState>(() => membershipTypeFormState());
  const [productBusyId, setProductBusyId] = useState("");
  const [productForm, setProductForm] = useState<ProductFormState>(() => productFormState());
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
  const sortedMembershipTypes = [...membershipTypes].sort((left, right) => {
    if (left.season_year !== right.season_year) {
      return right.season_year - left.season_year;
    }
    return left.name.localeCompare(right.name);
  });
  const sortedProducts = [...products].sort((left, right) => {
    if (left.category !== right.category) {
      return left.category.localeCompare(right.category);
    }
    return left.name.localeCompare(right.name);
  });
  const sectionToggleLabels = {
    collapseLabel: uiText(locale, "Replier", "Collapse"),
    expandLabel: uiText(locale, "Ouvrir", "Open"),
  };

  useEffect(() => {
    setBillingForm(organizationBillingFormState(organization));
    setMembershipTypeForm(membershipTypeFormState());
    setProductForm(productFormState());
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

  function handleMembershipTypeFieldChange(field: keyof MembershipTypeFormState, value: string | boolean) {
    setMembershipTypeForm((current) => {
      const next = { ...current, [field]: value };

      if (field === "seasonYear") {
        const seasonYear = Number(value) || currentSeasonYear();
        next.validFrom = seasonStartDate(seasonYear);
        next.validUntil = seasonEndDate(seasonYear);
      }

      return next;
    });
  }

  async function handleMembershipTypeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !membershipTypeForm.name.trim()) {
      return;
    }

    const seasonYear = Number(membershipTypeForm.seasonYear) || currentSeasonYear();
    const payload = {
      name: membershipTypeForm.name,
      code: membershipTypeForm.code,
      description: membershipTypeForm.description,
      season_year: seasonYear,
      price: numericValue(membershipTypeForm.price) ?? 0,
      tax_applicable: membershipTypeForm.taxApplicable,
      valid_from: membershipTypeForm.validFrom || seasonStartDate(seasonYear),
      valid_until: membershipTypeForm.validUntil || seasonEndDate(seasonYear),
      is_active: membershipTypeForm.isActive,
    };

    setMembershipBusyId(membershipTypeForm.id || "new");

    try {
      if (membershipTypeForm.id) {
        await onUpdateOrganizationMembershipType(membershipTypeForm.id, payload);
      } else {
        await onCreateOrganizationMembershipType({
          ...payload,
          organization_id: organization.id,
        });
      }

      setMembershipTypeForm(membershipTypeFormState());
    } finally {
      setMembershipBusyId("");
    }
  }

  async function handleMembershipTypeActiveToggle(type: OrganizationMembershipType) {
    setMembershipBusyId(type.id);

    try {
      await onUpdateOrganizationMembershipType(type.id, {
        is_active: !type.is_active,
      });
    } finally {
      setMembershipBusyId("");
    }
  }

  function handleProductFieldChange(field: keyof ProductFormState, value: string | boolean) {
    setProductForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleProductSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!organization || !productForm.name.trim()) {
      return;
    }

    const payload = {
      name: productForm.name,
      code: productForm.code,
      description: productForm.description,
      category: productForm.category,
      default_price: numericValue(productForm.defaultPrice) ?? 0,
      tax_applicable: productForm.taxApplicable,
      is_active: productForm.isActive,
    };

    setProductBusyId(productForm.id || "new");

    try {
      if (productForm.id) {
        await onUpdateOrganizationProduct(productForm.id, payload);
      } else {
        await onCreateOrganizationProduct({
          ...payload,
          organization_id: organization.id,
        });
      }

      setProductForm(productFormState());
    } finally {
      setProductBusyId("");
    }
  }

  async function handleProductActiveToggle(product: OrganizationProduct) {
    setProductBusyId(product.id);

    try {
      await onUpdateOrganizationProduct(product.id, {
        is_active: !product.is_active,
      });
    } finally {
      setProductBusyId("");
    }
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

      <SettingsSection
        {...sectionToggleLabels}
        className="panel"
        title={uiText(locale, "Profil", "Profile")}
        description={context?.profile ? `${context.profile.first_name ?? ""} ${context.profile.last_name ?? ""}`.trim() || uiText(locale, "Utilisateur connecté", "Signed-in user") : uiText(locale, "Chargement", "Loading")}
      >
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
      </SettingsSection>

      <SettingsSection
        {...sectionToggleLabels}
        title={uiText(locale, "Produits association", "Association products")}
        description={uiText(locale, "Catalogue utilisé pour les ventes manuelles et, au besoin, les extras de réservation.", "Catalog used for manual sales and, when needed, reservation extras.")}
      >
        <div className="requirement-list">
          {sortedProducts.map((product) => (
            <div className="membership-type-row" key={product.id}>
              <span className="membership-type-main">
                <strong>{product.code ? `${product.code} · ${product.name}` : product.name}</strong>
                {`${productCategoryLabel(product.category, locale)} · ${formatCurrency(product.default_price, organization?.currency ?? "CAD")}`}
              </span>
              <div className="membership-type-actions">
                <small>{product.is_active ? uiText(locale, "Actif", "Active") : uiText(locale, "Inactif", "Inactive")}</small>
                <div className="row-actions">
                  <button className="secondary-button" disabled={!organization || Boolean(productBusyId)} type="button" onClick={() => setProductForm(productFormState(product))}>
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button className="secondary-button" disabled={!organization || Boolean(productBusyId)} type="button" onClick={() => void handleProductActiveToggle(product)}>
                    {product.is_active ? uiText(locale, "Désactiver", "Deactivate") : uiText(locale, "Activer", "Activate")}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!sortedProducts.length ? <EmptyState label={uiText(locale, "Aucun produit configuré.", "No product configured.")} /> : null}
        </div>
        <form className="stack" onSubmit={handleProductSubmit}>
          <div className="form-grid">
            <label>
              {uiText(locale, "Nom du produit", "Product name")}
              <input disabled={!organization || Boolean(productBusyId)} value={productForm.name} onChange={(event) => handleProductFieldChange("name", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Code / SKU", "Code / SKU")}
              <input disabled={!organization || Boolean(productBusyId)} value={productForm.code} onChange={(event) => handleProductFieldChange("code", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Catégorie", "Category")}
              <select disabled={!organization || Boolean(productBusyId)} value={productForm.category} onChange={(event) => handleProductFieldChange("category", event.target.value as ProductCategory)}>
                {productCategoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {productCategoryLabel(category, locale)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Prix par défaut", "Default price")}
              <input disabled={!organization || Boolean(productBusyId)} min="0" step="0.01" type="number" value={productForm.defaultPrice} onChange={(event) => handleProductFieldChange("defaultPrice", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Description", "Description")}
              <input disabled={!organization || Boolean(productBusyId)} value={productForm.description} onChange={(event) => handleProductFieldChange("description", event.target.value)} />
            </label>
          </div>
          <label className="requirement-row">
            <input checked={productForm.taxApplicable} disabled={!organization || Boolean(productBusyId)} type="checkbox" onChange={(event) => handleProductFieldChange("taxApplicable", event.target.checked)} />
            <span>
              <strong>{uiText(locale, "Taxable", "Taxable")}</strong>
              {uiText(locale, "Appliquer les taxes lorsque ce produit est vendu.", "Apply taxes when this product is sold.")}
            </span>
          </label>
          <label className="requirement-row">
            <input checked={productForm.isActive} disabled={!organization || Boolean(productBusyId)} type="checkbox" onChange={(event) => handleProductFieldChange("isActive", event.target.checked)} />
            <span>
              <strong>{uiText(locale, "Disponible à la vente", "Available for sale")}</strong>
              {uiText(locale, "Un produit inactif reste au catalogue mais n'est plus offert.", "An inactive product stays in the catalog but is no longer offered.")}
            </span>
          </label>
          <div className="row-actions">
            <button className="primary-button" disabled={!organization || Boolean(productBusyId) || !productForm.name.trim()} type="submit">
              {productBusyId
                ? uiText(locale, "Enregistrement...", "Saving...")
                : productForm.id
                  ? uiText(locale, "Enregistrer le produit", "Save product")
                  : uiText(locale, "Créer le produit", "Create product")}
            </button>
            {productForm.id ? (
              <button className="secondary-button" disabled={Boolean(productBusyId)} type="button" onClick={() => setProductForm(productFormState())}>
                {uiText(locale, "Annuler", "Cancel")}
              </button>
            ) : null}
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        {...sectionToggleLabels}
        title={uiText(locale, "Cartes de membre internes", "Internal memberships")}
        description={uiText(locale, "Types de cartes vendues directement par cette association, par saison.", "Membership cards sold directly by this association, by season.")}
      >
        <div className="requirement-list">
          {sortedMembershipTypes.map((type) => (
            <div className="membership-type-row" key={type.id}>
              <span className="membership-type-main">
                <strong>{type.code ? `${type.code} · ${type.name}` : type.name}</strong>
                {`${type.season_year} · ${formatCurrency(type.price, organization?.currency ?? "CAD")} · ${formatDate(type.valid_from)} - ${formatDate(type.valid_until)}`}
              </span>
              <div className="membership-type-actions">
                <small>{type.is_active ? uiText(locale, "Active", "Active") : uiText(locale, "Inactive", "Inactive")}</small>
                <div className="row-actions">
                  <button
                    className="secondary-button"
                    disabled={!organization || Boolean(membershipBusyId)}
                    type="button"
                    onClick={() => setMembershipTypeForm(membershipTypeFormState(type))}
                  >
                    {uiText(locale, "Modifier", "Edit")}
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!organization || Boolean(membershipBusyId)}
                    type="button"
                    onClick={() => void handleMembershipTypeActiveToggle(type)}
                  >
                    {type.is_active ? uiText(locale, "Désactiver", "Deactivate") : uiText(locale, "Activer", "Activate")}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!sortedMembershipTypes.length ? <EmptyState label={uiText(locale, "Aucun type de carte configuré.", "No membership type configured.")} /> : null}
        </div>
        <form className="stack" onSubmit={handleMembershipTypeSubmit}>
          <div className="form-grid">
            <label>
              {uiText(locale, "Nom de la carte", "Membership name")}
              <input disabled={!organization || Boolean(membershipBusyId)} value={membershipTypeForm.name} onChange={(event) => handleMembershipTypeFieldChange("name", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Code interne", "Internal code")}
              <input disabled={!organization || Boolean(membershipBusyId)} value={membershipTypeForm.code} onChange={(event) => handleMembershipTypeFieldChange("code", event.target.value)} />
              <span className="input-help">{uiText(locale, "Ex. AQR-REG ou JEUNESSE. Le code sert au filtrage et aux imports.", "Example: AQR-REG or YOUTH. The code is used for filtering and imports.")}</span>
            </label>
            <label>
              {uiText(locale, "Saison", "Season")}
              <input disabled={!organization || Boolean(membershipBusyId)} min="2020" type="number" value={membershipTypeForm.seasonYear} onChange={(event) => handleMembershipTypeFieldChange("seasonYear", event.target.value)} />
            </label>
          </div>
          <div className="form-grid">
            <label>
              {uiText(locale, "Prix", "Price")}
              <input disabled={!organization || Boolean(membershipBusyId)} min="0" step="0.01" type="number" value={membershipTypeForm.price} onChange={(event) => handleMembershipTypeFieldChange("price", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Début de validité", "Valid from")}
              <input disabled={!organization || Boolean(membershipBusyId)} type="date" value={membershipTypeForm.validFrom} onChange={(event) => handleMembershipTypeFieldChange("validFrom", event.target.value)} />
            </label>
            <label>
              {uiText(locale, "Fin de validité", "Valid until")}
              <input disabled={!organization || Boolean(membershipBusyId)} type="date" value={membershipTypeForm.validUntil} onChange={(event) => handleMembershipTypeFieldChange("validUntil", event.target.value)} />
            </label>
          </div>
          <label>
            {uiText(locale, "Description", "Description")}
            <textarea disabled={!organization || Boolean(membershipBusyId)} rows={3} value={membershipTypeForm.description} onChange={(event) => handleMembershipTypeFieldChange("description", event.target.value)} />
          </label>
          <label className="requirement-row">
            <input checked={membershipTypeForm.taxApplicable} disabled={!organization || Boolean(membershipBusyId)} type="checkbox" onChange={(event) => handleMembershipTypeFieldChange("taxApplicable", event.target.checked)} />
            <span>
              <strong>{uiText(locale, "Taxable", "Taxable")}</strong>
              {uiText(locale, "Appliquer les taxes de l'association lorsque cette carte sera facturée.", "Apply the association taxes when this membership is invoiced.")}
            </span>
          </label>
          <label className="requirement-row">
            <input checked={membershipTypeForm.isActive} disabled={!organization || Boolean(membershipBusyId)} type="checkbox" onChange={(event) => handleMembershipTypeFieldChange("isActive", event.target.checked)} />
            <span>
              <strong>{uiText(locale, "Disponible à la vente", "Available for sale")}</strong>
              {uiText(locale, "Une carte inactive reste dans l'historique mais ne sera pas offerte pour les nouvelles ventes.", "An inactive membership stays in history but will not be offered for new sales.")}
            </span>
          </label>
          <div className="row-actions">
            <button className="primary-button" disabled={!organization || Boolean(membershipBusyId) || !membershipTypeForm.name.trim()} type="submit">
              {membershipBusyId
                ? uiText(locale, "Enregistrement...", "Saving...")
                : membershipTypeForm.id
                  ? uiText(locale, "Enregistrer la carte", "Save membership")
                  : uiText(locale, "Créer la carte", "Create membership")}
            </button>
            {membershipTypeForm.id ? (
              <button className="secondary-button" disabled={Boolean(membershipBusyId)} type="button" onClick={() => setMembershipTypeForm(membershipTypeFormState())}>
                {uiText(locale, "Annuler", "Cancel")}
              </button>
            ) : null}
          </div>
        </form>
      </SettingsSection>

      <SettingsSection
        {...sectionToggleLabels}
        title={uiText(locale, "Informations de facturation", "Billing information")}
        description={organization?.slug ?? uiText(locale, "Aucune association sélectionnée", "No association selected")}
      >
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
      </SettingsSection>

      <SettingsSection
        {...sectionToggleLabels}
        title={uiText(locale, "Numéros externes obligatoires", "Required external numbers")}
        description={uiText(locale, "Exigences appliquées aux fiches de cavalier de cette association.", "Requirements applied to rider records for this association.")}
      >
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
      </SettingsSection>

      <SettingsSection
        {...sectionToggleLabels}
        title={uiText(locale, "Dossards et statut santé", "Back numbers and health status")}
        description={uiText(locale, "Règles utilisées pour les dossards, les inscriptions et les réservations de stalls.", "Rules used for back numbers, entries and stall reservations.")}
      >
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
      </SettingsSection>
    </div>
  );
}

function productCategoryLabel(category: ProductCategory, locale: Locale = "fr") {
  switch (category) {
    case "stall_extra":
      return uiText(locale, "Extra de réservation", "Reservation extra");
    case "feed":
      return uiText(locale, "Foin / ripe", "Feed / bedding");
    case "merch":
      return uiText(locale, "Promo", "Merch");
    case "ticket":
      return uiText(locale, "Billet", "Ticket");
    case "meal":
      return uiText(locale, "Repas", "Meal");
    case "admin_fee":
      return uiText(locale, "Frais admin", "Admin fee");
    default:
      return uiText(locale, "Manuel", "Manual");
  }
}


export { SettingsView };
