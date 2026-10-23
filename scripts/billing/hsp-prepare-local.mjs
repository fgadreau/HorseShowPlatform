// Additive preparation of the explicitly identified persistent LOCAL fixture stack. Never reset.
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const container='supabase_db_hsp-vet-local',dir='.tmp/hsp-direct';
assert.equal(process.argv.length,2,'No connection arguments accepted');
assert(!process.env.DOCKER_HOST||process.env.DOCKER_HOST.startsWith('unix://'),'Remote Docker forbidden');
assert(execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'}).trim().startsWith('unix://'));
const info=JSON.parse(execFileSync('docker',['inspect',container]))[0];assert.equal(info.Config.Labels['com.supabase.cli.project'],'hsp-vet-local');
const sql=s=>execFileSync('docker',['exec','-i',container,'psql','-X','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',maxBuffer:50*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
assert.equal(sql("select count(*) from auth.users where email not like '%@example.test'"),'0');
assert.equal(sql("select count(*) from public.organizations where id in ('30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002') and name in ('Phase 1 Association A','Phase 1 Association B')"),'2');
const tables=['invoices','payments','contacts','horses','entries','stall_bookings','billing_folios','billing_charges','billing_payments','billing_documents'];
const fingerprint=()=>sql(tables.map(t=>`select '${t}:'||md5(coalesce(string_agg((to_jsonb(t)-case when '${t}'='contacts' then 'company_name' else '__no_field__' end)::text,'' order by id),'')) from public.${t} t;`).join('\n'));
mkdirSync(dir,{recursive:true});const backup=dir+'/before-billing-migrations.dump';
if(!existsSync(backup))writeFileSync(backup,execFileSync('docker',['exec',container,'pg_dump','-U','postgres','-Fc','postgres'],{maxBuffer:100*1024*1024}),{flag:'wx',mode:0o600});
assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='20260906001300'"),'1','Approved PDF foundation required');
const before=fingerprint(),applied=[];
for(const name of ['20260907000100_billing_hsp_prototype.sql','20260907000200_billing_hsp_direct.sql','20260907000300_billing_hsp_reporting.sql']){
 const version=name.split('_')[0];if(sql(`select count(*) from supabase_migrations.schema_migrations where version='${version}'`)==='1')continue;
 const migration=readFileSync('supabase/migrations/'+name,'utf8').replace(/^(begin|commit);\s*$/gmi,'');
 sql(`begin;\n${migration}\ninsert into supabase_migrations.schema_migrations(version,name) values('${version}','${name.slice(15,-4)}'); notify pgrst,'reload schema'; commit;`);applied.push(version);
}
assert.equal(fingerprint(),before,'Existing source/financial rows changed');
writeFileSync(dir+'/migration-result.json',JSON.stringify({localOnly:true,container,backup,applied,existingRowsUnchanged:true,complete:true},null,2));
console.log(JSON.stringify({localOnly:true,applied,existingRowsUnchanged:true}));
