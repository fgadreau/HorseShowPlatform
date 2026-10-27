// Actual account/document components, synthetic financial data, no remote services.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium,expect} from '@playwright/test';
import executable from '@sparticuz/chromium';
import {renderInvoicePdf} from '../../server/billing/invoice-pdf.mjs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const output='.tmp/billing-document-review';
const plugin={name:'invoice-fixture',enforce:'pre',load(id){if(id.endsWith('/src/lib/supabase.ts'))return 'export function requireSupabase(){return window.fakeSupabase;}';},configureServer(server){server.middlewares.use('/invoice-test',async(req,res,next)=>{try{
 const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" class="finance"></main><script type="module">
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import {AccountDetail} from '/src/features/finance/AccountDetail.tsx';import '/src/features/finance/finance.css';
 const locale=new URLSearchParams(location.search).get('lang')||'fr';window.calls=[];const saved=JSON.parse(sessionStorage.getItem('invoice-fixture-'+locale)||'null');let version=saved?.version??1,closed=saved?.closed??false;const documents=saved?.documents??[],payments=saved?.payments??[];
 const suppliers={association:{name:'Association équestre — TEST',address:'100, rue du Concours',city:'Québec',state:'QC',zip_code:'G1A 0A2',tax_name_1:'TPS',tax_number_1:'DEMO-ASSO-TPS-NON-VALIDE',tax_name_2:'TVQ',tax_number_2:'DEMO-ASSO-TVQ-NON-VALIDE'},hsp:{name:'Horse Show Platform — TEST',address:'200, rue du Service',tax_name_1:'TPS',tax_number_1:'DEMO-HSP-TPS-NON-VALIDE',tax_name_2:'TVQ',tax_number_2:'DEMO-HSP-TVQ-NON-VALIDE'}};
 const lines=[['Box écurie régulière',1,200,29.95],['Ripe / shavings',6,9.5,8.54],['Tack écurie régulière',1,66.67,9.98],['Foin / hay',1,44,6.59],['Frais de service HSP',1,5,.75]];
 const charges=lines.map(([description,quantity,unit_price,tax],i)=>({id:'charge-'+i,supplier:i===4?'hsp':'association',category:i===4?'hsp_service':'reservation',description,quantity,unit_price,subtotal:Math.round(quantity*unit_price*100)/100,tax_amount:tax,total:Math.round((quantity*unit_price+tax)*100)/100,beneficiary:{display_name:'Client de test'},horse:i===4?null:{name:'Cheval de test'},presentation:{section:i===4?'other':'reservation',period:'2026-11-05 — 2026-11-08'},taxes:[{name:'TPS + TVQ',code:'COMBINED',rate:14.975,amount:tax}]}));
 function snapshot(){return {folio_id:'folio-test',account_number:'CP2026-A-000006',currency:'CAD',context:{id:'context-test',name_fr:'Concours Pilote 2026',name_en:'Pilot Show 2026',financial_year:2026,timezone:'America/Toronto'},payer:{first_name:'Client',last_name:'de test',address:'300, rue du Membre',city:'Lévis',state:'QC'},seller:suppliers.association,suppliers,charges:structuredClone(charges),payments:structuredClone(payments),subtotal:372.67,tax_amount:55.81,total:428.48,received:Math.round(payments.reduce((n,p)=>n+p.amount,0)*100)/100,balance:Math.round((428.48-payments.reduce((n,p)=>n+p.amount,0))*100)/100};}
 function doc(kind){const d={id:'doc-'+documents.length,kind,number:kind==='invoice'?'CP2026-F-000001':kind==='receipt'?'CP2026-R-'+documents.length:null,created_at:'2026-10-27T02:00:00Z',snapshot:{...snapshot(),issued_at:'2026-10-27T02:00:00Z',...(kind==='receipt'?{receipt_payment:payments.at(-1)}:{})}};documents.push(d);return d;}
 window.fakeSupabase={auth:{getSession:async()=>({data:{session:{access_token:'synthetic'}}})},rpc:async(name,args)=>{window.calls.push({name,args});let data;if(name==='billing_ui_detail'){const s=snapshot();data={...s,state:closed?'closed':'open',documents,stripe:{available:s.balance,reserved:0,attempt:null},checkout:{version,ready:false,reasons:[]},actions:{sale:false,payment:true,attest:false,finalize:!closed}};}else if(name==='billing_ui_catalog')data={products:[]};else if(name==='get_billing_statement'){const document=doc('statement');data={document,document_id:document.id,version};}else if(name==='finalize_billing_folio'){if(args.p_version!==version)throw Error('BILLING_STALE_VERSION');closed=true;version++;data={document:doc('invoice')};}else if(name==='record_billing_payment'){if(args.p_payment.version!==version)throw Error('BILLING_STALE_VERSION');payments.push({id:'payment-'+payments.length,...args.p_payment});version++;data={document:doc('receipt')};}else throw Error('Unexpected RPC '+name);sessionStorage.setItem('invoice-fixture-'+locale,JSON.stringify({version,closed,documents,payments}));return {data:structuredClone(data),error:null};}};
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AccountDetail,{folio:'folio-test',personal:false,identity:'fixture-staff',locale}));
 </script></body></html>`;res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/invoice-test',html));
 }catch(e){next(e);}});}};
const server=await createServer({configFile:false,envDir:false,plugins:[plugin,react()],server:{host:'127.0.0.1',port:5198,strictPort:true}});
let browser;
try{
 await mkdir(output,{recursive:true});await server.listen();
 browser=await chromium.launch(process.platform==='linux'?{executablePath:await executable.executablePath(),args:executable.args.filter(a=>a!=='--single-process'),headless:true}:{channel:'chrome',headless:true});
 const context=await browser.newContext();await context.addInitScript(()=>{window.print=()=>{window.printRequested=true;};});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await context.route('**/api/billing-documents/**',route=>route.fulfill({json:{state:'unavailable'}}));
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/api/billing-pdf',async route=>{const body=route.request().postDataJSON();const doc=await page.evaluate(({id,lang})=>JSON.parse(sessionStorage.getItem('invoice-fixture-'+lang)).documents.find(d=>d.id===id),{id:body.documentId,lang:body.locale});const bytes=await renderInvoicePdf(doc,body.locale,{browser:{launch:()=>browser.newContext()}});await route.fulfill({contentType:'application/pdf',body:bytes});});
 for(const locale of ['fr','en']){
  await page.goto('http://127.0.0.1:5198/invoice-test?lang='+locale);const fr=locale==='fr';
  async function verifyReceipt(stage,before,amount,after){
   const receipt=page.locator('.billing-document');const summary=receipt.locator('.billing-receipt-summary');
   const money=n=>new Intl.NumberFormat(fr?'fr-CA':'en-CA',{style:'currency',currency:'CAD'}).format(n);
   await expect(summary).toContainText(money(before));await expect(summary).toContainText(money(amount));await expect(summary).toContainText(money(after));assert.equal(await receipt.locator('.finance-charge-groups').count(),1);
   await expect(receipt.locator('.billing-receipt-status')).toContainText(after?(fr?'Compte partiellement payé':'Account partially paid'):(fr?'Compte acquitté':'Account paid in full'));
   const sent=await page.evaluate(()=>window.calls.filter(c=>c.name==='record_billing_payment').at(-1).args.p_payment);
   assert.equal(Math.round(sent.allocations.reduce((n,a)=>n+a.amount,0)*100),Math.round(amount*100),'Internal allocation command still covers the full payment');
   const saved=await page.evaluate(lang=>JSON.parse(sessionStorage.getItem('invoice-fixture-'+lang)).documents.filter(d=>d.kind==='receipt').at(-1).snapshot.receipt_payment,locale);assert.deepEqual(saved.allocations,sent.allocations,'Saved allocations remain intact');
   const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:fr?'Télécharger le PDF':'Download PDF',exact:true}).click();const receiptPath=output+'/receipt-'+stage+'-'+locale+'.pdf';await(await downloaded).saveAs(receiptPath);
   const bytes=await(await import('node:fs/promises')).readFile(receiptPath),pdf=await getDocument({data:new Uint8Array(bytes)}).promise;assert(pdf.numPages>=1);let text='';for(let i=1;i<=pdf.numPages;i++)text+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ');
   assert(!text.includes('about:blank'));assert(text.includes('Box écurie régulière'));assert(text.includes('Ripe / shavings'));assert(text.includes('Tack écurie régulière'));assert(text.includes('Foin / hay'));assert(text.includes(fr?'Frais de service HSP':'HSP service fee'));assert(!text.includes('Allocations of this payment'));assert(!text.includes('Affectations de ce paiement'));assert(text.includes(fr?'Solde avant ce paiement':'Balance before this payment'));assert(text.includes(fr?'Solde restant après ce paiement':'Balance remaining after this payment'));
  }
  await page.getByRole('button',{name:fr?'Émettre une facture':'Issue an invoice',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('heading',{name:fr?'Aperçu de la facture':'Invoice preview',exact:true})).toBeVisible();
  assert.equal(await page.getByRole('dialog').getByRole('button',{name:/PDF/}).count(),0,'Unissued preview cannot be exported as an invoice');
  await page.getByRole('button',{name:fr?'Confirmer et émettre la facture':'Confirm and issue invoice',exact:true}).click();
  const invoice=page.locator('.billing-document');await expect(invoice.getByRole('heading',{name:fr?'Facture':'Invoice',exact:true})).toBeVisible();
  await expect(invoice.locator('.billing-document-number')).toHaveText('CP2026-F-000001');
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='record_billing_payment').length),0,'Invoice issued before any payment');
  await expect(invoice.locator('.billing-document-due')).toContainText('428');
  await expect(invoice.locator('.billing-document-tax-ids').first()).toContainText('No'+(fr?'':' .').trim());
  assert.equal(await invoice.locator('.billing-document-tax-ids dd').count(),4,'Separate registration number for each supplier and tax');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:fr?'Télécharger le PDF':'Download PDF',exact:true}).click();const download=await downloadPromise;
  const pdfPath=output+'/invoice-'+locale+'.pdf';await download.saveAs(pdfPath);
  const bytes=await (await import('node:fs/promises')).readFile(pdfPath);const pdf=await getDocument({data:new Uint8Array(bytes)}).promise;
  let pdfText='';for(let i=1;i<=pdf.numPages;i++)pdfText+=(await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ');
  assert(!pdfText.includes('about:blank'));assert(!/14[.,]975/.test(pdfText));assert(pdfText.includes('9,975')||pdfText.includes('9.975'));assert(!pdfText.includes('DEMO-ASSO-TPS-NON-VALIDE'));assert.equal(await invoice.locator('button').count(),0);
  await invoice.screenshot({path:output+'/invoice-'+locale+'.png'});
  await page.getByLabel(fr?'Montant partiel ou solde':'Partial amount or balance').fill('100');
  await page.getByRole('button',{name:fr?'Confirmer le paiement reçu':'Confirm received payment',exact:true}).click();
  await expect(page.locator('.billing-document').getByRole('heading',{name:fr?'Reçu de paiement':'Payment receipt',exact:true})).toBeVisible();
  await verifyReceipt('partial',428.48,100,328.48);
  await page.getByRole('button',{name:/CP2026-F-000001/}).click();await expect(page.locator('.billing-document-due')).toContainText('428');
  await page.getByLabel(fr?'Montant partiel ou solde':'Partial amount or balance').fill('328.48');
  await page.getByRole('button',{name:fr?'Confirmer le paiement reçu':'Confirm received payment',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:fr?'Payé intégralement':'Paid in full'})).toBeVisible();
  await verifyReceipt('full',328.48,328.48,0);
  assert.equal(await page.evaluate(()=>window.calls.filter(c=>c.name==='finalize_billing_folio').length),1);
  await page.reload();await expect(page.locator('.billing-document-number')).toHaveText('CP2026-F-000001');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:output+'/mobile-'+locale+'.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1280,height:900});
 }
 const longDocument=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('invoice-fixture-en')).documents.find(d=>d.kind==='invoice'));
 longDocument.number='LONG-INV-001';const source=longDocument.snapshot.charges[0];longDocument.snapshot.charges=Array.from({length:45},(_,i)=>({...source,id:'long-'+i,description:'Longline_'+String(i).padStart(3,'0')}));
 Object.assign(longDocument.snapshot,{subtotal:9000,tax_amount:1347.75,total:10347.75,received:0,balance:10347.75,payments:[]});
 const longBytes=await renderInvoicePdf(longDocument,'en',{browser:{launch:()=>browser.newContext()}});await writeFile(output+'/long-invoice.pdf',longBytes);
 const longPdf=await getDocument({data:new Uint8Array(longBytes)}).promise;assert(longPdf.numPages>1);let longText='';for(let i=1;i<=longPdf.numPages;i++)longText+=(await(await longPdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ');
 for(let i=0;i<45;i++)assert(longText.includes('Longline_'+String(i).padStart(3,'0')),'Every line survives pagination');
 assert(!longText.includes('about:blank'));assert.deepEqual(errors,[]);console.log('PASS: numbered invoice, separate taxes, direct PDF download, secure shared renderer, immutable invoice, partial/full offline payments, FR/EN, mobile and long-document pagination');
}finally{await browser?.close();await server.close();}
