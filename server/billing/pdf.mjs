import {readFileSync} from 'node:fs';
import {serverlessBrowser} from '../vet/serverless-browser.mjs';
const logo=readFileSync(new URL('../../public/branding/hsp-logo-aubergine.svg',import.meta.url),'utf8').replace(/<\?xml[^>]*>/g,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cents(v){const n=Number(v),c=Math.round(n*100);if(!Number.isFinite(n)||!Number.isSafeInteger(c)||Math.abs(n*100-c)>0.0001)throw Error('BILLING_PDF_INVALID_AMOUNT');return c;}
const sum=(xs,key)=>xs.reduce((n,x)=>n+cents(x[key]),0);
export function documentModel(d,locale){
 if(!['fr','en'].includes(locale)||!['statement','receipt','invoice'].includes(d.kind))throw Error('BILLING_PDF_INVALID');
 const s=d.snapshot,fr=locale==='fr',money=c=>new Intl.NumberFormat(fr?'fr-CA':'en-CA',{style:'currency',currency:s.currency}).format(c/100),blocks=[];
 const tr=(a,b)=>fr?a:b, taxes=new Map();
 for(const c of s.charges){if(cents(c.subtotal)+cents(c.tax_amount)!==cents(c.total)||sum(c.taxes,'amount')!==cents(c.tax_amount))throw Error('BILLING_PDF_TOTAL_MISMATCH');for(const t of c.taxes){const k=JSON.stringify([t.code,t.name,t.rate,t.jurisdiction]);taxes.set(k,(taxes.get(k)??0)+cents(t.amount));}}
 if(sum(s.charges,'subtotal')!==cents(s.subtotal)||sum(s.charges,'tax_amount')!==cents(s.tax_amount)||sum(s.charges,'total')!==cents(s.total)||sum(s.payments,'amount')!==cents(s.received)||cents(s.total)-cents(s.received)!==cents(s.balance))throw Error('BILLING_PDF_TOTAL_MISMATCH');
 const taxText=c=>c.taxes.map(t=>`${t.name} (${t.rate}%) ${money(cents(t.amount))}`).join(' · ')||(c.exemption_reason?tr('Exemption : ','Exemption: ')+c.exemption_reason:'');
 const description=c=>[c.description,c.beneficiary?.display_name,c.horse?.name,taxText(c)].filter(Boolean).join(' — ');
 const groups=new Map();
 for(const c of s.charges.filter(c=>c.presentation?.section==='entry')){const p=c.presentation;if(!c.horse?.id||!p.block_id||!p.occurrence_id)throw Error('BILLING_PDF_INVALID_GROUP');const k=JSON.stringify([c.horse.id,p.block_id,p.occurrence_id]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(c);}
 let entryTotal=0;
 for(const charges of groups.values()){
  const p=charges[0].presentation,classes=new Map(),rows=[];let entry=0,judge=0;
  for(const c of charges){const p=c.presentation,n=cents(c.subtotal);if(p.fee_kind==='judge_block'){judge+=n;rows.push([tr('Frais de juges du bloc','Block judge fees')+' — '+taxText(c),'',money(n),'']);continue;}
   if(!['entry','judge_class'].includes(p.fee_kind)||!p.class_id)throw Error('BILLING_PDF_INVALID_GROUP');
   if(!classes.has(p.class_id))classes.set(p.class_id,{label:p.class_label,entry:0,judge:0,taxes:[]});const cl=classes.get(p.class_id);cl[p.fee_kind==='entry'?'entry':'judge']+=n;cl.taxes.push(taxText(c));if(p.fee_kind==='entry')entry+=n;else judge+=n;
  }
  const lines=[...classes.values()].map(c=>[c.label+' — '+c.taxes.filter(Boolean).join(' · '),money(c.entry),money(c.judge),'']);lines.push(...rows,[tr('Total du bloc ','Block total ')+p.block_label,money(entry),money(judge),money(entry+judge)]);
  blocks.push({label:`${tr('Inscriptions','Entries')} · ${p.block_label} — ${charges[0].horse.name} · ${p.occurrence_id}`,columns:[tr('Bloc / classe','Block / class'),tr('Inscription','Entry fee'),tr('Frais de juges','Judge fees'),tr('Total du bloc','Block total')],rows:lines,total:entry+judge});entryTotal+=entry+judge;
 }
 if(groups.size)blocks.push({label:tr('Sous-total inscriptions','Entries subtotal'),columns:['',tr('Avant taxes','Before taxes')],rows:[[tr('Inscriptions','Entries'),money(entryTotal)]]});
 for(const section of ['reservation','other']){
  const cs=s.charges.filter(c=>(c.presentation?.section??'other')===section);if(!cs.length)continue;
  blocks.push({label:section==='reservation'?tr('Réservations','Reservations'):tr('Autres achats et services','Other purchases and services'),columns:[tr('Désignation / période','Description / period'),tr('Quantité','Quantity'),tr('Prix unitaire','Unit price'),tr('Avant taxes','Before taxes')],rows:[...cs.map(c=>[[description(c),c.presentation?.period,c.presentation?.duration].filter(Boolean).join(' · '),String(c.quantity),money(cents(c.unit_price)),money(cents(c.subtotal))]),[tr('Sous-total de section','Section subtotal'),'','',money(sum(cs,'subtotal'))]]});
 }
 if(d.kind==='receipt'){
  const p=s.receipt_payment??s.payments.find(p=>p.id===d.payment_id);if(!p||sum(p.allocations,'amount')!==cents(p.amount))throw Error('BILLING_PDF_INVALID_RECEIPT');
  blocks.unshift({label:tr('Paiement concerné et affectations','Payment received and allocations'),columns:[tr('Désignation','Description'),tr('Montant','Amount')],rows:[[`${p.method==='cash'?tr('Comptant','Cash'):p.method==='etransfer'?'Interac':p.method} · ${p.received_at} · ${p.reference??''}`,money(cents(p.amount))],...p.allocations.map(a=>{const c=s.charges.find(c=>c.id===a.charge_id);if(!c)throw Error('BILLING_PDF_INVALID_RECEIPT');return [[description(c),c.presentation?.block_label,c.presentation?.occurrence_id].filter(Boolean).join(' · '),money(cents(a.amount))];})]});
 }
 blocks.push({label:tr('Récapitulatif général','Account summary'),columns:[tr('Situation à la date du document','Position at document date'),s.currency],rows:[[tr('Frais avant taxes','Charges before taxes'),money(cents(s.subtotal))],...[...taxes].map(([k,v])=>{const [,name,rate,jurisdiction]=JSON.parse(k);return [`${name} (${rate}%) · ${jurisdiction}`,money(v)];}),[tr('Total des taxes','Total taxes'),money(cents(s.tax_amount))],[tr('Total du compte','Account total'),money(cents(s.total))],[tr('Paiements reçus à cette date','Payments received at this date'),money(cents(s.received))],[tr('Solde à cette date','Balance at this date'),money(cents(s.balance))]]});
 return {blocks,groups:groups.size,title:d.kind==='invoice'?tr('Facture finale','Final invoice'):d.kind==='receipt'?tr('Reçu de paiement','Payment receipt'):tr('Relevé du compte','Account statement'),continued:tr('suite','continued')};
}
export async function renderDocument(d,locale,{browser:provided}={}){
 const model=documentModel(d,locale),s=d.snapshot,fr=locale==='fr',browser=provided??await serverlessBrowser.launch();let page;
 try{
  page=await browser.newPage({javaScriptEnabled:false});await page.route('**/*',r=>r.abort());
  const identity=p=>[p.billing_name??p.name??[p.first_name,p.middle_name,p.last_name].filter(Boolean).join(' '),p.company_name,p.address,p.address_line2,[p.city,p.state,p.zip_code].filter(Boolean).join(' '),p.country,p.email,p.phone,p.tax_number_1,p.tax_number_2].filter(Boolean).map(esc).join('<br>');
  const header=`<header><div class="logo">${logo}</div><div><h1>${esc(model.title)} ${d.kind==='statement'?'':esc(d.number)}</h1><div>${esc(fr?s.context.name_fr:s.context.name_en)} · ${esc(s.context.financial_year??'')} · ${esc(s.currency)}</div><div>${fr?'No de compte':'Account no.'} : ${esc(s.account_number)}</div><div>${esc(new Date(s.issued_at??d.created_at).toLocaleString(fr?'fr-CA':'en-CA',{timeZone:'UTC'}))} UTC</div></div></header><div class="demo">DÉMONSTRATION — sans valeur comptable ou fiscale${fr?'':' / DEMONSTRATION — no accounting or tax validity'}</div>`;
  await page.setContent(`<!doctype html><html lang="${locale}"><meta charset="utf-8"><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#222;font:10px Arial,sans-serif}.page{height:272mm;display:flex;flex-direction:column;break-after:page}.page:last-child{break-after:auto}header{display:flex;gap:20px;align-items:center}h1{font-size:19px;margin:0 0 7px;color:#653C59}.logo{width:85px;flex-shrink:0}.logo svg{width:100%;height:auto}.demo{font-size:9px;font-weight:bold;background:#f4edf2;padding:7px;margin:10px 0}.body{flex:1;overflow:hidden}.identity{display:flex;gap:25px;padding:8px 0 16px;line-height:1.45}.identity>div{width:50%}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 12px}th,td{padding:7px 5px;vertical-align:top;border-bottom:1px solid #ddd;overflow-wrap:anywhere;white-space:pre-line}th{background:#f4edf2;text-align:left;color:#653C59}.group th{background:white;font-size:12px;padding-top:12px}td:not(:first-child),thead tr:last-child th:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}tbody tr.total{font-weight:bold}footer{padding:8px 0;font-size:9px;border-top:1px solid #ccc;display:flex;justify-content:space-between}</style><body></body></html>`);
  await page.evaluate(({header,identity,blocks,continued,account})=>{
   let body,table,tb;const pages=[];
   function newPage(first=false){const p=document.createElement('section');p.className='page';p.innerHTML=header+'<div class="body"></div><footer></footer>';document.body.append(p);body=p.querySelector('.body');if(first)body.innerHTML=identity;pages.push(p);}
   function newTable(block,continuation){table=document.createElement('table');const cg=document.createElement('colgroup');block.columns.forEach((_,i)=>{const c=document.createElement('col');c.style.width=(i===0?55:45/(block.columns.length-1))+'%';cg.append(c);});table.append(cg);const head=table.createTHead();let row=head.insertRow();row.className='group';let th=document.createElement('th');th.colSpan=block.columns.length;th.textContent=block.label+(continuation?' — '+continued:'');row.append(th);row=head.insertRow();block.columns.forEach(v=>{const th=document.createElement('th');th.textContent=v;row.append(th);});tb=table.createTBody();body.append(table);}
   newPage(true);
   for(const b of blocks){newTable(b,false);b.rows.forEach((values,i)=>{let row=tb.insertRow();if(i===b.rows.length-1)row.className="total";values.forEach(v=>row.insertCell().textContent=v);if(body.scrollHeight>body.clientHeight){row.remove();if(!tb.rows.length)table.remove();newPage();newTable(b,i>0);row=tb.insertRow();if(i===b.rows.length-1)row.className="total";values.forEach(v=>row.insertCell().textContent=v);if(body.scrollHeight>body.clientHeight)throw Error('BILLING_PDF_ROW_TOO_LARGE');}});}
   pages.forEach((p,i)=>{const f=p.querySelector('footer');const a=document.createElement('span');a.textContent=account;const b=document.createElement('span');b.textContent=`${i+1} / ${pages.length}`;f.append(a,b);});
  },{header,identity:`<div class="identity"><div>${identity(s.seller)}</div><div>${identity(s.payer)}</div></div>`,blocks:model.blocks,continued:model.continued,account:s.account_number});
  return await page.pdf({preferCSSPageSize:true,printBackground:true});
 }finally{await page?.close();if(!provided)await browser.close();}
}
