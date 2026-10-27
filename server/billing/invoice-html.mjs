import {entryBlocksV5} from '../../src/features/finance/entryBlocksV5.mjs';
import {entryBlocks,displayCents} from '../../src/features/finance/entryGroups.mjs';
import {documentTaxes,taxText,registrationLabel,registrationValue,isTestDocument} from '../../src/features/finance/documentPresentation.mjs';
export const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const address=p=>[p.address,p.address_line2,[p.city,p.state,p.zip_code].filter(Boolean).join(' '),p.country].filter(Boolean).join(', ');

// Browser preview and server PDF share this escaped, network-free document body.
export function invoiceBody(document,locale='fr',{invoicePreview=false}={}){
 if(!['fr','en'].includes(locale)||!['invoice','receipt','statement'].includes(document.kind))throw Error('BILLING_INVALID_REQUEST');
 const s=document.snapshot,fr=locale==='fr',tr=(a,b)=>fr?a:b,esc=escapeHtml;
 const money=v=>new Intl.NumberFormat(fr?'fr-CA':'en-CA',{style:'currency',currency:s.currency}).format(displayCents(v??0)/100);
 const title=invoicePreview?tr('Aperçu de la facture','Invoice preview'):document.kind==='invoice'?tr('Facture','Invoice'):document.kind==='receipt'?tr('Reçu de paiement','Payment receipt'):tr('Relevé de compte','Account statement');
 const suppliers=s.suppliers??{association:s.seller??{}},date=new Date(s.issued_at??document.created_at);
 const issued=Number.isNaN(date.valueOf())?'—':new Intl.DateTimeFormat(fr?'fr-CA':'en-CA',{dateStyle:'long',timeZone:s.context.timezone??'America/Toronto'}).format(date);
 const row=(label,value,cls='')=>`<div class="${cls}"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
 let html=`<header class="billing-document-header"><div><span class="billing-document-eyebrow">${tr('Document de facturation','Billing document')}</span><h3>${title}</h3><strong class="billing-document-number">${esc(invoicePreview?tr('Numéro attribué à l’émission','Number assigned upon issue'):document.number??s.account_number)}</strong></div><div class="billing-document-meta"><div><span>${tr('Date d’émission','Issue date')}</span><strong>${esc(issued)}</strong></div><div><span>${tr('Compte client','Customer account')}</span><strong>${esc(s.account_number)}</strong></div><div><span>${tr('Devise','Currency')}</span><strong>${esc(s.currency)}</strong></div></div></header>`;
 if(isTestDocument(s))html+=`<p class="billing-document-test">${tr('PRÉPRODUCTION — données de test, sans valeur fiscale','PREPRODUCTION — test data, no tax validity')}</p>`;
 if(document.kind==='statement'&&!invoicePreview)html+=`<p class="billing-document-notice">${tr('Ce relevé présente la situation du compte. Il ne constitue pas une facture.','This statement shows the account position. It is not an invoice.')}</p>`;
 const payer=s.payer;
 html+=`<section class="billing-document-parties"><div><h4>${tr('Facturé à','Bill to')}</h4><strong>${esc(payer.billing_name??[payer.first_name,payer.middle_name,payer.last_name].filter(Boolean).join(' '))}</strong>${payer.company_name?`<p>${esc(payer.company_name)}</p>`:''}<p>${esc(address(payer))}</p>${payer.email?`<p>${esc(payer.email)}</p>`:''}</div><div><h4>${tr('Concours / activité','Show / activity')}</h4><strong>${esc(fr?s.context.name_fr:s.context.name_en)}</strong>${s.context.financial_year?`<p>${tr('Année','Year')} ${esc(s.context.financial_year)}</p>`:''}</div></section><div class="billing-document-suppliers">`;
 for(const [key,v] of Object.entries(suppliers).sort(([a],[b])=>Number(a!=='association')-Number(b!=='association'))){
  const i=key==='association'?{...s.seller,...v}:v;
  html+=`<section><h4>${key==='association'?tr('Fournisseur — association','Supplier — association'):tr('Fournisseur — HSP','Supplier — HSP')}</h4><strong>${esc(i.billing_name??i.name)}</strong>${i.billing_name&&i.name!==i.billing_name?`<p>${esc(i.name)}</p>`:''}<p>${esc(address(i))}</p>${i.email||i.phone?`<p>${esc([i.email,i.phone].filter(Boolean).join(' · '))}</p>`:''}<dl class="billing-document-tax-ids">${[1,2].map(index=>row(registrationLabel(i,index,locale),registrationValue(i,index,locale))).join('')}</dl>${key==='hsp'?`<p class="billing-document-caption">${tr('Facturé et encaissé par l’association comme mandataire.','Billed and collected by the association as agent.')}</p>`:''}</section>`;
 }
 html+='</div>';
 if(document.kind==='receipt'){
  const p=s.receipt_payment??s.payments.find(p=>p.id===document.payment_id);
  if(!p)throw Error('BILLING_PDF_INVALID_RECEIPT');
  const after=displayCents(s.balance),amount=displayCents(p.amount);
  const method=({cash:tr('Comptant','Cash'),etransfer:tr('Virement Interac','Interac transfer'),cheque:tr('Chèque','Cheque'),other:tr('Autre','Other'),stripe_test:tr('Carte bancaire (test)','Card (test)'),stripe_checkout:tr('Carte bancaire','Card'),stripe_terminal:tr('Carte au terminal','Terminal card')})[p.method]??p.method;
  const received=new Intl.DateTimeFormat(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:s.context.timezone??'America/Toronto'}).format(new Date(p.received_at));
  html+=`<section class="billing-document-receipt"><h4>${tr('Paiement reçu','Payment received')}</h4><strong>${esc(money(p.amount))}</strong><p>${esc(method)} · ${esc(received)}</p>${p.reference?`<p>${tr('Référence','Reference')} : ${esc(p.reference)}</p>`:''}</section>`;
  html+=`<section class="billing-document-summary billing-receipt-summary"><dl>${row(tr('Solde avant ce paiement','Balance before this payment'),money((after+amount)/100))}${row(tr('Paiement reçu','Payment received'),money(amount/100))}${row(tr('Solde restant après ce paiement','Balance remaining after this payment'),money(after/100),'billing-document-due')}</dl></section>`;
  const status=after===0?tr('Compte acquitté à la date de ce paiement.','Account paid in full at the time of this payment.'):after>0?tr('Compte partiellement payé. Le solde restant est dû au compte.','Account partially paid. The remaining balance is due on the account.'):tr('Un crédit demeure au compte.','A credit remains on the account.');
  return html+`<p class="billing-receipt-status">${status}</p><footer class="billing-document-footer"><span>${title} ${esc(document.number??'')} · ${esc(s.account_number)}</span><span>${tr('Conservez ce document pour vos dossiers.','Keep this document for your records.')}</span></footer>`;
 }
 html+='<div class="finance-charge-groups">';
 const blocks=s.presentation_version>=5?entryBlocksV5(s.charges,locale,s.currency):s.presentation_version>=4?entryBlocks(s.charges,locale,s.currency):[];
 for(const block of blocks)html+=`<section><h3>${esc(block.label)}</h3><table class="finance-charge-table"><thead><tr>${block.columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${block.rows.map((r,n)=>`<tr>${r.map((c,index)=>`<td data-label="${esc(block.columns[index])}">${n===block.rows.length-1?`<strong>${esc(c)}</strong>`:esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
 const groups=new Map();
 for(const c of s.charges){
  if(s.presentation_version>=4&&c.presentation?.section==='entry'&&c.supplier!=='hsp')continue;
  const key=c.supplier==='hsp'?'hsp':c.presentation?.section==='reservation'?'reservation':c.presentation?.section==='entry'?'entry':'other';
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);
 }
 const sum=(cs,key)=>cs.reduce((n,c)=>n+displayCents(c[key]),0)/100;
 const groupLabels={entry:tr('Inscriptions','Entries'),reservation:tr('Réservations','Reservations'),other:tr('Autres achats et services','Other purchases and services'),hsp:tr('Service HSP','HSP service')};
 for(const [key,cs] of [...groups].sort(([a],[b])=>['entry','reservation','other','hsp'].indexOf(a)-['entry','reservation','other','hsp'].indexOf(b))){
  html+=`<section><h3>${groupLabels[key]}</h3><table class="finance-charge-table"><thead><tr><th>${tr('Frais / bénéficiaire','Charge / beneficiary')}</th><th>${tr('Prix × quantité','Price × quantity')}</th><th>Taxes</th><th>Total</th></tr></thead><tbody>`;
  for(const c of cs)html+=`<tr><td><strong>${esc(c.supplier==='hsp'?tr('Frais de service HSP','HSP service fee'):c.description)}</strong><small>${esc(suppliers[c.supplier??'association']?.name)}</small><small>${esc([c.beneficiary?.display_name,c.horse?.name,c.presentation?.period,c.presentation?.duration].filter(Boolean).join(' · '))}</small></td><td>${esc(money(c.unit_price))} × ${esc(c.quantity)}</td><td>${documentTaxes(c,locale).map(t=>`<div>${esc(taxText(t,locale))} : ${esc(money(t.amount))}</div>`).join('')}${!c.taxes?.length?esc(c.exemption_reason):''}</td><td class="finance-money">${esc(money(c.total))}</td></tr>`;
  html+=`</tbody></table><p class="finance-group-total"><strong>${tr('Sous-total avant taxes','Subtotal before taxes')} : ${esc(money(sum(cs,'subtotal')))}</strong><span>Taxes : ${esc(money(sum(cs,'tax_amount')))}</span><span>Total : ${esc(money(sum(cs,'total')))}</span></p></section>`;
 }
 html+='</div>';
 const method=m=>({cash:tr('Comptant','Cash'),etransfer:tr('Virement Interac','Interac transfer'),cheque:tr('Chèque','Cheque'),other:tr('Autre','Other'),stripe_test:tr('Carte bancaire (test)','Card (test)')})[m]??m;
 const paymentDate=v=>new Intl.DateTimeFormat(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short',timeZone:s.context.timezone??'America/Toronto'}).format(new Date(v));
 const taxes=new Map();let derived=false;
 for(const c of s.charges)for(const t of documentTaxes(c,locale)){
  derived||=Boolean(t.derived);const key=JSON.stringify([c.supplier??'association',t.code,t.name,t.rate]);
  const entry=taxes.get(key)??{name:taxText(t,locale)+(Object.keys(suppliers).length>1?` · ${suppliers[c.supplier??'association']?.name??''}`:''),amount:0};entry.amount+=displayCents(t.amount);taxes.set(key,entry);
 }
 html+=`<section class="billing-document-summary"><dl>${row(tr('Sous-total avant taxes','Subtotal before taxes'),money(s.subtotal))}${[...taxes.values()].map(t=>row(t.name,money(t.amount/100))).join('')}${row(tr('Total des taxes','Total taxes'),money(s.tax_amount))}${row('Total',money(s.total),'billing-document-total')}${row(tr('Paiements à la date d’émission','Payments at issue date'),money(s.received))}${row(Number(s.balance)===0?tr('Acquitté à l’émission','Paid at issue'):tr('Solde à payer à l’émission','Balance due at issue'),money(s.balance),'billing-document-due')}</dl></section>`;
 if(derived)html+=`<p class="billing-document-caption billing-document-tax-note">${tr('Ventilation des taxes historiques; total facturé inchangé.','Historical tax breakdown; original billed total unchanged.')}</p>`;
 html+=s.payments.length?`<h3>${tr('Paiements reçus','Payments received')}</h3><ul class="finance-payments">${s.payments.map(p=>`<li>${esc(paymentDate(p.received_at))} · ${esc(method(p.method))} · <strong>${esc(money(p.amount))}</strong></li>`).join('')}</ul>`:'';
 return html+`<footer class="billing-document-footer"><span>${title} ${esc(document.number??'')} · ${esc(s.account_number)}</span><span>${tr('Conservez ce document pour vos dossiers.','Keep this document for your records.')}</span></footer>`;
}
