// 300 synthetic horses/certificates; no authenticated or external requests.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium,expect} from '@playwright/test';
import executable from '@sparticuz/chromium';
const plugin={name:'health-list-fixture',enforce:'pre',load(id){if(id.endsWith('/src/lib/supabase.ts'))return 'export const supabase=null;export function requireSupabase(){return window.fakeSupabase;}';},configureServer(server){server.middlewares.use('/health-lists-fixture',async(req,res,next)=>{try{
 const html=`<html><body><main class="app-shell"><aside class="sidebar"></aside><section class="workspace"><div id="root"></div></section></main><script type="module">
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import {HealthCenterView} from '/src/features/health/HealthCenterView.tsx';import '/src/styles.css';
 const params=new URLSearchParams(location.search),locale=params.get('locale')||'fr',pending=params.has('pending'),count=pending?15:300;
 const horses=Array.from({length:count},(_,i)=>({id:'horse-'+i,name:'Cheval Santé '+String(i).padStart(3,'0'),primary_owner_contact_id:'owner',registration_number:'DEMO-'+i,created_at:'2026-01-01T00:00:00Z'}));
 const documents=horses.map((horse,i)=>({id:'document-'+i,horse_id:horse.id,document_type:'coggins_eia',document_category:'health',status:pending?'pending_review':'verified',result:'Negative',verification_source:'gvl_qr',test_or_administered_on:'2026-01-01',created_at:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),updated_at:new Date(Date.UTC(2026,0,1,0,i)).toISOString(),warnings:[],certificate_number:'CERT-'+i}));
 const results=horses.map((horse,i)=>({horse_id:horse.id,organization_id:'org',compliance_status:pending?'pending_review':'compliant',can_proceed:true,requirements:{coggins:{required:true,status:pending?'review_pending':'valid',document_id:'document-'+i,document_type:'coggins_eia',document_status:pending?'pending_review':'verified'},influenza:{required:false,status:'not_required'},rhino:{required:false,status:'not_required'}},reasons:[]}));
 window.fakeSupabase={rpc:async(_name,args)=>({data:results.filter(result=>!args.p_horse_ids||args.p_horse_ids.includes(result.horse_id)),error:null})};
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(HealthCenterView,{locale,organization:{id:'org',name:'DEMO'},horses,contacts:[{id:'owner',first_name:'Propriétaire',last_name:'Démo'}],contactRoles:[],horseContacts:[],horseExternalIdentifiers:[],horseHealthDocuments:documents,documentReviews:[],externalCredentialIssuers:[],shows:[],canManageHealthDocuments:true,onRefresh:()=>{}}));
 </script></body></html>`;
 res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/health-lists-fixture',html));
 }catch(error){next(error);}});}};
const server=await createServer({configFile:false,envDir:false,plugins:[plugin,react()],server:{host:'127.0.0.1',port:5196,strictPort:true,fs:{deny:['.env','.env.*','**/.git/**','**/.tmp/**']}}});let browser;
try{
 await server.listen();await mkdir('.tmp/health-lists',{recursive:true});
 browser=await chromium.launch(process.platform==='linux'?{executablePath:await executable.executablePath(),args:executable.args.filter(arg=>arg!=='--single-process'),headless:true}:{channel:'chrome',headless:true});
 const page=await browser.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 for(const locale of ['fr','en'])for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:900}]){
  await page.setViewportSize(viewport);await page.goto('http://127.0.0.1:5196/health-lists-fixture?locale='+locale);
  const fr=locale==='fr',current=page.locator('.health-compliance-group.success'),rows=current.locator('.health-compliance-row'),queue=page.locator('.health-review-queue').filter({has:page.locator('summary h2').filter({hasText:'Coggins'})});
  await expect(rows).toHaveCount(4);assert((await rows.first().innerText()).includes('299'));assert.equal(await page.locator('.health-review-queue[open]').count(),0);
  assert((await queue.locator('summary').textContent()).includes(fr?'Tout approuvé':'All approved'));
  assert((await queue.boundingBox()).height<140,'Collapsed panel stays compact');
  await current.getByRole('button',{name:fr?'Afficher les 4 suivants':'Show next 4',exact:true}).click();await expect(rows).toHaveCount(8);
  const horseSearch=page.getByRole('searchbox',{name:fr?'Rechercher un cheval':'Search horses',exact:true});await horseSearch.fill('sante 000');await expect(rows).toHaveCount(1);assert((await rows.first().innerText()).includes('000'));
  await horseSearch.fill('DEMO-42');await expect(rows).toHaveCount(1);await horseSearch.fill('introuvable');await expect(rows).toHaveCount(0);await horseSearch.fill('');await expect(rows).toHaveCount(4);
  await queue.locator('summary').click();await queue.getByRole('checkbox').check();const cards=queue.locator('.health-review-card');await expect(cards).toHaveCount(4);assert((await cards.first().innerText()).includes('299'));
  await queue.getByRole('button',{name:fr?'Afficher les 4 suivants':'Show next 4',exact:true}).click();await expect(cards).toHaveCount(8);
  const certificateSearch=queue.getByRole('searchbox');await certificateSearch.fill('sante 000');await expect(cards).toHaveCount(1);await certificateSearch.fill('CERT-42');await expect(cards).toHaveCount(1);await certificateSearch.fill('introuvable');await expect(cards).toHaveCount(0);await certificateSearch.fill('');await expect(cards).toHaveCount(4);
  await queue.locator('summary').click();assert.equal(await cards.first().isVisible(),false);await page.screenshot({path:'.tmp/health-lists/'+locale+'-'+viewport.width+'.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }
 await page.goto('http://127.0.0.1:5196/health-lists-fixture?pending=true');await expect(page.locator('.health-compliance-row')).toHaveCount(4);
 const summary=page.locator('.health-review-queue summary').filter({hasText:'Coggins'});assert((await summary.textContent()).includes('15 documents à approuver'));await summary.focus();await page.keyboard.press('Enter');await expect(page.locator('.health-review-card')).toHaveCount(4);
 assert.deepEqual(errors,[]);console.log('PASS 300 horses/certificates: 4 most recent, load next 4, full-list accent-insensitive search and reset; collapsed approval summaries, pending count and keyboard opening; FR/EN portrait/landscape/desktop.');
}finally{await browser?.close();await server.close();}
