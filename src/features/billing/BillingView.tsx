import { useState } from "react";
import { Download, FileText, X } from "lucide-react";
import { EmptyState, Metric, ViewIntro } from "../../components/ui";
import { contactLabel, findById, formatCurrency, formatDate, numericValue, showLabel } from "../../lib/display";
import type { Locale } from "../../lib/i18n";
import type { AppContext } from "../../services/supabaseServices";
import type { Contact, Invoice, InvoiceLineItem, Organization, Show } from "../../types/domain";
import { uiText, formatInvoiceNumber } from "../dashboard/shared";

function BillingView({
  locale,
  contacts,
  currency,
  invoices,
  lineItems,
  organization,
  shows,
  unpaidBalance,
}: {
  locale: Locale;
  contacts: AppContext["contacts"];
  currency: string;
  invoices: AppContext["invoices"];
  lineItems: AppContext["invoiceLineItems"];
  organization: Organization | null;
  shows: AppContext["shows"];
  unpaidBalance: number;
}) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const selectedInvoice = findById(invoices, selectedInvoiceId) ?? null;
  const selectedInvoiceLineItems = selectedInvoice ? lineItems.filter((item) => item.invoice_id === selectedInvoice.id) : [];
  const selectedInvoiceShow = selectedInvoice ? findById(shows, selectedInvoice.show_id) : undefined;
  const selectedInvoicePayer = selectedInvoice ? findById(contacts, selectedInvoice.payer_contact_id) : undefined;

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
            <p>{uiText(locale, "Brouillons, factures envoyées, paiements partiels et factures payées.", "Drafts, sent invoices, partial payments and paid invoices.")}</p>
          </div>
        </div>
        <div className="table">
          <div className="table-row table-head">
            <span>{uiText(locale, "Facture", "Invoice")}</span>
            <span>{uiText(locale, "Statut", "Status")}</span>
            <span>Total</span>
            <span>{uiText(locale, "Solde", "Balance")}</span>
          </div>
          {invoices.map((invoice) => {
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
                      <small>{showLabel(invoiceShow)}</small>
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
            <span className="invoice-document-kicker">{uiText(locale, "Concours", "Show")}</span>
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
    showDates: showDateRange(show, locale),
    showLocation: showLocationLine(show),
    showName: showLabel(show),
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
              <span class="kicker">${escapeHtml(uiText(locale, "Concours", "Show"))}</span>
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

function showDateRange(show: Show | undefined, locale: Locale = "fr") {
  if (!show) {
    return uiText(locale, "Concours non associé", "No linked show");
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
