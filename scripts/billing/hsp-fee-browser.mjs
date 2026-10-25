// Actual React form; in-memory RPC substitute, no database or external service.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'vite';
import {serverlessBrowser} from '../../server/vet/serverless-browser.mjs';
mkdirSync('.tmp/hsp-fee-ui',{recursive:true});
writeFileSync('.tmp/hsp-fee-ui/index.html','<div id="root"></div><script type="module" src="/.tmp/hsp-fee-ui/harness.tsx"></script>');
writeFileSync('.tmp/hsp-fee-ui/harness.tsx',`import React from 'react';import {createRoot} from 'react-dom/client';import {HspFeeSettings} from '/src/features/finance/HspFeeSettings';createRoot(document.getElementById('root')).render(<HspFeeSettings org="DEMO-ORG" show="DEMO-SHOW" locale="fr" onSaved={()=>{}}/>);`);
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},plugins:[{name:'fee-mock',enforce:'pre',resolveId(id){if(id.endsWith('/services/billingFolio'))return '\0fee-mock';},load(id){if(id==='\0fee-mock')return `const rows=[{scope:'platform',amount:5}];window.feeWrites=[];export async function billingRpc(name,args){if(name==='set_billing_hsp_fee'){window.feeWrites.push(args);const row={scope:args.p_scope,amount:args.p_amount,note:args.p_note};const i=rows.findIndex(r=>r.scope===row.scope);if(i<0)rows.push(row);else rows[i]=row;}return {platform_admin:true,settings:structuredClone(rows)};}`;}}]});
let browser;
try{await server.listen();const port=server.httpServer.address().port;browser=await serverlessBrowser.launch();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${port}/.tmp/hsp-fee-ui/index.html`);await page.getByText('Réglages des frais HSP').click();
 const amount=page.getByRole('textbox',{name:'Montant des frais HSP'}),save=page.getByRole('button',{name:'Enregistrer les frais HSP'});
 for(const [input,expected] of [['7,34',7.34],['0,00',0],['',null]]){await amount.fill(input);await save.click();await page.waitForFunction(n=>window.feeWrites.length===n,[7.34,0,null].indexOf(expected)+1);assert.equal(await page.evaluate(()=>window.feeWrites.at(-1).p_amount),expected);await page.getByRole('status').waitFor();}
 await amount.fill('7,345');await save.click();assert.equal(await page.evaluate(()=>window.feeWrites.length),3);assert((await page.getByRole('status').textContent()).includes('invalide'));
 await page.getByRole('combobox').selectOption('association');await amount.fill('7.34');await save.click();await page.waitForFunction(()=>window.feeWrites.length===4);assert.equal(await page.evaluate(()=>window.feeWrites.at(-1).p_scope),'association');
 await page.screenshot({path:'.tmp/hsp-fee-ui/form.png'});writeFileSync('.tmp/hsp-fee-ui/results.json',JSON.stringify({complete:true,checks:6,remoteTraffic:false}));console.log('PASS HSP fee React form: 7,34; 7.34; zero; blank; invalid precision; association scope');
}finally{await browser?.close();await server.close();}
