import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createAuthorizationHandler} from '../../server/vet/authorization.mjs';
async function request({enabled=true,loggedIn=true,admin=true}={}){
 let writes=0;const handler=createAuthorizationHandler({origin:'http://127.0.0.1:5173',localTestEnabled:enabled,
 userClient:()=>({auth:{getUser:async()=>({data:{user:loggedIn?{id:'user'}:null}})},rpc:async name=>({data:name==='is_platform_admin'?admin:'profile'})}),
 serviceClient:{rpc:async(name,args)=>{writes++;assert.equal(name,'vet_create_local_test_authorization');assert.equal(args.p_admin,'profile');return{data:'test-authorization'};}}});
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const res=await fetch(`http://127.0.0.1:${server.address().port}/authorization-test`,{method:'POST',headers:{Origin:'http://127.0.0.1:5173',Authorization:'Bearer test'},body:JSON.stringify({practitioner_id:'vet',email:'staff@example.test'})});return{status:res.status,body:await res.json(),writes};}
 finally{await new Promise(r=>server.close(r));}
}
test('local simulation requires feature flag, valid login and platform administrator',async()=>{
 for(const [opts,code] of [[{enabled:false},404],[{loggedIn:false},401],[{admin:false},403]]){const r=await request(opts);assert.equal(r.status,code);assert.equal(r.writes,0);}
 const r=await request();assert.equal(r.status,200);assert.equal(r.body.test_only,true);assert.equal(r.writes,1);
});
