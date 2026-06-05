import { buildShowScoreRunsForClass, type ShowScoreRun } from "../src/services/showScoreAdapters";
import type { ClassRecord, Contact, Division, Entry, Horse } from "../src/types/domain";

const organizationId = "draw-test-organization";
const showId = "draw-test-show";
const createdByUserId = "draw-test-user";
const createdAt = "2026-06-04T12:00:00.000Z";
const minimumGapWithEightHorsesBetween = 9;

type DrawFixture = {
  classRecord: ClassRecord;
  contacts: Contact[];
  divisions: Division[];
  entries: Entry[];
  horses: Horse[];
};

function main() {
  const largeFixture = buildLargeDrawFixture();
  const largeRuns = buildShowScoreRunsForClass(largeFixture.classRecord.id, largeFixture.entries, largeFixture);
  const repeatedLargeRuns = buildShowScoreRunsForClass(largeFixture.classRecord.id, largeFixture.entries, largeFixture);

  assertEqual(largeRuns.length, 45, "large fixture should produce 45 scoring runs");
  assertEqual(
    largeRuns.map((run) => run.entryId).join(","),
    repeatedLargeRuns.map((run) => run.entryId).join(","),
    "draw should be deterministic for the same bloc and entries",
  );
  assertLateRunsStartWithNegativeDraws(largeRuns, 3);
  assertRegularDrawsAreSequential(largeRuns, 42);
  assertNoInactiveEntries(largeRuns, largeFixture.entries);
  assertNoOutsideClassEntries(largeRuns, largeFixture.classRecord.id);
  assertRunsIncludeDrawSheetFields(largeRuns);
  assertNoHorseDuplicatePerClass(largeFixture);
  assertMaxThreeEntriesPerRiderDivision(largeFixture);
  assertMinimumRiderSpacing(largeRuns, minimumGapWithEightHorsesBetween);

  const impossibleFixture = buildImpossibleSpacingFixture();
  const impossibleRuns = buildShowScoreRunsForClass(impossibleFixture.classRecord.id, impossibleFixture.entries, impossibleFixture);

  assertEqual(impossibleRuns.length, 7, "impossible spacing fixture should keep every active entry");
  assertNoHorseDuplicatePerClass(impossibleFixture);
  assertMaxThreeEntriesPerRiderDivision(impossibleFixture);
  assertHasCompressedRiderGap(impossibleRuns, minimumGapWithEightHorsesBetween);

  console.log("Draw test program OK");
  console.log(`Large bloc: ${largeRuns.length} runs, ${countLateRuns(largeRuns)} late, minimum repeated-rider gap ${minimumRepeatedRiderGap(largeRuns)}.`);
  console.log(`Impossible edge case: ${impossibleRuns.length} runs, minimum repeated-rider gap ${minimumRepeatedRiderGap(impossibleRuns)}.`);
}

function buildLargeDrawFixture(): DrawFixture {
  const classRecord = makeClass("draw-class-open", "Draw Test 1100 Open");
  const openDivision = makeDivision("draw-division-open", classRecord.id, "1100 Open", "1100");
  const otherClassDivision = makeDivision("draw-division-other-class", "draw-class-other", "Other Bloc Class", "9999");
  const riders = Array.from({ length: 17 }, (_, index) => makeContact(`rider-${index + 1}`, "rider", "Draw Rider", String(index + 1).padStart(2, "0")));
  const owners = Array.from({ length: 50 }, (_, index) => makeContact(`owner-${index + 1}`, "owner", "Draw Owner", String(index + 1).padStart(2, "0")));
  const contacts = [...riders, ...owners];
  const horses = Array.from({ length: 50 }, (_, index) => makeHorse(`horse-${index + 1}`, `Draw Horse ${String(index + 1).padStart(2, "0")}`, owners[index].id));
  const entries: Entry[] = [];

  for (let rideRound = 0; rideRound < 3; rideRound += 1) {
    for (let riderIndex = 0; riderIndex < 14; riderIndex += 1) {
      const entryIndex = rideRound * 14 + riderIndex;
      entries.push(makeEntry(`entry-regular-${entryIndex + 1}`, horses[entryIndex], riders[riderIndex], openDivision, false, "active"));
    }
  }

  for (let lateIndex = 0; lateIndex < 3; lateIndex += 1) {
    const horseIndex = 42 + lateIndex;
    entries.push(makeEntry(`entry-late-${lateIndex + 1}`, horses[horseIndex], riders[14 + lateIndex], openDivision, true, "active"));
  }

  entries.push(makeEntry("entry-cancelled", horses[45], riders[0], openDivision, false, "cancelled"));
  entries.push(makeEntry("entry-scratched", horses[46], riders[1], openDivision, false, "scratched"));
  entries.push(makeEntry("entry-other-class", horses[47], riders[2], otherClassDivision, false, "active"));

  return {
    classRecord,
    contacts,
    divisions: [openDivision, otherClassDivision],
    entries,
    horses,
  };
}

function buildImpossibleSpacingFixture(): DrawFixture {
  const classRecord = makeClass("draw-class-short", "Draw Test Short Edge");
  const division = makeDivision("draw-division-short", classRecord.id, "Short Edge", "EDGE");
  const riders = Array.from({ length: 5 }, (_, index) => makeContact(`short-rider-${index + 1}`, "rider", "Short Rider", String(index + 1)));
  const owners = Array.from({ length: 7 }, (_, index) => makeContact(`short-owner-${index + 1}`, "owner", "Short Owner", String(index + 1)));
  const contacts = [...riders, ...owners];
  const horses = Array.from({ length: 7 }, (_, index) => makeHorse(`short-horse-${index + 1}`, `Short Horse ${index + 1}`, owners[index].id));
  const entries = [
    makeEntry("short-entry-1", horses[0], riders[0], division, false, "active"),
    makeEntry("short-entry-2", horses[1], riders[0], division, false, "active"),
    makeEntry("short-entry-3", horses[2], riders[0], division, false, "active"),
    makeEntry("short-entry-4", horses[3], riders[1], division, false, "active"),
    makeEntry("short-entry-5", horses[4], riders[2], division, false, "active"),
    makeEntry("short-entry-6", horses[5], riders[3], division, false, "active"),
    makeEntry("short-entry-7", horses[6], riders[4], division, false, "active"),
  ];

  return {
    classRecord,
    contacts,
    divisions: [division],
    entries,
    horses,
  };
}

function makeClass(id: string, name: string): ClassRecord {
  return {
    id,
    organization_id: organizationId,
    show_id: showId,
    show_day_id: "draw-test-day",
    class_template_id: null,
    name,
    code: null,
    block_label: "Draw Test Block",
    arena: "Main Arena",
    pattern: "8",
    custom_pattern: null,
    sanctioning_body_codes: ["NRHA"],
    back_number_policy: "horse",
    nrha_slate_number: "Slate 1",
    entries_close_at: "2026-06-03T22:00:00.000Z",
    late_entries_allowed: true,
    late_entry_fee_percent: 50,
    draw_prepared_at: null,
    eligibility_rules: {},
    judge_name: null,
    sort_order: 1,
    entry_fee: 125,
    status: "open",
    is_public: true,
    created_at: createdAt,
  };
}

function makeDivision(id: string, classId: string, name: string, code: string): Division {
  return {
    id,
    organization_id: organizationId,
    show_id: showId,
    class_id: classId,
    class_template_division_id: null,
    name,
    level: null,
    code,
    entry_fee: 125,
    judge_fee: 10,
    payout_schedule_type: "nrha_schedule_a",
    added_money: 500,
    retainage_percent: 35,
    trophy_or_plaque_fee: 20,
    sanctioning_fee_percent: null,
    payout_rules: {},
    payout_notes: null,
    sanctioning_body_codes: ["NRHA"],
    eligibility_rules: {},
    created_at: createdAt,
  };
}

function makeContact(id: string, type: Contact["type"], firstName: string, lastName: string): Contact {
  return {
    id,
    organization_id: organizationId,
    type,
    first_name: firstName,
    last_name: lastName,
    email: `${id}@example.test`,
    phone: null,
    barn_name: null,
    linked_user_id: null,
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
    date_of_birth: "2018-05-01",
    birth_year: 2018,
    registration_number: id.toUpperCase(),
    primary_owner_contact_id: ownerContactId,
    created_at: createdAt,
  };
}

function makeEntry(
  id: string,
  horse: Horse,
  rider: Contact,
  division: Division,
  isLate: boolean,
  status: Entry["status"],
): Entry {
  return {
    id,
    organization_id: organizationId,
    show_id: showId,
    horse_id: horse.id,
    division_id: division.id,
    created_by_user_id: createdByUserId,
    owner_contact_id: horse.primary_owner_contact_id,
    rider_contact_id: rider.id,
    payer_contact_id: horse.primary_owner_contact_id,
    status,
    entry_number: entryNumberForHorse(horse),
    base_fee: 125,
    total_fees: isLate ? 187.5 : 125,
    is_late: isLate,
    late_fee_percent: isLate ? 50 : 0,
    late_fee_amount: isLate ? 62.5 : 0,
    created_at: createdAt,
  };
}

function assertLateRunsStartWithNegativeDraws(runs: ShowScoreRun[], lateCount: number) {
  const lateDraws = runs.slice(0, lateCount).map((run) => run.draw);

  assertEqual(lateDraws.join(","), "-3,-2,-1", "late entries should start the bloc with negative draw numbers");
  assert(runs.slice(0, lateCount).every((run) => run.isLate && run.drawGroup === "late"), "late runs should be first and marked as late");
  assert(runs.slice(lateCount).every((run) => !run.isLate && run.drawGroup === "regular"), "regular runs should follow late runs");
}

function assertRegularDrawsAreSequential(runs: ShowScoreRun[], regularCount: number) {
  const regularDraws = runs.filter((run) => !run.isLate).map((run) => run.draw);
  const expectedDraws = Array.from({ length: regularCount }, (_, index) => index + 1);

  assertEqual(regularDraws.join(","), expectedDraws.join(","), "regular entries should receive sequential positive draws");
}

function assertNoInactiveEntries(runs: ShowScoreRun[], entries: Entry[]) {
  const inactiveEntryIds = new Set(entries.filter((entry) => ["cancelled", "scratched", "scratched_pending_refund"].includes(entry.status)).map((entry) => entry.id));

  assert(!runs.some((run) => inactiveEntryIds.has(run.entryId)), "cancelled or scratched entries should not become scoring runs");
}

function assertNoOutsideClassEntries(runs: ShowScoreRun[], classId: string) {
  assert(runs.every((run) => run.classId === classId), "runs should only include entries from the requested bloc");
}

function assertRunsIncludeDrawSheetFields(runs: ShowScoreRun[]) {
  assert(runs.every((run) => run.backNumber), "runs should include back numbers when entries have assigned dossards");
  assert(runs.every((run) => run.owner), "runs should include owner display names");
  assert(runs.every((run) => run.divisionNames.some((name) => name.includes("Open"))), "runs should include entered class names");
}

function assertNoHorseDuplicatePerClass(fixture: DrawFixture) {
  const classDivisionIds = new Set(fixture.divisions.filter((division) => division.class_id === fixture.classRecord.id).map((division) => division.id));
  const activeEntries = fixture.entries.filter((entry) => classDivisionIds.has(entry.division_id) && entry.status !== "cancelled" && entry.status !== "scratched" && entry.status !== "scratched_pending_refund");
  const horseIds = activeEntries.map((entry) => entry.horse_id);

  assertEqual(new Set(horseIds).size, horseIds.length, "a horse should only appear once per bloc");
}

function entryNumberForHorse(horse: Horse) {
  const match = horse.id.match(/\d+/);
  return match ? 100 + Number(match[0]) : null;
}

function assertMaxThreeEntriesPerRiderDivision(fixture: DrawFixture) {
  const counts = new Map<string, number>();
  const activeEntries = fixture.entries.filter((entry) => entry.status !== "cancelled" && entry.status !== "scratched" && entry.status !== "scratched_pending_refund");

  for (const entry of activeEntries) {
    const key = `${entry.division_id}:${entry.rider_contact_id ?? entry.owner_contact_id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const [key, count] of counts) {
    assert(count <= 3, `rider/class ${key} has more than three entries`);
  }
}

function assertMinimumRiderSpacing(runs: ShowScoreRun[], minimumGap: number) {
  const positionsByRider = buildPositionsByRider(runs);

  for (const [riderId, positions] of positionsByRider) {
    for (let index = 1; index < positions.length; index += 1) {
      const gap = positions[index] - positions[index - 1];
      assert(gap >= minimumGap, `rider ${riderId} should have at least eight horses between runs, got position gap ${gap}`);
    }
  }
}

function assertHasCompressedRiderGap(runs: ShowScoreRun[], minimumGap: number) {
  const minimumGapFound = minimumRepeatedRiderGap(runs);

  assert(minimumGapFound < minimumGap, "short impossible fixture should expose a compressed repeated-rider gap");
}

function minimumRepeatedRiderGap(runs: ShowScoreRun[]) {
  const positionsByRider = buildPositionsByRider(runs);
  let minimumGap = Number.POSITIVE_INFINITY;

  for (const positions of positionsByRider.values()) {
    for (let index = 1; index < positions.length; index += 1) {
      minimumGap = Math.min(minimumGap, positions[index] - positions[index - 1]);
    }
  }

  return Number.isFinite(minimumGap) ? minimumGap : 0;
}

function buildPositionsByRider(runs: ShowScoreRun[]) {
  const positionsByRider = new Map<string, number[]>();

  runs.forEach((run, index) => {
    const riderKey = run.riderContactId ?? run.ownerContactId;
    const positions = positionsByRider.get(riderKey) ?? [];
    positions.push(index);
    positionsByRider.set(riderKey, positions);
  });

  return positionsByRider;
}

function countLateRuns(runs: ShowScoreRun[]) {
  return runs.filter((run) => run.isLate).length;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
}

main();
