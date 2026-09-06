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
