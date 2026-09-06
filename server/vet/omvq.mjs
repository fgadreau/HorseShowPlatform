// Replaceable adapter. Never replay ZK requests or retain response bodies/screenshots.
export const OMVQ_URL = 'https://omvq.connexence.com/ext/omvq/tm/repertoire/trouverMembre.zul';
export function normalizeName(value) {
 return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/gu, '').replace(/^\s*(?:Dre|Dr)\.?\s+/iu, '').replace(/\s+m\.\s*v\.\s*$/iu, '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('fr-CA');
}
export function assessCards(cards, expected, count) {
 if (count === 0 && cards.length === 0) return { result: 'not_found' };
 if (count !== 1 || cards.length !== 1) return { result: 'ambiguous' };
 const card = cards[0];
 const permit = card.permit?.match(/^Régulier\s+Numéro\s+([0-9]{1,12})$/u)?.[1];
 // Unknown permit formats/statuses fail closed; do not guess from substring matches.
 if (!permit || !card.name || !card.status || permit !== expected.permit_number) return { result: 'ambiguous' };
 const fields = { name: card.name, permit, status: card.status };
 if (normalizeName(card.name) !== normalizeName(expected.name)) return { ...fields, result: 'name_mismatch' };
 if (card.status === 'Actif') return { ...fields, result: 'verified' };
 return { ...fields, result: card.status === 'Inactif' ? 'inactive' : 'ambiguous' };
}
export async function lookupOmvq(expected, { chromium, url = OMVQ_URL } = {}) {
 let browser,timedOut=false;
 const deadline=setTimeout(()=>{timedOut=true;void browser?.close().catch(()=>{});},45000);
 try {
  if (!/^[0-9]{1,12}$/.test(expected.permit_number)) return { result: 'ambiguous' };
  browser = await chromium.launch({ headless: true, timeout:15000 });
  if(timedOut)return {result:'unavailable'};
  const context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const first = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  if (!first?.ok()) return { result: 'unavailable' };
  // Stop on protection widgets; never solve or bypass them.
  if (await page.locator('iframe[src*="captcha"], iframe[src*="challenge"], .g-recaptcha, .h-captcha').count()) return { result: 'unavailable' };
  const field = page.locator('div.form-group').filter({ has: page.locator('label', { hasText: /^Numéro de permis$/ }) }).locator('input');
  await field.fill(expected.permit_number);
  const reply = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname.startsWith('/zkau'));
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  const response = await reply;
  if (!response.ok()) return { result: 'unavailable' };
  await response.finished();
  await page.waitForFunction(() => !document.querySelector('.z-loading') && /\d+ résultat\(s\) pour :/.test(document.body.innerText));
  // Read only result count and the three allowed fields. No whole-page snapshots or network logs.
  const count = await page.evaluate(() => Number(document.body.innerText.match(/(\d+) résultat\(s\) pour :/)?.[1] ?? NaN));
  const cards = await page.locator('.panel-membre:visible').evaluateAll(elements => elements.map(element => {
   const name = element.querySelector('.affichage-nom');
   const label = [...element.querySelectorAll('.plabel')].find(el => el.textContent.trim() === 'Permis :');
   return { name: name?.textContent.trim(), status: name?.parentElement.querySelector('span.plabel')?.textContent.trim(), permit: label?.nextElementSibling?.textContent.trim() };
  }));
  return timedOut?{result:'unavailable'}:assessCards(cards, expected, count);
 } catch { return { result: 'unavailable' }; }
 finally { clearTimeout(deadline);if (browser) await browser.close().catch(() => {}); }
}
