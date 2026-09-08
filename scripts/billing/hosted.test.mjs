import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHmac} from 'node:crypto';
import {createHostedStripe} from '../../server/billing/hosted-stripe.mjs';
import {createHostedDocuments,boundedRender} from '../../server/billing/hosted-documents.mjs';
import {hostedConfig,PREPROD_REF,PREPROD_ORIGIN} from '../../server/billing/hosted-core.mjs';
const context='11111111-1111-4111-8111-111111111111',document='22222222-2222-4222-8222-222222222222';
const env={BILLING_HOSTED_ENABLED:'true',VITE_DEPLOY_ENV:'staging',VITE_SUPABASE_PROJECT_REF:PREPROD_REF,VITE_PRODUCTION_SUPABASE_PROJECT_REF:'differentproductionref',BILLING_SUPABASE_URL:`https://${PREPROD_REF}.supabase.co`,BILLING_WEB_ORIGIN:PREPROD_ORIGIN,VERCEL_GIT_COMMIT_REF:'preprod',BILLING_PILOT_CONTEXT_ID:context,BILLING_SUPABASE_ANON_KEY:'public-test',BILLING_SUPABASE_SERVICE_ROLE_KEY:'private-test',BILLING_WORKER_SECRET:'worker-secret-fixture-only-32-characters',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PUBLISHABLE_KEY:'pk_test_fixture',STRIPE_WEBHOOK_SECRET_PLATFORM:'whsec_platform_fixture',STRIPE_WEBHOOK_SECRET_CONNECT:'whsec_connect_fixture',BILLING_STRIPE_CONNECTED_ACCOUNT:'acct_connected'};
const event=(type='payment_intent.succeeded')=>({id:'evt_fixture',type,livemode:false,...(type.startsWith('application_fee')?{}:{account:'acct_connected'}),data:{object:{id:type.startsWith('application_fee')?'fee_fixture':'pi_fixture',livemode:false,client_secret:'MUST_NOT_PERSIST'}}});
const sign=(raw,key=env.STRIPE_WEBHOOK_SECRET_CONNECT,t=Math.floor(Date.now()/1000))=>`t=${t},v1=${createHmac('sha256',key).update(`${t}.`).update(raw).digest('hex')}`;
async function request(handler,path,{body='{}',headers={},parsed=false}={}){
 const req=Readable.from([Buffer.from(body)]);req.method='POST';req.url=path;req.headers=headers;
 if(parsed)Object.defineProperty(req,'body',{get(){throw Error('Parsed body accessed');}});
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(data){this.body=Buffer.isBuffer(data)?data:JSON.parse(data);}};
 await handler(req,res);return res;
}
function fixture(overrides={}){
 const calls=[];
 const service={auth:{getUser:async()=>({data:{user:{id:'user'}}})},rpc:async(n,args)=>{calls.push({n,args});return {data:await (overrides[n]??(()=>true))(args)};}};
 return {calls,service,options:{env,clientFactory:()=>service,transport:async()=>{throw Error('Unexpected network');}}};
}
test('hosted guard denies PROD, disabled, wrong branch, missing context and wrong project',()=>{
 assert.equal(hostedConfig(env).context,context);
 for(const patch of [{BILLING_HOSTED_ENABLED:'false'},{VITE_DEPLOY_ENV:'production'},{VITE_SUPABASE_PROJECT_REF:'other'},{VERCEL_GIT_COMMIT_REF:'main'},{BILLING_PILOT_CONTEXT_ID:''},{VITE_PRODUCTION_SUPABASE_PROJECT_REF:PREPROD_REF}])assert.throws(()=>hostedConfig({...env,...patch}));
});
test('raw signed Connect event persists before ACK, without Stripe network or client secret; replay is stable',async()=>{
 const f=fixture();const handler=createHostedStripe(f.options);const raw=JSON.stringify(event(),null,2);
 for(let i=0;i<2;i++){const r=await request(handler,'/api/billing?action=webhook-connect&x-vercel-protection-bypass=fixture',{body:raw,headers:{'stripe-signature':sign(raw)},parsed:true});assert.equal(r.statusCode,200);}
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].n,'billing_hosted_receive');assert.deepEqual(f.calls[0],f.calls[1]);assert(!JSON.stringify(f.calls).includes('MUST_NOT_PERSIST'));
});
test('platform has a distinct signing secret; wrong secret, scope, signature, live and stale delivery do not persist',async()=>{
 const f=fixture(),handler=createHostedStripe(f.options),raw=JSON.stringify(event('application_fee.created'));
 assert.equal((await request(handler,'/api/billing/webhook-platform',{body:raw,headers:{'stripe-signature':sign(raw,env.STRIPE_WEBHOOK_SECRET_PLATFORM)}})).statusCode,200);
 f.calls.length=0;
 for(const [path,body,signature] of [
  ['webhook-platform',raw,sign(raw)],['webhook-connect',raw,sign(raw)],
  ['webhook-connect',JSON.stringify({...event(),livemode:true}),sign(JSON.stringify({...event(),livemode:true}))],
  ['webhook-connect',JSON.stringify(event()),sign(JSON.stringify(event()),env.STRIPE_WEBHOOK_SECRET_CONNECT,1)],
  ['webhook-connect',JSON.stringify(event())+' ',sign(JSON.stringify(event()))],
 ])assert.equal((await request(handler,'/api/billing/'+path,{body,headers:{'stripe-signature':signature}})).statusCode,400);
 assert.equal(f.calls.length,0);
});
test('database failure is not acknowledged as successful delivery',async()=>{
 const f=fixture({'billing_hosted_receive':()=>{throw Error('offline');}}),raw=JSON.stringify(event());
 assert.equal((await request(createHostedStripe(f.options),'/api/billing/webhook-connect',{body:raw,headers:{'stripe-signature':sign(raw)}})).statusCode,503);
});
test('machine bypass header alone is not worker authentication, and user token cannot drain',async()=>{
 for(const headers of [{},{'x-vercel-protection-bypass':'anything'},{authorization:'Bearer user-session'}]){
  const f=fixture();assert.equal((await request(createHostedStripe(f.options),'/api/billing/run-stripe',{headers})).statusCode,403);assert.equal(f.calls.length,0);
 }
 const f=fixture({billing_hosted_claim:()=>null});
 const r=await request(createHostedStripe(f.options),'/api/billing/run-stripe',{headers:{authorization:`Bearer ${env.BILLING_WORKER_SECRET}`}});assert.equal(r.body.state,'busy');assert.equal(f.calls.length,1);
});
test('bounded worker takes only one job and releases a lane with no visitor',async()=>{
 const f=fixture({billing_hosted_claim:()=>document,billing_hosted_next:()=>null});
 const r=await request(createHostedStripe(f.options),'/api/billing/run-stripe',{headers:{authorization:`Bearer ${env.BILLING_WORKER_SECRET}`}});
 assert.equal(r.body.state,'idle');assert.deepEqual(f.calls.map(c=>c.n),['billing_hosted_claim','billing_hosted_next','billing_hosted_release']);
});
test('failed Stripe enrichment remains in inbox with next retry and does not complete an event',async()=>{
 const f=fixture({billing_hosted_claim:()=>document,billing_hosted_next:()=>({event:event()})});
 const r=await request(createHostedStripe(f.options),'/api/billing/run-stripe',{headers:{authorization:`Bearer ${env.BILLING_WORKER_SECRET}`}});
 assert.equal(r.body.state,'retry_pending');assert(f.calls.find(c=>c.n==='billing_hosted_result').args.p_error);assert(!f.calls.some(c=>c.n==='billing_stripe_event_result'));
});
test('document routes enforce user auth/origin/scope; retry does not launch Chromium',async()=>{
 const f=fixture({billing_pdf_status:()=>({state:'failed',retry_at:new Date().toISOString()})});
 let renders=0;const handler=createHostedDocuments({...f.options,render:async()=>{renders++;}}),body=JSON.stringify({documentId:document,personal:true,locale:'fr'});
 assert.equal((await request(handler,'/api/billing-documents/status',{body})).statusCode,403);
 const r=await request(handler,'/api/billing-documents?action=retry',{body,headers:{authorization:'Bearer user',origin:PREPROD_ORIGIN}});
 assert.equal(r.body.state,'failed');assert.equal(renders,0);assert(!f.calls.some(c=>c.n==='billing_hosted_claim'));
 const denied=fixture({billing_hosted_scope:()=>false});assert.equal((await request(createHostedDocuments(denied.options),'/api/billing-documents/status',{body,headers:{authorization:'Bearer user',origin:PREPROD_ORIGIN}})).statusCode,403);
});
test('worker generates both locales, privately uploads without overwrite and completes only after both',async()=>{
 const uploaded=[],rendered=[];
 const f=fixture({billing_hosted_claim:()=>document,billing_hosted_next:()=>({document_id:document}),billing_claim_document:()=>({document_id:document,claim_token:context}),billing_pdf_source:()=>({id:document,organization_id:context}),billing_pdf_complete:args=>{assert.equal(uploaded.length,2);assert.equal(args.p_artifacts.length,2);return {state:'completed'};}});
 f.service.storage={from:bucket=>({upload:async(path,bytes,options)=>{assert.equal(bucket,'billing-pdfs');assert.equal(options.upsert,false);uploaded.push({path,bytes});return {};}})};
 const r=await request(createHostedDocuments({...f.options,render:async(d,l)=>{rendered.push(l);return Buffer.from('%PDF-'+l);}}),'/api/billing-documents/run-pdf',{headers:{authorization:`Bearer ${env.BILLING_WORKER_SECRET}`}});
 assert.equal(r.body.state,'completed');assert.deepEqual(rendered,['fr','en']);assert.equal(f.calls.at(-1).n,'billing_hosted_release');
});
test('partial PDF upload failure leaves no completed artifacts and schedules existing retry',async()=>{
 const f=fixture({billing_hosted_claim:()=>document,billing_hosted_next:()=>({document_id:document}),billing_claim_document:()=>({document_id:document,claim_token:context}),billing_pdf_source:()=>({id:document,organization_id:context})});let count=0;
 f.service.storage={from:()=>({upload:async()=>++count===2?{error:true}:{}})};
 const r=await request(createHostedDocuments({...f.options,render:async()=>Buffer.from('%PDF-fixture')}),'/api/billing-documents/run-pdf',{headers:{authorization:`Bearer ${env.BILLING_WORKER_SECRET}`}});
 assert.equal(r.body.state,'failed');assert(!f.calls.some(c=>c.n==='billing_pdf_complete'));assert.equal(f.calls.find(c=>c.n==='billing_finish_document').args.p_retry_seconds,60);
});
test('render deadline closes Chromium and rejects before lane can be released',async()=>{
 let reject,closed=0;const pending=new Promise((_,r)=>{reject=r;});
 const browser={launch:async()=>({close:async()=>{closed++;reject(Error('Browser closed'));}})};
 await assert.rejects(boundedRender({},'fr',{browser,timeoutMs:10,render:()=>pending}),/Browser closed/);assert(closed>=1);
});
test('signed webhook through worker, failed fee confirmation and replay retain one payment and one recovery (simulated provider/store)',async()=>{
 let stored=null,processed=false,paid=false,recovered=false,failFee=true,payments=0,recoveries=0;
 const a={id:document,platform_account:'acct_platform',connected_account:'acct_connected',charge_mode:'direct',provider_id:'pi_fixture',application_fee_amount:'1.00'};
 const f=fixture({billing_hosted_receive:({p_event})=>{stored??=p_event;return {accepted:true};},billing_hosted_claim:()=>context,billing_hosted_next:()=>stored&&!processed?{event:stored}:null,
  billing_stripe_receive_direct:()=>true,billing_hosted_event_attempt:()=>document,billing_stripe_attempt_private:()=>a,
  billing_stripe_observe:()=>{if(!paid){paid=true;payments++;}return {state:'succeeded',receipt_id:document};},
  billing_hsp_confirm_fee:()=>{if(!recovered){recovered=true;recoveries++;}},billing_hosted_result:({p_error})=>{processed=!p_error;}});
 const transport=async url=>{
  const path=new URL(url).pathname.replace('/v1','');let data;
  if(path==='/account')data={id:'acct_platform'};
  else if(path==='/accounts/acct_connected')data={id:'acct_connected',controller:{fees:{payer:'account'},losses:{payments:'stripe'}}};
  else if(path==='/payment_intents/pi_fixture')data={id:'pi_fixture',status:'succeeded',latest_charge:'ch_fixture',client_secret:'NOT_FOR_WORKER_RESPONSE'};
  else if(path==='/charges/ch_fixture')data={id:'ch_fixture',payment_intent:'pi_fixture',livemode:false,application_fee:'fee_fixture',amount_refunded:0};
  else if(path==='/application_fees/fee_fixture'){if(failFee){failFee=false;throw Error('Provider offline');}data={id:'fee_fixture',charge:'ch_fixture',amount_refunded:0};}
  else throw Error('Unexpected provider request '+path);
  return {ok:true,json:async()=>data};
 };
 const handler=createHostedStripe({...f.options,transport}),raw=JSON.stringify(event());
 const deliver=()=>request(handler,'/api/billing/webhook-connect',{body:raw,headers:{'stripe-signature':sign(raw)}});
 const run=()=>request(handler,'/api/billing/run-stripe',{headers:{authorization:`Bearer ${env.BILLING_WORKER_SECRET}`}});
 assert.equal((await deliver()).statusCode,200);assert.equal((await run()).body.state,'retry_pending');assert.equal(payments,1);
 await deliver();const success=await run();assert.equal(success.body.state,'processed');assert(!JSON.stringify(success).includes('NOT_FOR_WORKER_RESPONSE'));
 await deliver();assert.equal((await run()).body.state,'idle');assert.equal(payments,1);assert.equal(recoveries,1);
});
