import type {Json} from '../../services/billingFolio';
export const closedLabel=(locale:string)=>locale==='fr'?'Compte fermé — facture finale disponible':'Account closed — final invoice available';
export function paymentLabel(method:string,locale:string){const fr=locale==='fr';return ({cash:fr?'Comptant':'Cash',etransfer:fr?'Virement Interac':'Interac transfer',cheque:fr?'Chèque':'Cheque',other:fr?'Autre':'Other',stripe_test:fr?'Carte bancaire (test)':'Card (test)'})[method]??(fr?'Paiement':'Payment');}
export function paymentDate(value:string,locale:string){const date=new Date(value);return Number.isNaN(date.valueOf())?'—':new Intl.DateTimeFormat(locale==='fr'?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(date)+' UTC';}
export const reasonText:Record<string,[string,string]>={CHECKOUT_DISABLED:['Finalisation autonome non disponible','Self checkout unavailable'],CLOSED:['Compte fermé — facture finale disponible','Account closed — final invoice available'],CLOSING_PHASE:['La période de fermeture n’est pas encore ouverte.','The closing period is not open yet.'],FEES_EXPECTED:['L’association attend encore des frais.','The association is still expecting charges.'],PAYMENT_PENDING:['Un paiement est en traitement. Vérifiez son état avant de finaliser.','A payment is processing. Check its status before finalizing.'],ADMIN_REVIEW:['L’association doit terminer la vérification du compte.','The association must finish reviewing this account.'],BALANCE_DUE:['Réglez le solde avant de finaliser.','Pay the balance before finalizing.'],BALANCE_REVIEW:['Le solde doit être vérifié par l’association.','The association must review the balance.'],PAYER_ONLY:['Seul le payeur peut finaliser ce compte.','Only the payer can finalize this account.'],RECAP_REQUIRED:['Récapitulatif à confirmer','Review the current summary']};
export function billingError(message:string,locale:string,data?:Json){
 const fr=locale==='fr';
 if(message.includes('billing_etransfer_reference_key'))return fr?'Cette référence Interac a déjà été enregistrée. Vérifiez le paiement existant.':'This Interac reference is already recorded. Check the existing payment.';
 if(data?.state==='closed'&&/BILLING_(NOT_ADMISSIBLE|FOLIO_CLOSED|STALE_RECAP|STALE_VERSION)/.test(message))return closedLabel(locale);
 if(message==='BILLING_NOT_ADMISSIBLE'&&data){const reasons=(data.checkout?.reasons??[]).filter((r:string)=>r!=='RECAP_REQUIRED');if(reasons.length)return reasons.map((r:string)=>reasonText[r]?.[fr?0:1]??(fr?'Contactez l’association pour vérifier ce compte.':'Contact the association to review this account.')).join(' ');}
 const messages:Record<string,[string,string]>={
 BILLING_PREAUTH_NOT_DUE:['La préautorisation n’est pas encore due selon les paramètres du concours.','Authorization is not yet due under the show settings.'],
 BILLING_PREAUTH_FULL_BALANCE_REQUIRED:['Le montant à préautoriser a changé. Actualisez le compte.','The authorization amount changed. Refresh the account.'],
 BILLING_PREAUTH_CAPTURE_BALANCE:['Le solde ne peut pas être encaissé sur cette préautorisation. Vérifiez le compte avant de poursuivre.','This balance cannot be captured from the authorization. Review the account before continuing.'],
 BILLING_FOLIO_CLOSED:['Ce compte est fermé. Contactez l’association pour ajuster les frais.','This account is closed. Contact the association to adjust charges.'],
 BILLING_PAYMENT_PENDING:reasonText.PAYMENT_PENDING,
 BILLING_CONTEXT_UNAVAILABLE:['Les réservations de ce concours sont temporairement indisponibles. Contactez l’association.','Reservations for this show are temporarily unavailable. Contact the association.'],
 RESERVATION_CHARGE_HAS_PAYMENT:['Cette ligne a déjà reçu un paiement. L’association doit traiter l’ajustement ou le remboursement.','This line has received a payment. The association must handle the adjustment or refund.'],
 RESERVATION_PRICE_CHANGED:['Le prix a changé. Actualisez les options de réservation avant de réessayer.','The price changed. Refresh reservation options before retrying.'],
 RESERVATION_SPLIT_REQUIRES_BATCH:['Le partage des frais doit être modifié dans une demande complète. Contactez l’association.','Shared charges must be changed through a complete request. Contact the association.'],
 EVENT_LEGACY_RECONCILIATION_REQUIRED:['Cette opération est liée à une ancienne facture. Contactez l’association pour son rapprochement.','This operation is linked to a historical invoice. Contact the association for reconciliation.'],
 RESERVATION_LEGACY_RECONCILIATION_REQUIRED:['Cette réservation est liée à une ancienne facture. Contactez l’association pour son rapprochement.','This reservation is linked to a historical invoice. Contact the association for reconciliation.'],
 BILLING_STALE_RECAP:['Le compte a changé. Vérifiez un nouveau récapitulatif avant de confirmer.','The account changed. Review a new summary before confirming.'],BILLING_STALE_VERSION:['Le compte a changé. Actualisez les montants avant de réessayer.','The account changed. Refresh the amounts before retrying.'],BILLING_PAYMENT_EXCEEDS_BALANCE:['Le montant dépasse le solde payable.','The amount exceeds the payable balance.'],BILLING_PAYMENT_RESERVED:['Un paiement réserve déjà une partie du solde. Vérifiez le paiement en cours.','A payment already reserves part of the balance. Check the pending payment.'],BILLING_PREVIOUS_COMMAND_UNRESOLVED:['Vérifiez l’opération précédente avant de poursuivre.','Resolve the previous operation before continuing.'],BILLING_FORBIDDEN:['Vous n’avez pas accès à cette opération. Vérifiez votre connexion ou contactez l’association.','You cannot access this operation. Check your login or contact the association.'],BILLING_PENDING_PAYMENT:reasonText.PAYMENT_PENDING,BILLING_BLOCKED:reasonText.ADMIN_REVIEW,BILLING_RECAP_REQUIRED:reasonText.RECAP_REQUIRED,BILLING_STALE_QUOTE:['Les frais ont changé. Vérifiez la nouvelle proposition.','Charges changed. Review the new quote.']};
 return messages[message]?.[fr?0:1]??(fr?'L’opération n’a pas pu être confirmée. Actualisez le compte pour vérifier son état avant de réessayer.':'The operation could not be confirmed. Refresh the account to check its status before retrying.');
}
export function chargeGroups(charges:Json[],locale:string){
 const fr=locale==='fr',groups=new Map<string,{key:string;label:string;entry:boolean;charges:Json[]}>();
 for(const c of charges){const p=c.presentation;const entry=p?.section==='entry'&&c.supplier!=='hsp';const key=c.supplier==='hsp'?'hsp':entry?JSON.stringify([c.horse?.id,p.block_id,p.occurrence_id]):p?.section==='reservation'?'reservation':c.category==='horse_fee'?'horse_fee':'other';
 if(!groups.has(key))groups.set(key,{key,entry,label:key==='hsp'?(fr?'Service HSP':'HSP service'):entry?`${fr?'Inscriptions':'Entries'} · ${c.horse?.name??''} · ${p.block_label} · ${p.occurrence_id}`:key==='reservation'?(fr?'Réservations':'Reservations'):key==='horse_fee'?(fr?'Frais par cheval':'Per-horse fees'):(fr?'Autres achats et services':'Other purchases and services'),charges:[]});groups.get(key)!.charges.push(c);}
 return [...groups.values()].sort((a,b)=>(a.entry?0:a.key==='horse_fee'?1:a.key==='reservation'?2:a.key==='other'?3:4)-(b.entry?0:b.key==='horse_fee'?1:b.key==='reservation'?2:b.key==='other'?3:4));
}

export function sourceBillingError(error:unknown,locale:string){
 const message=error&&typeof error==='object'&&'message' in error?String(error.message):'';
 if(message.startsWith('ENTRY_'))return cancellationError(error,locale==='fr');
 return /^(BILLING|RESERVATION|EVENT)_/.test(message)?billingError(message,locale):message||billingError('',locale);
}

export function cancellationError(error: unknown, fr: boolean) {
  const code = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const messages: Record<string, [string, string]> = {
    ENTRY_DRAW_PENDING_FINANCIAL_CONFIRMATION: ["Des inscriptions attendent un paiement ou une préautorisation confirmée. Le draw de ce bloc est bloqué.", "Entries await confirmed payment or authorization. This block’s draw is blocked."],
    ENTRY_INVALID_AMOUNT: ["Saisissez un montant positif ou nul, avec au maximum deux décimales, et choisissez le traitement des taxes.", "Enter a nonnegative amount with at most two decimal places and choose tax treatment."],
    ENTRY_PAYMENT_OR_AUTHORIZATION_REQUIRED: ["Une préautorisation ou un paiement confirmé est requis pour activer cette inscription.", "Confirmed authorization or payment is required to activate this entry."],
    ENTRY_DRAW_GENERATED_USE_LATE_ENTRY: ["Le draw est déjà généré. Utilisez la procédure d’ajout tardif pour ce bloc.", "The draw has been generated. Use this block’s late-entry procedure."],
    ENTRY_USE_CANCELLATION_REQUEST: ["Avant le draw, envoyez une demande d’annulation. Après sa génération, utilisez un scratch.", "Before the draw, submit a cancellation request. After generation, use a scratch."],
    ENTRY_CONTEXT_CHANGED: ["Le contexte de l’inscription a changé. Actualisez la liste avant de réessayer.", "The entry context changed. Refresh the list before retrying."],
    ENTRY_FORBIDDEN: ["Vous n’avez pas accès à cette opération pour cette inscription.", "You cannot perform this action on this entry."],
    ENTRY_ACCOUNT_CLOSED: ["Le compte est fermé. Les ajustements d’annulation sont réservés aux comptes ouverts.", "The account is closed. Cancellation adjustments require an open account."],
    ENTRY_ACCOUNT_CONFIGURATION_REQUIRED: ["Le compte du concours doit être configuré avant de traiter cet ajustement.", "Configure the show account before processing this adjustment."],
    ENTRY_DRAW_GENERATED_USE_SCRATCH: ["Le draw est déjà généré. Il faut passer par un scratch.", "The draw has been generated. Use the scratch procedure."],
    ENTRY_CANCELLATION_ALREADY_PENDING: ["Une demande est déjà en attente pour cette inscription.", "A request is already pending for this entry."],
    ENTRY_CANCELLATION_ALREADY_DECIDED: ["Cette demande a déjà été traitée. Actualisez la liste.", "This request has already been processed. Refresh the list."],
    ENTRY_CREDIT_EXCEEDS_CANCELLED_FEES: ["Le crédit dépasse les frais annulés.", "The credit exceeds the cancelled charges."],
    BILLING_STALE_VERSION: ["Le compte a changé. Actualisez le calcul avant de confirmer.", "The account changed. Refresh the calculation before confirming."],
    ENTRY_PENDING_CANCELLATION_LOCKED: ["Traitez ou retirez la demande d’annulation avant de modifier cette inscription.", "Process or withdraw the cancellation request before editing this entry."],
    ENTRY_DRAW_PENDING_CANCELLATIONS: ["Des demandes d’annulation attendent une réponse pour ce bloc. Son draw est bloqué.", "Cancellation requests are pending for this block. Its draw is blocked."],
  };
  return messages[code]?.[fr ? 0 : 1] ?? (fr ? "L’opération n’a pas été confirmée. Actualisez pour vérifier son état avant de réessayer." : "The operation was not confirmed. Refresh to check its status before retrying.");
}
