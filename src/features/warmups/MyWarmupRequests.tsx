import { useEffect, useState } from "react";
import { billingRpc, type Json } from "../../services/billingFolio";
import { formatCurrency } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { Horse } from "../../types/domain";
import { uiText } from "../dashboard/shared";
import { warmupError } from "./errors";

export function MyWarmupRequests({ organizationId, horses, locale = "fr" }: { organizationId: string; horses: Horse[]; locale?: Locale }) {
  const [sessions, setSessions] = useState<Json[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void billingRpc("paid_warmup_signup_options", { p_org: organizationId })
      .then(data => { if (live) setSessions(data); })
      .catch(error => { if (live) setError(warmupError(error)); });
    return () => { live = false; };
  }, [organizationId]);

  async function cancel(session: Json, request: Json) {
    const message = request.billed
      ? uiText(locale, "Annuler la place ? Aucun remboursement automatique ; contacte le secrétariat.", "Cancel this place? There is no automatic refund; contact the office.")
      : uiText(locale, "Annuler cette demande ?", "Cancel this request?");
    if (!window.confirm(message)) return;
    setBusy(true); setError("");
    try {
      await billingRpc("paid_warmup_request", { p_warmup: session.id, p_horse: request.horse_id, p_cancel: true });
      setSessions(await billingRpc("paid_warmup_signup_options", { p_org: organizationId }));
    } catch (error) { setError(warmupError(error)); }
    finally { setBusy(false); }
  }

  const states: Record<string, string> = {
    requested: uiText(locale, "Demande reçue, non facturée", "Requested, not billed"),
    waiting: uiText(locale, "Liste d’attente, non facturée", "Waiting list, not billed"),
    selected: uiText(locale, "Place attribuée", "Place assigned"),
    cancelled: uiText(locale, "Demande annulée", "Request cancelled"),
  };
  const requestedSessions = sessions.filter(session => session.requests.length);
  return <section className="panel span-2 stack">
    <div className="panel-header"><div>
      <h2>{uiText(locale, "Mes demandes de paid warm-up", "My paid warm-up requests")}</h2>
      <p>{uiText(locale, "Pour demander une place, ouvre Inscription et choisis la séance dans l’horaire de la journée. Retrouve ici le suivi de tes demandes.", "To request a place, open Entry and choose the session in the daily schedule. Track your requests here.")}</p>
    </div></div>
    {error ? <p role="alert">{error}</p> : null}
    {!requestedSessions.length ? <p className="muted-line">{uiText(locale, "Aucune demande de paid warm-up pour le moment.", "No paid warm-up requests yet.")}</p> : null}
    {requestedSessions.map(session => <article className="form-section stack" key={session.id}>
      <div className="panel-header"><div><h3>{session.name}</h3><p>{session.show_name} · {formatCurrency(Number(session.price), session.currency)} {uiText(locale, "avant taxes", "before tax")}</p></div></div>
      {session.requests.map((request: Json) => <div className="panel-header" key={request.id}>
        <div><strong>{horses.find(horse => horse.id === request.horse_id)?.name ?? uiText(locale, "Cheval", "Horse")}</strong><p>{states[request.status] ?? request.status}{request.billed ? uiText(locale, " · Validé / facturé", " · Confirmed / billed") : ""}</p></div>
        {request.status !== "cancelled" ? <button className="ghost-button" type="button" disabled={busy} onClick={() => void cancel(session, request)}>{uiText(locale, "Annuler la demande", "Cancel request")}</button> : null}
      </div>)}
    </article>)}
  </section>;
}
