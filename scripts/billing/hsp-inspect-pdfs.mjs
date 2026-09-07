import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {documentModel} from '../../server/billing/pdf.mjs';
const files=JSON.parse(readFileSync('.tmp/hsp-direct/documents-result.json')).files;
const docs=JSON.parse(readFileSync('.tmp/hsp-direct/integrated.json')).latest.documents;
const result={complete:false,files:[],checks:0};
try{for(const f of files){const d=docs.find(d=>d.id===f.document);assert(d);const m=documentModel(d,f.locale);result.checks++;
 const pdf=await getDocument({data:new Uint8Array(readFileSync(f.path)),useSystemFonts:true}).promise;let text='';
 for(let n=1;n<=pdf.numPages;n++){const p=await pdf.getPage(n),t=(await p.getTextContent()).items.map(x=>x.str).join(' ');assert(t.includes('DÉMONSTRATION — sans valeur comptable ou fiscale'));assert(t.includes('DEMO-ACC-000001'));result.checks+=2;text+=t+'\n';const v=p.getViewport({scale:1.2}),canvas=pdf.canvasFactory.create(v.width,v.height);await p.render({canvasContext:canvas.context,viewport:v}).promise;writeFileSync(f.path.replace('.pdf',`-${n}.png`),canvas.canvas.toBuffer('image/png'));pdf.canvasFactory.destroy(canvas);}
 assert(text.includes('Great Holly Whiz')&&text.includes('Demo Silver Star'));assert(text.includes('Stalle simulée')&&text.includes('Casquette fictive'));assert(text.includes('Taxe fictive'));assert(text.includes('DEMO-ASSO-TAX')&&text.includes('DEMO-HSP-TAX'));result.checks+=4;
 if(d.kind==='invoice'){assert.equal(d.snapshot.total,509.25);assert.equal(d.snapshot.received,509.25);assert.equal(d.snapshot.balance,0);assert.equal(d.snapshot.payments.length,2);assert.equal(d.snapshot.charges.length,9);assert(text.includes('DEMO-INV-000001'));result.checks+=6;}
 if(d.kind==='statement'){assert(!text.includes('DEMO-INV'));result.checks++;}
 result.files.push({...f,pages:pdf.numPages});await pdf.destroy();
 }result.complete=true;console.log(JSON.stringify({complete:true,files:result.files.length,checks:result.checks}));}finally{writeFileSync('.tmp/hsp-direct/pdf-inspection.json',JSON.stringify(result,null,2));}
