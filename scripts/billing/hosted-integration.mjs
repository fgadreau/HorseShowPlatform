// Real PostgreSQL + signed HTTP handler + real Chromium. Storage is a private
// filesystem adapter here, NOT a qualification of hosted Supabase Storage HTTP.
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHostedStripe} from '../../server/billing/hosted-stripe.mjs';
import {createHostedDocuments} from '../../server/billing/hosted-documents.mjs';
import {PREPROD_REF,PREPROD_ORIGIN} from '../../server/billing/hosted-core.mjs';
const quote=v=>v===null?'null':"'"+(typeof v==='object'?JSON.stringify(v):String(v)).replaceAll("'","''")+"'";
export async function hostedIntegration({sql,session,check}){
 const context=sql("select f.billing_context_id from public.billing_test_fixture x join public.billing_folios f on f.id=(x.value->>'folio')::uuid where x.key='pdf'");
 const env={BILLING_HOSTED_ENABLED:'true',VITE_DEPLOY_ENV:'staging',VITE_SUPABASE_PROJECT_REF:PREPROD_REF,VITE_PRODUCTION_SUPABASE_PROJECT_REF:'differentproductionref',BILLING_SUPABASE_URL:`https://${PREPROD_REF}.supabase.co`,BILLING_WEB_ORIGIN:PREPROD_ORIGIN,VERCEL_GIT_COMMIT_REF:'preprod',BILLING_PILOT_CONTEXT_ID:context,BILLING_SUPABASE_ANON_KEY:'fixture',BILLING_SUPABASE_SERVICE_ROLE_KEY:'fixture',BILLING_WORKER_SECRET:'local-fixture-worker-secret-32-characters',STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_PUBLISHABLE_KEY:'pk_test_fixture',STRIPE_WEBHOOK_SECRET_PLATFORM:'whsec_platform_fixture',STRIPE_WEBHOOK_SECRET_CONNECT:'whsec_connect_fixture',BILLING_STRIPE_CONNECTED_ACCOUNT:'acct_fixture'};
 const rpc=async(name,args)=>{
  assert(/^billing_[a-z_]+$/.test(name));assert(Object.keys(args).every(k=>/^p_[a-z_]+$/.test(k)));
  const r=await session(`set role service_role;select to_jsonb(public.${name}(${Object.entries(args).map(([k,v])=>k+'=>'+quote(v)).join(',')}))::text;`);
  return r.code?{error:{message:r.err}}:{data:r.out.trim()?JSON.parse(r.out.trim()):null};
 };
 const uploads=[];
 const service={rpc,storage:{from:bucket=>({upload:async(path,bytes,options)=>{
  assert.equal(bucket,'billing-pdfs');assert.equal(options.upsert,false);
  const file='.tmp/billing-hosted/integration/'+path;mkdirSync(dirname(file),{recursive:true,mode:0o700});writeFileSync(file,bytes,{flag:'wx',mode:0o600});uploads.push({path,bytes:bytes.length});return {};
 }})}};
 const options={env,clientFactory:()=>service,transport:async()=>{throw Error('Remote network forbidden in SQL integration');}};
 async function call(handler,path,body,headers){
  const req=Readable.from([Buffer.from(body)]);req.method='POST';req.url=path;req.headers=headers;
  const res={statusCode:200,setHeader(){},end(s){this.body=JSON.parse(s);}};await handler(req,res);return res;
 }
 const raw=JSON.stringify({id:'evt_hostedIntegration',type:'payment_intent.succeeded',account:'acct_fixture',livemode:false,data:{object:{id:'pi_hostedIntegration',livemode:false,client_secret:'DO_NOT_STORE'}}});
 const t=Math.floor(Date.now()/1000),sig=`t=${t},v1=${createHmac('sha256',env.STRIPE_WEBHOOK_SECRET_CONNECT).update(`${t}.`).update(raw).digest('hex')}`;
 const handler=createHostedStripe(options);
 const deliveries=await Promise.all([call(handler,'/api/billing/webhook-connect',raw,{'stripe-signature':sig}),call(handler,'/api/billing/webhook-connect',raw,{'stripe-signature':sig})]);
 check('hosted signed HTTP concurrent replay: one real PostgreSQL inbox row before both ACKs',()=>{
  assert(deliveries.every(r=>r.statusCode===200),JSON.stringify(deliveries));
  assert.equal(sql("select count(*) from public.billing_hosted_inbox where id='evt_hostedIntegration'"),'1');
  assert.equal(sql("select event::text like '%DO_NOT_STORE%' from public.billing_hosted_inbox where id='evt_hostedIntegration'"),'f');
 });
 const claims=await Promise.all([rpc('billing_hosted_claim',{p_lane:'stripe'}),rpc('billing_hosted_claim',{p_lane:'stripe'})]);
 check('hosted real PostgreSQL concurrent lanes: only one worker enters',()=>assert.equal(claims.filter(r=>r.data).length,1));
 await rpc('billing_hosted_release',{p_lane:'stripe',p_token:claims.find(r=>r.data).data});
 // A renderer invoked by the machine route, no browser login or local timer.
 const result=await call(createHostedDocuments(options),'/api/billing-documents/run-pdf','{}',{authorization:`Bearer ${env.BILLING_WORKER_SECRET}`});
 check('hosted machine PDF route: real Chromium FR/EN and PostgreSQL artifact completion, filesystem Storage adapter',()=>{
  assert.equal(result.statusCode,200);assert.equal(result.body.state,'completed',JSON.stringify(result.body));assert.equal(uploads.length,2);
  assert(uploads.some(x=>x.path.endsWith('/fr.pdf'))&&uploads.some(x=>x.path.endsWith('/en.pdf')));
  const doc=uploads[0].path.split('/')[1];assert.equal(sql(`select count(*) from public.billing_pdf_artifacts where document_id='${doc}'`),'2');
 });
 mkdirSync('.tmp/billing-hosted',{recursive:true});writeFileSync('.tmp/billing-hosted/integration-results.json',JSON.stringify({complete:true,realPostgres:true,realChromium:true,signedSyntheticStripe:true,storage:'private filesystem adapter',uploads},null,2));
}
