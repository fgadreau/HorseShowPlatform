// Probe only known non-secret canaries. Never request credentials to test denial.
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
const path='.tmp/billing-pilot/http-probe.txt';mkdirSync('.tmp/billing-pilot',{recursive:true});writeFileSync(path,'NONSECRET-PILOT-PROBE');
const paths=['/'+path,'/.%74mp/billing-pilot/http-probe.txt','/@fs'+resolve(path),'/'+path+'?raw'];
for(const p of paths){const r=await fetch('http://127.0.0.1:5173'+p);assert.equal(r.status,403,p);assert(!(await r.text()).includes('NONSECRET-PILOT-PROBE'));}
assert.equal((await fetch('http://127.0.0.1:5173/me/accounts')).status,200);
const result={complete:true,deniedCanaryRequests:paths.length,applicationAvailable:true};writeFileSync('.tmp/billing-pilot/http-safety-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
