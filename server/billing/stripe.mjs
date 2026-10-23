import {createHmac,timingSafeEqual} from 'node:crypto';
export function testConfig(env=process.env) {
 const secret=env.STRIPE_SECRET_KEY, publishable=env.STRIPE_PUBLISHABLE_KEY, webhook=env.STRIPE_WEBHOOK_SECRET;
 if(!secret?.startsWith('sk_test_')||!publishable?.startsWith('pk_test_')||!webhook?.startsWith('whsec_')) throw Error('BILLING_STRIPE_TEST_CONFIG_REQUIRED');
 return {secret,publishable,webhook};
}
export function verifyEvent(raw,signature,secret,now=Date.now(),allowConnect=false) {
 const fields=String(signature??'').split(',').map(v=>v.split('='));
 const time=fields.find(([k])=>k==='t')?.[1];
 if(!time||!/^\d+$/.test(time)||Math.abs(now/1000-Number(time))>300)throw Error('BILLING_WEBHOOK_SIGNATURE');
 const expected=createHmac('sha256',secret).update(`${time}.`).update(raw).digest();
 if(!fields.some(([k,v])=>k==='v1'&&/^[a-f0-9]{64}$/i.test(v??'')&&timingSafeEqual(expected,Buffer.from(v,'hex'))))throw Error('BILLING_WEBHOOK_SIGNATURE');
 const event=JSON.parse(raw.toString('utf8'));
 if(event.livemode!==false||(event.account&&!allowConnect)||event.data?.object?.livemode!==false)throw Error('BILLING_TEST_ONLY');
 return event;
}
export function stripeClient(config,transport=fetch) {
 return async (path,params,key,account)=>{
  if(!config.secret.startsWith('sk_test_'))throw Error('BILLING_TEST_ONLY');
  const response=await transport(`https://api.stripe.com/v1${path}`,{method:params?'POST':'GET',headers:{Authorization:`Bearer ${config.secret}`,...(account?{'Stripe-Account':account}:{}),'Stripe-Version':'2024-06-20',...(params?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':key}:{})},body:params?new URLSearchParams(params):undefined,signal:AbortSignal.timeout(20000)});
  const body=await response.json();
  if(!response.ok)throw Error(response.status>=500?'BILLING_PROVIDER_RETRY':'BILLING_PROVIDER_REJECTED');
  if(body.livemode===true)throw Error('BILLING_TEST_ONLY');
  return body;
 };
}
export async function rpc(client,name,args) { const {data,error}=await client.rpc(name,args);if(error)throw Error(/^BILLING_[A-Z_]+$/.test(error.message)?error.message:'BILLING_SERVER_ERROR');return data; }
export function createPaymentService({admin,stripe,config,now=()=>Date.now()}) {
 async function attempt(id){const a=await rpc(admin,'billing_stripe_attempt_private',{p_attempt:id});if(!a)throw Error('BILLING_FORBIDDEN');return a;}
 async function checkAccount(a){
  const platform=await stripe('/account');
  if(platform.id!==a.platform_account)throw Error('BILLING_PROVIDER_ACCOUNT');
  const connected=await stripe(`/accounts/${a.connected_account}`);
  if(connected.id!==a.connected_account||(a.charge_mode==='direct'?(connected.controller?.fees?.payer!=='account'||connected.controller?.losses?.payments!=='stripe') : connected.type!=='express'))throw Error('BILLING_PROVIDER_ACCOUNT');
  return connected;
 }
 async function sync(id,{cancel=false}={}) {
  const a=await attempt(id);
  const connected=await checkAccount(a);
  const scoped=(path,params,key)=>stripe(path,params,key,a.charge_mode==='direct'?a.connected_account:undefined);
  let intent;
  if(a.provider_id) intent=await scoped(`/payment_intents/${a.provider_id}`);
  else {
   // Never reuse a pruned Stripe idempotency key: retain the reservation for explicit reconciliation.
   if(now()-Date.parse(a.created_at)>23*3600*1000){
    // Resolve old ambiguous creates by a bounded provider list, never a second POST.
    let cursor='';
    for(let page=0;page<10&&!intent;page++){
     const list=await scoped(`/payment_intents?limit=100&created[gte]=${Math.floor(Date.parse(a.created_at)/1000)-60}${cursor?`&starting_after=${cursor}`:''}`);
     if(!Array.isArray(list.data))break;
     const matches=list.data.filter(p=>p.metadata?.hsp_attempt_id===a.id);
     if(matches.length>1)throw Error('BILLING_RECONCILIATION_REQUIRED');
     if(matches.length)intent=await scoped(`/payment_intents/${matches[0].id}`);
     if(!list.has_more)break;
     cursor=list.data.at(-1)?.id??'';if(!cursor)break;
    }
    if(!intent)throw Error('BILLING_RECONCILIATION_REQUIRED');
   }
   if(!intent&&!connected.charges_enabled)throw Error('BILLING_PROVIDER_ACCOUNT');
   if(!intent)intent=await scoped('/payment_intents',{amount:String(Math.round(Number(a.amount)*100)),currency:a.currency.toLowerCase(),capture_method:'automatic','payment_method_types[]':'card',...(a.charge_mode==='direct'?{application_fee_amount:String(Math.round(Number(a.application_fee_amount)*100))}:{'transfer_data[destination]':a.connected_account}),'metadata[hsp_attempt_id]':a.id,description:'HSP — DEMO / FICTITIOUS'},`hsp-test-${a.id}`);
  }
  if(cancel&&!['succeeded','canceled'].includes(intent.status)) {
   try {intent=await scoped(`/payment_intents/${intent.id}/cancel`,{},`hsp-test-cancel-${a.id}`);}
   catch {intent=await scoped(`/payment_intents/${intent.id}`);}
  }
  const result=await rpc(admin,'billing_stripe_observe',{p_attempt:a.id,p_platform:a.platform_account,p_object:a.charge_mode==='direct'?{...intent,hsp_verified_account:a.connected_account}:intent});
  if(a.charge_mode==='direct'&&result.state==='succeeded'){
   const charge=await scoped(`/charges/${typeof intent.latest_charge==='string'?intent.latest_charge:intent.latest_charge?.id}`);
   if(charge.payment_intent!==intent.id||charge.livemode!==false)throw Error('BILLING_PROVIDER_ACCOUNT');
   if(charge.amount_refunded>0||charge.disputed){await rpc(admin,'billing_provider_flag',{p_attempt:a.id,p_reference:charge.id,p_reason:charge.disputed?'external_dispute':'external_refund'});}
   if(Number(a.application_fee_amount)>0){
    if(!charge.application_fee)throw Error('BILLING_PROVIDER_RETRY');
    const fee=await stripe(`/application_fees/${typeof charge.application_fee==='string'?charge.application_fee:charge.application_fee.id}`);
    if(fee.charge!==charge.id)throw Error('BILLING_PROVIDER_ACCOUNT');
    if(fee.refunded||Number(fee.amount_refunded)>0)await rpc(admin,'billing_provider_flag',{p_attempt:a.id,p_reference:fee.id,p_reason:'fee_mismatch'});
    await rpc(admin,'billing_hsp_confirm_fee',{p_attempt:a.id,p_fee:fee});
   }
  }
  return {...result,...(a.charge_mode==='direct'?{connected_account:a.connected_account,charge_mode:'direct'}:{}),attempt_id:a.id,client_secret:!['succeeded','canceled','anomaly'].includes(result.state)?intent.client_secret:undefined,publishable_key:config.publishable};
 }
 async function processEvent(event) {
  let query=admin.from('billing_stripe_attempts').select('id').eq('provider_id',event.provider_id);
  if(event.connected_account)query=query.eq('connected_account',event.connected_account).eq('charge_mode','direct');
  const {data,error}=await query.maybeSingle();
  if(error)throw Error('BILLING_SERVER_ERROR');
  if(!data)throw Error('BILLING_EVENT_UNMATCHED'); // Kept durable until create/reconciliation binds the provider ID.
  const result=await sync(data.id);
  if(result.state==='anomaly')throw Error('BILLING_PROVIDER_ANOMALY');
 }
 return {sync,async action(user,body){
  if(!body||Object.keys(body).some(k=>!['action','request_id','folio_id','amount','attempt_id'].includes(k)))throw Error('BILLING_UNEXPECTED_FIELD');
  let id=body.attempt_id;
  if(body.action==='begin')id=(await rpc(user,'begin_billing_stripe_attempt',{p_request:body.request_id,p_folio:body.folio_id,p_amount:body.amount})).attempt_id;
  else if(!['resume','cancel'].includes(body.action))throw Error('BILLING_INVALID_REQUEST');
  await rpc(user,'authorize_billing_stripe_attempt',{p_attempt:id});
  const result=await sync(id,{cancel:body.action==='cancel'});
  // Recheck linked payer after the external call before returning a client secret.
  await rpc(user,'authorize_billing_stripe_attempt',{p_attempt:id});
  return result;
 },async receive(raw,signature){
  const event=verifyEvent(raw,signature,config.webhook,Date.now(),true);
  return this.receiveEvent(event);
 },async receiveEvent(event){
  // Internal server entry for an already authenticated, durable sandbox inbox.
  if(event.livemode!==false||event.data?.object?.livemode!==false)throw Error('BILLING_TEST_ONLY');
  if(!event.type?.startsWith('payment_intent.')&&!['charge.refunded','charge.dispute.created','charge.dispute.updated','application_fee.created','application_fee.refunded'].includes(event.type))return;
  const platform=await stripe('/account');
  if(event.type.startsWith('application_fee.')){
   if(event.account)throw Error('BILLING_PROVIDER_ACCOUNT');
   const fee=await stripe(`/application_fees/${event.data.object.id}`);
   const charge=await stripe(`/charges/${fee.charge}`,undefined,undefined,fee.account);
   if(fee.livemode!==false||charge.livemode!==false||charge.application_fee!==fee.id)throw Error('BILLING_PROVIDER_ACCOUNT');
   await rpc(admin,'billing_stripe_receive_direct',{p_event:event.id,p_provider:charge.payment_intent,p_type:event.type,p_platform:platform.id,p_connected:fee.account,p_live:event.livemode});return;
  }
  if(event.account){
   let provider=event.data.object.id;
   if(event.type.startsWith('charge.')){
    const charge=event.type.startsWith('charge.dispute.')?await stripe(`/charges/${event.data.object.charge}`,undefined,undefined,event.account):event.data.object;
    provider=charge.payment_intent;
   }
   await rpc(admin,'billing_stripe_receive_direct',{p_event:event.id,p_provider:provider,p_type:event.type,p_platform:platform.id,p_connected:event.account,p_live:event.livemode});return;
  }
  await rpc(admin,'billing_stripe_receive',{p_event:event.id,p_provider:event.data.object.id,p_type:event.type,p_platform:platform.id,p_live:event.livemode});
 },async drain(){
  const {data,error}=await admin.from('billing_stripe_events').select('*').is('processed_at',null).order('attempts').order('id').limit(50);
  if(error)throw Error('BILLING_SERVER_ERROR');
  for(const event of data){let code=null;try{await processEvent(event);}catch(e){code=e.message.startsWith('BILLING_')?e.message:'BILLING_PROVIDER_RETRY';}await rpc(admin,'billing_stripe_event_result',{p_event:event.id,p_error:code});}
 }};
}
