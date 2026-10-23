import {entryReviewFixture} from './entry-review-fixture.mjs';
// Explicit persistent demo stack only. Additive migration and one new demo show.
import assert from 'node:assert/strict';import{execFileSync}from'node:child_process';import{readFileSync,writeFileSync,existsSync}from'node:fs';import{randomUUID}from'node:crypto';
const dir='.tmp/review-v5',container='supabase_db_hsp-vet-local';
assert(!process.env.DOCKER_HOST||process.env.DOCKER_HOST.startsWith('unix://'));
assert(execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'}).trim().startsWith('unix://'));
assert.equal(JSON.parse(execFileSync('docker',['inspect',container]))[0].Config.Labels['com.supabase.cli.project'],'hsp-vet-local');
const sql=q=>execFileSync('docker',['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',maxBuffer:100*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
assert.equal(sql("select count(*) from auth.users where email not like '%@example.test'"),'0');
const f=JSON.parse(readFileSync('.tmp/hsp-direct/fixture.json'));
assert.equal(sql(`select name from organizations where id='${f.org}'`),'HSP DÉMONSTRATION — sans valeur comptable ou fiscale');
const tables=['billing_documents','billing_pdf_artifacts','billing_charges','billing_charge_taxes','billing_payments','billing_payment_allocations','billing_hsp_recoveries','billing_stripe_attempts','invoices','payments','entries','stall_bookings'];
// Hash each row, including composite keys, so later additive fixtures are allowed
// while a modification or deletion of any existing financial row is detected.
const hashes=()=>Object.fromEntries(tables.map(t=>[t,JSON.parse(sql(`select coalesce(jsonb_agg(md5(to_jsonb(t)::text) order by md5(to_jsonb(t)::text)),'[]') from public.${t} t`))]));
const baseline=dir+'/historical-hashes.json';if(!existsSync(baseline))writeFileSync(baseline,JSON.stringify(hashes(),null,2));
if(process.argv[2]==='verify'){const current=hashes();for(const [table,rows]of Object.entries(JSON.parse(readFileSync(baseline))))for(const hash of rows)assert(current[table].includes(hash),'Historical row changed: '+table);console.log('Historical financial rows and artifact metadata unchanged');process.exit(0);}
assert.equal(JSON.parse(readFileSync('.tmp/hsp-direct/server-results.json')).complete,true);
assert.equal(JSON.parse(readFileSync(dir+'/pagination-results.json')).complete,true);
assert((await fetch('http://127.0.0.1:54332/status')).headers.get('X-HSP-Document-Render')?.split(',').includes('5'),'Restart render 5 worker first');
const backup=dir+'/before-render-v5.dump';if(!existsSync(backup))writeFileSync(backup,execFileSync('docker',['exec',container,'pg_dump','-U','postgres','-Fc','postgres'],{maxBuffer:100*1024*1024}),{flag:'wx',mode:0o600});
const file='20260907000700_billing_document_render_v5.sql',version=file.split('_')[0];
if(sql(`select count(*) from supabase_migrations.schema_migrations where version='${version}'`)==='0'){
 const migration=readFileSync('supabase/migrations/'+file,'utf8').replace(/^(begin|commit);\s*$/gmi,'');sql(`begin;${migration}\ninsert into supabase_migrations.schema_migrations(version,name) values('${version}','billing_document_render_v5');notify pgrst,'reload schema';commit;`);
}
const after=hashes();for(const [t,rows]of Object.entries(JSON.parse(readFileSync(baseline))))for(const hash of rows)assert(after[t].includes(hash));
const path=dir+'/state.json',state=existsSync(path)?JSON.parse(readFileSync(path)):{cases:{},commands:{}};const save=()=>writeFileSync(path,JSON.stringify(state,null,2));
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const auth=tail=>`set role authenticated;set request.jwt.claim.sub='10000000-0000-0000-0000-${String(tail).padStart(12,'0')}';`;
for(const name of ['main']){
 const c=state.cases[name]??={show:randomUUID()};save();
 sql(`insert into shows(id,organization_id,name,slug,start_date,end_date,default_currency) select '${c.show}',organization_id,'DÉMO revue rendu 5 — ${name}','review-render-5-${c.show}',start_date,end_date,default_currency from shows where id='${f.show}' on conflict do nothing;`);
 c.context=sql(`select id from billing_contexts where show_id='${c.show}'`);
 if(!c.context){
  const catalog=JSON.parse(sql(`select jsonb_agg(jsonb_build_object('product_id',p.product_id,'unit_price',p.unit_price,'exemption_reason',p.exemption_reason,'taxes',coalesce((select jsonb_agg(jsonb_build_object('code',t.code,'name',t.name,'jurisdiction',t.jurisdiction,'rate',t.rate,'version',t.rule_version,'valid_from',t.valid_from,'valid_until',t.valid_until)) from billing_product_tax_rules r join billing_tax_rules t on t.id=r.tax_rule_id where r.context_id=p.context_id and r.product_id=p.product_id),'[]'))) from billing_product_tax_profiles p where p.context_id='${f.context}'`));
  const config=JSON.parse(sql(`select config from billing_contexts where id='${f.context}'`));config.name_fr='Concours fictif — revue rendu 5 · '+name;config.name_en='Fictitious show — render 5 review · '+name;
  c.context=sql(auth(1)+`select billing_create_context('${f.org}','${c.show}',null,null,'CAD',${quote(JSON.stringify(config))},now()-interval '1 day',null,${quote(JSON.stringify(catalog))});`);save();
  sql(auth(1)+`select billing_set_capabilities('${f.org}','${c.context}',true,true,true,true,2026);`);
 }
 if(sql(`select count(*) from billing_hsp_policies where context_id='${c.context}'`)==='0'){const policy=JSON.parse(sql(`select to_jsonb(p) from billing_hsp_policies p where context_id='${f.context}'`));sql(`set role service_role;select billing_hsp_adopt('${c.context}','${policy.product_id}',${quote(JSON.stringify(policy.suppliers))},${quote(policy.mandate)});`);}
 if(!c.registration){const old=JSON.parse(readFileSync('.tmp/review-v4/state.json')).cases.main.registration;c.registration={riders:old.riders,assignments:old.assignments,blocks:Array.from({length:3},()=>randomUUID()),classes:Array.from({length:16},()=>randomUUID())};save();}
 entryReviewFixture(sql,f,c,save);save();
}
console.log(JSON.stringify({localOnly:true,migration:version,historicalRowsUnchanged:true,newDemoShows:Object.keys(state.cases),stripeConfigurationChanged:false}));
