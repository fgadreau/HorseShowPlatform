type Report = { context: { name_fr: string; name_en: string; currency: string }; totals: Record<string, number>; expenses_total: number; management_result: number; revenue_categories: { category: string; subtotal: number; tax_amount: number; total: number }[]; payment_methods: { method: string; amount: number }[]; expenses: { description: string; amount: number; incurred_on: string; category: string; voided_at: string | null }[] };

export function csvCell(value: string | number) {
  const safe = typeof value === "string" && /^[\s]*[=+\-@]/.test(value) ? `'${value}` : String(value);
  return `"${safe.replace(/"/g, '""')}"`;
}

export function financeReportCsv(report: Report, locale: string) {
  const fr = locale === "fr", t = report.totals;
  const rows: (string | number)[][] = [
    [fr ? "Bilan financier du concours" : "Show financial summary", fr ? report.context.name_fr : report.context.name_en],
    [fr ? "Devise" : "Currency", report.context.currency],
    [fr ? "Revenus association hors taxes" : "Association revenue before tax", t.revenue],
    [fr ? "Dépenses saisies hors taxes" : "Recorded expenses before tax", report.expenses_total],
    [fr ? "Frais de traitement connus — part association" : "Known processing fees — association share", t.association_processing_fees],
    [fr ? "Résultat provisoire" : "Provisional result", report.management_result],
    [fr ? "Taxes facturées par l’association" : "Association taxes billed", t.association_tax],
    [fr ? "Encaissé pour l’association, taxes comprises" : "Association collections including tax", t.association_collected],
    [fr ? "Solde association, taxes comprises" : "Association receivables including tax", t.association_balance],
    [fr ? "Frais HSP hors taxes, exclus des revenus" : "HSP fees before tax, excluded from revenue", t.hsp_subtotal],
    [fr ? "Paiements sans frais de traitement renseignés" : "Payments with unrecorded processing fees", t.unknown_processing_fees],
    [], [fr ? "Revenus par catégorie" : "Revenue by category", fr ? "Hors taxes" : "Before tax", "Taxes", "Total"],
    ...report.revenue_categories.map(row => [revenueCategoryLabels[row.category]?.[fr ? 0 : 1] ?? (fr ? "Autres services" : "Other services"), row.subtotal, row.tax_amount, row.total]),
    [], [fr ? "Encaissements par moyen" : "Collections by method", fr ? "Montant, tous fournisseurs" : "Amount, all suppliers"],
    ...report.payment_methods.map(row => [paymentMethodLabels[row.method]?.[fr ? 0 : 1] ?? (fr ? "Autre" : "Other"), row.amount]),
    [], [fr ? "Dépenses saisies actives" : "Active recorded expenses", "Date", fr ? "Catégorie" : "Category", fr ? "Hors taxes" : "Before tax"],
    ...report.expenses.filter(row => !row.voided_at).map(row => [row.description, row.incurred_on, expenseCategoryLabels[row.category]?.[fr ? 0 : 1] ?? row.category, row.amount]),
    [], [fr ? "Rapport de gestion provisoire : dépenses saisies et frais connus seulement. Les taxes et frais HSP sont exclus du résultat. Ce rapport ne remplace pas les factures." : "Provisional management report: recorded expenses and known fees only. Taxes and HSP fees are excluded from the result. This report does not replace invoices."],
  ];
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n");
}

export const revenueCategoryLabels: Record<string, [string, string]> = {
  entry: ["Inscriptions", "Entries"], entry_fee: ["Inscriptions", "Entries"], entries: ["Inscriptions", "Entries"],
  stall: ["Stalles", "Stalls"], camping: ["Camping", "Camping"], tack: ["Sellerie", "Tack"], bedding: ["Litière", "Bedding"],
  membership: ["Cartes de membre", "Memberships"], merch: ["Produits et services", "Products and services"],
  warmup: ["Paid warm-ups", "Paid warm-ups"], back_number: ["Dossards", "Back numbers"], other: ["Autres revenus", "Other revenue"],
  reservation: ["Réservations", "Reservations"], judge_fee: ["Frais de juges", "Judge fees"], stall_extra: ["Services de stalle", "Stall services"],
  feed: ["Alimentation", "Feed"], ticket: ["Billetterie", "Tickets"], meal: ["Repas", "Meals"], admin_fee: ["Frais administratifs", "Administrative fees"], manual: ["Autres ventes et services", "Other sales and services"],
};
export const expenseCategoryLabels: Record<string, [string, string]> = {
  venue: ["Location et installations", "Venue and facilities"], judges: ["Juges", "Judges"], payouts: ["Bourses", "Payouts"],
  staff: ["Personnel", "Staff"], supplies: ["Matériel", "Supplies"], travel: ["Déplacements", "Travel"], other: ["Autres dépenses", "Other expenses"],
};
export const paymentMethodLabels: Record<string, [string, string]> = {
  cash: ["Comptant", "Cash"], etransfer: ["Interac", "E-transfer"], cheque: ["Chèque", "Cheque"], stripe: ["Carte", "Card"], card: ["Carte", "Card"], other: ["Autre", "Other"],
};
