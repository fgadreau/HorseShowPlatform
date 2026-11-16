import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';

// Disposable database in the local development container. No remote credentials.
assert.equal(process.argv.length,2);
const host=execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'}).trim();
assert(host==='unix:///var/run/docker.sock'||/^npipe:\/\/\/\/\.\/pipe\/(dockerDesktopLinuxEngine|docker_engine)$/.test(host));
assert(!process.env.DOCKER_HOST||process.env.DOCKER_HOST===host);
const container='supabase_db_HorseShowPlatform',db=`credit_refund_test_${randomUUID().replaceAll('-','')}`;
const run=(args,input)=>execFileSync('docker',['exec','-i',container,...args],{input,encoding:'utf8',maxBuffer:128*1024*1024,stdio:['pipe','pipe','pipe']});
const sql=(source,database=db)=>run(['psql','-X','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1','-Atq'],source);
const report={localOnly:true,passed:false,migrations:[]};let created=false;
try {
 const version=sql('select max(version) from supabase_migrations.schema_migrations;','postgres').trim();
 assert(/^\d{14}$/.test(version));
 run(['createdb','-U','postgres',db]);created=true;
 const dump=run(['pg_dump','-U','postgres','--clean','--if-exists','postgres']);sql(dump);
 for(const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f.split('_')[0]>version).sort()){
  console.log('Applying in disposable clone:',file);
  sql('begin;\n'+readFileSync('supabase/migrations/'+file,'utf8')+'\ncommit;');report.migrations.push(file);
 }
 sql(readFileSync('supabase/tests/account_credits_refunds.sql','utf8'));
 console.log('PASS: credits, cumulative tax rounding, permissions, partial refunds, idempotency, finance reports and immutable history');
 report.passed=true;
}catch(e){report.error=String(e.stderr||e.message).slice(-4000);console.error(report.error);process.exitCode=1;}
finally{
 mkdirSync('.tmp/credits-refunds',{recursive:true});writeFileSync('.tmp/credits-refunds/sql-results.json',JSON.stringify(report,null,2));
 if(created){assert(/^credit_refund_test_[a-f0-9]{32}$/.test(db));run(['dropdb','-U','postgres',db]);}
}
