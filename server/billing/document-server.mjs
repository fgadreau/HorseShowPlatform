import http from 'node:http';
import {createClient} from '@supabase/supabase-js';
import {createDocumentWorker,documentRpc,downloadDocument} from './document-worker.mjs';
function local(value){const u=new URL(value);if(u.protocol!=='http:'||!['localhost','127.0.0.1'].includes(u.hostname)||u.username||u.password)throw Error('BILLING_LOCAL_ONLY');return u.origin;}
export function startDocumentServer(env=process.env){
 const url=local(env.BILLING_PDF_SUPABASE_URL??'http://127.0.0.1:54321'),origin=local(env.BILLING_PDF_WEB_ORIGIN??'http://127.0.0.1:5173');
 const key=env.BILLING_PDF_SUPABASE_ANON_KEY,secret=env.BILLING_PDF_SUPABASE_SERVICE_ROLE_KEY;if(!key||!secret)throw Error('BILLING_LOCAL_KEYS_REQUIRED');
 const options={auth:{persistSession:false,autoRefreshToken:false}},service=createClient(url,secret,options),worker=createDocumentWorker({service});
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   if(req.method!=='POST'||!['/status','/retry','/download'].includes(req.url)||req.headers.origin!==origin)throw Error('BILLING_FORBIDDEN');
   const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>4096)throw Error('BILLING_INVALID_REQUEST');chunks.push(c);}const a=JSON.parse(Buffer.concat(chunks).toString());
   if(!/^[a-f0-9-]{36}$/i.test(a.documentId)||typeof a.personal!=='boolean')throw Error('BILLING_INVALID_REQUEST');
   const user=createClient(url,key,{...options,global:{headers:{Authorization:req.headers.authorization??''}}});const {data,error}=await user.auth.getUser();if(error||!data.user)throw Error('BILLING_FORBIDDEN');
   const status=()=>documentRpc(user,'billing_pdf_status',{p_document:a.documentId,p_personal:a.personal});await status();
   if(req.url==='/download'){const bytes=await downloadDocument({user,service,documentId:a.documentId,locale:a.locale,personal:a.personal});res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="HSP-${a.documentId}-${a.locale}.pdf"`);res.end(bytes);return;}
   if(req.url==='/retry')await worker.run(a.documentId);res.end(JSON.stringify(await status()));
  }catch(e){res.statusCode=400;res.end(JSON.stringify({error:/^BILLING_[A-Z_]+$/.test(e.message)?e.message:'BILLING_PDF_UNAVAILABLE'}));}
 });
 let running=false;const timer=setInterval(async()=>{if(running)return;running=true;try{await worker.run();}catch{}finally{running=false;}},5000);timer.unref();server.on('close',()=>clearInterval(timer));
 server.listen(54332,'127.0.0.1',()=>console.log('Billing PDF local: http://127.0.0.1:54332'));return server;
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href)startDocumentServer();
