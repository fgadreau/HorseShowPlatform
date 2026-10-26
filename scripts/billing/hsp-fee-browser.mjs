// Actual platform form; in-memory RPC substitute, no database or external service.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'vite';
import {chromium,expect} from '@playwright/test';
import {serverlessBrowser} from '../../server/vet/serverless-browser.mjs';
mkdirSync('.tmp/hsp-fee-ui',{recursive:true});
writeFileSync('.tmp/hsp-fee-ui/index.html','<div id="root"></div><script type="module" src="/.tmp/hsp-fee-ui/harness.tsx"></script>');
writeFileSync('.tmp/hsp-fee-ui/harness.tsx',`import React from 'react';import {createRoot} from 'react-dom/client';import {PlatformHspFeeSettings} from '/src/features/platformAdmin/HspFeeSettings';import '/src/styles.css';createRoot(document.getElementById('root')).render(<PlatformHspFeeSettings organizations={[{id:'DEMO-ORG',name:'Association A'},{id:'OTHER-ORG',name:'Association B'}]} shows={[{id:'DEMO-SHOW',organization_id:'DEMO-ORG',name:'Concours A'},{id:'OTHER-SHOW',organization_id:'OTHER-ORG',name:'Concours B'}]} locale={new URLSearchParams(location.search).get('locale')||'fr'}/>);`);
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},plugins:[{name:'fee-mock',enforce:'pre',resolveId(id){if(id.endsWith('/services/billingFolio'))return '\0fee-mock';},load(id){if(id==='\0fee-mock')return `const rows=[{scope:'platform',scope_id:'00000000-0000-0000-0000-000000000000',amount:5}];window.feeWrites=[];export async function billingRpc(name,args){if(name==='set_billing_hsp_fee'){window.feeWrites.push(args);const row={scope:args.p_scope,scope_id:args.p_id,amount:args.p_amount,note:args.p_note};const i=rows.findIndex(r=>r.scope===row.scope&&r.scope_id===row.scope_id);if(i<0)rows.push(row);else rows[i]=row;}return {platform_admin:true,settings:structuredClone(rows.filter(r=>r.scope==='platform'||r.scope_id===args.p_org||r.scope_id===args.p_show))};}`;}}]});
let browser;
try{
 await server.listen();const port=server.httpServer.address().port;
 browser=process.platform==='linux'?await serverlessBrowser.launch():await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 for(const locale of ['fr','en'])for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);await page.goto(`http://127.0.0.1:${port}/.tmp/hsp-fee-ui/index.html?locale=${locale}`);
  const fr=locale==='fr',amount=page.getByRole('textbox',{name:fr?'Montant des frais HSP':'HSP fee amount'}),save=page.getByRole('button',{name:fr?'Enregistrer les frais HSP':'Save HSP fee'}),scope=page.getByRole('combobox',{name:fr?'Niveau':'Scope',exact:true});
  await expect(scope).toHaveValue('association');
  for(const [input,expected] of [['7,34',7.34],['0,00',0],['',null]]){
   await amount.fill(input);await save.click();await expect(page.getByRole('status')).toBeVisible();
   const write=await page.evaluate(()=>window.feeWrites.at(-1));assert.equal(write.p_amount,expected);assert.equal(write.p_id,'DEMO-ORG');assert.equal(write.p_scope,'association');
  }
  await amount.fill('7,345');await save.click();await expect(page.getByRole('alert')).toBeVisible();assert.equal(await page.evaluate(()=>window.feeWrites.length),3);
  await page.getByRole('combobox',{name:fr?'Exception pour un concours (facultatif)':'Show exception (optional)',exact:true}).selectOption('DEMO-SHOW');
  await expect(scope).toHaveValue('show');await amount.fill('7.34');await save.click();await expect(page.getByRole('status')).toBeVisible();assert.equal(await page.evaluate(()=>window.feeWrites.at(-1).p_id),'DEMO-SHOW');
  await page.getByRole('combobox').first().click();await page.getByRole('option',{name:'Association B',exact:true}).click();
  await expect(scope).toHaveValue('association');await expect(amount).toHaveValue('');await amount.fill('9');await save.click();await expect(page.getByRole('status')).toBeVisible();assert.equal(await page.evaluate(()=>window.feeWrites.at(-1).p_id),'OTHER-ORG');
  await scope.selectOption('platform');await expect(amount).toHaveValue('5');await amount.fill('0');await save.click();await expect(page.getByRole('alert')).toBeVisible();assert.equal(await page.evaluate(()=>window.feeWrites.length),5);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:`.tmp/hsp-fee-ui/${locale}-${viewport.width}.png`});
 }
 assert.deepEqual(errors,[]);console.log('PASS platform HSP settings: association/show targeting, organization switch, decimal/zero/inherit validation, positive platform default; FR/EN mobile portrait and landscape, external traffic blocked.');
}finally{await browser?.close();await server.close();}
