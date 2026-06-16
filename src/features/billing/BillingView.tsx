import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ChevronDown, ChevronRight, Download, FileText, Plus, Search, X } from "lucide-react";
import { EmptyState, Metric, ViewIntro } from "../../components/ui";
import { contactLabel, findById, formatCurrency, formatDate, numericValue } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import { cancelManualSale, createManualSale } from "../../services/supabaseServices";
import type { AppContext } from "../../services/supabaseServices";
import type { Contact, Invoice, InvoiceLineItem, ManualSale, Organization, OrganizationProduct, Show } from "../../types/domain";
import { uiText, formatInvoiceNumber } from "../dashboard/shared";

function CollapsiblePanel({
  children,
  className = "panel span-2",
  collapseLabel,
  defaultOpen = false,
  description,
  expandLabel,
  title,
}: {
  children: ReactNode;
  className?: string;
  collapseLabel: string;
  defaultOpen?: boolean;
  description?: ReactNode;
  expandLabel: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={`${className} collapsible-panel ${isOpen ? "is-open" : "is-collapsed"}`}>
      <div className="panel-header collapsible-panel-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <button
          aria-expanded={isOpen}
          aria-label={`${isOpen ? collapseLabel : expandLabel} ${title}`}
          className="icon-button collapsible-panel-toggle"
          type="button"
          onClick={() => setIsOpen((current) => !current)}
        >
          {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </button>
      </div>
      {isOpen ? <div className="collapsible-panel-body">{children}</div> : null}
    </section>
  );
}

function BillingView({
  locale,
  contacts,
  currency,
  entries,
  horseContacts,
  horses,
  invoices,
  lineItems,
  manualSales = [],
  organization,
  products = [],
  profileId = "",
  shows,
  unpaidBalance,
  onCancelManualSale,
  onCreateManualSale,
}: {
  locale: Locale;
  contacts: AppContext["contacts"];
  currency: string;
  entries: AppContext["entries"];
  horseContacts: AppContext["horseContacts"];
  horses: AppContext["horses"];
  invoices: AppContext["invoices"];
  lineItems: AppContext["invoiceLineItems"];
  manualSales?: ManualSale[];
  organization: Organization | null;
  products?: OrganizationProduct[];
  profileId?: string;
  shows: AppContext["shows"];
  unpaidBalance: number;
  onCancelManualSale?: (id: Parameters<typeof cancelManualSale>[0]) => Promise<void>;
  onCreateManualSale?: (input: Parameters<typeof createManualSale>[0]) => Promise<ManualSale>;
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [saleBusyId, setSaleBusyId] = useState("");
  const [saleProductId, setSaleProductId] = useState("");
  const [salePayerContactId, setSalePayerContactId] = useState("");
  const [saleShowId, setSaleShowId] = useState("");
  const [saleDescription, setSaleDescription] = useState("");
  const [saleQuantity, setSaleQuantity] = useState("1");
  const [saleUnitPrice, setSaleUnitPrice] = useState("");
  const [saleTaxApplicable, setSaleTaxApplicable] = useState(true);
  const normalizedInvoiceSearch = normalizeSearchText(invoiceSearch);
  const activeProducts = useMemo(() => products.filter((product) => product.is_active), [products]);
  const selectedSaleProduct = findById(activeProducts, saleProductId) ?? activeProducts[0] ?? null;
  const selectedSaleProductId = selectedSaleProduct?.id ?? "";
  const activeManualSales = manualSales.filter((sale) => sale.status !== "cancelled");
  const canCreateManualSale = Boolean(onCreateManualSale && organization && profileId && salePayerContactId && selectedSaleProduct);
  const filteredInvoices = useMemo(
    () =>
      normalizedInvoiceSearch
        ? invoices.filter((invoice) =>
            invoiceMatchesSearch({
              contacts,
              entries,
              horseContacts,
              horses,
              invoice,
              lineItems,
              normalizedSearch: normalizedInvoiceSearch,
              shows,
            }),
          )
        : invoices,
    [contacts, entries, horseContacts, horses, invoices, lineItems, normalizedInvoiceSearch, shows],
  );
  const selectedInvoice = findById(invoices, selectedInvoiceId) ?? null;
  const selectedInvoiceLineItems = selectedInvoice ? lineItems.filter((item) => item.invoice_id === selectedInvoice.id) : [];
  const selectedInvoiceShow = selectedInvoice ? findById(shows, selectedInvoice.show_id) : undefined;
  const selectedInvoicePayer = selectedInvoice ? findById(contacts, selectedInvoice.payer_contact_id) : undefined;

  useEffect(() => {
    if (saleProductId || !activeProducts.length) {
      return;
    }

    const firstProduct = activeProducts[0];
    setSaleProductId(firstProduct.id);
    setSaleDescription(firstProduct.name);
    setSaleUnitPrice(String(firstProduct.default_price ?? 0));
    setSaleTaxApplicable(firstProduct.tax_applicable);
  }, [activeProducts, saleProductId]);

  function handleSaleProductChange(productId: string) {
    const product = findById(activeProducts, productId);
    setSaleProductId(productId);

    if (!product) {
      return;
    }

    setSaleDescription(product.name);
    setSaleUnitPrice(String(product.default_price ?? 0));
    setSaleTaxApplicable(product.tax_applicable);
  }

  async function handleManualSaleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onCreateManualSale || !organization || !profileId || !selectedSaleProduct || !salePayerContactId) {
      return;
    }

    setSaleBusyId("new");

    try {
      await onCreateManualSale({
        organization_id: organization.id,
        product_id: selectedSaleProduct.id,
        show_id: saleShowId || null,
        payer_contact_id: salePayerContactId,
        sold_by_user_id: profileId,
        status: "active",
        description: saleDescription.trim() || selectedSaleProduct.name,
        quantity: Math.max(0.01, numericValue(saleQuantity) ?? 1),
        unit_price: numericValue(saleUnitPrice) ?? selectedSaleProduct.default_price,
        tax_applicable: saleTaxApplicable,
        source_payload: {
          productCategory: selectedSaleProduct.category,
          productCode: selectedSaleProduct.code,
        },
      });

      setSaleDescription("");
      setSaleQuantity("1");
      setSaleUnitPrice("");
      setSaleShowId("");
    } finally {
      setSaleBusyId("");
    }
  }

  async function handleCancelManualSale(sale: ManualSale) {
    if (!onCancelManualSale) {
      return;
    }

    setSaleBusyId(sale.id);

    try {
      await onCancelManualSale(sale.id);
    } finally {
      setSaleBusyId("");
    }
  }

  return (
    <div className="content-grid">
      <ViewIntro
        eyebrow={uiText(locale, "Facturation", "Billing")}
        title={uiText(locale, "Factures", "Invoices")}
        description={uiText(locale, "Suis les factures, soldes ouverts et lignes créées par les inscriptions ou réservations.", "Track invoices, open balances and lines created by entries or reservations.")}
        stats={[
          { label: uiText(locale, "Factures", "Invoices"), value: String(invoices.length) },
          { label: uiText(locale, "Solde", "Balance"), value: formatCurrency(unpaidBalance, currency) },
        ]}
      />

      <section className="metric-grid span-2">
        <Metric label={uiText(locale, "Factures", "Invoices")} value={String(invoices.length)} />
        <Metric label={uiText(locale, "Solde ouvert", "Open balance")} value={formatCurrency(unpaidBalance, currency)} />
        <Metric label={uiText(locale, "Payées", "Paid")} value={String(invoices.filter((invoice) => invoice.status === "paid").length)} />
      </section>

      {onCreateManualSale ? (
        <CollapsiblePanel
          collapseLabel={uiText(locale, "Replier", "Collapse")}
          expandLabel={uiText(locale, "Ouvrir", "Open")}
          title={uiText(locale, "Nouvelle vente", "New sale")}
          description={uiText(locale, "Vends un produit de l'association et crée automatiquement une facture draft.", "Sell an association product and automatically create a draft invoice.")}
        >
          <form className="stack" onSubmit={handleManualSaleSubmit}>
            <div className="form-grid">
              <label>
                {uiText(locale, "Payeur", "Payer")}
                <select disabled={!organization || saleBusyId === "new"} required value={salePayerContactId} onChange={(event) => setSalePayerContactId(event.target.value)}>
                  <option value="">{uiText(locale, "Choisir un contact", "Choose a contact")}</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contactLabel(contact)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {uiText(locale, "Produit", "Product")}
                <select disabled={!organization || saleBusyId === "new" || !activeProducts.length} required value={selectedSaleProductId} onChange={(event) => handleSaleProductChange(event.target.value)}>
                  {!activeProducts.length ? <option value="">{uiText(locale, "Aucun produit actif", "No active product")}</option> : null}
                  {activeProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {`${product.name} · ${formatCurrency(product.default_price, currency)}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {uiText(locale, "Contexte", "Context")}
                <select disabled={!organization || saleBusyId === "new"} value={saleShowId} onChange={(event) => setSaleShowId(event.target.value)}>
                  <option value="">{uiText(locale, "Association / hors concours", "Association / outside show")}</option>
                  {shows.map((show) => (
                    <option key={show.id} value={show.id}>
                      {show.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                {uiText(locale, "Description sur facture", "Invoice description")}
                <input disabled={!organization || saleBusyId === "new"} value={saleDescription} placeholder={selectedSaleProduct?.name ?? ""} onChange={(event) => setSaleDescription(event.target.value)} />
              </label>
              <label>
                {uiText(locale, "Quantité", "Quantity")}
                <input disabled={!organization || saleBusyId === "new"} min="0.01" required step="0.01" type="number" value={saleQuantity} onChange={(event) => setSaleQuantity(event.target.value)} />
              </label>
              <label>
                {uiText(locale, "Prix unitaire", "Unit price")}
                <input disabled={!organization || saleBusyId === "new"} min="0" step="0.01" type="number" value={saleUnitPrice} placeholder={selectedSaleProduct ? String(selectedSaleProduct.default_price) : ""} onChange={(event) => setSaleUnitPrice(event.target.value)} />
              </label>
            </div>
            <label className="requirement-row">
              <input checked={saleTaxApplicable} disabled={!organization || saleBusyId === "new"} type="checkbox" onChange={(event) => setSaleTaxApplicable(event.target.checked)} />
              <span>
                <strong>{uiText(locale, "Taxable", "Taxable")}</strong>
                {uiText(locale, "Appliquer les taxes de l'association ou du show lié.", "Apply the association or linked show taxes.")}
              </span>
            </label>
            <button className="primary-button" disabled={!canCreateManualSale || saleBusyId === "new"} type="submit">
              <Plus size={18} />
              {saleBusyId === "new" ? uiText(locale, "Création...", "Creating...") : uiText(locale, "Ajouter à une facture draft", "Add to draft invoice")}
            </button>
          </form>
          {activeManualSales.length ? (
            <div className="requirement-list">
              {activeManualSales.slice(0, 8).map((sale) => {
                const saleProduct = findById(products, sale.product_id);
                const salePayer = findById(contacts, sale.payer_contact_id);
                const saleShow = findById(shows, sale.show_id);
                return (
                  <div className="membership-type-row" key={sale.id}>
                    <span className="membership-type-main">
                      <strong>{sale.description}</strong>
                      {`${contactLabel(salePayer)} · ${saleShow ? saleShow.name : uiText(locale, "Hors concours", "Outside show")} · ${sale.quantity} x ${formatCurrency(sale.unit_price, currency)}`}
                    </span>
                    <div className="membership-type-actions">
                      <small>{saleProduct ? productCategoryLabel(saleProduct.category, locale) : uiText(locale, "Vente manuelle", "Manual sale")}</small>
                      {onCancelManualSale ? (
                        <button className="secondary-button" disabled={Boolean(saleBusyId)} type="button" onClick={() => void handleCancelManualSale(sale)}>
                          {saleBusyId === sale.id ? uiText(locale, "Annulation...", "Cancelling...") : uiText(locale, "Annuler", "Cancel")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </CollapsiblePanel>
      ) : null}

      {selectedInvoice ? (
        <InvoiceDetailPanel
          locale={locale}
          currency={currency}
          invoice={selectedInvoice}
          lineItems={selectedInvoiceLineItems}
          organization={organization}
          payerContact={selectedInvoicePayer}
          show={selectedInvoiceShow}
          onClose={() => setSelectedInvoiceId("")}
        />
      ) : null}

      <section className="panel span-2">
        <div className="panel-header">
          <div>
            <h2>{uiText(locale, "Factures récentes", "Recent invoices")}</h2>
            <p>
              {normalizedInvoiceSearch
                ? uiText(locale, `${filteredInvoices.length} résultat${filteredInvoices.length === 1 ? "" : "s"} sur ${invoices.length} facture${invoices.length === 1 ? "" : "s"}.`, `${filteredInvoices.length} result${filteredInvoices.length === 1 ? "" : "s"} across ${invoices.length} invoice${invoices.length === 1 ? "" : "s"}.`)
                : uiText(locale, "Recherche par cavalier, propriétaire, cheval, dossard, agent, payeur ou concours.", "Search by rider, owner, horse, back number, agent, payer or show.")}
            </p>
          </div>
        </div>
        <label className="directory-search-field">
          <span>{uiText(locale, "Rechercher une facture", "Search invoices")}</span>
          <div>
            <Search size={16} />
            <input
              placeholder={uiText(locale, "Cavalier, owner, cheval, dossard, agent, show...", "Rider, owner, horse, back number, agent, show...")}
              value={invoiceSearch}
              onChange={(event) => setInvoiceSearch(event.target.value)}
            />
          </div>
        </label>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Facture", "Invoice")}</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>Total</span>
            <span>{uiText(locale, "Solde", "Balance")}</span>
          </div>
          {filteredInvoices.map((invoice) => {
            const invoiceLineItems = lineItems.filter((item) => item.invoice_id === invoice.id);
            const invoiceShow = findById(shows, invoice.show_id);
            const payerContact = findById(contacts, invoice.payer_contact_id);
            return (
              <div className="invoice-group" key={invoice.id}>
                <div className={`table-row invoice-summary-row ${selectedInvoiceId === invoice.id ? "selected" : ""}`}>
                  <button className="invoice-number-button" type="button" onClick={() => setSelectedInvoiceId(invoice.id)}>
                    <FileText size={16} />
                    <span>
                      <strong>#{formatInvoiceNumber(invoice.invoice_number)}</strong>
                      <small>{invoiceContextLabel(invoiceShow, locale)}</small>
                    </span>
                  </button>
                  <span className={`badge ${invoice.status}`}>{invoiceStatusLabel(invoice.status, locale)}</span>
                  <span>{formatCurrency(invoice.total_amount, currency)}</span>
                  <span>
                    <strong>{formatCurrency(invoice.balance_due, currency)}</strong>
                    <span className="muted-line">{contactLabel(payerContact)}</span>
                  </span>
                </div>
                {invoiceLineItems.map((item) => (
                  <div className="table-row invoice-line-row" key={item.id}>
                    <div>
                      <strong>{item.description}</strong>
                      <span className="muted-line">{invoiceItemTypeLabel(item.item_type, locale)}</span>
                    </div>
                    <span>{invoiceQuantityLabel(item.quantity)} x</span>
                    <span>{formatCurrency(item.unit_price, currency)}</span>
                    <span>{formatCurrency(item.total_price + item.tax_amount, currency)}</span>
                  </div>
                ))}
              </div>
            );
          })}
          {!invoices.length ? <EmptyState label={uiText(locale, "Aucune facture pour l'instant. Les inscriptions et réservations créeront maintenant des brouillons de facture.", "No invoices yet. Entries and reservations will now create draft invoices.")} /> : null}
          {invoices.length && !filteredInvoices.length ? <EmptyState label={uiText(locale, "Aucune facture ne correspond à cette recherche.", "No invoice matches this search.")} /> : null}
        </div>
      </section>
    </div>
  );
}

function InvoiceDetailPanel({
  locale,
  currency,
  invoice,
  lineItems,
  organization,
  payerContact,
  show,
  onClose,
}: {
  locale: Locale;
  currency: string;
  invoice: AppContext["invoices"][number];
  lineItems: AppContext["invoiceLineItems"];
  organization: Organization | null;
  payerContact: Contact | undefined;
  show: Show | undefined;
  onClose: () => void;
}) {
  const invoiceDocument = buildInvoiceDocumentData({ currency, invoice, lineItems, locale, organization, payerContact, show });

  return (
    <section className="panel span-2 invoice-detail-panel">
      <div className="panel-header invoice-panel-header">
        <div>
          <p className="eyebrow">{uiText(locale, "Version numérique", "Digital version")}</p>
          <h2>{uiText(locale, "Facture", "Invoice")} #{invoiceDocument.invoiceNumber}</h2>
          <p>{invoiceDocument.organizationName} · {invoiceDocument.showName}</p>
        </div>
        <div className="invoice-panel-actions">
          <button className="ghost-button" type="button" onClick={() => exportInvoicePdf(invoiceDocument, locale)}>
            <Download size={16} />
            {uiText(locale, "Exporter PDF", "Export PDF")}
          </button>
          <button className="icon-button" type="button" aria-label={uiText(locale, "Fermer la facture", "Close invoice")} onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      <article className="invoice-document" aria-label={`${uiText(locale, "Facture", "Invoice")} ${invoiceDocument.invoiceNumber}`}>
        <header className="invoice-document-header">
          <div>
            <span className="invoice-document-kicker">Association</span>
            <h3>{invoiceDocument.organizationName}</h3>
            {invoiceDocument.organizationContactLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
          <div className="invoice-document-number">
            <span>{uiText(locale, "Facture", "Invoice")}</span>
            <strong>#{invoiceDocument.invoiceNumber}</strong>
            <small>{invoiceDocument.statusLabel}</small>
          </div>
        </header>

        <section className="invoice-document-show">
          <div>
            <span className="invoice-document-kicker">{uiText(locale, "Contexte", "Context")}</span>
            <strong>{invoiceDocument.showName}</strong>
            <span>{invoiceDocument.showDates}</span>
            {invoiceDocument.showLocation ? <span>{invoiceDocument.showLocation}</span> : null}
          </div>
          <div>
            <span className="invoice-document-kicker">Dates</span>
            <strong>{uiText(locale, "Émise le", "Issued on")} {invoiceDocument.issueDate}</strong>
            <span>{invoiceDocument.dueDate ? `${uiText(locale, "Échéance", "Due")} ${invoiceDocument.dueDate}` : uiText(locale, "Aucune échéance définie", "No due date set")}</span>
          </div>
        </section>

        <section className="invoice-document-parties">
          <div>
            <span className="invoice-document-kicker">{uiText(locale, "Facturé à", "Bill to")}</span>
            <strong>{invoiceDocument.payerName}</strong>
            {invoiceDocument.payerContactLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
          <div>
            <span className="invoice-document-kicker">{uiText(locale, "Informations de facturation", "Billing information")}</span>
            {invoiceDocument.organizationAddressLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
            {invoiceDocument.organizationTaxLines.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </div>
        </section>

        <div className="table invoice-detail-table">
          <div className="table-row table-head invoice-detail-row">
            <span>Description</span>
            <span>{uiText(locale, "Qté", "Qty")}</span>
            <span>{uiText(locale, "Prix", "Price")}</span>
            <span>Taxes</span>
            <span>Total</span>
          </div>
          {lineItems.map((item) => (
            <div className="table-row invoice-detail-row" key={item.id}>
              <div>
                <strong>{item.description}</strong>
                <span className="muted-line">{invoiceItemTypeLabel(item.item_type, locale)}</span>
              </div>
              <span>{invoiceQuantityLabel(item.quantity)}</span>
              <span>{formatCurrency(item.unit_price, currency)}</span>
              <span>{formatCurrency(item.tax_amount, currency)}</span>
              <span>{formatCurrency(Number(item.total_price) + Number(item.tax_amount), currency)}</span>
            </div>
          ))}
          {!lineItems.length ? <EmptyState label={uiText(locale, "Aucune ligne sur cette facture.", "No lines on this invoice.")} /> : null}
        </div>

        <footer className="invoice-document-footer">
          <dl className="invoice-document-totals">
            <div>
              <dt>{uiText(locale, "Sous-total", "Subtotal")}</dt>
              <dd>{invoiceDocument.subtotal}</dd>
            </div>
            <div>
              <dt>{invoiceDocument.taxLabel}</dt>
              <dd>{invoiceDocument.taxAmount}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{invoiceDocument.totalAmount}</dd>
            </div>
            <div className="invoice-document-balance">
              <dt>{uiText(locale, "Solde", "Balance")}</dt>
              <dd>{invoiceDocument.balanceDue}</dd>
            </div>
          </dl>
        </footer>
      </article>
    </section>
  );
}

type InvoiceDocumentLine = {
  description: string;
  subtotal: string;
  tax: string;
  total: string;
  typeLabel: string;
  unitPrice: string;
  quantity: string;
};

type InvoiceDocumentData = {
  balanceDue: string;
  dueDate: string | null;
  invoiceNumber: string;
  issueDate: string;
  lineItems: InvoiceDocumentLine[];
  organizationAddressLines: string[];
  organizationContactLines: string[];
  organizationName: string;
  organizationTaxLines: string[];
  payerContactLines: string[];
  payerName: string;
  showDates: string;
  showLocation: string;
  showName: string;
  statusLabel: string;
  subtotal: string;
  taxAmount: string;
  taxLabel: string;
  totalAmount: string;
};

function buildInvoiceDocumentData({
  currency,
  invoice,
  lineItems,
  locale,
  organization,
  payerContact,
  show,
}: {
  currency: string;
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  locale: Locale;
  organization: Organization | null;
  payerContact: Contact | undefined;
  show: Show | undefined;
}): InvoiceDocumentData {
  const organizationName = organizationInvoiceName(organization);
  const taxRate = Number(show?.tax_rate ?? organization?.tax_rate ?? 0);
  const taxName = trimmedText(organization?.tax_name) ?? "Taxes";

  return {
    balanceDue: formatCurrency(invoice.balance_due, currency),
    dueDate: invoice.due_date ? formatDate(invoice.due_date) : null,
    invoiceNumber: formatInvoiceNumber(invoice.invoice_number),
    issueDate: formatDate(invoice.issue_date),
    lineItems: lineItems.map((item) => ({
      description: item.description,
      quantity: invoiceQuantityLabel(item.quantity),
      subtotal: formatCurrency(item.total_price, currency),
      tax: formatCurrency(item.tax_amount, currency),
      total: formatCurrency(Number(item.total_price) + Number(item.tax_amount), currency),
      typeLabel: invoiceItemTypeLabel(item.item_type, locale),
      unitPrice: formatCurrency(item.unit_price, currency),
    })),
    organizationAddressLines: organizationAddressLines(organization, locale),
    organizationContactLines: compactLines([organization?.billing_email, organization?.billing_phone]),
    organizationName,
    organizationTaxLines: organizationTaxLines(organization, locale),
    payerContactLines: compactLines([payerContact?.email, payerContact?.phone]),
    payerName: contactLabel(payerContact),
    showDates: invoiceContextDateLine(show, locale),
    showLocation: showLocationLine(show),
    showName: invoiceContextLabel(show, locale),
    statusLabel: invoiceStatusLabel(invoice.status, locale),
    subtotal: formatCurrency(invoice.subtotal, currency),
    taxAmount: formatCurrency(invoice.tax_amount, currency),
    taxLabel: taxRate > 0 ? `${taxName} (${invoiceQuantityLabel(taxRate)}%)` : taxName,
    totalAmount: formatCurrency(invoice.total_amount, currency),
  };
}

function exportInvoicePdf(invoiceDocument: InvoiceDocumentData, locale: Locale) {
  const printWindow = window.open("", "_blank", "width=900,height=1200");

  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(renderInvoicePrintHtml(invoiceDocument, locale));
  printWindow.document.close();
  printWindow.focus();
}

function invoiceMatchesSearch({
  contacts,
  entries,
  horseContacts,
  horses,
  invoice,
  lineItems,
  normalizedSearch,
  shows,
}: {
  contacts: AppContext["contacts"];
  entries: AppContext["entries"];
  horseContacts: AppContext["horseContacts"];
  horses: AppContext["horses"];
  invoice: Invoice;
  lineItems: AppContext["invoiceLineItems"];
  normalizedSearch: string;
  shows: AppContext["shows"];
}) {
  const tokens = normalizedSearch.split(" ").filter(Boolean);

  if (!tokens.length) {
    return true;
  }

  const haystack = buildInvoiceSearchText({
    contacts,
    entries,
    horseContacts,
    horses,
    invoice,
    lineItems: lineItems.filter((item) => item.invoice_id === invoice.id),
    shows,
  });

  return tokens.every((token) => haystack.includes(token));
}

function buildInvoiceSearchText({
  contacts,
  entries,
  horseContacts,
  horses,
  invoice,
  lineItems,
  shows,
}: {
  contacts: AppContext["contacts"];
  entries: AppContext["entries"];
  horseContacts: AppContext["horseContacts"];
  horses: AppContext["horses"];
  invoice: Invoice;
  lineItems: InvoiceLineItem[];
  shows: AppContext["shows"];
}) {
  const values: Array<string | number | null | undefined> = [
    invoice.invoice_number,
    formatInvoiceNumber(invoice.invoice_number),
    invoice.status,
    invoice.issue_date,
    invoice.due_date,
    invoice.total_amount,
    invoice.balance_due,
  ];
  const show = findById(shows, invoice.show_id);
  const payerContact = findById(contacts, invoice.payer_contact_id);

  values.push(...showSearchValues(show), ...contactSearchValues(payerContact));

  for (const item of lineItems) {
    values.push(item.description, item.item_type, item.quantity, item.unit_price, item.total_price);

    if (item.item_type !== "entry" || !item.item_id) {
      continue;
    }

    const entry = findById(entries, item.item_id);

    if (!entry) {
      continue;
    }

    const horse = findById(horses, entry.horse_id);
    const owner = findById(contacts, entry.owner_contact_id);
    const rider = entry.rider_contact_id ? findById(contacts, entry.rider_contact_id) : undefined;
    const payer = findById(contacts, entry.payer_contact_id);
    const agentContacts = horse ? contactsForHorseRole(horse.id, "agent", contacts, horseContacts) : [];

    values.push(
      entry.entry_number,
      entry.status,
      horse?.name,
      horse?.registration_number,
      ...contactSearchValues(owner),
      ...contactSearchValues(rider),
      ...contactSearchValues(payer),
      ...agentContacts.flatMap(contactSearchValues),
    );
  }

  return normalizeSearchText(values.filter((value) => value !== null && value !== undefined).join(" "));
}

function contactSearchValues(contact: Contact | undefined) {
  return contact
    ? [
        contactLabel(contact),
        contact.first_name,
        contact.last_name,
        contact.email,
        contact.phone,
        contact.barn_name,
        contact.type,
      ]
    : [];
}

function showSearchValues(show: Show | undefined) {
  return show
    ? [
        show.name,
        show.slug,
        show.venue,
        show.location,
        show.city,
        show.state,
        show.country,
        show.start_date,
        show.end_date,
      ]
    : [];
}

function contactsForHorseRole(
  horseId: string,
  role: "agent" | "owner" | "co-owner" | "rider" | "manager",
  contacts: AppContext["contacts"],
  horseContacts: AppContext["horseContacts"],
) {
  const contactIds = new Set(
    horseContacts
      .filter((horseContact) => horseContact.horse_id === horseId && horseContact.role === role)
      .map((horseContact) => horseContact.contact_id),
  );

  return contacts.filter((contact) => contactIds.has(contact.id));
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, " ")
    .trim();
}

function renderInvoicePrintHtml(invoiceDocument: InvoiceDocumentData, locale: Locale) {
  const lines = invoiceDocument.lineItems.length
    ? invoiceDocument.lineItems
        .map(
          (item) => `
            <tr>
              <td>
                <strong>${escapeHtml(item.description)}</strong>
                <span>${escapeHtml(item.typeLabel)}</span>
              </td>
              <td>${escapeHtml(item.quantity)}</td>
              <td>${escapeHtml(item.unitPrice)}</td>
              <td>${escapeHtml(item.tax)}</td>
              <td>${escapeHtml(item.total)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="5">${escapeHtml(uiText(locale, "Aucune ligne sur cette facture.", "No lines on this invoice."))}</td></tr>`;

  return `<!doctype html>
    <html lang="${locale}">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(uiText(locale, "Facture", "Invoice"))} ${escapeHtml(invoiceDocument.invoiceNumber)}</title>
        <style>
          @page { margin: 18mm; size: letter; }
          * { box-sizing: border-box; }
          body {
            color: #15231f;
            font-family: Inter, Arial, sans-serif;
            margin: 0;
          }
          .invoice {
            display: grid;
            gap: 24px;
          }
          header {
            align-items: start;
            border-bottom: 2px solid #13201d;
            display: grid;
            gap: 24px;
            grid-template-columns: 1fr auto;
            padding-bottom: 18px;
          }
          h1, h2, h3, p { margin: 0; }
          h1 { font-size: 30px; }
          h2 { font-size: 20px; }
          .kicker {
            color: #5f716b;
            display: block;
            font-size: 11px;
            font-weight: 800;
            letter-spacing: 0;
            margin-bottom: 6px;
            text-transform: uppercase;
          }
          .number {
            text-align: right;
          }
          .number strong {
            display: block;
            font-size: 34px;
          }
          .grid {
            display: grid;
            gap: 18px;
            grid-template-columns: 1fr 1fr;
          }
          .block {
            border-bottom: 1px solid #d8e3df;
            display: grid;
            gap: 5px;
            padding-bottom: 14px;
          }
          .block strong {
            font-size: 15px;
          }
          .muted {
            color: #5f716b;
          }
          table {
            border-collapse: collapse;
            width: 100%;
          }
          th {
            background: #eef3f1;
            color: #51615d;
            font-size: 11px;
            text-align: left;
            text-transform: uppercase;
          }
          th, td {
            border-bottom: 1px solid #dfe8e4;
            padding: 10px;
            vertical-align: top;
          }
          td span {
            color: #697a74;
            display: block;
            font-size: 12px;
            margin-top: 3px;
          }
          th:not(:first-child), td:not(:first-child) {
            text-align: right;
            white-space: nowrap;
          }
          .totals {
            display: grid;
            gap: 8px;
            justify-self: end;
            min-width: 260px;
          }
          .totals div {
            align-items: center;
            display: flex;
            justify-content: space-between;
          }
          .totals .balance {
            border-top: 2px solid #13201d;
            font-size: 18px;
            font-weight: 800;
            margin-top: 4px;
            padding-top: 10px;
          }
        </style>
      </head>
      <body>
        <main class="invoice">
          <header>
            <div>
              <span class="kicker">Association</span>
              <h1>${escapeHtml(invoiceDocument.organizationName)}</h1>
              ${invoiceDocument.organizationContactLines.map((line) => `<p class="muted">${escapeHtml(line)}</p>`).join("")}
            </div>
            <div class="number">
              <span class="kicker">${escapeHtml(uiText(locale, "Facture", "Invoice"))}</span>
              <strong>#${escapeHtml(invoiceDocument.invoiceNumber)}</strong>
              <p class="muted">${escapeHtml(invoiceDocument.statusLabel)}</p>
            </div>
          </header>
          <section class="grid">
            <div class="block">
              <span class="kicker">${escapeHtml(uiText(locale, "Contexte", "Context"))}</span>
              <h2>${escapeHtml(invoiceDocument.showName)}</h2>
              <p>${escapeHtml(invoiceDocument.showDates)}</p>
              ${invoiceDocument.showLocation ? `<p class="muted">${escapeHtml(invoiceDocument.showLocation)}</p>` : ""}
            </div>
            <div class="block">
              <span class="kicker">Dates</span>
              <strong>${escapeHtml(uiText(locale, "Émise le", "Issued on"))} ${escapeHtml(invoiceDocument.issueDate)}</strong>
              <p>${escapeHtml(invoiceDocument.dueDate ? `${uiText(locale, "Échéance", "Due")} ${invoiceDocument.dueDate}` : uiText(locale, "Aucune échéance définie", "No due date set"))}</p>
            </div>
            <div class="block">
              <span class="kicker">${escapeHtml(uiText(locale, "Facturé à", "Bill to"))}</span>
              <strong>${escapeHtml(invoiceDocument.payerName)}</strong>
              ${invoiceDocument.payerContactLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
            </div>
            <div class="block">
              <span class="kicker">${escapeHtml(uiText(locale, "Informations de facturation", "Billing information"))}</span>
              ${invoiceDocument.organizationAddressLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
              ${invoiceDocument.organizationTaxLines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
            </div>
          </section>
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>${escapeHtml(uiText(locale, "Qté", "Qty"))}</th>
                <th>${escapeHtml(uiText(locale, "Prix", "Price"))}</th>
                <th>Taxes</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${lines}</tbody>
          </table>
          <section class="totals">
            <div><span>${escapeHtml(uiText(locale, "Sous-total", "Subtotal"))}</span><strong>${escapeHtml(invoiceDocument.subtotal)}</strong></div>
            <div><span>${escapeHtml(invoiceDocument.taxLabel)}</span><strong>${escapeHtml(invoiceDocument.taxAmount)}</strong></div>
            <div><span>Total</span><strong>${escapeHtml(invoiceDocument.totalAmount)}</strong></div>
            <div class="balance"><span>${escapeHtml(uiText(locale, "Solde", "Balance"))}</span><strong>${escapeHtml(invoiceDocument.balanceDue)}</strong></div>
          </section>
        </main>
        <script>
          window.addEventListener("load", () => setTimeout(() => window.print(), 150));
        </script>
      </body>
    </html>`;
}

function organizationInvoiceName(organization: Organization | null) {
  return trimmedText(organization?.billing_name) ?? organization?.name ?? "Association";
}

function organizationAddressLines(organization: Organization | null, locale: Locale = "fr") {
  const cityLine = compactInline([organization?.city, organization?.state, organization?.zip_code], " ");
  const lines = compactLines([organization?.address, organization?.address_line2, cityLine, organization?.country]);
  return lines.length ? lines : [uiText(locale, "Adresse à compléter dans les réglages", "Address to complete in settings")];
}

function organizationTaxLines(organization: Organization | null, locale: Locale = "fr") {
  return compactLines([
    organization?.tax_number ? `${trimmedText(organization.tax_name) ?? uiText(locale, "No de taxe", "Tax number")}: ${organization.tax_number}` : null,
    organization?.secondary_tax_number ? `${trimmedText(organization.secondary_tax_name) ?? uiText(locale, "No de taxe", "Tax number")}: ${organization.secondary_tax_number}` : null,
  ]);
}

function invoiceContextLabel(show: Show | undefined, locale: Locale = "fr") {
  if (!show) {
    return uiText(locale, "Facture association", "Association invoice");
  }

  return show.name;
}

function invoiceContextDateLine(show: Show | undefined, locale: Locale = "fr") {
  if (!show) {
    return uiText(locale, "Hors concours", "Outside a show");
  }

  if (show.start_date === show.end_date) {
    return formatDate(show.start_date);
  }

  return `${formatDate(show.start_date)} - ${formatDate(show.end_date)}`;
}

function showLocationLine(show: Show | undefined) {
  if (!show) {
    return "";
  }

  const location = trimmedText(show.venue) ?? trimmedText(show.location);
  const cityLine = compactInline([show.city, show.state, show.country], ", ");
  return compactInline([location, cityLine], " - ");
}

function invoiceStatusLabel(status: Invoice["status"], locale: Locale = "fr") {
  switch (status) {
    case "draft":
      return uiText(locale, "Brouillon", "Draft");
    case "sent":
      return uiText(locale, "Envoyée", "Sent");
    case "viewed":
      return uiText(locale, "Consultée", "Viewed");
    case "partially_paid":
      return uiText(locale, "Partiellement payée", "Partially paid");
    case "paid":
      return uiText(locale, "Payée", "Paid");
    case "overdue":
      return uiText(locale, "En retard", "Overdue");
    case "void":
      return uiText(locale, "Annulée", "Void");
    default:
      return status;
  }
}

function invoiceItemTypeLabel(type: InvoiceLineItem["item_type"], locale: Locale = "fr") {
  switch (type) {
    case "entry":
      return uiText(locale, "Inscription", "Entry");
    case "judge_fee":
      return uiText(locale, "Frais de juge", "Judge fee");
    case "stall":
      return "Stall";
    case "extra":
      return "Extra";
    case "membership":
      return "Membership";
    case "fee":
      return uiText(locale, "Frais", "Fee");
    case "discount":
      return uiText(locale, "Rabais", "Discount");
    case "tax":
      return uiText(locale, "Taxe", "Tax");
    case "manual":
    default:
      return uiText(locale, "Manuel", "Manual");
  }
}

function productCategoryLabel(category: OrganizationProduct["category"], locale: Locale = "fr") {
  switch (category) {
    case "stall_extra":
      return uiText(locale, "Extra de réservation", "Reservation extra");
    case "feed":
      return uiText(locale, "Foin / ripe", "Feed / bedding");
    case "merch":
      return uiText(locale, "Promo", "Merch");
    case "ticket":
      return uiText(locale, "Billet", "Ticket");
    case "meal":
      return uiText(locale, "Repas", "Meal");
    case "admin_fee":
      return uiText(locale, "Frais admin", "Admin fee");
    default:
      return uiText(locale, "Manuel", "Manual");
  }
}

function invoiceQuantityLabel(quantity: number) {
  return Number(quantity).toLocaleString("en-CA", { maximumFractionDigits: 2 });
}

function compactLines(values: Array<string | null | undefined>) {
  return values.map(trimmedText).filter((value): value is string => Boolean(value));
}

function compactInline(values: Array<string | null | undefined>, separator: string) {
  return compactLines(values).join(separator);
}

function trimmedText(value: string | null | undefined) {
  const nextValue = value?.trim();
  return nextValue ? nextValue : null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#039;";
      default:
        return character;
    }
  });
}


export { BillingView };
