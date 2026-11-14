export function entryStatusLabel(status: string, locale: string) {
  const labels: Record<string, [string, string]> = {
    draft: ["Brouillon à confirmer", "Draft awaiting confirmation"],
    pending_checkout: ["En attente de paiement ou préautorisation", "Awaiting payment or authorization"],
    active: ["Active", "Active"],
    cancelled: ["Annulée", "Cancelled"],
    scratched: ["Scratch", "Scratched"],
    scratched_pending_refund: ["Scratch · ajustement à vérifier", "Scratch · adjustment to review"],
    completed: ["Terminée", "Completed"],
  };
  return labels[status]?.[locale === "fr" ? 0 : 1] ?? status;
}
