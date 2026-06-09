export type SelectOption = {
  value: string;
  label: string;
};

export type TaxPreset = {
  id: string;
  country: string;
  state?: string;
  label: string;
  rate: number | null;
  taxName: string;
  secondaryTaxName?: string | null;
};

export const currencyOptions: SelectOption[] = [
  { value: "CAD", label: "CAD - Dollar canadien" },
  { value: "USD", label: "USD - Dollar americain" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - Livre sterling" },
  { value: "AUD", label: "AUD - Dollar australien" },
  { value: "MXN", label: "MXN - Peso mexicain" },
];

export const countryOptions: SelectOption[] = [
  { value: "CA", label: "Canada" },
  { value: "US", label: "Etats-Unis" },
  { value: "FR", label: "France" },
  { value: "BE", label: "Belgique" },
  { value: "CH", label: "Suisse" },
  { value: "MX", label: "Mexique" },
  { value: "AU", label: "Australie" },
  { value: "GB", label: "Royaume-Uni" },
];

export const canadianProvinceOptions: SelectOption[] = [
  { value: "AB", label: "Alberta" },
  { value: "BC", label: "Colombie-Britannique" },
  { value: "MB", label: "Manitoba" },
  { value: "NB", label: "Nouveau-Brunswick" },
  { value: "NL", label: "Terre-Neuve-et-Labrador" },
  { value: "NS", label: "Nouvelle-Ecosse" },
  { value: "NT", label: "Territoires du Nord-Ouest" },
  { value: "NU", label: "Nunavut" },
  { value: "ON", label: "Ontario" },
  { value: "PE", label: "Ile-du-Prince-Edouard" },
  { value: "QC", label: "Quebec" },
  { value: "SK", label: "Saskatchewan" },
  { value: "YT", label: "Yukon" },
];

const manualTaxPreset: TaxPreset = {
  id: "manual",
  country: "",
  label: "Taux manuel",
  rate: null,
  taxName: "Taxe de vente",
};

const usManualTaxPreset: TaxPreset = {
  id: "US-manual",
  country: "US",
  label: "Etats-Unis - sales tax locale (manuel)",
  rate: null,
  taxName: "Sales tax",
};

export const taxPresetOptions: TaxPreset[] = [
  manualTaxPreset,
  { id: "CA-AB", country: "CA", state: "AB", label: "Alberta - TPS 5%", rate: 5, taxName: "TPS" },
  { id: "CA-BC", country: "CA", state: "BC", label: "Colombie-Britannique - TPS + PST 12%", rate: 12, taxName: "TPS", secondaryTaxName: "PST" },
  { id: "CA-MB", country: "CA", state: "MB", label: "Manitoba - TPS + TVD 12%", rate: 12, taxName: "TPS", secondaryTaxName: "TVD" },
  { id: "CA-NB", country: "CA", state: "NB", label: "Nouveau-Brunswick - TVH 15%", rate: 15, taxName: "TVH" },
  { id: "CA-NL", country: "CA", state: "NL", label: "Terre-Neuve-et-Labrador - TVH 15%", rate: 15, taxName: "TVH" },
  { id: "CA-NS", country: "CA", state: "NS", label: "Nouvelle-Ecosse - TVH 14%", rate: 14, taxName: "TVH" },
  { id: "CA-NT", country: "CA", state: "NT", label: "Territoires du Nord-Ouest - TPS 5%", rate: 5, taxName: "TPS" },
  { id: "CA-NU", country: "CA", state: "NU", label: "Nunavut - TPS 5%", rate: 5, taxName: "TPS" },
  { id: "CA-ON", country: "CA", state: "ON", label: "Ontario - TVH 13%", rate: 13, taxName: "TVH" },
  { id: "CA-PE", country: "CA", state: "PE", label: "Ile-du-Prince-Edouard - TVH 15%", rate: 15, taxName: "TVH" },
  { id: "CA-QC", country: "CA", state: "QC", label: "Quebec - TPS + TVQ 14.975%", rate: 14.975, taxName: "TPS", secondaryTaxName: "TVQ" },
  { id: "CA-SK", country: "CA", state: "SK", label: "Saskatchewan - TPS + PST 11%", rate: 11, taxName: "TPS", secondaryTaxName: "PST" },
  { id: "CA-YT", country: "CA", state: "YT", label: "Yukon - TPS 5%", rate: 5, taxName: "TPS" },
  usManualTaxPreset,
];

export function taxPresetsForLocation(country: string, state: string) {
  const normalizedCountry = normalizeCode(country);
  const normalizedState = normalizeCode(state);

  if (normalizedCountry === "CA") {
    const provincePreset = taxPresetOptions.find((preset) => preset.country === "CA" && preset.state === normalizedState);
    return [manualTaxPreset, ...(provincePreset ? [provincePreset] : []), ...taxPresetOptions.filter((preset) => preset.country === "CA" && preset.id !== provincePreset?.id)];
  }

  if (normalizedCountry === "US") {
    return [manualTaxPreset, usManualTaxPreset];
  }

  return [manualTaxPreset];
}

export function taxPresetById(id: string) {
  return taxPresetOptions.find((preset) => preset.id === id) ?? manualTaxPreset;
}

export function taxPresetForLocation(country: string, state: string) {
  const normalizedCountry = normalizeCode(country);
  const normalizedState = normalizeCode(state);

  if (normalizedCountry === "CA") {
    return taxPresetOptions.find((preset) => preset.country === "CA" && preset.state === normalizedState) ?? manualTaxPreset;
  }

  if (normalizedCountry === "US") {
    return usManualTaxPreset;
  }

  return manualTaxPreset;
}

export function taxPresetIdForValues(country: string | null | undefined, state: string | null | undefined, taxRate: number | null | undefined, taxName: string | null | undefined) {
  const normalizedCountry = normalizeCode(country);
  const normalizedState = normalizeCode(state);
  const normalizedTaxName = normalizeLabel(taxName);

  const match = taxPresetOptions.find(
    (preset) =>
      preset.country === normalizedCountry &&
      (!preset.state || preset.state === normalizedState) &&
      preset.rate === Number(taxRate ?? NaN) &&
      normalizeLabel(preset.taxName) === normalizedTaxName,
  );

  return match?.id ?? "manual";
}

function normalizeCode(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase();
}

function normalizeLabel(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}
