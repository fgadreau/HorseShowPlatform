import {entryChargeLabel} from './entryGroups.mjs';
import {ChargeGroups,Payments,Suppliers} from './ChargeGroups';
import {paymentDate,paymentLabel} from './presentation';
import {DocumentPdf} from './DocumentPdf';
import {useRef,useState} from 'react';
import type {Json} from '../../services/billingFolio';
export function DocumentView({document,locale,personal=true}:{document:Json;locale:string;personal?:boolean}){
 const printRef=useRef<HTMLElement>(null),[printError,setPrintError]=useState(false);
 function printDocument(){
  const popup=window.open('','_blank');
  if(!popup||!printRef.current){popup?.close();setPrintError(true);return;}
  popup.opener=null;
  const page=popup.document;page.title=document.number??document.snapshot.account_number;page.documentElement.lang=locale;
  const style=page.createElement('style');style.textContent='@page{size:letter;margin:15mm}body{font:12px Arial,sans-serif;color:#222}h3{margin-top:20px}table{width:100%;border-collapse:collapse}th,td{padding:7px;text-align:left;border-bottom:1px solid #ddd}tr{break-inside:avoid}.finance-suppliers{display:flex;gap:20px}.finance-money{white-space:nowrap}';page.head.append(style);
  const copy=printRef.current.cloneNode(true) as HTMLElement;copy.querySelectorAll('button,[data-pdf-controls]').forEach(el=>el.remove());page.body.append(page.importNode(copy,true));
  setPrintError(false);popup.focus();popup.print();
 }
 const s=document.snapshot,fr=locale==='fr';const money=(v:unknown)=>new Intl.NumberFormat(locale,{style:'currency',currency:s.currency}).format(Number(v??0));
 return <article ref={printRef} className="finance-document"><h3>{document.kind==='invoice'?(fr?'Facture finale':'Final invoice'):document.kind==='receipt'?(fr?'Reçu de paiement':'Payment receipt'):(fr?'Relevé du compte':'Account statement')} {document.number??''}</h3>
 {document.kind==='receipt'&&s.receipt_payment&&<p><strong>{fr?'Paiement de ce reçu':'Payment on this receipt'} : {money(s.receipt_payment.amount)}</strong> · {paymentLabel(s.receipt_payment.method,locale)} · {paymentDate(s.receipt_payment.received_at,locale)}</p>}
 <p>{s.account_number} · {fr?s.context.name_fr:s.context.name_en} · {s.context.financial_year??'—'}</p>
 <p>{s.payer.first_name} {s.payer.last_name} {s.payer.company_name} · {s.payer.address}</p>
 <Suppliers suppliers={s.suppliers} locale={locale}/><ChargeGroups data={s} locale={locale}/>
 {document.kind==='receipt'&&s.receipt_payment&&<section><h3>{fr?'Affectations de ce paiement':'Allocations of this payment'}</h3>{s.receipt_payment.allocations.map((a:Json)=>{const c=s.charges.find((c:Json)=>c.id===a.charge_id);return <p key={a.charge_id}>{s.presentation_version>=4&&<strong>{entryChargeLabel(c,locale)} </strong>}{c?.description} · {fr?'Montant total du frais':'Full charge amount'} : {money(c?.total)} · <strong>{fr?'Portion réglée par ce paiement':'Portion paid by this payment'} : {money(a.amount)}</strong></p>;})}</section>}

 <p>{fr?'Sous-total':'Subtotal'} : {money(s.subtotal)} · Taxes : {money(s.tax_amount)} · Total : {money(s.total)}</p>
 <Payments payments={s.payments} locale={locale} currency={s.currency}/><strong>{fr?'Solde à la date du document':'Balance at document date'} : {money(s.balance)}</strong>
 <div data-pdf-controls><button type="button" onClick={printDocument}>{fr?'Imprimer / enregistrer en PDF':'Print / save as PDF'}</button>{printError&&<p role="alert">{fr?'Autorisez l’ouverture de la fenêtre pour imprimer le document.':'Allow the popup to print this document.'}</p>}<DocumentPdf documentId={document.id} personal={personal} locale={locale}/></div></article>;
}
