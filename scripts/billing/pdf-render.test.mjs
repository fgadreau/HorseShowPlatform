import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {serverlessBrowser} from '../../server/vet/serverless-browser.mjs';
import {documentModel,renderDocument} from '../../server/billing/pdf.mjs';
import {fixture} from './pdf-fixtures.mjs';
mkdirSync('.tmp/billing-pdf',{recursive:true});const result={complete:false,documents:[],checks:0};writeFileSync('.tmp/billing-pdf/results.json',JSON.stringify(result));
const browser=await serverlessBrowser.launch();
try{
 for(const kind of ['statement','receipt','invoice'])for(const locale of ['fr','en']){
  const d=fixture(kind),before=JSON.stringify(d),model=documentModel(d,locale);assert.equal(model.blocks[0+(kind==='receipt'?1:0)].total,27000);result.checks++;
  const bytes=await renderDocument(d,locale,{browser});assert.equal(JSON.stringify(d),before);result.checks++;
  const path=`.tmp/billing-pdf/${kind}-${locale}.pdf`;writeFileSync(path,bytes);const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;let all='';
  for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n),text=(await p.getTextContent()).items.map(x=>x.str).join(' ');all+=text+'\n';assert(text.includes('DÉMONSTRATION — sans valeur comptable ou fiscale'));assert(text.includes(d.snapshot.account_number));result.checks+=2;
   if(n===1||n===2||n===pdf.numPages){const v=p.getViewport({scale:1.25}),canvas=pdf.canvasFactory.create(v.width,v.height);await p.render({canvasContext:canvas.context,viewport:v}).promise;writeFileSync(`.tmp/billing-pdf/${kind}-${locale}-${n}.png`,canvas.canvas.toBuffer('image/png'));pdf.canvasFactory.destroy(canvas);}
  }
  assert(all.includes('Great Holly Whiz')&&all.includes('Demo Silver Star'));assert(all.includes('SESSION-B'));assert(all.includes('Taxe fictive'));if(kind==='statement')assert(!all.includes('DEMO-INV'));else assert(all.includes(d.number));result.checks+=4;
  if(kind==='invoice'){assert(pdf.numPages>=3);assert(all.includes(locale==='fr'?'suite':'continued'));result.checks+=2;}
  result.documents.push({kind,locale,path,bytes:bytes.length,pages:pdf.numPages});await pdf.destroy();
 }
 const bad=fixture();bad.snapshot.total++;assert.throws(()=>documentModel(bad,'fr'),/TOTAL_MISMATCH/);result.checks++;
 const legacy=fixture('statement');delete legacy.snapshot.charges[0].presentation;assert.doesNotThrow(()=>documentModel(legacy,'fr'));result.checks++;
 result.complete=true;console.log(JSON.stringify(result));
}finally{await browser.close();writeFileSync('.tmp/billing-pdf/results.json',JSON.stringify(result,null,2));}
