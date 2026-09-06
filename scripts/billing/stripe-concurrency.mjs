import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
export async function stripeRaces({sql,session,check,container,db}){
 const admin="set role authenticated;set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';",payer="set role authenticated;set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';";
 const x=JSON.parse(sql(`${admin}select public.billing_test_checkout_account('stripe-race',100);`));
 const holder=spawn('docker',['exec','-i',container,'psql','-X','-U','supabase_admin','-d',db,'-Atq','-v','ON_ERROR_STOP=1']);let out='',err='';holder.stderr.on('data',d=>err+=d);
 const held=new Promise((resolve,reject)=>{holder.stdout.on('data',d=>{out+=d;if(out.includes('HELD_STRIPE'))resolve();});holder.on('error',reject);holder.on('close',()=>{if(!out.includes('HELD_STRIPE'))reject(Error(err));});});
 const ended=new Promise(resolve=>holder.on('close',resolve));
 holder.stdin.write(`begin;set statement_timeout='15s';${payer}select public.begin_billing_stripe_attempt('${randomUUID()}','${x.folio}',80);select 'HELD_STRIPE';\n`);await held;
 const manual={folio_id:x.folio,version:x.version,amount:100,method:'cash',received_at:new Date().toISOString(),confirmed:true,allocations:[{charge_id:x.charge,amount:100}]};
 const other=session(`set application_name='stripe-manual-race';set statement_timeout='15s';${admin}select public.record_billing_payment('${randomUUID()}','${JSON.stringify(manual)}');`);
 let blocked=false;for(let i=0;i<100;i++){if(sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='stripe-manual-race' and wait_event='advisory';")==='1'){blocked=true;break;}await new Promise(r=>setTimeout(r,25));}
 holder.stdin.end(blocked?'commit;':'rollback;');assert.equal(await ended,0,err);const r=await other;
 check('real Stripe reservation vs manual payment: no excess receipt',()=>{assert(blocked);assert.notEqual(r.code,0);assert(r.err.includes('BILLING_PAYMENT_RESERVED'));assert.equal(sql(`select count(*) from public.billing_payments where folio_id='${x.folio}';`),'0');});
}
