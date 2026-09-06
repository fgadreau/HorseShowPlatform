import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assertLocalUrl } from '../../server/vet/local-server.mjs';
const workdir=process.env.VET_LOCAL_WORKDIR;
if(!workdir)throw new Error('VET_LOCAL_WORKDIR required');
if(process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://'))throw new Error('Local Docker socket required');
const dockerHost=execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'}).trim();
if(!dockerHost.startsWith('unix://'))throw new Error('Remote Docker context refused');
const local=JSON.parse(execFileSync('./node_modules/.bin/supabase',['status','--workdir',workdir,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assertLocalUrl(local.API_URL);
const project=readFileSync(resolve(workdir,'supabase/config.toml'),'utf8').match(/^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m)?.[1];
if(!project)throw new Error('Invalid local project id');
const container='supabase_db_'+project;
execFileSync('docker',['exec',container,'mkdir','-p','/tmp/hsp-vet-validation']);
execFileSync('docker',['cp','supabase/.',container+':/tmp/hsp-vet-validation/']);
const {readdirSync}=await import('node:fs');
const results=[];
for(const file of readdirSync('supabase/tests').filter(f=>f.endsWith('.sql')&&!/fixture|assertions|flow_seed/.test(f)).sort()){
 const r=spawnSync('docker',['exec',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-f','/tmp/hsp-vet-validation/tests/'+file],{encoding:'utf8'});
 results.push({file,exit:r.status,stdout:r.stdout,stderr:r.stderr});console.log(`${r.status===0?'PASS':'FAIL'} ${file}`);
}
mkdirSync('.tmp/vet-tests',{recursive:true});writeFileSync('.tmp/vet-tests/sql-results.json',JSON.stringify(results,null,2));
console.log(`${results.filter(r=>r.exit===0).length}/${results.length} SQL files passed. Full output: .tmp/vet-tests/sql-results.json`);
process.exitCode=results.some(r=>r.exit!==0)?1:0;
