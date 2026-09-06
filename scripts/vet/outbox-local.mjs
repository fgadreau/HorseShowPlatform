// Local integration only. Does not contact the OMVQ or send external messages.
import {execFileSync} from 'node:child_process';import {createClient} from '@supabase/supabase-js';import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';
import {createPreprodOutbox} from '../../server/vet/preprod-outbox.mjs';import {hashToken} from '../../server/vet/authorization.mjs';
const config=JSON.parse(execFileSync('./node_modules/.bin/supabase',['status','--workdir',process.env.VET_LOCAL_WORKDIR,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assert.equal(new URL(config.API_URL).hostname,'127.0.0.1');const opts={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,opts),user=createClient(config.API_URL,config.ANON_KEY,opts),other=createClient(config.API_URL,config.ANON_KEY,opts);
const rpc=async(c,n,a)=>{const r=await c.rpc(n,a);if(r.error)throw r.error;return r.data;};
for(const [c,email] of [[user,'phase1.platform@example.test'],[other,'phase1.org-a-owner@example.test']]){const r=await c.auth.signInWithPassword({email,password:'phase1-password'});if(r.error)throw r.error;}
let issuer,authorization;const old=(await service.from('vet_settings').select('omvq_enabled,freshness_hours').single()).data;
try{
 await rpc(user,'vet_admin_settings',{p_enabled:true,p_freshness_hours:24});
 issuer=await rpc(user,'vet_admin_save_issuer',{p_id:null,p_name:'TEST LOCAL — encrypted outbox '+crypto.randomUUID().slice(0,8),p_kind:'clinic',p_contact_details:'Test local',p_status:'active'});
 const vet=await rpc(user,'vet_add_practitioner',{p_issuer:issuer,p_name:'TEST LOCAL — vétérinaire fictif',p_permit:'999999'});
 await rpc(service,'vet_record_verification',{p_practitioner:vet,p_name:'TEST LOCAL — vétérinaire fictif',p_permit:'999999',p_status:'Actif',p_result:'verified'});
 const token=randomBytes(32).toString('hex');authorization=await rpc(user,'vet_request_authorization',{p_practitioner:vet,p_token_hash:hashToken(token),p_method:'personal_link',p_email:'outbox@example.test'});
 const outbox=createPreprodOutbox(service,randomBytes(32));const link='https://preprod.example.test/vet/authorize#token='+token;
 await outbox.captureAuthorization({client:user,authorizationId:authorization,email:'outbox@example.test',link});
 const rows=await user.from('vet_preprod_outbox').select('id').eq('issuer_id',issuer);assert.equal(rows.data.length,1);const id=rows.data[0].id;
 assert.equal((await outbox.read(user,id)).link,link);await assert.rejects(outbox.read(other,id));
 const raw=await service.from('vet_preprod_outbox').select('encrypted_message').eq('id',id).single();assert.ok(!raw.data.encrypted_message.includes(token));
 const denied=await user.from('vet_preprod_outbox').select('encrypted_message').eq('id',id);assert.ok(denied.error);
 await rpc(user,'vet_cancel_authorization',{p_id:authorization});assert.ok((await service.rpc('vet_authorization_summary',{p_hash:hashToken(token)})).error);
 await service.from('vet_preprod_outbox').update({expires_at:new Date(Date.now()-1000).toISOString()}).eq('id',id);await assert.rejects(outbox.read(user,id));
 console.log('PASS local encrypted outbox: real RLS, encrypted token, authorized read, other account denied, cancellation and expiry; zero external mail');
}finally{
 if(issuer)await service.from('vet_issuers').update({status:'suspended'}).eq('id',issuer);
 if(old)await service.from('vet_settings').update(old).eq('id',true);
 await user.auth.signOut({scope:'local'});await other.auth.signOut({scope:'local'});
}
