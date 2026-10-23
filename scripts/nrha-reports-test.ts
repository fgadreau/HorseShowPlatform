import { buildNrhaResultsReport, cadToUsd, nrhaResultsHeaders, serializeNrhaResultsCsv, type NrhaReportData } from "../src/lib/nrhaResultsCsv";
import { buildPayoutDraft } from "../src/lib/payouts";
import type { Block, ClassRecord, Contact, ContactExternalIdentifier, Entry, EntryResult, ExternalCredentialIssuer, Horse, HorseExternalIdentifier, Organization, PayoutCalculation, Show, Slate } from "../src/types/domain";

let checks = 0;
function equal(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  checks++;
}
function throws(action: () => unknown, label: string) {
  let rejected = false;
  try { action(); } catch { rejected = true; }
  equal(rejected, true, label);
}
const options = { showId: "show", fallbackShowNumber: "", usdPerCad: "0.73", goType: "1", goNum: "1" };
export function fixture() {
  const data: NrhaReportData = {
    organization: { id: "org", currency: "CAD" } as Organization,
    shows: [{ id: "show", organization_id: "org", name: "DEMO", default_currency: "CAD" } as Show],
    slates: [{ id: "slate", show_id: "show", organization_id: "org", technical_number: "000123", name: "DEMO 1" } as Slate],
    blocks: [{ id: "block", organization_id: "org", show_id: "show", slate_id: "slate", pattern: "R16", sort_order: 1 } as Block],
    classes: [{ id: "class", name: "DEMO NRHA", organization_id: "org", show_id: "show", block_id: "block", sort_order: 1, entry_fee: 100, payout_schedule_type: "jackpot_100", added_money: 0, payout_rules: {}, governing_body_assignments: [{ code: "NRHA", reporting_class_code: "1700" }] } as ClassRecord],
    entries: [1, 2, 3, 4].map((index) => ({ id: `e${index}`, organization_id: "org", show_id: "show", class_id: "class", horse_id: "horse", owner_contact_id: "rider", rider_contact_id: "rider", status: "active", entry_number: index, base_fee: 100 } as Entry)),
    entryResults: [1, 2, 3, 4].map((index) => ({ entry_id: `e${index}`, show_id: "show", class_id: "class", final_score: index <= 2 ? 70.5 : index === 3 ? 0 : null, status: index <= 3 ? "scored" : "scratch", updated_at: "2026-10-23" } as EntryResult)),
    contacts: [{ id: "rider", first_name: "Éloïse", last_name: 'Test; "CSV"', middle_name: null } as Contact],
    horses: [{ id: "horse", name: "DEMO horse" } as Horse],
    externalCredentialIssuers: [{ id: "nrha", code: "NRHA" } as ExternalCredentialIssuer],
    contactExternalIdentifiers: [{ contact_id: "rider", external_credential_issuer_id: "nrha", identifier_type: "membership", identifier_value: "00123", status: "active" } as ContactExternalIdentifier],
    horseExternalIdentifiers: [{ horse_id: "horse", external_credential_issuer_id: "nrha", identifier_type: "competition_license", identifier_value: "00678", status: "active" } as HorseExternalIdentifier],
    payoutCalculations: [], payoutAwards: [], payoutSchedules: [], payoutScheduleBrackets: [],
  };
  const draft = buildPayoutDraft({ ...data, classRecord: data.classes[0], show: data.shows[0] });
  data.payoutCalculations = [{ ...draft.calculation, id: "calc", status: "published", calculated_at: "2026-10-23" } as PayoutCalculation];
  return data;
}

equal(cadToUsd(100, "0.73"), "73.00", "conversion direction");
equal(cadToUsd(0.01, "0.5"), "0.01", "half cent rounds up");
equal(cadToUsd(123.45, "0,73123456"), "90.27", "decimal comma and precision");
equal(cadToUsd(0, "1"), "0.00", "zero award");
for (const rate of ["", "0", "-1", "Infinity", "1e-2", "0.123456789", "NaN"]) throws(() => cadToUsd(1, rate), `reject rate ${rate}`);
throws(() => cadToUsd(NaN, "0.73"), "reject corrupt award");
const data = fixture();
const original = JSON.stringify(data);
const report = buildNrhaResultsReport(data, options);
equal(report.errors, [], "valid published report");
equal(report.rows.length, 3, "scratch excluded");
equal(report.rows.map((row) => row.PlaceNum), ["1", "1", "9999"], "ties and zero score");
equal(report.rows[0].EntryCount, "4", "financial count");
equal(report.rows[0].ShownCount, "3", "shown count excludes scratch");
equal(report.rows[0].PatternNum, "16", "ShowScore R16 maps to numeric patron");
equal(report.rows[0].ShowNum, "000123", "technical slate number preserved");
equal(report.rows[0].MemberNrha, "00123", "membership leading zeros");
equal(report.rows[0].HorseNrha, "00678", "license leading zeros");
equal(JSON.stringify(data), original, "export never mutates CAD data");
equal(report.totalUsd, (report.rows.reduce((sum, row) => sum + Math.round(Number(row.MoneyWon) * 100), 0) / 100).toFixed(2), "USD total sums rounded rows");
const csv = serializeNrhaResultsCsv(report.rows);
equal(csv.split("\r\n")[0], nrhaResultsHeaders.join(";"), "17 reference headers, no index");
equal(csv.includes('"Test; ""CSV"", Éloïse"'), true, "CSV quotes accents and delimiter");
equal(csv.endsWith("\r\n"), true, "CRLF final newline");
equal(serializeNrhaResultsCsv([{ ...report.rows[0], Horse: "=1+2" }]).includes("'=1+2"), true, "spreadsheet formula neutralized");
for (const [label, mutate] of [
  ["unpublished", (d: NrhaReportData) => { d.payoutCalculations[0].status = "draft"; }],
  ["missing license", (d: NrhaReportData) => { d.horseExternalIdentifiers = []; }],
  ["ambiguous member", (d: NrhaReportData) => { d.contactExternalIdentifiers.push({ ...d.contactExternalIdentifiers[0], identifier_value: "999" }); }],
  ["wrong issuer", (d: NrhaReportData) => { d.externalCredentialIssuers[0].code = "AQHA"; }],
  ["missing show number", (d: NrhaReportData) => { d.slates[0].technical_number = null; }],
  ["missing pattern", (d: NrhaReportData) => { d.blocks[0].pattern = null; }],
  ["wrong currency", (d: NrhaReportData) => { d.payoutCalculations[0].currency = "USD"; }],
  ["changed score", (d: NrhaReportData) => { d.entryResults[0].final_score = 71; }],
  ["changed scratch", (d: NrhaReportData) => { d.entries[3].status = "scratched"; d.entryResults[3].status = "scored"; }],
  ["non NRHA numeric class", (d: NrhaReportData) => { d.classes[0].code = "1700"; d.classes[0].governing_body_assignments = []; }],
  ["foreign org", (d: NrhaReportData) => { d.shows[0].organization_id = "other"; }],
] as const) {
  const sample = fixture(); mutate(sample);
  equal(buildNrhaResultsReport(sample, options).errors.length > 0, true, `blocks ${label}`);
}
const fallback = fixture(); fallback.slates[0].technical_number = null;
equal(buildNrhaResultsReport(fallback, { ...options, fallbackShowNumber: "987" }).rows[0].ShowNum, "987", "manual fallback show number");
equal(buildNrhaResultsReport(data, { ...options, slateId: "unrelated" }).rows.length, 0, "slate scope");
console.log(`NRHA reports: ${checks} checks passed`);
