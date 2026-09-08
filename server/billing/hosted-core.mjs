import {timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {rpc} from './stripe.mjs';
export const PREPROD_REF='qaguotdproxamgudnnsd';
export const PREPROD_ORIGIN='https://preprod.horseshowplatform.com';
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const BUDGET_MS=220000;
export function hostedConfig(env){
 if(env.BILLING_HOSTED_ENABLED!=='true')throw Error('BILLING_HOSTED_DISABLED');
 if(env.VITE_DEPLOY_ENV!=='staging'||env.VITE_SUPABASE_PROJECT_REF!==PREPROD_REF||env.BILLING_SUPABASE_URL!==`https://${PREPROD_REF}.supabase.co`||env.BILLING_WEB_ORIGIN!==PREPROD_ORIGIN||!['preprod','feat/billing-preprod-hosted-pilot'].includes(env.VERCEL_GIT_COMMIT_REF)||env.VITE_PRODUCTION_SUPABASE_PROJECT_REF===PREPROD_REF||!env.VITE_PRODUCTION_SUPABASE_PROJECT_REF)throw Error('BILLING_HOSTED_TARGET');
 if(!UUID.test(env.BILLING_PILOT_CONTEXT_ID??'')||!env.BILLING_SUPABASE_ANON_KEY||!env.BILLING_SUPABASE_SERVICE_ROLE_KEY||!/^.{32,}$/.test(env.BILLING_WORKER_SECRET??''))throw Error('BILLING_HOSTED_CONFIG');
 return {url:env.BILLING_SUPABASE_URL,key:env.BILLING_SUPABASE_ANON_KEY,secret:env.BILLING_SUPABASE_SERVICE_ROLE_KEY,context:env.BILLING_PILOT_CONTEXT_ID,workerSecret:env.BILLING_WORKER_SECRET};
}
export function machine(req,config){
 const actual=Buffer.from(req.headers.authorization??''),expected=Buffer.from(`Bearer ${config.workerSecret}`);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('BILLING_FORBIDDEN');
}
export async function rawBody(req,limit=4096){
 const chunks=[];let size=0;
 // Do not touch Vercel's parsed req.body: Stripe signs the original bytes.
 for await(const chunk of req){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>limit)throw Error('BILLING_INVALID_REQUEST');chunks.push(bytes);}
 return Buffer.concat(chunks);
}
export function json(res,status,value){res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));}
export const safeError=e=>/^BILLING_[A-Z_]+$/.test(e?.message??'')?e.message:'BILLING_HOSTED_UNAVAILABLE';
export function hostedHandler(run,{env=process.env,clientFactory=createClient,transport=fetch}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   const config=hostedConfig(env);
   if(req.method!=='POST')return json(res,405,{error:'BILLING_INVALID_REQUEST'});
   const deadline=AbortSignal.timeout(BUDGET_MS);
   const boundedFetch=(url,opts={})=>transport(url,{...opts,signal:opts.signal?AbortSignal.any([deadline,opts.signal]):deadline});
   const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}};
   const service=clientFactory(config.url,config.secret,options);
   const user=async()=>{
    if(req.headers.origin!==PREPROD_ORIGIN||!req.headers.authorization?.startsWith('Bearer '))throw Error('BILLING_FORBIDDEN');
    const client=clientFactory(config.url,config.key,{...options,global:{...options.global,headers:{Authorization:req.headers.authorization}}});
    const {data,error}=await client.auth.getUser();if(error||!data.user)throw Error('BILLING_FORBIDDEN');return client;
   };
   const scope=async(args)=>{if(!await rpc(service,'billing_hosted_scope',{p_context:config.context,...args}))throw Error('BILLING_FORBIDDEN');};
   await run({req,res,config,env,service,user,scope,transport:boundedFetch,deadline});
  }catch(e){const error=safeError(e);json(res,error==='BILLING_FORBIDDEN'?403:error==='BILLING_PDF_TOO_LARGE'?413:/SIGNATURE|INVALID|TEST_ONLY|EVENT_CONFLICT/.test(error)?400:503,{error});}
 };
}
export async function withLane(service,lane,run){
 const token=await rpc(service,'billing_hosted_claim',{p_lane:lane});if(!token)return {state:'busy'};
 let error=null;
 try{return await run(token);}catch(e){error=safeError(e);throw e;}
 finally{try{await rpc(service,'billing_hosted_release',{p_lane:lane,p_token:token,p_error:error});}catch{/* Expired claims are reclaimed; no in-memory lease is authoritative. */}}
}
