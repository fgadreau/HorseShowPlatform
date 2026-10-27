import {useRef,useState} from 'react';
import {ChargeGroups,Payments} from './ChargeGroups';
import {paymentDate,paymentLabel} from './presentation';
import {DocumentPdf} from './DocumentPdf';
import documentStyles from './billingDocument.css?inline';
import type {Json} from '../../services/billingFolio';
import {taxRegistrationLabel} from './taxRegistration';

function address(p:Json){return [p.address,p.address_line2,[p.city,p.state,p.zip_code].filter(Boolean).join(' '),p.country].filter(Boolean).join(', ');}

export function DocumentView({document,locale,personal=true,invoicePreview=false,showPdfControls=true}:{document:Json;locale:string;personal?:boolean;invoicePreview?:boolean;showPdfControls?:boolean}){
 const printRef=useRef<HTMLElement>(null),[printError,setPrintError]=useState(false);
 const s=document.snapshot,fr=locale==='fr',text=(a:string,b:string)=>fr?a:b;
 const money=(v:unknown)=>new Intl.NumberFormat(fr?'fr-CA':'en-CA',{style:'currency',currency:s.currency}).format(Number(v??0));
 const title=invoicePreview?text('Aperçu de la facture','Invoice preview'):document.kind==='invoice'?text('Facture','Invoice'):document.kind==='receipt'?text('Reçu de paiement','Payment receipt'):text('Relevé de compte','Account statement');
 const suppliers:Record<string,Json>=s.suppliers??{association:s.seller??{}};
 const date=new Date(s.issued_at??document.created_at);
 const issued=Number.isNaN(date.valueOf())?'—':new Intl.DateTimeFormat(fr?'fr-CA':'en-CA',{dateStyle:'long',timeZone:s.context.timezone??'America/Toronto'}).format(date);
 const taxes=new Map<string,{name:string;amount:number}>();
 for(const c of s.charges)for(const t of c.taxes??[]){
  const rate=new Intl.NumberFormat(fr?'fr-CA':'en-CA',{maximumFractionDigits:6}).format(Number(t.rate));
  const key=JSON.stringify([c.supplier??'association',t.code,t.name,t.rate]);
  const name=`${t.name} (${rate} %)${Object.keys(suppliers).length>1?` · ${suppliers[c.supplier??'association']?.name??''}`:''}`;
  const entry=taxes.get(key)??{name,amount:0};entry.amount+=Math.round(Number(t.amount)*100);taxes.set(key,entry);
 }
 async function printDocument(){
  const popup=window.open('','_blank');
  if(!popup||!printRef.current){popup?.close();setPrintError(true);return;}
  popup.opener=null;
  const page=popup.document;page.title=`${title} ${document.number??s.account_number}`;page.documentElement.lang=locale;
  const meta=page.createElement('meta');meta.setAttribute('charset','utf-8');page.head.append(meta);
  const style=page.createElement('style');style.textContent=documentStyles;page.head.append(style);
  const copy=printRef.current.cloneNode(true) as HTMLElement;page.body.append(page.importNode(copy,true));
  try{await Promise.all(Array.from(page.images,image=>image.decode().catch(()=>{})));if(popup.closed)return;setPrintError(false);popup.focus();popup.print();}catch{setPrintError(true);}
 }
 return <>
 <style>{documentStyles}</style>
 <article ref={printRef} className="billing-document">
  <header className="billing-document-header">
   <div><span className="billing-document-eyebrow">{text('Document de facturation','Billing document')}</span><h3>{title}</h3><strong className="billing-document-number">{invoicePreview?text('Numéro attribué à l’émission','Number assigned upon issue'):document.number??s.account_number}</strong></div>
   <div className="billing-document-meta"><div><span>{text('Date d’émission','Issue date')}</span><strong>{issued}</strong></div><div><span>{text('Compte client','Customer account')}</span><strong>{s.account_number}</strong></div><div><span>{text('Devise','Currency')}</span><strong>{s.currency}</strong></div></div>
  </header>
  {document.kind==='statement'&&!invoicePreview&&<p className="billing-document-notice">{text('Ce relevé présente la situation du compte. Il ne constitue pas une facture.','This statement shows the account position. It is not an invoice.')}</p>}
  <section className="billing-document-parties">
   <div><h4>{text('Facturé à','Bill to')}</h4><strong>{s.payer.billing_name??[s.payer.first_name,s.payer.middle_name,s.payer.last_name].filter(Boolean).join(' ')}</strong>{s.payer.company_name&&<p>{s.payer.company_name}</p>}<p>{address(s.payer)}</p>{s.payer.email&&<p>{s.payer.email}</p>}</div>
   <div><h4>{text('Concours / activité','Show / activity')}</h4><strong>{fr?s.context.name_fr:s.context.name_en}</strong>{s.context.financial_year&&<p>{text('Année','Year')} {s.context.financial_year}</p>}</div>
  </section>
  <div className="billing-document-suppliers">{Object.entries(suppliers).sort(([a],[b])=>Number(a!=='association')-Number(b!=='association')).map(([key,v])=>{
   const identity=key==='association'?{...s.seller,...v}:v;
   return <section key={key}><h4>{key==='association'?text('Fournisseur — association','Supplier — association'):text('Fournisseur — HSP','Supplier — HSP')}</h4><strong>{identity.billing_name??identity.name}</strong>{identity.billing_name&&identity.name!==identity.billing_name&&<p>{identity.name}</p>}<p>{address(identity)}</p>{(identity.email||identity.phone)&&<p>{[identity.email,identity.phone].filter(Boolean).join(' · ')}</p>}
    <dl className="billing-document-tax-ids">{([1,2] as const).map(index=><div key={index}><dt>{taxRegistrationLabel(identity,index,locale)}</dt><dd>{identity[`tax_number_${index}`]||text('Non renseigné','Not provided')}</dd></div>)}</dl>
    {key==='hsp'&&<p className="billing-document-caption">{text('Facturé et encaissé par l’association comme mandataire.','Billed and collected by the association as agent.')}</p>}
   </section>;
  })}</div>
  <ChargeGroups data={s} locale={locale}/>
  {document.kind==='receipt'&&s.receipt_payment&&<section className="billing-document-receipt"><h4>{text('Paiement reçu','Payment received')}</h4><strong>{money(s.receipt_payment.amount)}</strong><p>{paymentLabel(s.receipt_payment.method,locale)} · {paymentDate(s.receipt_payment.received_at,locale)}</p>{s.receipt_payment.reference&&<p>{text('Référence','Reference')} : {s.receipt_payment.reference}</p>}</section>}
  {document.kind==='receipt'&&s.receipt_payment&&<section><h4>{text('Affectations de ce paiement','Allocations of this payment')}</h4><table><thead><tr><th>{text('Frais / bénéficiaire','Charge / beneficiary')}</th><th>{text('Total du frais','Full charge amount')}</th><th>{text('Portion réglée','Portion paid')}</th></tr></thead><tbody>{s.receipt_payment.allocations.map((a:Json)=>{const c=s.charges.find((item:Json)=>item.id===a.charge_id);return <tr key={a.charge_id}><td>{c?.description}<small>{[c?.beneficiary?.display_name,c?.horse?.name].filter(Boolean).join(' · ')}</small></td><td>{money(c?.total)}</td><td>{money(a.amount)}</td></tr>;})}</tbody></table></section>}
  <section className="billing-document-summary"><dl><div><dt>{text('Sous-total avant taxes','Subtotal before taxes')}</dt><dd>{money(s.subtotal)}</dd></div>{Array.from(taxes,([key,t])=><div key={key}><dt>{t.name}</dt><dd>{money(t.amount/100)}</dd></div>)}<div><dt>{text('Total des taxes','Total taxes')}</dt><dd>{money(s.tax_amount)}</dd></div><div className="billing-document-total"><dt>Total</dt><dd>{money(s.total)}</dd></div><div><dt>{text('Paiements à la date d’émission','Payments at issue date')}</dt><dd>{money(s.received)}</dd></div><div className="billing-document-due"><dt>{Number(s.balance)===0?text('Acquitté à l’émission','Paid at issue'):text('Solde à payer à l’émission','Balance due at issue')}</dt><dd>{money(s.balance)}</dd></div></dl></section>
  {s.payments.length?<Payments payments={s.payments} locale={locale} currency={s.currency}/>:<p>{text('Aucun paiement reçu à la date d’émission.','No payments received at issue date.')}</p>}
  <footer className="billing-document-footer"><span>{title} {document.number??''} · {s.account_number}</span><span>{text('Conservez ce document pour vos dossiers.','Keep this document for your records.')}</span></footer>
 </article>
 {!invoicePreview&&showPdfControls&&<div data-pdf-controls className="finance-actions"><button type="button" onClick={()=>void printDocument()}>{text('Imprimer / enregistrer en PDF','Print / save as PDF')}</button>{printError&&<p role="alert">{text('Autorisez l’ouverture de la fenêtre pour imprimer le document.','Allow the popup to print this document.')}</p>}<DocumentPdf documentId={document.id} personal={personal} locale={locale}/></div>}
 </>;
}
