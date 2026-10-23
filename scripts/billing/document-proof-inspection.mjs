import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createHash} from 'node:crypto';
import labels from '../../src/lib/billingDocumentTranslations.json' with {type:'json'};
const contains=(text,expected)=>text.normalize('NFKC').replace(/\s+/gu,'').includes(expected.normalize('NFKC').replace(/\s+/gu,''));
export async function inspectProof({bytes,document:d,locale,path,origin}){
 mkdirSync(path.substring(0,path.lastIndexOf('/')),{recursive:true});writeFileSync(path,bytes);
 const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise,t=labels[locale],pages=[];let text='';
 for(let n=1;n<=pdf.numPages;n++){
  const p=await pdf.getPage(n),content=await p.getTextContent(),txt=content.items.map(x=>x.str).join(' ');text+=txt+'\n';
  assert(contains(txt,t.demo));assert(contains(txt,d.snapshot.account_number));assert(contains(txt,t.included.split('.')[0]));
  // All nonempty text must stay within the printed page bounds.
  const box=p.getViewport({scale:1});for(const x of content.items.filter(x=>x.str.trim()))assert(x.transform[4]>=0&&x.transform[5]>=0&&x.transform[4]+x.width<=box.width+1&&x.transform[5]<=box.height+1,`Out of bounds: ${x.str}`);
  const v=p.getViewport({scale:1.15}),canvas=pdf.canvasFactory.create(v.width,v.height);await p.render({canvasContext:canvas.context,viewport:v}).promise;const image=path.replace('.pdf',`-${n}.png`);writeFileSync(image,canvas.canvas.toBuffer('image/png'));pdf.canvasFactory.destroy(canvas);pages.push({page:n,image});
 }
 assert(contains(text,t.total)&&contains(text,t.paid)&&contains(text,t.balance));if(d.number)assert(contains(text,d.number));
 if(locale==='en')assert(!/Frais de|commandités|plus taxes|Inscriptions et stalle|DÉMONSTRATION|Répartition|Montant avant/.test(text),'French UI/description in English document');
 assert(!/\d{4}-\d{2}-\d{2}T\d/.test(text),'Raw ISO time');
 if(d.kind==='receipt'){assert(contains(text,t.allocation));assert(contains(text,t.hspAllocation));assert(contains(text,t.hspTotal));}
 else for(const key of ['association','hsp'])assert(contains(text,d.snapshot.supplier_invoices[key].fiscal_id));
 for(const p of d.snapshot.payments)if(p.receipt_number)assert(contains(text,p.receipt_number));
 writeFileSync(path.replace('.pdf','.txt'),text);await pdf.destroy();return {path,origin,locale,pages:pages.length,pageImages:pages,sha256:createHash('sha256').update(bytes).digest('hex'),total:d.snapshot.total,received:d.snapshot.received,balance:d.snapshot.balance};
}
