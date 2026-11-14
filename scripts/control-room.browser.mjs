import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
import { serverlessBrowser } from '../server/vet/serverless-browser.mjs';

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" style="max-width:1500px;margin:20px auto;padding:16px"></main><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {ControlRoomView} from '/src/features/controlRoom/ControlRoomView.tsx';import '/src/styles.css';
const now='2026-11-14T02:00:00.000Z';const day={id:'day',organization_id:'org',show_id:'show',day_number:1,day_name:'Samedi',day_date:'2026-11-14',sort_order:1,created_at:now,updated_at:now};
const block=(id,name,time,version,published)=>({id,organization_id:'org',show_id:'show',show_day_id:'day',block_template_id:null,slate_id:null,name,display_label:id==='block-1'?'Bloc 1':'Bloc 2',block_type:'competition',arena:'Aréna principale',pattern:'8',custom_pattern:null,entries_close_at:now,draw_prepared_at:now,draw_version:version,draw_published_version:published,draw_published_at:published?now:null,draw_published_by_user_id:null,judge_display_name:null,schedule_start_mode:'fixed',scheduled_time:time,estimated_duration:'1 h',sort_order:version,schedule_status:id==='block-2'?'running':'open',schedule_is_public:true,results_are_public:false,notes:null,created_at:now,updated_at:now});
const blocks=[block('block-1','Open Derby','08:00',2,1),block('block-2','Novice Horse','10:30',1,1),{...block('break','Pause repas','12:00',0,null),block_type:'break',sort_order:3,draw_prepared_at:null}];
const classes=blocks.filter(b=>b.block_type==='competition').map((b,i)=>({id:'class-'+(i+1),organization_id:'org',show_id:'show',block_id:b.id,class_template_id:null,organization_discipline_id:'discipline',name:b.name+' Level 1',description:null,level:null,code:String(1000+i),entry_fee:100,judge_fee:20,payout_schedule_type:'nrha_schedule_a',added_money:0,retainage_percent:null,trophy_or_plaque_fee:0,sanctioning_fee_percent:null,payout_rules:{},payout_notes:null,minimum_entries:1,registration_status:'open',is_public:true,back_number_policy_override:null,sort_order:1,eligibility_rules:{},notes:null,created_at:now,updated_at:now,governing_body_assignments:[]}));
const entries=classes.map((c,i)=>({id:'entry-'+i,organization_id:'org',show_id:'show',horse_id:'horse-'+i,class_id:c.id,created_by_user_id:'me',owner_contact_id:'owner',rider_contact_id:'rider',payer_contact_id:'owner',status:'active',entry_number:120+i,base_fee:100,total_fees:100,is_late:false,late_fee_percent:0,late_fee_amount:0,created_at:now}));
const run=(id,draw,horse)=>({id,blockRunId:id,runId:id,draw,backNumber:String(120+draw),horse,rider:'Alex Rider',status:'pending'});
const setups=[{block_id:'block-1',runs:[run('run-1',1,'First Horse')],judges:[{id:'judge-1',name:'Judge One',order:1}],finalized:false,started_at:null},{block_id:'block-2',runs:[run('run-2',1,'Second Horse')],judges:[{id:'judge-2',name:'Judge Two',order:1}],finalized:false,started_at:now}];
const props={locale:'fr',blocks,blockJudgeAssignments:[{id:'judge-1',block_id:'block-1',display_name:'Judge One',sort_order:1},{id:'judge-2',block_id:'block-2',display_name:'Judge Two',sort_order:1}],classes,contacts:[],contactExternalIdentifiers:[],contactRoles:[],entries,entryResults:[{id:'result',block_id:'block-2',block_run_id:'run-2',class_id:'class-2'}],externalCredentialIssuers:[],horseExternalIdentifiers:[],horseHealthDocuments:[],horses:[],membershipRequirements:[],nrhaRiderRankings:[],organization:{id:'org',currency:'CAD',back_number_policy:'horse'},payoutCalculations:[{id:'payout',class_id:'class-2',status:'reviewed',calculated_at:now}],profileId:'me',show:{id:'show',name:'Autumn Reining Classic',late_entry_fee_percent:50},showDays:[day],showScoreClassSetups:setups,showScorePaidWarmups:[],onCreateContact:async()=>{},onCreateEntry:async()=>{},onCreateHorse:async()=>{},onCreateHorseHealthDocument:async()=>{},onPrepareShowScoreClass:async()=>{window.actions.push('prepare')},onPublishBlockDraw:async()=>{window.actions.push('publish')},onUpdatePayoutCalculationStatus:async()=>{window.actions.push('results')},onVerifyGvlCogginsDocument:async()=>{},onVerifyNrhaEligibility:async()=>{},onVerifyNrhaHorse:async()=>{},onViewChange:view=>window.actions.push(view)};window.actions=[];createRoot(document.getElementById('root')).render(React.createElement(ControlRoomView,props));
</script></body></html>`;

const server = await createServer({
  configFile: false,
  envDir: false,
  plugins: [react(), { name: 'control-room-fixture', configureServer(devServer) { devServer.middlewares.use('/control-room-test', async (_req, res, next) => { try { res.setHeader('Content-Type', 'text/html'); res.end(await devServer.transformIndexHtml('/control-room-test', html)); } catch (error) { next(error); } }); } }],
  server: { host: '127.0.0.1', port: 5206, strictPort: true, fs: { deny: ['.env', '.env.*', '**/.git/**', '**/.tmp/**'] } },
});

let browser;
try {
  await server.listen();
  await mkdir('.tmp/control-room-ui', { recursive: true });
  browser = process.platform === 'linux' ? await serverlessBrowser.launch() : await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('http://127.0.0.1:5206/control-room-test');
  await expect(page.getByRole('heading', { name: 'Poste de contrôle' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Republier le draw/ })).toBeVisible();
  await expect(page.getByText('v2 · à publier', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Novice Horse/ }).click();
  await expect(page.getByRole('button', { name: /PDF v1/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Publier les classes terminées/ })).toBeVisible();
  await page.getByRole('button', { name: 'Inscription tardive', exact: true }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Choisir le bloc');
  await page.getByRole('dialog').getByRole('button', { name: /Open Derby/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Inscription tardive · Open Derby');
  await expect(page.getByLabel('Position dans le draw')).toHaveValue('negative');
  await page.screenshot({ path: '.tmp/control-room-ui/desktop.png', fullPage: true });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:5206/control-room-test');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: '.tmp/control-room-ui/mobile.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS control room: compact schedule, draw publication state, live results, late-entry placement and responsive layout. External traffic blocked.');
} finally {
  await browser?.close();
  await server.close();
}
