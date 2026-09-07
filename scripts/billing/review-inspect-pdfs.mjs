// Inspect actual PDFs downloaded from the private local Storage service.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{getDocument}from'pdfjs-dist/legacy/build/pdf.mjs';
const dir='.tmp/review-20260907',manifest=JSON.parse(readFileSync(dir+'/documents-results.json'));mkdirSync(dir+'/pdf-images',{recursive:true});let checks=0;const files=[];
for(const file of manifest.files){const bytes=readFileSync(file.path),pdf=await getDocument({data:new Uint8Array(bytes),useSystemFonts:true}).promise;let text='';
 for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i),content=await page.getTextContent(),pageText=content.items.map(x=>x.str).join(' ');text+=pageText+'\n';assert(pageText.includes(file.locale==='fr'?'Rendu 2':'Render 2'));assert(pageText.includes('DÉMONSTRATION'));checks+=2;
  if(file.name==='main'){const viewport=page.getViewport({scale:1.3}),canvas=pdf.canvasFactory.create(viewport.width,viewport.height);await page.render({canvasContext:canvas.context,viewport}).promise;writeFileSync(`${dir}/pdf-images/${file.path.split('/').at(-1).replace('.pdf','')}-${i}.png`,canvas.canvas.toBuffer('image/png'));pdf.canvasFactory.destroy(canvas);}
 }
 const compact=text.replace(/\s+/g,' ');for(const value of ['Association DEMO','HSP DEMO','DEMO-ASSO-TAX','DEMO-HSP-TAX']){assert(compact.includes(value));checks++;}
 assert(compact.includes(file.locale==='fr'?'Identifiant fiscal':'Tax identifier'));assert(compact.includes(file.locale==='fr'?'mandataire':'as agent'));checks+=2;
 if(file.kind==='invoice'){assert(compact.includes(file.locale==='fr'?'Détail des paiements':'Payment details'));assert(compact.includes('DEMO-RCPT'));assert(compact.includes(file.locale==='fr'?'Virement Interac':'Interac transfer'));assert(compact.includes(file.locale==='fr'?'Comptant':'Cash'));checks+=4;}
 if(file.kind==='receipt'){assert(compact.includes(file.locale==='fr'?'Montant total du frais':'Full charge amount'));assert(compact.includes(file.locale==='fr'?'Portion réglée par ce paiement':'Portion paid by this payment'));checks+=2;}
 if(file.name==='main'){assert(compact.includes(file.locale==='fr'?'Total du bloc avant taxes':'Block total before taxes'));checks++;}
 files.push({...file,pages:pdf.numPages});await pdf.destroy();
}
writeFileSync(dir+'/pdf-inspection.json',JSON.stringify({complete:true,actualDownloadedPDFs:true,checks,files},null,2));console.log(JSON.stringify({complete:true,files:files.length,checks,actualDownloadedPDFs:true}));
