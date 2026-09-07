import assert from 'node:assert/strict';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
const normalize=s=>s.normalize('NFKC').replace(/\s+/gu,'');
// Check full rows (all cells), not merely section headings and subtotal labels.
// Each complete row must occur on one page; repeated rows retain their multiplicity.
export async function assertPDFRows(bytes,model){
 const pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;
 try{
  const pages=[];
  for(let i=1;i<=pdf.numPages;i++)pages.push(normalize((await(await pdf.getPage(i)).getTextContent()).items.map(x=>x.str).join(' ')));
  const expected=new Map();for(const b of model.blocks)for(const row of b.rows){const text=normalize(row.join(' '));if(text)expected.set(text,(expected.get(text)??0)+1);}
  for(const [row,count]of expected){const found=pages.reduce((n,text)=>n+text.split(row).length-1,0);assert(found>=count,`PDF row missing or split: ${row.slice(0,180)} (expected ${count}, found ${found})`);}
  return {pages:pdf.numPages,rows:model.blocks.reduce((n,b)=>n+b.rows.length,0)};
 }finally{await pdf.destroy();}
}
