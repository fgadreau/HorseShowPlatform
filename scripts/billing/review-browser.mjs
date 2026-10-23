// Real authenticated local UI. No mocked RPC or Stripe responses.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import executable from '@sparticuz/chromium';import {chromium} from 'playwright-core';
const dir='.tmp/review-20260907';mkdirSync(dir,{recursive:true});
const access=JSON.parse(readFileSync('.tmp/hsp-direct/access.local.json'));
const old=JSON.parse(readFileSync('.tmp/hsp-direct/integrated.json'));
const browser=await chromium.launch({executablePath:await executable.executablePath(),headless:true,args:executable.args.filter(a=>!['--single-process','--disable-web-security','--disable-site-isolation-trials'].includes(a)&&!a.startsWith('--disable-features='))});
const page=await browser.newPage({locale:'fr-CA',viewport:{width:1440,height:1000}});page.setDefaultTimeout(30000);
const errors=[];page.on('pageerror',()=>errors.push('pageerror'));
const results={realLocalUI:true,mockedResponses:false,captures:[],checks:[]};
async function screenshot(name){const path=`${dir}/${name}.png`;await page.screenshot({path,fullPage:!name.includes('recap')});results.captures.push(path);}
async function fits(){const bad=await page.locator('.finance-money').evaluateAll(nodes=>nodes.filter(n=>{const r=n.getBoundingClientRect();return r.right>innerWidth+1||r.left<0||n.scrollWidth>n.clientWidth+1;}).length);assert.equal(bad,0,'Every full amount fits');assert(await page.locator('body').evaluate(n=>n.scrollWidth<=innerWidth+1),'No page overflow');results.checks.push('Full amounts fit at '+page.viewportSize().width);}
try{
 await page.goto('http://localhost:5174/me/accounts');
 await page.evaluate(async({email,password})=>{const {requireSupabase}=await import('/src/lib/supabase.ts');const r=await requireSupabase().auth.signInWithPassword({email,password});if(r.error)throw Error('LOGIN_FAILED');},{email:access.users.find(x=>x.id.endsWith('004')).email,password:access.password});
 if(process.argv[2]==='close'){
  const state=JSON.parse(readFileSync(dir+'/state.json'));
  const {createClient}=await import('@supabase/supabase-js');assert.equal(process.env.BILLING_SUPABASE_URL,'http://127.0.0.1:54321');
  const staff=createClient(process.env.BILLING_SUPABASE_URL,process.env.BILLING_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  assert(!(await staff.auth.signInWithPassword({email:access.users.find(u=>u.id.endsWith('003')).email,password:access.password})).error);
  const rpc=async(name,args)=>{const r=await staff.rpc(name,args);assert(!r.error,r.error?.message);return r.data;};
  for(const [name,c]of Object.entries(state.cases)){
   const before=await rpc('billing_ui_detail',{p_folio:c.folio,p_personal:false});
   await page.setViewportSize({width:1440,height:1000});await page.goto('http://localhost:5174/me/accounts/'+c.folio);await page.getByRole('button',{name:'FR',exact:true}).click();
   if(before.state==='open'){
    await page.getByRole('button',{name:'Vérifier le récapitulatif de fermeture',exact:true}).waitFor();
    assert.equal(await page.getByLabel('Montant partiel ou solde').count(),0);results.checks.push(name+': open account at zero has no payment form');
    for(const locale of ['FR','EN']){
     await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:locale,exact:true}).click();
     await page.getByRole('button',{name:locale==='FR'?'Vérifier le récapitulatif de fermeture':'Review closing summary',exact:true}).click();await page.getByRole('dialog').waitFor();
     for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});await page.getByRole('dialog').evaluate(d=>d.scrollTop=0);await fits();await screenshot(name+'-recap-'+locale.toLowerCase()+'-'+width);}
     await page.getByRole('dialog').getByRole('button',{name:locale==='FR'?'Retour':'Back',exact:true}).click();
    }
    await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'FR',exact:true}).click();
    if(name==='staff-race')await page.route('**/rest/v1/rpc/finalize_own_billing_folio',async route=>{
     const recap=await rpc('get_billing_statement',{p_folio:c.folio,p_request_id:crypto.randomUUID()});
     await rpc('finalize_billing_folio',{p_folio:c.folio,p_request_id:crypto.randomUUID(),p_version:recap.account.version,p_statement_id:recap.document_id});await route.continue();
    },{times:1});
    await page.getByRole('button',{name:'Vérifier le récapitulatif de fermeture',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Finaliser mon compte',exact:true}).click();
    await page.getByText('Compte fermé — facture finale disponible',{exact:true}).first().waitFor();await page.getByRole('dialog').waitFor({state:'hidden'});
    assert(!(await page.locator('.finance-account').innerText()).includes('BILLING_'));
    if(name==='staff-race'){await page.locator('.finance-document h3').filter({hasText:'Facture finale'}).waitFor();results.checks.push('Actual secretary closure before actual payer request: refreshed automatically, existing invoice opened');}
   }
   const after=await rpc('billing_ui_detail',{p_folio:c.folio,p_personal:false});assert.equal(after.documents.filter(d=>d.kind==='invoice').length,1);assert.equal(after.payments.length,2);assert.equal(after.charges.filter(c=>c.supplier==='hsp').length,1);
   for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});await fits();await screenshot(name+'-closed-fr-'+width);}
   results.checks.push(name+': two payments, one final invoice, one HSP fee');
  }
 }
 for(const locale of ['FR','EN']){
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://localhost:5174/me/accounts/'+old.folio);
  await page.getByRole('button',{name:locale,exact:true}).click();
  await page.getByText(locale==='FR'?'Compte fermé — facture finale disponible':'Account closed — final invoice available',{exact:true}).waitFor();
  assert.equal(await page.getByLabel(/Montant partiel ou solde|Partial amount or balance/).count(),0);
  assert(!/Prêt à finaliser|Ready to finalize|Récapitulatif à confirmer|Review the current summary|Disponible pour encaissement manuel|Available for manual payment|stripe_test|etransfer/.test(await page.locator('.finance-account').innerText()));
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:width===1440?1000:844});await fits();await screenshot(`existing-account-${locale.toLowerCase()}-${width}`);}
  await page.goto('http://localhost:5174/me/accounts?year=all');await page.locator('.finance-list tbody tr').first().waitFor();
  assert.equal(await page.getByText(locale==='FR'?'Chargement…':'Loading…',{exact:true}).count(),0);
  for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});await fits();await screenshot(`accounts-loaded-${locale.toLowerCase()}-${width}`);}
  results.checks.push(locale+': closed state, no payment form or technical codes; account list loaded');
 }
 assert.deepEqual(errors,[]);results.complete=true;
}catch(e){results.failure=e.message;results.visibleFinance=await page.locator('.finance').innerText().catch(()=> 'Finance view absent');await page.screenshot({path:dir+'/browser-failure.png'});process.exitCode=1;}finally{await browser.close();writeFileSync(dir+'/browser-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}
