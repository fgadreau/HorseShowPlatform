// Real authenticated browser downloads; compare bytes with actual Storage downloads.
import assert from 'node:assert/strict';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{createHash}from'node:crypto';import executable from'@sparticuz/chromium';import{chromium}from'playwright-core';
const dir='.tmp/review-20260907',state=JSON.parse(readFileSync(dir+'/state.json')),access=JSON.parse(readFileSync('.tmp/hsp-direct/access.local.json')),files=JSON.parse(readFileSync(dir+'/documents-results.json')).files.filter(f=>f.name==='main');
mkdirSync(dir+'/browser-downloads',{recursive:true});
const browser=await chromium.launch({downloadsPath:dir+'/browser-downloads',executablePath:await executable.executablePath(),headless:true,args:executable.args.filter(a=>!['--single-process','--disable-web-security','--disable-site-isolation-trials'].includes(a)&&!a.startsWith('--disable-features='))});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);let downloads=0;
try{
 await page.goto('http://localhost:5174/me/accounts');await page.evaluate(async({email,password})=>{const{requireSupabase}=await import('/src/lib/supabase.ts');const r=await requireSupabase().auth.signInWithPassword({email,password});if(r.error)throw Error('LOGIN_FAILED');},{email:access.users.find(u=>u.id.endsWith('004')).email,password:access.password});
 await page.goto('http://localhost:5174/me/accounts/'+state.cases.main.folio);await page.getByRole('button',{name:'FR',exact:true}).click();await page.getByText('Compte fermé — facture finale disponible',{exact:true}).waitFor();
 const buttons=page.locator('.finance-account > ul').last().getByRole('button');assert.equal(await buttons.count(),4);
 for(let i=0;i<4;i++){
  await buttons.nth(i).click();await page.getByRole('button',{name:'Télécharger PDF FR',exact:true}).waitFor();
  for(const locale of ['fr','en']){const event=page.waitForEvent('download');await page.getByRole('button',{name:'Télécharger PDF '+locale.toUpperCase(),exact:true}).click();const download=await event,path=await download.path(),hash=createHash('sha256').update(readFileSync(path)).digest('hex');assert(files.some(f=>f.locale===locale&&f.sha256===hash));downloads++;}
 }
 // Show the preserved recap snapshot itself; this is a read-only view after closure.
 const recap=buttons.filter({hasText:'Relevé du compte'});await recap.click();await page.locator('.finance-document h3').filter({hasText:'Relevé du compte'}).waitFor();
 for(const locale of ['FR','EN']){await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:locale,exact:true}).click();for(const width of [1440,390]){await page.setViewportSize({width,height:844});await page.locator('.finance-document').screenshot({path:dir+'/recap-snapshot-'+locale.toLowerCase()+'-'+width+'.png'});}}
 writeFileSync(dir+'/browser-downloads.json',JSON.stringify({complete:true,actualBrowserDownloads:downloads,bytesMatchStorage:true,recapSnapshotCaptures:4},null,2));console.log(JSON.stringify({complete:true,actualBrowserDownloads:downloads,bytesMatchStorage:true}));
}finally{await browser.close();}
