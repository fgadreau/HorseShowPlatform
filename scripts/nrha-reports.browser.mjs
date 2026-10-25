// Run after npm run test:reports. Exercises the real component with synthetic data;
// no Supabase connection or shared records are used.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { chromium } from 'playwright-core';
import executable from '@sparticuz/chromium';

const require = createRequire(import.meta.url);
const { fixture } = require('../.tmp/reports-tests/scripts/nrha-reports-test.js');
const data = fixture();
data.organization.name = 'DEMO association';
let browser;
const harness = { name: 'nrha-reports-test-page', configureServer(server) {
server.middlewares.use('/reports-test', async (req, res, next) => {
  try {
    const locale = req.url.startsWith('/en') ? 'en' : 'fr';
    const html = `<!doctype html><html lang="${locale}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';
import {createRoot} from 'react-dom/client';
import {ReportsView} from '/src/features/reports/ReportsView.tsx';
import '/src/styles.css';
createRoot(document.getElementById('root')).render(React.createElement(ReportsView,{data:${JSON.stringify(data)},locale:'${locale}'}));
</script></body></html>`;
    res.setHeader('Content-Type', 'text/html');
    res.end(await server.transformIndexHtml(`/reports-test/${locale}`, html));
  } catch (error) { next(error); }
});
} };
const server = await createServer({ configFile: false, envDir: false, plugins: [react(), harness], publicDir: false,
  server: { host: '127.0.0.1', port: 5197, strictPort: true, fs: { deny: ['.env', '.env.*', '**/.tmp/**', '**/.git/**'] } },
});
try {
  await server.listen();
  browser = await chromium.launch({ executablePath: await executable.executablePath(), headless: true, args: executable.args.filter((arg) => !['--single-process', '--disable-web-security', '--disable-site-isolation-trials'].includes(arg) && !arg.startsWith('--disable-features=')) });
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser error:', error.message); });
  page.on('console', (message) => { if (message.type() === 'error') console.error('Browser console:', message.text()); });
  await page.goto('http://127.0.0.1:5197/reports-test/fr');
  const button = page.getByRole('button', { name: 'Télécharger le CSV NRHA en USD' });
  await button.waitFor();
  assert.equal(await button.isDisabled(), true);
  await page.getByRole('combobox').first().selectOption('show');
  await page.getByLabel('Taux de change').fill('0,73');
  await page.waitForFunction(() => !document.querySelector('button.primary-button').disabled);
  assert.equal(await page.locator('tbody tr').count(), 3);
  const downloading = page.waitForEvent('download');
  await button.click();
  const download = await downloading;
  assert.equal(download.suggestedFilename(), '000123.csv');
  const csv = await readFile(await download.path(), 'utf8');
  assert.equal(csv.split('\r\n')[0], 'ShowNum;ShowName;ClassName;ClassCode;PatternNum;EntryCount;ShownCount;GoType;GoNum;Horse;HorseNrha;Member;MemberNrha;BackNum;PlaceNum;TotalScore;MoneyWon');
  assert.equal(csv.split('\r\n').length, 5);
  assert.ok(csv.includes('"Test; ""CSV"", Éloïse"'));
  await page.getByLabel('Taux de change').fill('0');
  await page.getByRole('alert').waitFor();
  assert.equal(await button.isDisabled(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await page.goto('http://127.0.0.1:5197/reports-test/en');
  await page.getByRole('heading', { name: 'Reports', exact: true }).waitFor();
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('NRHA browser: preview, CSV download, validation, mobile and English passed (synthetic data).');
} finally {
  await browser?.close();
  await server.close();
}
