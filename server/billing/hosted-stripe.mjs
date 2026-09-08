import {hostedHandler,machine,rawBody,json,withLane,UUID,safeError} from './hosted-core.mjs';
import {testConfig,stripeClient,createPaymentService,verifyEvent,rpc} from './stripe.mjs';
const eventTypes=new Set(['payment_intent.succeeded','payment_intent.processing','payment_intent.payment_failed','payment_intent.canceled','payment_intent.requires_action','payment_intent.amount_capturable_updated','charge.refunded','charge.dispute.created','charge.dispute.updated','application_fee.created','application_fee.refunded']);
export function compactEvent(event,scope,connected){
 if(!/^evt_[A-Za-z0-9]+$/.test(event.id??'')||!eventTypes.has(event.type))throw Error('BILLING_INVALID_EVENT');
 if(scope==='connect'?(event.account!==connected||event.type.startsWith('application_fee.')):(!!event.account||!event.type.startsWith('application_fee.')))throw Error('BILLING_INVALID_EVENT');
 const o=event.data.object;
 return {id:event.id,type:event.type,livemode:false,...(event.account?{account:event.account}:{}),data:{object:{id:o.id,livemode:false,...(o.charge?{charge:typeof o.charge==='string'?o.charge:o.charge.id}:{}),...(o.payment_intent?{payment_intent:typeof o.payment_intent==='string'?o.payment_intent:o.payment_intent.id}:{})}}};
}
export function createHostedStripe(options={}){
 return hostedHandler(async({req,res,config,env,service,user,scope,transport})=>{
  const url=new URL(req.url,'https://invalid.local');
  const action=url.pathname==='/api/billing'?url.searchParams.get('action'):url.pathname.split('/').pop();
  if(!['payment','webhook-platform','webhook-connect','run-stripe'].includes(action))throw Error('BILLING_INVALID_REQUEST');
  const platformSecret=env.STRIPE_WEBHOOK_SECRET_PLATFORM,connectSecret=env.STRIPE_WEBHOOK_SECRET_CONNECT;
  if(!platformSecret?.startsWith('whsec_')||!connectSecret?.startsWith('whsec_')||platformSecret===connectSecret||!/^acct_[A-Za-z0-9]+$/.test(env.BILLING_STRIPE_CONNECTED_ACCOUNT??''))throw Error('BILLING_HOSTED_CONFIG');
  const stripeConfig=testConfig({...env,STRIPE_WEBHOOK_SECRET:platformSecret});
  const payments=createPaymentService({admin:service,stripe:stripeClient(stripeConfig,transport),config:stripeConfig});
  if(action.startsWith('webhook-')){
   const kind=action==='webhook-connect'?'connect':'platform';
   const raw=await rawBody(req,256000);
   const event=compactEvent(verifyEvent(raw,req.headers['stripe-signature'],kind==='connect'?connectSecret:platformSecret,Date.now(),true),kind,env.BILLING_STRIPE_CONNECTED_ACCOUNT);
   // No Stripe network call before this durable insert, and no background promise after the ACK.
   return json(res,200,await rpc(service,'billing_hosted_receive',{p_context:config.context,p_scope:kind,p_event:event}));
  }
  if(action==='payment'){
   const client=await user(),body=JSON.parse((await rawBody(req)).toString());
   const key=body.action==='begin'?'folio_id':'attempt_id';if(!UUID.test(body[key]??''))throw Error('BILLING_INVALID_REQUEST');
   await scope({[key==='folio_id'?'p_folio':'p_attempt']:body[key]});return json(res,200,await payments.action(client,body));
  }
  machine(req,config);await rawBody(req);
  const result=await withLane(service,'stripe',async token=>{
   const job=await rpc(service,'billing_hosted_next',{p_context:config.context,p_lane:'stripe',p_token:token});if(!job)return {state:'idle'};
   let error=null;
   try{
    let attempt=job.attempt_id;
    if(job.event){await payments.receiveEvent(job.event);attempt=await rpc(service,'billing_hosted_event_attempt',{p_context:config.context,p_event:job.event.id});if(!attempt)throw Error('BILLING_EVENT_UNMATCHED');}
    const observed=await payments.sync(attempt);if(observed.state==='anomaly')throw Error('BILLING_PROVIDER_ANOMALY');
    if(job.event)await rpc(service,'billing_stripe_event_result',{p_event:job.event.id,p_error:null});
   }catch(e){error=safeError(e);}
   await rpc(service,'billing_hosted_result',{p_context:config.context,p_token:token,p_event:job.event?.id??null,p_attempt:job.attempt_id??null,p_error:error});
   return {state:error?'retry_pending':'processed',...(error?{error}:{})};
  });json(res,200,result);
 },options);
}
