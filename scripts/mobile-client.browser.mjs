import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from '@playwright/test';

// Isolate the UI review from accounts, payments, and every external service.
const fakeClient = `
export const supabase = { rpc: async(name,args) => { (window.mobileRpcCalls ??= []).push({name,args}); return {data: name === 'billing_navigation_scope' ? {staff:false} : name.startsWith('list_my_billing') ? {items:[],total:0} : [], error:null}; }, auth:{getSession:async()=>({data:{session:null}})} };
export const requireSupabase = () => supabase;`;
const server = await createServer({ configFile: false, envDir: false, publicDir: 'public',
  plugins: [{ name: 'isolated-mobile-client', enforce: 'pre', load(id) { if (id.endsWith('/src/lib/supabase.ts')) return fakeClient; } }, react()],
  server: { host: '127.0.0.1', port: 5197, strictPort: true, fs: { deny: ['.env', '.env.*', '**/.tmp/**', '**/.git/**'] } },
});
let browser;
const base = 'http://127.0.0.1:5197/scripts/tests/mobile-client/fixture.html';
const sizes = [[320,568],[390,844],[430,932],[667,375],[844,390],[932,430],[768,1024],[1024,768],[1440,900]];
const views = ['my-overview','my-profile','my-horses','my-riders','my-entries','my-stalls','my-back-numbers','my-invoices'];
await mkdir('.tmp/mobile-client', { recursive: true });
async function fits(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert.equal(overflow, false, `${label}: page must fit horizontally`);
}
async function clickable(locator, label) {
  await locator.scrollIntoViewIfNeeded();
  const reachable = await locator.evaluate(element => { const r = element.getBoundingClientRect(); const hit = document.elementFromPoint(r.x+r.width/2, r.y+r.height/2); return !!hit && (hit === element || element.contains(hit)); });
  assert(reachable, `${label}: action is covered or outside the viewport`);
}
try {
  await server.listen();
  browser = await chromium.launch({ channel: process.env.MOBILE_BROWSER_CHANNEL || 'chrome', headless: true });
  for (const locale of ['fr','en']) for (const [width,height] of sizes) {
    const capture = locale === 'fr' && [390,844,1440].includes(width);
    const page = await browser.newPage({ viewport: {width,height}, hasTouch: width <= 980 });
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    for (const view of views) {
      await page.goto(`${base}?locale=${locale}&view=${view}`);
      await page.locator('.workspace h1').waitFor();
      await fits(page, `${locale} ${width}x${height} ${view}`);
      if (capture) await page.screenshot({path:`.tmp/mobile-client/${locale}-${width}x${height}-${view}.png`,fullPage:true});
      if (['my-horses','my-riders','my-entries'].includes(view)) {
        await page.locator('.form-launch-panel .primary-button').click();
        const form = page.getByRole('dialog');
        await form.waitFor();
        await fits(page, `${view} form`);
        if (capture) await page.screenshot({path:`.tmp/mobile-client/${locale}-${width}x${height}-${view}-form.png`,fullPage:false});
        const fields = form.locator('input:not([type="hidden"]):visible, select:visible, textarea:visible');
        for (let index = 0; index < await fields.count(); index++) {
          const field = fields.nth(index);
          await field.scrollIntoViewIfNeeded();
          const fitsField = await field.evaluate(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; });
          assert(fitsField, `${view} field ${index} is clipped`);
        }
        await clickable(page.getByRole('button',{name:'Close modal',exact:true}), `${view} close`);
        await page.getByRole('button',{name:'Close modal',exact:true}).click();
      }
      if (view === 'my-riders') {
        await page.locator('.membership-buy-button').first().click();
        await page.getByRole('dialog').waitFor();
        await fits(page, 'Membership form');
        if (capture) await page.screenshot({path:`.tmp/mobile-client/${locale}-${width}x${height}-membership-form.png`,fullPage:false});
        await clickable(page.getByRole('button',{name:'Close modal',exact:true}), 'Membership close');
        await page.getByRole('button',{name:'Close modal',exact:true}).click();
      }
      if (view === 'my-stalls') {
        await page.getByRole('button',{name: locale === 'fr' ? 'Nouvelle réservation' : 'New reservation',exact:false}).first().click();
        await page.getByRole('dialog').waitFor();
        await fits(page, 'Reservation form');
        if (capture) await page.screenshot({path:`.tmp/mobile-client/${locale}-${width}x${height}-reservation-form.png`,fullPage:false});
        await clickable(page.getByRole('button',{name:'Close modal',exact:true}), 'Reservation close');
        await page.getByRole('button',{name:'Close modal',exact:true}).click();
      }
    }
    await page.goto(`${base}?locale=${locale}&view=my-profile`);
    const complete = page.locator('.onboarding-step-cta').first();
    await clickable(complete, 'Profile completion');
    await page.locator('.onboarding-title-action').first().click();
    await page.getByLabel(locale === 'fr' ? 'Prénom' : 'First name', {exact:true}).fill('Pilote');
    await fits(page, 'Profile edit form');
    await clickable(page.locator('.profile-form button[type="submit"]'), 'Profile save');
    await page.locator('.profile-form button[type="submit"]').click();
    assert.equal(await page.evaluate(() => window.mobileActions.at(-1)), 'profile-saved');
    await page.locator('.onboarding-title-action').nth(1).click();
    assert.equal(await page.evaluate(() => window.mobileActions.at(-1)), 'my-horses');
    // Reining wins even when another directory is configured as association default.
    await page.locator('.form-launch-panel .primary-button').click();
    await page.getByRole('dialog').waitFor();
    const reining = page.getByRole('dialog').getByRole('button', { name: 'Reining', exact: true });
    assert.equal(await reining.getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', {name:'Close modal',exact:true}).click();
    if (width <= 980) {
      const toggle = page.locator('.mobile-menu-toggle');
      await toggle.click();
      const menuZoom = await page.context().newCDPSession(page);
      await menuZoom.send('Emulation.setPageScaleFactor', {pageScaleFactor:2});
      await page.waitForFunction(() => {
        const r = document.querySelector('.sidebar-action').getBoundingClientRect(), v = visualViewport;
        return r.right <= v.offsetLeft + v.width + 1 && r.bottom <= v.offsetTop + v.height + 1;
      });
      await clickable(page.locator('.sidebar-action'), 'Zoomed sign out');
      await menuZoom.send('Emulation.setPageScaleFactor', {pageScaleFactor:1});
      await menuZoom.detach();
      await clickable(page.locator('.sidebar-action'), 'Sign out');
      await page.locator('.sidebar-action').click();
      assert.equal(await page.evaluate(() => window.mobileActions.at(-1)), 'signed-out');
      // An open menu retains its navigation model when the phone rotates.
      await page.setViewportSize({width: height <= 980 ? height : 844,height:width});
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      await clickable(page.locator('.sidebar-action'), 'Rotated sign out');
      await toggle.click();
      await page.setViewportSize({width,height});
    }
    await page.locator('#long-modal').click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input').last().fill('test');
    await clickable(page.getByRole('button',{name:'Close modal',exact:true}), 'Scrolled modal close');
    await page.screenshot({path:`.tmp/mobile-client/${locale}-${width}x${height}.png`,fullPage:false});
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setPageScaleFactor', {pageScaleFactor:2});
    const close = page.getByRole('button',{name:'Close modal',exact:true});
    await page.waitForFunction(() => {
      const button = document.querySelector('[aria-label="Close modal"]');
      const r = button.getBoundingClientRect(), v = visualViewport;
      return r.left >= v.offsetLeft && r.right <= v.offsetLeft + v.width + 1 && r.top >= v.offsetTop && r.bottom <= v.offsetTop + v.height + 1;
    });
    await clickable(close, 'Zoomed modal close');
    await session.send('Emulation.setPageScaleFactor', {pageScaleFactor:1});
    await session.detach();
    await page.getByRole('button',{name:'Close modal',exact:true}).click();
    await page.goto(`${base}?locale=${locale}&warnings=1`);
    await page.locator('.client-setup-warning').first().waitFor();
    await fits(page, 'Dashboard warnings');
    await clickable(page.locator('.client-warning-cta').first(), 'Complete profile warning');
    await page.locator('.client-warning-content strong').first().click();
    assert.equal(await page.evaluate(() => window.mobileActions.at(-1)), 'my-profile');
    await page.goto(`${base}?locale=${locale}&auth=1`);
    await page.locator('.segmented-control').waitFor();
    await fits(page, 'Sign in');
    await page.locator('.segmented-control button').nth(1).click();
    await fits(page, 'Sign up');
    for (const field of await page.locator('form input, form select').all()) {
      await field.scrollIntoViewIfNeeded();
      const readable = await field.evaluate(element => parseFloat(getComputedStyle(element).fontSize) >= 16);
      if (width <= 980) assert(readable, 'Mobile fields must avoid automatic focus zoom');
    }
    await page.goto(`${base}?locale=${locale}&view=my-profile&unlinked=1`);
    const directory = page.getByRole('combobox',{name: locale === 'fr' ? 'Répertoire' : 'Directory',exact:true});
    await directory.waitFor();
    assert.equal(await directory.inputValue(), 'reining-directory');
    assert.deepEqual(await page.evaluate(() => window.mobileRpcCalls.filter(call => /directory/.test(call.name))), []);
    await fits(page, 'Directory confirmation form');
    await page.getByRole('button',{name: locale === 'fr' ? 'Confirmer mon répertoire' : 'Confirm my directory',exact:true}).click();
    await page.waitForFunction(() => window.mobileRpcCalls.some(call => call.name === 'join_public_directory'));
    assert.equal(await page.evaluate(() => window.mobileRpcCalls.find(call => call.name === 'join_public_directory').args.p_directory_id), 'reining-directory');
    assert.deepEqual(errors, [], `${locale} ${width}x${height}: runtime errors`);
    await page.close();
    console.log(`PASS ${locale} ${width}x${height}`);
  }
  console.log(`PASS: ${views.length} client pages plus sign-in/signup, FR/EN, ${sizes.length} portrait/landscape/tablet/desktop sizes; six client forms, profile save, completion actions, Reining selection, menus, sign-out, rotation, 200% zoom, long modal close; external traffic blocked.`);
} finally { await browser?.close(); await server.close(); }
