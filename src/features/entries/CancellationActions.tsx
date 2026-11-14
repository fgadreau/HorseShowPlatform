import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import "./cancellation.css";
import { ModalDialog } from "../../components/ui";
import type { Block, ClassRecord, Entry } from "../../types/domain";
import { cancellationError, cancellationRpc, loadCancellations, type CancellationQuote, type CancellationRequest } from "./cancellationService";

const CancellationContext = createContext<{ requests: CancellationRequest[]; refresh: () => Promise<void> } | null>(null);
export function CancellationProvider({ showId, children }: { showId?: string; children: ReactNode }) {
  const [requests, setRequests] = useState<CancellationRequest[]>([]);
  const [failed, setFailed] = useState(false);
  async function refresh() { if (showId) setRequests(await loadCancellations(showId)); }
  useEffect(() => {
    let live = true; setFailed(false);
    if (showId) loadCancellations(showId).then(data => { if (live) setRequests(data); }).catch(() => { if (live) setFailed(true); });
    else setRequests([]);
    return () => { live = false; };
  }, [showId]);
  return <CancellationContext.Provider value={{ requests, refresh }}>{failed && <p role="alert">Demandes d’annulation indisponibles / Cancellation requests unavailable</p>}{children}</CancellationContext.Provider>;
}

export function CancellationActions({ entry, entries, block, classes, profileId, staff = false, locale, onRefresh }: {
  entry: Entry; entries: Entry[]; block?: Block; classes: ClassRecord[]; profileId: string; staff?: boolean; locale: string; onRefresh: () => void;
}) {
  const fr = locale === "fr";
  const context = useContext(CancellationContext);
  const requests = context?.requests ?? [];
  const [requesting, setRequesting] = useState(false);
  const [scope, setScope] = useState("class");
  const [reason, setReason] = useState("");
  const [review, setReview] = useState<CancellationRequest | null>(null);
  const [quote, setQuote] = useState<CancellationQuote | null>(null);
  const [creditMode, setCreditMode] = useState("full");
  const [credit, setCredit] = useState("");
  const [creditTax, setCreditTax] = useState("");
  const [fee, setFee] = useState("0");
  const [feeTax, setFeeTax] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ credit: { total: number }; fee: { total: number } } | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const decisionInput = JSON.stringify({ version: quote?.version, signature: quote?.signature, credit_mode: creditMode, credit_amount: creditMode === "custom" ? Number(credit) : null, credit_tax_mode: creditMode === "custom" ? creditTax : null, fee_amount: Number(fee), fee_tax_mode: Number(fee) === 0 ? "exclusive" : feeTax, note });
  const previewReady = Boolean(review && quote && fee !== "" && Number(fee) >= 0 && (Number(fee) === 0 || feeTax) && (creditMode !== "custom" || (credit !== "" && Number(credit) >= 0 && creditTax)));
  useEffect(() => {
    let live = true; setPreview(null);
    if (!previewReady || !review) return;
    const timer = setTimeout(() => {
      cancellationRpc<{ credit: { total: number }; fee: { total: number } }>("preview_entry_cancellation", { p_request: review.id, p_decision: JSON.parse(decisionInput) }).then(value => { if (live) { setPreview(value); setError(""); } }).catch(error => { if (live) setError(cancellationError(error, fr)); });
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [decisionInput, previewReady, review?.id, fr]);
  const relevant = requests.filter(r => r.entry_ids.includes(entry.id));
  const pending = relevant.find(r => r.status === "pending");
  const last = relevant[relevant.length - 1];
  const drawn = Boolean(block?.draw_prepared_at);
  async function run(action: () => Promise<unknown>) {
    setBusy(true); setError("");
    try { await action(); await context?.refresh(); onRefresh(); }
    catch (e) { setError(cancellationError(e, fr)); try { await context?.refresh(); onRefresh(); } catch { /* Preserve the original failure. */ } }
    finally { setBusy(false); }
  }
  async function openReview(r: CancellationRequest) {
    setReview(r); setQuote(null); setError(""); setCreditMode("full"); setCredit(""); setFee("0"); setFeeTax(""); setCreditTax(""); setNote("");
    setBusy(true);
    try { setQuote(await cancellationRpc<CancellationQuote>("entry_cancellation_quote", { p_request: r.id })); }
    catch (error) { setError(cancellationError(error, fr)); }
    finally { setBusy(false); }
  }
  const text = (a: string, b: string) => fr ? a : b;
  const money = (amount: number) => new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: quote?.currency ?? "CAD" }).format(amount);
  const taxChoice = (value: string, change: (v: string) => void, label: string) => <label>{label}<select aria-label={label} required value={value} onChange={e => change(e.target.value)}><option value="">{text("Choisir le traitement des taxes", "Choose tax treatment")}</option><option value="exclusive">{text("Avant taxes", "Before taxes")}</option><option value="inclusive">{text("Taxes incluses", "Tax included")}</option></select></label>;
  return <div className="entry-cancellation-actions">
    {entry.status === "draft" && <button type="button" className="text-button" disabled={busy} onClick={() => run(() => cancellationRpc("confirm_existing_entry", { p_entry: entry.id }))}>{text("Confirmer cette inscription", "Confirm this entry")}</button>}
    {pending ? <>
      <span className="badge pending_checkout">{text("Annulation en attente · draw bloqué pour ce bloc", "Cancellation pending · this block’s draw is blocked")}</span>
      {pending.requested_by === profileId && <button type="button" className="text-button" disabled={busy} onClick={() => run(() => cancellationRpc("withdraw_entry_cancellation", { p_request: pending.id }))}>{text("Retirer ma demande", "Withdraw my request")}</button>}
      {staff && <button type="button" className="text-button" disabled={busy} onClick={() => openReview(pending)}>{text("Traiter la demande", "Review request")}</button>}
    </> : ["active", "pending_checkout"].includes(entry.status) ? drawn ? <span className="muted-line">{text("Draw généré : procédure de scratch requise.", "Draw generated: use the scratch procedure.")}</span> : <button className="text-button" type="button" onClick={() => { requestId.current = crypto.randomUUID(); setScope("class"); setReason(""); setRequesting(true); setError(""); }}>{text("Demander l’annulation", "Request cancellation")}</button> : null}
    {!pending && last && <span className="muted-line">{text("Dernière demande : ", "Last request: ")}{({ approved: text("approuvée", "approved"), rejected: text("refusée — inscription maintenue", "rejected — entry retained"), withdrawn: text("retirée", "withdrawn"), pending: "" })[last.status]}{last.decision_note ? ` · ${last.decision_note}` : ""}</span>}
    {error && <p role="alert">{error}</p>}
    {requesting && <ModalDialog className="entry-cancellation-modal" title={text("Demander une annulation", "Request cancellation")} onClose={() => setRequesting(false)}><form onSubmit={e => { e.preventDefault(); void run(async () => { await cancellationRpc("request_entry_cancellation", { p_request: requestId.current, p_entry: entry.id, p_scope: scope, p_reason: reason }); setRequesting(false); }); }}>
      <p>{text("L’inscription reste en vigueur jusqu’à la décision de la secrétaire. Le draw de ce bloc sera bloqué durant le traitement.", "The entry remains in effect until the secretary’s decision. This block’s draw will be blocked while the request is pending.")}</p>
      <label>{text("Portée", "Scope")}<select aria-label={text("Portée", "Scope")} value={scope} onChange={e => setScope(e.target.value)}><option value="class">{text("Cette classe seulement", "This class only")}</option><option value="block">{text("Toutes mes classes de ce bloc pour ce cheval et ce cavalier", "All my classes in this block for this horse and rider")}</option></select></label>
      <label>{text("Motif (facultatif)", "Reason (optional)")}<textarea maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{text("Envoyer la demande", "Submit request")}</button>
    </form></ModalDialog>}
    {review && <ModalDialog className="entry-cancellation-modal" title={text("Traiter l’annulation", "Review cancellation")} onClose={() => setReview(null)}><form onSubmit={e => { e.preventDefault(); void run(async () => { await cancellationRpc("decide_entry_cancellation", { p_request: review.id, p_approve: true, p_decision: JSON.parse(decisionInput) }); setReview(null); }); }}>
      <p>{review.scope === "block" ? text("Annulation du bloc complet", "Full block cancellation") : text("Annulation d’une classe", "Single class cancellation")}</p>
      <ul>{review.entry_ids.map(id => <li key={id}>{classes.find(c => c.id === entries.find(e => e.id === id)?.class_id)?.name ?? text("Classe non accessible", "Class unavailable")}</li>)}</ul>
      {review.reason && <p>{review.reason}</p>}
      {quote && <><p>{text("Montant libéré, juges et taxes inclus : ", "Released charges including judges and tax: ")}{money(quote.total)}</p>
      <label>{text("Crédit au compte", "Account credit")}<select aria-label={text("Crédit au compte", "Account credit")} value={creditMode} onChange={e => setCreditMode(e.target.value)}><option value="full">{text("Total", "Full")}</option><option value="none">{text("Aucun", "None")}</option><option value="custom">{text("Montant personnalisé", "Custom amount")}</option></select></label>
      {creditMode === "custom" && <><label>{text("Montant du crédit", "Credit amount")}<input required min="0" step="0.01" type="number" value={credit} onChange={e => setCredit(e.target.value)} /></label>{taxChoice(creditTax, setCreditTax, text("Taxes du crédit", "Credit taxes"))}</>}
      <label>{text("Frais d’annulation (0 = aucuns frais)", "Cancellation fee (0 = no fee)")}<input required min="0" step="0.01" type="number" value={fee} onChange={e => setFee(e.target.value)} /></label>{Number(fee) > 0 && taxChoice(feeTax, setFeeTax, text("Taxes des frais", "Fee taxes"))}
      <p>{text("Le crédit et les frais seront séparés dans le compte ouvert de ce concours. Aucun remboursement Stripe n’est déclenché.", "Credit and fees are recorded separately on this show’s open account. No Stripe refund is triggered.")}</p></>}
      {preview && quote && <dl className="cancellation-preview"><dt>{text("Crédit au compte, taxes incluses", "Account credit, tax included")}</dt><dd>{money(preview.credit.total)}</dd><dt>{text("Frais d’annulation, taxes incluses", "Cancellation fee, tax included")}</dt><dd>{money(preview.fee.total)}</dd><dt>{text("Réduction nette du compte", "Net account reduction")}</dt><dd>{money(Number(preview.credit.total) - Number(preview.fee.total))}</dd></dl>}{error && <p role="alert">{error}</p>}<label>{text("Note de décision", "Decision note")}<textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label>
      <div className="row-actions"><button disabled={busy} type="button" className="secondary-button" onClick={() => run(async () => { await cancellationRpc("decide_entry_cancellation", { p_request: review.id, p_approve: false, p_decision: { note } }); setReview(null); })}>{text("Refuser · maintenir l’inscription", "Reject · keep entry")}</button><button className="primary-button" disabled={busy || !quote || !preview}>{text("Approuver et appliquer", "Approve and apply")}</button></div>
    </form></ModalDialog>}
  </div>;
}
