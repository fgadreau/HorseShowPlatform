import {
  buildPayoutDraft,
  defaultPayoutScheduleBrackets,
  defaultPayoutSchedules,
  payoutNeedsScheduleBHint,
} from "../src/lib/payouts";
import { AQR_AUDIT_IMPORT_SOURCE } from "../src/lib/aqrAuditImport";
import type { Contact, Division, Entry, EntryResult, Horse, Organization, PayoutScheduleType, Show } from "../src/types/domain";

const organizationId = "payout-test-organization";
const showId = "payout-test-show";
const classId = "payout-test-class";
const createdAt = "2026-06-15T12:00:00.000Z";

function main() {
  testNrhaBracketPercentagesSumTo100();
  testNrhaScheduleA();
  testNrhaScheduleB();
  testYouthExempt();
  testNetNegative();
  testDisqualifiedCountsFinanciallyWithoutAward();
  testTiesSplitCoveredPlaces();
  testTiesCrossPaidPlaceLimit();
  testRoundingResidualGoesToBestRank();
  testHouseCustom();
  testJackpotDefaultRetainage();
  testAuditImportBatchTagging();

  console.log("Payout test program OK");
}

function testNrhaBracketPercentagesSumTo100() {
  const totals = new Map<string, number>();

  for (const bracket of defaultPayoutScheduleBrackets) {
    const key = [bracket.schedule_id, bracket.min_entries, bracket.max_entries ?? "open"].join(":");
    totals.set(key, (totals.get(key) ?? 0) + bracket.percentage);
  }

  for (const [key, total] of totals.entries()) {
    assertMoney(total, 100, `NRHA bracket total ${key}`);
  }
}

function testNrhaScheduleA() {
  const fixture = buildFixture({ entryCount: 6, entryFee: 100, scheduleType: "nrha_schedule_a", scores: [76, 75, 74] });
  const draft = buildDraft(fixture);

  assertEqual(draft.calculation.entry_count, 6, "NRHA A entry count");
  assertMoney(draft.calculation.net_purse, 570, "NRHA A purse after 5% fee");
  assertEqual(draft.awards.map((award) => award.percentage).join(","), "45,35,20", "NRHA A 6-entry bracket");
  assertMoney(draft.awards[0].amount, 256.5, "NRHA A first payout");
}

function testNrhaScheduleB() {
  const fixture = buildFixture({ entryCount: 8, entryFee: 100, scheduleType: "nrha_schedule_b", scores: [76, 75, 74, 73] });
  const draft = buildDraft(fixture);

  assertEqual(draft.awards.map((award) => award.percentage).join(","), "40,30,20,10", "NRHA B 8-entry bracket");
  assertEqual(payoutNeedsScheduleBHint({ added_money: 2000, payout_schedule_type: "nrha_schedule_a" }), true, "Schedule B hint");
}

function testYouthExempt() {
  const fixture = buildFixture({
    entryCount: 2,
    entryFee: 100,
    payoutRules: { nrha_youth_fee_exempt: true },
    retainagePercent: 25,
    scheduleType: "nrha_schedule_a",
    scores: [72, 71],
    trophyOrPlaqueFee: 50,
  });
  const draft = buildDraft(fixture);

  assertMoney(draft.calculation.trophy_or_plaque_fee, 0, "Youth trophy fee exempt");
  assertMoney(draft.calculation.nrha_fee_amount, 0, "Youth NRHA fee exempt");
  assertMoney(draft.calculation.retainage_amount, 0, "Youth retainage exempt");
  assertMoney(draft.calculation.net_purse, 200, "Youth purse");
}

function testNetNegative() {
  const fixture = buildFixture({
    addedMoney: 100,
    entryCount: 1,
    entryFee: 10,
    retainagePercent: 35,
    scheduleType: "nrha_schedule_a",
    scores: [70],
    trophyOrPlaqueFee: 50,
  });
  const draft = buildDraft(fixture);

  assertMoney(draft.calculation.base_after_trophy_fee, -40, "Negative base after trophy");
  assertMoney(draft.calculation.nrha_fee_amount, 0, "Negative net skips NRHA fee");
  assertMoney(draft.calculation.retainage_amount, 0, "Negative net skips retainage");
  assertMoney(draft.calculation.net_purse, 100, "Negative net pays advertised added money only");
}

function testDisqualifiedCountsFinanciallyWithoutAward() {
  const fixture = buildFixture({
    entryCount: 2,
    entryFee: 100,
    resultStatuses: ["scored", "disqualified"],
    scheduleType: "nrha_schedule_a",
    scores: [70, null],
  });
  const draft = buildDraft(fixture);

  assertEqual(draft.calculation.entry_count, 2, "DQ entry is counted financially");
  assertEqual(draft.awards.length, 1, "DQ entry gets no award");
  assertMoney(draft.awards[0].amount, 114, "Scored entry keeps first-place Schedule A percentage");
  assertEqual(draft.calculation.result_snapshot.some((row) => row.status === "disqualified" && row.payout_amount === 0), true, "DQ visible without payout");
}

function testTiesSplitCoveredPlaces() {
  const fixture = buildFixture({ entryCount: 2, entryFee: 100, scheduleType: "nrha_schedule_a", scores: [70, 70] });
  const draft = buildDraft(fixture);

  assertEqual(draft.awards.map((award) => award.percentage).join(","), "50,50", "Tie splits first and second percentages");
  assertMoney(draft.awards[0].amount, 95, "First tied payout");
  assertMoney(draft.awards[1].amount, 95, "Second tied payout");
}

function testTiesCrossPaidPlaceLimit() {
  const fixture = buildFixture({
    customBrackets: [{ min_entries: "1", max_entries: "", percentages: "40,30,20,10" }],
    entryCount: 6,
    entryFee: 100,
    scheduleType: "house_custom",
    scores: [80, 79, 78, 77, 77, 77],
  });
  const draft = buildDraft(fixture);
  const tiedAwards = draft.awards.filter((award) => award.rank === 4);

  assertEqual(draft.awards.length, 6, "Tie crossing paid-place limit keeps all tied payouts");
  assertEqual(tiedAwards.length, 3, "Three entries tied for the final paid place");
  assertMoney(tiedAwards.reduce((sum, award) => sum + award.amount, 0), 60, "Final paid-place percentage split across tied group");
  assertMoney(tiedAwards[0]?.percentage ?? 0, 3.333, "Tie crossing paid-place percentage per entry");
  assertMoney(tiedAwards[0]?.amount ?? 0, 20, "Tie crossing paid-place amount per entry");
}

function testRoundingResidualGoesToBestRank() {
  const fixture = buildFixture({
    addedMoney: 10,
    customBrackets: [{ min_entries: "1", max_entries: "", percentages: "33.333,33.333,33.333" }],
    entryCount: 3,
    entryFee: 0,
    scheduleType: "house_custom",
    scores: [75, 74, 73],
  });
  const draft = buildDraft(fixture);

  assertMoney(draft.calculation.net_purse, 10, "Custom rounding purse");
  assertMoney(draft.awards[0].amount, 3.34, "Rounding residual to best rank");
  assertMoney(draft.awards[1].amount, 3.33, "Second payout rounded");
  assertMoney(draft.awards[2].amount, 3.33, "Third payout rounded");
}

function testHouseCustom() {
  const fixture = buildFixture({
    customBrackets: [{ min_entries: "1", max_entries: "", percentages: "70,30" }],
    entryCount: 2,
    entryFee: 100,
    scheduleType: "house_custom",
    scores: [75, 74],
  });
  const draft = buildDraft(fixture);

  assertMoney(draft.awards[0].amount, 140, "House custom first payout");
  assertMoney(draft.awards[1].amount, 60, "House custom second payout");
}

function testJackpotDefaultRetainage() {
  const fixture = buildFixture({
    customBrackets: [{ min_entries: "1", max_entries: "", percentages: "60,40" }],
    entryCount: 2,
    entryFee: 100,
    retainagePercent: null,
    scheduleType: "jackpot_100",
    scores: [75, 74],
  });
  const draft = buildDraft(fixture);

  assertMoney(draft.calculation.retainage_amount, 0, "Jackpot defaults retainage to zero");
  assertMoney(draft.awards[0].amount, 120, "Jackpot first payout");
  assertMoney(draft.awards[1].amount, 80, "Jackpot second payout");
}

function testAuditImportBatchTagging() {
  const fixture = buildFixture({ entryCount: 2, entryFee: 100, scheduleType: "nrha_schedule_a", scores: [75, 74] });
  fixture.entries = fixture.entries.map((entry) => ({
    ...entry,
    import_source: AQR_AUDIT_IMPORT_SOURCE,
    import_batch_id: "aqr-batch-1",
  }));

  const draft = buildDraft(fixture);
  assertEqual(draft.calculation.import_batch_id, "aqr-batch-1", "AQR payout calculation keeps import batch id");

  fixture.entries[1] = { ...fixture.entries[1], import_batch_id: "aqr-batch-2" };
  const mixedDraft = buildDraft(fixture);
  assertEqual(mixedDraft.calculation.import_batch_id, null, "Mixed import batches are not batch-tagged");
}

type BuildFixtureOptions = {
  addedMoney?: number;
  customBrackets?: Array<{ max_entries: string; min_entries: string; percentages: string }>;
  entryCount: number;
  entryFee: number;
  payoutRules?: Record<string, unknown>;
  resultStatuses?: EntryResult["status"][];
  retainagePercent?: number | null;
  scheduleType: PayoutScheduleType;
  scores: Array<number | null>;
  trophyOrPlaqueFee?: number;
};

type PayoutFixture = {
  contacts: Contact[];
  division: Division;
  entries: Entry[];
  entryResults: EntryResult[];
  horses: Horse[];
  organization: Organization;
  show: Show;
};

function buildFixture(options: BuildFixtureOptions): PayoutFixture {
  const owner = makeContact("owner-1", "Owner", "One");
  const riders = Array.from({ length: options.entryCount }, (_, index) => makeContact(`rider-${index + 1}`, "Rider", String(index + 1)));
  const contacts = [owner, ...riders];
  const division = makeDivision(options);
  const horses = Array.from({ length: options.entryCount }, (_, index) => makeHorse(`horse-${index + 1}`, `Horse ${index + 1}`, owner.id));
  const entries = horses.map((horse, index) => makeEntry(`entry-${index + 1}`, division, horse, riders[index], index + 1));
  const entryResults = entries.map((entry, index) =>
    makeEntryResult(entry, options.resultStatuses?.[index] ?? (options.scores[index] == null ? "no_score" : "scored"), options.scores[index] ?? null),
  );

  return {
    contacts,
    division,
    entries,
    entryResults,
    horses,
    organization: makeOrganization(),
    show: makeShow(),
  };
}

function buildDraft(fixture: PayoutFixture) {
  return buildPayoutDraft({
    contacts: fixture.contacts,
    division: fixture.division,
    entries: fixture.entries,
    entryResults: fixture.entryResults,
    horses: fixture.horses,
    organization: fixture.organization,
    payoutScheduleBrackets: defaultPayoutScheduleBrackets,
    payoutSchedules: defaultPayoutSchedules,
    show: fixture.show,
  });
}

function makeOrganization(): Organization {
  return {
    id: organizationId,
    name: "Payout Test Association",
    slug: "payout-test-association",
    short_name: "PTA",
    description: null,
    primary_contact_name: null,
    primary_contact_email: "payout@example.test",
    primary_contact_phone: null,
    billing_name: null,
    billing_email: null,
    billing_phone: null,
    address: null,
    address_line2: null,
    city: null,
    state: null,
    zip_code: null,
    country: null,
    logo_url: null,
    website_url: null,
    timezone: "America/Toronto",
    currency: "CAD",
    tax_rate: 0,
    tax_name: null,
    tax_number: null,
    secondary_tax_name: null,
    secondary_tax_number: null,
    back_number_policy: "horse",
    health_verification_required: false,
    coggins_validity_months: 12,
    subscription_plan: "community",
    subscription_status: "active",
    subscription_expires_at: null,
    subscription_notes: null,
    modules_enabled: { show_score: true },
    created_by_user_id: "payout-test-user",
    created_at: createdAt,
  };
}

function makeShow(): Show {
  return {
    id: showId,
    organization_id: organizationId,
    name: "Payout Test Show",
    slug: "payout-test-show",
    description: null,
    start_date: "2026-06-15",
    end_date: "2026-06-15",
    venue: "Main Arena",
    location: "Ottawa, ON",
    city: "Ottawa",
    state: "ON",
    country: "CA",
    status: "open",
    timezone: "America/Toronto",
    default_currency: "CAD",
    tax_rate: 0,
    reservation_payment_policy: "manual",
    entry_payment_policy: "manual",
    entry_preauth_timing: "manual",
    entry_preauth_time: "08:00",
    entry_settlement_timing: "manual",
    entry_settlement_due_time: "18:00",
    entry_auto_capture_enabled: false,
    entry_preauth_amount_strategy: "entry_balance",
    entry_preauth_margin_percent: 0,
    is_public: true,
    created_at: createdAt,
  };
}

function makeDivision(options: BuildFixtureOptions): Division {
  return {
    id: "division-1",
    organization_id: organizationId,
    show_id: showId,
    class_id: classId,
    class_template_division_id: null,
    name: "Payout Division",
    level: null,
    code: "1100",
    entry_fee: options.entryFee,
    judge_fee: null,
    payout_schedule_type: options.scheduleType,
    added_money: options.addedMoney ?? 0,
    retainage_percent: options.retainagePercent === undefined ? 0 : options.retainagePercent,
    trophy_or_plaque_fee: options.trophyOrPlaqueFee ?? 0,
    sanctioning_fee_percent: null,
    payout_rules: {
      ...(options.customBrackets ? { custom_brackets: options.customBrackets } : {}),
      ...(options.payoutRules ?? {}),
    },
    payout_notes: null,
    sanctioning_body_codes: options.scheduleType.startsWith("nrha") ? ["NRHA"] : [],
    eligibility_rules: {},
    created_at: createdAt,
  };
}

function makeContact(id: string, firstName: string, lastName: string): Contact {
  return {
    id,
    organization_id: organizationId,
    type: "rider",
    first_name: firstName,
    last_name: lastName,
    email: `${id}@example.test`,
    phone: null,
    barn_name: null,
    linked_user_id: null,
    address: null,
    address_line2: null,
    city: null,
    state: null,
    zip_code: null,
    country: null,
    date_of_birth: null,
    created_at: createdAt,
  };
}

function makeHorse(id: string, name: string, ownerContactId: string): Horse {
  return {
    id,
    organization_id: organizationId,
    name,
    breed: "Quarter Horse",
    color: "Bay",
    gender: "G",
    date_of_birth: null,
    birth_year: null,
    registration_number: id.toUpperCase(),
    primary_owner_contact_id: ownerContactId,
    created_at: createdAt,
  };
}

function makeEntry(id: string, division: Division, horse: Horse, rider: Contact, entryNumber: number): Entry {
  return {
    id,
    organization_id: organizationId,
    show_id: showId,
    horse_id: horse.id,
    division_id: division.id,
    import_source: null,
    import_batch_id: null,
    external_source_key: null,
    source_payload: {},
    created_by_user_id: "payout-test-user",
    owner_contact_id: horse.primary_owner_contact_id,
    rider_contact_id: rider.id,
    payer_contact_id: horse.primary_owner_contact_id,
    status: "active",
    entry_number: entryNumber,
    base_fee: division.entry_fee,
    total_fees: division.entry_fee,
    is_late: false,
    late_fee_percent: 0,
    late_fee_amount: 0,
    created_at: createdAt,
  };
}

function makeEntryResult(entry: Entry, status: EntryResult["status"], finalScore: number | null): EntryResult {
  return {
    entry_id: entry.id,
    run_id: `run-${entry.id}`,
    block_run_id: `block-run-${entry.id}`,
    block_id: classId,
    division_id: entry.division_id,
    show_id: entry.show_id,
    final_score: finalScore,
    status,
    synced_at: createdAt,
    updated_at: createdAt,
  };
}

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertMoney(actual: number, expected: number, label: string) {
  if (Math.abs(actual - expected) > 0.001) {
    throw new Error(`${label}: expected ${expected.toFixed(2)}, got ${actual.toFixed(2)}`);
  }
}

main();
