import { chromium } from 'playwright-core';
import fs from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/tmp/chromium',headless:true,args:['--no-sandbox']});
await fs.mkdir('docs/branding',{recursive:true});
const results=[];
for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:width===390?844:1000},deviceScaleFactor:1});
 page.setDefaultTimeout(5000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const screen of ['auth','navigation','form','public','show','vet']){
  await page.goto(`http://localhost:5173/scripts/branding-preview/?screen=${screen}`);
  await page.waitForTimeout(800);
  if(screen==='navigation'&&width===390){await page.getByRole('button',{name:'Ouvrir la navigation'}).click().catch(()=>{});}
  await page.screenshot({path:`docs/branding/${screen}-${width}.png`,fullPage:true});
  results.push({screen,width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors:errors.splice(0)});
 }
 await page.goto('http://localhost:5173/scripts/branding-preview/?screen=auth&locale=en');
 await page.waitForTimeout(400);await page.screenshot({path:`docs/branding/auth-en-${width}.png`,fullPage:true});
 await page.locator('input').first().focus();
 results.push({screen:'auth-en-focus',width,outline:await page.locator('input').first().evaluate(e=>getComputedStyle(e).outline)});
 await page.goto('http://localhost:5173/scripts/branding-preview/?screen=vet');
 await page.getByLabel('Courriel',{exact:true}).fill('vet@example.test');
 await page.getByLabel('Mot de passe',{exact:true}).fill('fixture-password');
 await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByRole('heading',{name:'Nouveau certificat',exact:true}).waitFor();
 await page.screenshot({path:`docs/branding/vet-editor-${width}.png`,fullPage:true});
 results.push({screen:'vet-editor',width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors:errors.splice(0)});
 await page.close();
}
const page=await browser.newPage({viewport:{width:480,height:180},deviceScaleFactor:1});
await page.goto('http://localhost:5173/scripts/branding-preview/');
await page.setContent(`<body style="font:14px system-ui;background:#f5f5f7;padding:20px"><p>SVG approuvé · tailles réelles 16 px et 32 px</p><img src="/branding/hsp-favicon-aubergine.svg" width="16" height="16" style="margin-right:24px"><img src="/branding/hsp-favicon-aubergine.svg" width="32" height="32"></body>`);
await page.waitForTimeout(300);await page.screenshot({path:'docs/branding/favicon-16-32.png'});
await browser.close();
console.log(JSON.stringify(results,null,2));
await fs.writeFile('docs/branding/checks.json',JSON.stringify(results,null,2)+'\n');
if(results.some(r=>r.overflow||r.errors?.length))process.exitCode=1;
