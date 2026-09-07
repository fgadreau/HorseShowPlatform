import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {fixture} from './pdf-fixtures.mjs';import {entryGroups} from '../../src/features/finance/entryGroups.mjs';import {documentModel,renderDocument} from '../../server/billing/pdf.mjs';import {serverlessBrowser} from '../../server/vet/serverless-browser.mjs';import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';import {assertPDFRows,assertPDFGroupHeaders} from './pdf-row-coverage.mjs';
const norm=s=>s.normalize('NFKC').replace(/\s+/gu,'');
export async function assertKeptTotals(bytes,model){
 const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;try{
  const pages=[];for(let i=1;i<=pdf.numPages;i++)pages.push(norm((await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ')));
  const labels=[...new Set(model.blocks.map(b=>norm(b.label)))];
  const segments=(p,label)=>{const parts=[];for(let start=p.indexOf(label);start>=0;start=p.indexOf(label,start+label.length)){const end=Math.min(p.length,...labels.map(l=>p.indexOf(l,start+label.length)).filter(i=>i>=0));parts.push(p.slice(start,end));}return parts;};
  for(const label of new Set(model.blocks.filter(b=>b.bib).map(b=>norm(b.label)))){
   const candidates=model.blocks.filter(b=>norm(b.label)===label).flatMap(b=>b.rows.map(r=>norm(r.join(' '))));
   for(const p of pages)for(const part of segments(p,label))assert(candidates.some(r=>part.includes(r)),'Orphan bib/block heading');
  }
  let blocks=0,bibs=0;for(const b of model.blocks.filter(b=>b.keepTail)){
   const tail=b.rows.slice(-b.keepTail).map(r=>norm(r.join(' ')));
   assert(pages.some(p=>segments(p,norm(b.label)).some(part=>tail.every(t=>part.includes(t)))),'Isolated block/bib total: '+b.label);
   assert.equal(b.rowKinds.at(-b.keepTail),'class-detail');assert.equal(b.rowKinds.at(-1),b.endsBib?'bib-total':'block-total');blocks++;if(b.endsBib)bibs++;
  }return {keptBlockTails:blocks,keptBibTails:bibs};
 }finally{await pdf.destroy();}
}
if(process.argv[1]?.endsWith('totals-pagination.test.mjs')){
 const browser=await serverlessBrowser.launch(),results={complete:false,syntheticSnapshots:true,realChromium:true,exactMultiplicity:true,cases:[]};
 try{
 for(const locale of ['fr','en']){
  const source=JSON.parse(readFileSync('scripts/billing/fixtures/invoice-totals-page-break.json')),oldModel=documentModel(source,locale);
  for(const b of oldModel.blocks.filter(b=>b.bib)){b.keepTail=2;b.rowKinds=b.rows.map((_,i)=>i===b.rows.length-1?'block-total':'class-detail');}
  await assert.rejects(assertKeptTotals(readFileSync(`docs/audits/billing/review-render-v4/main-invoice-DEMO-INV-000009-${locale}.pdf`),oldModel),/Isolated block/);
  const d=structuredClone(source);d.snapshot.render_version=5;d.snapshot.presentation_version=5;const model=documentModel(d,locale),bytes=await renderDocument(d,locale,{browser});
  results.cases.push({locale,historicalRegression:true,...await assertPDFRows(bytes,model,{exact:true}),...await assertKeptTotals(bytes,model),...await assertPDFGroupHeaders(bytes,model)});
 }
 for(const locale of ['fr','en'])for(const kind of ['invoice','receipt'])for(const extra of [0,1,3,7,12,17,24,40]){
  const d=fixture(kind,false);d.snapshot.render_version=5;d.snapshot.presentation_version=5;d.snapshot.payments.forEach(p=>p.receipt_number='DEMO-TEST-RECEIPT');
  for(const c of d.snapshot.charges.filter(c=>c.presentation?.section==='entry'))c.entry_identity={version:1,organization_id:'org',show_id:'show',entry_id:c.id,assignment_id:c.horse.id,policy:'horse',number:c.horse.id==='horse-a'?941:942,horse:c.horse};
  for(let i=0;i<extra;i++){const c=structuredClone(d.snapshot.charges[0]);c.id='boundary-'+i;c.description='Boundary detail '+i;c.presentation.class_id='boundary-'+i;c.presentation.class_label='Boundary class '+i;c.unit_price=c.subtotal=c.tax_amount=c.total=0;c.taxes=[];c.exemption_reason='DEMO free';d.snapshot.charges.push(c);}
  const before=JSON.stringify(d),groups=entryGroups(d.snapshot.charges),model=documentModel(d,locale),bytes=await renderDocument(d,locale,{browser});assert.equal(JSON.stringify(d),before);assert.equal(model.blocks.filter(b=>b.endsBib).length,groups.length);
  results.cases.push({locale,kind,extra,...await assertPDFRows(bytes,model,{exact:true}),...await assertKeptTotals(bytes,model),...await assertPDFGroupHeaders(bytes,model)});
 }results.complete=true;}finally{await browser.close();writeFileSync('.tmp/review-v5/pagination-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}
}
