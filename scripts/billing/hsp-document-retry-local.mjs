// Real private Storage + PostgreSQL; render failure and zero retry delay explicitly injected.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {createDocumentWorker,downloadDocument} from '../../server/billing/document-worker.mjs';
import {renderDocument} from '../../server/billing/pdf.mjs';
assert.equal(process.env.BILLING_SUPABASE_URL,'http://127.0.0.1:54321');
const access=JSON.parse(readFileSync('.tmp/hsp-direct/access.local.json')),all=JSON.parse(readFileSync('.tmp/hsp-direct/cases.json')),c=all.cases.documents;
const opts={auth:{persistSession:false,autoRefreshToken:false}},service=createClient(process.env.BILLING_SUPABASE_URL,process.env.BILLING_SUPABASE_SERVICE_ROLE_KEY,opts);
async function login(t){const client=createClient(process.env.BILLING_SUPABASE_URL,process.env.BILLING_SUPABASE_ANON_KEY,opts);const r=await client.auth.signInWithPassword({email:access.users.find(x=>x.id.endsWith(t)).email,password:access.password});assert(!r.error);return client;}
const staff=await login('003'),payer=await login('004');
const rpc=async(client,n,a)=>{const r=await client.rpc(n,a);if(r.error)throw Error(r.error.message);return r.data;};
const pid=JSON.parse(readFileSync('.tmp/hsp-direct/runtime-processes.json')).documents;assert(execFileSync('ps',['-p',String(pid),'-o','args='],{encoding:'utf8'}).includes('server/billing/document-server.mjs'));
const sql=q=>execFileSync('docker',['exec','-i','supabase_db_hsp-vet-local','psql','-X','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();assert(!process.env.DOCKER_HOST||process.env.DOCKER_HOST.startsWith('unix://'));assert(execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'}).trim().startsWith('unix://'));assert.equal(sql("select count(*) from public.billing_outbox where state='processing'"),'0','wait for existing jobs before pausing owned server');
process.kill(pid,'SIGSTOP');const result={complete:false,realStorageHTTP:true,injected:['English renderer failure','retry delay zero'],passed:[]};
try{
 c.statementCommand??={p_request_id:randomUUID(),p_folio:c.folio};writeFileSync('.tmp/hsp-direct/cases.json',JSON.stringify(all,null,2),{mode:0o600});const doc=await rpc(staff,'get_billing_statement',c.statementCommand);const id=doc.document_id;
 const before=await rpc(payer,'billing_ui_detail',{p_folio:c.folio,p_personal:true});
 const originalRpc=service.rpc.bind(service);service.rpc=(n,a)=>originalRpc(n,n==='billing_finish_document'?{...a,p_retry_seconds:0}:a);
 const broken=createDocumentWorker({service,workerId:randomUUID(),render:(d,l)=>{if(l==='en')throw Error('injected English render failure');return renderDocument(d,l);}});
 assert.equal((await broken.run(id)).state,'failed');assert.equal((await rpc(payer,'billing_pdf_status',{p_document:id,p_personal:true})).state,'failed');result.passed.push('FR upload real then injected EN failure: existing financial statement retained');
 const a=createDocumentWorker({service}),b=createDocumentWorker({service});const retries=await Promise.all([a.run(id),b.run(id)]);assert.equal(retries.filter(r=>r.state==='completed').length,1);assert.equal(retries.filter(r=>r.state==='not_claimed').length,1);result.passed.push('two concurrent real workers: one bilingual private publication');
 const after=await rpc(payer,'billing_ui_detail',{p_folio:c.folio,p_personal:true});assert.deepEqual(after.documents,before.documents);assert.equal(sql(`select count(*) from public.billing_pdf_artifacts where document_id='${id}'`),'2');result.passed.push('same document / number / snapshots; exactly two published locale artifacts');
 const bytes=await downloadDocument({user:payer,service,documentId:id,locale:'fr'});const updated=await service.from('contacts').update({last_name:'Fiche fictive modifiée après émission'}).eq('id',c.contact);assert(!updated.error);
 const changed=await rpc(payer,'billing_ui_detail',{p_folio:c.folio,p_personal:true});assert.deepEqual(changed.documents,before.documents);const again=await downloadDocument({user:payer,service,documentId:id,locale:'fr'});assert(bytes.equals(again));result.passed.push('later fixture contact rename does not alter snapshot or downloaded PDF bytes');
 result.document=id;result.sha256=createHash('sha256').update(bytes).digest('hex');result.complete=true;console.log(JSON.stringify(result));
}finally{process.kill(pid,'SIGCONT');writeFileSync('.tmp/hsp-direct/document-retry-result.json',JSON.stringify(result,null,2));}
