import type { IncentiveNominationCsvRow } from "../services/supabaseServices";

export type IncentiveNominationCsvPreview = {
  rows: IncentiveNominationCsvRow[];
  errors: Array<{ row: number; message: string }>;
};

const columns: Array<keyof IncentiveNominationCsvRow> = [
  "program_code",
  "horse_name",
  "registration_number",
  "nomination_role",
  "season_year",
  "status",
  "nominated_on",
  "valid_from",
  "valid_until",
  "qualifying_stallion_reference",
  "reference_number",
  "notes",
];

const aliases: Record<string, keyof IncentiveNominationCsvRow> = {
  program_code: "program_code",
  code_programme: "program_code",
  horse_name: "horse_name",
  nom_cheval: "horse_name",
  registration_number: "registration_number",
  numero_enregistrement: "registration_number",
  no_enregistrement: "registration_number",
  nomination_role: "nomination_role",
  role_nomination: "nomination_role",
  season_year: "season_year",
  saison: "season_year",
  status: "status",
  statut: "status",
  nominated_on: "nominated_on",
  date_nomination: "nominated_on",
  valid_from: "valid_from",
  valide_du: "valid_from",
  valid_until: "valid_until",
  valide_au: "valid_until",
  qualifying_stallion_reference: "qualifying_stallion_reference",
  reference_etalon: "qualifying_stallion_reference",
  reference_number: "reference_number",
  numero_reference: "reference_number",
  notes: "notes",
};

export const incentiveNominationCsvHeaders = columns.join(",");

export function parseIncentiveNominationCsv(content: string): IncentiveNominationCsvPreview {
  const records = parseCsvRecords(content.replace(/^\uFEFF/, ""));
  if (!records.length) return { rows: [], errors: [{ row: 1, message: "Le fichier CSV est vide." }] };

  const mappedHeaders = records[0].map((header) => aliases[normalizeHeader(header)] ?? null);
  const errors: IncentiveNominationCsvPreview["errors"] = [];
  if (!mappedHeaders.includes("program_code")) errors.push({ row: 1, message: "Colonne program_code / code_programme manquante." });
  if (!mappedHeaders.includes("horse_name") && !mappedHeaders.includes("registration_number")) {
    errors.push({ row: 1, message: "Ajoute horse_name / nom_cheval ou registration_number / numero_enregistrement." });
  }
  if (errors.length) return { rows: [], errors };

  const rows = records.slice(1).flatMap((record, index) => {
    if (record.every((value) => !value.trim())) return [];
    const row = Object.fromEntries(columns.map((column) => [column, ""])) as IncentiveNominationCsvRow;
    mappedHeaders.forEach((column, columnIndex) => {
      if (column) row[column] = record[columnIndex]?.trim() ?? "";
    });

    const csvRowNumber = index + 2;
    if (!row.program_code) errors.push({ row: csvRowNumber, message: "Le code du programme est requis." });
    if (!row.horse_name && !row.registration_number) errors.push({ row: csvRowNumber, message: "Le nom ou le numéro d’enregistrement du cheval est requis." });
    if (row.season_year && !/^\d{4}$/.test(row.season_year)) errors.push({ row: csvRowNumber, message: "La saison doit être une année sur quatre chiffres." });
    if (row.nomination_role && !["horse", "foal", "stallion"].includes(row.nomination_role.toLowerCase())) {
      errors.push({ row: csvRowNumber, message: "nomination_role doit être horse, foal ou stallion." });
    }
    if (row.status && !["pending", "active", "expired", "rejected", "withdrawn"].includes(row.status.toLowerCase())) {
      errors.push({ row: csvRowNumber, message: "Statut de nomination invalide." });
    }

    row.nomination_role = row.nomination_role.toLowerCase();
    row.status = row.status.toLowerCase();
    return [row];
  });

  return { rows, errors };
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseCsvRecords(content: string) {
  const delimiter = detectDelimiter(content);
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const next = content[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      record.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.length)) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  record.push(field);
  if (record.some((value) => value.length)) records.push(record);
  return records;
}

function detectDelimiter(content: string) {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  return semicolons > commas ? ";" : ",";
}
