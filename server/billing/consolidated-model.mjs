import translations from '../../src/lib/billingDocumentTranslations.json' with {type:'json'};
import {cents} from './pdf.mjs';
export function consolidatedModel(d,locale){
 const s=d.snapshot,t=translations[locale],lc=locale==='fr'?'fr-CA':'en-CA',timeZone=s.context.timezone??'UTC';
 const money=n=>new Intl.NumberFormat(lc,{style:'currency',currency:s.currency}).format(n/100);
 const date=v=>new Intl.DateTimeFormat(lc,{timeZone,dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
 const zone=v=>new Intl.DateTimeFormat(lc,{timeZone,timeZoneName:'short'}).formatToParts(new Date(v)).find(p=>p.type==='timeZoneName').value;
 const dated=v=>`${date(v)} (${zone(v)})`;
 const sum=(xs,key)=>xs.reduce((n,x)=>n+cents(x[key]),0),blocks=[];
 const label=(values,fallback)=>values?.[locale]??fallback;
 for(const c of s.charges)if(!['association','hsp'].includes(c.supplier))throw Error('BILLING_PDF_INVALID_SUPPLIER');
 const amounts={association:0,hsp:0},paid={association:0,hsp:0};
 for(const c of s.charges)amounts[c.supplier]+=cents(c.total);
 const allocate=p=>{const a={association:0,hsp:0};for(const x of p.allocations){const c=s.charges.find(c=>c.id===x.charge_id);if(!c||cents(x.amount)<0)throw Error('BILLING_PDF_INVALID_RECEIPT');a[c.supplier]+=cents(x.amount);}if(a.association+a.hsp!==cents(p.amount))throw Error('BILLING_PDF_INVALID_RECEIPT');return a;};
 for(const p of s.payments){const a=allocate(p);for(const k of Object.keys(a))paid[k]+=a[k];}
 for(const k of Object.keys(paid))if(paid[k]>amounts[k])throw Error('BILLING_PDF_INVALID_RECEIPT');
 const fee=s.charges.find(c=>c.supplier==='hsp'),sponsor=fee?.hsp_fee?.sponsored===true;
 const sponsorText=sponsor?(fee.hsp_fee.sponsorship_level==='show'?t.sponsoredShow:fee.hsp_fee.sponsorship_level==='association'?t.sponsoredAssociation:t.sponsored):'';
 const description=c=>c.supplier==='hsp'?`${sponsor?t.sponsored:t.hspFee} — ${money(cents(c.subtotal))}${sponsor?'':` ${t.plusTax}`}${sponsorText?`\n${sponsorText}`:''}`:label(c.description_i18n,c.description);
 const paymentNumber=p=>p.receipt_number??(d.kind==='receipt'&&p.id===d.payment_id?d.number:t.unavailable);
 const paymentInfo=p=>`${dated(p.received_at)} · ${t[p.method]??p.method}\n${t.receiptNumber} : ${paymentNumber(p)}\n${t.reference} : ${p.reference??t.unavailable}`;
 blocks.push({kind:'summary',label:t.summary,columns:['',t.amount],rows:[[t.total,money(cents(s.total))],[t.paid,money(cents(s.received))],[t.balance,money(cents(s.balance))]]});
 if(d.kind==='receipt'){
  const p=s.receipt_payment??s.payments.find(p=>p.id===d.payment_id);if(!p)throw Error('BILLING_PDF_INVALID_RECEIPT');const a=allocate(p);
  blocks.push({label:t.payment,columns:[t.date,t.amount],rows:[[paymentInfo(p),money(cents(p.amount))],[t.beforePayment,money(cents(s.balance)+cents(p.amount))],[t.afterPayment,money(cents(s.balance))]],boldRows:[0]});
  blocks.push({label:t.allocation,notice:t.allocationNote,columns:[t.description,t.amount],rows:[[t.associationAllocation,money(a.association)],[t.hspAllocation,money(a.hsp)]]});
  if(fee)blocks.push({label:t.hspPosition,notice:sponsorText,columns:[t.description,t.amount],rows:[[t.hspTotal,money(amounts.hsp)],[t.hspPaid,money(paid.hsp)],[t.hspRemaining,money(amounts.hsp-paid.hsp)]]});
 }
 blocks.push({label:t.history,columns:[`${t.date} / ${t.receiptNumber} / ${t.reference}`,t.amount],rows:s.payments.length?s.payments.map(p=>[paymentInfo(p),money(cents(p.amount))]):[[t.noPayments,money(0)]]});
 for(const key of d.kind==='receipt'?[]:['association','hsp']){
  const supplier=s.supplier_invoices[key],i=supplier?.identity,cs=s.charges.filter(c=>c.supplier===key);
  if(!supplier?.fiscal_id||!i)throw Error('BILLING_PDF_INVALID_SUPPLIER');
  const taxTotals=new Map();for(const c of cs)for(const tax of c.taxes){const rate=new Intl.NumberFormat(lc,{maximumFractionDigits:6}).format(tax.rate)+(locale==='fr'?' %':'%');const code=tax.code.toUpperCase();const taxName=/TPS|GST/.test(code)?t.gst:/TVQ|QST/.test(code)?t.qst:label(tax.name_i18n,tax.name);const name=`${taxName}${code.includes('DEMO')?' DEMO':''} (${rate})`;taxTotals.set(name,(taxTotals.get(name)??0)+cents(tax.amount));}
  const title=d.kind==='statement'?(key==='association'?t.associationStatementPortion:t.hspStatementPortion):(key==='association'?t.associationPortion:t.hspPortion);
  const number=`${d.kind==='statement'?(key==='association'?t.associationReference:t.hspReference):(key==='association'?t.associationNumber:t.hspNumber)} : ${supplier.fiscal_id}`;
  const notice=`${t.included}\n${cents(s.balance)===0?t.settled:t.outstanding}`;
  const identity=[[t.legalName,i.billing_name??i.name],[t.tradeName,i.name],[t.address,[i.address,i.address_line2,[i.city,i.state,i.zip_code].filter(Boolean).join(' '),i.country].filter(Boolean).join(', ')],[t.gst,i.tax_number_1??t.unavailable],[t.qst,i.tax_number_2??t.unavailable]].map(([k,v])=>`${k} : ${v}`).join('\n');
  blocks.push({kind:'supplier',supplier:key,label:title,identifier:number,notice,columns:[t.description,t.beforeTax],rows:[[identity,''],...cs.map(c=>[[description(c),c.beneficiary?.display_name,c.horse?.name,label(c.presentation?.block_label_i18n,c.presentation?.block_label),c.presentation?.occurrence_id,`${t.quantity} : ${c.quantity} · ${t.unitPrice} : ${money(cents(c.unit_price))}`].filter(Boolean).join('\n'),money(cents(c.subtotal))])]});
  const rows=[[t.subtotal,money(sum(cs,'subtotal'))],...Array.from(taxTotals,([k,v])=>[k,money(v)]),[t.taxTotal,money(sum(cs,'tax_amount'))],[t.supplierTotal,money(amounts[key])]];
  blocks.push({kind:'supplierTotals',supplier:key,label:title,identifier:number,notice,columns:[t.description,t.amount],rows,boldRows:[rows.length-1]});
 }
 return {blocks,groups:0,title:t[d.kind],continued:t.continued,t,timeZone,issued:dated(s.issued_at??d.created_at),reminder:`${t.included}\n${cents(s.balance)===0?t.accountSettled:t.accountOutstanding}`,consolidation:d.kind==='statement'?t.statementConsolidation:t.consolidation,totals:{association:amounts.association,hsp:amounts.hsp},paid};
}
