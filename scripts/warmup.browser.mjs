// Synthetic component fixtures only. External network requests are blocked.
import assert from 'node:assert/strict';
import {createServer} from 'vite';import react from '@vitejs/plugin-react';
import {chromium} from 'playwright-core';import executable from '@sparticuz/chromium';
import {readFile} from 'node:fs/promises';
const show={id:'show',name:'DEMO warmup',start_date:'2026-10-25',end_date:'2026-10-25',default_currency:'CAD'};
const day={id:'day',show_id:'show',day_date:'2026-10-25',day_number:1,sort_order:1};
const blocks=[{id:'first',show_id:'show',show_day_id:'day',name:'DEMO précédent',display_label:null,arena:'101',sort_order:1,block_type:'competition',schedule_start_mode:'fixed',scheduled_time:'08:00',pattern:'R1'},{id:'second',show_id:'show',show_day_id:'day',name:'DEMO suite',arena:'101',sort_order:2,block_type:'competition',schedule_start_mode:'after_previous',follows_block_id:'first',pattern:'R2'}];
const classes=blocks.map((b,i)=>({id:'class'+i,show_id:'show',block_id:b.id,name:'DEMO class',sort_order:1,added_money:0,entry_fee:25,judge_fee:0,payout_schedule_type:'jackpot_100'}));
const warmup={id:'warm',name:'DEMO warmup',arena:'101',registration_state:'drawn',duration_minutes_per_rider:5,drag_interval:2,drag_duration_minutes:8,schedule_start_mode:'fixed',schedule_start_time:'08:00'};
const fixture=JSON.stringify({show,day,blocks,classes,warmup});
const harness={name:'warmup-fixture',configureServer(server){server.middlewares.use('/warmup-test',async(req,res,next)=>{try{const html=`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';
import {ShowbillExport} from '/src/features/classes/ShowbillExport.tsx';
import {WarmupScheduleExport} from '/src/features/warmups/WarmupScheduleExport.tsx';
import {PaidWarmupForm} from '/src/features/classes/PaidWarmupForm.tsx';
import '/src/styles.css';
const f=${fixture};const org={id:'org',name:'DEMO association'};
createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,
 React.createElement(ShowbillExport,{blocks:f.blocks,classes:f.classes,locale:'fr',organization:org,show:f.show,showDays:[f.day]}),
 React.createElement(WarmupScheduleExport,{warmup:f.warmup,labels:['DEMO Owner — Horse A','DEMO Owner — Horse B','DEMO Owner — Horse C']}),
 React.createElement(PaidWarmupForm,{blocks:[],contacts:[],classes:[],entries:[],horses:[],locale:'fr',organization:org,showDays:[f.day],showScorePaidWarmups:[],shows:[f.show],onSaveError:e=>{window.fixtureError=e.message},onSaveShowScorePaidWarmup:async input=>{window.fixtureSave=input}})
));</script></body></html>`;res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/warmup-test',html));}catch(e){next(e);}});}};
const server=await createServer({configFile:false,envDir:false,publicDir:false,plugins:[react(),harness],server:{host:'127.0.0.1',port:5198,strictPort:true,fs:{deny:['.env','.env.*','**/.tmp/**','**/.git/**']}}});let browser;
try{await server.listen();browser=await chromium.launch({executablePath:await executable.executablePath(),headless:true,args:executable.args.filter(a=>!['--single-process','--disable-web-security','--disable-site-isolation-trials'].includes(a)&&!a.startsWith('--disable-features='))});const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('http://127.0.0.1:5198/warmup-test');
await page.getByRole('heading',{name:'Manège / Arena 101',exact:true}).waitFor();
assert.equal(await page.locator('.showbill-print-root').getByText('Jackpot',{exact:true}).count(),2,'Jackpot column remains visible even when all added money is zero');
assert.ok(await page.locator('.showbill-print-root').getByText(/À la suite de.*After/).count());
const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'CSV pour Google Sheets',exact:true}).click();const download=await downloading;const csv=await readFile(await download.path(),'utf8');assert.ok(csv.includes('08:18'));assert.ok(csv.includes('Préparation de piste / Arena drag'));assert.ok(csv.includes('DEMO Owner — Horse C'));
const popupPromise=page.waitForEvent('popup');await page.getByRole('button',{name:'Imprimer / PDF',exact:true}).last().click();const popup=await popupPromise;await popup.waitForLoadState();assert.ok((await popup.locator('body').innerText()).includes('08:18'));await popup.close();
await page.getByLabel('Prix par cheval').fill('25');await page.getByLabel('Nombre de places disponibles').fill('2');await page.getByRole('button',{name:'Créer paid warmup',exact:true}).click();await page.waitForFunction(()=>window.fixtureSave);const saved=await page.evaluate(()=>window.fixtureSave);assert.equal(saved.entry_fee,25);assert.equal(saved.capacity,2);assert.equal(saved.registration_enabled,true);assert.equal(saved.entries.length,0,'Requests are not preselected/charged when configuring a session');assert.equal(errors.length,0,errors.join('\n'));
console.log('Warmup browser: bilingual showbill, Jackpot-only column, arena heading, provisional CSV/PDF with drag timing, price/capacity form passed.');
}finally{await browser?.close();await server.close();}
