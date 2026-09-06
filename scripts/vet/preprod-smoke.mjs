// PREPROD only. Fresh disposable identities; never imports local seeds or positive OMVQ fixtures.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {chromium} from '@playwright/test';
const expected='qaguotdproxamgudnnsd';
const base='https://horse-show-platform-git-preprod-felix-gadreau-girard-s-projects.vercel.app';
assert.equal(process.env.E2E_DEPLOY_ENV,'staging');assert.equal(process.env.E2E_ALLOW_WRITES,'true');
assert.equal(process.env.E2E_SUPABASE_PROJECT_REF,expected);
assert.equal(process.env.E2E_SUPABASE_URL,`https://${expected}.supabase.co`);
assert.equal(process.env.E2E_BASE_URL,base);
const opts={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(process.env.E2E_SUPABASE_URL,process.env.E2E_SUPABASE_SERVICE_ROLE_KEY,opts);
const client=()=>createClient(process.env.E2E_SUPABASE_URL,process.env.E2E_SUPABASE_PUBLISHABLE_KEY,opts);
const rpc=async(c,name,args={})=>{const {data,error}=await c.rpc(name,args);if(error)throw Error(`${name}: ${error.message}`);return data;};
const run=crypto.randomUUID().slice(0,8),accounts=[],issuers=[];let browser,adminProfile;
async function account(role){
 const email=`vet-preprod-${run}-${role}@example.test`,password=`Vet-${crypto.randomUUID()}-aA1!`;
 const {data,error}=await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{first_name:'TEST PREPROD',last_name:`Vétérinaire ${role}`,type_user:'owner'}});
 if(error)throw error;accounts.push(data.user.id);
 let profile;
 for(let i=0;i<30;i++){const r=await service.from('user_profiles').select('id').eq('user_id',data.user.id).maybeSingle();if(r.error)throw r.error;if(r.data){profile=r.data.id;break;}await new Promise(r=>setTimeout(r,250));}
 assert.ok(profile);const c=client();const login=await c.auth.signInWithPassword({email,password});if(login.error)throw login.error;
 return {c,email,password,profile};
}
try {
 const admin=await account('admin');adminProfile=admin.profile;
 const grant=await service.from('platform_admins').insert({user_id:admin.profile});if(grant.error)throw grant.error;
 assert.equal(await rpc(admin.c,'is_platform_admin'),true);
 const staff=await account('staff'),ordinary=await account('ordinary');
 for(const suffix of ['A','B'])issuers.push(await rpc(admin.c,'vet_admin_save_issuer',{p_id:null,p_name:`[TEST PREPROD] Vet ${run} ${suffix}`,p_kind:'clinic',p_contact_details:'Données fictives — aucun envoi externe',p_status:'active'}));
 await rpc(admin.c,'vet_admin_set_member',{p_issuer:issuers[0],p_email:staff.email,p_active:true});
 const visible=await staff.c.from('vet_issuers').select('id');assert.deepEqual(visible.data.map(i=>i.id),[issuers[0]]);
 const practitioner=await rpc(staff.c,'vet_add_practitioner',{p_issuer:issuers[0],p_name:'TEST PREPROD — vétérinaire non vérifié',p_permit:'000000'});
 const payload={owner:{name:`Test Propriétaire ${run}`,contact_details:'Coordonnées fictives PREPROD',email:`vet-preprod-owner-${run}@example.test`},agent:{name:'Écurie TEST PREPROD',email:''},administrations:[{product:'TEST PREPROD — produit fictif',manufacturer:'TEST',lot:`TEST-${run}`,diseases:['influenza','ehv_1','ehv_4'],administered_on:new Date().toISOString().slice(0,10),product_expires_on:'2030-12-31',valid_until:'2030-01-01',declared_duration:''}]};
 const args={p_issuer:issuers[0],p_id:crypto.randomUUID(),p_revision:1,p_practitioner:practitioner,p_payload:payload};
 assert.ok((await ordinary.c.rpc('vet_save_draft',args)).error);
 assert.ok((await staff.c.rpc('vet_add_practitioner',{p_issuer:issuers[1],p_name:'TEST interdit',p_permit:'000000'})).error);
 let draft=await rpc(staff.c,'vet_save_draft',args);
 assert.ok((await staff.c.rpc('vet_create_searched_horse',{p_certificate:draft.id,p_search:crypto.randomUUID(),p_owner_first:'Test',p_owner_last:`Propriétaire ${run}`})).error);
 const horseName=`[TEST PREPROD] Cheval ${run}`;
 const search=await rpc(staff.c,'vet_search_horse_candidates',{p_certificate:draft.id,p_name:horseName,p_owner:payload.owner.name});assert.equal(search.results.length,0);
 const created=await rpc(staff.c,'vet_create_searched_horse',{p_certificate:draft.id,p_search:search.search_id,p_owner_first:'Test',p_owner_last:`Propriétaire ${run}`,p_owner_email:payload.owner.email});
 draft=created.certificate;assert.ok(draft.horse_id);assert.equal(draft.payload.administrations[0].lot,payload.administrations[0].lot);
 const found=await rpc(staff.c,'vet_search_horse_candidates',{p_certificate:draft.id,p_name:horseName,p_owner:payload.owner.name});assert.equal(found.results.length,1);
 await rpc(staff.c,'vet_link_horse',{p_certificate:draft.id,p_selection:found.results[0].selection_id,p_confirmed:true});
 assert.deepEqual((await staff.c.from('horses').select('id').eq('id',draft.horse_id)).data,[]);
 for(const [name,args] of [['vet_issue_certificate',{p_id:draft.id}],['vet_request_authorization',{p_practitioner:practitioner,p_token_hash:'0'.repeat(64),p_method:'clinic_device',p_email:''}]])assert.ok((await staff.c.rpc(name,args)).error);
 const proof=await service.from('vet_verifications').select('id').eq('practitioner_id',practitioner);assert.deepEqual(proof.data,[]);
 const vaccinations=await service.from('horse_vaccinations').select('id').eq('horse_id',draft.horse_id);assert.deepEqual(vaccinations.data,[]);
 console.log('PASS PREPROD API: private access, clinic isolation, search before creation, central horse attachment, immutable draft data, no indirect owner rights, no simulated verification or vaccination');
 browser=await chromium.launch();const context=await browser.newContext();
 await context.route('**/*',route=>{const req=route.request();if(new URL(req.url()).origin===base&&process.env.VERCEL_AUTOMATION_BYPASS_SECRET)return route.continue({headers:{...req.headers(),'x-vercel-protection-bypass':process.env.VERCEL_AUTOMATION_BYPASS_SECRET}});return route.continue();});
 const page=await context.newPage();await page.goto(base+'/vet');
 await page.getByRole('heading',{name:'Connexion privée',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:/inscrire/i}).count(),0);
 await page.getByLabel('Courriel',{exact:true}).fill(staff.email);await page.getByLabel('Mot de passe',{exact:true}).fill(staff.password);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByLabel('Émetteur',{exact:true}).selectOption(issuers[0]);
 await page.locator('.vet-list-item').first().click();
 assert.equal(await page.getByLabel('Nom du propriétaire sur le certificat').inputValue(),payload.owner.name);
 await page.getByText('PREPROD — préparation des certificats.',{exact:false}).waitFor();
 await page.goto(base+'/vet/verify/VET-NOT-FOUND');await page.getByText('Certificat introuvable.',{exact:true}).waitFor();
 console.log('PASS PREPROD browser: /vet private login, saved draft, explicit pending service notice, public verification route');
 await rpc(staff.c,'vet_delete_draft',{p_id:draft.id});
 await rpc(admin.c,'vet_admin_save_issuer',{p_id:issuers[0],p_name:`[TEST PREPROD] Vet ${run} A`,p_kind:'clinic',p_contact_details:'Données fictives',p_status:'suspended'});
 assert.deepEqual((await staff.c.from('vet_issuers').select('id')).data,[]);
 console.log('PASS PREPROD: draft deletion, suspension immediately removes access. BLOCKED: real OMVQ, signatures, issuance, PDF, corrections/revocations and recognized vaccination await hosted worker; no email sent.');
} finally {
 if(browser)await browser.close();
 for(const id of issuers){const r=await service.from('vet_issuers').update({status:'suspended'}).eq('id',id);if(r.error)console.error('Fixture suspension failed');}
 if(adminProfile){const r=await service.from('platform_admins').delete().eq('user_id',adminProfile);if(r.error)console.error('Test admin revocation failed');}
 for(const id of accounts){const r=await service.auth.admin.updateUserById(id,{ban_duration:'876000h'});if(r.error)console.error('Test account deactivation failed');}
}
