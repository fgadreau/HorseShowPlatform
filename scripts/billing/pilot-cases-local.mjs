// Additional fictitious cases, real local PostgreSQL / HTTP, real Stripe TEST only.
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {randomUUID,createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {stripeClient,testConfig} from '../../server/billing/stripe.mjs';
assert.equal(process.env.BILLING_SUPABASE_URL,'http://127.0.0.1:54321');
const config=testConfig(),stripe=stripeClient(config);
const fixture=JSON.parse(readFileSync('.tmp/billing-pilot/fixture.json'));
const access=JSON.parse(readFileSync('.tmp/billing-pilot/access.local.json'));
const file='.tmp/billing-pilot/cases.json';const state=existsSync(file)?JSON.parse(readFileSync(file)):{cases:{},passed:[],complete:false};
const save=()=>writeFileSync(file,JSON.stringify(state,null,2),{mode:0o600});
async function login(tail){const c=createClient(process.env.BILLING_SUPABASE_URL,process.env.BILLING_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const r=await c.auth.signInWithPassword({email:access.users.find(x=>x.id.endsWith(tail)).email,password:access.password});assert(!r.error);return {c,token:r.data.session.access_token};}
const payer=await login('004'),staff=await login('003');
const rpc=async(w,n,a)=>{const r=await w.c.rpc(n,a);if(r.error)throw Error(r.error.message);return r.data;};
const payment=async(body)=>{const r=await fetch('http://127.0.0.1:54331/payment',{method:'POST',headers:{Origin:'http://127.0.0.1:5173',Authorization:'Bearer '+payer.token,'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);return d;};
const detail=folio=>rpc(payer,'billing_ui_detail',{p_folio:folio,p_personal:true});
function sql(q){assert(!process.env.DOCKER_HOST||process.env.DOCKER_HOST.startsWith('unix://'));assert(execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'}).trim().startsWith('unix://'));return execFileSync('docker',['exec','-i','supabase_db_hsp-vet-local','psql','-X','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
async function createCase(name){
 if(state.cases[name]?.folio)return state.cases[name];
 const c=state.cases[name]??={contact:randomUUID(),saleKey:randomUUID(),source:randomUUID(),beginKey:randomUUID()};save();
 assert.equal(sql(`select name from public.organizations where id='${fixture.org}'`),'HSP DÉMONSTRATION — sans valeur comptable ou fiscale');
 sql(`insert into public.contacts(id,type,first_name,last_name,linked_user_id) values('${c.contact}','owner','Cas fictif','${name}','20000000-0000-0000-0000-000000000004') on conflict do nothing; insert into public.directory_contacts(organization_discipline_id,contact_id) values('fa700000-0000-0000-0000-000000000001','${c.contact}') on conflict do nothing;`);
 c.customer=await rpc(staff,'billing_get_customer_account',{p_org:fixture.org,p_contact:c.contact,p_context:fixture.context});save();
 const sale=await rpc(staff,'add_billing_sale',{p_request_id:c.saleKey,p_sale:{context_id:fixture.context,payer_customer_account_id:c.customer,product_id:fixture.products[0].id,quantity:1,source_id:c.source}});c.folio=sale.account.folio_id;save();return c;
}
const stage=process.argv[2],name=process.argv[3];
if(stage==='prepare'){
 assert(['cancel','decline','authentication','lost','staff-first','documents','manual-lost'].includes(name));const c=await createCase(name);console.log(JSON.stringify({case:name,folio:c.folio}));
}else if(stage==='cancel'){
 const c=await createCase('cancel');const first=await payment({action:'begin',folio_id:c.folio,amount:'10',request_id:c.beginKey});c.firstAttempt=first.attempt_id;save();
 const canceled=await payment({action:'cancel',attempt_id:c.firstAttempt});assert.equal(canceled.state,'canceled');assert.equal((await detail(c.folio)).payments.length,0);
 c.nextKey??=randomUUID();save();const next=await payment({action:'begin',folio_id:c.folio,amount:'10',request_id:c.nextKey});assert.notEqual(next.attempt_id,c.firstAttempt);c.attempt=next.attempt_id;save();state.passed.push('Actual Stripe cancellation confirmed, same amount, distinct new attempt, no payment from canceled intent');save();console.log('Cancellation and fresh same-amount attempt verified in Stripe TEST');
}else if(stage==='staff-prepare'){
 const c=await createCase('staff-first');let d=await detail(c.folio);
 if(!c.manual){c.manual={p_request_id:randomUUID(),p_payment:{folio_id:c.folio,version:d.checkout.version,amount:105,method:'cash',confirmed:true,reference:'DEMONSTRATION - manual simulated',received_at:new Date().toISOString(),allocations:d.charges.map(x=>({charge_id:x.id,amount:x.total}))}};save();}
 await rpc(staff,'record_billing_payment',c.manual);await rpc(staff,'billing_set_ready',{p_folio:c.folio,p_ready:true});console.log('Simulated manual payment and readiness recorded for secretary/payer race');
}else if(stage==='cancel-declined'){
 const c=state.cases.decline;const d=await detail(c.folio);assert.equal(d.payments.length,0);assert.equal(d.stripe.attempt.state,'requires_payment_method');const canceled=await payment({action:'cancel',attempt_id:d.stripe.attempt.id});assert.equal(canceled.state,'canceled');state.passed.push('Declined test card has no payment; explicit server cancellation releases reservation');save();console.log('Declined-card attempt canceled by server, no payment');
}else if(stage==='check'){
 const c=state.cases[name];const d=await detail(c.folio);c.latest={state:d.state,balance:d.balance,payments:d.payments.length,documents:d.documents.map(x=>({id:x.id,kind:x.kind,number:x.number})),attempt:d.stripe.attempt};save();console.log(JSON.stringify({case:name,...c.latest}));
}else if(stage==='delayed'){
 const c=await createCase('lost');c.attempt=(await payment({action:'begin',folio_id:c.folio,amount:'10',request_id:c.beginKey})).attempt_id;save();
 // The listener PID is supplied from the verified, owned local process registry by the caller.
 const pid=JSON.parse(readFileSync('.tmp/billing-pilot/processes.json')).find(p=>p.name==='listener').pid;assert(Number.isInteger(pid)&&pid>1);const processName=execFileSync('ps',['-p',String(pid),'-o','args='],{encoding:'utf8'});assert(/(?:listen-webhooks|pilot-listener-local)\.mjs/.test(processName));
 const rows=execFileSync('ps',['-eo','pid=,ppid='],{encoding:'utf8'}).trim().split('\n').map(l=>l.trim().split(/\s+/).map(Number));const children=[];function descend(parent){for(const [id,ppid] of rows)if(ppid===parent){descend(id);children.push(id);}}descend(pid);assert(children.length>=1);for(const child of children)process.kill(child,'SIGSTOP');process.kill(pid,'SIGSTOP');
 try{
  const id=sql(`select provider_id from public.billing_stripe_attempts where id='${c.attempt}'`);assert(/^pi_/.test(id));
  const pi=await stripe(`/payment_intents/${id}/confirm`,{payment_method:'pm_card_visa'},`hsp-pilot-confirm-${c.attempt}`);assert.equal(pi.livemode,false);assert.equal(pi.status,'succeeded');
  // Real test charge confirmed while delivery is deliberately paused; browser return is omitted.
  c.provider=id;c.providerStatus=pi.status;save();const uncertain=await detail(c.folio);assert.equal(uncertain.payments.length,0);assert.equal(uncertain.stripe.attempt.resolved,false);const statement=await rpc(staff,'get_billing_statement',{p_folio:c.folio,p_request_id:randomUUID()});await assert.rejects(rpc(staff,'finalize_billing_folio',{p_folio:c.folio,p_request_id:randomUUID(),p_version:statement.account.version,p_statement_id:statement.document_id}),/BILLING_PENDING_PAYMENT/);state.passed.push('Listener delivery deliberately paused: real confirmed Stripe payment still uncertain in HSP; staff closure refused');save();
  const a=await payment({action:'resume',attempt_id:c.attempt});assert.equal(a.state,'succeeded');
  const before=await detail(c.folio);assert.equal(before.payments.length,1);const retry=await payment({action:'resume',attempt_id:c.attempt});assert.equal(retry.state,'succeeded');const after=await detail(c.folio);assert.equal(after.payments.length,1);assert.equal(after.documents.filter(x=>x.kind==='receipt').length,1);
  const events=await stripe('/events?type=payment_intent.succeeded&limit=30');const event=events.data.find(e=>e.data.object.id===id);assert(event);const raw=JSON.stringify(event),time=Math.floor(Date.now()/1000),sig=createHmac('sha256',config.webhook).update(`${time}.${raw}`).digest('hex');
  for(let i=0;i<2;i++){const r=await fetch('http://127.0.0.1:54331/webhook',{method:'POST',headers:{'Content-Type':'application/json','Stripe-Signature':`t=${time},v1=${sig}`},body:raw});assert(r.ok);}
  assert.equal((await detail(c.folio)).payments.length,1);state.passed.push('Real Stripe API payment; repeated server resolution and injected duplicate delivery of actual Stripe event: one payment / receipt');save();console.log('Actual Stripe payment and duplicate delivery verified');
 }finally{process.kill(pid,'SIGCONT');for(const child of children)process.kill(child,'SIGCONT');}
}else throw Error('Unknown stage');
