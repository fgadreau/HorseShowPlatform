// Real local RPC and browser. Payments are simulated manual receipts, not Stripe.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import executable from '@sparticuz/chromium';
import {chromium} from 'playwright-core';
const dir='.tmp/review-v3',path=dir+'/state.json',state=JSON.parse(readFileSync(path)),folio=state.cases.main.folio,fixture=JSON.parse(readFileSync('.tmp/hsp-direct/fixture.json')),access=JSON.parse(readFileSync('.tmp/hsp-direct/access.local.json'));
assert.equal(process.env.BILLING_SUPABASE_URL,'http://127.0.0.1:54321');
const staff=createClient(process.env.BILLING_SUPABASE_URL,process.env.BILLING_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const login=await staff.auth.signInWithPassword({email:access.users.find(u=>u.id.endsWith('003')).email,password:access.password});assert(!login.error);
const rpc=async(name,args)=>{const r=await staff.rpc(name,args);assert(!r.error,r.error?.message);return r.data;};
const detail=()=>rpc('billing_ui_detail',{p_folio:folio,p_personal:false});const save=()=>writeFileSync(path,JSON.stringify(state,null,2));
let d=await detail();
if(d.state==='open'){
 state.closeRecapKey??=randomUUID();save();const recap=await rpc('get_billing_statement',{p_folio:folio,p_request_id:state.closeRecapKey});
 state.closeCommand??={p_folio:folio,p_request_id:randomUUID(),p_version:recap.account.version,p_statement_id:recap.document_id};save();await rpc('finalize_billing_folio',state.closeCommand);d=await detail();
}
const invoice=d.documents.find(x=>x.kind==='invoice');assert(invoice);assert.equal(invoice.snapshot.balance,298.75);assert.equal(invoice.snapshot.render_version,3);
const frozen=JSON.stringify(invoice),hash=b=>createHash('sha256').update(b).digest('hex');
const request=(action,locale)=>fetch('http://127.0.0.1:54332/'+action,{method:'POST',headers:{Origin:'http://127.0.0.1:5173',Authorization:'Bearer '+login.data.session.access_token,'Content-Type':'application/json'},body:JSON.stringify({documentId:invoice.id,personal:false,locale})});
for(let i=0;i<60;i++){const r=await request('status','fr');assert(r.ok);if((await r.json()).state==='completed')break;await new Promise(r=>setTimeout(r,1000));}
const hashes={};for(const locale of ['fr','en']){const r=await request('download',locale);assert(r.ok);const bytes=Buffer.from(await r.arrayBuffer());hashes[locale]=hash(bytes);writeFileSync(`${dir}/invoice-before-payment-${locale}.pdf`,bytes);}
const browser=await chromium.launch({executablePath:await executable.executablePath(),headless:true,args:executable.args.filter(a=>!['--single-process','--disable-web-security','--disable-site-isolation-trials'].includes(a)&&!a.startsWith('--disable-features='))});
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(60000);
const results={complete:false,realLocalRPC:true,realBrowser:true,mockedResponses:false,manualPaymentsSimulated:true,checks:[],captures:[]};
async function browserLogin(target,tail){await target.goto('http://localhost:5174/me/accounts');await target.evaluate(async({email,password})=>{const{requireSupabase}=await import('/src/lib/supabase.ts');const r=await requireSupabase().auth.signInWithPassword({email,password});if(r.error)throw Error('LOGIN_FAILED');},{email:access.users.find(u=>u.id.endsWith(tail)).email,password:access.password});}
async function screenshot(name){const file=`${dir}/${name}.png`;await page.screenshot({path:file,fullPage:true});results.captures.push(file);}
try{
 await browserLogin(page,'003');await page.goto(`http://localhost:5174/associations/${fixture.org}/finance/accounts/${folio}`);await page.getByRole('button',{name:'FR',exact:true}).click();await page.getByText('Compte fermé — facture finale disponible',{exact:true}).waitFor();
 if(d.balance>0){
  assert(d.actions.payment);assert.equal(Number(d.stripe.available),Number(d.balance));await page.getByLabel('Montant partiel ou solde').waitFor();
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await screenshot('closed-balance-due-'+width);}
  const payer=await browser.newPage({viewport:{width:1440,height:1000}});payer.setDefaultTimeout(60000);await browserLogin(payer,'004');await payer.goto('http://localhost:5174/me/accounts/'+folio);await payer.getByRole('button',{name:'FR',exact:true}).click();await payer.getByText('Compte fermé — facture finale disponible',{exact:true}).waitFor();assert.equal(await payer.getByLabel('Montant partiel ou solde').count(),0);await payer.close();results.checks.push('Closed account with debt: server-authorized staff form visible; payer form absent');
  for(const [index,amount] of [100,198.75].entries()){
   d=await detail();if(d.payments.length>=index+2){assert(d.payments.some(p=>Number(p.amount)===amount));continue;}
   const count=d.payments.length;await page.getByLabel('Montant partiel ou solde').fill(String(amount));
   const response=page.waitForResponse(r=>r.url().endsWith('/rpc/record_billing_payment'));await page.getByRole('button',{name:'Confirmer la réception fictive',exact:true}).click();const r=await response;assert(r.ok());
   const expected=Math.round((Number(d.balance)-amount)*100)/100;for(let i=0;i<50;i++){d=await detail();if(Number(d.balance)===expected)break;await page.waitForTimeout(100);}assert.equal(Number(d.balance),expected);assert.equal(d.payments.length,count+1);assert.equal(d.state,'closed');assert.equal(JSON.stringify(d.documents.find(x=>x.kind==='invoice')),frozen);
   if(expected){await page.waitForFunction(()=>document.querySelector('.finance-account > strong')?.textContent.includes('198,75'));assert(await page.getByLabel('Montant partiel ou solde').isVisible());await screenshot('closed-partial-payment-390');}
  }
 }
 await page.getByLabel('Montant partiel ou solde').waitFor({state:'hidden'});assert.equal(Number((await detail()).stripe.available),0);await screenshot('closed-zero-balance-390');
 d=await detail();assert.equal(d.documents.filter(x=>x.kind==='invoice').length,1);assert.equal(d.payments.length,3);assert.equal(d.charges.filter(x=>x.supplier==='hsp').length,1);assert.equal(JSON.stringify(d.documents.find(x=>x.kind==='invoice')),frozen);
 for(const locale of ['fr','en']){const r=await request('download',locale);assert(r.ok);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hashes[locale]);}
 results.checks.push('Two real browser manual receipts after closure: partial balance stays payable, zero hides form','One final invoice: snapshot and FR/EN PDF bytes unchanged before/after payments','Three payments total, one HSP fee, no new invoice');results.invoice=invoice.number;results.invoicePDFHashes=hashes;results.complete=true;
}finally{await browser.close();writeFileSync(dir+'/closed-payment-results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));}
