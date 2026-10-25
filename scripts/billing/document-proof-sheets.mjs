import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createCanvas,loadImage} from '@napi-rs/canvas';
const root='docs/billing-demo-20260909',out='.tmp/billing-visual-review';mkdirSync(out,{recursive:true});const sheets=[];
for(const sub of ['', '/integrated']){
 const m=JSON.parse(readFileSync(root+sub+'/results.json'));
 for(const fr of m.documents.filter(x=>x.locale==='fr')){
  const en=m.documents.find(x=>x.path===fr.path.replace('-fr.pdf','-en.pdf'));
  for(let n=0;n<Math.max(fr.pages,en.pages);n++){
   const imgs=await Promise.all([fr,en].map(async d=>d.pageImages[n]?loadImage(d.pageImages[n].image):null));
   const w=imgs.find(Boolean).width,h=Math.max(...imgs.filter(Boolean).map(i=>i.height));const canvas=createCanvas(w*2,h+30),ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,w*2,h+30);ctx.fillStyle='black';ctx.font='16px sans-serif';
   [fr,en].forEach((d,i)=>{ctx.fillText(d.path.split('/').at(-1)+' · '+(n+1),i*w+8,21);if(imgs[i])ctx.drawImage(imgs[i],i*w,30);});
   const path=`${out}/${String(sheets.length+1).padStart(2,'0')}.png`;writeFileSync(path,canvas.toBuffer('image/png'));sheets.push({path,pages:[fr,en].filter(d=>d.pageImages[n]).map(d=>({pdf:d.path,page:n+1}))});
  }
 }
}
writeFileSync(out+'/manifest.json',JSON.stringify(sheets,null,2));console.log(JSON.stringify({sheets:sheets.length,pages:sheets.reduce((n,s)=>n+s.pages.length,0)}));
