const messages: Record<string,string> = {
 WARMUP_FORBIDDEN:'Vous n’avez pas accès à cette opération.',
 WARMUP_OWNER_REQUIRED:'Le cheval doit avoir un propriétaire avant la demande.',
 WARMUP_REGISTRATION_CLOSED:'Les demandes sont fermées. Contactez l’association pour un changement.',
 WARMUP_CONFIGURATION_FROZEN:'Le prix ne peut plus changer après une demande ; la capacité ne peut plus changer après le tirage.',
 WARMUP_STALE_VERSION_REFRESH:'La liste a changé. Actualisez avant de continuer.',
 WARMUP_REVIEW_CHANGED:'Les frais ont changé. Vérifiez à nouveau avant de confirmer.',
 WARMUP_FULL:'Toutes les places sont déjà attribuées. Retirez un cheval avant d’attribuer sa place.',
 WARMUP_NO_WAITING_REQUEST:'Aucun cheval n’est en attente.',
 WARMUP_DRAW_ALREADY_DONE:'Le tirage a déjà été effectué. Utilisez les ajustements de la liste.',
 WARMUP_NO_REQUESTS:'Il n’y a aucune demande à tirer au sort.',
 WARMUP_DRAW_REQUIRED:'Effectuez le tirage avant de valider la liste.',
 WARMUP_BILLING_CONTEXT_REQUIRED:'La facturation de ce concours doit être configurée avant validation.',
 WARMUP_PRODUCT_PRICE_MUST_MATCH:'Choisissez un produit actif du concours dont le prix correspond au prix de la séance.',
 WARMUP_ALREADY_BILLED_CONTACT_SECRETARY:'Cette place a déjà été facturée. La secrétaire doit traiter le changement manuellement.',
 WARMUP_ASSOCIATION_DIRECTORY_REQUIRED:'L’association doit avoir un répertoire de discipline pour rattacher les participants.',
};
export function warmupError(error:unknown){const message=error instanceof Error?error.message:String(error);return messages[message]??message;}
