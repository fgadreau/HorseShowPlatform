import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {createHostedHandler,hostedConfig,PREPROD_ORIGIN,PREPROD_REF} from '../../server/vet/hosted.mjs';
import {outboxKey,encryptMessage,decryptMessage} from '../../server/vet/preprod-outbox.mjs';
const env={VITE_DEPLOY_ENV:'staging',VITE_SUPABASE_PROJECT_REF:PREPROD_REF,VITE_SUPABASE_URL:`https://${PREPROD_REF}.supabase.co`,VERCEL_GIT_COMMIT_REF:'preprod',VITE_SUPABASE_PUBLISHABLE_KEY:'test-public',VET_SUPABASE_SERVICE_ROLE_KEY:'test-server',VET_WORKER_ENABLED:'true',VET_OMVQ_ENABLED:'true',VET_PREPROD_OUTBOX_KEY:Buffer.alloc(32,1).toString('base64')};
async function request(action,{settings=env,method='POST',origin=PREPROD_ORIGIN,auth=true,admin=true,rewritten=false}={}){
 let launches=0;const browser={launch:async()=>{launches++;return{newContext:async()=>({route:async()=>{},newPage:async()=>({setContent:async()=>{},pdf:async()=>Buffer.from('%PDF-test')})}),close:async()=>{}};}};
 const handler=createHostedHandler(settings,{browser,clientFactory:()=>({auth:{getUser:async()=>({data:{user:auth?{}:null}})},rpc:async()=>({data:admin})})});
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const r=await fetch(`http://127.0.0.1:${server.address().port}/api/vet${rewritten?'?action=':'/'}${action}`,{method,headers:{Origin:origin,Authorization:'Bearer test','Content-Type':'application/json'},...(method==='POST'?{body:'{}'}:{})});return{status:r.status,body:await r.json(),launches};}finally{await new Promise(r=>server.close(r));}
}
test('native Vercel function dispatches rewritten actions and rejects unknown endpoints',async()=>{
 assert.equal((await request('health',{method:'GET',rewritten:true})).body.ready,true);
 assert.equal((await request('browser-check',{rewritten:true})).body.pdf,true);
 assert.equal((await request('authorization-test',{rewritten:true})).status,404);
});
test('hosted worker refuses production, other projects and non-preprod branches',async()=>{
 for(const change of [{VITE_DEPLOY_ENV:'production'},{VITE_SUPABASE_PROJECT_REF:'srzzituovoxkvvlaesxa'},{VERCEL_GIT_COMMIT_REF:'main'},{VITE_SUPABASE_URL:'http://127.0.0.1:54321'}])assert.equal((await request('health',{settings:{...env,...change},method:'GET'})).status,404);
});
test('health reports missing configuration without exposing secrets; mail is independent of PDF/signature',async()=>{
 const r=await request('health',{settings:{...env,VET_PREPROD_OUTBOX_KEY:''},method:'GET'});assert.equal(r.body.ready,true);assert.equal(r.body.mail,false);assert.deepEqual(r.body.missing,['VET_PREPROD_OUTBOX_KEY']);assert.ok(!JSON.stringify(r.body).includes('test-server'));
 assert.equal((await request('health',{settings:{...env,VET_SUPABASE_SERVICE_ROLE_KEY:''},method:'GET'})).body.ready,false);
 assert.equal((await request('verify',{settings:{...env,VET_WORKER_ENABLED:'false'}})).status,503);
 assert.equal((await request('authorization-test')).status,404);
});
test('browser diagnostic requires authenticated platform admin and exact preprod origin',async()=>{
 for(const [opts,status] of [[{auth:false},401],[{admin:false},403],[{origin:'https://other.test'},403]]){const r=await request('browser-check',opts);assert.equal(r.status,status);assert.equal(r.launches,0);}
 const r=await request('browser-check');assert.equal(r.status,200);assert.equal(r.body.pdf,true);assert.equal(r.body.external_requests,0);assert.equal(r.launches,1);
});
test('outbox encrypts personal links and PDFs with authenticated encryption bound to the message id',()=>{
 const key=outboxKey(env.VET_PREPROD_OUTBOX_KEY),message={link:`${PREPROD_ORIGIN}/vet/authorize#token=secret-test-token`,attachment:{base64:'JVBERg=='}};
 const encrypted=encryptMessage(message,key,'id-1');assert.ok(!encrypted.includes('secret-test-token'));assert.deepEqual(decryptMessage(encrypted,key,'id-1'),message);
 assert.throws(()=>decryptMessage(encrypted,key,'id-2'));assert.throws(()=>decryptMessage(encrypted,Buffer.alloc(32,2),'id-1'));
 const changed=Buffer.from(encrypted,'base64');changed[30]^=1;assert.throws(()=>decryptMessage(changed.toString('base64'),key,'id-1'));assert.throws(()=>outboxKey('bad'));
});
