import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { lookupOmvq, OMVQ_URL } from '../../server/vet/omvq.mjs';
// Every request intercepted. This suite never contacts OMVQ or any other website.
function fixtureBrowser({ name='Dre Amélie Croteau m.v.',permit='Régulier Numéro 4887',status='Actif',count=1,blocked=false,httpStatus=200 }={}) {
 return { launch: async options => {
  const browser=await chromium.launch(options);
  const newContext=browser.newContext.bind(browser);
  browser.newContext=async options=>{
   const context=await newContext(options);
   await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.pathname.startsWith('/zkau'))return route.fulfill({status:httpStatus,body:'fixture'});
    if(route.request().url()!==OMVQ_URL)return route.abort();
    const card=`<div class="panel-membre"><div><h3 class="affichage-nom">${name}</h3><span class="plabel">${status}</span></div><div><span class="plabel">Permis :</span><span>${permit}</span></div><div>Other contact details must never be returned</div></div>`;
    const result=`<p>${count} résultat(s) pour : 4887</p>${count?card.repeat(count):''}`;
    return route.fulfill({contentType:'text/html;charset=utf-8',body:`<html><body>${blocked?'<div class="g-recaptcha"></div>':''}<div class="form-group"><label>Numéro de permis</label><input /></div><button onclick='run()'>Rechercher</button><div id="result"></div><script>async function run(){await fetch('/zkau',{method:'POST'});document.getElementById('result').innerHTML=${JSON.stringify(result)};}</script></body></html>`});
   });
   return context;
  };
  return browser;
 } };
}
const expected={name:'Amélie Croteau',permit_number:'4887'};
test('normal form flow extracts only permitted fields',async()=>{
 const r=await lookupOmvq(expected,{chromium:fixtureBrowser()});
 assert.deepEqual(r,{name:'Dre Amélie Croteau m.v.',permit:'4887',status:'Actif',result:'verified'});
});
test('missing status, multiple cards and no results fail closed',async()=>{
 for(const [fixture,result] of [[{status:''},'ambiguous'],[{count:2},'ambiguous'],[{count:0},'not_found']])assert.equal((await lookupOmvq(expected,{chromium:fixtureBrowser(fixture)})).result,result);
});
test('CAPTCHA or HTTP block stops the adapter',async()=>{
 for(const fixture of [{blocked:true},{httpStatus:429}])assert.equal((await lookupOmvq(expected,{chromium:fixtureBrowser(fixture)})).result,'unavailable');
});
