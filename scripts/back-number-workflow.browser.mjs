import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium,expect} from '@playwright/test';
import bundledChromium from '@sparticuz/chromium';
const server=await createServer({configFile:false,envDir:false,plugins:[{name:'back-number-client-fixture',enforce:'pre',load(id){if(id.endsWith('/src/lib/supabase.ts'))return 'export const supabase=null;export const requireSupabase=()=>window.bnClient;';}},react()],server:{host:'127.0.0.1',port:5199,strictPort:true,fs:{deny:['.env','.env.*','**/.git/**','**/.tmp/**']}}});
let browser;
try{
 await server.listen();
 const launch=process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:process.platform==='linux'&&!process.env.MOBILE_BROWSER_CHANNEL?{executablePath:await bundledChromium.executablePath(),args:bundledChromium.args}:{channel:process.env.MOBILE_BROWSER_CHANNEL||'chrome'};
 browser=await chromium.launch({...launch,headless:true});
 const page=await browser.newPage();page.setDefaultTimeout(10000);
 for(const locale of ['fr','en'])for(const [width,height]of [[320,568],[390,844],[844,390],[1024,768]]){
  await page.setViewportSize({width,height});const errors=[];page.removeAllListeners('pageerror');page.on('pageerror',error=>errors.push(error.message));
  await page.unroute('**/*');
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  async function open(scenario){await page.goto(`http://127.0.0.1:5199/scripts/tests/back-number-ui/index.html?scenario=${scenario}&locale=${locale}`);}
  const choice=()=>page.getByRole('combobox',{name:locale==='fr'?'Choix du dossard':'Back number choice'});
  await open('new');await expect(choice()).toHaveValue('personal');assert.equal(await page.evaluate(()=>window.bnSelection.ready),false);
  await page.getByRole('spinbutton',{name:locale==='fr'?'Numéro de dossard':'Back number',exact:true}).fill('432');
  await expect.poll(()=>page.evaluate(()=>window.bnSelection)).toEqual({choice:'personal',number:432,ready:true,requestFee:0});
  await choice().selectOption('request');await expect.poll(()=>page.evaluate(()=>window.bnSelection.ready)).toBe(true);
  await expect.poll(()=>page.evaluate(()=>window.bnSelection.requestFee)).toBe(15);
  await page.getByRole('button',{name:'Select a block'}).click();await expect(choice()).toHaveValue('request');
  await open('existing');await expect(choice()).toHaveValue('reuse');assert.equal(await page.evaluate(()=>window.bnSelection.number),123);
  await open('forced-personal');await expect(choice()).toHaveValue('request');await expect(choice()).toBeDisabled();
  assert.equal(await choice().locator('option[value="personal"]').count(),0);
  await open('forced-issued');await expect(choice()).toHaveValue('reuse');
  await open('pending');await expect(choice()).toHaveValue('request');await expect(choice()).toBeDisabled();
  await expect.poll(()=>page.evaluate(()=>window.bnSelection.requestFee)).toBe(0);
  await open('failure');await expect(page.getByRole('alert')).toContainText('Lookup failed');assert.equal(await page.evaluate(()=>window.bnSelection.ready),false);
  await open('mine');await expect(page.getByText('Pilot Horse',{exact:true})).toBeVisible();assert.equal(await page.getByRole('spinbutton').count(),0);await page.getByRole('button',{name:'Refresh ledger'}).click();await expect(page.getByText('Pilot Horse',{exact:true})).toHaveCount(0);
  await open('block');await page.getByRole('checkbox').check();await page.getByRole('spinbutton').fill('0');assert.deepEqual(await page.evaluate(()=>window.blockPolicy),{required:true,fee:'0'});
  await open('admin');await expect(page.getByText('Pilot Horse',{exact:false})).toBeVisible();
  await page.getByRole('checkbox').check();await page.locator('form input[type="number"]').fill('19.50');await page.locator('form button[type="submit"]').click();
  await expect.poll(()=>page.evaluate(()=>window.settings)).toEqual({back_number_auto_assign:true,back_number_request_fee:19.5});
  await page.getByRole('spinbutton',{name:/Dossard à assigner|Number to assign/}).fill('400');await page.getByRole('button',{name:locale==='fr'?'Assigner ce dossard':'Assign this number',exact:true}).click();
  await expect(page.getByText('Pilot Horse',{exact:false})).toHaveCount(0);
  assert.deepEqual(await page.evaluate(()=>window.bnCalls.find(call=>call.name==='assign_association_back_number').args),{p_org:'org',p_horse:'horse',p_number:400});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);console.log(`PASS back numbers ${locale} ${width}x${height}`);
 }
 console.log('PASS: lookup, personal number, reuse, explicit request, forced association stock, preserved request on block selection, pending, lookup failure, block policy, staff fee settings and assignment; FR/EN portrait/landscape, external traffic blocked.');
}finally{await browser?.close();await server.close();}
