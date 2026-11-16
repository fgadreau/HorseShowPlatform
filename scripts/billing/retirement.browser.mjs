// Real components, synthetic accounts, and no external network access.
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium,expect} from '@playwright/test';
import {serverlessBrowser} from '../../server/vet/serverless-browser.mjs';

const html=`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import App from '/src/App.tsx';
import {LandingPage} from '/src/features/shows/LandingPage.tsx';
import {ClientDashboardView} from '/src/features/dashboard/ClientDashboardView.tsx';
import '/src/styles.css';
const locale=new URLSearchParams(location.search).get('lang')||'fr';
const accounts=[{id:'cad-account',account_number:'ACCOUNT-CAD',balance:125,currency:'CAD',state:'open'},{id:'usd-account',account_number:'ACCOUNT-USD',balance:50,currency:'USD',state:'closed'},{id:'settled',account_number:'SETTLED',balance:0,currency:'CAD',state:'closed'}];
const view=location.pathname.startsWith('/vet')?React.createElement(App):location.pathname==='/landing'?React.createElement(LandingPage,{onSignIn:()=>{}}):React.createElement(ClientDashboardView,{locale,billingAccounts:accounts,contacts:[],classes:[],entries:[],horses:[],organizations:[],profile:{id:'payer',first_name:'Test',last_name:'Payer',address:'123 Test',city:'Test'},shows:[],showDays:[],stallBookings:[],stallOptions:[],onViewChange:()=>{}});
ReactDOM.createRoot(document.getElementById('root')).render(view);
</script></body></html>`;
const server=await createServer({configFile:false,envDir:false,plugins:[react(),{
 name:'retirement-fixture',enforce:'pre',load(id){if(id.endsWith('/src/lib/supabase.ts'))return 'export const supabase=null;export function requireSupabase(){throw Error("Synthetic fixture: no backend");}';},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{if(!/^\/(vet|landing|dashboard)(\/|\?|$)/.test(req.url))return next();try{res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml(req.url,html));}catch(error){next(error);}});}
}],server:{host:'127.0.0.1',port:5212,strictPort:true}});
let browser;
try{
 await server.listen();
 browser=process.platform==='linux'?await serverlessBrowser.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 for(const path of ['/vet','/vet/certificates']){
  await page.goto('http://127.0.0.1:5212'+path);
  await expect(page.getByRole('heading',{name:'Portail vétérinaire temporairement indisponible'})).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
 }
 await page.goto('http://127.0.0.1:5212/landing');
 await expect(page.locator('.landing-page, .landing')).toBeVisible();
 await expect(page.locator('a[href="/vet"]')).toHaveCount(0);
 for(const locale of ['fr','en'])for(const width of [390,1440]){
  await page.setViewportSize({width,height:950});
  await page.goto('http://127.0.0.1:5212/dashboard?lang='+locale);
  await expect(page.getByRole('link',{name:'ACCOUNT-CAD'})).toHaveAttribute('href','/me/accounts/cad-account');
  await expect(page.getByRole('link',{name:'ACCOUNT-USD'})).toHaveAttribute('href','/me/accounts/usd-account');
  await expect(page.getByRole('link',{name:'SETTLED'})).toHaveCount(0);
  const total=await page.locator('.client-invoice-total').innerText();
  assert(total.includes('125')&&total.includes('50')&&!total.includes('175'),'Currency balances must remain separate');
  assert(!/archives|ancienne|legacy/i.test(await page.locator('body').innerText()));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 }
 assert.deepEqual(errors,[]);
 console.log('PASS retired portal routes and landing link; current account links, settled accounts and separate currency balances in FR/EN mobile/desktop.');
}finally{await browser?.close();await server.close();}
