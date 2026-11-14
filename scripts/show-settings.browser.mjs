import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium, expect } from '@playwright/test';
import { serverlessBrowser } from '../server/vet/serverless-browser.mjs';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

mkdirSync('.tmp/show-settings-ui', { recursive: true });
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" style="max-width:1100px;margin:24px auto;padding:16px"></main><script type="module">
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {ShowContextHeader} from '/src/features/shows/ShowContextHeader.tsx';import {ShowsView} from '/src/features/shows/ShowsView.tsx';import '/src/styles.css';
const params=new URLSearchParams(location.search),locale=params.get('locale')||'fr';window.updates=[];
const initial={id:'show-current',organization_id:'org',name:'Concours pilote — automne',slug:'pilot',start_date:'2026-11-13',end_date:'2026-11-15',status:'open',entry_payment_policy:'card_on_file_preauth',reservation_payment_policy:'pay_at_booking',entry_preauth_timing:'show_start',entry_preauth_time:'07:45',entry_settlement_timing:'show_end',entry_settlement_due_time:'15:30',entry_auto_capture_enabled:false,entry_preauth_amount_strategy:'entry_balance_with_margin',entry_preauth_margin_percent:12};
function Harness(){const [show,setShow]=useState(initial);const update=async(id,input)=>{if(params.has('fail'))throw Error('TEST save failed');window.updates.push({id,input});setShow(s=>({...s,...input}));};return params.has('list')?React.createElement(ShowsView,{locale,blocks:[],classes:[],entries:[],invoices:[],organization:{id:'org'},showAnnouncements:[],showDays:[],showScoreClassSetups:[],shows:[show],stallOptions:[],onCreateShow:async()=>show,onCreateShowAnnouncement:async()=>{},onDeleteShowAnnouncement:async()=>{},onUpdateShow:update,onViewChange:()=>{}}):React.createElement(ShowContextHeader,{show,locale,canEdit:!params.has('readonly'),onUpdateShow:update});}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script></body></html>`;
const server = await createServer({ configFile: false, envDir: false, plugins: [react(), { name: 'show-settings-test', configureServer(server) { server.middlewares.use('/show-settings-test', async (_req, res, next) => { try { res.setHeader('Content-Type', 'text/html'); res.end(await server.transformIndexHtml('/show-settings-test', html)); } catch (error) { next(error); } }); } }], server: { host: '127.0.0.1', port: 5201, strictPort: true } });
let browser;
try {
  await server.listen(); browser = process.platform === 'linux' ? await serverlessBrowser.launch({ headless: true }) : await chromium.launch(process.platform === 'win32' ? { channel: 'chrome', headless: true } : { headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  for (const locale of ['fr', 'en']) {
    await page.goto('http://127.0.0.1:5201/show-settings-test?locale=' + locale);
    await page.screenshot({ path: '.tmp/show-settings-ui/header-' + locale + '.png' });
    await page.getByRole('button', { name: locale === 'fr' ? 'Paramètres du concours' : 'Show settings', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const policy = dialog.getByLabel(locale === 'fr' ? 'Gestion des inscriptions' : 'Entry handling');
    await expect(policy).toBeVisible();
    assert((await policy.boundingBox()).y < 650, 'Entry settings should be visible immediately');
    await policy.selectOption('manual');
    await page.screenshot({ path: '.tmp/show-settings-ui/settings-' + locale + '.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.tmp/show-settings-ui/mobile-' + locale + '.png' });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await dialog.getByRole('button', { name: locale === 'fr' ? 'Sauvegarder' : 'Save changes', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const saved = await page.evaluate(() => window.updates);
    assert.equal(saved.length, 1); assert.equal(saved[0].id, 'show-current'); assert.equal(saved[0].input.entry_payment_policy, 'manual');
    assert.equal(saved[0].input.reservation_payment_policy, 'pay_at_booking'); assert.equal(saved[0].input.entry_preauth_time, '07:45'); assert.equal(saved[0].input.entry_preauth_margin_percent, 12); assert.equal(saved[0].input.entry_auto_capture_enabled, false);
    await expect(page.locator('.show-entry-policy strong')).toHaveText(locale === 'fr' ? 'Gestion manuelle' : 'Manual handling');
    await page.getByRole('button', { name: locale === 'fr' ? 'Modifier la gestion des inscriptions' : 'Change entry handling' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.setViewportSize({ width: 1365, height: 1000 });
  }
  await page.goto('http://127.0.0.1:5201/show-settings-test?readonly=1');
  await expect(page.getByRole('button')).toHaveCount(0);
  await page.goto('http://127.0.0.1:5201/show-settings-test?list=1');
  await page.getByRole('button', { name: 'Paramètres du concours', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Gestion des inscriptions')).toBeVisible();
  await page.goto('http://127.0.0.1:5201/show-settings-test?fail=1');
  await page.getByRole('button', { name: 'Paramètres du concours', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sauvegarder', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('TEST save failed');
  assert.deepEqual(errors, []);
  console.log('PASS: direct show settings, manual entry mode, preserved payment settings, FR/EN, mobile, list access, read-only access and save failure');
} finally { await browser?.close(); await server.close(); }
