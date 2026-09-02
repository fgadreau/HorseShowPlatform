import { useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { CreditCard, X } from "lucide-react";
import { appEnv } from "../../lib/env";
import type { Locale } from "../../lib/i18n";
import { createStripeInvoicePayment } from "../../services/stripePayments";
import type { Invoice } from "../../types/domain";
import { uiText } from "../dashboard/shared";

const stripePromise = appEnv.stripePublishableKey ? loadStripe(appEnv.stripePublishableKey) : null;

export function InvoicePayment({ invoice, locale }: { invoice: Invoice; locale: Locale }) {
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true); setError("");
    try { setClientSecret((await createStripeInvoicePayment(invoice.id)).clientSecret); }
    catch (caught) { setError(caught instanceof Error ? caught.message : uiText(locale, "Impossible de préparer le paiement.", "Unable to prepare payment.")); }
    finally { setBusy(false); }
  }

  if (!appEnv.stripePublishableKey) return null;
  return (
    <div className="invoice-payment-box">
      {!clientSecret ? <button className="primary-button" disabled={busy} type="button" onClick={() => void start()}><CreditCard size={17} />{busy ? uiText(locale, "Préparation…", "Preparing…") : uiText(locale, "Payer le solde par carte", "Pay balance by card")}</button> : (
        <div className="wallet-setup"><button className="icon-button wallet-setup-close" type="button" onClick={() => setClientSecret("")}><X size={18} /></button><Elements stripe={stripePromise} options={{ clientSecret, locale: locale === "fr" ? "fr-CA" : "en" }}><ConfirmInvoicePayment locale={locale} /></Elements></div>
      )}
      {error ? <p className="notice error">{error}</p> : null}
    </div>
  );
}

function ConfirmInvoicePayment({ locale }: { locale: Locale }) {
  const stripe = useStripe(); const elements = useElements();
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function confirm() {
    if (!stripe || !elements) return;
    setBusy(true); setError("");
    const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: window.location.href }, redirect: "if_required" });
    if (result.error) setError(result.error.message ?? uiText(locale, "Paiement refusé.", "Payment declined."));
    else window.location.reload();
    setBusy(false);
  }
  return <div className="stack"><PaymentElement /><button className="primary-button" disabled={!stripe || busy} type="button" onClick={() => void confirm()}>{busy ? uiText(locale, "Traitement…", "Processing…") : uiText(locale, "Confirmer le paiement", "Confirm payment")}</button>{error ? <p className="notice error">{error}</p> : null}</div>;
}
