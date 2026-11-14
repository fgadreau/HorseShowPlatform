import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('.tmp/entry-lifecycle-ui', { recursive: true });
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" style="max-width:960px;margin:30px auto;padding:20px"></main><script type="module">
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {WorkspaceContext} from '/src/features/dashboard/WorkspaceContext.tsx';
import {ScoringView} from '/src/features/scoring/ScoringView.tsx';
import {CancellationActions,CancellationProvider} from '/src/features/entries/CancellationActions.tsx';import '/src/styles.css';
const query=new URLSearchParams(location.search),staff=query.get('role')==='staff';
const organizations=[{id:'org1',name:'Association de reining du Québec'},{id:'org2',name:'Association Ontario'}];
const shows=[{id:'show1',organization_id:'org1',name:'Concours pilote — automne',start_date:'2026-11-13',end_date:'2026-11-15',location:'Saint-Hyacinthe',status:'open'},{id:'show2',organization_id:'org1',name:'Finale régionale',start_date:'2026-10-01',end_date:'2026-10-03',location:'Québec',status:'closed'},{id:'show3',organization_id:'org2',name:'Ontario Classic',start_date:'2026-12-01',end_date:'2026-12-02',location:'Ottawa',status:'open'}];
const classes=[{id:'c1',name:'Open',block_id:'block'},{id:'c2',name:'Intermediate Open',block_id:'block'}];
let entries=[{created_at:'2026-11-13',id:'e1',class_id:'c1',show_id:'show1',status:'active'},{created_at:'2026-11-13',id:'e2',class_id:'c2',show_id:'show1',status:'active'}];
let requests=(staff||query.get('queue')==='cancel')?[{id:'r1',block_id:'block',entry_ids:['e2'],scope:'class',status:'pending',requested_by:'participant',reason:'Changement de programme',decision_note:'',created_at:'2026-11-13'}]:[];
window.calls=[];window.fixtureClient={from(name){if(name!=='entry_cancellation_requests')throw Error('Unexpected table');const q={select(){return q},eq(){return q},order:async()=>({data:requests,error:null})};return q;},rpc:async(name,args)=>{window.calls.push({name,args});let data=null;
 if(name==='entry_cancellation_quote')data={version:5,signature:'fixture',currency:'CAD',subtotal:205,tax_amount:30.70,total:235.70,fee_tax_rules:[{rate:14.975}]};
 else if(name==='preview_entry_cancellation'){const d=args.p_decision;data={credit:{total:d.credit_mode==='full'?235.70:d.credit_mode==='none'?0:d.credit_tax_mode==='inclusive'?d.credit_amount:Math.round(d.credit_amount*1.14975*100)/100},fee:{total:d.fee_tax_mode==='inclusive'?d.fee_amount:Math.round(d.fee_amount*1.14975*100)/100}};}
 else if(name==='request_entry_cancellation')requests=[...requests,{id:args.p_request,block_id:'block',entry_ids:args.p_scope==='block'?['e1','e2']:['e2'],scope:args.p_scope,status:'pending',requested_by:'participant',reason:args.p_reason,created_at:'2026-11-13'}];
 else if(name==='withdraw_entry_cancellation')requests=requests.map(r=>r.id===args.p_request?{...r,status:'withdrawn'}:r);
 else if(name==='decide_entry_cancellation'){requests=requests.map(r=>r.id===args.p_request?{...r,status:args.p_approve?'approved':'rejected',decision_note:args.p_decision.note}:r);if(args.p_approve)entries=entries.map(e=>e.id==='e2'?{...e,status:'cancelled'}:e);}
 else throw Error('Unexpected RPC '+name);return {data,error:null};}};
function Harness(){if(query.has('queue')){const queueEntries=[...entries.map((e,i)=>({...e,horse_id:'horse',rider_contact_id:'rider',owner_contact_id:'owner',entry_number:101,is_late:false,status:query.get('queue')==='finance'&&i===1?'pending_checkout':'active'})),{...entries[0],id:'e3',class_id:'c3',horse_id:'horse',owner_contact_id:'owner',rider_contact_id:'rider',entry_number:101}];window.prepared=[];return React.createElement(ScoringView,{locale:'fr',blocks:[{id:'block',name:'Bloc concerné',show_id:'show1',entries_close_at:'2020-01-01'},{id:'other',name:'Bloc indépendant',show_id:'show1',entries_close_at:'2020-01-01'}],classes:[...classes,{id:'c3',name:'Other class',block_id:'other'}],entries:queueEntries,horses:[{id:'horse',name:'Pilot horse'}],contacts:[{id:'rider',first_name:'Pilot',last_name:'Rider'},{id:'owner',first_name:'Pilot',last_name:'Owner'}],showDays:[],showScoreClassSetups:[],showScorePaidWarmups:[],shows:[shows[0]],onDeleteShowScorePaidWarmup:async()=>{},onPrepareShowScoreClass:async block=>window.prepared.push(block.id)});}const [org,setOrg]=useState('org1'),[show,setShow]=useState('show1'),[revision,setRevision]=useState(0);return React.createElement(React.Fragment,null,
React.createElement(WorkspaceContext,{organizations,shows,organization:organizations.find(o=>o.id===org),show:shows.find(s=>s.id===show),showContext:true,loading:false,locale:'fr',onOrganizationChange:id=>{setOrg(id);setShow('')},onShowChange:setShow}),
React.createElement('h1',null,'Inscriptions · concours pilote'),React.createElement('p',null,'TEST LOCAL — données fictives, aucun appel externe'),
React.createElement(CancellationProvider,{showId:'show1'},React.createElement('section',{'data-revision':revision},React.createElement('h2',null,'Intermediate Open'),React.createElement(CancellationActions,{entry:entries[1],entries,block:{id:'block',draw_prepared_at:query.has('draw')?'2026-11-13':null},classes,profileId:staff?'secretary':'participant',staff,locale:'fr',onRefresh:()=>setRevision(n=>n+1)}))));}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script></body></html>`;
const server = await createServer({ configFile: false, envDir: false, plugins: [{ name: 'lifecycle-fixtures', enforce: 'pre', load(id) { if (id.endsWith('/src/lib/supabase.ts')) return 'export function requireSupabase(){return window.fixtureClient};export const supabase=null;'; }, configureServer(server) { server.middlewares.use('/lifecycle-test', async (_req, res, next) => { try { res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/lifecycle-test', html)); } catch (error) { next(error); } }); } }, react()], server: { host: '127.0.0.1', port: 5199, strictPort: true } });
let browser;
const passed = [];
let complete = false;
try {
  await server.listen(); browser = await chromium.launch(process.platform === 'win32' ? { channel: 'chrome', headless: true } : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  const go = suffix => page.goto('http://127.0.0.1:5199/lifecycle-test' + suffix);
  await go('');
  await page.getByRole('button', { name: 'Changer d’association ou de concours' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: '.tmp/entry-lifecycle-ui/context-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.tmp/entry-lifecycle-ui/context-mobile.png' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.getByRole('searchbox').fill('finale');
  await page.locator('[data-show-id="show2"]').click();
  await expect(page.getByTestId('active-show-context')).toHaveText('Finale régionale');
  await page.getByRole('button', { name: 'Changer d’association ou de concours' }).click();
  await page.getByLabel('Association', { exact: true }).selectOption('org2');
  await expect(page.locator('dialog [data-show-id="show1"]')).toHaveCount(0);
  await page.locator('[data-show-id="show3"]').click();
  await expect(page.getByTestId('active-show-context')).toHaveText('Ontario Classic');
  passed.push('visible active context, search, organization isolation and show change');
  await go(''); await page.getByRole('button', { name: 'Demander l’annulation', exact: true }).click();
  await page.getByLabel('Portée').selectOption('block');
  await page.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByText('Annulation en attente · draw bloqué pour ce bloc')).toBeVisible();
  await page.getByRole('button', { name: 'Retirer ma demande' }).click();
  await expect(page.getByText('Dernière demande : retirée')).toBeVisible();
  passed.push('participant block request and withdrawal keep separate request state');
  await go('?draw=1'); await expect(page.getByText('Draw généré : procédure de scratch requise.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Demander l’annulation', exact: true })).toHaveCount(0);
  passed.push('generated unpublished draw requires scratch');
  await go('?role=staff'); await page.getByRole('button', { name: 'Traiter la demande' }).click();
  await page.screenshot({ path: '.tmp/entry-lifecycle-ui/review-loading.png' });
  await page.getByLabel('Crédit au compte', { exact: true }).selectOption('custom');
  await page.getByLabel('Montant du crédit', { exact: true }).fill('50');
  await page.getByLabel('Taxes du crédit', { exact: true }).selectOption('inclusive');
  await page.getByLabel('Frais d’annulation (0 = aucuns frais)', { exact: true }).fill('12');
  await page.getByLabel('Taxes des frais', { exact: true }).selectOption('exclusive');
  await expect(page.locator('.cancellation-preview')).toContainText('36,20');
  await page.screenshot({ path: '.tmp/entry-lifecycle-ui/cancellation-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.tmp/entry-lifecycle-ui/cancellation-mobile.png' });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.getByRole('button', { name: 'Approuver et appliquer' }).click();
  await expect(page.getByText('Dernière demande : approuvée')).toBeVisible();
  assert.equal(await page.evaluate(() => window.calls.filter(c => c.name === 'decide_entry_cancellation').length), 1);
  passed.push('secretary custom credit, explicit tax choices, exact preview and approval, desktop/mobile');
  await go('?role=staff'); await page.getByRole('button', { name: 'Traiter la demande' }).click();
  await page.getByLabel('Note de décision').fill('Inscription maintenue');
  await page.getByRole('button', { name: 'Refuser · maintenir l’inscription' }).click();
  await expect(page.getByText(/Dernière demande : refusée/)).toBeVisible();
  passed.push('individual refusal retains entry');
  for(const queue of ['finance','cancel']){
    await go('?queue='+queue);
    const affected=page.locator('.scoring-class-group').filter({hasText:'Bloc concerné'}),other=page.locator('.scoring-class-group').filter({hasText:'Bloc indépendant'});
    await expect(affected).toContainText(queue==='finance'?'attendent un paiement ou une préautorisation':'demande(s) d’annulation à traiter');
    await expect(affected.getByRole('button',{name:'Sortir ordre',exact:true})).toBeDisabled();
    await expect(other.getByRole('button',{name:'Sortir ordre',exact:true})).toBeEnabled();
    await other.getByRole('button',{name:'Sortir ordre',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.prepared),['other']);
  }
  passed.push('financial and cancellation blockers explain the affected draw while unrelated blocks remain available');
  assert.deepEqual(errors, []);
  complete=true;
  console.log('PASS:', passed.join('\nPASS: '));
} finally {
  writeFileSync('.tmp/entry-lifecycle-ui/results.json', JSON.stringify({ complete, mode: 'browser mocks; financial calculations separately tested in SQL', passed }, null, 2));
  await browser?.close(); await server.close();
}
