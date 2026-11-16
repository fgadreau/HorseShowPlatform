import test from 'node:test';import assert from 'node:assert/strict';
import {parseHouseCsv,houseNameKey} from '../src/lib/houseIneligibilityCsv.ts';
import {createHouseNrhaHandler} from '../supabase/functions/house-class-nrha/handler.mjs';
test('house lists accept full names, accents and French semicolon CSV, without dropping unmatched riders',()=>{
 assert.deepEqual(parseHouseCsv('nom_complet\nÉmilie Test\nEmilie Test\n#N/A\nFuture Rider'),['Émilie Test','Future Rider']);
 assert.deepEqual(parseHouseCsv('prenom;nom\nAlex;"Test, Junior"'),['Alex Test, Junior']);
 assert.equal(houseNameKey('Émilie Test'),houseNameKey('Emilie-Test'));
 assert.throws(()=>parseHouseCsv('email\nfoo@example.test'));
});
const id='11111111-1111-4111-8111-111111111111';
function fixture({authorized=true,payload={eligible:true,reasons:[]}}={}){
 let saved=null,calls=0;const params={classCode:'1000',memberNumber:'123',competitionLicenseNumber:'456',date:'2026-10-01',fingerprint:'trusted'};
 const chain={select(){return this;},eq(){return this;},gt(){return this;},order(){return this;},limit(){return this;},async maybeSingle(){return {data:null,error:null};},async insert(row){saved=row;return {error:null};}};
 const client={auth:{async getUser(){return {data:{user:{id}},error:null};}},async rpc(){return authorized?{data:params,error:null}:{data:null,error:{message:'forbidden'}};},from(){return chain;}};
 const handler=createHouseNrhaHandler({createClient:()=>client,env:key=>key==='NRHA_API_BASE_URL'?'https://nrha.example.test':'configured',fetcher:async()=>{calls++;return new Response(JSON.stringify(payload));}});
 const request=()=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({classId:id,horseId:id,riderContactId:id,eligible:true})});
 return {handler,request,saved:()=>saved,calls:()=>calls};
}
test('NRHA reference is authorized server side and only trusted response becomes evidence',async()=>{
 const f=fixture({payload:{eligible:false,reasons:[{message:'Not eligible'}]}});const r=await f.handler(f.request());assert.equal(r.status,200);assert.equal(f.saved().eligible,false);assert.equal(f.saved().fingerprint,'trusted');assert.deepEqual(f.saved().reasons,['Not eligible']);
});
test('unauthorized teams and invalid source responses cannot create eligibility evidence',async()=>{
 const f=fixture({authorized:false});assert.equal((await f.handler(f.request())).status,403);assert.equal(f.calls(),0);assert.equal(f.saved(),null);
 const bad=fixture({payload:{}});assert.equal((await bad.handler(bad.request())).status,502);assert.equal(bad.saved(),null);
 assert.equal((await bad.handler(new Request('https://example.test',{method:'POST'}))).status,401);
});
