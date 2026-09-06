import {createHash,randomUUID} from 'node:crypto';
import {renderDocument} from './pdf.mjs';
export async function documentRpc(client,name,args){const {data,error}=await client.rpc(name,args);if(error)throw Error(error.message);return data;}
const hash=b=>createHash('sha256').update(b).digest('hex');
export function createDocumentWorker({service,render=renderDocument,workerId=randomUUID()}){
 return {async run(document=null){
  const job=await documentRpc(service,'billing_claim_document',{p_worker:workerId,p_document:document,p_lease_seconds:300});if(!job)return {state:'not_claimed'};
  const args={p_document:job.document_id,p_token:job.claim_token};
  try{
   const d=await documentRpc(service,'billing_pdf_source',args),artifacts=[];
   for(const locale of ['fr','en']){const bytes=Buffer.from(await render(d,locale));const path=`${d.organization_id}/${d.id}/${job.claim_token}/${locale}.pdf`;const {error}=await service.storage.from('billing-pdfs').upload(path,bytes,{contentType:'application/pdf',upsert:false,cacheControl:'0'});if(error)throw Error('BILLING_PDF_STORAGE_FAILED');artifacts.push({locale,path,sha256:hash(bytes),bytes:bytes.length});}
   return await documentRpc(service,'billing_pdf_complete',{...args,p_artifacts:artifacts});
  }catch{try{await documentRpc(service,'billing_finish_document',{...args,p_success:false,p_error:'BILLING_PDF_RENDER_FAILED',p_retry_seconds:60});}catch{/* A lost successful completion or expired lease must never be overwritten. */}return {state:'failed'};}
 }};
}
export async function downloadDocument({user,service,documentId,locale,personal=true}){
 if(!['fr','en'].includes(locale))throw Error('BILLING_PDF_INVALID');
 const check=async()=>{const s=await documentRpc(user,'billing_pdf_status',{p_document:documentId,p_personal:personal});if(s.state!=='completed')throw Error('BILLING_PDF_NOT_READY');};
 await check();const a=await documentRpc(service,'billing_pdf_file',{p_document:documentId,p_locale:locale});if(!a)throw Error('BILLING_PDF_NOT_READY');
 const {data,error}=await service.storage.from('billing-pdfs').download(a.path);if(error||!data)throw Error('BILLING_PDF_STORAGE_FAILED');const bytes=Buffer.from(await data.arrayBuffer());
 if(bytes.length!==a.bytes||hash(bytes)!==a.sha256)throw Error('BILLING_PDF_INTEGRITY');await check();return bytes;
}
