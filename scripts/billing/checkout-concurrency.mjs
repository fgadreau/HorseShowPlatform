import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';

export async function runCheckoutRaces({sql,session,check,container,db}) {
 const org='f3000000-0000-0000-0000-000000000001';
 const admin="set role authenticated; set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';";
 const payer="set role authenticated; set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';";
 const factory=code=>JSON.parse(sql(`${admin} select public.billing_test_checkout_account('${code}');`));
 const prepare=x=>{
  sql(`${admin} select public.billing_set_ready('${x.folio}',true);`);
  return JSON.parse(sql(`${payer} select public.prepare_own_billing_recap('${randomUUID()}','${x.folio}');`));
 };
 const finalize=(x,r,key=randomUUID())=>`${payer} select public.finalize_own_billing_folio('${key}','${x.folio}',${r.version},'${r.document_id}');`;
 // Execute A and hold its transaction open. Observe B waiting on the authority or row lock.
 async function orderedRace(a,b,waitEvent='advisory') {
  const hold=spawn('docker',['exec','-i',container,'psql','-X','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1','-Atq']);
  let out='',err='';
  const done=new Promise((resolve,reject)=>{hold.on('error',reject);hold.on('close',code=>resolve(code));});
  const ready=new Promise((resolve,reject)=>{hold.stdout.on('data',v=>{out+=v;if(out.includes('CHECKOUT_HELD'))resolve();});hold.on('close',code=>{if(!out.includes('CHECKOUT_HELD'))reject(Error(err||`holder exited ${code}`));});});
  hold.stderr.on('data',v=>err+=v);
  hold.stdin.write(`begin; set statement_timeout='15s'; ${a} select 'CHECKOUT_HELD';\n`);
  await ready;
  const other=session(`set application_name='checkout-race-waiter'; set statement_timeout='15s'; ${b}`);
  let blocked=false;
  for(let i=0;i<100;i++){
   if(sql(`select count(*) from pg_stat_activity where datname=current_database() and application_name='checkout-race-waiter' and wait_event='${waitEvent}';`)==='1'){blocked=true;break;}
   await new Promise(r=>setTimeout(r,25));
  }
  hold.stdin.end(blocked?'commit;':'rollback;');
  assert.equal(await done,0,err);
  const result=await other;assert(blocked,'Checkout concurrency barrier was not observed');return result;
 }
 let x=factory('race-two-payer');let r=prepare(x);const key=randomUUID();
 let result=await orderedRace(finalize(x,r,key),finalize(x,r,key));
 check('checkout two payer tabs / lost response retry: one invoice and durable result',()=>{
  assert.equal(result.code,0,result.err);
  assert.equal(JSON.parse(result.out).document_id,JSON.parse(sql(finalize(x,r,key))).document_id);
  assert.equal(sql(`select count(*) from public.billing_final_invoices where folio_id='${x.folio}';`),'1');
 });
 x=factory('race-two-requests');r=prepare(x);
 result=await orderedRace(finalize(x,r),finalize(x,r));
 check('checkout two distinct payer requests: one close only',()=>{assert.notEqual(result.code,0);assert(result.err.includes('BILLING_NOT_ADMISSIBLE'));assert.equal(sql(`select count(*) from public.billing_final_invoices where folio_id='${x.folio}';`),'1');});
 x=factory('race-staff-payer');r=prepare(x);
 const staffRecap=JSON.parse(sql(`${admin} select public.get_billing_statement('${randomUUID()}','${x.folio}');`));
 result=await orderedRace(finalize(x,r),`${admin} select public.finalize_billing_folio('${randomUUID()}','${x.folio}',${r.version},'${staffRecap.document_id}');`);
 check('checkout payer and secretary concurrently: one final invoice',()=>{assert.notEqual(result.code,0);assert(result.err.includes('BILLING_STALE_VERSION'));assert.equal(sql(`select count(*) from public.billing_final_invoices where folio_id='${x.folio}';`),'1');});
 x=factory('race-revoke');r=prepare(x);
 result=await orderedRace(`${admin} select public.billing_set_ready('${x.folio}',false);`,finalize(x,r));
 check('checkout concurrent attestation revocation prevents close',()=>{assert.notEqual(result.code,0);assert(result.err.includes('BILLING_NOT_ADMISSIBLE'));assert.equal(sql(`select state from public.billing_folios where id='${x.folio}';`),'open');});
 x=factory('race-sale');r=prepare(x);
 result=await orderedRace(`${admin} select public.add_billing_sale('${randomUUID()}','${JSON.stringify({...x.command,source_id:randomUUID()})}'::jsonb);`,finalize(x,r));
 check('checkout concurrent sale retained and closure prevented',()=>{assert.notEqual(result.code,0);assert(result.err.includes('BILLING_NOT_ADMISSIBLE'));assert.equal(sql(`select count(*) from public.billing_charges where folio_id='${x.folio}';`),'2');});
 x=factory('race-payment');r=prepare(x);
 const sale=JSON.parse(sql(`${admin} select public.add_billing_sale('${randomUUID()}','${JSON.stringify({...x.command,product_id:'f5000000-0000-0000-0000-000000000002',source_id:randomUUID()})}'::jsonb);`));
 sql(`${admin} select public.billing_set_ready('${x.folio}',true);`);
 const amount=Number(sale.account.balance);
 const pay={folio_id:x.folio,version:sale.account.version,amount,method:'cash',received_at:new Date().toISOString(),confirmed:true,allocations:[{charge_id:sale.charge_id,amount}]};
 result=await orderedRace(`${admin} select public.record_billing_payment('${randomUUID()}','${JSON.stringify(pay)}'::jsonb);`,finalize(x,r));
 check('checkout payment concurrent with finalization: paid but stale recap refused',()=>{assert.notEqual(result.code,0);assert(result.err.includes('BILLING_STALE_RECAP'));assert.equal(sql(`select public.billing_snapshot('${x.folio}')->>'balance';`),'0.00');});
 x=factory('race-capability');r=prepare(x);
 result=await orderedRace(`${admin} select public.billing_set_capabilities('${org}','${x.context}',true,true,false,true,2020);`,finalize(x,r));
 check('checkout capability withdrawal concurrent with close is enforced',()=>{assert.notEqual(result.code,0);assert(result.err.includes('BILLING_NOT_ADMISSIBLE'));});
 // Row-edit sessions hold a real row lock before the financial command enters snapshot validation.
 for(const entity of ['beneficiary','horse']) {
  x=factory('race-name-'+entity);
  sql(`${admin} select public.add_billing_sale('${randomUUID()}','${JSON.stringify({...x.command,source_id:randomUUID(),beneficiary_contact_id:'f6000000-0000-0000-0000-000000000012',horse_id:'f8000000-0000-0000-0000-000000000012'})}'::jsonb);`);
  r=prepare(x);
  const edit=entity==='beneficiary'
   ? "update public.contacts set first_name='Concurrent beneficiary' where id='f6000000-0000-0000-0000-000000000012';"
   : "update public.horses set name='Concurrent horse' where id='f8000000-0000-0000-0000-000000000012';";
  result=await orderedRace(edit,finalize(x,r),'transactionid');
  check(`checkout concurrent ${entity} rename invalidates recap`,()=>{
   assert.notEqual(result.code,0);assert(result.err.includes('BILLING_STALE_RECAP'),result.err);
   assert.equal(sql(`select count(*) from public.billing_final_invoices where folio_id='${x.folio}';`),'0');
  });
  r=JSON.parse(sql(`${payer} select public.prepare_own_billing_recap('${randomUUID()}','${x.folio}');`));
  const laterEdit=entity==='beneficiary'
   ? "update public.contacts set first_name='Later beneficiary' where id='f6000000-0000-0000-0000-000000000012';"
   : "update public.horses set name='Later horse' where id='f8000000-0000-0000-0000-000000000012';";
  result=await orderedRace(finalize(x,r),laterEdit,'transactionid');
  check(`checkout ${entity} rename waits for finalization and preserves confirmed names`,()=>{
   assert.equal(result.code,0,result.err);
   assert.equal(sql(`select (d.snapshot->'charges'=r.snapshot->'charges')::text from public.billing_documents d join public.billing_documents r on r.id='${r.document_id}' where d.folio_id='${x.folio}' and d.kind='invoice';`),'true');
  });
 }

}
