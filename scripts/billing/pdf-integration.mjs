// Real PostgreSQL sessions and Chromium, private filesystem adapter (NOT Storage HTTP qualification).
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {createDocumentWorker,downloadDocument} from '../../server/billing/document-worker.mjs';
import {renderDocument} from '../../server/billing/pdf.mjs';
const quote=x=>x===null?'null':typeof x==='boolean'?String(x):typeof x==='number'?String(x):"'"+(typeof x==='object'?JSON.stringify(x):String(x)).replaceAll("'","''")+"'";
export async function pdfIntegration({sql,session,check}){
 const x=JSON.parse(sql("select value from public.billing_test_fixture where key='pdf'")),doc=x.statement;
 const rpcFor=prefix=>async(name,args)=>{assert(/^billing_[a-z_]+$/.test(name));for(const k of Object.keys(args))assert(/^p_[a-z_]+$/.test(k));const result=await session(`${prefix} select public.${name}(${Object.entries(args).map(([k,v])=>k+'=>'+quote(v)).join(',')})::text;`);return result.code?{error:{message:result.err}}:{data:result.out.trim()?JSON.parse(result.out.trim()):null};};
 const dir='.tmp/billing-pdf/sql-worker';mkdirSync(dir,{recursive:true,mode:0o700});
 const service={rpc:rpcFor('set role service_role;'),storage:{from(bucket){assert.equal(bucket,'billing-pdfs');return {async upload(path,bytes,options){assert.equal(options.upsert,false);assert(/^[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+\/(fr|en)\.pdf$/.test(path));const file=dir+'/'+path;mkdirSync(dirname(file),{recursive:true,mode:0o700});writeFileSync(file,bytes,{flag:'wx',mode:0o600});return {error:null};},async download(path){return {data:new Blob([readFileSync(dir+'/'+path)])};}};}}};
 const original=service.rpc;service.rpc=(name,args)=>original(name,name==='billing_finish_document'?{...args,p_retry_seconds:0}:args);
 let fail=true;const render=async(d,l)=>{if(fail&&l==='en'){fail=false;throw Error('deliberate render failure');}return renderDocument(d,l);};
 const a=createDocumentWorker({service,render,workerId:'real-pdf-a'}),b=createDocumentWorker({service,render,workerId:'real-pdf-b'});
 const count=sql(`select count(*) from public.billing_documents where folio_id='${x.folio}'`);
 const first=await a.run(doc);check('PDF real SQL / renderer: failed render retains financial document',()=>{assert.equal(first.state,'failed');assert.equal(sql(`select state from public.billing_outbox where document_id='${doc}'`),'failed');});
 const results=await Promise.all([a.run(doc),b.run(doc)]);
 check('PDF two real PostgreSQL worker sessions: one completed bilingual publication',()=>{assert.equal(results.filter(r=>r.state==='completed').length,1,JSON.stringify(results));assert.equal(sql(`select count(*) from public.billing_pdf_artifacts where document_id='${doc}'`),'2');});
 check('PDF failure and retry never create another financial piece',()=>assert.equal(sql(`select count(*) from public.billing_documents where folio_id='${x.folio}'`),count));
 const user={rpc:rpcFor("set role authenticated; set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';")};
 const bytes=await downloadDocument({user,service,documentId:doc,locale:'fr'});writeFileSync('.tmp/billing-pdf/sql-statement-fr.pdf',bytes);
 check('PDF actual payer downloads hash-verified bytes through private filesystem adapter',()=>assert(bytes.subarray(0,4).equals(Buffer.from('%PDF'))));
 const denied={rpc:rpcFor("set role authenticated; set request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';")};
 await assert.rejects(downloadDocument({user:denied,service,documentId:doc,locale:'fr'}),/BILLING_FORBIDDEN/);check('PDF actual non-payer denied before storage read',()=>{});
}
