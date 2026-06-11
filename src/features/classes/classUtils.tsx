import { useMemo } from "react";
import { SearchSelect } from "../../components/ui";
import { formatCurrency, formatDate, numericValue, findById } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { BackNumberPolicy, ClassRecord, ClassTemplateDivision, Contact, Division, Entry, EligibilityRules, Horse, InvoiceLineItem, PayoutScheduleType, SanctioningBody, ScheduleStartMode, Show, ShowDay, ShowScoreClassSetup } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import type { InlineHealthMessage } from "../dashboard/shared";

function toggleSanctioningBodyCode(currentCodes: string[], code: string) {
  return currentCodes.includes(code) ? currentCodes.filter((currentCode) => currentCode !== code) : [...currentCodes, code];
}

function defaultBackNumberPolicy(codes: string[], sanctioningBodies: SanctioningBody[]): BackNumberPolicy {
  if (codes.some((code) => sanctioningBodies.find((body) => body.code === code)?.back_number_policy === "rider")) {
    return "rider";
  }

  return codes.some((code) => sanctioningBodies.find((body) => body.code === code)?.back_number_policy === "horse_rider_team") ? "horse_rider_team" : "horse";
}

function isNrhaSanctioned(codes: string[] | null | undefined) {
  return Boolean(codes?.includes("NRHA"));
}

function sanctionLabel(codes: string[] | null | undefined, sanctioningBodies: SanctioningBody[], locale: Locale = "fr") {
  if (!codes?.length) {
    return uiText(locale, "Aucune sanction", "No sanction");
  }

  return codes.map((code) => sanctioningBodies.find((body) => body.code === code)?.name ?? code).join(", ");
}

function backNumberPolicyLabel(policy: BackNumberPolicy | null | undefined, locale: Locale = "fr") {
  switch (policy) {
    case "rider":
      return uiText(locale, "Dossard par cavalier", "Back number by rider");
    case "horse_rider_team":
      return uiText(locale, "Dossard par équipe cheval / cavalier", "Back number by horse / rider team");
    case "entry":
      return uiText(locale, "Dossard par inscription", "Back number by entry");
    case "custom":
      return uiText(locale, "Dossard personnalisé", "Custom back number");
    case "horse":
    default:
      return uiText(locale, "Dossard par cheval", "Back number by horse");
  }
}

const nrhaClassTypes = [
  { label: "Category 1 - Ancillary, year-end eligible", value: "category_1_ancillary_year_end" },
  { label: "Category 2 - Aged show", value: "category_2_aged_show" },
  { label: "Category 3 - Youth", value: "category_3_youth" },
  { label: "Category 4 - Breed or alliance", value: "category_4_breed_alliance" },
  { label: "Category 5 - Ancillary, non year-end", value: "category_5_ancillary_non_year_end" },
  { label: "Category 6 - Closed aged show", value: "category_6_closed_aged_show" },
  { label: "Category 7 - Affiliate championship", value: "category_7_affiliate_championship" },
  { label: "Category 8 - International / NGB", value: "category_8_international_ngb" },
  { label: "Category 9 - Freestyle reining", value: "category_9_freestyle" },
  { label: "Category 10 - Entry level", value: "category_10_entry_level" },
  { label: "Category 11 - Other approved", value: "category_11_other_approved" },
  { label: "Category 12 - Nominator incentive earnings", value: "category_12_nominator_incentive" },
  { label: "Category 13 - Earnings/status limitations", value: "category_13_earnings_status_limited" },
];

function payoutScheduleOptions(locale: Locale = "fr"): Array<{ description: string; label: string; value: PayoutScheduleType }> {
  return [
    {
      description: uiText(locale, "Classe sans bourse. Les frais ne génèrent pas de paiement aux concurrents.", "Class without purse. Fees do not generate competitor payouts."),
      label: uiText(locale, "Aucun paiement", "No payout"),
      value: "none",
    },
    {
      description: uiText(locale, "Standard NRHA pour la majorité des classes ancillary. Paiements plus concentrés selon les tableaux officiels.", "NRHA standard for most ancillary classes. More concentrated payouts based on official schedules."),
      label: "NRHA Schedule A",
      value: "nrha_schedule_a",
    },
    {
      description: uiText(locale, "NRHA Category 1 avec 2 000 $ ou plus en added money. Utilise le Schedule B officiel.", "NRHA Category 1 with $2,000 or more in added money. Uses the official Schedule B."),
      label: "NRHA Schedule B",
      value: "nrha_schedule_b",
    },
    {
      description: uiText(locale, "Moins de places payées, montants plus élevés aux premières positions.", "Fewer paid places, higher amounts for the top positions."),
      label: uiText(locale, "Paiement maison concentré", "House concentrated payout"),
      value: "house_concentrated",
    },
    {
      description: uiText(locale, "Plus de places payées, montants plus petits par place pour encourager la participation.", "More paid places, smaller amounts per place to encourage participation."),
      label: uiText(locale, "Paiement maison réparti", "House distributed payout"),
      value: "house_distributed",
    },
    {
      description: uiText(locale, "Tableau maison à définir par l'association avec ses propres tranches et pourcentages.", "House table defined by the association with its own brackets and percentages."),
      label: uiText(locale, "Paiement maison personnalisé", "Custom house payout"),
      value: "house_custom",
    },
    {
      description: uiText(locale, "La portion admissible retourne aux concurrents selon le tableau choisi, avec retenue à 0 % ou configurée clairement.", "The eligible portion returns to competitors based on the selected table, with retainage at 0% or clearly configured."),
      label: "Jackpot 100%",
      value: "jackpot_100",
    },
  ];
}

type PayoutRuleBracket = {
  max_entries?: number | string | null;
  min_entries?: number | string | null;
  percentages?: number[] | string;
};

type PayoutRules = {
  custom_brackets?: PayoutRuleBracket[];
  [key: string]: unknown;
};

function payoutScheduleOption(value: PayoutScheduleType | null | undefined, locale: Locale = "fr") {
  const options = payoutScheduleOptions(locale);
  return options.find((option) => option.value === value) ?? options[0];
}

function payoutScheduleLabel(value: PayoutScheduleType | null | undefined, locale: Locale = "fr") {
  return payoutScheduleOption(value, locale).label;
}

function payoutScheduleUsesCustomTable(value: PayoutScheduleType) {
  return value === "house_concentrated" || value === "house_distributed" || value === "house_custom" || value === "jackpot_100";
}

function payoutRulesFromValue(value: Record<string, unknown> | null | undefined): PayoutRules {
  return value && typeof value === "object" ? (value as PayoutRules) : {};
}

function payoutRulesHaveStoredRows(value: Record<string, unknown> | null | undefined) {
  return Boolean(payoutRulesFromValue(value).custom_brackets?.length);
}

function defaultPayoutRulesFor(type: PayoutScheduleType): PayoutRules {
  if (type === "house_concentrated") {
    return {
      preset: type,
      custom_brackets: [
        { min_entries: "1", max_entries: "1", percentages: "100" },
        { min_entries: "2", max_entries: "5", percentages: "70, 30" },
        { min_entries: "6", max_entries: "10", percentages: "50, 30, 20" },
        { min_entries: "11", max_entries: "20", percentages: "45, 25, 15, 10, 5" },
        { min_entries: "21", max_entries: "", percentages: "35, 25, 18, 12, 10" },
      ],
    };
  }

  if (type === "house_distributed" || type === "jackpot_100") {
    return {
      preset: type,
      custom_brackets: [
        { min_entries: "1", max_entries: "1", percentages: "100" },
        { min_entries: "2", max_entries: "5", percentages: "60, 40" },
        { min_entries: "6", max_entries: "10", percentages: "40, 30, 20, 10" },
        { min_entries: "11", max_entries: "20", percentages: "30, 24, 18, 12, 10, 6" },
        { min_entries: "21", max_entries: "", percentages: "25, 20, 16, 13, 10, 8, 5, 3" },
      ],
    };
  }

  return {
    preset: type,
    custom_brackets: [{ min_entries: "1", max_entries: "", percentages: "100" }],
  };
}

function payoutRuleRows(rules: Record<string, unknown> | null | undefined) {
  const parsedRules = payoutRulesFromValue(rules);
  return parsedRules.custom_brackets?.length ? parsedRules.custom_brackets : defaultPayoutRulesFor("house_custom").custom_brackets ?? [];
}

function parsePayoutPercentages(value: PayoutRuleBracket["percentages"]) {
  if (Array.isArray(value)) {
    return value.filter((percent) => Number.isFinite(percent));
  }

  return String(value ?? "")
    .split(/[,;\s]+/)
    .map((part) => Number(part.trim()))
    .filter((percent) => Number.isFinite(percent) && percent > 0);
}

function parseNullableRuleNumber(value: number | string | null | undefined) {
  if (value === "" || value == null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function matchingPayoutBracket(rules: Record<string, unknown> | null | undefined, entryCount: number) {
  return payoutRuleRows(rules).find((row) => {
    const minEntries = parseNullableRuleNumber(row.min_entries) ?? 1;
    const maxEntries = parseNullableRuleNumber(row.max_entries);
    return entryCount >= minEntries && (maxEntries == null || entryCount <= maxEntries);
  });
}

function payoutPercentageTotal(row: PayoutRuleBracket) {
  return parsePayoutPercentages(row.percentages).reduce((total, percent) => total + percent, 0);
}

function payoutPreview({
  addedMoney,
  entryCount,
  entryFee,
  payoutRules,
  retainagePercent,
  sanctioningFeePercent,
  trophyOrPlaqueFee,
}: {
  addedMoney: string;
  entryCount: string;
  entryFee: string;
  payoutRules: Record<string, unknown>;
  retainagePercent: string;
  sanctioningFeePercent: string;
  trophyOrPlaqueFee: string;
}) {
  const parsedEntryCount = Math.max(1, Math.round(numericValue(entryCount) ?? 1));
  const grossEntryFees = (numericValue(entryFee) ?? 0) * parsedEntryCount;
  const baseAfterTrophy = Math.max(0, grossEntryFees - (numericValue(trophyOrPlaqueFee) ?? 0));
  const sanctioningFee = baseAfterTrophy * ((numericValue(sanctioningFeePercent) ?? 0) / 100);
  const netEntryFee = Math.max(0, baseAfterTrophy - sanctioningFee);
  const retainage = netEntryFee * ((numericValue(retainagePercent) ?? 0) / 100);
  const purse = Math.max(0, netEntryFee - retainage + (numericValue(addedMoney) ?? 0));
  const bracket = matchingPayoutBracket(payoutRules, parsedEntryCount);
  const percentages = bracket ? parsePayoutPercentages(bracket.percentages) : [];

  return {
    bracket,
    entryCount: parsedEntryCount,
    grossEntryFees,
    paidPlaces: percentages.length,
    payouts: percentages.map((percent, index) => ({
      amount: purse * (percent / 100),
      percent,
      place: index + 1,
    })),
    purse,
  };
}

type NrhaApprovedClass = {
  code: string;
  name: string;
  nrhaClassType: string;
};

const nrhaApprovedClasses: NrhaApprovedClass[] = [
  { code: "1100", name: "Open", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1110", name: "Prime Time Open", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1200", name: "Intermediate Open", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1301", name: "Limited Open", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1350", name: "Rookie Professional", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1400", name: "Non Pro", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1500", name: "Intermediate Non Pro", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1600", name: "Limited Non Pro", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1650", name: "Prime Time Non Pro", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1660", name: "Masters Non Pro", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1700", name: "Novice Horse Open Level 1", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1750", name: "Novice Horse Open Level 2", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1775", name: "Novice Horse Open Level 3", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1800", name: "Novice Horse Non Pro Level 1", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1850", name: "Novice Horse Non Pro Level 2", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "1875", name: "Novice Horse Non Pro Level 3", nrhaClassType: "category_1_ancillary_year_end" },
  { code: "2100", name: "Level 4 Open - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2200", name: "Level 3 Open - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2300", name: "Level 2 Open - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2325", name: "Level 1 Open - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2350", name: "Prime Time Open-Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2400", name: "Level 4 Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2500", name: "Level 3 Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2600", name: "Level 2 Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2621", name: "Masters Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2625", name: "Level 1 Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2650", name: "Prime Time Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2700", name: "Youth Non Pro - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2720", name: "Youth 13 & Under - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2730", name: "Youth 14-18 - Aged Event", nrhaClassType: "category_2_aged_show" },
  { code: "2800", name: "Amateur Derby", nrhaClassType: "category_2_aged_show" },
  { code: "2900", name: "Snaffle Bit/Hackamore (3 YO) Open", nrhaClassType: "category_2_aged_show" },
  { code: "2920", name: "Snaffle Bit/Hackamore (4 & U) Open", nrhaClassType: "category_2_aged_show" },
  { code: "2930", name: "Snaffle Bit/Hackamore (5 & U) Open", nrhaClassType: "category_2_aged_show" },
  { code: "2940", name: "Snaffle Bit/Hackamore (3 YO) Non Pro", nrhaClassType: "category_2_aged_show" },
  { code: "2950", name: "Snaffle Bit/Hackamore (4 & U) Non Pro", nrhaClassType: "category_2_aged_show" },
  { code: "2960", name: "Snaffle Bit/Hackamore (5 & U) Non Pro", nrhaClassType: "category_2_aged_show" },
  { code: "3100", name: "Youth 13 & Under", nrhaClassType: "category_3_youth" },
  { code: "3200", name: "Youth 14-18", nrhaClassType: "category_3_youth" },
  { code: "3300", name: "Youth Rookie", nrhaClassType: "category_3_youth" },
  { code: "3400", name: "Unrestricted Youth", nrhaClassType: "category_3_youth" },
  { code: "3500", name: "10 & Under Short Stirrup", nrhaClassType: "category_3_youth" },
  { code: "4670", name: "Open", nrhaClassType: "category_4_breed_alliance" },
  { code: "4680", name: "Junior Horse", nrhaClassType: "category_4_breed_alliance" },
  { code: "4681", name: "Senior Horse", nrhaClassType: "category_4_breed_alliance" },
  { code: "4690", name: "Non Pro", nrhaClassType: "category_4_breed_alliance" },
  { code: "4691", name: "Amateur", nrhaClassType: "category_4_breed_alliance" },
  { code: "4692", name: "Youth", nrhaClassType: "category_4_breed_alliance" },
  { code: "4693", name: "Youth 13 & Under", nrhaClassType: "category_4_breed_alliance" },
  { code: "4694", name: "Youth 14-18", nrhaClassType: "category_4_breed_alliance" },
  { code: "4695", name: "Novice Amateur", nrhaClassType: "category_4_breed_alliance" },
  { code: "5270", name: "Legends Non Pro", nrhaClassType: "category_5_ancillary_non_year_end" },
  { code: "5300", name: "Rookie Level 1", nrhaClassType: "category_5_ancillary_non_year_end" },
  { code: "5301", name: "Prime Time Rookie", nrhaClassType: "category_5_ancillary_non_year_end" },
  { code: "5310", name: "Rookie Level 2", nrhaClassType: "category_5_ancillary_non_year_end" },
  { code: "6210", name: "Level 4 Open - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6220", name: "Level 3 Open - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6230", name: "Level 2 Open - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6231", name: "Level 1 Open - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6234", name: "Masters Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6235", name: "Prime Time Open - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6236", name: "Open Gelding - Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6237", name: "Open Mare - Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6240", name: "Level 4 Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6250", name: "Level 3 Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6260", name: "Level 2 Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6261", name: "Level 1 Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6265", name: "Prime Time Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6266", name: "Non Pro Gelding - Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6267", name: "Non Pro Mare - Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6700", name: "Youth Non Pro - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6720", name: "Youth 13 & Under - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6730", name: "Youth 14-18 - Closed Aged Event", nrhaClassType: "category_6_closed_aged_show" },
  { code: "6800", name: "Amateur Derby", nrhaClassType: "category_6_closed_aged_show" },
  { code: "9100", name: "Freestyle Open", nrhaClassType: "category_9_freestyle" },
  { code: "9200", name: "Freestyle Non Pro", nrhaClassType: "category_9_freestyle" },
  { code: "9300", name: "Freestyle Invitational", nrhaClassType: "category_9_freestyle" },
  { code: "9400", name: "Freestyle Youth", nrhaClassType: "category_9_freestyle" },
  { code: "10001", name: "Green Reiner Level 2", nrhaClassType: "category_10_entry_level" },
  { code: "10002", name: "Green Reiner Level 1", nrhaClassType: "category_10_entry_level" },
  { code: "10100", name: "Ride & Slide Open Level 1", nrhaClassType: "category_10_entry_level" },
  { code: "10101", name: "Ride & Slide Non Pro Level 1", nrhaClassType: "category_10_entry_level" },
  { code: "10102", name: "Ride & Slide Youth Level 1", nrhaClassType: "category_10_entry_level" },
  { code: "10200", name: "Ride & Slide Open Level 2", nrhaClassType: "category_10_entry_level" },
  { code: "10201", name: "Ride & Slide Non Pro Level 2", nrhaClassType: "category_10_entry_level" },
  { code: "10202", name: "Ride & Slide Youth Level 2", nrhaClassType: "category_10_entry_level" },
  { code: "11011", name: "Para-Reining", nrhaClassType: "category_11_other_approved" },
  { code: "111100", name: "Other Open", nrhaClassType: "category_11_other_approved" },
  { code: "111400", name: "Other Non Pro", nrhaClassType: "category_11_other_approved" },
].sort((a, b) => Number(a.code) - Number(b.code));

function findNrhaApprovedClass(code: string | null | undefined) {
  return nrhaApprovedClasses.find((approvedClass) => approvedClass.code === code?.trim()) ?? null;
}

function NrhaApprovedClassSelect({
  locale = "fr",
  disabled = false,
  value,
  onChange,
}: {
  locale?: Locale;
  disabled?: boolean;
  value: string;
  onChange: (code: string) => void;
}) {
  const items = useMemo(() => {
    const approvedClassItems = nrhaApprovedClasses.map((approvedClass) => ({
      id: approvedClass.code,
      label: `${approvedClass.code} ${approvedClass.name}`,
      detail: nrhaClassTypeLabel(approvedClass.nrhaClassType),
    }));

    if (value && !findNrhaApprovedClass(value)) {
      return [{ id: value, label: value, detail: uiText(locale, "Code NRHA hors liste", "NRHA code outside list") }, ...approvedClassItems];
    }

    return approvedClassItems;
  }, [locale, value]);

  return <SearchSelect allowEmpty disabled={disabled} items={items} maxVisibleItems={items.length} placeholder={uiText(locale, "Rechercher par numéro ou nom", "Search by number or name")} value={value} onChange={onChange} />;
}

function applyNrhaApprovedClassChoice(
  nextCode: string,
  {
    setCode,
    setName,
    setNrhaClassType,
  }: {
    setCode: (value: string) => void;
    setName: (value: string) => void;
    setNrhaClassType: (value: string) => void;
  },
) {
  setCode(nextCode);

  const approvedClass = findNrhaApprovedClass(nextCode);

  if (approvedClass) {
    setName(approvedClass.name);
    setNrhaClassType(approvedClass.nrhaClassType);
    return;
  }

  if (!nextCode) {
    setNrhaClassType("");
  }
}


function payoutAmountSummary(value: number | null | undefined, label: string) {
  return value ? `${label} ${formatCurrency(value, "CAD")}` : "";
}

function payoutDivisionSummary(division: Pick<Division, "added_money" | "payout_schedule_type" | "retainage_percent" | "trophy_or_plaque_fee">, locale: Locale = "fr") {
  return [
    payoutScheduleLabel(division.payout_schedule_type, locale),
    payoutAmountSummary(division.added_money, uiText(locale, "Ajouté", "Added")),
    payoutAmountSummary(division.trophy_or_plaque_fee, uiText(locale, "Trophée", "Trophy")),
    division.retainage_percent == null ? null : `${uiText(locale, "Retenue", "Retainage")} ${division.retainage_percent}%`,
  ]
    .filter(Boolean)
    .join(" - ");
}

function payoutTemplateDivisionSummary(
  division: Pick<ClassTemplateDivision, "default_added_money" | "default_payout_schedule_type" | "default_retainage_percent" | "default_trophy_or_plaque_fee">,
  locale: Locale = "fr",
) {
  return [
    payoutScheduleLabel(division.default_payout_schedule_type, locale),
    payoutAmountSummary(division.default_added_money, uiText(locale, "Ajouté", "Added")),
    payoutAmountSummary(division.default_trophy_or_plaque_fee, uiText(locale, "Trophée", "Trophy")),
    division.default_retainage_percent == null ? null : `${uiText(locale, "Retenue", "Retainage")} ${division.default_retainage_percent}%`,
  ]
    .filter(Boolean)
    .join(" - ");
}

function nrhaClassTypeLabel(value: string | null | undefined) {
  return nrhaClassTypes.find((type) => type.value === value)?.label ?? "";
}

function nrhaClassTypeFromRules(rules: EligibilityRules | null | undefined) {
  return typeof rules?.nrha_class_type === "string" ? rules.nrha_class_type : "";
}

function concurrentClassIdFromRules(rules: EligibilityRules | null | undefined) {
  return typeof rules?.concurrent_class_id === "string" ? rules.concurrent_class_id : "";
}

function concurrentGroupLabelFromRules(rules: EligibilityRules | null | undefined) {
  return typeof rules?.concurrent_group_label === "string" ? rules.concurrent_group_label : "";
}

function concurrentClassLabel(classRecord: ClassRecord, classes: ClassRecord[], locale: Locale = "fr") {
  const concurrentClassId = concurrentClassIdFromRules(classRecord.eligibility_rules);
  const linkedClass = findById(classes, concurrentClassId);

  if (linkedClass) {
    return uiText(locale, `Bloc concurrent avec ${linkedClass.name}`, `Concurrent with ${linkedClass.name}`);
  }

  const groupLabel = concurrentGroupLabelFromRules(classRecord.eligibility_rules);
  return groupLabel ? uiText(locale, `Bloc concurrent: ${groupLabel}`, `Concurrent block: ${groupLabel}`) : "";
}

function classProgramRules(
  notes: string,
  {
    concurrentClass,
  }: {
    concurrentClass?: ClassRecord | null;
  } = {},
) {
  const extras: EligibilityRules = {};

  if (concurrentClass) {
    extras.concurrent_class_id = concurrentClass.id;
    extras.concurrent_group_label = concurrentClass.block_label || concurrentClass.name;
  }

  return eligibilityRulesFromNotes(notes, extras);
}

function showTimeInputValue(value: string | null | undefined, fallback: string) {
  return value ? value.slice(0, 5) : fallback;
}

function datetimeLocalInputValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function defaultEntriesCloseAtForShowDay(day: ShowDay | null | undefined) {
  if (!day?.day_date) {
    return "";
  }

  const date = new Date(`${day.day_date}T18:00:00`);
  date.setDate(date.getDate() - 1);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return offsetDate.toISOString().slice(0, 16);
}

function classEntriesCloseLabel(classRecord: ClassRecord) {
  if (!classRecord.entries_close_at) {
    return "Inscriptions sans fermeture";
  }

  const closeDate = new Date(classRecord.entries_close_at);

  if (Number.isNaN(closeDate.getTime())) {
    return "Fermeture invalide";
  }

  const lateLabel = classRecord.late_entries_allowed ? `tardives +${classRecord.late_entry_fee_percent ?? 50}%` : "tardives refusées";

  return `Fermeture ${closeDate.toLocaleString("fr-CA", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  })} - ${lateLabel}`;
}

function classEntriesCloseDate(classRecord: ClassRecord | null | undefined) {
  if (!classRecord?.entries_close_at) {
    return null;
  }

  const closeDate = new Date(classRecord.entries_close_at);
  return Number.isNaN(closeDate.getTime()) ? null : closeDate;
}

function classEntriesAreClosed(classRecord: ClassRecord | null | undefined) {
  const closeDate = classEntriesCloseDate(classRecord);
  return !closeDate || Date.now() >= closeDate.getTime();
}

function buildEntryDeadlineReadiness(classRecord: ClassRecord | null, entryFee: number | null | undefined, currency: string): { canProceed: boolean; message: InlineHealthMessage | null } {
  const closeDate = classEntriesCloseDate(classRecord);

  if (!classRecord || !closeDate) {
    return { canProceed: true, message: null };
  }

  const closeLabel = closeDate.toLocaleString("fr-CA", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  });

  if (Date.now() <= closeDate.getTime()) {
    return {
      canProceed: true,
      message: {
        tone: "info",
        message: `Inscriptions ouvertes jusqu'au ${closeLabel}.`,
      },
    };
  }

  if (!classRecord.late_entries_allowed) {
    return {
      canProceed: false,
      message: {
        tone: "error",
        message: `Les inscriptions sont fermees depuis le ${closeLabel}. Les inscriptions tardives ne sont pas acceptees pour cette classe.`,
      },
    };
  }

  const lateFeePercent = classRecord.late_entry_fee_percent ?? 50;
  const lateFeeAmount = entryFee == null ? null : Math.round(entryFee * (lateFeePercent / 100) * 100) / 100;

  return {
    canProceed: true,
    message: {
      tone: "info",
      message: `Inscription tardive: penalite de ${lateFeePercent}%${lateFeeAmount == null ? "" : ` (${formatCurrency(lateFeeAmount, currency)})`}.`,
    },
  };
}

const inactiveProgramEntryStatuses = new Set<Entry["status"]>(["cancelled", "scratched", "scratched_pending_refund"]);

function buildEntryProgramLimitReadiness({
  division,
  divisions,
  entries,
  existingEntryId,
  horse,
  ownerContact,
  riderContact,
  skip,
}: {
  division: Division | null | undefined;
  divisions: Division[];
  entries: Entry[];
  existingEntryId?: string;
  horse: Horse | null | undefined;
  ownerContact: Contact | null | undefined;
  riderContact: Contact | null | undefined;
  skip?: boolean;
}): { canProceed: boolean; message: InlineHealthMessage | null } {
  if (skip || !division || !horse) {
    return { canProceed: true, message: null };
  }

  const activeEntries = entries.filter((entry) => entry.id !== existingEntryId && !inactiveProgramEntryStatuses.has(entry.status));
  const classDivisionIds = new Set(divisions.filter((candidate) => candidate.class_id === division.class_id).map((candidate) => candidate.id));
  const duplicateHorseEntry = activeEntries.find((entry) => entry.horse_id === horse.id && classDivisionIds.has(entry.division_id));

  if (duplicateHorseEntry) {
    return {
      canProceed: false,
      message: {
        tone: "error",
        message: "Ce cheval est déjà inscrit dans ce bloc.",
      },
    };
  }

  const riderContactId = riderContact?.id ?? ownerContact?.id ?? null;

  if (!riderContactId) {
    return { canProceed: true, message: null };
  }

  const riderEntryCount = activeEntries.filter((entry) => entry.division_id === division.id && (entry.rider_contact_id ?? entry.owner_contact_id) === riderContactId).length;

  if (riderEntryCount >= 3) {
    return {
      canProceed: false,
      message: {
        tone: "error",
        message: "Ce cavalier a déjà trois inscriptions dans cette classe.",
      },
    };
  }

  if (riderEntryCount === 2) {
    return {
      canProceed: true,
      message: {
        tone: "info",
        message: "Ce sera la 3e inscription de ce cavalier dans cette classe.",
      },
    };
  }

  return { canProceed: true, message: null };
}

function showPaymentSummary(show: Show) {
  const reservationLabel = show.reservation_payment_policy === "pay_at_booking" ? "Réservations payées" : "Réservations manuelles";
  const entryLabel =
    show.entry_payment_policy === "card_on_file_preauth"
      ? `Préautorisation ${showTimeInputValue(show.entry_preauth_time, "08:00")}, capture ${showTimeInputValue(show.entry_settlement_due_time, "14:00")}`
      : "Inscriptions manuelles";

  return `${reservationLabel} - ${entryLabel}`;
}

function showStatusLabel(status: Show["status"], locale: Locale = "fr") {
  switch (status) {
    case "open":
      return uiText(locale, "Ouvert", "Open");
    case "closed":
      return uiText(locale, "Fermé", "Closed");
    case "archived":
      return uiText(locale, "Archivé", "Archived");
    case "draft":
    default:
      return uiText(locale, "Brouillon", "Draft");
  }
}

function showDayLabel(day: ShowDay) {
  return `${day.day_name || `Day ${day.day_number ?? ""}`.trim()} - ${formatDate(day.day_date)}`;
}

function scheduleStartModeForClass(classRecord: Pick<ClassRecord, "schedule_start_mode" | "scheduled_time">): ScheduleStartMode {
  return classRecord.schedule_start_mode ?? (classRecord.scheduled_time ? "fixed" : "unscheduled");
}

function classHasFixedStart(classRecord: Pick<ClassRecord, "schedule_start_mode" | "scheduled_time">) {
  return scheduleStartModeForClass(classRecord) === "fixed" && Boolean(classRecord.scheduled_time);
}

function canManuallyOrderClass(classRecord: Pick<ClassRecord, "schedule_start_mode" | "scheduled_time">) {
  return !classHasFixedStart(classRecord);
}

function compareScheduleClasses(a: ClassRecord, b: ClassRecord) {
  const aFixed = classHasFixedStart(a);
  const bFixed = classHasFixedStart(b);

  if (aFixed && bFixed) {
    return (a.scheduled_time ?? "").localeCompare(b.scheduled_time ?? "") || a.sort_order - b.sort_order || a.name.localeCompare(b.name);
  }

  if (aFixed !== bFixed) {
    return aFixed ? -1 : 1;
  }

  return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
}

function timeInputValue(time: string | null | undefined) {
  return time ? time.slice(0, 5) : "";
}

function classScheduleStartLabel(classRecord: Pick<ClassRecord, "schedule_start_mode" | "scheduled_time">, locale: Locale = "fr") {
  const mode = scheduleStartModeForClass(classRecord);

  if (mode === "fixed" && classRecord.scheduled_time) {
    return uiText(locale, `Début ${timeInputValue(classRecord.scheduled_time)}`, `Start ${timeInputValue(classRecord.scheduled_time)}`);
  }

  if (mode === "after_previous") {
    return uiText(locale, "À la suite du bloc précédent", "After previous block");
  }

  return uiText(locale, "Heure indéfinie", "Start undefined");
}

function scheduleStartModeLabel(mode: ScheduleStartMode, locale: Locale = "fr") {
  switch (mode) {
    case "fixed":
      return uiText(locale, "Heure fixe", "Fixed time");
    case "after_previous":
      return uiText(locale, "À la suite du bloc précédent", "After previous block");
    case "unscheduled":
    default:
      return uiText(locale, "Heure indéfinie", "Undefined time");
  }
}

function invoiceItemTypeLabel(type: InvoiceLineItem["item_type"], locale: Locale = "fr") {
  switch (type) {
    case "entry":
      return uiText(locale, "Inscription", "Entry");
    case "judge_fee":
      return uiText(locale, "Frais de juge", "Judge fee");
    case "stall":
      return "Stall";
    case "extra":
      return "Extra";
    case "membership":
      return "Membership";
    case "fee":
      return uiText(locale, "Frais", "Fee");
    case "discount":
      return uiText(locale, "Rabais", "Discount");
    case "tax":
      return uiText(locale, "Taxe", "Tax");
    case "manual":
    default:
      return uiText(locale, "Manuel", "Manual");
  }
}

function invoiceQuantityLabel(quantity: number) {
  return Number(quantity).toLocaleString("en-CA", { maximumFractionDigits: 2 });
}

function eligibilityRulesFromNotes(notes: string, extras: EligibilityRules = {}): EligibilityRules {
  const rules = { ...extras };

  if (notes.trim()) {
    rules.notes = notes.trim();
  }

  return rules;
}

function eligibilityNotesFromRules(rules: EligibilityRules | null | undefined) {
  return typeof rules?.notes === "string" ? rules.notes : "";
}


export {
  toggleSanctioningBodyCode,
  defaultBackNumberPolicy,
  isNrhaSanctioned,
  sanctionLabel,
  backNumberPolicyLabel,
  nrhaClassTypes,
  payoutScheduleOptions,
  payoutScheduleOption,
  payoutScheduleLabel,
  payoutScheduleUsesCustomTable,
  payoutRulesFromValue,
  payoutRulesHaveStoredRows,
  defaultPayoutRulesFor,
  payoutRuleRows,
  parsePayoutPercentages,
  parseNullableRuleNumber,
  matchingPayoutBracket,
  payoutPercentageTotal,
  payoutPreview,
  NrhaApprovedClassSelect,
  applyNrhaApprovedClassChoice,
  findNrhaApprovedClass,
  payoutDivisionSummary,
  payoutTemplateDivisionSummary,
  nrhaClassTypeLabel,
  nrhaClassTypeFromRules,
  concurrentClassLabel,
  showTimeInputValue,
  datetimeLocalInputValue,
  datetimeLocalToIso,
  defaultEntriesCloseAtForShowDay,
  classEntriesCloseLabel,
  classEntriesCloseDate,
  classEntriesAreClosed,
  buildEntryDeadlineReadiness,
  inactiveProgramEntryStatuses,
  buildEntryProgramLimitReadiness,
  showPaymentSummary,
  showStatusLabel,
  showDayLabel,
  scheduleStartModeForClass,
  classHasFixedStart,
  canManuallyOrderClass,
  compareScheduleClasses,
  timeInputValue,
  classScheduleStartLabel,
  scheduleStartModeLabel,
  invoiceQuantityLabel,
  eligibilityRulesFromNotes,
  eligibilityNotesFromRules,
  classProgramRules,
  concurrentClassIdFromRules,
  concurrentGroupLabelFromRules,
};
export type { PayoutRuleBracket, PayoutRules, NrhaApprovedClass };
