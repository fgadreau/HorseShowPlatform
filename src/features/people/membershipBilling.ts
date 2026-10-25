import {billingRpc} from '../../services/billingFolio';
import type {Locale} from '../../lib/i18n';

export function membershipBillingError(error:unknown,locale:string){
 const code=error instanceof Error?error.message:String((error as {message?:string})?.message??error);
 const fr=locale==='fr';
 if(/MEMBERSHIP_(BILLING_NOT_CONFIGURED|PILOT_REQUIRED)/.test(code))return fr?'L’association doit configurer la facturation de cette carte avant l’achat. Aucune carte ni aucun frais n’a été créé.':'The association must configure billing for this membership before purchase. No membership or charge was created.';
 if(/MEMBERSHIP_LEGACY/.test(code))return fr?'Cette carte possède une ancienne facture. L’association doit la vérifier dans les réglages des cartes avant de poursuivre.':'This membership has a legacy invoice. The association must review it in membership settings before proceeding.';
 if(/MEMBERSHIP_(QUOTE_CHANGED|CONFIG_CHANGED)/.test(code))return fr?'Le prix ou les taxes ont changé. L’association doit vérifier la configuration avant de poursuivre.':'The price or taxes changed. The association must review the configuration before proceeding.';
 if(code==='MEMBERSHIP_PAYER_REQUIRED')return fr?'Choisis le payeur du nouveau compte.':'Choose the payer for the new account.';
 if(code==='MEMBERSHIP_TAX_CONFIG_REQUIRED')return fr?'Choisis les taxes de la carte et précise chaque taux applicable.':'Choose the membership taxes and specify each applicable rate.';
 return fr?'L’opération n’a pas pu être confirmée. Actualise les données avant de réessayer.':'The operation could not be confirmed. Refresh the data before retrying.';
}
export async function confirmMembershipPurchase(typeId:string,locale:Locale):Promise<number|null>{
 const q=await billingRpc('membership_billing_quote',{p_type:typeId});
  const fr=locale==='fr';const money=(v:number)=>new Intl.NumberFormat(fr?'fr-CA':'en-CA',{style:'currency',currency:q.currency}).format(v);
  const text=[q.name,String(q.season),`${fr?'Prix':'Price'} : ${money(q.subtotal)}`,...q.taxes.map((t:{name:string;amount:number})=>`${t.name} : ${money(t.amount)}`),q.taxes.length?'':fr?'Sans taxes':'No tax',`Total : ${money(q.total)}`,fr?'Créer les frais dans ton compte ? La carte payante sera active après paiement reçu et affecté. Aucun débit bancaire automatique.':'Add these charges to your account? A paid membership activates after payment is received and allocated. No automatic bank charge.'].filter(Boolean).join('\n');
  return window.confirm(text)?Number(q.total):null;
}
