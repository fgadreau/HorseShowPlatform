import {hostedHandler,machine,rawBody,json,withLane,UUID} from './hosted-core.mjs';
import {rpc} from './stripe.mjs';
import {createDocumentWorker,downloadDocument} from './document-worker.mjs';
import {renderDocument,renderVersions} from './pdf.mjs';
import {serverlessBrowser} from '../vet/serverless-browser.mjs';
// Always await termination, including on timeout: never release the global lane
// while Chromium is still rendering. The outer invocation is capped at 240 s.
export async function boundedRender(document,locale,{browser=serverlessBrowser,timeoutMs=200000,render=renderDocument}={}){
 const instance=await browser.launch({timeout:15000});
 const timer=setTimeout(()=>void instance.close().catch(()=>{}),timeoutMs);
 try{return await render(document,locale,{browser:instance});}
 finally{clearTimeout(timer);await instance.close();}
}
export function createHostedDocuments(options={}){
 const render=options.render??boundedRender;
 return hostedHandler(async({req,res,config,service,user,scope,deadline})=>{
  const url=new URL(req.url,'https://invalid.local');
  const action=url.pathname==='/api/billing-documents'?url.searchParams.get('action'):url.pathname.split('/').pop();
  if(!['status','retry','download','run-pdf'].includes(action))throw Error('BILLING_INVALID_REQUEST');
  if(action==='run-pdf'){
   machine(req,config);await rawBody(req);
   const result=await withLane(service,'pdf',async token=>{
    const job=await rpc(service,'billing_hosted_next',{p_context:config.context,p_lane:'pdf',p_token:token});if(!job)return {state:'idle'};
    const started=Date.now();
    const worker=createDocumentWorker({service,render:async(d,l)=>{deadline.throwIfAborted();return render(d,l,{timeoutMs:Math.max(1,200000-(Date.now()-started))});}});
    return worker.run(job.document_id);
   });return json(res,200,result);
  }
  const client=await user(),body=JSON.parse((await rawBody(req)).toString());
  if(!UUID.test(body.documentId??'')||typeof body.personal!=='boolean')throw Error('BILLING_INVALID_REQUEST');
  await scope({p_document:body.documentId});
  const status=()=>rpc(client,'billing_pdf_status',{p_document:body.documentId,p_personal:body.personal});
  await status();res.setHeader('X-HSP-Document-Render',renderVersions.join(','));
  if(action==='download'){
   const bytes=await downloadDocument({user:client,service,documentId:body.documentId,locale:body.locale,personal:body.personal});
   if(bytes.length>4*1024*1024)throw Error('BILLING_PDF_TOO_LARGE');
   res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="HSP-${body.documentId}-${body.locale}.pdf"`);res.end(bytes);return;
  }
  // The durable queue already schedules retry_at; a viewer cannot bypass backoff
  // or start another Chromium process. Supabase Cron performs the next attempt.
  json(res,200,await status());
 },options);
}
