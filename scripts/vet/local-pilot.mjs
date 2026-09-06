// Integration test writes only to an explicitly checked loopback Supabase.
// Verification is a trusted LOCAL fixture, never a live OMVQ query.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { assertLocalUrl, createVerificationHandler } from '../../server/vet/local-server.mjs';
const url = assertLocalUrl(process.env.VET_SUPABASE_URL);
const key = process.env.VET_SUPABASE_ANON_KEY, secret = process.env.VET_SUPABASE_SERVICE_ROLE_KEY;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, opts);
const user = createClient(url, key, opts);
async function rpc(client, name, args) { const r = await client.rpc(name, args);if (r.error) throw new Error(`${name}: ${r.error.message}`);return r.data; }
const login = await user.auth.signInWithPassword({ email: 'phase1.platform@example.test', password: 'phase1-password' });
if (login.error) throw login.error;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5179', '--strictPort'], { env: { ...process.env, VITE_DEPLOY_ENV: 'local', VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: key, VITE_SUPABASE_PUBLISHABLE_KEY: key }, stdio: 'ignore' });
let browser;
const runId = crypto.randomUUID().slice(0,8);
try {
 for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:5179')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5179/vet');
 await page.getByLabel('Courriel',{exact:true}).fill('phase1.platform@example.test');await page.getByLabel('Mot de passe',{exact:true}).fill('phase1-password');await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByText('Administration HSP — émetteurs et accès',{exact:true}).click();
 await page.getByLabel('Nom de l’émetteur',{exact:true}).fill('Pilote UI '+runId);
 await page.getByLabel('Coordonnées de l’émetteur',{exact:true}).fill('Québec, coordonnées fictives');
 await page.getByRole('button',{name:'Créer et autoriser',exact:true}).click();
 await page.getByRole('heading',{name:'Accès à Pilote UI '+runId}).waitFor();
 const issuerId=await page.getByLabel('Émetteur',{exact:true}).inputValue();
 await page.getByLabel('Courriel du compte HSP existant').fill('phase1.org-a-secretary@example.test');
 await page.getByRole('button',{name:'Accorder l’accès',exact:true}).click();await page.getByRole('alert').filter({hasText:'Accès accordé.'}).waitFor();
 await rpc(user,'vet_admin_settings',{p_enabled:true,p_freshness_hours:24});
 console.log('PASS UI: administrator authorizes issuer and employee');
 await page.getByRole('button',{name:'Déconnexion',exact:true}).click();
 assert.ok((await user.auth.getUser()).data.user,'Portal logout must preserve the independent administrator session');
 console.log('PASS sessions: portal logout preserves another session of the same administrator');
 await page.getByLabel('Courriel',{exact:true}).fill('phase1.org-a-secretary@example.test');await page.getByLabel('Mot de passe',{exact:true}).fill('phase1-password');await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByLabel('Émetteur',{exact:true}).selectOption(issuerId);
 await page.getByText('Ajouter un vétérinaire responsable',{exact:true}).click();
 await page.getByLabel('Nom du vétérinaire',{exact:true}).fill('Amelie Crotea');await page.getByLabel('Numéro de permis OMVQ',{exact:true}).fill('4887');
 await page.getByRole('button',{name:'Ajouter le vétérinaire',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('select')&&[...document.querySelectorAll('select')].some(s=>s.selectedOptions[0]?.textContent==='Amelie Crotea — 4887'));
 const originalPractitioner=await page.getByLabel('Vétérinaire responsable',{exact:true}).inputValue();
 await page.getByRole('button',{name:'Corriger le nom ou le permis',exact:true}).click();
 await page.getByLabel('Nom du vétérinaire',{exact:true}).fill('Amelie Croteau');
 await page.getByRole('button',{name:'Enregistrer la correction',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Vétérinaire sélectionné et brouillon enregistré'}).waitFor();
 const practitionerId=await page.getByLabel('Vétérinaire responsable',{exact:true}).inputValue();
 assert.notEqual(practitionerId,originalPractitioner);
 console.log('PASS UI: correct name without discarding draft; original declaration retained');
 await page.getByLabel('Nom du propriétaire sur le certificat').fill('Test Owner');await page.getByLabel('Coordonnées du propriétaire',{exact:true}).fill('Québec, adresse de test');
 const selectedBeforeRefresh = await page.getByLabel('Vétérinaire responsable',{exact:true}).inputValue();
 await page.evaluate(async()=>{const {supabase}=await import('/src/lib/supabase.ts');const {error}=await supabase.auth.refreshSession();if(error)throw Error(error.message);});
 assert.equal(await page.getByLabel('Nom du propriétaire sur le certificat').inputValue(),'Test Owner');
 assert.equal(await page.getByLabel('Vétérinaire responsable',{exact:true}).inputValue(),selectedBeforeRefresh);
 console.log('PASS sessions: token renewal preserves the selected veterinarian and draft form');
 await page.getByRole('heading',{name:'Rechercher le cheval dans HSP',exact:true}).waitFor();
 assert.equal(await page.getByLabel('Association d’enregistrement',{exact:true}).count(),0);
 await page.getByLabel('Nom du cheval',{exact:true}).fill('Cheval UI '+runId);await page.getByLabel('Nom du propriétaire',{exact:true}).fill('Test Owner');await page.getByRole('button',{name:'Rechercher le cheval',exact:true}).click();await page.getByRole('button',{name:'Créer ce cheval dans HSP',exact:true}).click();assert.equal(await page.getByLabel('Prénom du propriétaire',{exact:true}).inputValue(),'Test');await page.getByLabel('Prénom du propriétaire',{exact:true}).fill('Test');await page.getByLabel('Nom de famille du propriétaire',{exact:true}).fill('Owner');await page.getByLabel('Courriel du propriétaire (facultatif)',{exact:true}).fill('vet-ui-'+runId+'@example.test');
 await page.getByRole('button',{name:'Créer et rattacher le cheval',exact:true}).click();await page.getByRole('alert').filter({hasText:'Cheval rattaché au certificat.'}).waitFor();
 await page.getByLabel('Nom commercial',{exact:true}).fill('Vaccin fictif');await page.getByLabel('Fabricant',{exact:true}).fill('Fabricant fictif');await page.getByLabel('Lot ou série',{exact:true}).fill('UI-LOT');
 const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
 await page.getByLabel('Expiration du produit',{exact:true}).fill(day(30));await page.getByLabel('Date d’administration',{exact:true}).fill(day(-1));await page.getByLabel('Date de rappel / fin de validité',{exact:true}).fill(day(90));
 for(const d of ['Influenza','EHV-1','EHV-4'])await page.getByLabel(d,{exact:true}).check();
 await page.getByRole('button',{name:'Émettre le certificat',exact:true}).click();await page.getByRole('alert').filter({hasText:'Vérifiez le vétérinaire à l’étape 1'}).waitFor();
 console.log('PASS UI: draft survives refused issuance without verification');
 await rpc(admin,'vet_record_verification',{p_practitioner:practitionerId,p_name:'Dre Amélie Croteau m.v.',p_permit:'4887',p_status:'Actif',p_result:'verified'});
 await page.getByRole('button',{name:'Émettre le certificat',exact:true}).click();await page.getByRole('alert').filter({hasText:'Le vétérinaire doit d’abord autoriser'}).waitFor();
 await page.getByRole('button',{name:'Le vétérinaire autorise sur cet appareil',exact:true}).click();
 await page.getByLabel('Je suis le vétérinaire indiqué et j’accepte cette autorisation.').check();
 const canvas=page.getByLabel('Signature du vétérinaire',{exact:true});const box=await canvas.boundingBox();
 await page.mouse.move(box.x+20,box.y+60);await page.mouse.down();for(let i=1;i<=15;i++)await page.mouse.move(box.x+20+i*10,box.y+60+(i%2)*30);await page.mouse.up();
 await page.getByRole('button',{name:'Signer l’autorisation préalable',exact:true}).click();await page.getByRole('status').filter({hasText:'Autorisation signée.'}).waitFor();
 console.log('PASS UI: issuance denied without prior consent; veterinarian authorizes once on clinic device');

 await page.getByRole('button',{name:'Émettre le certificat',exact:true}).click();await page.getByRole('heading',{name:'Signé et valide',exact:true}).waitFor();
 assert.equal(await page.getByLabel('Nom commercial',{exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'Actualiser l’état vaccinal du cheval',exact:true}).click();await page.getByRole('table').waitFor();
 assert.equal(await page.getByRole('cell',{name:'Valide',exact:true}).count(),3);
 console.log('PASS UI: trusted local fixture permits issuance; form immutable; three diseases valid');
 const {data:certs,error}=await admin.from('vet_certificates').select('id,horse_id').eq('issuer_id',issuerId).eq('status','issued');if(error)throw error;
 const staff=createClient(url,key,opts);await staff.auth.signInWithPassword({email:'phase1.org-a-secretary@example.test',password:'phase1-password'});
 const handler=createVerificationHandler({ enabled:true, origin:'http://127.0.0.1:5179', serviceClient:admin,
 userClient:auth=>createClient(url,key,{...opts,global:{headers:{Authorization:auth}}}),
 lookup:async()=>{throw new Error('Cache must avoid every browser lookup');} });
 const worker=http.createServer(handler);await new Promise(r=>worker.listen(0,'127.0.0.1',r));
 try {
  const session=(await staff.auth.getSession()).data.session;
  const reply=await fetch(`http://127.0.0.1:${worker.address().port}/verify`,{method:'POST',headers:{Origin:'http://127.0.0.1:5179',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({practitioner_id:practitionerId})});
  assert.equal(reply.status,200);const result=await reply.json();assert.equal(result.cached,true);assert.equal(result.result,'verified');
  console.log('PASS worker/API: real local JWT and database cache, zero browser lookups');
 } finally {await new Promise(r=>worker.close(r));}
 const c=certs[0];const before=await rpc(staff,'vet_issue_certificate',{p_id:c.id});const after=await rpc(staff,'vet_issue_certificate',{p_id:c.id});assert.equal(before.number,after.number);
 const central=await staff.from('horses').select('id').eq('id',c.horse_id);assert.deepEqual(central.data,[]);
 const writes=await staff.from('horse_vaccinations').update({lot:'tampered'}).eq('certificate_id',c.id);assert.ok(writes.error);
 console.log('PASS API: idempotent issuance; no indirect central read or vaccination writes');
 const downloadEvent=page.waitForEvent('download');
 await page.getByRole('button',{name:'Télécharger le certificat PDF',exact:true}).click();
 const download=await downloadEvent;const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream)chunks.push(chunk);const pdf=Buffer.concat(chunks);
 assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);
 await page.getByLabel('Envoyer au propriétaire — courriel').fill('owner-'+runId+'@example.test');
 await page.getByLabel('Envoyer à l’agent — courriel').fill('agent-'+runId+'@example.test');
 for(let i=0;i<2;i++){
  await page.getByRole('button',{name:'Envoyer le PDF — test local',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Courriels capturés'}).waitFor();
 }
 const {data:deliveries,error:deliveryError}=await staff.from('vet_certificate_deliveries').select('recipient,status').eq('certificate_id',c.id);
 if(deliveryError)throw deliveryError;assert.equal(deliveries.length,2);assert.ok(deliveries.every(d=>d.status==='local_captured'));
 const forgery=await staff.from('vet_certificate_deliveries').update({status:'local_captured'}).eq('certificate_id',c.id);assert.ok(forgery.error);
 console.log('PASS UI: actual PDF download; owner + agent captured locally; repeated click idempotent; delivery status protected');
 // Personal-link authorization: no HSP session in the veterinarian browser.
 const authRows=await staff.from('vet_signature_authorizations').select('id').eq('practitioner_id',practitionerId).eq('status','active');
 await rpc(staff,'vet_cancel_authorization',{p_id:authRows.data[0].id});
 const staffSession=(await staff.auth.getSession()).data.session;
 const workerPost=async(endpoint,body)=>{const session=(await staff.auth.getSession()).data.session;return fetch(`http://127.0.0.1:54330/${endpoint}`,{method:'POST',headers:{Origin:'http://127.0.0.1:5173','Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)});};
 const vetEmail='responsable-'+runId+'@example.test';
 const request=await workerPost('authorization-request',{practitioner_id:practitionerId,method:'personal_link',email:vetEmail});assert.equal(request.status,200);
 assert.equal((await request.json()).token,undefined);
 const messages=await(await fetch('http://127.0.0.1:54324/api/v1/messages')).json();
 const message=messages.messages.find(m=>JSON.stringify(m.To).includes(vetEmail));assert.ok(message);
 const mail=await(await fetch('http://127.0.0.1:54324/api/v1/message/'+message.ID)).json();
 const token=mail.Text.match(/#token=([a-f0-9]{64})/)?.[1];assert.ok(token);
 const remote=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const vetPage=await remote.newPage();
 await vetPage.goto('http://127.0.0.1:5179/vet/authorize#token='+token);
 await vetPage.getByLabel('Je suis le vétérinaire indiqué et j’accepte cette autorisation.').check();assert.ok(!vetPage.url().includes(token));
 const pad=vetPage.getByLabel('Signature du vétérinaire',{exact:true});await pad.scrollIntoViewIfNeeded();const touchBox=await pad.boundingBox();
 const cdp=await remote.newCDPSession(vetPage);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchBox.x+20,y:touchBox.y+50}]});
 for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchBox.x+20+i*10,y:touchBox.y+50+(i%2)*20}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await vetPage.getByRole('button',{name:'Signer l’autorisation préalable',exact:true}).click();await vetPage.getByText('Votre autorisation est enregistrée.',{exact:false}).waitFor();
 assert.equal((await workerPost('authorization-summary',{token})).status,403);
 assert.equal((await workerPost('authorization-approve',{token,visual:[[[0.1,0.1],[0.2,0.2]]],accepted:true})).status,403);
 await remote.close();
 console.log('PASS remote veterinarian: personal email link, no HSP account, touch signature, token removed from URL and unusable twice');
 // Complete a new version automatically under the active authorization, then revoke via the UI with a short reason.
 const correction=await rpc(staff,'vet_correct_certificate',{p_id:c.id});
 const corrected=await rpc(staff,'vet_issue_certificate',{p_id:correction.id});assert.notEqual(corrected.signature_id,before.signature_id);assert.equal(corrected.version_number,2);
 const publicCtx=await browser.newContext();const publicPage=await publicCtx.newPage();
 await publicPage.goto('http://127.0.0.1:5179/vet/verify/'+before.public_number);await publicPage.getByRole('heading',{name:'Remplacé par une correction',exact:true}).waitFor();
 await publicPage.goto('http://127.0.0.1:5179/vet/verify/'+corrected.public_number);await publicPage.getByRole('heading',{name:'Certificat valide et signé',exact:true}).waitFor();
 const details=publicPage.getByRole('article',{name:'Renseignements du certificat'});
 assert.ok((await details.textContent()).includes(before.payload.horse.name));
 assert.ok((await details.textContent()).includes(before.payload.owner.name));
 assert.ok((await details.textContent()).includes(before.payload.administrations[0].lot));
 await publicPage.getByRole('img',{name:'Signature électronique du vétérinaire',exact:true}).waitFor();
 const anonymous=createClient(url,key,opts);
 const publicRecord=await rpc(anonymous,'vet_public_certificate_status',{p_number:corrected.public_number});
 assert.equal(publicRecord.details.owner_name,before.payload.owner.name);
 assert.equal(publicRecord.details.horse_name,before.payload.horse.name);
 assert.ok(before.payload.owner.email);
 for(const contact of [before.payload.owner.email,before.payload.agent.email,before.payload.owner.contact_details].filter(Boolean)) assert.equal(JSON.stringify(publicRecord).includes(contact),false);
 assert.equal(publicRecord.details.owner_email,undefined);
 assert.equal(publicRecord.details.signature_visual.length>0,true);
 console.log('PASS QR: anonymous snapshot details, owner and horse names, vaccinations and signature; personal contacts excluded');

 await page.getByRole('button',{name:'Déconnexion',exact:true}).click();
 await page.getByLabel('Courriel',{exact:true}).fill('phase1.platform@example.test');await page.getByLabel('Mot de passe',{exact:true}).fill('phase1-password');await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByLabel('Émetteur',{exact:true}).selectOption(issuerId);
 await page.locator('.vet-list-item').filter({hasText:corrected.number.slice(-8)}).click();
 await page.getByLabel('Motif de révocation',{exact:true}).fill('test');await page.getByRole('button',{name:'Révoquer ce certificat',exact:true}).click();await page.getByRole('heading',{name:'Révoqué',exact:true}).waitFor();
 await publicPage.reload();await publicPage.getByRole('heading',{name:'Révoqué',exact:true}).waitFor();await publicCtx.close();
 console.log('PASS public status: signed, replaced and revoked; UI accepts and audits a four-character reason');
 if(process.env.VET_LOCAL_TEST_AUTHORIZATION==='true'){
  const real=await staff.from('vet_signature_authorizations').select('id').eq('practitioner_id',practitionerId).eq('status','active');
  for(const a of real.data)await rpc(staff,'vet_cancel_authorization',{p_id:a.id});
  await page.getByRole('button',{name:'Nouveau brouillon',exact:true}).click();
  await page.getByLabel('Vétérinaire responsable',{exact:true}).selectOption(practitionerId);
  await page.getByText('Simulation pour les tests locaux',{exact:true}).click();
  await page.getByLabel('Compte à autoriser pour le test (courriel)',{exact:true}).fill('phase1.org-a-secretary@example.test');
  await page.getByRole('button',{name:'Créer l’autorisation de test',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Autorisation de test créée'}).waitFor();
  const testDraft=await rpc(staff,'vet_save_draft',{p_issuer:issuerId,p_id:crypto.randomUUID(),p_revision:1,p_practitioner:practitionerId,p_payload:{...before.payload,administrations:before.payload.administrations.map(a=>({...a,administered_on:day(0)}))}});
  const found=await rpc(staff,'vet_search_horse_candidates',{p_certificate:testDraft.id,p_name:before.payload.horse.name,p_owner:before.payload.horse.owner_name});
  await rpc(staff,'vet_link_horse',{p_certificate:testDraft.id,p_selection:found.results[0].selection_id,p_confirmed:true});
  const simulated=await rpc(staff,'vet_issue_certificate',{p_id:testDraft.id});assert.equal(simulated.snapshot.signature.signed_content.test_only,true);
  const health=await rpc(staff,'vet_get_certificate_health',{p_certificate:testDraft.id});assert.notEqual(health.influenza.status,'valid');assert.equal(health.influenza.reason,'test_certificate');
  await staff.auth.signInWithPassword({email:'phase1.org-a-secretary@example.test',password:'phase1-password'});
  const pdfReply=await workerPost('certificate-pdf',{certificate_id:testDraft.id});assert.equal(pdfReply.status,200);assert.equal(Buffer.from(await pdfReply.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
  const anon=await browser.newContext();const verify=await anon.newPage();await verify.goto('http://127.0.0.1:5179/vet/verify/'+simulated.public_number);await verify.getByRole('heading',{name:'TEST — certificat simulé, sans valeur de preuve vaccinale',exact:true}).waitFor();await anon.close();
  await page.reload();await page.getByLabel('Émetteur',{exact:true}).selectOption(issuerId);
  await page.locator('.vet-list-item').filter({hasText:simulated.number.slice(-8)}).click();
  await page.getByRole('button',{name:'Actualiser l’état vaccinal du cheval',exact:true}).click();
  await page.getByRole('cell',{name:'Certificat TEST — ne constitue pas une preuve vaccinale',exact:true}).first().waitFor();
  assert.equal(await page.getByRole('cell',{name:'Certificat TEST — ne constitue pas une preuve vaccinale',exact:true}).count(),3);
  console.log('PASS local simulation UI: admin grants staff a fictitious authorization, TEST PDF issued, public status TEST, no recognized vaccination');
 }

 await page.getByRole('button',{name:'Nouveau brouillon',exact:true}).click();await page.getByRole('button',{name:'Enregistrer le brouillon',exact:true}).click();await page.getByRole('alert').filter({hasText:'Brouillon enregistré.'}).waitFor();
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Supprimer le brouillon',exact:true}).click();await page.getByRole('alert').filter({hasText:'Brouillon supprimé.'}).waitFor();
 console.log('PASS UI: draft deletion with confirmation');
 await page.getByRole('button',{name:'Déconnexion',exact:true}).click();
 await page.getByLabel('Courriel',{exact:true}).fill('phase1.org-a-secretary@example.test');await page.getByLabel('Mot de passe',{exact:true}).fill('phase1-password');await page.getByRole('button',{name:'Se connecter',exact:true}).click();
 await page.getByLabel('Émetteur',{exact:true}).selectOption(issuerId);


 await rpc(user,'vet_admin_save_issuer',{p_id:issuerId,p_name:'Pilote UI '+runId,p_kind:'clinic',p_contact_details:'Québec',p_status:'suspended'});
 assert.ok((await staff.rpc('vet_issue_certificate',{p_id:c.id})).error);
 await page.reload();await page.getByRole('heading',{name:'Certificats vétérinaires',exact:true}).waitFor();
 await page.waitForFunction(id=>![...document.querySelectorAll('option')].some(o=>o.value===id),issuerId);
 assert.deepEqual((await staff.from('vet_certificates').select('id').eq('issuer_id',issuerId)).data,[]);
 console.log('PASS UI/API: suspension invalidates current session access');
 assert.deepEqual(errors,[]);
 console.log('PASS: no browser runtime errors; no live OMVQ requests');
} finally {if(browser)await browser.close();server.kill('SIGTERM');}
