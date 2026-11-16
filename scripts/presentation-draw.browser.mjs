import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium,expect} from '@playwright/test';
import {serverlessBrowser} from '../server/vet/serverless-browser.mjs';

const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {ControlRoomView} from '/src/features/controlRoom/ControlRoomView.tsx';
import {IncentiveProgramsSettings} from '/src/features/settings/IncentiveProgramsSettings.tsx';import '/src/styles.css';
const locale=new URLSearchParams(location.search).get('lang')||'fr';window.calls=[];window.print=()=>{};
const rows=Array.from({length:34},(_,i)=>({id:'run-'+i,draw:String(i+1),back_number:String(245+i),horse_name:'HSPRUN-'+String(i).padStart(2,'0')+(i%4===0?' Golden Champagne Whiz With A Very Long Registered Name':''),rider_name:'Alexandre Tremblay-Lapointe',sire_name:i===1?null:'Gunnatrashya With A Long Registered Name',dam_name:i===1?null:'Smart Chic Olena Golden Lady',birth_year:i===1?null:2021,classes:['101 - Non Pro Derby','102 - Open Level 1'],programs:i%3===0?[{name_fr:'Programme élevage du Québec',name_en:'Quebec Breeding Program',nominator_name:'Élevage des Érables et partenaires'},{name_fr:'Programme Performance',name_en:'Performance Program',nominator_name:null}]:[],scratch:i===2}));
const draw={source:'published',version:1,generated_version:2,published_version:1,generated_at:'2026-11-15T17:00:00.000Z',reference_date:'2026-11-15',organization:{name:'Association de reining TEST',logo_url:'/branding/hsp-logo-aubergine.svg'},show_name:'Concours de présentation TEST',block:{id:'block',name:'Bloc Derby - Non Pro et Open',arena:'Manège principal'},rows};
window.nominations=[{id:'nomination',organization_id:'org',incentive_program_id:'program',horse_id:'horse1',nomination_role:'horse',season_year:2020,status:'active',source:'import',nominated_on:'2020-01-01',valid_from:null,valid_until:null,qualifying_stallion_nomination_id:null,reference_number:'REF-1',notes:null,nominator_name:'Initial Nominator'}];
window.fakeSupabase={rpc:async(name,args)=>{window.calls.push({name,args});if(name==='get_presentation_draw')return {data:{...draw,...(args.p_source==='generated'?{source:'generated',version:2,rows:rows.slice().reverse()}:{} )},error:null};if(name==='import_incentive_program_nominations')return {data:{imported:args.p_rows.length,failed:0,errors:[]},error:null};throw Error('Unexpected RPC '+name);},from(table){let payload,method,id;const chain={insert(value){payload=value;method='insert';return chain;},update(value){payload=value;method='update';return chain;},eq(key,value){id=value;return chain;},select(){return chain;},async single(){window.calls.push({table,method,payload,id});const row={...(window.nominations.find(n=>n.id===id)||{}),...payload,id:id||'new-nomination'};window.nominations=window.nominations.filter(n=>n.id!==row.id).concat(row);return {data:row,error:null};}};return chain;}};
const block={id:'block',organization_id:'org',show_id:'show',show_day_id:'day',name:'Derby',block_type:'competition',sort_order:1,draw_prepared_at:'2026-11-15',draw_version:2,draw_published_version:1,schedule_status:'open',schedule_is_public:true};
const noop=async()=>{};
const props={locale,blocks:[block],blockJudgeAssignments:[],classes:[],contacts:[],entries:[],entryResults:[],organization:{id:'org',name:'Association TEST',currency:'CAD'},payoutCalculations:[],show:{id:'show',name:'Concours TEST'},showDays:[{id:'day',day_date:'2026-11-15',day_number:1,sort_order:1}],showScoreClassSetups:[{block_id:'block',runs:[{id:'run',draw:1,horse:'TEST',rider:'TEST'}]}],showScorePaidWarmups:[],onPrepareShowScoreClass:noop,onPublishBlockDraw:async()=>window.calls.push({published:true}),onUpdatePayoutCalculationStatus:noop,onViewChange:noop};
function Harness(){const [,refresh]=React.useState(0);const context={profile:{id:'staff'},incentivePrograms:[{id:'program',organization_id:'org',code:'BREED',name_fr:'Programme TEST',name_en:'Program TEST',program_type:'horse_foal_nomination',nomination_fee:0,settings:{},tax_applicable:false,is_active:true,valid_from:null,valid_until:null}],incentiveProgramNominations:window.nominations,organizationDisciplines:[{id:'dir',organization_id:'org'}],directoryHorses:[{organization_discipline_id:'dir',horse_id:'horse1'},{organization_discipline_id:'dir',horse_id:'horse2'}],horses:[{id:'horse1',name:'Existing Horse'},{id:'horse2',name:'New Horse'}]};return location.search.includes('settings')?React.createElement(IncentiveProgramsSettings,{context,locale,organization:props.organization,onRefresh:()=>refresh(v=>v+1)}):React.createElement(ControlRoomView,props);}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script></body></html>`;
const server=await createServer({configFile:false,envDir:false,plugins:[react(),{name:'presentation-fixture',enforce:'pre',load(id){if(id.endsWith('/src/lib/supabase.ts'))return 'export const supabase=null;export function requireSupabase(){return window.fakeSupabase;}';},configureServer(s){s.middlewares.use('/presentation-fixture',async(req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/presentation-fixture',html));}catch(e){next(e);}});}}],server:{host:'127.0.0.1',port:5214,strictPort:true}});
let browser;
try{
 await mkdir('.tmp/presentation-draw',{recursive:true});await server.listen();
 browser=process.platform==='linux'?await serverlessBrowser.launch():await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext();await context.addInitScript(()=>{window.print=()=>{window.__printed=true;};});
 await context.route('**/*',r=>['127.0.0.1','about:blank'].includes(new URL(r.request().url()).hostname)||r.request().url().startsWith('data:')?r.continue():r.abort());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const locale of ['fr','en']){
  const fr=locale==='fr';await page.goto('http://127.0.0.1:5214/presentation-fixture?lang='+locale);
  await page.getByRole('button',{name:/Derby/}).click();await page.getByRole('button',{name:fr?'Draw de présentation':'Presentation draw',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog.locator('.presentation-draw-sheet tbody tr')).toHaveCount(34);
  await expect(dialog.locator('.presentation-score-box')).toHaveCount(34);assert.equal(await dialog.locator('.presentation-score-box').first().innerText(),'');
  await expect(dialog.getByRole('combobox')).toHaveValue('published');await dialog.getByRole('combobox').selectOption('generated');await expect(dialog.locator('.presentation-version')).toContainText(fr?'BROUILLON':'DRAFT');
  await dialog.getByRole('combobox').selectOption('published');await expect(dialog.locator('.presentation-version')).toContainText(fr?'Ordre publié':'Published draw');
  await page.evaluate(()=>{const nativeOpen=window.open;window.open=(...args)=>{const child=nativeOpen.apply(window,args);if(child)child.print=()=>{child.__printed=true;};return child;};});
  const popupReady=page.waitForEvent('popup');await dialog.getByRole('button',{name:fr?'Imprimer ou enregistrer en PDF':'Print or save as PDF'}).click();
  const popup=await popupReady;
  try{await popup.waitForFunction(()=>window.__printed,{},{timeout:5000,polling:100});}catch(error){
   console.log('Print diagnostic',await popup.evaluate(()=>({ready:document.readyState,printed:window.__printed,print:String(window.print),fonts:document.fonts.status,images:Array.from(document.images).map(i=>({src:i.src,complete:i.complete,width:i.naturalWidth})),text:document.body.innerText.slice(0,180)})),await dialog.locator('[role=alert]').allTextContents());throw error;
  }
  await popup.pdf({path:'.tmp/presentation-draw/presentation-'+locale+'.pdf',format:'Letter',landscape:true,preferCSSPageSize:true,printBackground:true});
  await popup.close();assert.equal(await page.evaluate(()=>window.calls.some(c=>c.published)),false);
  await page.goto('http://127.0.0.1:5214/presentation-fixture?settings&lang='+locale);
  const group=page.getByRole('group',{name:fr?'Nominations du programme':'Program nominations',exact:true});
  await group.getByRole('button',{name:fr?'Modifier':'Edit',exact:true}).click();await expect(group.getByLabel(fr?'Nominateur du cheval':'Horse nominator')).toHaveValue('Initial Nominator');
  await group.getByLabel(fr?'Nominateur du cheval':'Horse nominator').fill('Élevage TEST');await group.getByRole('button',{name:fr?'Enregistrer la nomination':'Save nomination',exact:true}).click();
  await page.waitForFunction(()=>window.calls.some(c=>c.method==='update'));
  const call=await page.evaluate(()=>window.calls.find(c=>c.method==='update'));assert.equal(call.id,'nomination');assert.equal(call.payload.nominator_name,'Élevage TEST');assert.equal(call.payload.nominated_on,'2020-01-01');
  assert.equal(await group.getByLabel(fr?'Saison':'Season',{exact:true}).count(),0);
  await group.getByRole('combobox').first().selectOption('horse1');await expect(group.getByRole('button',{name:fr?'Enregistrer la nomination':'Save nomination',exact:true})).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({name:'nominations.csv',mimeType:'text/csv',buffer:Buffer.from('program_code,horse_name,nominateur\nBREED,Existing Horse,CSV Nominator')});
  await page.getByRole('button',{name:fr?'Importer les nominations':'Import nominations',exact:true}).click();
  const imported=await page.evaluate(()=>window.calls.find(c=>c.name==='import_incentive_program_nominations'));assert.equal(imported.args.p_rows[0].nominator_name,'CSV Nominator');
  await page.setViewportSize({width:390,height:844});
  const overflow=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,elements:Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,class:e.className,text:e.textContent.slice(0,90)}))}));
  if(overflow.width>overflow.viewport+1)console.log('Mobile overflow',overflow);
  assert.equal(overflow.width<=overflow.viewport+1,true);await page.setViewportSize({width:1440,height:1000});
 }
 assert.deepEqual(errors,[]);
 // Inspect the actual printed PDFs with PDF.js, then render page PNGs for visual QA.
 for(const locale of ['fr','en']){
  const bytes=(await readFile('.tmp/presentation-draw/presentation-'+locale+'.pdf')).toString('base64');
  const review=await context.newPage();await review.goto('http://127.0.0.1:5214/presentation-fixture');
  const result=await review.evaluate(async({bytes,locale})=>{
   const pdfjs=await import('/node_modules/pdfjs-dist/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/node_modules/pdfjs-dist/build/pdf.worker.mjs';
   const pdf=await pdfjs.getDocument({data:Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))}).promise;
   document.body.replaceChildren();const texts=[];const dimensions=[];
   for(let n=1;n<=pdf.numPages;n++){
    const page=await pdf.getPage(n),viewport=page.getViewport({scale:1.4});dimensions.push([page.view[2],page.view[3]]);
    const content=await page.getTextContent();texts.push(content.items.map(i=>i.str).join(' '));
    const canvas=document.createElement('canvas');canvas.id='pdf-page-'+n;canvas.width=viewport.width;canvas.height=viewport.height;document.body.append(canvas);
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   }
   return {pages:pdf.numPages,texts,dimensions};
  },{bytes,locale});
  assert(result.pages>=2); assert(result.texts.slice(0,-1).every(t=>(t.match(/HSPRUN-\d{2}/g)||[]).length>=10),"At least 10 runs per full page");assert(result.dimensions.every(([w,h])=>Math.abs(w-792)<1&&Math.abs(h-612)<1));
  const all=result.texts.join(' ');for(let i=0;i<34;i++)assert(all.includes('HSPRUN-'+String(i).padStart(2,'0')));
  assert(result.texts.every(t=>t.includes('Horse Show Platform')));assert(!all.includes('BROUILLON'));assert(!all.includes('DRAFT'));
  await review.locator('#pdf-page-1').screenshot({path:'.tmp/presentation-draw/'+locale+'-page-1.png'});
  await review.locator('#pdf-page-'+result.pages).screenshot({path:'.tmp/presentation-draw/'+locale+'-last-page.png'});
  console.log('PASS '+locale.toUpperCase()+' Letter landscape PDF: '+result.pages+' pages, 34 complete rows and repeated HSP footer');await review.close();
 }
 console.log('PASS presentation source selection, blank score cells, no draw publication, nomination editing and mobile layout.');
}finally{await browser?.close();await server.close();}
