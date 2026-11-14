import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, Save } from "lucide-react";
import { billingRpc, type Json } from "../../services/billingFolio";
import { serializeAccountingExport, type AccountingPayload, type AccountingSoftware } from "./accountingExport";

const SOFTWARE: { id: AccountingSoftware; fr: string; en: string }[] = [
  { id: "quickbooks_online", fr: "QuickBooks Online", en: "QuickBooks Online" },
  { id: "xero", fr: "Xero", en: "Xero" },
  { id: "sage_50_ca", fr: "Sage 50 Canada (Simple Comptable)", en: "Sage 50 Canada" },
];
const today = () => new Date().toISOString().slice(0, 10);

function message(code: string, fr: boolean) {
  const labels: Record<string, [string, string]> = {
    BILLING_FORBIDDEN: ["Ton rôle ne permet pas de gérer les exports comptables de l’association.", "Your role cannot manage the association's accounting exports."],
    ACCOUNTING_MAPPING_REQUIRED: ["Complète et enregistre tous les comptes requis avant d’exporter.", "Complete and save every required account before exporting."],
    ACCOUNTING_NOTHING_TO_EXPORT: ["Aucune écriture n’est disponible pour cette sélection.", "There are no journal entries for this selection."],
    ACCOUNTING_UNBALANCED: ["L’écriture n’est pas équilibrée. Aucun fichier n’a été créé.", "The journal is not balanced. No file was created."],
    BILLING_PREVIOUS_COMMAND_UNRESOLVED: ["Une opération précédente doit d’abord être vérifiée.", "A previous operation must be checked first."],
  };
  return labels[code]?.[fr ? 0 : 1] ?? (fr ? `Impossible de terminer l’opération (${code}).` : `Unable to complete the operation (${code}).`);
}
export function AccountingExports({ context, locale }: { context: string; locale: string }) {
  const fr = locale === "fr", text = (a: string, b: string) => fr ? a : b;
  const [workspace, setWorkspace] = useState<Json>();
  const [software, setSoftware] = useState<AccountingSoftware>("quickbooks_online");
  const [kind, setKind] = useState<"show_close" | "receipts">("show_close");
  const [from, setFrom] = useState(today), [to, setTo] = useState(today), [posting, setPosting] = useState(today);
  const [accounts, setAccounts] = useState<Record<string, string>>({}), [options, setOptions] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Json>(), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [exporting, setExporting] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [revision, setRevision] = useState(0);

  const loadWorkspace = useCallback(async () => {
    const data = await billingRpc("get_billing_accounting_workspace", { p_context: context });
    setWorkspace(data);
    const start = data.show_dates?.start_date || today(), end = data.show_dates?.end_date || start;
    setFrom(current => current === today() ? start : current);setTo(current => current === today() ? end : current);setPosting(current => current === today() ? end : current);
    return data;
  }, [context]);

  useEffect(() => {
    let live = true;setLoading(true);setError("");
    void loadWorkspace().catch((cause: Error) => { if (live) setError(message(cause.message, fr)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [loadWorkspace, fr]);

  useEffect(() => {
    const profile = workspace?.profiles?.find((item: Json) => item.software === software);
    setAccounts(profile?.accounts ?? {});setOptions(profile?.options ?? {});
  }, [workspace, software]);

  useEffect(() => {
    if (!workspace?.can_manage || !from || !to || !posting) return;
    let live = true;setLoading(true);setError("");setPreview(undefined);
    const timer = setTimeout(() => {
      void billingRpc("preview_billing_accounting_export", { p_context: context, p_software: software, p_kind: kind, p_from: from, p_to: to, p_posting_date: posting })
        .then(data => { if (live) setPreview(data); }).catch((cause: Error) => { if (live) setError(message(cause.message, fr)); }).finally(() => { if (live) setLoading(false); });
    }, 150);
    return () => { live = false;clearTimeout(timer); };
  }, [context, software, kind, from, to, posting, workspace?.can_manage, revision, fr]);

  async function saveProfile() {
    setSaving(true);setError("");setNotice("");
    try {
      const cleaned = Object.fromEntries(Object.entries(accounts).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value));
      await billingRpc("save_billing_accounting_profile", { p_context: context, p_software: software, p_accounts: cleaned, p_options: options });
      await loadWorkspace();setRevision(value => value + 1);setNotice(text("Configuration comptable enregistrée.", "Accounting configuration saved."));
    } catch (cause) { setError(message((cause as Error).message, fr)); } finally { setSaving(false); }
  }

  async function createExport() {
    setExporting(true);setError("");setNotice("");
    try {
      const data = await billingRpc("create_billing_accounting_export", { p_context: context, p_request: crypto.randomUUID(), p_software: software, p_kind: kind, p_from: from, p_to: to, p_posting_date: posting }) as AccountingPayload & Json;
      const file = serializeAccountingExport(data), blob = new Blob([file.content], { type: file.mime }), url = URL.createObjectURL(blob), link = document.createElement("a");
      const scope = kind === "show_close" ? "fermeture" : `encaissements-${from}-${to}`;
      link.href = url;link.download = `hsp-${scope}-${software}.${file.extension}`;link.click();setTimeout(() => URL.revokeObjectURL(url), 1000);
      await loadWorkspace();setRevision(value => value + 1);setNotice(data.duplicate ? text("Ce même export existait déjà; le fichier a été téléchargé sans créer de doublon.", "This exact export already existed; the file was downloaded without creating a duplicate.") : text("Export créé, inscrit à l’historique et téléchargé.", "Export created, added to history and downloaded."));
    } catch (cause) { setError(message((cause as Error).message, fr)); } finally { setExporting(false); }
  }

  const required: Json[] = preview?.required_accounts ?? [];
  const money = (value: unknown) => new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: preview?.context?.currency ?? "CAD" }).format(Number(value ?? 0));
  const ready = Boolean(preview?.balanced && preview?.journals?.length && preview?.source_count > 0 && !preview?.missing_accounts?.length);

  return <details className="finance-panel finance-accounting">
    <summary>{text("Exports vers les logiciels comptables", "Accounting software exports")}</summary>
    <p>{text("Prépare des écritures équilibrées pour QuickBooks Online, Xero ou Sage 50 Canada. Les frais HSP sont exclus des revenus de l’association.", "Prepare balanced journals for QuickBooks Online, Xero or Sage 50 Canada. HSP fees are excluded from association revenue.")}</p>
    {workspace && !workspace.can_manage ? <p className="finance-accounting-note">{message("BILLING_FORBIDDEN", fr)}</p> : null}
    {workspace?.can_manage ? <>
      <div className="finance-accounting-controls">
        <label>{text("Logiciel", "Software")}<select value={software} onChange={event => setSoftware(event.target.value as AccountingSoftware)}>{SOFTWARE.map(item => <option key={item.id} value={item.id}>{fr ? item.fr : item.en}</option>)}</select></label>
        <label>{text("Type d’export", "Export type")}<select value={kind} onChange={event => setKind(event.target.value as "show_close" | "receipts")}><option value="show_close">{text("Fermeture du concours", "Show closing journal")}</option><option value="receipts">{text("Encaissements par période", "Receipts by period")}</option></select></label>
        {kind === "receipts" ? <><label>{text("Du", "From")}<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>{text("Au", "To")}<input type="date" value={to} onChange={event => setTo(event.target.value)} /></label></> : null}
        <label>{text("Date de comptabilisation", "Posting date")}<input type="date" value={posting} onChange={event => setPosting(event.target.value)} /></label>
      </div>
      <section className="finance-accounting-mapping" aria-labelledby="accounting-mapping-title">
        <header><div><h3 id="accounting-mapping-title">{text("Correspondance des comptes", "Account mapping")}</h3><p>{software === "quickbooks_online" ? text("Inscris le nom exact du compte QuickBooks.", "Enter the exact QuickBooks account name.") : software === "xero" ? text("Inscris le code de compte Xero.", "Enter the Xero account code.") : text("Inscris le numéro de compte Sage 50.", "Enter the Sage 50 account number.")}</p></div><button type="button" onClick={saveProfile} disabled={saving || loading}><Save size={16} />{saving ? text("Enregistrement…", "Saving…") : text("Enregistrer", "Save")}</button></header>
        {required.length ? <div className="finance-accounting-fields">{required.map(item => <label key={item.key}>{fr ? item.label_fr : item.label_en}<small>{item.key}</small><input value={accounts[item.key] ?? ""} onChange={event => setAccounts(current => ({ ...current, [item.key]: event.target.value }))} autoComplete="off" /></label>)}</div> : <p>{loading ? text("Analyse des écritures…", "Analyzing journals…") : text("Aucun compte requis pour cette sélection.", "No account is required for this selection.")}</p>}
        <details><summary>{text("Options du journal", "Journal options")}</summary><div className="finance-accounting-fields"><label>{text("Préfixe du numéro", "Journal number prefix")}<input maxLength={24} value={options.journal_prefix ?? ""} onChange={event => setOptions(current => ({ ...current, journal_prefix: event.target.value }))} placeholder={kind === "show_close" ? "HSP-CLOSE" : "HSP-RCPT"} /></label><label>{text("Nom du suivi", "Tracking name")}<input maxLength={80} value={options.tracking_name ?? ""} onChange={event => setOptions(current => ({ ...current, tracking_name: event.target.value }))} placeholder={text("Concours", "Show")} /></label>{software === "xero" ? <label>{text("Taux sans taxe Xero", "Xero no-tax rate")}<input maxLength={80} value={options.xero_no_tax_rate ?? ""} onChange={event => setOptions(current => ({ ...current, xero_no_tax_rate: event.target.value }))} placeholder="No Tax" /></label> : null}</div></details>
      </section>
      {error ? <p role="alert" className="finance-accounting-error">{error}</p> : null}{notice ? <p role="status" className="finance-accounting-success">{notice}</p> : null}
      {preview ? <section className="finance-accounting-preview"><header><div><h3>{text("Prévisualisation débit/crédit", "Debit/credit preview")}</h3><p>{preview.source_count} {kind === "show_close" ? text("frais sources", "source charges") : text("paiements sources", "source payments")} · {preview.journals.length} {text("écriture(s)", "journal(s)")}</p></div><button className="finance-primary" type="button" onClick={createExport} disabled={!ready || exporting}><Download size={16} />{exporting ? text("Création…", "Creating…") : text("Créer et télécharger", "Create and download")}</button></header>
        <div className="finance-table-wrap"><table><thead><tr><th>{text("Écriture", "Journal")}</th><th>{text("Compte", "Account")}</th><th>{text("Description", "Description")}</th><th>{text("Débit", "Debit")}</th><th>{text("Crédit", "Credit")}</th></tr></thead><tbody>{preview.journals.flatMap((journal: Json) => journal.lines.map((line: Json, index: number) => <tr key={`${journal.number}:${index}`}><td>{journal.number}<small>{journal.date}</small></td><td>{line.account || <strong className="finance-balance-due">{text("À configurer", "Mapping required")}</strong>}</td><td>{line.description}</td><td>{line.debit ? money(line.debit) : "—"}</td><td>{line.credit ? money(line.credit) : "—"}</td></tr>))}</tbody><tfoot><tr><th colSpan={3}>Total</th><th>{money(preview.totals.debits)}</th><th>{money(preview.totals.credits)}</th></tr></tfoot></table></div>
        <p className={preview.balanced ? "finance-accounting-success" : "finance-accounting-error"}>{preview.balanced ? text("Écriture équilibrée.", "Journal balanced.") : text("Écriture non équilibrée — export bloqué.", "Journal unbalanced — export blocked.")}{preview.missing_accounts.length ? ` ${text("Enregistre les comptes manquants.", "Save the missing account mappings.")}` : ""}</p>
        {preview.warnings?.some((warning: Json) => warning.code === "processing_fee_unknown") ? <p className="finance-accounting-note">{text("Certains paiements n’ont aucun frais de traitement enregistré; ils sont exportés avec un frais de 0 $. Vérifie-les avant l’import.", "Some payments have no recorded processing fee; they are exported with a $0 fee. Review them before import.")}</p> : null}
      </section> : null}
      {workspace.history?.length ? <details className="finance-accounting-history"><summary>{text("Historique des exports", "Export history")}</summary><ul>{workspace.history.map((item: Json) => <li key={item.id}><strong>{SOFTWARE.find(value => value.id === item.software)?.[fr ? "fr" : "en"] ?? item.software}</strong> · {item.export_kind === "show_close" ? text("fermeture", "closing") : text("encaissements", "receipts")} · {new Date(item.created_at).toLocaleString(fr ? "fr-CA" : "en-CA")}<small>{item.journal_number}</small></li>)}</ul></details> : null}
      <button className="finance-accounting-refresh" type="button" onClick={() => setRevision(value => value + 1)} disabled={loading}><RefreshCw size={15} />{text("Recalculer", "Recalculate")}</button>
    </> : loading ? <p role="status">{text("Chargement de la configuration comptable…", "Loading accounting configuration…")}</p> : null}
  </details>;
}
