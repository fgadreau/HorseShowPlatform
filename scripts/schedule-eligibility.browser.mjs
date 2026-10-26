import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium,expect} from '@playwright/test';
import bundledChromium from '@sparticuz/chromium';
const server=await createServer({configFile:false,envDir:false,plugins:[{name:'isolated-schedule-fixture',enforce:'pre',load(id){if(id.endsWith('/src/lib/supabase.ts'))return 'export const supabase=null;export const requireSupabase=()=>window.scheduleClient;';}},react()],server:{host:'127.0.0.1',port:5196,strictPort:true,fs:{deny:['.env','.env.*','**/.git/**','**/.tmp/**']}}});
let browser;
try{
 await server.listen();await mkdir('.tmp/schedule-ui',{recursive:true});
 const launch=process.platform==='linux'?{executablePath:await bundledChromium.executablePath(),args:bundledChromium.args}:{channel:'chrome'};
 browser=await chromium.launch({...launch,headless:true});const page=await browser.newPage();page.setDefaultTimeout(12000);
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 async function open(scenario,locale='en'){await page.goto(`http://127.0.0.1:5196/scripts/tests/schedule-ui/index.html?scenario=${scenario}&locale=${locale}`);}
 async function choose(placeholder,name){await page.getByRole('combobox',{name:placeholder}).click();await page.getByRole('option').filter({hasText:name}).first().click();}
 for(const [width,height]of [[320,568],[390,844],[844,390]])for(const locale of ['en','fr']){
  await page.setViewportSize({width,height});await open('requests',locale);
  await expect(page.getByRole('button')).toHaveCount(1);assert.equal(await page.getByRole('combobox').count(),0);
  await expect(page.getByRole('button')).toHaveClass(/ghost-button/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(locale==='fr'&&width===390)await page.screenshot({path:'.tmp/schedule-ui/warmup-requests-mobile.png',fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});await open('entry');
 await choose('Search horse','Pilot Horse');await choose('Search rider','Pilot Rider');
 await expect.poll(()=>page.evaluate(()=>window.checks.length)).toBe(3);
 await expect.poll(()=>page.locator('.entry-class-status.success').count()).toBe(1);
 assert.deepEqual(await page.evaluate(()=>window.checks.map(check=>check.id)),['class0','class1','class2']);
 assert.equal(await page.evaluate(()=>window.maxActiveChecks),1);
 await expect(page.getByRole('button',{name:/House class/})).toBeDisabled();
 assert.equal(await page.getByRole('button',{name:/Request a spot/}).count(),1);
 await expect(page.getByRole('button',{name:/Request a spot/})).toHaveClass(/primary-button/);
 await page.locator('.entry-day-nav button').last().click();
 await expect(page.getByRole('button',{name:/Class 2/})).toBeEnabled();
 assert.equal(await page.evaluate(()=>window.checks.length),3);
 await open('slow');await choose('Search horse','Pilot Horse');await choose('Search rider','Pilot Rider');
 await expect.poll(()=>page.evaluate(()=>window.checks.length)).toBe(1);
 await page.locator('.entry-day-nav button').last().click();
 await expect.poll(()=>page.evaluate(()=>window.checks.length)).toBe(3);
 assert.deepEqual(await page.evaluate(()=>window.checks.map(check=>check.id)),['class0','class1','class2']);
 await open('slow');await choose('Search horse','Pilot Horse');await choose('Search rider','Pilot Rider');
 await expect.poll(()=>page.evaluate(()=>window.checks.length)).toBe(1);
 await choose('Search horse','Second Horse');
 await expect.poll(()=>page.evaluate(()=>window.checks.filter(check=>check.horse==='horse2').length)).toBe(3);
 assert.equal(await page.evaluate(()=>window.checks.filter(check=>check.horse==='horse').length),1);
 await open('failed');await choose('Search horse','Pilot Horse');await choose('Search rider','Pilot Rider');
 await expect(page.getByRole('button',{name:'Retry checks',exact:true})).toBeVisible();
 assert.deepEqual(await page.evaluate(()=>window.checks.map(check=>check.id)),['class0','class1','class2']);
 await page.getByRole('button',{name:'Retry checks',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.checks.length)).toBe(4);
 assert.deepEqual(await page.evaluate(()=>window.checks.map(check=>check.id)),['class0','class1','class2','class1']);
 await open('exclusions');assert.equal(await page.getByRole('combobox',{name:'Exclude',exact:true}).count(),0);
 await choose('Search for a rider','Pilot Rider');await page.getByLabel('Internal reason (optional)').fill('Pilot rule');await page.getByRole('button',{name:'Add to list'}).click();
 await expect(page.getByRole('button',{name:'Remove from list'})).toBeVisible();
 assert.deepEqual(await page.evaluate(()=>({horse:window.exclusions[0].horse_id,rider:window.exclusions[0].rider_contact_id})),{horse:undefined,rider:'rider'});
 await page.getByRole('button',{name:'Remove from list'}).click();await expect(page.getByText('No exclusions for this class.')).toBeVisible();
 assert.deepEqual(errors,[]);
 console.log('PASS schedule: warm-up tracking has no request controls; shared button styles FR/EN mobile; all days checked sequentially without navigation, navigation preserves queue, imported ranking never overrides ReinerSuite, house exclusions disable selection, staff adds/removes rider-only exclusions. External traffic blocked.');
}finally{await browser?.close();await server.close();}
