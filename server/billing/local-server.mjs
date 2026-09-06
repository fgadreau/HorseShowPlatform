import http from 'node:http';
import {createClient} from '@supabase/supabase-js';
import {testConfig,stripeClient,createPaymentService} from './stripe.mjs';
export function localUrl(value){const u=new URL(value);if(u.protocol!=='http:'||!['localhost','127.0.0.1'].includes(u.hostname)||u.username||u.password)throw Error('BILLING_LOCAL_ONLY');return u.origin;}
export function startBillingServer(env=process.env){
 const url=localUrl(env.BILLING_SUPABASE_URL??'http://127.0.0.1:54321');
 const origin=localUrl(env.BILLING_WEB_ORIGIN??'http://127.0.0.1:5173');
 const key=env.BILLING_SUPABASE_ANON_KEY, secret=env.BILLING_SUPABASE_SERVICE_ROLE_KEY;
 if(!key||!secret)throw Error('BILLING_LOCAL_KEYS_REQUIRED');
 const config=testConfig(env),options={auth:{persistSession:false,autoRefreshToken:false}};
 const service=createPaymentService({admin:createClient(url,secret,options),stripe:stripeClient(config),config});
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
  try{
   if(req.method!=='POST'||!['/payment','/webhook'].includes(req.url))throw Error('BILLING_INVALID_REQUEST');
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>256000)throw Error('BILLING_INVALID_REQUEST');chunks.push(chunk);}const raw=Buffer.concat(chunks);
   if(req.url==='/webhook'){await service.receive(raw,req.headers['stripe-signature']);res.end('{}');void service.drain().catch(()=>{});return;}
   if(req.headers.origin!==origin)throw Error('BILLING_FORBIDDEN');
   const user=createClient(url,key,{...options,global:{headers:{Authorization:req.headers.authorization??''}}});
   const {data,error}=await user.auth.getUser();if(error||!data.user)throw Error('BILLING_FORBIDDEN');
   res.end(JSON.stringify(await service.action(user,JSON.parse(raw.toString()))));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:/^BILLING_[A-Z_]+$/.test(e.message)?e.message:'BILLING_PROVIDER_RETRY'}));}
 });
 const timer=setInterval(()=>void service.drain().catch(()=>{}),15000);timer.unref();server.on('close',()=>clearInterval(timer));
 server.listen(54331,'127.0.0.1',()=>console.log('Billing Stripe TEST local: http://127.0.0.1:54331'));
 return server;
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href)startBillingServer();
