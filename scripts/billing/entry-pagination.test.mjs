// Synthetic snapshots, rendered and extracted by real Chromium/pdfjs.
import assert from 'node:assert/strict';import {writeFileSync,mkdirSync} from 'node:fs';
import {bibFixture} from './entry-groups.test.mjs';
import {renderDocument,documentModel} from '../../server/billing/pdf.mjs';
import {serverlessBrowser} from '../../server/vet/serverless-browser.mjs';
import {assertPDFRows,assertPDFGroupHeaders} from './pdf-row-coverage.mjs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const dir='.tmp/review-v4';mkdirSync(dir,{recursive:true});const browser=await serverlessBrowser.launch(),result={complete:false,syntheticSnapshots:true,realChromium:true,cases:[]};
try{for(const locale of ['fr','en'])for(const kind of ['invoice','statement','receipt'])for(const long of [false,true]){const d=bibFixture(kind,long),before=JSON.stringify(d),model=documentModel(d,locale),bytes=await renderDocument(d,locale,{browser}),coverage=await assertPDFRows(bytes,model);assert.equal(JSON.stringify(d),before);const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;let continuations=0;for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),text=(await p.getTextContent()).items.map(x=>x.str).join(' ');if(text.includes(locale==='fr'?'suite':'continued')){continuations++;assert(/Dossard|Back number|Account summary|Récapitulatif|Payment received|Paiement concerné/.test(text));}}await pdf.destroy();if(long)assert(continuations>0);result.cases.push({locale,kind,long,continuations,...coverage,...await assertPDFGroupHeaders(bytes,model)});}result.complete=true;}finally{await browser.close();writeFileSync(dir+'/pagination-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
