// Real Chromium rendering, fictional immutable inputs; no Storage or Stripe transport.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {serverlessBrowser} from '../../server/vet/serverless-browser.mjs';
import {documentModel,renderDocument} from '../../server/billing/pdf.mjs';
import {fixture} from './pdf-fixtures.mjs';
const dir='.tmp/hsp-direct/pdf-fixtures';mkdirSync(dir,{recursive:true});
const result={complete:false,realChromium:true,fictionalInputs:true,assertions:0,files:[]};const check=x=>{assert(x);result.assertions++;};
const browser=await serverlessBrowser.launch();
try{
 for(const kind of ['statement','receipt','invoice'])for(const locale of ['fr','en']){
  const d=fixture(kind),s=d.snapshot;s.suppliers={association:{name:'Association DEMO',address:'1 rue Fictive',tax_number_1:'DEMO-ASSO-TAX'},hsp:{name:'HSP DEMO',address:'2 rue Fictive',tax_number_1:'DEMO-HSP-TAX'}};s.mandate='DEMO mandate — unvalidated tax prototype';
  s.charges.forEach(c=>c.supplier='association');
  s.charges.push({id:'hsp-demo',supplier:'hsp',description:'Frais de service HSP',quantity:1,unit_price:5,subtotal:5,tax_amount:.25,total:5.25,taxes:[{code:'DEMO',name:'Taxe fictive / Demo tax',rate:5,jurisdiction:'DEMO ONLY',amount:.25,base:5}]});
  for(const [k,v] of Object.entries({subtotal:5,tax_amount:.25,total:5.25,balance:5.25}))s[k]=Math.round((s[k]+v)*100)/100;
  const before=JSON.stringify(d);const model=documentModel(d,locale);check(model.blocks.filter(b=>b.label.startsWith('HSP DEMO')).length===1);
  const bytes=await renderDocument(d,locale,{browser});check(JSON.stringify(d)===before);writeFileSync(`${dir}/${kind}-${locale}.pdf`,bytes);
  const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;let text='';
  for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i),content=(await p.getTextContent()).items.map(x=>x.str).join(' ');text+=content+'\n';check(content.includes('DÉMONSTRATION — sans valeur comptable ou fiscale'));check(content.includes(s.account_number));}
  for(const value of ['DEMO-ASSO-TAX','DEMO-HSP-TAX','Great Holly Whiz','Demo Silver Star','SESSION-B'])check(text.includes(value));
  check(text.includes(locale==='fr'?'Frais de service HSP':'HSP service fee'));
  if(kind==='statement')check(!text.includes('DEMO-INV'));
  if(kind==='invoice')check(pdf.numPages>=3);
  result.files.push({kind,locale,pages:pdf.numPages,bytes:bytes.length});await pdf.destroy();
 }
 result.complete=true;
}finally{await browser.close();writeFileSync(dir+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
