// Local authenticated onboarding for one EXISTING sandbox account. No account mutation or ToS acceptance.
import http from 'node:http';
import {createClient} from '@supabase/supabase-js';
import {localUrl} from './local-server.mjs';
export function onboardingService({stripe,account,platform,returnUrl,refreshUrl}){
 async function inspect(){
  const p=await stripe('/account'),a=await stripe('/accounts/'+account);
  if(p.id!==platform||a.id!==account||a.controller?.fees?.payer!=='account'||a.controller?.losses?.payments!=='stripe'||a.controller?.stripe_dashboard?.type!=='full')throw Error('BILLING_PROVIDER_ACCOUNT');
  return a;
 }
 return async(user,action)=>{
  const login=await user.auth.getUser();if(login.error||!login.data.user)throw Error('BILLING_FORBIDDEN');
  const admin=await user.rpc('is_platform_admin');if(admin.error||admin.data!==true)throw Error('BILLING_FORBIDDEN');
  if(!['status','link'].includes(action))throw Error('BILLING_INVALID_REQUEST');
  const a=await inspect();
  if(action==='status')return {account:a.id,charges_enabled:a.charges_enabled,payouts_enabled:a.payouts_enabled,email_present:Boolean(a.email),tos_accepted:Boolean(a.tos_acceptance?.date),requirements:a.requirements?.currently_due??[],disabled_reason:a.requirements?.disabled_reason??null};
  const link=await stripe('/account_links',{account:a.id,type:'account_onboarding',return_url:returnUrl,refresh_url:refreshUrl});
  const u=new URL(link.url);if(u.protocol!=='https:'||u.hostname!=='connect.stripe.com')throw Error('BILLING_PROVIDER_ACCOUNT');
  return {url:link.url,expires_at:link.expires_at};
 };
}
export function startOnboarding(env=process.env){
 const supabase=localUrl(env.BILLING_SUPABASE_URL),origin=localUrl(env.HSP_ONBOARDING_ORIGIN),base=new URL(env.HSP_ONBOARDING_PUBLIC_ORIGIN);
 if(!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')||base.protocol!=='https:'||!base.hostname.endsWith('.app.github.dev'))throw Error('BILLING_TEST_ONLY');
 if(!/^acct_[A-Za-z0-9]+$/.test(env.HSP_ONBOARDING_ACCOUNT??'')||!/^acct_[A-Za-z0-9]+$/.test(env.HSP_ONBOARDING_PLATFORM??''))throw Error('BILLING_PROVIDER_ACCOUNT');
 const stripe=async(path,params)=>{
  const r=await fetch('https://api.stripe.com/v1'+path,{method:params?'POST':'GET',headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'Stripe-Version':'2024-06-20',...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body:params?new URLSearchParams(params):undefined,signal:AbortSignal.timeout(15000)});
  const value=await r.json();if(!r.ok)throw Error('BILLING_ONBOARDING_UNAVAILABLE');if(value.livemode===true)throw Error('BILLING_TEST_ONLY');return value;
 };
 const service=onboardingService({stripe,account:env.HSP_ONBOARDING_ACCOUNT,platform:env.HSP_ONBOARDING_PLATFORM,returnUrl:base.origin+'/billing-onboarding.html?return=1',refreshUrl:base.origin+'/billing-onboarding.html?refresh=1'});
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  try{
   if(req.method!=='POST'||req.headers.origin!==origin||!['/status','/link'].includes(req.url))throw Error('BILLING_FORBIDDEN');
   let size=0;for await(const chunk of req){size+=chunk.length;if(size>100)throw Error('BILLING_INVALID_REQUEST');} // Account and return URLs cannot come from browser input.
   const user=createClient(supabase,env.BILLING_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:req.headers.authorization??''}}});
   res.end(JSON.stringify(await service(user,req.url.slice(1))));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:/^BILLING_[A-Z_]+$/.test(e.message)?e.message:'BILLING_ONBOARDING_UNAVAILABLE'}));}
 });
 server.listen(54333,'127.0.0.1',()=>console.log('HSP sandbox onboarding ready on local port 54333'));return server;
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href)startOnboarding();
