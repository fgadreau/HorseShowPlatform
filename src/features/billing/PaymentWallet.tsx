import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { CreditCard, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { appEnv } from "../../lib/env";
import type { Locale } from "../../lib/i18n";
import { createStripeWalletSetup, detachStripePaymentMethod, loadStripeWallet } from "../../services/stripeWallet";
import type { StripePaymentMethodSummary } from "../../services/stripeWallet";
import type { Contact } from "../../types/domain";
import { uiText } from "../dashboard/shared";

const stripePromise = appEnv.stripePublishableKey ? loadStripe(appEnv.stripePublishableKey) : null;

export function PaymentWallet({ contacts, locale }: { contacts: Contact[]; locale: Locale }) {
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [methods, setMethods] = useState<StripePaymentMethodSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState<{ clientSecret: string; customerSessionClientSecret?: string } | null>(null);
  const activeContact = contacts.find((contact) => contact.id === contactId) ?? contacts[0];

  async function refresh(targetContactId = contactId) {
    if (!targetContactId || !appEnv.stripePublishableKey) return;
    setBusy(true);
    setError("");
    try {
      const response = await loadStripeWallet(targetContactId);
      setMethods(response.paymentMethods ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText(locale, "Impossible de charger le portefeuille.", "Unable to load the wallet."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setSetup(null);
    setMethods([]);
    void refresh(contactId);
    // The selected contact is the only trigger for reloading its isolated wallet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  async function beginSetup() {
    if (!contactId) return;
    setBusy(true);
    setError("");
    try {
      const response = await createStripeWalletSetup(contactId);
      if (!response.setupClientSecret) throw new Error(uiText(locale, "Stripe n’a pas retourné de session sécurisée.", "Stripe did not return a secure session."));
      setMethods(response.paymentMethods ?? []);
      setSetup({ clientSecret: response.setupClientSecret, customerSessionClientSecret: response.customerSessionClientSecret });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText(locale, "Impossible d’ouvrir Stripe.", "Unable to open Stripe."));
    } finally {
      setBusy(false);
    }
  }

  async function removeMethod(method: StripePaymentMethodSummary) {
    if (!window.confirm(uiText(locale, `Retirer la carte •••• ${method.last4}?`, `Remove card •••• ${method.last4}?`))) return;
    setBusy(true);
    setError("");
    try {
      const response = await detachStripePaymentMethod(contactId, method.id);
      setMethods(response.paymentMethods ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : uiText(locale, "Impossible de retirer cette carte.", "Unable to remove this card."));
    } finally {
      setBusy(false);
    }
  }

  if (!appEnv.stripePublishableKey) {
    return (
      <section className="panel span-2 payment-wallet-panel">
        <WalletHeader locale={locale} />
        <p className="notice warning">{uiText(locale, "Le portefeuille sera disponible dès que la clé publique de la Sandbox Stripe sera configurée.", "The wallet will be available once the Stripe Sandbox publishable key is configured.")}</p>
      </section>
    );
  }

  return (
    <section className="panel span-2 payment-wallet-panel">
      <WalletHeader locale={locale} />
      {contacts.length > 1 ? (
        <label className="wallet-contact-select">
          {uiText(locale, "Profil de paiement", "Payment profile")}
          <select value={contactId} onChange={(event) => setContactId(event.target.value)}>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{`${contact.first_name} ${contact.last_name}`}</option>)}
          </select>
        </label>
      ) : null}
      <div className="wallet-method-list" aria-busy={busy}>
        {methods.map((method) => (
          <article className="wallet-method-card" key={method.id}>
            <CreditCard size={24} />
            <div>
              <strong>{cardBrand(method.brand)} •••• {method.last4}</strong>
              <span>{uiText(locale, "Expire", "Expires")} {String(method.expMonth).padStart(2, "0")}/{method.expYear}</span>
            </div>
            <button className="icon-button" disabled={busy} type="button" aria-label={uiText(locale, "Retirer la carte", "Remove card")} onClick={() => void removeMethod(method)}>
              <Trash2 size={17} />
            </button>
          </article>
        ))}
        {!busy && !methods.length ? <p className="muted-line">{uiText(locale, `Aucune carte enregistrée pour ${activeContact?.first_name ?? "ce profil"}.`, `No saved card for ${activeContact?.first_name ?? "this profile"}.`)}</p> : null}
      </div>
      {error ? <p className="notice error">{error}</p> : null}
      {setup ? (
        <div className="wallet-setup">
          <button className="icon-button wallet-setup-close" type="button" aria-label={uiText(locale, "Fermer", "Close")} onClick={() => setSetup(null)}><X size={18} /></button>
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: setup.clientSecret, customerSessionClientSecret: setup.customerSessionClientSecret, locale: locale === "fr" ? "fr-CA" : "en" }}
          >
            <StripeSetupForm contactId={contactId} locale={locale} onSaved={async () => { setSetup(null); await refresh(); }} />
          </Elements>
        </div>
      ) : (
        <button className="primary-button" disabled={busy || !contactId} type="button" onClick={() => void beginSetup()}>
          <Plus size={17} />{uiText(locale, "Ajouter une carte", "Add a card")}
        </button>
      )}
      <p className="wallet-security-note"><ShieldCheck size={16} />{uiText(locale, "Les données complètes de carte sont saisies et conservées par Stripe. HorseShowPlatform ne reçoit que la marque, l’expiration et les quatre derniers chiffres.", "Full card details are collected and stored by Stripe. HorseShowPlatform only receives the brand, expiry and last four digits.")}</p>
    </section>
  );
}

function StripeSetupForm({ contactId, locale, onSaved }: { contactId: string; locale: Locale; onSaved: () => Promise<void> }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = useMemo(() => Boolean(stripe && elements && contactId && !busy), [busy, contactId, elements, stripe]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError("");
    const result = await stripe.confirmSetup({ elements, redirect: "if_required" });
    if (result.error) {
      setError(result.error.message ?? uiText(locale, "La carte n’a pas pu être enregistrée.", "The card could not be saved."));
      setBusy(false);
      return;
    }
    await onSaved();
    setBusy(false);
  }

  return (
    <form className="stack" onSubmit={submit}>
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? <p className="notice error">{error}</p> : null}
      <button className="primary-button" disabled={!canSubmit} type="submit">{busy ? uiText(locale, "Enregistrement…", "Saving…") : uiText(locale, "Enregistrer cette carte", "Save this card")}</button>
    </form>
  );
}

function WalletHeader({ locale }: { locale: Locale }) {
  return <div className="panel-header"><div><p className="eyebrow">Stripe</p><h2>{uiText(locale, "Modes de paiement", "Payment methods")}</h2><p>{uiText(locale, "Gère les cartes autorisées pour tes inscriptions, préautorisations et soldes futurs.", "Manage cards authorized for entries, preauthorizations and future balances.")}</p></div></div>;
}

function cardBrand(brand: string) {
  return brand === "amex" ? "American Express" : brand.charAt(0).toUpperCase() + brand.slice(1);
}
