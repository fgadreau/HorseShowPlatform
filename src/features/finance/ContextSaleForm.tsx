import { useEffect, useState } from "react";
import { SearchSelect } from "../../components/ui";
import { billingRpc, pendingCommands, type Json } from "../../services/billingFolio";
import { billingError } from "./presentation";
import { useSaleConfirmation } from "./useSaleConfirmation";

export function ContextSaleForm({ org, context, identity, locale, contacts, onSaved }: { org: string; context: string; identity: string; locale: string; contacts: Json[]; onSaved: () => void }) {
  const fr = locale === "fr", confirmation = useSaleConfirmation(identity, locale);
  const key = `hsp-context-sale:${identity}:${context}`;
  const [draft, setDraft] = useState(() => { try { return JSON.parse(sessionStorage.getItem(key) ?? "null") ?? { payer: "", product: "", source: crypto.randomUUID() }; } catch { return { payer: "", product: "", source: crypto.randomUUID() }; } });
  const [catalog, setCatalog] = useState<Json>(), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { sessionStorage.setItem(key, JSON.stringify(draft)); }, [key, draft]);
  useEffect(() => {
    let live = true;
    void billingRpc("billing_ui_catalog", { p_context: context }).then(data => { if (live) setCatalog(data); }).catch(error => { if (live) setError(billingError(error.message, locale)); });
    return () => { live = false; };
  }, [context, locale]);
  if (!catalog?.enabled && !error) return null;
  return <details className="finance-panel finance-secondary-details">{confirmation.dialog}<summary>{fr ? "Ajouter des frais au compte d’un client" : "Add charges to a customer account"}</summary><p>{fr ? "Choisis un client et un produit. Les frais seront ajoutés à son compte de ce concours ou de cette activité." : "Choose a customer and product. Charges will be added to their account for this show or activity."}</p>
    {error ? <p role="alert">{error}</p> : null}
    {catalog?.enabled ? <form className="finance-sale-form" onSubmit={async event => {
      event.preventDefault(); if (busy || !draft.payer || !draft.product || pendingCommands(identity).length) return;
      setBusy(true); setError("");
      try {
        const customer = await billingRpc("billing_get_customer_account", { p_org: org, p_contact: draft.payer, p_context: context });
        const result = await confirmation.sale({ context_id: context, payer_customer_account_id: customer, product_id: draft.product, quantity: 1, source_id: draft.source }, Boolean(catalog.hsp_quote_required));
        if (result) { setDraft((current: Json) => ({ ...current, product: "", source: crypto.randomUUID() })); onSaved(); }
      } catch (error) { setError(billingError((error as Error).message, locale)); }
      finally { setBusy(false); }
    }}><label>{fr ? "Client" : "Customer"}<SearchSelect items={contacts.map(contact => ({ id: contact.id, label: [contact.first_name, contact.middle_name, contact.last_name, contact.company_name].filter(Boolean).join(" ") }))} value={draft.payer} onChange={payer => setDraft((current: Json) => ({ ...current, payer }))} placeholder={fr ? "Rechercher un client" : "Search customers"} /></label><label>{fr ? "Produit ou service" : "Product or service"}<select required value={draft.product} onChange={event => setDraft((current: Json) => ({ ...current, product: event.target.value }))}><option value="">{fr ? "Choisir un produit" : "Choose a product"}</option>{catalog.products.filter((product: Json) => !product.hsp_fee).map((product: Json) => <option key={product.id} value={product.id}>{product.name} · {new Intl.NumberFormat(fr ? "fr-CA" : "en-CA", { style: "currency", currency: catalog.currency }).format(Number(product.price))}</option>)}</select></label><button type="submit" className="finance-primary" disabled={busy || !draft.payer || !draft.product || pendingCommands(identity).length > 0}>{fr ? "Ajouter au compte" : "Add to account"}</button></form> : null}
  </details>;
}
