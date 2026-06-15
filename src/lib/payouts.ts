import type {
  Contact,
  Division,
  Entry,
  EntryResult,
  Horse,
  Organization,
  PayoutAward,
  PayoutCalculation,
  PayoutResultSnapshotRow,
  PayoutSchedule,
  PayoutScheduleBracket,
  PayoutScheduleType,
  Show,
} from "../types/domain";
import { AQR_AUDIT_IMPORT_SOURCE } from "./aqrAuditImport";

type PayoutRuleBracket = {
  max_entries?: number | string | null;
  min_entries?: number | string | null;
  percentages?: number[] | string;
};

type PayoutRules = {
  custom_brackets?: PayoutRuleBracket[];
  [key: string]: unknown;
};

export type PayoutAwardDraft = Pick<PayoutAward, "entry_id" | "rank" | "percentage" | "amount" | "payee_contact_id" | "payee_name" | "payee_override_note">;

export type PayoutCalculationDraft = Pick<
  PayoutCalculation,
  | "show_id"
  | "division_id"
  | "import_batch_id"
  | "status"
  | "currency"
  | "entry_count"
  | "gross_entry_fees"
  | "trophy_or_plaque_fee"
  | "base_after_trophy_fee"
  | "nrha_fee_amount"
  | "net_entry_fee"
  | "retainage_amount"
  | "final_net_entry_fee"
  | "added_money"
  | "net_purse"
  | "payout_schedule_id"
  | "source_snapshot"
  | "result_snapshot"
>;

export type BuiltPayoutDraft = {
  awards: PayoutAwardDraft[];
  calculation: PayoutCalculationDraft;
  percentages: number[];
};

type BuildPayoutDraftInput = {
  contacts: Contact[];
  division: Division;
  entries: Entry[];
  entryResults: EntryResult[];
  existingAwards?: PayoutAward[];
  horses: Horse[];
  organization: Organization | null;
  payoutScheduleBrackets: PayoutScheduleBracket[];
  payoutSchedules: PayoutSchedule[];
  show: Show | null;
};

export const NRHA_SCHEDULE_A_ID = "64000000-0000-0000-0000-000000000001";
export const NRHA_SCHEDULE_B_ID = "64000000-0000-0000-0000-000000000002";

const nrhaPercentagesByBracket = [
  [100],
  [60, 40],
  [45, 35, 20],
  [40, 30, 20, 10],
  [34, 27, 20, 10, 9],
  [32, 22, 19, 10, 9, 8],
  [28, 22, 17, 10, 9, 8, 6],
  [26, 22, 14, 10, 9, 8, 6, 5],
  [25, 20, 13, 10, 9, 8, 6, 5, 4],
  [25, 18, 13, 10, 9, 7, 6, 4.5, 4, 3.5],
  [25, 17, 12, 9.5, 8.5, 7, 6, 4.5, 4, 3.5, 3],
  [23, 17, 12, 9, 8, 7, 6, 5, 4, 3.5, 3, 2.5],
  [23, 16, 11, 9, 8, 7, 6, 5, 4, 3.5, 3, 2.5, 2],
  [23, 15, 10.5, 9, 8, 7, 6, 5, 4, 3.5, 3, 2.5, 2, 1.5],
  [23, 14, 10.5, 9, 8, 7, 6, 5, 4, 3.5, 3, 2.5, 2, 1.5, 1],
];

const nrhaScheduleAThresholds = [
  [1, 1],
  [2, 5],
  [6, 9],
  [10, 13],
  [14, 18],
  [19, 24],
  [25, 28],
  [29, 32],
  [33, 36],
  [37, 40],
  [41, 44],
  [45, 48],
  [49, 52],
  [53, 60],
  [61, null],
] as const;

const nrhaScheduleBThresholds = [
  [1, 1],
  [2, 5],
  [6, 7],
  [8, 9],
  [10, 11],
  [12, 13],
  [14, 15],
  [16, 17],
  [18, 19],
  [20, 21],
  [22, 23],
  [24, 25],
  [26, 27],
  [28, 29],
  [30, null],
] as const;

export const defaultPayoutSchedules: PayoutSchedule[] = [
  {
    id: NRHA_SCHEDULE_A_ID,
    name: "NRHA Schedule A",
    federation: "NRHA",
    description: "Official NRHA Schedule A seeded from HSP payout brief.",
    is_system: true,
    created_at: "",
    updated_at: "",
  },
  {
    id: NRHA_SCHEDULE_B_ID,
    name: "NRHA Schedule B",
    federation: "NRHA",
    description: "Official NRHA Schedule B seeded from HSP payout brief.",
    is_system: true,
    created_at: "",
    updated_at: "",
  },
];

export const defaultPayoutScheduleBrackets: PayoutScheduleBracket[] = [
  ...buildNrhaDefaultBrackets(NRHA_SCHEDULE_A_ID, nrhaScheduleAThresholds),
  ...buildNrhaDefaultBrackets(NRHA_SCHEDULE_B_ID, nrhaScheduleBThresholds),
];

export function buildPayoutDraft({
  contacts,
  division,
  entries,
  entryResults,
  existingAwards = [],
  horses,
  organization,
  payoutScheduleBrackets,
  payoutSchedules,
  show,
}: BuildPayoutDraftInput): BuiltPayoutDraft {
  const divisionEntries = entries.filter((entry) => entry.division_id === division.id);
  const financialEntries = divisionEntries.filter((entry) => entry.status === "active" || entry.status === "completed");
  const importBatchId = resolvePayoutImportBatchId(financialEntries);
  const entryCount = financialEntries.length;
  const scheduleType = division.payout_schedule_type ?? "none";
  const hasPayout = scheduleType !== "none";
  const isNrhaSchedule = scheduleType === "nrha_schedule_a" || scheduleType === "nrha_schedule_b";
  const youthExempt = isNrhaSchedule && payoutRulesBoolean(division.payout_rules, "nrha_youth_fee_exempt");
  const entryFee = money(division.entry_fee ?? 0);
  const grossEntryFees = money(entryFee * entryCount);
  const appliedTrophyFee = youthExempt ? 0 : money(division.trophy_or_plaque_fee ?? 0);
  const baseAfterTrophy = money(grossEntryFees - appliedTrophyFee);
  const addedMoney = money(division.added_money ?? 0);
  const sanctioningFeePercent = youthExempt ? 0 : isNrhaSchedule ? 5 : numberOrDefault(division.sanctioning_fee_percent, 0);
  const retainagePercent = youthExempt ? 0 : scheduleType === "jackpot_100" && division.retainage_percent == null ? 0 : numberOrDefault(division.retainage_percent, 0);
  const netNegative = baseAfterTrophy < 0;
  const nrhaFeeAmount = netNegative ? 0 : money(baseAfterTrophy * (sanctioningFeePercent / 100));
  const netEntryFee = money(baseAfterTrophy - nrhaFeeAmount);
  const retainageAmount = netNegative ? 0 : money(netEntryFee * (retainagePercent / 100));
  const finalNetEntryFee = netNegative ? 0 : money(netEntryFee - retainageAmount);
  const netPurse = hasPayout ? money((netNegative ? 0 : finalNetEntryFee) + addedMoney) : 0;
  const schedule = resolveSchedule(scheduleType, payoutSchedules);
  const percentages = hasPayout ? resolvePercentages(scheduleType, entryCount, division.payout_rules, schedule, payoutScheduleBrackets) : [];
  const rankedGroups = buildRankedGroups(financialEntries, entryResults);
  const existingAwardByEntryId = new Map(existingAwards.map((award) => [award.entry_id, award]));
  const awards = buildAwards({
    contacts,
    existingAwardByEntryId,
    entries: financialEntries,
    groups: rankedGroups,
    percentages,
    purse: netPurse,
  });
  const awardByEntryId = new Map(awards.map((award) => [award.entry_id, award]));
  const resultSnapshot = buildResultRows({
    awardByEntryId,
    contacts,
    entries: divisionEntries,
    entryResults,
    horses,
    rankedGroups,
  });
  const sourceSnapshot = buildSourceSnapshot({
    division,
    entryResults,
    financialEntries,
    schedule,
    scheduleType,
    youthExempt,
  });

  return {
    awards,
    calculation: {
      show_id: division.show_id,
      division_id: division.id,
      import_batch_id: importBatchId,
      status: "draft",
      currency: show?.default_currency ?? organization?.currency ?? "CAD",
      entry_count: entryCount,
      gross_entry_fees: grossEntryFees,
      trophy_or_plaque_fee: appliedTrophyFee,
      base_after_trophy_fee: baseAfterTrophy,
      nrha_fee_amount: nrhaFeeAmount,
      net_entry_fee: netEntryFee,
      retainage_amount: retainageAmount,
      final_net_entry_fee: finalNetEntryFee,
      added_money: addedMoney,
      net_purse: netPurse,
      payout_schedule_id: schedule?.id ?? null,
      source_snapshot: sourceSnapshot,
      result_snapshot: resultSnapshot,
    },
    percentages,
  };
}

function resolvePayoutImportBatchId(entries: Entry[]) {
  if (!entries.length) {
    return null;
  }

  const batchIds = [
    ...new Set(
      entries
        .filter((entry) => entry.import_source === AQR_AUDIT_IMPORT_SOURCE)
        .map((entry) => entry.import_batch_id)
        .filter((batchId): batchId is string => Boolean(batchId)),
    ),
  ];

  return batchIds.length === 1 && entries.every((entry) => entry.import_source === AQR_AUDIT_IMPORT_SOURCE && entry.import_batch_id === batchIds[0])
    ? batchIds[0]
    : null;
}

export function payoutDraftMatchesCalculation(draft: BuiltPayoutDraft, calculation: PayoutCalculation | null | undefined) {
  if (!calculation) {
    return false;
  }

  return stableJson(draft.calculation.source_snapshot) === stableJson(calculation.source_snapshot);
}

export function payoutNeedsScheduleBHint(division: Pick<Division, "added_money" | "payout_schedule_type">) {
  return division.payout_schedule_type === "nrha_schedule_a" && Number(division.added_money ?? 0) >= 2000;
}

function buildNrhaDefaultBrackets(scheduleId: string, thresholds: readonly (readonly [number, number | null])[]) {
  return thresholds.flatMap(([minEntries, maxEntries], bracketIndex) =>
    nrhaPercentagesByBracket[bracketIndex].map((percentage, placeIndex) => ({
      id: `${scheduleId}-${bracketIndex + 1}-${placeIndex + 1}`,
      schedule_id: scheduleId,
      min_entries: minEntries,
      max_entries: maxEntries,
      place: placeIndex + 1,
      percentage,
      created_at: "",
    })),
  );
}

function resolveSchedule(scheduleType: PayoutScheduleType, schedules: PayoutSchedule[]) {
  const scheduleName = scheduleType === "nrha_schedule_a" ? "NRHA Schedule A" : scheduleType === "nrha_schedule_b" ? "NRHA Schedule B" : null;

  if (!scheduleName) {
    return null;
  }

  return schedules.find((schedule) => schedule.federation === "NRHA" && schedule.name === scheduleName) ?? defaultPayoutSchedules.find((schedule) => schedule.name === scheduleName) ?? null;
}

function resolvePercentages(scheduleType: PayoutScheduleType, entryCount: number, rules: Record<string, unknown>, schedule: PayoutSchedule | null, brackets: PayoutScheduleBracket[]) {
  if (scheduleType === "nrha_schedule_a" || scheduleType === "nrha_schedule_b") {
    if (!schedule) {
      return [];
    }

    const allBrackets = brackets.length ? brackets : defaultPayoutScheduleBrackets;
    const matchingBrackets = allBrackets
      .filter((bracket) => bracket.schedule_id === schedule.id && entryCount >= bracket.min_entries && (bracket.max_entries == null || entryCount <= bracket.max_entries))
      .sort((a, b) => a.place - b.place);

    return matchingBrackets.map((bracket) => Number(bracket.percentage));
  }

  const bracket = matchingPayoutBracket(rules, entryCount);
  return bracket ? parsePayoutPercentages(bracket.percentages) : [];
}

function buildRankedGroups(entries: Entry[], entryResults: EntryResult[]) {
  const entryIds = new Set(entries.map((entry) => entry.id));
  const scoredResults = entryResults
    .filter((result) => entryIds.has(result.entry_id) && result.status === "scored" && result.final_score != null)
    .sort((a, b) => Number(b.final_score) - Number(a.final_score) || a.entry_id.localeCompare(b.entry_id));
  const groups: Array<{ rank: number; results: EntryResult[] }> = [];
  let index = 0;

  while (index < scoredResults.length) {
    const score = scoredResults[index].final_score;
    const results = scoredResults.filter((result, resultIndex) => resultIndex >= index && result.final_score === score);
    groups.push({ rank: index + 1, results });
    index += results.length;
  }

  return groups;
}

function buildAwards({
  contacts,
  entries,
  existingAwardByEntryId,
  groups,
  percentages,
  purse,
}: {
  contacts: Contact[];
  entries: Entry[];
  existingAwardByEntryId: Map<string, PayoutAward>;
  groups: Array<{ rank: number; results: EntryResult[] }>;
  percentages: number[];
  purse: number;
}) {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const awards: PayoutAwardDraft[] = [];
  let assignedPercentTotal = 0;

  for (const group of groups) {
    const coveredPercentages = percentages.slice(group.rank - 1, group.rank - 1 + group.results.length);
    const groupPercent = coveredPercentages.reduce((sum, percent) => sum + percent, 0);

    if (groupPercent <= 0) {
      continue;
    }

    assignedPercentTotal += groupPercent;
    const percentPerEntry = groupPercent / group.results.length;

    for (const result of group.results) {
      const entry = entryById.get(result.entry_id);

      if (!entry) {
        continue;
      }

      const existingAward = existingAwardByEntryId.get(entry.id);
      const payeeContactId = existingAward?.payee_contact_id ?? entry.owner_contact_id;
      const payeeName = existingAward?.payee_name ?? contactName(contacts.find((contact) => contact.id === payeeContactId));

      awards.push({
        amount: money(purse * (percentPerEntry / 100)),
        entry_id: entry.id,
        payee_contact_id: payeeContactId,
        payee_name: payeeName,
        payee_override_note: existingAward?.payee_override_note ?? null,
        percentage: roundPercent(percentPerEntry),
        rank: group.rank,
      });
    }
  }

  const expectedPaidTotal = money(purse * (assignedPercentTotal / 100));
  const actualPaidTotal = money(awards.reduce((sum, award) => sum + award.amount, 0));
  const residual = money(expectedPaidTotal - actualPaidTotal);

  if (awards.length && residual !== 0) {
    awards[0] = { ...awards[0], amount: money(awards[0].amount + residual) };
  }

  return awards.filter((award) => award.amount > 0);
}

function buildResultRows({
  awardByEntryId,
  contacts,
  entries,
  entryResults,
  horses,
  rankedGroups,
}: {
  awardByEntryId: Map<string, PayoutAwardDraft>;
  contacts: Contact[];
  entries: Entry[];
  entryResults: EntryResult[];
  horses: Horse[];
  rankedGroups: Array<{ rank: number; results: EntryResult[] }>;
}) {
  const resultByEntryId = new Map(entryResults.map((result) => [result.entry_id, result]));
  const rankByEntryId = new Map<string, number>();

  for (const group of rankedGroups) {
    for (const result of group.results) {
      rankByEntryId.set(result.entry_id, group.rank);
    }
  }

  return entries
    .filter((entry) => entry.status !== "cancelled" && entry.status !== "scratched_pending_refund")
    .map((entry): PayoutResultSnapshotRow => {
      const result = resultByEntryId.get(entry.id);
      const award = awardByEntryId.get(entry.id);
      const owner = contacts.find((contact) => contact.id === entry.owner_contact_id);
      const rider = contacts.find((contact) => contact.id === (entry.rider_contact_id ?? entry.owner_contact_id));
      const horse = horses.find((candidate) => candidate.id === entry.horse_id);

      return {
        back_number: entry.entry_number == null ? null : String(entry.entry_number),
        entry_id: entry.id,
        final_score: result?.final_score ?? null,
        horse_name: horse?.name ?? "Unknown horse",
        owner_name: contactName(owner),
        payee_contact_id: award?.payee_contact_id ?? entry.owner_contact_id,
        payee_name: award?.payee_name ?? contactName(owner),
        payout_amount: award?.amount ?? 0,
        payout_percentage: award?.percentage ?? 0,
        rank: rankByEntryId.get(entry.id) ?? null,
        rider_name: contactName(rider),
        status: result?.status ?? "pending",
      };
    })
    .sort((a, b) => {
      if (a.rank != null && b.rank != null) {
        return a.rank - b.rank;
      }

      if (a.rank != null) {
        return -1;
      }

      if (b.rank != null) {
        return 1;
      }

      return (a.back_number ?? "").localeCompare(b.back_number ?? "");
    });
}

function buildSourceSnapshot({
  division,
  entryResults,
  financialEntries,
  schedule,
  scheduleType,
  youthExempt,
}: {
  division: Division;
  entryResults: EntryResult[];
  financialEntries: Entry[];
  schedule: PayoutSchedule | null;
  scheduleType: PayoutScheduleType;
  youthExempt: boolean;
}) {
  const financialEntryIds = new Set(financialEntries.map((entry) => entry.id));

  return {
    algorithm_version: 1,
    division: {
      added_money: money(division.added_money ?? 0),
      entry_fee: money(division.entry_fee ?? 0),
      id: division.id,
      payout_rules: division.payout_rules ?? {},
      payout_schedule_type: scheduleType,
      retainage_percent: division.retainage_percent ?? null,
      sanctioning_fee_percent: division.sanctioning_fee_percent ?? null,
      trophy_or_plaque_fee: money(division.trophy_or_plaque_fee ?? 0),
      youth_exempt: youthExempt,
    },
    entries: financialEntries
      .map((entry) => ({
        base_fee: money(entry.base_fee ?? 0),
        id: entry.id,
        status: entry.status,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    results: entryResults
      .filter((result) => result.division_id === division.id && financialEntryIds.has(result.entry_id))
      .map((result) => ({
        entry_id: result.entry_id,
        final_score: result.final_score == null ? null : Number(result.final_score),
        status: result.status,
        updated_at: result.updated_at,
      }))
      .sort((a, b) => a.entry_id.localeCompare(b.entry_id)),
    schedule_id: schedule?.id ?? null,
  };
}

function payoutRulesFromValue(value: Record<string, unknown> | null | undefined): PayoutRules {
  return value && typeof value === "object" ? (value as PayoutRules) : {};
}

function payoutRulesBoolean(value: Record<string, unknown> | null | undefined, key: string) {
  const rawValue = payoutRulesFromValue(value)[key];
  return rawValue === true || rawValue === "true";
}

function payoutRuleRows(rules: Record<string, unknown> | null | undefined) {
  return payoutRulesFromValue(rules).custom_brackets ?? [];
}

function matchingPayoutBracket(rules: Record<string, unknown> | null | undefined, entryCount: number) {
  return payoutRuleRows(rules).find((row) => {
    const minEntries = parseNullableRuleNumber(row.min_entries) ?? 1;
    const maxEntries = parseNullableRuleNumber(row.max_entries);
    return entryCount >= minEntries && (maxEntries == null || entryCount <= maxEntries);
  });
}

function parsePayoutPercentages(value: PayoutRuleBracket["percentages"]) {
  if (Array.isArray(value)) {
    return value.filter((percent) => Number.isFinite(percent) && percent > 0);
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

function numberOrDefault(value: number | null | undefined, fallback: number) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function money(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function contactName(contact: Contact | undefined) {
  if (!contact) {
    return "Unknown contact";
  }

  return `${contact.first_name} ${contact.last_name}`.trim() || "Unknown contact";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
