// Read-only final checks against the actual isolated local prototype.
import assert from 'node:assert/strict';import {createClient} from '@supabase/supabase-js';import {readFileSync,writeFileSync} from 'node:fs';
assert.equal(process.env.BILLING_SUPABASE_URL,'http://127.0.0.1:54321');
const f=JSON.parse(readFileSync('.tmp/hsp-direct/fixture.json')),a=JSON.parse(readFileSync('.tmp/hsp-direct/access.local.json')),cases=JSON.parse(readFileSync('.tmp/hsp-direct/cases.json')).cases;
const staff=createClient(process.env.BILLING_SUPABASE_URL,process.env.BILLING_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
assert(!(await staff.auth.signInWithPassword({email:a.users.find(x=>x.id.endsWith('003')).email,password:a.password})).error);
const rpc=async(n,args)=>{const r=await staff.rpc(n,args);assert(!r.error,r.error?.message);return r.data;};let checks=0;const check=x=>{assert(x);checks++;};
const report=await rpc('get_billing_hsp_remittances',{p_context:f.context});const results={};
for(const name of ['cancel','authentication','decline','lost','manual-lost','staff-first','mixed']){
 const d=await rpc('billing_ui_detail',{p_folio:cases[name].folio,p_personal:false});const r=report.rows.find(x=>x.folio_id===cases[name].folio);
 check(d.charges.filter(x=>x.supplier==='hsp').length===1);check(d.payments.length===({cancel:1,authentication:1,decline:0,lost:1,'manual-lost':2,'staff-first':1,mixed:2})[name]);check(d.documents.filter(x=>x.kind==='receipt').length===d.payments.length);
 if(['cancel','staff-first'].includes(name)){check(d.state==='closed');check(d.documents.filter(x=>x.kind==='invoice').length===1);}
 if(name==='mixed')check(Number(r.collected)===5.25&&Number(r.remitted)===5.25&&Number(r.remaining)===0&&d.balance===0);
 if(name==='staff-first')check(Number(r.collected)===5.25&&Number(r.remitted)===0&&Number(r.remaining)===5.25);
 if(name==='decline')check(d.stripe.attempt.state==='canceled');
 results[name]={state:d.state,total:d.total,received:d.received,balance:d.balance,payments:d.payments.length,receipts:d.documents.filter(x=>x.kind==='receipt').length,invoices:d.documents.filter(x=>x.kind==='invoice').length,hspCollected:r.collected,hspRemitted:r.remitted,hspRemaining:r.remaining};
}
check(report.rows.every(r=>Number(r.reserved)===0));const totals=Object.fromEntries(['collected','remitted','remaining'].map(k=>[k,report.rows.reduce((n,r)=>n+Math.round(Number(r[k])*100),0)/100]));check(totals.collected===31.5&&totals.remitted===26.25&&totals.remaining===5.25);
const result={complete:true,realLocalSQL:true,assertions:checks,results,hspReport:{currency:'CAD',...totals,automaticSettlement:false}};writeFileSync('.tmp/hsp-direct/final-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
