import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BarChart3, CalendarDays, CircleDollarSign, FileText, RefreshCw, Search, Users, Wallet } from "lucide-react";
import { SearchSelect } from "../../components/ui";
import { billingRpc, type Json } from "../../services/billingFolio";
import { billingError } from "./presentation";
import { navigateBilling } from "./navigation";
import { PendingCommands } from "./PendingCommands";
import { ContextFinanceReport } from "./ContextFinanceReport";
import { ContextSaleForm } from "./ContextSaleForm";
import { HspRemittances } from "./HspRemittances";
import type { FinanceViewProps } from "./FinanceView";
import "./associationFinance.css";

async function loadContexts(org: string, year: string, kind: string) {
  const rows: Json[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await billingRpc("list_billing_contexts", { p_org: org, p_kind: kind, p_year: year === "all" ? null : Number(year), p_limit: 100, p_offset: offset });
    rows.push(...page.items);
    if (!page.items.length || rows.length >= page.total) return rows;
  }
}
const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function AssociationFinanceView({ org, show = "", identity, locale, legacy, contacts = [] }: FinanceViewProps) {
  const fr = locale === "fr", text = (a: string, b: string) => fr ? a : b;
  const [url, setUrl] = useState(() => new URL(window.location.href));
  const [revision, setRevision] = useState(0), [overview, setOverview] = useState<Json>(), [contexts, setContexts] = useState<Json[]>([]);
  const [accounts, setAccounts] = useState<Json>(), [report, setReport] = useState<Json>();
  const [contextError, setContextError] = useState(""), [accountError, setAccountError] = useState(""), [reportError, setReportError] = useState("");
  const error = contextError || accountError || reportError;
  const [loadingContexts, setLoadingContexts] = useState(true), [loadingReport, setLoadingReport] = useState(false);
  const params = url.searchParams, year = params.get("year") ?? (show ? "all" : String(new Date().getFullYear()));
  const tab = params.get("tab") ?? (show ? "accounts" : "overview"), query = params.get("q") ?? "", state = params.get("state") ?? "";
  const due = params.get("due") === "true", rawOffset = Number(params.get("offset") ?? 0), offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const selectedId = params.get("context") ?? (show ? contexts.find(row => row.show_id === show)?.id ?? "" : "");
  const [search, setSearch] = useState(query);
  const patch = useCallback((values: Record<string, string>) => {
    const next = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) value ? next.searchParams.set(key, value) : next.searchParams.delete(key);
    if (!("offset" in values)) next.searchParams.delete("offset");
    navigateBilling(next.pathname + next.search);
  }, []);
  useEffect(() => {
    const changed = () => setUrl(new URL(window.location.href));
    window.addEventListener("popstate", changed); return () => window.removeEventListener("popstate", changed);
  }, []);
  useEffect(() => setSearch(query), [query]);
  useEffect(() => { if (search === query) return; const timer = setTimeout(() => patch({ q: search }), 250); return () => clearTimeout(timer); }, [search, query, patch]);
  useEffect(() => {
    let live = true; setContextError(""); setOverview(undefined); setContexts([]); setLoadingContexts(true);
    if (!org) { setLoadingContexts(false); return; }
    void Promise.all([billingRpc("get_billing_finance_overview", { p_org: org, p_year: year === "all" ? null : Number(year) }), loadContexts(org, year, "event"), loadContexts(org, year, "non_event")])
      .then(([summary, shows, outside]) => { if (live) { setOverview(summary); setContexts([...shows, ...outside].sort((a, b) => String(b.start_date ?? "").localeCompare(String(a.start_date ?? "")) || String(a.name_fr).localeCompare(String(b.name_fr)))); } })
      .catch(error => { if (live) setContextError(error.message === "BILLING_FORBIDDEN" ? billingError(error.message, locale) : fr ? "Impossible de charger le résumé et la liste des concours. Réessaie dans un instant." : "Unable to load the summary and show list. Please try again shortly."); })
      .finally(() => { if (live) setLoadingContexts(false); });
    return () => { live = false; };
  }, [org, year, revision, locale]);
  useEffect(() => {
    let live = true; setReportError(""); setReport(undefined); setLoadingReport(Boolean(selectedId));
    if (!selectedId) return;
    void billingRpc("get_billing_context_report", { p_context: selectedId, p_org: org }).then(data => { if (live) setReport(data); })
      .catch(error => { if (live) setReportError(billingError(error.message, locale)); }).finally(() => { if (live) setLoadingReport(false); });
    return () => { live = false; };
  }, [selectedId, org, revision, locale]);
  useEffect(() => {
    let live = true; setAccountError(""); setAccounts(undefined);
    if (!org || !["overview", "accounts"].includes(tab) || (show && loadingContexts)) return;
    const filter = { ...(year !== "all" ? { year: Number(year) } : {}), ...(selectedId ? { context_id: selectedId } : show ? { show_id: show } : {}), ...(state ? { state } : {}), ...(query ? { q: query } : {}) };
    void billingRpc("list_billing_finance_accounts", { p_org: org, p_filter: filter, p_due_only: tab === "overview" || due, p_limit: tab === "overview" ? 5 : 25, p_offset: tab === "overview" ? 0 : offset })
      .then(data => { if (live) setAccounts(data); }).catch(error => { if (live) setAccountError(billingError(error.message, locale)); });
    return () => { live = false; };
  }, [org, year, tab, selectedId, show, state, query, due, offset, revision, loadingContexts, locale]);
  const refresh = () => setRevision(value => value + 1);
  const name = (row: Json) => (fr ? row.name_fr : row.name_en) || row.name_fr || row.name_en || text("Concours", "Show");
  const money = (value: unknown, currency?: string) => value == null || !currency ? "—" : new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency }).format(Number(value));
  const date = (value: string) => value ? new Date(value.slice(0, 10) + "T00:00:00").toLocaleDateString(fr ? "fr-CA" : "en-CA", { year: "numeric", month: "short", day: "numeric" }) : "";
  const openAccount = (id: string) => {
    const next = new URLSearchParams(url.search); if (show) next.set("return_show", show);
    navigateBilling(`/associations/${org}/finance/accounts/${id}?${next}`);
  };
  const switchTab = (next: string) => patch({ tab: next, context: "", q: "", state: "", due: "", offset: "" });
  const contextRows = contexts.filter(row => tab === "outside" ? !row.show_id : Boolean(row.show_id))
    .filter(row => !query || normalize(`${name(row)} ${row.year ?? ""}`).includes(normalize(query)));
  const selected = contexts.find(row => row.id === selectedId), currentName = report ? name(report.context) : selected ? name(selected) : contexts.find(row => row.show_id === show) ? name(contexts.find(row => row.show_id === show)) : "";
  const summaryGroups = selectedId && report ? [{ currency: report.context.currency, total: report.totals.billed, paid: report.totals.collected, balance: report.totals.balance, accounts: report.accounts.accounts, open_accounts: report.accounts.open_accounts }] : overview?.groups ?? [];
  const testEnvironment = !["production", "prod"].includes(import.meta.env.VITE_DEPLOY_ENV);
  if (!org) return <p>{text("Sélectionne une association pour accéder à ses finances.", "Select an association to view its finances.")}</p>;

  function renderAccounts(rows: Json[], compact = false) {
    if (!rows.length) return <div className="finance-empty"><Wallet size={28} /><h3>{compact ? text("Aucun solde à recevoir", "No outstanding balances") : text("Aucun compte dans cette sélection", "No accounts in this selection")}</h3><p>{compact ? text("Les comptes de cette sélection sont réglés, ou aucune opération n’a encore été enregistrée.", "Accounts in this selection are settled, or no transactions have been recorded yet.") : text("Essaie un autre nom, une autre année ou un autre concours.", "Try another name, year or show.")}</p></div>;
    return <div className="finance-table-wrap"><table className="finance-list finance-dashboard-table"><thead><tr><th>{text("Client et compte", "Customer and account")}</th><th>{text("Concours / activité", "Show / activity")}</th><th>{text("Facturé", "Billed")}</th><th>{text("Encaissé", "Collected")}</th><th>{text("À recevoir", "Outstanding")}</th><th>{text("État", "Status")}</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td data-label={text("Client et compte", "Customer and account")}><strong>{[row.payer?.first_name, row.payer?.middle_name, row.payer?.last_name, row.payer?.company_name].filter(Boolean).join(" ") || text("Client", "Customer")}</strong><small>{row.account_number}</small></td><td data-label={text("Concours / activité", "Show / activity")}>{name(row)}<small>{row.year ?? ""}</small></td><td data-label={text("Facturé", "Billed")}>{money(row.total, row.currency)}</td><td data-label={text("Encaissé", "Collected")}>{money(row.paid, row.currency)}</td><td data-label={text("À recevoir", "Outstanding")}><strong className={Number(row.balance) > 0 ? "finance-balance-due" : ""}>{money(row.balance, row.currency)}</strong></td><td data-label={text("État", "Status")}><span className={`finance-state ${row.state}`}>{row.state === "closed" ? text("Fermé", "Closed") : text("Ouvert", "Open")}</span>{row.needs_attention ? <small>{text("À vérifier", "Needs review")}</small> : null}</td><td><button type="button" onClick={() => openAccount(row.id)}>{text("Ouvrir", "Open")}<ArrowRight size={15} /></button></td></tr>)}</tbody></table></div>;
  }
  function renderContexts(rows: Json[], compact = false) {
    return !rows.length ? <div className="finance-empty"><CalendarDays size={28} /><h3>{text("Aucun concours ou activité dans cette sélection", "No shows or activities in this selection")}</h3><p>{text("Change l’année ou efface la recherche pour voir les autres éléments.", "Change the year or clear the search to see other items.")}</p></div> : <div className="finance-context-grid">{rows.map(row => <article className="finance-context-card" key={row.id ?? row.show_id}><header><CalendarDays size={20} /><span>{row.show_id ? [date(row.start_date), date(row.end_date)].filter(Boolean).join(" – ") : text("Hors concours", "Non-show activity")}</span></header><h3>{name(row)}</h3>{row.id ? <><div className="finance-context-amount"><span>{text("À recevoir", "Outstanding")}</span><strong>{money(row.balance, row.currency)}</strong></div><div className="finance-context-meta"><span>{row.accounts ?? 0} {text("comptes", "accounts")}</span><span>{text("Encaissé", "Collected")} : {money(row.paid, row.currency)}</span></div><div className="finance-context-actions"><button type="button" onClick={() => patch({ tab: "accounts", context: row.id, q: "", offset: "", due: "" })}>{text("Voir les comptes", "View accounts")}<ArrowRight size={15} /></button>{!compact ? <button className="finance-text-button" type="button" onClick={() => patch({ tab: "reports", context: row.id, q: "", offset: "" })}>{text("Bilan financier", "Financial summary")}</button> : null}</div></> : <><p>{text("Les comptes et rapports apparaîtront lorsque des opérations financières seront enregistrées.", "Accounts and reports will appear when financial transactions are recorded.")}</p><button type="button" onClick={() => navigateBilling(`/associations/${org}/shows/${row.show_id}/accounts`)}>{text("Ouvrir le concours", "Open show")}<ArrowRight size={15} /></button></>}</article>)}</div>;
  }
  return <section className="finance finance-dashboard">
    <header className="finance-dashboard-heading"><div><p className="finance-eyebrow">{text("ASSOCIATION · FINANCES", "ASSOCIATION · FINANCE")}</p><h1>{show ? currentName || text("Finances du concours", "Show finances") : text("Tes finances, en un coup d’œil", "Your finances at a glance")}</h1><p>{text("Suis tes encaissements, retrouve les comptes et prépare le bilan de tes concours.", "Track collections, find accounts and prepare your show reports.")}</p></div><button type="button" onClick={refresh}><RefreshCw size={16} />{text("Actualiser", "Refresh")}</button></header>
    {testEnvironment ? <p className="finance-test-note">{text("Préproduction · opérations de test", "Preproduction · test transactions")}</p> : null}
    <PendingCommands identity={identity} locale={locale} onResolved={refresh} />
    <nav className="finance-dashboard-tabs" aria-label={text("Sections des finances", "Finance sections")}>{[["overview", text("Vue d’ensemble", "Overview"), BarChart3], ["accounts", text("Comptes clients", "Customer accounts"), Users], ["shows", text("Concours", "Shows"), CalendarDays], ["outside", text("Hors concours", "Non-show") , Wallet], ["reports", text("Rapports", "Reports"), FileText]].map(([key, label, Icon]) => { const TabIcon = Icon as typeof BarChart3; return <button type="button" key={String(key)} aria-current={tab === key ? "page" : undefined} onClick={() => switchTab(String(key))}><TabIcon size={18} />{String(label)}</button>; })}</nav>
    <div className="finance-dashboard-filters"><label>{text("Année", "Year")}<select value={year} onChange={event => patch({ year: event.target.value, context: "" })}><option value="all">{text("Toutes les années", "All years")}</option>{Array.from({ length: 16 }, (_, i) => new Date().getFullYear() + 2 - i).map(value => <option key={value}>{value}</option>)}</select></label>
      {["overview", "accounts", "reports"].includes(tab) ? <label className="finance-scope-filter">{text("Concours ou activité", "Show or activity")}<SearchSelect allowEmpty items={contexts.filter(row => row.id).map(row => ({ id: row.id, label: name(row) }))} value={selectedId} onChange={value => patch({ context: value })} placeholder={tab === "reports" ? text("Choisir un concours pour son rapport", "Choose a show for its report") : text("Tous les concours et activités", "All shows and activities")} disabled={Boolean(show) || loadingContexts} /></label> : null}
      {tab !== "reports" ? <label className="finance-search-filter"><span>{text("Rechercher", "Search")}</span><div><Search size={17} aria-hidden="true" /><input type="search" placeholder={tab === "accounts" || tab === "overview" ? text("Client, cheval, compte ou facture…", "Customer, horse, account or invoice…") : text("Nom du concours ou de l’activité…", "Show or activity name…")} value={search} onChange={event => { setSearch(event.target.value); if (tab === "overview" && event.target.value) patch({ tab: "accounts", q: event.target.value, offset: "" }); }} /></div></label> : null}
      {tab === "accounts" ? <><label>{text("État du compte", "Account status")}<select value={state} onChange={event => patch({ state: event.target.value })}><option value="">{text("Tous les états", "All statuses")}</option><option value="open">{text("Ouverts", "Open")}</option><option value="closed">{text("Fermés", "Closed")}</option></select></label><label className="finance-check"><input type="checkbox" checked={due} onChange={event => patch({ due: event.target.checked ? "true" : "" })} />{text("Avec un solde seulement", "Outstanding balances only")}</label></> : null}
    </div>
    {error ? <div className="finance-error" role="alert"><p>{error}</p><button type="button" onClick={refresh}>{text("Réessayer", "Retry")}</button></div> : null}
    {(loadingContexts || loadingReport) ? <p role="status" className="finance-loading">{text("Chargement des finances…", "Loading finances…")}</p> : null}
    {tab === "overview" ? <>
      {!contextError && !loadingContexts && (!selectedId || report) ? summaryGroups.length ? summaryGroups.map((group: Json) => <section className="finance-summary" key={group.currency} aria-label={`${text("Résumé financier", "Financial summary")} ${group.currency}`}><div className="finance-summary-label">{selectedId ? currentName : year === "all" ? text("Toutes les années", "All years") : year} · {group.currency}</div><div className="finance-kpi-grid">{[[text("Facturé aux clients", "Billed to customers"), group.total, CircleDollarSign, text("Taxes et frais HSP compris", "Including tax and HSP fees")], [text("Encaissé", "Collected"), group.paid, Wallet, text("Paiements reçus", "Payments received")], [text("À recevoir", "Outstanding"), group.balance, ArrowRight, text("Soldes restant à régler", "Balances still to settle")]].map(([label, value, Icon, detail]) => { const KpiIcon = Icon as typeof Wallet; return <article className="finance-kpi" key={String(label)}><KpiIcon size={20} /><span>{String(label)}</span><strong>{money(value, group.currency)}</strong><small>{String(detail)}</small></article>; })}<article className="finance-kpi"><Users size={20} /><span>{text("Comptes clients", "Customer accounts")}</span><strong>{group.accounts ?? 0}</strong><small>{group.open_accounts ?? 0} {text("encore ouverts", "still open")}</small></article></div></section>) : <div className="finance-empty"><BarChart3 size={28} /><h3>{text("Prêt pour tes premières opérations", "Ready for your first transactions")}</h3><p>{text("Les montants apparaîtront dès qu’un compte aura reçu ses premiers frais.", "Amounts will appear when the first charges are recorded on an account.")}</p></div> : null}
      <section className="finance-panel"><header className="finance-panel-heading"><div><h2>{text("Soldes à recevoir", "Outstanding balances")}</h2><p>{text("Les comptes à retrouver rapidement pour le suivi des paiements.", "Find accounts quickly to follow up on payments.")}</p></div><button type="button" onClick={() => patch({ tab: "accounts", due: "true", q: "", offset: "" })}>{text("Voir tous les soldes", "View all balances")}<ArrowRight size={16} /></button></header>{accounts ? renderAccounts(accounts.items, true) : <p role="status">{text("Chargement des comptes…", "Loading accounts…")}</p>}</section>
      <section className="finance-panel"><header className="finance-panel-heading"><div><h2>{text("Tes concours récents", "Your recent shows")}</h2><p>{text("Accède aux comptes ou au bilan d’un concours.", "Open a show’s accounts or financial summary.")}</p></div><button type="button" onClick={() => switchTab("shows")}>{text("Tous les concours", "All shows")}<ArrowRight size={16} /></button></header>{!contextError && !loadingContexts ? renderContexts(contexts.filter(row => row.show_id).slice(0, 3)) : null}</section>
    </> : null}
    {tab === "accounts" ? <section className="finance-panel"><header className="finance-panel-heading"><div><h2>{text("Comptes clients", "Customer accounts")}</h2><p>{text("Chaque compte regroupe les frais, paiements et documents d’un client pour un concours ou une activité.", "Each account brings together a customer’s charges, payments and documents for a show or activity.")}</p></div></header>{accounts ? <>{renderAccounts(accounts.items)}{accounts.total > 0 ? <div className="finance-pagination"><span>{offset + 1}–{Math.min(offset + 25, accounts.total)} {text("sur", "of")} {accounts.total}</span><div><button disabled={!offset} type="button" onClick={() => patch({ offset: String(Math.max(0, offset - 25)) })}>{text("Précédent", "Previous")}</button><button disabled={offset + 25 >= accounts.total} type="button" onClick={() => patch({ offset: String(offset + 25) })}>{text("Suivant", "Next")}</button></div></div> : null}</> : <p role="status">{text("Chargement des comptes…", "Loading accounts…")}</p>}</section> : null}
    {["shows", "outside"].includes(tab) ? <section className="finance-panel"><header className="finance-panel-heading"><div><h2>{tab === "shows" ? text("Finances par concours", "Finance by show") : text("Activités hors concours", "Non-show activities")}</h2><p>{text("Les chiffres comprennent tous les comptes de chaque concours ou activité.", "Figures include every account in each show or activity.")}</p></div></header>{!contextError && !loadingContexts ? renderContexts(contextRows.slice(offset, offset + 12)) : null}{contextRows.length > 0 ? <div className="finance-pagination"><span>{offset + 1}–{Math.min(offset + 12, contextRows.length)} {text("sur", "of")} {contextRows.length}</span><div><button disabled={!offset} type="button" onClick={() => patch({ offset: String(Math.max(0, offset - 12)) })}>{text("Précédent", "Previous")}</button><button disabled={offset + 12 >= contextRows.length} type="button" onClick={() => patch({ offset: String(offset + 12) })}>{text("Suivant", "Next")}</button></div></div> : null}</section> : null}
    {tab === "reports" ? selectedId ? report ? <ContextFinanceReport key={`${selectedId}:${revision}`} report={report} locale={locale} /> : null : <section className="finance-panel finance-report-intro"><BarChart3 size={32} /><h2>{text("Le bilan de ton concours, simplement", "Your show report, made simple")}</h2><p>{text("Choisis un concours ci-dessus pour consulter ses revenus, ses paiements et ses soldes, puis exporter le rapport.", "Choose a show above to view revenue, payments and balances, then export the report.")}</p><div className="finance-report-features"><span>{text("Revenus par catégorie", "Revenue by category")}</span><span>{text("Encaissements et soldes", "Collections and balances")}</span><span>CSV · {text("Impression", "Print")}</span></div></section> : null}
    {selectedId && report && tab === "accounts" ? <ContextSaleForm key={selectedId} org={org} context={selectedId} identity={identity} locale={locale} contacts={contacts} onSaved={refresh} /> : null}
    {selectedId && tab === "reports" && Number(report?.totals.hsp_total) > 0 ? <details className="finance-panel finance-secondary-details"><summary>{text("Suivi des sommes HSP", "HSP amount tracking")}</summary><HspRemittances context={selectedId} locale={locale} /></details> : null}
    <details className="finance-panel finance-secondary-details"><summary>{text("Anciennes factures et archives", "Historical invoices and archives")}</summary><p>{text("Les anciennes factures sont conservées en lecture seule. Les rapports ci-dessus portent sur les comptes actuels.", "Historical invoices remain available as read-only records. The reports above cover current accounts.")}</p><fieldset disabled>{legacy}</fieldset></details>
  </section>;
}
