import {ChargeGroups,Payments,Suppliers} from './ChargeGroups';
import {paymentDate,paymentLabel} from './presentation';
import {DocumentPdf} from './DocumentPdf';
import type {Json} from '../../services/billingFolio';
export function DocumentView({document,locale,personal=true}:{document:Json;locale:string;personal?:boolean}){
 const s=document.snapshot,fr=locale==='fr';const money=(v:unknown)=>new Intl.NumberFormat(locale,{style:'currency',currency:s.currency}).format(Number(v??0));
 return <article className="finance-document"><h3>{document.kind==='invoice'?(fr?'Facture finale':'Final invoice'):document.kind==='receipt'?(fr?'Reçu de paiement':'Payment receipt'):(fr?'Relevé du compte':'Account statement')} {document.number??''}</h3>
 {document.kind==='receipt'&&s.receipt_payment&&<p><strong>{fr?'Paiement de ce reçu':'Payment on this receipt'} : {money(s.receipt_payment.amount)}</strong> · {paymentLabel(s.receipt_payment.method,locale)} · {paymentDate(s.receipt_payment.received_at,locale)}</p>}
 <p>{fr?'DÉMONSTRATION — montants et taxes fictifs':'DEMONSTRATION — fictitious amounts and taxes'}</p><p>{s.account_number} · {fr?s.context.name_fr:s.context.name_en} · {s.context.financial_year??'—'}</p>
 <p>{s.payer.first_name} {s.payer.last_name} {s.payer.company_name} · {s.payer.address}</p>
 <Suppliers suppliers={s.suppliers} locale={locale}/><ChargeGroups data={s} locale={locale}/>
 {document.kind==='receipt'&&s.receipt_payment&&<section><h3>{fr?'Affectations de ce paiement':'Allocations of this payment'}</h3>{s.receipt_payment.allocations.map((a:Json)=>{const c=s.charges.find((c:Json)=>c.id===a.charge_id);return <p key={a.charge_id}>{c?.description} · {fr?'Montant total du frais':'Full charge amount'} : {money(c?.total)} · <strong>{fr?'Portion réglée par ce paiement':'Portion paid by this payment'} : {money(a.amount)}</strong></p>;})}</section>}

 <p>{fr?'Sous-total':'Subtotal'} : {money(s.subtotal)} · Taxes : {money(s.tax_amount)} · Total : {money(s.total)}</p>
 <Payments payments={s.payments} locale={locale} currency={s.currency}/><strong>{fr?'Solde à la date du document':'Balance at document date'} : {money(s.balance)}</strong>
 <DocumentPdf documentId={document.id} personal={personal} locale={locale}/></article>;
}
