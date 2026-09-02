import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { loadStripeConnectStatus, openStripeConnect } from "../../services/stripeConnect";
import type { StripeConnectStatus } from "../../services/stripeConnect";
import { uiText } from "../dashboard/shared";

export function StripeConnectPanel({ locale, organizationId }: { locale: Locale; organizationId: string }) {
  const [status, setStatus] = useState<StripeConnectStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setStatus(await loadStripeConnectStatus(organizationId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText(locale, "État Stripe indisponible.", "Stripe status unavailable."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void refresh(); }, [organizationId]);

  async function follow(action: "onboard" | "dashboard") {
    setBusy(true);
    setError("");
    try {
      await openStripeConnect(organizationId, action);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText(locale, "Lien Stripe indisponible.", "Stripe link unavailable."));
      setBusy(false);
    }
  }

  const ready = Boolean(status?.charges_enabled && status?.payouts_enabled);
  return (
    <section className="panel span-2 stripe-connect-panel">
      <div className="panel-header">
        <div>
          <h2>Stripe Connect · Sandbox</h2>
          <p>{uiText(locale, "Verse les paiements de factures au compte Stripe test de l’association.", "Routes invoice payments to the association's Stripe test account.")}</p>
        </div>
        <button className="secondary-button" disabled={busy} type="button" onClick={() => void refresh()}><RefreshCw size={16} />{uiText(locale, "Actualiser", "Refresh")}</button>
      </div>
      <div className={`status-banner ${ready ? "success" : "warning"}`}>
        {ready
          ? uiText(locale, "Compte test prêt à accepter les paiements et versements.", "Test account is ready for charges and payouts.")
          : status?.connected
            ? uiText(locale, "Configuration Stripe incomplète.", "Stripe setup is incomplete.")
            : uiText(locale, "Aucun compte Stripe test connecté.", "No Stripe test account connected.")}
      </div>
      {status?.requirements_due?.length ? <p className="muted">{uiText(locale, "Informations requises", "Required information")}: {status.requirements_due.join(", ")}</p> : null}
      {status?.disabled_reason ? <p className="error-message">{status.disabled_reason}</p> : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}
      <div className="button-row">
        <button disabled={busy} type="button" onClick={() => void follow("onboard")}>
          <ExternalLink size={16} />{status?.connected ? uiText(locale, "Continuer la configuration", "Continue setup") : uiText(locale, "Connecter Stripe", "Connect Stripe")}
        </button>
        {status?.details_submitted ? <button className="secondary-button" disabled={busy} type="button" onClick={() => void follow("dashboard")}><ExternalLink size={16} />{uiText(locale, "Tableau de bord Stripe", "Stripe dashboard")}</button> : null}
      </div>
    </section>
  );
}
