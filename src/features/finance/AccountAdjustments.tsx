import {useState} from 'react';
import {durableRpc,pendingCommands,stripeAction,type Json} from '../../services/billingFolio';
import {billingError} from './presentation';

const refundState=(state:string,fr:boolean)=>({preparing:fr?'À vérifier':'To verify',pending:fr?'En traitement':'Processing',requires_action:fr?'Action requise':'Action required',succeeded:fr?'Remboursé':'Refunded',failed:fr?'Échec':'Failed',canceled:fr?'Annulé':'Canceled'}[state]??state);
export function AccountAdjustments({data,identity,locale,busy,run}:{data:Json;identity:string;locale:string;busy:boolean;run:(action:()=>Promise<unknown>)=>Promise<void>}) {
 const fr=locale==='fr',text=(a:string,b:string)=>fr?a:b;
 const money=(n:number)=>new Intl.NumberFormat(locale,{style:'currency',currency:data.currency}).format(n);
 const [charge,setCharge]=useState(''),[subtotal,setSubtotal]=useState(''),[reason,setReason]=useState('');
 const [payment,setPayment]=useState(''),[amount,setAmount]=useState(''),[refundReason,setRefundReason]=useState('');
 const [message,setMessage]=useState(''),[recoveryError,setRecoveryError]=useState('');
 const recoveryKey=`hsp-refund-command:${identity}:${data.folio_id}`;
 const [recovery,setRecovery]=useState<Json>(()=>{try{return JSON.parse(localStorage.getItem(recoveryKey)??'null');}catch{return null;}});
 const pending=(data.refunds??[]).some((r:Json)=>['preparing','pending','requires_action'].includes(r.state));
 const selected=(data.credits??[]).find((c:Json)=>c.id===charge);
 const selectedPayment=(data.refundable_payments??[]).find((p:Json)=>p.id===payment);
 const maximum=Math.max(0,Math.min(-Number(data.balance),Number(selectedPayment?.refundable??0)));
 const disabled=busy||pendingCommands(identity).length>0||Boolean(recovery);
 async function sendRefund(body:Json) {
  setRecoveryError('');
  try {
   const result=await stripeAction(body);
   localStorage.removeItem(recoveryKey);setRecovery(null);
   setMessage(refundState(result.state,fr));setAmount('');setRefundReason('');
  } catch(e) {
   const code=(e as Error).message;
   if(['BILLING_INVALID_AMOUNT','BILLING_CREDIT_REASON_REQUIRED','BILLING_REFUND_INVALID_PAYMENT','BILLING_REFUND_EXCEEDS_CREDIT','BILLING_PAYMENT_PENDING','BILLING_CAPABILITY_DISABLED'].includes(code)){
    localStorage.removeItem(recoveryKey);setRecovery(null);
   }
   setRecoveryError(billingError(code,locale));throw e;
  }
 }
 return <>
  {message&&<p role="status">{message}</p>}
  {data.actions.credit&&<form className="finance-account-form" onSubmit={e=>{e.preventDefault();if(!window.confirm(text(`Créditer ${money(Number(subtotal))} avant taxes pour « ${reason} » ? Les taxes seront ajustées automatiquement.`,`Credit ${money(Number(subtotal))} before tax for “${reason}”? Taxes will be adjusted automatically.`)))return;void run(async()=>{
   const result=await durableRpc(identity,'billing_credit_account',{p_folio:data.folio_id,p_charge:charge,p_subtotal:Number(subtotal),p_reason:reason.trim()});
   setMessage(`${text('Crédit ajouté, taxes incluses','Credit added, including tax')} : ${money(result.total)}`);setSubtotal('');setReason('');
  });}}>
   <h3>{text('Créditer le compte','Credit account')}</h3>
   <p>{text('Réduisez un frais, par exemple pour une différence de prix de stalle. Le crédit reste dans ce compte et ne déclenche aucun remboursement bancaire.','Reduce a charge, for example a stall price difference. Credit remains on this account and does not issue a bank refund.')}</p>
   <label>{text('Frais à ajuster','Charge to adjust')}<select required value={charge} onChange={e=>setCharge(e.target.value)}><option value="">—</option>{(data.credits??[]).filter((c:Json)=>Number(c.remaining_subtotal)>0).map((c:Json)=><option key={c.id} value={c.id}>{c.description} · {money(Number(c.remaining_subtotal))} {text('avant taxes','before tax')}</option>)}</select></label>
   <label>{text('Montant du crédit avant taxes','Credit amount before tax')}<input required type="number" min="0.01" step="0.01" max={selected?.remaining_subtotal??0} value={subtotal} onChange={e=>setSubtotal(e.target.value)}/></label>
   <label>{text('Motif du crédit','Credit reason')}<textarea required minLength={5} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
   <p>{text('Les taxes sont calculées à partir du frais d’origine.','Taxes are calculated from the original charge.')}</p>
   <button className="finance-primary" disabled={disabled||pending||!selected||reason.trim().length<5}>{text('Confirmer le crédit','Confirm credit')}</button>
  </form>}
  {data.actions.refund&&<section className="finance-account-form">
   <h3>{text('Remboursement Stripe','Stripe refund')}</h3>
   <p>{text('Le remboursement utilise le crédit disponible et retourne l’argent au moyen de paiement d’origine. Les frais de service HSP sont exclus.','Refunds consume available account credit and return funds to the original payment method. HSP service fees are excluded.')}</p>
   <p>{text('Crédit au compte','Account credit')} : <strong>{money(Math.max(0,-Number(data.balance)))}</strong></p>
   {recovery&&<div role="status"><p>{text('Une demande précédente doit être vérifiée. Sa reprise conserve le montant et le motif d’origine.','Verify the previous request. Recovery keeps the original amount and reason.')}</p><button type="button" disabled={busy} onClick={()=>void run(()=>sendRefund(recovery))}>{text('Vérifier la demande précédente','Verify previous request')}</button></div>}
   {recoveryError&&<p role="alert">{recoveryError}</p>}
   {!pending&&Number(data.balance)>=0&&<p>{text('Pour rembourser une différence de prix, ajoutez d’abord le crédit au compte.','To refund a price difference, first add an account credit.')}</p>}
   <form className="finance-adjustment-fields" onSubmit={e=>{e.preventDefault();if(!window.confirm(text(`Rembourser ${money(Number(amount))} par Stripe pour « ${refundReason} » ? Ce montant sera retiré du crédit au compte.`,`Refund ${money(Number(amount))} through Stripe for “${refundReason}”? This amount will be deducted from the account credit.`)))return;
    const body={action:'refund',request_id:crypto.randomUUID(),folio_id:data.folio_id,payment_id:payment,amount:Number(amount),reason:refundReason.trim()};
    localStorage.setItem(recoveryKey,JSON.stringify(body));setRecovery(body);void run(()=>sendRefund(body));
   }}>
    <label>{text('Paiement Stripe d’origine','Original Stripe payment')}<select required value={payment} disabled={disabled||pending} onChange={e=>{setPayment(e.target.value);setAmount('');}}><option value="">—</option>{(data.refundable_payments??[]).filter((p:Json)=>Number(p.refundable)>0).map((p:Json)=><option key={p.id} value={p.id}>{new Date(p.received_at).toLocaleDateString(locale)} · {money(Number(p.amount))}</option>)}</select></label>
    <label>{text('Montant à rembourser, taxes incluses','Refund amount, including tax')}<input required type="number" min="0.01" step="0.01" max={maximum} value={amount} disabled={disabled||pending} onChange={e=>setAmount(e.target.value)}/></label>
    {maximum>0&&<button className="text-button" type="button" disabled={disabled||pending} onClick={()=>setAmount(maximum.toFixed(2))}>{text('Utiliser le maximum','Use maximum')} : {money(maximum)}</button>}
    <label>{text('Motif du remboursement','Refund reason')}<textarea required minLength={5} maxLength={1000} value={refundReason} disabled={disabled||pending} onChange={e=>setRefundReason(e.target.value)}/></label>
    <button className="finance-primary" disabled={disabled||pending||maximum<=0||refundReason.trim().length<5}>{text('Confirmer le remboursement Stripe — TEST','Confirm Stripe refund — TEST')}</button>
   </form>
  </section>}
  {(data.refunds??[]).length>0&&<section className="finance-account-form"><h3>{text('Historique des remboursements','Refund history')}</h3><ul>{data.refunds.map((r:Json)=><li key={r.id}>{money(Number(r.amount))} · {refundState(r.state,fr)} · {r.reason}{data.actions.refund&&['preparing','pending','requires_action'].includes(r.state)&&<button type="button" disabled={busy} onClick={()=>void run(()=>sendRefund({action:'resume_refund',folio_id:data.folio_id,refund_id:r.id}))}>{text('Vérifier le remboursement','Check refund')}</button>}</li>)}</ul></section>}
 </>;
}
