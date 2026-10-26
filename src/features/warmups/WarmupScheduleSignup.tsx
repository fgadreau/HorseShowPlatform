import { useState } from "react";
import { billingRpc, type Json } from "../../services/billingFolio";
import { formatCurrency } from "../../lib/display";
import { warmupError } from "./errors";

export function WarmupScheduleSignup({ session, horseId, locale, onUpdated }: {
  session: Json; horseId: string; locale: string; onUpdated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fr = locale === "fr";
  const request = session.requests.find((item: Json) => item.horse_id === horseId && item.status !== "cancelled");
  const states: Record<string, string> = fr
    ? { requested: "Demande reçue", waiting: "Liste d’attente", selected: "Place attribuée" }
    : { requested: "Request received", waiting: "Waiting list", selected: "Place assigned" };
  return <section className="entry-showbill-block">
    <div className="entry-showbill-block-header"><strong>{session.name} · Paid warm-up</strong><span>{session.schedule_start_time?.slice(0, 5)}</span></div>
    <p>{formatCurrency(Number(session.price), session.currency)} · {session.capacity} {fr ? "places" : "spots"}</p>
    <p>{fr ? "En cas de surnombre, les places sont tirées au sort. Seules les places validées sont facturées." : "Oversubscribed sessions use a lottery. Only validated spots are billed."}</p>
    {request ? <p role="status">{states[request.status]}{request.billed ? (fr ? " · Facturé" : " · Billed") : (fr ? " · Non facturé" : " · Not billed")}</p> : null}
    {!horseId ? <p>{fr ? "Choisis un cheval pour demander une place." : "Choose a horse to request a spot."}</p> : null}
    <button type="button" disabled={busy || !horseId || Boolean(request) || session.state !== "open"} onClick={async () => {
      setBusy(true); setError("");
      try { await billingRpc("paid_warmup_request", { p_warmup: session.id, p_horse: horseId, p_cancel: false }); await onUpdated(); }
      catch (e) { setError(warmupError(e)); }
      finally { setBusy(false); }
    }}>{request ? (fr ? "Demande enregistrée" : "Request saved") : session.state !== "open" ? (fr ? "Demandes fermées" : "Requests closed") : busy ? (fr ? "Enregistrement…" : "Saving…") : (fr ? "Demander une place" : "Request a spot")}</button>
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
