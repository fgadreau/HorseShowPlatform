import {Readable} from 'node:stream';
import {createClient} from '@supabase/supabase-js';
import {createAuthorizationHandler} from './authorization.mjs';
import {createCertificateHandler} from './certificate-delivery.mjs';
import {createVerificationHandler} from './verification.mjs';
import {lookupOmvq} from './omvq.mjs';
import {createPreprodOutbox,outboxKey} from './preprod-outbox.mjs';
import {serverlessBrowser} from './serverless-browser.mjs';
export const PREPROD_REF='qaguotdproxamgudnnsd';
export const PREPROD_ORIGIN='https://horse-show-platform-git-preprod-felix-gadreau-girard-s-projects.vercel.app';
export function hostedConfig(env){
 if(env.VITE_DEPLOY_ENV!=='staging'||env.VITE_SUPABASE_PROJECT_REF!==PREPROD_REF||env.VITE_SUPABASE_URL!==`https://${PREPROD_REF}.supabase.co`||env.VERCEL_GIT_COMMIT_REF!=='preprod')return {allowed:false,missing:[]};
 const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY;
 const secret=env.VET_SUPABASE_SERVICE_ROLE_KEY;
 const missing=[];if(!key)missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');if(!secret)missing.push('VET_SUPABASE_SERVICE_ROLE_KEY');
 if(secret?.split('.').length===3){try{const payload=JSON.parse(Buffer.from(secret.split('.')[1],'base64url'));if(payload.ref!==PREPROD_REF||payload.role!=='service_role')missing.push('VET_SUPABASE_SERVICE_ROLE_KEY:wrong_project');}catch{missing.push('VET_SUPABASE_SERVICE_ROLE_KEY:invalid');}}
 let encryptionKey;try{encryptionKey=outboxKey(env.VET_PREPROD_OUTBOX_KEY);}catch{missing.push('VET_PREPROD_OUTBOX_KEY');}
 return {allowed:true,key,secret,encryptionKey,missing,enabled:env.VET_WORKER_ENABLED==='true',omvq:env.VET_OMVQ_ENABLED==='true'};
}
const endpoints=new Set(['health','browser-check','verify','authorization-request','authorization-summary','authorization-approve','certificate-pdf','certificate-email','outbox-message']);
export function createHostedHandler(env=process.env,{browser=serverlessBrowser,clientFactory=createClient}={}){
 const c=hostedConfig(env);const coreMissing=c.missing.filter(n=>n!=='VET_PREPROD_OUTBOX_KEY');let handlers;
 return async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(data));};
  const url=new URL(req.url,'https://invalid.local');
  const action=url.pathname==='/api/vet'?url.searchParams.get('action'):url.pathname.split('/').pop();
  if(!c.allowed||!endpoints.has(action))return send(404,{error:'Service indisponible.'});
  if(action==='health'&&req.method==='GET')return send(200,{ready:!!c.enabled&&!coreMissing.length,mail:!!c.enabled&&!coreMissing.length&&!!c.encryptionKey,omvq:!!c.enabled&&!coreMissing.length&&c.omvq,mail_mode:'preprod_private',missing:c.missing,enabled:c.enabled});
  // Read-only diagnostic uses only the existing public key and an authenticated HSP admin.
  // It remains available before the worker's service-role secret is configured.
  if(action==='browser-check'){
   if(req.method!=='POST'||req.headers.origin!==PREPROD_ORIGIN)return send(403,{error:'Origine ou méthode refusée.'});
   if(!c.key)return send(503,{error:'Configuration publique PREPROD absente.'});
   if(!req.headers.authorization?.startsWith('Bearer '))return send(401,{error:'Connexion requise.'});
   try{
    const client=clientFactory(`https://${PREPROD_REF}.supabase.co`,c.key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:req.headers.authorization}}});
    const auth=await client.auth.getUser();if(auth.error||!auth.data.user)return send(401,{error:'Session invalide.'});
    const role=await client.rpc('is_platform_admin');if(role.error||role.data!==true)return send(403,{error:'Administration HSP requise.'});
    const instance=await browser.launch({timeout:15000});try{const context=await instance.newContext({javaScriptEnabled:false});await context.route('**/*',r=>r.abort());const page=await context.newPage();await page.setContent('<p>TEST PREPROD — diagnostic du navigateur</p>');const pdf=await page.pdf({format:'A4'});return send(200,{browser:true,pdf:pdf.subarray(0,5).toString()==='%PDF-',external_requests:0});}finally{await instance.close();}
   }catch{return send(503,{error:'Diagnostic Chromium indisponible.'});}
  }
  if(!c.enabled||coreMissing.length)return send(503,{error:'Service PREPROD en attente de configuration. Le brouillon est conservé.'});
  if(req.headers.origin!==PREPROD_ORIGIN)return send(403,{error:'Origine refusée.'});
  if(req.method==='OPTIONS')return send(204,{});
  if(req.method!=='POST')return send(405,{error:'Méthode refusée.'});
  try{
   if(!handlers){
    const opts={auth:{persistSession:false,autoRefreshToken:false}};
    const userClient=auth=>clientFactory(`https://${PREPROD_REF}.supabase.co`,c.key,{...opts,global:{headers:{Authorization:auth}}});
    const serviceClient=clientFactory(`https://${PREPROD_REF}.supabase.co`,c.secret,opts);
    const unavailable=async()=>{throw Error('OUTBOX_KEY_REQUIRED');};
    const outbox=c.encryptionKey?createPreprodOutbox(serviceClient,c.encryptionKey):{captureAuthorization:unavailable,sendMail:unavailable,read:unavailable};
    const shared={userClient,serviceClient,origin:PREPROD_ORIGIN,publicOrigin:PREPROD_ORIGIN};
    handlers={userClient,outbox,
     verify:createVerificationHandler({...shared,enabled:c.omvq,lookup:p=>lookupOmvq(p,{chromium:browser}),claimLookup:async()=>{const r=await serviceClient.rpc('vet_claim_omvq_lookup');if(r.error)throw Error('Throttle unavailable');return r.data===true;}}),
     authorization:createAuthorizationHandler({...shared,captureAuthorization:outbox.captureAuthorization,localTestEnabled:false}),
     certificate:createCertificateHandler({...shared,chromium:browser,sendMail:outbox.sendMail,capturedStatus:'preprod_captured'})};
   }
   let body;if(req.body!==undefined)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);else{body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65000)return send(413,{error:'Demande trop volumineuse.'});}}
   if(Buffer.byteLength(body)>65000)return send(413,{error:'Demande trop volumineuse.'});
   if(action==='outbox-message'){
    if(!req.headers.authorization?.startsWith('Bearer '))return send(401,{error:'Connexion requise.'});
    const client=handlers.userClient(req.headers.authorization);const auth=await client.auth.getUser();if(auth.error||!auth.data.user)return send(401,{error:'Session invalide.'});
    if(action==='outbox-message'){const input=JSON.parse(body);if(!/^[0-9a-f-]{36}$/.test(input.id??''))return send(400,{error:'Message invalide.'});return send(200,await handlers.outbox.read(client,input.id));}

   }
   const adapted=Readable.from([body]);adapted.headers=req.headers;adapted.method='POST';adapted.url='/'+action;
   const handler=action==='verify'?handlers.verify:action.startsWith('certificate-')?handlers.certificate:handlers.authorization;
   await handler(adapted,res);
  }catch{return send(503,{error:'Opération PREPROD indisponible. Aucun résultat positif confirmé.'});}
 };
}
