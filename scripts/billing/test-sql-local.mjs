import {runCheckoutRaces} from './checkout-concurrency.mjs';
import {execFileSync, spawn} from 'node:child_process';
import {readFileSync, readdirSync, mkdirSync, writeFileSync, mkdtempSync, rmSync, existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
const project=`hsp-billing-rebuild-${process.pid}-${randomUUID().slice(0,8)}`;
let workdir;
const cli='./node_modules/.bin/supabase';
async function freePort(){const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));return port;}

// Deliberately fixed local container; no URL, DATABASE_URL or remote project credentials accepted.
const fresh=process.argv.includes('--fresh');
mkdirSync('.tmp/billing-tests',{recursive:true});
const resultPath=fresh?'.tmp/billing-tests/rebuild-results.json':'.tmp/billing-tests/results.json';
writeFileSync(resultPath,JSON.stringify({localOnly:true,mode:fresh?'fresh':'clone',complete:false,failure:{stage:'preflight',message:'Validation has not completed'}}));
assert(process.argv.slice(2).every(a=>a==='--fresh'),'Only --fresh is accepted; remote connection arguments are forbidden');
const container=fresh?`supabase_db_${project}`:'supabase_db_hsp-vet-local';
if(process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) throw Error('Local Docker socket required');
const host=execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'}).trim();
assert(host.startsWith('unix://'),'Remote Docker refused');
const db=fresh?'postgres':`billing_folio_test_${process.pid}`;
const docker=(args,options={})=>execFileSync('docker',['exec','-i',container,...args],{maxBuffer:256*1024*1024,...options});
const sql=(s)=>docker(['psql','-X','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1','-Atq'],{input:s,encoding:'utf8'}).trim();
const report=[]; let created=false; let complete=false; let stage='bootstrap'; let failure=null; let sqlCounts=null; const replayed=[];
function check(name,fn){fn();report.push(name);console.log('PASS',name);}
const migration='supabase/migrations/20260906000900_billing_folio_foundation.sql';
try {
 if(fresh){
  workdir=mkdtempSync('/tmp/hsp-billing-rebuild-');
  execFileSync(cli,['init','--workdir',workdir],{stdio:['ignore','pipe','pipe']});
  let config=readFileSync(workdir+'/supabase/config.toml','utf8');
  config=config.replace(/^project_id = .*$/m,`project_id = "${project}"`)
   .replace(/(\[db\][\s\S]*?\nport = )\d+/,`$1${await freePort()}`)
   .replace(/^shadow_port = \d+/m,`shadow_port = ${await freePort()}`);
  writeFileSync(workdir+'/supabase/config.toml',config);
  // The temporary CLI workdir has NO repository migrations or seeds. db start supplies only official system schemas.
  assert(!existsSync(workdir+'/supabase/.temp/project-ref'),'Remote project reference forbidden');
  assert.equal(execFileSync('docker',['ps','-aq','--filter',`name=^/${container}$`],{encoding:'utf8'}).trim(),'','Disposable container name must be unused');
  assert(!execFileSync('docker',['volume','ls','--format','{{.Name}}'],{encoding:'utf8'}).split('\n').some(n=>n.endsWith('_'+project)),'Disposable volumes must be new');
  created=true;
  execFileSync(cli,['db','start','--workdir',workdir],{stdio:['ignore','pipe','pipe'],timeout:120000});
  assert.equal(sql("select (to_regclass('public.user_profiles') is null and to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null)::text;"),'true','Fresh official bootstrap must have auth/storage, no application tables');
  for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')).sort()){
   stage='migration:'+file;
   sql('begin; set local client_min_messages=error;\n'+readFileSync('supabase/migrations/'+file,'utf8')+'\ncommit;');
   replayed.push(file);
  }
  stage='seed';sql(readFileSync('supabase/seed.sql','utf8'));
  report.push('all repository migrations and required seed from empty application schema');
 }else{
  docker(['createdb','-U','postgres',db]);created=true;
  const dump=docker(['pg_dump','-U','postgres','--format=plain','postgres']);sql(dump);
 }
 const historySQL=['invoices','invoice_line_items','payments','manual_sales','entries','stall_bookings','contact_organization_memberships'].map(t=>`select '${t}:'||md5(coalesce(string_agg(row_to_json(t)::text,'' order by id),'')) from public.${t} t;`).join('\n');
 const historic=sql(historySQL);
 stage='foundation migration';if(!fresh){sql(readFileSync(migration,'utf8'));sql(readFileSync('supabase/migrations/20260906001000_billing_checkout_server.sql','utf8'));}
 check('migration preserves every historical financial/source row',()=>assert.equal(sql(historySQL),historic));
 stage='legacy regressions';
 for(const file of ['stall_booking_invoice.sql','incentive_nomination_programs.sql']){
  const script=readFileSync('supabase/tests/'+file,'utf8').replace('\\ir ../seed.sql',()=>readFileSync('supabase/seed.sql','utf8'));
  check('existing legacy regression: '+file,()=>sql(script));
 }
 stage='acceptance';
 sql(readFileSync('supabase/tests/billing_checkout_compat.sql','utf8'));
 sql(readFileSync('supabase/tests/billing_folio_foundation.sql','utf8'));
 sql(readFileSync('supabase/tests/billing_folio_review.sql','utf8'));
 sqlCounts=JSON.parse(sql("select jsonb_object_agg(kind,total) from public.billing_test_counts;"));
 console.log('SQL COUNTS',JSON.stringify(sqlCounts));
 report.push('SQL acceptance assertions');console.log('PASS SQL acceptance assertions');
 stage='concurrency';
 // Fixture retains one fresh context/customer for independent-session race tests.
 const ids=JSON.parse(sql('select value::text from billing_test_fixture where key=\'race\';'));
 const auth=(actor)=>`set role authenticated; set request.jwt.claim.sub='${actor}';`;
 const command=(source)=>JSON.stringify({context_id:ids.context,payer_customer_account_id:ids.customer,product_id:ids.product,quantity:1,source_id:source});
 async function session(statement){return await new Promise((resolve,reject)=>{
  const p=spawn('docker',['exec','-i',container,'psql','-X','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1','-Atq']);let out='',err='';
  p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('close',code=>resolve({code,out,err}));p.stdin.end(statement);
 });}
 // A holds the actual context advisory lock; B must wait until A commits its first sale.
 let first=session(`begin; ${auth(ids.admin)} select public.billing_lock_scope('${ids.org}',null);`); // helper is deliberately denied; assert below.
 assert.notEqual((await first).code,0,'Private helper unexpectedly callable');
 // Open the controlling session as the local test owner, then assume each user's actual role for the mutations.
 const hold=spawn('docker',['exec','-i',container,'psql','-X','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1','-Atq']);
 let output='',errors='';
 const ready=new Promise((resolve,reject)=>{hold.stdout.on('data',b=>{output+=b;if(output.includes('LOCKED'))resolve();});hold.on('error',reject);});
 hold.stderr.on('data',b=>errors+=b);
 const done=new Promise(resolve=>hold.on('close',code=>resolve(code)));
 hold.stdin.write(`begin; set statement_timeout='15s'; select public.billing6_lock('${ids.org}'); select public.billing_lock_scope('${ids.org}',null); select 'LOCKED';\n`);
 await ready;
 const b=session(`begin; set application_name='billing-secretary-b'; set statement_timeout='15s'; ${auth(ids.secretary)} select public.add_billing_sale('f1000000-0000-0000-0000-000000000002','${command('f2000000-0000-0000-0000-000000000002')}'::jsonb); commit;`);
 // Wait until B is actually blocked on A's advisory lock before releasing A.
 let blocked=false;
 for(let i=0;i<100;i++){
  if(sql("select count(*) from pg_stat_activity where datname=current_database() and application_name='billing-secretary-b' and wait_event='advisory';")==='1'){blocked=true;break;}
  await new Promise(r=>setTimeout(r,25));
 }
 if(!blocked){hold.stdin.end('rollback;');await done;await b;throw Error('Concurrency barrier was not observed');}
 hold.stdin.end(`${auth(ids.admin)} select public.add_billing_sale('f1000000-0000-0000-0000-000000000001','${command('f2000000-0000-0000-0000-000000000001')}'::jsonb); commit;\n`);
 assert.equal(await done,0,errors);const br=await b;assert.equal(br.code,0,br.err);
 check('two secretaries / simultaneous first operation: one account, two charges',()=>assert.equal(sql(`select count(distinct f.id)||','||count(ch.id) from billing_folios f join billing_charges ch on ch.folio_id=f.id where f.billing_context_id='${ids.context}';`),'1,2'));
 const retries=await Promise.all([1,2].map(()=>session(`${auth(ids.admin)} select public.add_billing_sale('f1000000-0000-0000-0000-000000000001','${command('f2000000-0000-0000-0000-000000000001')}'::jsonb);`)));
 check('simultaneous identical retries return exactly one durable result',()=>{assert(retries.every(x=>x.code===0),JSON.stringify(retries));assert.equal(retries[0].out,retries[1].out);assert.equal(sql(`select count(*) from billing_charges ch join billing_folios f on f.id=ch.folio_id where f.billing_context_id='${ids.context}';`),'2');});
 const folio=JSON.parse(sql(`select jsonb_build_object('id',f.id,'version',f.version,'charge',(select id from billing_charges where folio_id=f.id order by id limit 1)) from billing_folios f where billing_context_id='${ids.context}';`));
 const payment={folio_id:folio.id,version:folio.version,amount:100,method:'cash',received_at:new Date().toISOString(),confirmed:true,allocations:[{charge_id:folio.charge,amount:100}]};
 const payRace=await Promise.all([ids.admin,ids.secretary].map((actor,i)=>session(`${auth(actor)} select public.record_billing_payment('f3000000-0000-0000-0000-00000000000${i+1}','${JSON.stringify(payment)}'::jsonb);`)));
 check('concurrent payments: stale recap rejected, no over-allocation or duplicate receipt',()=>{
  assert.equal(payRace.filter(r=>r.code===0).length,1,JSON.stringify(payRace));
  assert(payRace.find(r=>r.code!==0).err.includes('BILLING_STALE_VERSION'));
  assert.equal(sql(`select count(*)||','||sum(amount) from billing_payments where folio_id='${folio.id}';`),'1,100.00');
 });
 const paidVersion=sql(`select version from billing_folios where id='${folio.id}';`);
 const recap=JSON.parse(sql(`${auth(ids.admin)} select public.get_billing_statement(gen_random_uuid(),'${folio.id}')::text;`));
 const closeRace=await Promise.all([ids.admin,ids.secretary].map((actor,i)=>session(`${auth(actor)} select public.finalize_billing_folio('f4000000-0000-0000-0000-00000000000${i+1}','${folio.id}',${paidVersion},'${recap.document_id}');`)));
 check('concurrent finalizations: one immutable final invoice',()=>{
  assert.equal(closeRace.filter(r=>r.code===0).length,1,JSON.stringify(closeRace));
  assert(closeRace.find(r=>r.code!==0).err.includes('BILLING_STALE_VERSION'));
  assert.equal(sql(`select count(*) from billing_final_invoices where folio_id='${folio.id}';`),'1');
 });
 const job=sql("select value->>'invoice' from billing_test_fixture where key='documents';");
 const claims=await Promise.all(['worker-a','worker-b'].map(worker=>session(`set role service_role; select public.billing_claim_document('${worker}','${job}',30);`)));
 check('outbox concurrent claims: one lease and one attempt',()=>{
  assert(claims.every(r=>r.code===0),JSON.stringify(claims));
  assert.equal(claims.filter(r=>r.out.trim()).length,1);
  assert.equal(sql(`select attempts from billing_outbox where document_id='${job}';`),'1');
 });
 check('historical financial/source rows still unchanged after acceptance/races',()=>assert.equal(sql(historySQL),historic));
 stage='checkout acceptance';
 sql(readFileSync('supabase/tests/billing_checkout_server.sql','utf8'));
 sqlCounts=JSON.parse(sql("select jsonb_object_agg(kind,total) from public.billing_test_counts;"));
 console.log('FINAL SQL COUNTS',JSON.stringify(sqlCounts));
 report.push('SQL checkout acceptance assertions');
 stage='checkout concurrency';await runCheckoutRaces({sql,session,check,container,db});
 check('history unchanged after checkout tests',()=>assert.equal(sql(historySQL),historic));
 complete=true;
} catch(error){
 failure={stage,message:String(error.stderr||error.message)};
 if(stage.startsWith('migration:')){
  const file=stage.slice('migration:'.length);const path='supabase/migrations/'+file;
  try{
   const baseline=execFileSync('git',['show','b43a4b1:'+path],{encoding:'utf8'});
   failure.unchangedFromReviewedCommit=baseline===readFileSync(path,'utf8');
   failure.beforeFoundation=!replayed.includes(migration.split('/').at(-1));
  }catch{}
 }
 console.error('FAILED',stage,failure.message);process.exitCode=1;
} finally {
 try {
 if(created){
  if(fresh){execFileSync(cli,['stop','--project-id',project,'--no-backup','--workdir',workdir],{stdio:['ignore','pipe','pipe']});}
  else docker(['dropdb','-U','postgres','--if-exists',db]);
 }
 if(workdir)rmSync(workdir,{recursive:true,force:true});
 } catch(error) {complete=false; failure={stage:'cleanup',message:error.message};process.exitCode=1;}
 writeFileSync(resultPath,JSON.stringify({localOnly:true,mode:fresh?'fresh':'clone',complete,replayed,sqlCounts,passed:report,failure},null,2));
}
