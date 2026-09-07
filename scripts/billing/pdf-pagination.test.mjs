// Real Chromium and PDF extraction; synthetic variants of an immutable demo receipt.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {serverlessBrowser} from '../../server/vet/serverless-browser.mjs';
import {documentModel,renderDocument} from '../../server/billing/pdf.mjs';
import {fixture} from './pdf-fixtures.mjs';
import {assertPDFRows} from './pdf-row-coverage.mjs';
const dir='.tmp/review-v3',source=JSON.parse(readFileSync('scripts/billing/fixtures/receipt-page-break.json'));
const before=JSON.stringify(source),browser=await serverlessBrowser.launch(),result={complete:false,realChromium:true,syntheticVariants:true,historicalFailures:[],cases:[]};
try{
 for(const locale of ['fr','en']){
  const historical=readFileSync(`docs/audits/billing/review-20260907/receipt-DEMO-RCPT-000015-${locale}.pdf`);
  await assert.rejects(assertPDFRows(historical,documentModel(source,locale)),/Stalle|StalleSimulée|Stallesimulée/i);result.historicalFailures.push(locale+': historical stall row absent');
  const d=structuredClone(source);d.snapshot.render_version=3;
  // Exercise the exact break, nearby breaks and long multi-page tables.
  for(const extra of [0,1,5,17,45]){
   const x=structuredClone(d),s=x.snapshot;
   for(let i=0;i<extra;i++)s.charges.push({id:'zero-row-'+i,supplier:'association',description:`ROW-${String(i).padStart(3,'0')} — pagination coverage`,quantity:1,unit_price:0,subtotal:0,tax_amount:0,total:0,taxes:[],exemption_reason:'DÉMO gratuit / Demo free',presentation:{section:'reservation',reservation_id:'row-'+i}});
   const bytes=await renderDocument(x,locale,{browser}),coverage=await assertPDFRows(bytes,documentModel(x,locale));
   result.cases.push({locale,extra,...coverage});if(extra===0)writeFileSync(`${dir}/regression-synthetic-${locale}.pdf`,bytes);
  }
  for(const kind of ['statement','invoice']){const d=fixture(kind);d.snapshot.render_version=3;d.snapshot.payments.forEach(p=>p.receipt_number='DEMO-RECEIPT');const bytes=await renderDocument(d,locale,{browser});result.cases.push({locale,kind,...await assertPDFRows(bytes,documentModel(d,locale))});}
 }
 assert.equal(JSON.stringify(source),before);result.complete=true;
}finally{await browser.close();writeFileSync(dir+'/pagination-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
