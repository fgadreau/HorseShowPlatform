// Real PostgreSQL disposable clone. No remote URLs, no persistent financial mutations.
import {execFile,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
assert.equal(process.argv.length,2);
assert(!process.env.DOCKER_HOST||process.env.DOCKER_HOST.startsWith('unix://'));
assert(execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'}).trim().startsWith('unix://'));
const container='supabase_db_hsp-vet-local',db=`hsp_direct_test_${process.pid}`;
const docker=(args,options={})=>execFileSync('docker',['exec','-i',container,...args],{maxBuffer:256*1024*1024,...options});
const sql=q=>docker(['psql','-X','-U','supabase_admin','-d',db,'-Atq','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
let count=0,rejections=0,created=false;
const check=(v)=>{assert(v);count++;};
const auth="set role authenticated;set request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';";
const call=(name,args)=>JSON.parse(sql(auth+`select public.${name}(${args})`));
const reject=(q,code)=>{try{sql(auth+q);}catch(e){assert(String(e.stderr).includes(code),String(e.stderr));rejections++;return;}throw Error('Expected '+code);};
mkdirSync('.tmp/hsp-direct',{recursive:true});
let result={complete:false,realPostgres:true};
try{
 docker(['createdb','-U','postgres',db]);created=true;
 sql(docker(['pg_dump','-U','postgres','--format=plain','postgres']));
 for(const file of ['20260907000100_billing_hsp_prototype.sql','20260907000200_billing_hsp_direct.sql','20260907000300_billing_hsp_reporting.sql']){
  const version=file.split('_')[0];
  if(sql(`select count(*) from supabase_migrations.schema_migrations where version='${version}'`)==='0')sql(readFileSync('supabase/migrations/'+file,'utf8'));
 }
 check(sql("select count(*) from billing_hsp_policies h join billing_contexts c on c.id=h.context_id where c.organization_id<>'fb300000-0000-0000-0000-000000000001'")==='0');
 execFileSync(process.execPath,['scripts/billing/hsp-fixture-local.mjs'],{env:{...process.env,HSP_FIXTURE_DB:db},stdio:['ignore','pipe','pipe']});
 const f=JSON.parse(readFileSync('.tmp/hsp-direct/sql-fixture.json'));
 const sale={context_id:f.context,payer_customer_account_id:f.customer,product_id:f.products[4].id,quantity:1,source_id:randomUUID()};
 const q=call('prepare_billing_operation_quote',quote(JSON.stringify(sale)));
 check(q.lines.length===2&&Number(q.total)===131.25);
 check(sql(`select count(*) from billing_folios where billing_context_id='${f.context}'`)==='0');
 reject(`select add_billing_sale('${randomUUID()}',${quote(JSON.stringify(sale))});`,'BILLING_QUOTE_REQUIRED');
 const command={...sale,quote_id:q.quote_id},id=randomUUID();
 const r=call('add_billing_sale',`'${id}',${quote(JSON.stringify(command))}`),folio=r.account.folio_id;
 check(r.account.charges.length===2&&Number(r.account.total)===131.25);
 check(r.account.suppliers.hsp.tax_number_1==='DEMO-HSP-TAX');
 check(r.account.charges.filter(c=>c.supplier==='hsp').length===1);
 check(JSON.stringify(r)===JSON.stringify(call('add_billing_sale',`'${id}',${quote(JSON.stringify(command))}`)));
 reject(`select add_billing_sale('${id}',${quote(JSON.stringify({...command,quantity:2}))});`,'BILLING_IDEMPOTENCY_CONFLICT');
 const next={...sale,source_id:randomUUID()},q2=call('prepare_billing_operation_quote',quote(JSON.stringify(next)));
 check(q2.lines.length===1&&Number(q2.total)===126);
 call('add_billing_sale',`'${randomUUID()}',${quote(JSON.stringify({...next,quote_id:q2.quote_id}))}`);
 check(sql(`select count(*) from billing_charges where folio_id='${folio}' and source_type='hsp_service'`)==='1');
 reject(`select add_billing_sale('${randomUUID()}',${quote(JSON.stringify({...next,quote_id:q2.quote_id}))});`,'BILLING_STALE_QUOTE');
 const report=call('get_billing_hsp_remittances',`'${f.context}'`);check(Number(report.rows[0].collected)===0&&report.settlement_supported===false);
 reject(`select billing_hsp_adopt('${f.context}','${f.products[7].id}','{}','fake');`,'permission denied');
 // Provider objects below are simulated; all financial transactions run in real PostgreSQL.
 sql(`set role service_role;select billing_stripe_configure_direct('${f.org}','acct_testplatform','acct_testdirect');`);
 const payer="set role authenticated;set request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';";
 const begin=(amount)=>JSON.parse(sql(payer+`select begin_billing_stripe_attempt('${randomUUID()}','${folio}',${amount})`)).attempt_id;
 const first=begin(100);
 check(Number(call('get_billing_hsp_remittances',`'${f.context}'`).rows[0].reserved)===5.25);
 check(sql(`select charge_mode||':'||application_fee_amount from billing_stripe_attempts where id='${first}'`)==='direct:5.25');
 const pi={id:'pi_hspfirst',object:'payment_intent',livemode:false,status:'succeeded',currency:'cad',amount:10000,amount_received:10000,capture_method:'automatic',hsp_verified_account:'acct_testdirect',application_fee_amount:525};
 const observe=(id,obj)=>JSON.parse(sql(`set role service_role;select billing_stripe_observe('${id}','acct_testplatform',${quote(JSON.stringify(obj))})`));
 const paid=observe(first,pi);check(paid.state==='succeeded');check(observe(first,pi).receipt_id===paid.receipt_id);
 check(sql(`select count(*) from billing_payments where folio_id='${folio}'`)==='1');
 const second=begin(157.25);check(sql(`select application_fee_amount from billing_stripe_attempts where id='${second}'`)==='0.00');
 const fee={id:'fee_hspfirst',object:'application_fee',livemode:false,account:'acct_testdirect',currency:'cad',amount:525};
 sql(`set role service_role;select billing_hsp_confirm_fee('${first}',${quote(JSON.stringify(fee))});select billing_hsp_confirm_fee('${first}',${quote(JSON.stringify(fee))});`);
 check(sql(`select count(*) from billing_hsp_recoveries where folio_id='${folio}'`)==='1');
 observe(second,{...pi,id:'pi_hspsecond',amount:15725,amount_received:15725,application_fee_amount:0});
 const after=call('get_billing_hsp_remittances',`'${f.context}'`);check(Number(after.rows[0].collected)===5.25&&Number(after.rows[0].remaining)===0);
 const statement=call('get_billing_statement',`'${randomUUID()}','${folio}'`);
 check(statement.document.snapshot.suppliers.hsp.tax_number_1==='DEMO-HSP-TAX');
 const invoice=call('finalize_billing_folio',`'${randomUUID()}','${folio}',${statement.account.version},'${statement.document_id}'`);
 check(invoice.document.kind==='invoice'&&invoice.document.snapshot.charges.some(c=>c.supplier==='hsp'));
 sql(`set role service_role;select billing_provider_flag('${first}','ch_external','external_refund');`);
 check(sql(`select count(*) from billing_provider_anomalies where folio_id='${folio}'`)==='1');
 check(sql(`select state from billing_folios where id='${folio}'`)==='closed');
 check(sql(`select count(*) from billing_documents where folio_id='${folio}' and kind='invoice'`)==='1');
 // Two real independent PostgreSQL sessions race on the first billable operation.
 const newCustomer=tail=>{
  const contact=`fc600000-0000-0000-0000-00000000000${tail}`;
  sql(`insert into contacts(id,type,first_name,last_name) values('${contact}','owner','Concurrent','DEMO ${tail}');insert into directory_contacts(organization_discipline_id,contact_id) values('fc700000-0000-0000-0000-000000000001','${contact}');`);
  return sql(auth+`select billing_get_customer_account('${f.org}','${contact}')`);
 };
 const customer2=newCustomer(2),raceSale={...sale,payer_customer_account_id:customer2},raceCommands=[];
 for(let i=0;i<2;i++){const cmd={...raceSale,source_id:randomUUID()};const q=call('prepare_billing_operation_quote',quote(JSON.stringify(cmd)));raceCommands.push({...cmd,quote_id:q.quote_id});}
 const concurrent=cmd=>promisify(execFile)('docker',['exec','-i',container,'psql','-X','-U','supabase_admin','-d',db,'-Atq','-v','ON_ERROR_STOP=1','-c',auth+`select add_billing_sale('${randomUUID()}',${quote(JSON.stringify(cmd))})`]);
 const race=await Promise.allSettled(raceCommands.map(concurrent));
 check(race.filter(x=>x.status==='fulfilled').length===1);check(race.filter(x=>x.status==='rejected'&&String(x.reason.stderr).includes('BILLING_STALE_QUOTE')).length===1);rejections++;
 const lost=race.findIndex(x=>x.status==='rejected'),retrySale={...raceCommands[lost]};delete retrySale.quote_id;
 const fresh=call('prepare_billing_operation_quote',quote(JSON.stringify(retrySale)));check(fresh.lines.length===1);
 const retryResult=call('add_billing_sale',`'${randomUUID()}',${quote(JSON.stringify({...retrySale,quote_id:fresh.quote_id}))}`);
 check(retryResult.account.charges.filter(x=>x.supplier==='hsp').length===1);check(retryResult.account.charges.length===3);
 // An abandoned preview does not create an account or an HSP assessment.
 const customer3=newCustomer(3),manualSale={...sale,payer_customer_account_id:customer3,source_id:randomUUID()};
 const mq=call('prepare_billing_operation_quote',quote(JSON.stringify(manualSale)));
 check(sql(`select count(*) from billing_folios where payer_customer_account_id='${customer3}'`)==='0');
 const mr=call('add_billing_sale',`'${randomUUID()}',${quote(JSON.stringify({...manualSale,quote_id:mq.quote_id}))}`),mf=mr.account.folio_id;
 const allocations=mr.account.charges.map(c=>({charge_id:c.id,amount:c.total}));
 const paymentId=randomUUID(),payment={folio_id:mf,version:mr.account.version,received_at:new Date().toISOString(),confirmed:true,amount:131.25,method:'cash',reference:'DEMO manual',allocations};
 const paidManual=call('record_billing_payment',`'${paymentId}',${quote(JSON.stringify(payment))}`);
 check(JSON.stringify(paidManual)===JSON.stringify(call('record_billing_payment',`'${paymentId}',${quote(JSON.stringify(payment))}`)));
 const ms=call('get_billing_statement',`'${randomUUID()}','${mf}'`);
 const mi=call('finalize_billing_folio',`'${randomUUID()}','${mf}',${ms.account.version},'${ms.document_id}'`);
 check(Number(mi.account.balance)===0&&mi.account.charges.length===2);
 const manualReport=call('get_billing_hsp_remittances',`'${f.context}'`).rows.find(x=>x.folio_id===mf);
 check(Number(manualReport.collected_subtotal)===5&&Number(manualReport.collected_tax_amount)===.25&&Number(manualReport.reserved)===0);
 check(Number(manualReport.collected)===5.25&&Number(manualReport.remitted)===0&&Number(manualReport.remaining)===5.25);
 const customer4=newCustomer(4),partialSale={...sale,payer_customer_account_id:customer4,source_id:randomUUID()};
 const pq=call('prepare_billing_operation_quote',quote(JSON.stringify(partialSale)));
 const pr=call('add_billing_sale',`'${randomUUID()}',${quote(JSON.stringify({...partialSale,quote_id:pq.quote_id}))}`);
 const hsp=pr.account.charges.find(c=>c.supplier==='hsp');
 call('record_billing_payment',`'${randomUUID()}',${quote(JSON.stringify({folio_id:pr.account.folio_id,version:pr.account.version,amount:2,method:'cash',confirmed:true,received_at:new Date().toISOString(),reference:'DEMO partial HSP allocation only',allocations:[{charge_id:hsp.id,amount:2}]}))}`);
 const partial=call('get_billing_hsp_remittances',`'${f.context}'`).rows.find(r=>r.folio_id===pr.account.folio_id);
 check(Number(partial.collected)===2&&Number(partial.remaining)===2);check(partial.collected_subtotal===null&&partial.collected_tax_amount===null&&partial.allocation_status==='partial_tax_allocation_unapproved');
 result={complete:true,realPostgres:true,providerObjects:"simulated",assertions:count,expectedRejections:rejections};
 console.log(JSON.stringify(result));
}catch(e){result={...result,assertions:count,expectedRejections:rejections,error:String(e.stderr??e.message)};console.error(result.error);process.exitCode=1;}
finally{if(created)docker(['dropdb','-U','postgres','--force',db]);writeFileSync('.tmp/hsp-direct/server-results.json',JSON.stringify(result,null,2));}
