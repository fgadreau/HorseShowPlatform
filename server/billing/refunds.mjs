import {rpc} from './stripe.mjs';

// Provider identifiers and Connect scope always come from the frozen payment.
export function createRefundService({admin,stripe,now=()=>Date.now()}) {
 async function sync(id) {
  const r=await rpc(admin,'billing_refund_private',{p_refund:id});
  if(!r)throw Error('BILLING_FORBIDDEN');
  if(['succeeded','failed','canceled'].includes(r.state))return {refund_id:r.id,state:r.state};
  const platform=await stripe('/account');
  if(platform.id!==r.platform_account)throw Error('BILLING_PROVIDER_ACCOUNT');
  const scoped=(path,params,key)=>stripe(path,params,key,r.charge_mode==='direct'?r.connected_account:undefined);
  const intent=await scoped(`/payment_intents/${r.provider_payment_intent}`);
  if(intent.id!==r.provider_payment_intent||intent.livemode!==false||intent.status!=='succeeded'||intent.currency!==r.currency.toLowerCase()||
    (r.charge_mode==='destination'&&intent.transfer_data?.destination!==r.connected_account))throw Error('BILLING_REFUND_PROVIDER_MISMATCH');
  let refund;
  if(r.provider_id)refund=await scoped(`/refunds/${r.provider_id}`);
  else if(now()-Date.parse(r.created_at)>23*3600*1000) {
   // A pruned provider idempotency key must never issue a second refund.
   let cursor='';
   for(let page=0;page<10&&!refund;page++){
    const list=await scoped(`/refunds?payment_intent=${r.provider_payment_intent}&limit=100${cursor?`&starting_after=${cursor}`:''}`);
    const matches=(list.data??[]).filter(item=>item.metadata?.hsp_refund_id===r.id);
    if(matches.length>1)throw Error('BILLING_RECONCILIATION_REQUIRED');
    if(matches.length)refund=matches[0];
    if(!list.has_more)break;cursor=list.data.at(-1)?.id;if(!cursor)break;
   }
   if(!refund)throw Error('BILLING_RECONCILIATION_REQUIRED');
  } else {
   refund=await scoped('/refunds',{
    payment_intent:r.provider_payment_intent,amount:String(Math.round(Number(r.amount)*100)),
    reason:'requested_by_customer','metadata[hsp_refund_id]':r.id,
    ...(r.charge_mode==='destination'?{reverse_transfer:'true'}:{}),
   },`hsp-refund-${r.id}`);
  }
  // Refund objects have no livemode field. Test mode is proven by the fetched
  // original PaymentIntent and the test-only transport, never by the browser.
  if(refund.livemode===true)throw Error('BILLING_TEST_ONLY');
  return rpc(admin,'billing_refund_observe',{p_refund:r.id,p_object:{...refund,hsp_verified_test:true}});
 }
 return {sync,async action(user,body){
  if(!body||Object.keys(body).some(k=>!['action','request_id','folio_id','payment_id','amount','reason','refund_id'].includes(k)))throw Error('BILLING_UNEXPECTED_FIELD');
  let id=body.refund_id;
  if(body.action==='refund')id=(await rpc(user,'begin_billing_refund',{p_request:body.request_id,p_folio:body.folio_id,p_payment:body.payment_id,p_amount:body.amount,p_reason:body.reason})).refund_id;
  else if(body.action!=='resume_refund')throw Error('BILLING_INVALID_REQUEST');
  await rpc(user,'authorize_billing_refund',{p_refund:id});
  const r=await rpc(admin,'billing_refund_private',{p_refund:id});
  if(r?.folio_id!==body.folio_id)throw Error('BILLING_FORBIDDEN');
  const result=await sync(id);
  await rpc(user,'authorize_billing_refund',{p_refund:id});
  return result;
 }};
}
