import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCards, normalizeName, lookupOmvq } from '../../server/vet/omvq.mjs';
import { assertLocalUrl, createVerificationHandler } from '../../server/vet/local-server.mjs';
import http from 'node:http';
const expected = { name: 'Amélie Croteau', permit_number: '4887' };
const card = { name: 'Dre Amélie Croteau m.v.', permit: 'Régulier Numéro 4887', status: 'Actif' };
test('4887 and 3486 normalize honorifics and accents', () => {
 assert.equal(normalizeName(card.name),'amelie croteau');
 assert.equal(normalizeName('Dr David Quirion m.v.'),'david quirion');
 assert.equal(normalizeName('Dre Ame\u0301lie  Croteau m.v.'),'amelie croteau');
 assert.equal(assessCards([card],expected,1).result,'verified');
 assert.equal(assessCards([{ name: 'Dr David Quirion m.v.', permit:'Régulier Numéro 3486',status:'Actif'}],{name:'David Quirion',permit_number:'3486'},1).result,'verified');
});
test('mismatch, inactive, absent, unknown, multiple and wrong permit fail closed', () => {
 assert.equal(assessCards([{...card,name:'Autre Personne'}],expected,1).result,'name_mismatch');
 assert.equal(assessCards([{...card,status:'Inactif'}],expected,1).result,'inactive');
 assert.equal(assessCards([{...card,status:undefined}],expected,1).result,'ambiguous');
 assert.equal(assessCards([{...card,status:'Actif sous restriction'}],expected,1).result,'ambiguous');
 assert.equal(assessCards([{...card,permit:'Régulier Numéro 3486'}],expected,1).result,'ambiguous');
 assert.equal(assessCards([card,card],expected,2).result,'ambiguous');
 assert.equal(assessCards([card],expected,0).result,'ambiguous');
 assert.equal(assessCards([],expected,0).result,'not_found');
});
test('browser failure returns unavailable', async () => {
 assert.deepEqual(await lookupOmvq(expected,{chromium:{launch:async()=>{throw Error('offline')}}}),{result:'unavailable'});
});
test('local worker rejects remote DB URLs', () => {
 for(const url of ['https://example.supabase.co','http://127.0.0.1.evil.test','http://user:pass@localhost','https://localhost']) assert.throws(()=>assertLocalUrl(url));
 assert.equal(assertLocalUrl('http://127.0.0.1:54321'),'http://127.0.0.1:54321');
});
async function requestWorker({enabled=true,cached=null,allowed=true}={}) {
 let lookups=0,writes=0;
 const handler=createVerificationHandler({enabled,origin:'http://127.0.0.1:5173',cooldownMs:0,
 userClient:()=>({auth:{getUser:async()=>({data:{user:{id:'test'}}})},rpc:async()=>allowed?{data:{practitioner:expected,cached}}:{error:{message:'VET_ACCESS_DENIED'}}}),
 serviceClient:{rpc:async()=>{writes++;return {error:null}}},lookup:async()=>{lookups++;return {...card,name:card.name,permit:'4887',result:'verified'}}});
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
 const r=await fetch(`http://127.0.0.1:${server.address().port}/verify`,{method:'POST',headers:{Origin:'http://127.0.0.1:5173',Authorization:'Bearer test'},body:JSON.stringify({practitioner_id:'a1000000-0000-0000-0000-000000000001'})});
 return {status:r.status,body:await r.json(),lookups,writes};
 } finally {await new Promise(resolve=>server.close(resolve));}
}
test('positive cache skips browser and writes',async()=>{
 const r=await requestWorker({cached:{result:'verified',checked_at:'2026-09-05'}});assert.equal(r.status,200);assert.equal(r.lookups,0);assert.equal(r.writes,0);assert.equal(r.body.cached,true);
});
test('disabled integration and unauthorized membership cannot invoke browser',async()=>{
 for(const opts of [{enabled:false},{allowed:false}]){const r=await requestWorker(opts);assert.ok([403,503].includes(r.status));assert.equal(r.lookups,0);assert.equal(r.writes,0);}
});
test('uncached authorized check invokes browser once and saves trusted result',async()=>{
 const r=await requestWorker();assert.equal(r.status,200);assert.equal(r.lookups,1);assert.equal(r.writes,1);
});

test('missing accents match only with exact permit, full name and explicit active status', () => {
 const unaccented = {name: 'Amelie Croteau', permit_number: '4887'};
 assert.equal(assessCards([card], unaccented, 1).result, 'verified');
 assert.equal(assessCards([card], {...unaccented, name: 'Amelie Crotea'}, 1).result, 'name_mismatch');
 assert.equal(assessCards([card], {...unaccented, permit_number: '3486'}, 1).result, 'ambiguous');
 assert.equal(assessCards([{...card,status:'Inactif'}], unaccented, 1).result, 'inactive');
});
