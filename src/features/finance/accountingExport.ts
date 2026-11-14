export type AccountingSoftware = "quickbooks_online" | "xero" | "sage_50_ca";
export type AccountingLine = { account_key: string; account: string; description: string; debit: number; credit: number };
export type AccountingJournal = { number: string; date: string; narration: string; tracking_name?: string; tracking_option?: string; lines: AccountingLine[]; debits: number; credits: number; balanced: boolean };
export type AccountingPayload = { software: AccountingSoftware; export_kind: "show_close" | "receipts"; context: { name_fr?: string; name_en?: string }; profile?: { options?: Record<string, string> }; journals: AccountingJournal[]; missing_accounts: unknown[]; balanced: boolean };

const formula = /^[\s]*[=+\-@]/;
function csv(value: unknown) {
  const raw = value == null ? "" : String(value), safe = formula.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}
function rowsCsv(rows: unknown[][]) { return "\uFEFF" + rows.map(row => row.map(csv).join(",")).join("\r\n") + "\r\n"; }
function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new Error("ACCOUNTING_INVALID_DATE");
  return { year: match[1], month: match[2], day: match[3] };
}
function amount(value: unknown) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) throw new Error("ACCOUNTING_INVALID_AMOUNT");
  return Math.round(number * 100) / 100;
}
function validate(payload: AccountingPayload) {
  if (!payload.balanced || payload.missing_accounts.length) throw new Error("ACCOUNTING_EXPORT_NOT_READY");
  if (!payload.journals.length || payload.journals.some(journal => !journal.balanced || !journal.lines.length || Math.abs(amount(journal.debits) - amount(journal.credits)) >= .005)) throw new Error("ACCOUNTING_UNBALANCED");
  for (const journal of payload.journals) for (const line of journal.lines) {
    if (!line.account?.trim()) throw new Error("ACCOUNTING_MAPPING_REQUIRED");
    if (amount(line.debit) < 0 || amount(line.credit) < 0 || (amount(line.debit) > 0) === (amount(line.credit) > 0)) throw new Error("ACCOUNTING_INVALID_LINE");
  }
}
export function quickBooksJournalCsv(payload: AccountingPayload) {
  validate(payload);
  const rows: unknown[][] = [["Journal No.", "Journal Date", "Account Name", "Journal/Description", "Debits", "Credits", "Class/Location"]];
  for (const journal of payload.journals) {
    const { year, month, day } = dateParts(journal.date);
    for (const line of journal.lines) rows.push([journal.number, `${month}/${day}/${year}`, line.account, line.description || journal.narration, amount(line.debit) || "", amount(line.credit) || "", journal.tracking_option ?? ""]);
  }
  return rowsCsv(rows);
}

export function xeroManualJournalCsv(payload: AccountingPayload) {
  validate(payload);
  const rows: unknown[][] = [["Number", "Narration", "Date", "Description", "AccountCode", "TaxRate", "Debit", "Credit", "TrackingName1", "TrackingOption1"]];
  const noTax = payload.profile?.options?.xero_no_tax_rate || "No Tax";
  for (const journal of payload.journals) {
    const { year, month, day } = dateParts(journal.date);
    for (const line of journal.lines) rows.push([journal.number, journal.narration, `${day}/${month}/${year}`, line.description, line.account, noTax, amount(line.debit) || "", amount(line.credit) || "", journal.tracking_name ?? "", journal.tracking_option ?? ""]);
  }
  return rowsCsv(rows);
}

function sageQuoted(value: unknown, max: number) { return `"${String(value ?? "").slice(0, max).replace(/"/g, '""')}"`; }
export function sage50JournalText(payload: AccountingPayload) {
  validate(payload);
  const blocks: string[] = [];
  for (const journal of payload.journals) {
    const { year, month, day } = dateParts(journal.date), source = journal.number.slice(0, 20), comment = journal.narration.slice(0, 75);
    const lines = [`${month}-${day}-${year.slice(-2)},${sageQuoted(source, 20)},${sageQuoted(comment, 75)}`];
    for (const line of journal.lines) lines.push(`${sageQuoted(line.account.trim(), 80)},${amount(amount(line.debit) - amount(line.credit)).toFixed(2)},${sageQuoted(line.description, 75)}`);
    blocks.push(lines.join("\r\n"));
  }
  return blocks.join("\r\n\r\n") + "\r\n";
}

export function serializeAccountingExport(payload: AccountingPayload) {
  if (payload.software === "quickbooks_online") return { content: quickBooksJournalCsv(payload), extension: "csv", mime: "text/csv;charset=utf-8" };
  if (payload.software === "xero") return { content: xeroManualJournalCsv(payload), extension: "csv", mime: "text/csv;charset=utf-8" };
  if (payload.software === "sage_50_ca") return { content: sage50JournalText(payload), extension: "txt", mime: "text/plain;charset=utf-8" };
  throw new Error("ACCOUNTING_UNSUPPORTED_SOFTWARE");
}
