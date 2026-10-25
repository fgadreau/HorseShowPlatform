import { buildPayoutDraft, payoutDraftMatchesCalculation } from "./payouts";
import type { Block, ClassRecord, Contact, ContactExternalIdentifier, Entry, EntryResult, ExternalCredentialIssuer, Horse, HorseExternalIdentifier, Organization, PayoutAward, PayoutCalculation, PayoutSchedule, PayoutScheduleBracket, Show, Slate } from "../types/domain";

// Matches the supplied 201227401.csv (no spreadsheet row-index column).
export const nrhaResultsHeaders = ["ShowNum", "ShowName", "ClassName", "ClassCode", "PatternNum", "EntryCount", "ShownCount", "GoType", "GoNum", "Horse", "HorseNrha", "Member", "MemberNrha", "BackNum", "PlaceNum", "TotalScore", "MoneyWon"] as const;
export type NrhaResultsRow = Record<typeof nrhaResultsHeaders[number], string>;
export type NrhaReportData = {
  organization: Organization;
  shows: Show[];
  slates: Slate[];
  blocks: Block[];
  classes: ClassRecord[];
  entries: Entry[];
  entryResults: EntryResult[];
  contacts: Contact[];
  horses: Horse[];
  contactExternalIdentifiers: ContactExternalIdentifier[];
  horseExternalIdentifiers: HorseExternalIdentifier[];
  externalCredentialIssuers: ExternalCredentialIssuer[];
  payoutCalculations: PayoutCalculation[];
  payoutAwards: PayoutAward[];
  payoutSchedules: PayoutSchedule[];
  payoutScheduleBrackets: PayoutScheduleBracket[];
};
export type NrhaReportOptions = {
  showId: string;
  slateId?: string;
  fallbackShowNumber: string;
  usdPerCad: string;
  goType: string;
  goNum: string;
};

export function nrhaClassCode(record: ClassRecord) {
  return record.governing_body_assignments.find((assignment) => assignment.code.trim().toUpperCase() === "NRHA")?.reporting_class_code?.trim() ?? "";
}

// Decimal arithmetic: CAD cents × a manually supplied decimal rate, rounded half up.
export function cadToUsd(amount: number, rate: string): string {
  const normalized = rate.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,8})?$/.test(normalized)) throw new Error("Taux invalide : indiquez le montant USD pour 1 CAD (8 décimales maximum).");
  const [whole, fraction = ""] = normalized.split(".");
  const numerator = BigInt(whole + fraction);
  if (numerator <= 0n) throw new Error("Le taux doit être supérieur à zéro.");
  if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(Math.round(amount * 100))) throw new Error("Gain CAD invalide.");
  const denominator = 10n ** BigInt(fraction.length);
  const cents = (BigInt(Math.round(amount * 100)) * numerator * 2n + denominator) / (denominator * 2n);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export function buildNrhaResultsReport(data: NrhaReportData, options: NrhaReportOptions) {
  const errors: string[] = [];
  const rows: NrhaResultsRow[] = [];
  const fail = (message: string) => { if (!errors.includes(message)) errors.push(message); };
  try { cadToUsd(0, options.usdPerCad); } catch (error) { fail((error as Error).message); }
  if (!/^[1-9]\d*$/.test(options.goType) || !/^[1-9]\d*$/.test(options.goNum)) fail("GoType et GoNum doivent être des entiers positifs.");
  const show = data.shows.find((candidate) => candidate.id === options.showId && candidate.organization_id === data.organization.id);
  if (!show) return { rows, errors: ["Sélectionnez un concours de cette association."], classCount: 0, totalCad: 0, totalUsd: "0.00" };
  const blocks = new Map(data.blocks.filter((block) => block.show_id === show.id && block.organization_id === data.organization.id).map((block) => [block.id, block]));
  const slates = new Map(data.slates.filter((slate) => slate.show_id === show.id && slate.organization_id === data.organization.id).map((slate) => [slate.id, slate]));
  const classes = data.classes.filter((record) => record.organization_id === data.organization.id && record.show_id === show.id && nrhaClassCode(record) && (!options.slateId || blocks.get(record.block_id)?.slate_id === options.slateId))
    .sort((a, b) => (blocks.get(a.block_id)?.sort_order ?? 0) - (blocks.get(b.block_id)?.sort_order ?? 0) || a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  if (!classes.length) fail("Aucune classe avec un numéro de classe NRHA dans cette sélection.");
  const issuerIds = new Set(data.externalCredentialIssuers.filter((issuer) => issuer.code.trim().toUpperCase() === "NRHA").map((issuer) => issuer.id));
  function identifier(records: Array<ContactExternalIdentifier | HorseExternalIdentifier>) {
    const values = [...new Set(records.filter((record) => issuerIds.has(record.external_credential_issuer_id) && !["revoked", "inactive"].includes(record.status)).map((record) => record.identifier_value.trim()).filter(Boolean))];
    return values.length === 1 ? values[0] : "";
  }
  let totalCadCents = 0;
  for (const record of classes) {
    const label = record.name;
    const block = blocks.get(record.block_id);
    const slate = block?.slate_id ? slates.get(block.slate_id) : undefined;
    const showNumber = slate?.technical_number?.trim() || options.fallbackShowNumber.trim();
    if (!/^\d+$/.test(showNumber)) fail(`${label} : numéro de concours NRHA manquant ou invalide.`);
    const pattern = block?.pattern?.trim().match(/^(?:(?:NRHA|R|REINING)\s*(?:#|PATTERN)?\s*)?(\d+)$/i)?.[1] ?? "";
    if (!pattern) fail(`${label} : numéro de patron manquant ou non numérique.`);
    if (!/^\d+$/.test(nrhaClassCode(record))) fail(`${label} : code de classe NRHA non numérique.`);
    const calculation = data.payoutCalculations.filter((candidate) => candidate.class_id === record.id && candidate.show_id === show.id).sort((a, b) => b.calculated_at.localeCompare(a.calculated_at) || b.id.localeCompare(a.id))[0];
    if (!calculation || calculation.status !== "published") { fail(`${label} : publiez les résultats et les bourses avant l’export.`); continue; }
    if (calculation.currency !== "CAD") { fail(`${label} : les gains source doivent être en CAD.`); continue; }
    const entries = data.entries.filter((entry) => entry.organization_id === data.organization.id && entry.show_id === show.id && entry.class_id === record.id);
    const draft = buildPayoutDraft({ classRecord: record, entries, entryResults: data.entryResults.filter((result) => result.show_id === show.id && result.class_id === record.id), contacts: data.contacts, horses: data.horses, organization: data.organization, show, existingAwards: data.payoutAwards.filter((award) => award.calculation_id === calculation.id), payoutSchedules: data.payoutSchedules, payoutScheduleBrackets: data.payoutScheduleBrackets });
    if (!payoutDraftMatchesCalculation(draft, calculation)) fail(`${label} : les données ont changé depuis le calcul publié. Recalculez et republiez les bourses.`);
    const snapshot = calculation.result_snapshot;
    const signature = (results: typeof snapshot) => JSON.stringify(results.map((result) => [result.entry_id, result.status, result.final_score, result.back_number, result.horse_name, result.rider_name]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
    if (signature(snapshot) !== signature(draft.calculation.result_snapshot)) fail(`${label} : les inscriptions ou les performances ont changé depuis la publication. Recalculez et republiez les bourses.`);
    const scratchedIds = new Set(entries.filter((entry) => entry.status === "scratched").map((entry) => entry.id));
    const shown = snapshot.filter((result) => result.status !== "scratch" && result.status !== "pending" && !scratchedIds.has(result.entry_id));
    if (snapshot.some((result) => result.status === "pending" && !scratchedIds.has(result.entry_id))) fail(`${label} : des performances restent sans résultat.`);
    for (const result of shown) {
      const entry = entries.find((candidate) => candidate.id === result.entry_id);
      if (!entry) { fail(`${label} : inscription publiée introuvable.`); continue; }
      const horse = data.horses.find((candidate) => candidate.id === entry.horse_id);
      const rider = data.contacts.find((candidate) => candidate.id === (entry.rider_contact_id ?? entry.owner_contact_id));
      const horseNrha = identifier(data.horseExternalIdentifiers.filter((id) => id.horse_id === entry.horse_id && id.identifier_type === "competition_license"));
      const memberNrha = identifier(data.contactExternalIdentifiers.filter((id) => id.contact_id === rider?.id && id.identifier_type === "membership"));
      if (!horse || !horseNrha) fail(`${label} / ${result.horse_name} : numéro NRHA du cheval manquant ou ambigu.`);
      if (!rider || !memberNrha) fail(`${label} / ${result.rider_name} : numéro NRHA du cavalier manquant ou ambigu.`);
      if ((horseNrha && !/^\d+$/.test(horseNrha)) || (memberNrha && !/^\d+$/.test(memberNrha))) fail(`${label} : les numéros NRHA doivent être numériques.`);
      if (!result.back_number) fail(`${label} / ${result.horse_name} : dossard manquant.`);
      if (result.status === "scored" && (result.final_score == null || !Number.isFinite(result.final_score))) fail(`${label} / ${result.horse_name} : score manquant ou invalide.`);
      const placed = result.status === "scored" && (result.final_score ?? 0) > 0;
      if (placed && (!result.rank || result.rank < 1)) fail(`${label} / ${result.horse_name} : classement manquant.`);
      let money = "0.00";
      try { money = cadToUsd(result.payout_amount, options.usdPerCad); } catch (error) { fail((error as Error).message); }
      totalCadCents += Math.round(result.payout_amount * 100);
      rows.push({ ShowNum: showNumber, ShowName: slate?.name ?? show.name, ClassName: record.name, ClassCode: nrhaClassCode(record), PatternNum: pattern, EntryCount: String(snapshot.length), ShownCount: String(shown.length), GoType: options.goType, GoNum: options.goNum, Horse: result.horse_name, HorseNrha: horseNrha, Member: rider ? `${rider.last_name}, ${rider.first_name}${rider.middle_name ? ` ${rider.middle_name}` : ""}` : result.rider_name, MemberNrha: memberNrha, BackNum: result.back_number ?? "", PlaceNum: placed ? String(result.rank) : "9999", TotalScore: placed ? String(result.final_score) : "0", MoneyWon: money });
    }
  }
  if (!rows.length && !errors.length) fail("Aucune performance à exporter.");
  // Sum the individually rounded USD rows, as they appear in the file.
  const usdCents = rows.reduce((sum, row) => sum + Math.round(Number(row.MoneyWon) * 100), 0);
  return { rows, errors, classCount: classes.length, totalCad: totalCadCents / 100, totalUsd: (usdCents / 100).toFixed(2) };
}

export function serializeNrhaResultsCsv(rows: NrhaResultsRow[]) {
  const escape = (raw: string) => {
    const value = /^[\s]*[=+@-]/.test(raw) || /^[\t\r\n]/.test(raw) ? `'${raw}` : raw;
    return /[;"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  return [nrhaResultsHeaders.join(";"), ...rows.map((row) => nrhaResultsHeaders.map((header) => escape(row[header])).join(";"))].join("\r\n") + "\r\n";
}
