import {assertKeptTotals} from './totals-pagination.test.mjs';
// Real local Supabase RPC/Storage; manual receipts are fictional, not Stripe payments.
import{assertPDFRows,assertPDFGroupHeaders}from'./pdf-row-coverage.mjs';
import{documentModel}from'../../server/billing/pdf.mjs';
import assert from 'node:assert/strict';import{createClient}from'@supabase/supabase-js';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';import{randomUUID,createHash}from'node:crypto';
assert.equal(process.env.BILLING_SUPABASE_URL,'http://127.0.0.1:54321');
const dir='.tmp/review-v5',file=dir+'/state.json',state=JSON.parse(readFileSync(file)),f=JSON.parse(readFileSync('.tmp/hsp-direct/fixture.json')),a=JSON.parse(readFileSync('.tmp/hsp-direct/access.local.json'));
const save=()=>writeFileSync(file,JSON.stringify(state,null,2));const clients={};
async function login(tail){if(clients[tail])return clients[tail];const c=createClient(process.env.BILLING_SUPABASE_URL,process.env.BILLING_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});const r=await c.auth.signInWithPassword({email:a.users.find(u=>u.id.endsWith(tail)).email,password:a.password});assert(!r.error,'Local login');return clients[tail]={c,token:r.data.session.access_token};}
async function rpc(tail,name,args){const{c}=await login(tail),r=await c.rpc(name,args);assert(!r.error,name+': '+r.error?.message);return r.data;}
async function durable(key,name,args){state.commands[key]??={name,args:{p_request_id:randomUUID(),...args}};save();const cmd=state.commands[key];return rpc('003',cmd.name,cmd.args);}
const stage=process.argv[2];
if(stage==='fund'){
 const worker=await fetch('http://127.0.0.1:54332/status');assert.equal(worker.headers.get('X-HSP-Document-Render'),'1,2,3,4,5','Restart the versioned document worker before creating review documents');
 for(const [name,c]of Object.entries(state.cases)){
  const refs=c.registration,lines=[];
  for(let i=0;i<16;i++){lines.push({p:0,h:0,cl:i,assignment:0,occ:'Matin / Morning',fee:'entry'});if(i%3===0)lines.push({p:2,h:0,cl:i,assignment:0,occ:'Matin / Morning',fee:'judge_class'});}
  lines.push({p:3,h:0,cl:12,assignment:0,occ:'Matin / Morning',fee:'judge_block'});
  // Same block, a genuinely separate occurrence; same labels on distinct blocks.
  lines.push({p:1,h:0,cl:12,assignment:0,occ:'Après-midi / Afternoon',fee:'entry'});
  lines.push({p:3,h:0,cl:12,assignment:0,occ:'Après-midi / Afternoon',fee:'judge_block'});
  for(const cl of [0,1,14])lines.push({p:0,h:1,cl,assignment:1,occ:'Matin / Morning',fee:'entry'});
  lines.push({p:2,h:1,cl:0,assignment:1,occ:'Matin / Morning',fee:'judge_class'});
  lines.push({p:1,h:1,cl:15,assignment:null,occ:'Matin / Morning',fee:'entry'});
  lines.push({p:4,presentation:{section:'reservation',reservation_id:'V4-STALL',period:'7–9 septembre / September 2026',duration:'3 nuits / nights'}});
  lines.push({p:5,presentation:{section:'other'}});
  for(let i=0;i<lines.length;i++){
   const key=name+'-sale-'+i;if(!state.commands[key]){const l=lines[i],sale={context_id:c.context,payer_customer_account_id:f.customer,product_id:f.products[l.p].id,quantity:1,source_id:randomUUID(),beneficiary_contact_id:f.contact,...(l.h===undefined?{}:{horse_id:f.horses[l.h]})};const q=await rpc('003','prepare_billing_operation_quote',{p_sale:sale});await durable(key,l.presentation?'add_documented_billing_sale':'add_documented_billing_entry_sale',{p_sale:{...sale,quote_id:q.quote_id},...(l.presentation?{p_presentation:l.presentation}:{p_class:refs.classes[l.cl],p_assignment:l.assignment===null?null:refs.assignments[l.assignment],p_occurrence:l.occ,p_fee_kind:l.fee})});}
   const result=await durable(key);c.folio=result.account.folio_id;save();
  }
  let d=await rpc('004','billing_ui_detail',{p_folio:c.folio,p_personal:true});assert.equal(d.charges.filter(x=>x.supplier==='hsp').length,1);assert.equal(d.presentation_version,5);
  const expected=lines.reduce((n,l)=>n+Math.round(Number(f.products[l.p].price??[100,75,20,30,120,25,10,5][l.p])*100),500)/100;
  assert.equal(Number(d.subtotal),expected);c.expectedSubtotal=expected;c.expectedTotal=Number(d.total);save();
  for(const [i,amount]of (name==='main'?[200]:[50]).entries()){
   const key=name+'-payment-'+i;if(!state.commands[key]){d=await rpc('003','billing_ui_detail',{p_folio:c.folio,p_personal:false});let remaining=amount;const allocations=d.charges.flatMap(c=>{const used=d.payments.flatMap(p=>p.allocations).filter(a=>a.charge_id===c.id).reduce((n,a)=>n+Math.round(a.amount*100),0);const portion=Math.min(Math.round(remaining*100),Math.round(c.total*100)-used)/100;remaining=Math.round((remaining-portion)*100)/100;return portion>0?[{charge_id:c.id,amount:portion}]:[];});assert.equal(remaining,0);await durable(key,'record_billing_payment',{p_payment:{folio_id:c.folio,version:d.checkout.version,amount,allocations,method:i?'cash':'etransfer',reference:'DEMO revue '+c.show+' '+i,received_at:new Date().toISOString(),confirmed:true}});}
   await durable(key);
  }
  d=await rpc('004','billing_ui_detail',{p_folio:c.folio,p_personal:true});assert.equal(Number(d.balance),Math.round((c.expectedTotal-200)*100)/100);assert.equal(d.payments.length,1);await rpc('003','billing_set_ready',{p_folio:c.folio,p_ready:true});
 }
 console.log('New version 5 demo account: confirmed bib references, one HSP fee and a simulated manual payment of 200.');
}else if(stage==='documents'){
 mkdirSync(dir+'/pdf',{recursive:true});const payer=await login('004'),other=await login('005');const files=[];let denied=0;
 const req=(who,action,id,locale='fr')=>fetch('http://127.0.0.1:54332/'+action,{method:'POST',headers:{Origin:'http://127.0.0.1:5173',Authorization:'Bearer '+who.token,'Content-Type':'application/json'},body:JSON.stringify({documentId:id,personal:true,locale})});
 for(const[name,c]of Object.entries(state.cases)){
  const d=await rpc('004','billing_ui_detail',{p_folio:c.folio,p_personal:true});assert.equal(d.state,'closed');assert.equal(d.balance,0);assert.equal(d.documents.filter(x=>x.kind==='invoice').length,1);assert.equal(d.payments.length,2);assert.equal(d.charges.filter(x=>x.supplier==='hsp').length,1);
  for(const doc of d.documents){assert.equal(doc.snapshot.render_version,5);assert(doc.snapshot.payments.every(p=>p.receipt_number));let status;
   for(let i=0;i<60;i++){const r=await req(payer,'status',doc.id);assert(r.ok);status=(await r.json()).state;if(status==='completed')break;await new Promise(r=>setTimeout(r,1000));}assert.equal(status,'completed');
   for(const locale of ['fr','en']){const r=await req(payer,'download',doc.id,locale);assert(r.ok);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'%PDF');const path=`${dir}/pdf/${name}-${doc.kind}-${doc.number??doc.id}-${locale}.pdf`;writeFileSync(path,bytes);const coverage=await assertPDFRows(bytes,documentModel(doc,locale),{exact:true});files.push({coverage,kept:await assertKeptTotals(bytes,documentModel(doc,locale)),headings:await assertPDFGroupHeaders(bytes,documentModel(doc,locale)),name,kind:doc.kind,id:doc.id,number:doc.number,locale,path,sha256:createHash('sha256').update(bytes).digest('hex')});}
   const r=await req(other,'download',doc.id);assert(!r.ok);assert.equal((await r.json()).error,'BILLING_FORBIDDEN');denied++;
  }
 }
 writeFileSync(dir+'/documents-results.json',JSON.stringify({complete:true,realLocalRPC:true,realStorageHTTP:true,manualPaymentsSimulated:true,newStripePayments:0,denied,files},null,2));console.log(JSON.stringify({complete:true,files:files.length,denied,realStorageHTTP:true,newStripePayments:0}));
}else throw Error('Use fund or documents');
