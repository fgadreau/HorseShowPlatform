// Synthetic files and mocked Supabase only; every external browser request is blocked.
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';import react from '@vitejs/plugin-react';
import {chromium} from 'playwright-core';import executable from '@sparticuz/chromium';
const id='11111111-2222-4333-8444-555555555555',url='https://gvlcertcheck.ai/check/'+id;
const mock=`export function requireSupabase(){return window.fakeSupabase;}export const supabase=null;`;
const harness={name:'coggins-fixture',enforce:'pre',load(id){if(id.endsWith('/src/lib/supabase.ts'))return mock;},configureServer(server){server.middlewares.use('/certificate-preview',(req,res)=>{res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="700"><rect width="600" height="700" fill="white"/><text x="20" y="40">DEMO vaccination certificate</text></svg>')});server.middlewares.use('/coggins-fixture',async(req,res,next)=>{try{const html=`<html><body><main class="app-shell"><aside class="sidebar"></aside><section class="workspace"><div id="root"></div></section></main><script type="module">
import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import {VaccinationReviewQueue} from '/src/features/health/VaccinationReviewQueue.tsx';import '/src/styles.css';
const params=new URLSearchParams(location.search),locale=params.get('locale')??'fr';window.calls=[];window.refreshes=0;window.failReview=false;
window.fakeSupabase={rpc:async(name,args)=>{window.calls.push({name,args});if(window.failReview)return {data:null,error:{message:'DEMO review failed'}};return {data:{id:'review',version:window.calls.length,status:args.p_status},error:null}},storage:{from:()=>({createSignedUrl:async()=>params.has('unreadable')?({data:null,error:{message:'DEMO unsupported preview'}}):({data:{signedUrl:'http://127.0.0.1:5195/certificate-preview'},error:null})})}};
const doc={id:'document',horse_id:'horse',document_type:params.has('coggins')?'coggins_eia':'combo_vaccine',result:params.has('positive')?'Positive':'Negative',horse_name:'DEMO Horsse',document_url:params.has('missing')?null:'horse/DEMO.png',mime_type:params.has('pdf')?'application/pdf':'image/png',status:'pending_review',test_or_administered_on:params.has('no-date')?null:'2026-10-25',warnings:params.has('unsigned')?['NOT_SIGNED']:[],updated_at:'2026-10-25T00:00:00Z',created_at:'2026-10-25T00:00:00Z'};
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(VaccinationReviewQueue,{locale,organizationId:'association',kind:params.has('coggins')?'coggins':'vaccination',horses:[{id:'horse',name:'DEMO Horse',date_of_birth:'2015-04-03',gender:'F',breed:'Quarter Horse',color:'Bay',primary_owner_contact_id:'owner',registration_number:'DEMO-123'}],contacts:[{id:'owner',first_name:'DEMO',last_name:'Owner'}],identifiers:[{horse_id:'horse',external_credential_issuer_id:'nrha',identifier_value:'DEMO-NRHA'}],issuers:[{id:'nrha',code:'NRHA'}],documents:[doc],reviews:params.has('saved')?[{id:'saved',organization_id:'association',horse_document_id:'document',version:1,status:params.get('saved')==='rejected'?'rejected':'approved',review_method:params.get('saved')==='legacy'?null:'manual_coggins',coggins_document_updated_at:params.get('saved')==='stale'?'2026-10-24T00:00:00Z':doc.updated_at,reviewed_at:'2026-10-25T00:00:00Z',review_notes:'DEMO: document accepted by association'}]:[],onReviewed:async()=>{window.refreshes++}}));

</script></body></html>`;res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/coggins-fixture',html));}catch(e){next(e);}});}};
const server=await createServer({configFile:false,envDir:false,publicDir:false,plugins:[harness,react()],server:{host:'127.0.0.1',port:5195,strictPort:true,fs:{deny:['.env','.env.*','**/.tmp/**','**/.git/**']}}});let browser;
const dir='.tmp/vaccination-review-browser';await mkdir(dir,{recursive:true});
try{await server.listen();browser=await chromium.launch(process.platform==='linux'?{executablePath:await executable.executablePath(),headless:true,args:executable.args.filter(a=>!['--single-process','--disable-web-security','--disable-site-isolation-trials'].includes(a)&&!a.startsWith('--disable-features='))}:{channel:'chrome',headless:true});
for(const locale of ['fr','en'])for(const width of [390,1024]){
 const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('http://127.0.0.1:5195/coggins-fixture?locale='+locale);const open=()=>page.getByRole('button',{name:locale==='fr'?'Ouvrir le document':'Open document',exact:true}).click();await open();const dialog=page.getByRole('dialog');await dialog.getByRole('img').waitFor();const summary=dialog.getByRole('region',{name:locale==='fr'?'Fiche du cheval dans l’application':'Horse record in the application',exact:true});assert((await summary.innerText()).includes('Quarter Horse'));assert((await summary.innerText()).includes('DEMO Owner'));assert((await summary.innerText()).includes('DEMO-NRHA'));assert((await summary.innerText()).includes('2015'));assert.equal(await dialog.locator('input,textarea,select').count(),1,'Only vaccination date is requested');await dialog.getByLabel(locale==='fr'?'Date du vaccin indiquée sur le document':'Vaccination date shown on the document').fill('2026-10-20');await dialog.getByRole('button',{name:locale==='fr'?'Confirmer l’approbation':'Confirm approval',exact:true}).click();await dialog.waitFor({state:'detached'});let calls=await page.evaluate(()=>window.calls);assert.deepEqual(calls,[{name:'review_vaccination_document',args:{p_organization_id:'association',p_horse_document_id:'document',p_status:'approved',p_administered_on:'2026-10-20'}}]);assert.equal(await page.evaluate(()=>window.refreshes),1);await page.getByRole('checkbox').check();await open();await dialog.getByRole('button',{name:locale==='fr'?'Refuser':'Reject',exact:true}).click();await dialog.waitFor({state:'detached'});calls=await page.evaluate(()=>window.calls);assert.equal(calls.at(-1).args.p_status,'rejected');assert.equal(await page.evaluate(()=>window.refreshes),2);await page.evaluate(()=>{window.failReview=true});await open();await dialog.getByRole('button',{name:locale==='fr'?'Confirmer l’approbation':'Confirm approval',exact:true}).click();await dialog.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.refreshes),2,'Failed decision is not shown as saved');assert.equal(errors.length,0);await page.close();
}
for(const mode of ['missing','pdf']){const page=await browser.newPage();await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('http://127.0.0.1:5195/coggins-fixture?locale=en&'+mode+'=true');await page.getByRole('button',{name:'Open document',exact:true}).click();if(mode==='missing'){assert(await page.getByRole('button',{name:'Confirm approval',exact:true}).isDisabled());await page.getByRole('button',{name:'Reject',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});}else await page.locator('iframe[title="Certificate submitted by the member"]').waitFor();await page.close();}
for(const locale of ['fr','en']){const page=await browser.newPage({viewport:{width:390,height:844}});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto('http://127.0.0.1:5195/coggins-fixture?locale='+locale+'&unreadable=true&no-date=true');await page.getByRole('button',{name:locale==='fr'?'Approuver':'Approve',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('alert').waitFor();const approve=dialog.getByRole('button',{name:locale==='fr'?'Confirmer l’approbation':'Confirm approval',exact:true});assert(await approve.isDisabled(),'Date is required, not preview');await dialog.getByLabel(locale==='fr'?'Date du vaccin indiquée sur le document':'Vaccination date shown on the document').fill('2026-10-19');assert(!(await approve.isDisabled()),'Preview failure must not prevent manual approval');await approve.click();await dialog.waitFor({state:'detached'});const calls=await page.evaluate(()=>window.calls);assert.equal(calls.at(-1).args.p_administered_on,'2026-10-19');assert.equal(calls.at(-1).args.p_status,'approved');await page.close();}
for(const locale of ['fr','en'])for(const width of [390,1024]){
 const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:5195/coggins-fixture?coggins=true&locale='+locale);
 const open=()=>page.getByRole('button',{name:locale==='fr'?'Ouvrir le document':'Open document',exact:true}).click();
 await open();const dialog=page.getByRole('dialog');
 const reason=dialog.getByRole('textbox',{name:locale==='fr'?'Motif de la décision':'Reason for the decision',exact:true});
 const approve=dialog.getByRole('button',{name:locale==='fr'?'Confirmer l’approbation':'Confirm approval',exact:true});
 assert(await approve.isDisabled());await reason.fill('court');assert(await approve.isDisabled());
 assert.equal(await dialog.locator('input[type=date]').count(),0,'Coggins review never edits its sample date');
 assert((await dialog.innerText()).includes('DEMO Horse'));assert((await dialog.innerText()).includes('DEMO Horsse'));
 await reason.fill('DEMO: coquille du nom; les autres identifiants concordent.');assert(!(await approve.isDisabled()));
 await approve.click();await dialog.waitFor({state:'detached'});
 let calls=await page.evaluate(()=>window.calls);assert.deepEqual(calls,[{name:'review_coggins_document',args:{p_organization_id:'association',p_horse_document_id:'document',p_status:'approved',p_reason:'DEMO: coquille du nom; les autres identifiants concordent.'}}]);
 await page.getByRole('checkbox').check();await open();await reason.fill('DEMO: décision révisée après vérification.');
 await dialog.getByRole('button',{name:locale==='fr'?'Refuser':'Reject',exact:true}).click();await dialog.waitFor({state:'detached'});
 calls=await page.evaluate(()=>window.calls);assert.equal(calls.at(-1).args.p_status,'rejected');
 await page.evaluate(()=>{window.failReview=true});await open();await reason.fill('DEMO: réessayer une approbation explicite.');await approve.click();
 await dialog.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.refreshes),2);assert.equal(errors.length,0);await page.close();
}
for(const mode of ['positive','unsigned','missing']){
 const page=await browser.newPage();page.setDefaultTimeout(15000);
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('http://127.0.0.1:5195/coggins-fixture?coggins=true&'+mode+'=true');
 await page.getByRole('button',{name:'Ouvrir le document',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'Motif de la décision',exact:true}).fill('DEMO: un motif ne remplace pas une preuve négative.');
 assert(await dialog.getByRole('button',{name:'Confirmer l’approbation',exact:true}).isDisabled(),mode+' cannot be overridden');await page.close();
}

for(const locale of ['fr','en'])for(const viewport of [{width:320,height:568},{width:844,height:390},{width:1280,height:900}])for(const saved of ['legacy','current','stale','rejected']){
 const page=await browser.newPage({viewport});
 page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const address='http://127.0.0.1:5195/coggins-fixture?coggins=true&locale='+locale+'&saved='+saved;
 await page.goto(address);
 const cards=page.locator('.health-review-card'),checkbox=page.getByRole('checkbox');
 await checkbox.waitFor();assert.equal(await cards.count(),saved==='stale'?1:0,'Only obsolete certificate decisions return to pending');
 const size=await checkbox.boundingBox();assert(size.width<=24&&size.height<=24,'History checkbox is compact');
 await checkbox.check();await cards.first().waitFor();
 assert.equal(await cards.count(),1);assert.equal(await page.getByRole('button',{name:locale==='fr'?'Approuver':'Approve',exact:true}).count(),saved==='stale'?1:0);
 const title=await cards.locator('strong').boundingBox(),meta=await cards.locator('.health-review-card-meta').boundingBox();assert(meta.y>=title.y+title.height,'Name and document metadata occupy separate lines');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 if(saved==='legacy')await page.screenshot({path:dir+'/saved-'+locale+'-'+viewport.width+'.png',fullPage:true});
 await page.reload();await checkbox.waitFor();assert.equal(await cards.count(),saved==='stale'?1:0,'Saved decisions remain hidden after reloading');
 assert.deepEqual(errors,[]);console.log('PASS persisted health decision',locale,viewport.width,saved);
 await page.close();
}
console.log('PASS health queue: persisted legacy/current/rejected decisions hidden, stale certificate approvals pending; history and compact checkbox; FR/EN portrait, landscape and desktop.');
console.log('PASS Coggins review FR/EN mobile/desktop: app/certificate identity comparison, required reason, scoped approval/rejection RPC, retry error, negative/signed/attached guards.');
console.log('PASS vaccination review FR/EN mobile/desktop: inline document, manual approve/date/reject, audit RPC, refresh, saved decisions, failure retained, no-file guard, PDF preview; no external requests.');
}finally{await browser?.close();await server.close();}
