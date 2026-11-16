import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createRefundService} from '../../server/billing/refunds.mjs';
import {createPaymentService,verifyEvent} from '../../server/billing/stripe.mjs';
import {compactEvent} from '../../server/billing/hosted-stripe.mjs';

function fixture({mode='direct',lost=false,old=false,state='succeeded'}={}) {
 const calls=[],provider=new Map();let creates=0;
 const record={id:'refund',folio_id:'folio',state:'preparing',amount:57.49,currency:'CAD',provider_payment_intent:'pi_original',platform_account:'acct_platform',connected_account:'acct_connected',charge_mode:mode,created_at:new Date(Date.now()-(old?24*3600*1000:0)).toISOString()};
 const object={id:'re_refund',object:'refund',payment_intent:'pi_original',amount:5749,currency:'cad',status:state,metadata:{hsp_refund_id:'refund'}};
 const admin={rpc:async(n,args)=>{calls.push({n,args});if(n==='billing_refund_private')return {data:record};if(n==='billing_refund_observe'){assert.deepEqual(args.p_object,{...object,hsp_verified_test:true});record.provider_id=object.id;record.state=object.status;return {data:{state:object.status,refund_id:record.id}};}return {data:[]};}};
 const user={rpc:async(n,args)=>{calls.push({n,args});return {data:n==='begin_billing_refund'?{refund_id:'refund'}:{}};}};
 const stripe=async(path,params,key,account)=>{
  calls.push({path,params,key,account});if(path==='/account')return {id:'acct_platform'};
  assert.equal(account,mode==='direct'?'acct_connected':undefined);
  if(path==='/payment_intents/pi_original')return {id:'pi_original',status:'succeeded',currency:'cad',livemode:false,transfer_data:{destination:'acct_connected'}};
  if(path==='/refunds'){creates++;provider.set(key,object);if(lost&&creates===1)throw Error('BILLING_PROVIDER_RETRY');return object;}
  if(path.startsWith('/refunds?'))return {data:[object],has_more:false};
  if(path==='/refunds/re_refund')return object;throw Error('Unexpected path '+path);
 };
 return {calls,record,object,provider,user,admin,stripe,service:createRefundService({admin,stripe}),body:{action:'refund',request_id:'request',folio_id:'folio',payment_id:'payment',amount:57.49,reason:'Stall price difference'}};
}
test('refund is durably authorized before provider calls; direct Connect scope stays frozen',async()=>{
 const x=fixture();const result=await x.service.action(x.user,x.body);assert.equal(result.state,'succeeded');
 assert.equal(x.calls[0].n,'begin_billing_refund');assert.equal(x.calls[1].n,'authorize_billing_refund');
 const call=x.calls.find(c=>c.path==='/refunds');assert.equal(call.params.amount,'5749');assert.equal(call.params.payment_intent,'pi_original');assert.equal(call.params.reverse_transfer,undefined);assert.equal(call.account,'acct_connected');
 assert.equal(x.calls.at(-1).n,'authorize_billing_refund');
});
test('destination refund reverses the matching association transfer',async()=>{const x=fixture({mode:'destination'});await x.service.action(x.user,x.body);assert.equal(x.calls.find(c=>c.path==='/refunds').params.reverse_transfer,'true');});
test('lost response replays the same provider key and amount',async()=>{const x=fixture({lost:true});await assert.rejects(x.service.action(x.user,x.body),/RETRY/);await x.service.action(x.user,x.body);assert.equal(x.provider.size,1);assert.equal(x.calls.filter(c=>c.path==='/refunds').length,2);});
test('old ambiguous refund searches metadata and never posts another refund',async()=>{const x=fixture({old:true});await x.service.action(x.user,x.body);assert.equal(x.provider.size,0);assert(x.calls.some(c=>c.path?.startsWith('/refunds?')));});
test('old missing refund remains reserved for reconciliation',async()=>{const x=fixture({old:true});const service=createRefundService({admin:x.admin,stripe:async(...args)=>args[0].startsWith('/refunds?')?{data:[],has_more:false}:x.stripe(...args)});await assert.rejects(service.action(x.user,x.body),/RECONCILIATION/);assert.equal(x.provider.size,0);});
test('pending response is observed without declaring a successful refund',async()=>{const x=fixture({state:'pending'});assert.equal((await x.service.action(x.user,x.body)).state,'pending');assert.equal(x.record.state,'pending');});
test('client cannot override currency, amount scope or Connect account',async()=>{const x=fixture();await assert.rejects(x.service.action(x.user,{...x.body,connected_account:'acct_other'}),/UNEXPECTED/);assert.equal(x.calls.length,0);});
test('unauthorized user never reaches Stripe',async()=>{const x=fixture();const user={rpc:async()=>({error:{message:'BILLING_FORBIDDEN'}})};await assert.rejects(x.service.action(user,x.body),/FORBIDDEN/);assert.equal(x.provider.size,0);});
test('resume cannot escape the hosted folio scope',async()=>{const x=fixture();await assert.rejects(x.service.action(x.user,{action:'resume_refund',refund_id:'refund',folio_id:'other'}),/FORBIDDEN/);assert(!x.calls.some(c=>c.path));});
test('refund webhooks resolve original payment and use the trusted connected scope',async()=>{
 const calls=[],event={id:'evt_refund',type:'refund.updated',livemode:false,account:'acct_connected',data:{object:{id:'re_refund',object:'refund',payment_intent:'pi_original'}}};
 assert.equal(compactEvent(event,'connect','acct_connected').data.object.payment_intent,'pi_original');
 const admin={rpc:async(n,args)=>{calls.push({n,args});return {data:null};}};
 const stripe=async(path,params,key,account)=>path==='/account'?{id:'acct_platform'}:(assert.equal(account,'acct_connected'),path.startsWith('/payment_intents/')?{id:'pi_original',livemode:false}:{object:'refund',payment_intent:'pi_original'});
 await createPaymentService({admin,stripe,config:{}}).receiveEvent(event);
 assert.equal(calls[0].n,'billing_stripe_receive_direct');assert.equal(calls[0].args.p_provider,'pi_original');
});
test('signed real-shaped Refund events have no object livemode; live events stay rejected',()=>{
 const event={id:'evt_refund',type:'refund.updated',livemode:false,data:{object:{id:'re_test',object:'refund',payment_intent:'pi_test'}}};
 const time=Math.floor(Date.now()/1000),secret='whsec_test';
 function signed(value){const raw=Buffer.from(JSON.stringify(value));return [raw,`t=${time},v1=${createHmac('sha256',secret).update(`${time}.`).update(raw).digest('hex')}`,secret];}
 assert.equal(verifyEvent(...signed(event)).id,event.id);
 assert.throws(()=>verifyEvent(...signed({...event,livemode:true})),/TEST_ONLY/);
 assert.throws(()=>verifyEvent(...signed({...event,data:{object:{...event.data.object,livemode:true}}})),/TEST_ONLY/);
});
