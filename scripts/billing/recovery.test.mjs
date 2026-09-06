import test from 'node:test';
import assert from 'node:assert/strict';
import {submitCommand,replayCommand,pendingCommands,stripeKey,observeStripe} from '../../src/services/billingRecovery.ts';
function reset(){const storage={};Object.defineProperties(storage,{getItem:{value:k=>storage[k]??null},setItem:{value:(k,v)=>storage[k]=v},removeItem:{value:k=>delete storage[k]}});globalThis.localStorage=storage;globalThis.window=new EventTarget();}
test('Stripe timeout and account refresh keep key; confirmed cancellation permits same amount with new key',()=>{
 reset();const key=stripeKey('payer','folio','25');
 assert.equal(stripeKey('payer','folio','25'),key);
 assert.throws(()=>stripeKey('payer','folio','30'),/UNRESOLVED/);
 observeStripe('payer','folio',{attempt_id:'a',state:'processing'});
 assert.equal(stripeKey('payer','folio','25'),key);
 observeStripe('payer','folio',{attempt_id:'other',state:'canceled'});
 assert.equal(stripeKey('payer','folio','25'),key);
 observeStripe('payer','folio',{attempt_id:'a',state:'canceled'});
 assert.notEqual(stripeKey('payer','folio','25'),key);
});
test('committed manual payment with lost response replays original version, allocation, date and key after reload',async()=>{
 reset();let receipts=0;const ledger=new Map(),calls=[];
 const rpc=async(name,args)=>{calls.push(structuredClone(args));if(ledger.has(args.p_request_id)){assert.deepEqual(args,ledger.get(args.p_request_id).args);return ledger.get(args.p_request_id).result;}const result={receipt:++receipts};ledger.set(args.p_request_id,{args:structuredClone(args),result});if(receipts===1)throw Error('Failed to fetch');return result;};
 const args={p_payment:{folio_id:'f',version:1,amount:25,received_at:'2026-09-06T12:00:00Z',allocations:[{charge_id:'old',amount:25}]}};
 await assert.rejects(submitCommand('staff','record_billing_payment',args,rpc));
 const refreshed={p_payment:{...args.p_payment,version:2,allocations:[{charge_id:'new',amount:25}]}};
 await assert.rejects(submitCommand('staff','record_billing_payment',refreshed,rpc),/UNRESOLVED/);
 await assert.rejects(submitCommand('staff','add_billing_sale',{},rpc),/UNRESOLVED/);
 // A fresh module instance reads only durable storage, not the previous screen state.
 const reloaded=await import('../../src/services/billingRecovery.ts?reload');
 assert.deepEqual(await reloaded.replayCommand('staff','record_billing_payment',rpc),{receipt:1});
 assert.deepEqual(calls[0],calls[1]);assert.equal(receipts,1);assert.equal(pendingCommands('staff').length,0);
 await submitCommand('staff','record_billing_payment',refreshed,rpc);assert.equal(receipts,2);assert.notEqual(calls[2].p_request_id,calls[0].p_request_id);
});
test('uncertain replay and revoked access retain original command',async()=>{
 reset();const rpc=async()=>{throw Error('BILLING_FORBIDDEN');};
 await assert.rejects(submitCommand('p','finalize_own_billing_folio',{p_version:1},rpc));
 const original=pendingCommands('p');await assert.rejects(replayCommand('p','finalize_own_billing_folio',rpc));assert.deepEqual(pendingCommands('p'),original);
});
test('explicit stale rejection resolves pending command and permits a corrected command',async()=>{
 reset();await assert.rejects(submitCommand('staff','record_billing_payment',{version:1},async()=>{throw Error('BILLING_STALE_VERSION');}));
 assert.equal(pendingCommands('staff').length,0);
 assert.equal(await submitCommand('staff','record_billing_payment',{version:2},async()=> 'accepted'),'accepted');
});
test('staff closes first: lost rejection stays uncertain, exact replay resolves NOT_ADMISSIBLE, another account can finalize once',async()=>{
 reset();const invoices=new Map([['closed-by-staff','staff-invoice']]),operations=new Map(),calls=[];let loseReply=true;
 const rpc=async(name,args)=>{
  calls.push(structuredClone(args));
  if(operations.has(args.p_request_id))return operations.get(args.p_request_id);
  if(invoices.has(args.p_folio)){
   if(loseReply){loseReply=false;throw Error('Failed to fetch');}
   throw Error('BILLING_NOT_ADMISSIBLE');
  }
  const result={invoice:'payer-invoice'};invoices.set(args.p_folio,result.invoice);operations.set(args.p_request_id,result);return result;
 };
 const original={p_folio:'closed-by-staff',p_version:3,p_recap_id:'confirmed-before-staff-close'};
 await assert.rejects(submitCommand('payer','finalize_own_billing_folio',original,rpc),/Failed to fetch/);
 const command=pendingCommands('payer')[0];
 await assert.rejects(submitCommand('payer','finalize_own_billing_folio',{...original,p_folio:'other-account'},rpc),/UNRESOLVED/);
 await assert.rejects(replayCommand('payer','finalize_own_billing_folio',rpc),/BILLING_NOT_ADMISSIBLE/);
 assert.deepEqual(calls[0],calls[1]);assert.equal(operations.size,0);assert.equal(pendingCommands('payer').length,0);
 const next={p_folio:'other-account',p_version:1,p_recap_id:'other-recap'};
 await submitCommand('payer','finalize_own_billing_folio',next,rpc);
 assert.notEqual(calls[2].p_request_id,command.id);assert.equal(invoices.size,2);assert.equal(operations.size,1);
 await rpc('finalize_own_billing_folio',calls[2]);assert.equal(invoices.size,2);assert.equal(operations.size,1);
});
const {definitiveRejections}=await import('../../src/services/billingRecovery.ts');
for(const [name,codes] of Object.entries(definitiveRejections))for(const code of codes){
 test(`${name}: definitive ${code} releases only the rejected command`,async()=>{
  reset();await assert.rejects(submitCommand('p',name,{},async()=>{throw Error(code);}));assert.equal(pendingCommands('p').length,0);
 });
}
for(const message of ['Failed to fetch','Timeout','BILLING_SERVER_ERROR','BILLING_PROVIDER_RETRY','BILLING_FORBIDDEN','BILLING_IDEMPOTENCY_CONFLICT','BILLING_UNKNOWN_BUSINESS_ERROR']){
 test(`ambiguous ${message} preserves original key and payload`,async()=>{
  reset();const rpc=async()=>{throw Error(message);};await assert.rejects(submitCommand('p','finalize_own_billing_folio',{p_version:1},rpc));const original=pendingCommands('p');
  await assert.rejects(replayCommand('p','finalize_own_billing_folio',rpc));assert.deepEqual(pendingCommands('p'),original);assert.equal(original.length,1);
 });
}
test('NOT_ADMISSIBLE is not automatically definitive for an unaudited RPC',async()=>{
 reset();await assert.rejects(submitCommand('p','unknown_rpc',{},async()=>{throw Error('BILLING_NOT_ADMISSIBLE');}));assert.equal(pendingCommands('p').length,1);
});
