import {documentModel} from './pdf-v2.mjs';
import {readFileSync} from 'node:fs';
import {serverlessBrowser} from '../vet/serverless-browser.mjs';
const logo=readFileSync(new URL('../../public/branding/hsp-logo-aubergine.svg',import.meta.url),'utf8').replace(/<\?xml[^>]*>/g,'');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function renderDocument(d,locale,{browser:provided}={}){
 if(d.snapshot.render_version!==3)throw Error('BILLING_PDF_RENDER_VERSION');
 const model=documentModel({...d,snapshot:{...d.snapshot,render_version:2}},locale),s=d.snapshot,fr=locale==='fr',browser=provided??await serverlessBrowser.launch();let page;
 try{
  page=await browser.newPage({javaScriptEnabled:false});await page.route('**/*',r=>r.abort());
  // Measure with print media and an explicit A4 content width (210 - 24 mm).
  // The browser viewport is wider than the PDF and otherwise underestimates wrapping.
  await page.emulateMedia({media:'print'});
  const identity=p=>[p.billing_name??p.name??[p.first_name,p.middle_name,p.last_name].filter(Boolean).join(' '),p.company_name,p.address,p.address_line2,[p.city,p.state,p.zip_code].filter(Boolean).join(' '),p.country,p.email,p.phone,...[p.tax_number_1,p.tax_number_2].filter(Boolean).map(v=>(fr?'Identifiant fiscal : ':'Tax identifier: ')+v)].filter(Boolean).map(esc).join('<br>');
  const header=`<header><div class="logo">${logo}</div><div><h1>${esc(model.title)} ${d.kind==='statement'?'':esc(d.number)}</h1><div>${esc(fr?s.context.name_fr:s.context.name_en)} · ${esc(s.context.financial_year??'')} · ${esc(s.currency)}</div><div>${fr?'No de compte':'Account no.'} : ${esc(s.account_number)}</div><div>${esc(new Date(s.issued_at??d.created_at).toLocaleString(fr?'fr-CA':'en-CA',{timeZone:'UTC'}))} UTC</div></div></header><div class="demo">DÉMONSTRATION — sans valeur comptable ou fiscale${fr?'':' / DEMONSTRATION — no accounting or tax validity'}</div>`;
  await page.setContent(`<!doctype html><html lang="${locale}"><meta charset="utf-8"><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;color:#222;font:10px Arial,sans-serif}.page{width:186mm;height:272mm;display:flex;flex-direction:column;break-after:page}.page:last-child{break-after:auto}header{flex-shrink:0;display:flex;gap:20px;align-items:center}h1{font-size:19px;margin:0 0 7px;color:#653C59}.logo{width:85px;flex-shrink:0}.logo svg{width:100%;height:auto}.demo{flex-shrink:0;font-size:9px;font-weight:bold;background:#f4edf2;padding:7px;margin:10px 0}.body{flex:1;min-height:0;overflow:hidden}.identity{display:flex;gap:25px;padding:8px 0 16px;line-height:1.45}.identity>div{width:50%}table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 12px}th,td{padding:7px 5px;vertical-align:top;border-bottom:1px solid #ddd;overflow-wrap:anywhere;white-space:pre-line}th{background:#f4edf2;text-align:left;color:#653C59}.group th{background:white;font-size:12px;padding-top:12px}td:not(:first-child),thead tr:last-child th:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}tbody tr.total{font-weight:bold}footer{height:9mm;flex:0 0 9mm;white-space:nowrap;padding:8px 0;font-size:9px;border-top:1px solid #ccc;display:flex;justify-content:space-between}</style><body></body></html>`);
  await page.evaluate(({header,identity,blocks,continued,account,renderLabel})=>{
   let body,table,tb;const pages=[];
   function newPage(first=false){const p=document.createElement('section');p.className='page';p.innerHTML=header+'<div class="body"></div><footer><span></span><span></span></footer>';const spans=p.querySelectorAll('footer span');spans[0].textContent=account+' · '+renderLabel;spans[1].textContent='0000 / 0000';document.body.append(p);body=p.querySelector('.body');if(first)body.innerHTML=identity;pages.push(p);}
   function newTable(block,continuation){table=document.createElement('table');const cg=document.createElement('colgroup');block.columns.forEach((_,i)=>{const c=document.createElement('col');c.style.width=(i===0?55:45/(block.columns.length-1))+'%';cg.append(c);});table.append(cg);const head=table.createTHead();let row=head.insertRow();row.className='group';let th=document.createElement('th');th.colSpan=block.columns.length;th.textContent=block.label+(continuation?' — '+continued:'');row.append(th);row=head.insertRow();block.columns.forEach(v=>{const th=document.createElement('th');th.textContent=v;row.append(th);});tb=table.createTBody();body.append(table);}
   // Reserve the complete footer before measuring rows. Adding its text after
   // pagination used to shrink the body and clip the final row of a page.
   newPage(true);
   for(const b of blocks){newTable(b,false);b.rows.forEach((values,i)=>{let row=tb.insertRow();if(b.receipt?i===0:i===b.rows.length-1)row.className="total";values.forEach(v=>row.insertCell().textContent=v);if(body.scrollHeight>body.clientHeight){row.remove();if(!tb.rows.length)table.remove();newPage();newTable(b,i>0);row=tb.insertRow();if(b.receipt?i===0:i===b.rows.length-1)row.className="total";values.forEach(v=>row.insertCell().textContent=v);if(body.scrollHeight>body.clientHeight)throw Error('BILLING_PDF_ROW_TOO_LARGE');}});}
   pages.forEach((p,i)=>{p.querySelector('footer span:last-child').textContent=`${i+1} / ${pages.length}`;});
   // Fail publication rather than silently clipping any row after final layout.
   const rows=[...document.querySelectorAll('tbody tr')];
   if(rows.length!==blocks.reduce((n,b)=>n+b.rows.length,0))throw Error('BILLING_PDF_MISSING_ROW');
   for(const row of rows){const r=row.getBoundingClientRect(),area=row.closest('.body').getBoundingClientRect();if(r.top<area.top-.25||r.bottom>area.bottom+.25)throw Error('BILLING_PDF_CLIPPED_ROW');}
  },{header,identity:`<div class="identity"><div><strong>${fr?'Fournisseur — association':'Supplier — association'}</strong><br>${identity(s.suppliers?.association??s.seller)}</div><div><strong>${fr?'Payeur':'Payer'}</strong><br>${identity(s.payer)}</div></div>${s.suppliers?.hsp?`<div class="identity"><div><strong>${fr?'Fournisseur — service HSP':'Supplier — HSP service'}</strong><br>${identity(s.suppliers.hsp)}</div><div>${fr?'Facturé et encaissé par l’association comme mandataire':'Billed and collected by the association as agent'}</div></div>`:''}`,blocks:model.blocks,continued:model.continued,account:s.account_number,renderLabel:fr?'Rendu 3':'Render 3'});
  return await page.pdf({preferCSSPageSize:true,printBackground:true});
 }finally{await page?.close();if(!provided)await browser.close();}
}
