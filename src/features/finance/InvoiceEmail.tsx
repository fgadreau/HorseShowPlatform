import {useState} from 'react';
import {Mail} from 'lucide-react';
import {requireSupabase} from '../../lib/supabase';
import type {Json} from '../../services/billingFolio';

const validEmail = (value:unknown) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim());

export function InvoiceEmail({document,locale}:{document:Json;locale:string}){
 const fr=locale==='fr',recipient=String(document.snapshot?.payer?.email??'').trim();
 const [busy,setBusy]=useState(false),[state,setState]=useState<'idle'|'sent'|'error'>('idle'),[message,setMessage]=useState('');
 async function send(){
  setBusy(true);setState('idle');setMessage('');
  try{
   const {data,error}=await requireSupabase().functions.invoke('send-billing-invoice',{body:{documentId:document.id,locale}});
   let code=String(data?.code??'');
   if(error&&!code){try{code=String((await (error as {context?:Response}).context?.clone().json())?.code??'');}catch{/* A stable generic message is shown below. */}}
   if(error||code!=='BILLING_EMAIL_SENT')throw Error(code||'BILLING_EMAIL_UNAVAILABLE');
   setState('sent');setMessage(fr?`Facture envoyée à ${recipient}. Les réponses seront acheminées à votre adresse de connexion.`:`Invoice sent to ${recipient}. Replies will be sent to your sign-in email address.`);
  }catch(error){
   const code=(error as Error).message;
   setState('error');setMessage(code==='BILLING_EMAIL_PDF_NOT_READY'?(fr?'Le PDF archivé est encore en préparation. Réessayez dès qu’il est disponible.':'The archived PDF is still being prepared. Try again when it is available.'):code==='BILLING_EMAIL_REPLY_TO_MISSING'?(fr?'Votre compte ne contient pas d’adresse courriel utilisable pour recevoir les réponses.':'Your account does not have a usable email address for replies.'):code==='BILLING_EMAIL_RECIPIENT_MISSING'?(fr?'Cette facture ne contient pas d’adresse courriel valide pour le payeur.':'This invoice does not contain a valid payer email address.'):(fr?'L’envoi est temporairement indisponible. Aucun courriel n’a été confirmé.':'Email delivery is temporarily unavailable. No email was confirmed.'));
  }finally{setBusy(false);}
 }
 if(document.kind!=='invoice')return null;
 const recipientReady=validEmail(recipient);
 return <section className="finance-invoice-email" aria-label={fr?'Envoi de la facture':'Invoice email delivery'}>
  <button type="button" disabled={busy||!recipientReady} onClick={()=>void send()}><Mail size={16} aria-hidden="true"/>{busy?(fr?'Envoi en cours…':'Sending…'):(fr?'Envoyer la facture par courriel':'Email invoice')}</button>
  <small>{recipientReady?(fr?`Destinataire : ${recipient}`:`Recipient: ${recipient}`):(fr?'Aucun courriel valide n’est enregistré sur cette facture.':'No valid email address is recorded on this invoice.')}</small>
  {message&&<p role={state==='error'?'alert':'status'}>{message}</p>}
 </section>;
}
