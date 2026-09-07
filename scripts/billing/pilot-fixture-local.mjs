// Fictitious, additive fixture; guarded local Docker only. Existing fixtures are preserved.
import {execFileSync} from 'node:child_process';import {writeFileSync,readFileSync} from 'node:fs';import assert from 'node:assert/strict';
assert(!process.env.DOCKER_HOST||process.env.DOCKER_HOST.startsWith('unix://'));assert(execFileSync('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'],{encoding:'utf8'}).trim().startsWith('unix://'));
const sql=q=>execFileSync('docker',['exec','-i','supabase_db_hsp-vet-local','psql','-X','-U','supabase_admin','-d','postgres','-Atq','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
assert.equal(sql("select count(*) from auth.users where email not like '%@example.test'"),'0');
const org='fa300000-0000-0000-0000-000000000001',show='fa400000-0000-0000-0000-000000000001',contact='fa600000-0000-0000-0000-000000000001',discipline='fa700000-0000-0000-0000-000000000001';
const products=[['Inscription fictive Open L4',100],['Inscription fictive Open L2',75],['Juges fictifs par classe',20],['Juges fictifs du bloc',30],['Stalle simulée',120],['Casquette fictive',25],['Frais supplémentaire fictif',10]].map(([name,price],i)=>({id:`fa500000-0000-0000-0000-00000000000${i+1}`,name,price}));
const horses=['fa800000-0000-0000-0000-000000000001','fa800000-0000-0000-0000-000000000002'];
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
sql(`begin;
insert into public.organizations(id,name,slug,currency) values('${org}','HSP DÉMONSTRATION — sans valeur comptable ou fiscale','hsp-pilot-fictif','CAD') on conflict(id) do nothing;
insert into public.organization_members(organization_id,user_id,role) values('${org}','20000000-0000-0000-0000-000000000002','admin'),('${org}','20000000-0000-0000-0000-000000000003','secretary') on conflict do nothing;
insert into public.contacts(id,type,first_name,last_name,company_name,address,linked_user_id) values('${contact}','owner','Alex','Démonstration','Entreprise entièrement fictive','123 rue Exemple — données fictives','20000000-0000-0000-0000-000000000004') on conflict(id) do nothing;
insert into public.organization_disciplines(id,organization_id,discipline_id) select '${discipline}','${org}',id from public.disciplines order by id limit 1 on conflict do nothing;
insert into public.directory_contacts(organization_discipline_id,contact_id) values('${discipline}','${contact}') on conflict do nothing;
${horses.map((h,i)=>`insert into public.horses(id,name,primary_owner_contact_id) values('${h}','${i?'Demo Silver Star':'Great Holly Whiz — DEMO'}','${contact}') on conflict(id) do nothing;`).join('\n')}
${horses.map(h=>`insert into public.directory_horses(organization_discipline_id,horse_id) values('${discipline}','${h}') on conflict do nothing;`).join('\n')}
insert into public.shows(id,organization_id,name,slug,start_date,end_date,default_currency) values('${show}','${org}','Concours fictif intégré — HSP','hsp-pilot-integre','2026-09-07','2026-09-09','CAD') on conflict(id) do nothing;
${products.map(p=>`insert into public.organization_products(id,organization_id,name,category,default_price,tax_applicable) values('${p.id}','${org}',${q(p.name)},'merch',${p.price},false) on conflict(id) do nothing;`).join('\n')}
commit;`);
const config={name_fr:'Compte du concours — DÉMONSTRATION',name_en:'Show account — DEMONSTRATION',account_prefix:'DEMO-ACC',receipt_prefix:'DEMO-RCPT',invoice_prefix:'DEMO-INV',closing_policy:'manual',payment_policy:'received_only',activation_policy:'allocated_received',categories:['merch'],staff_roles:['admin','secretary']};
let context=sql(`select id from public.billing_contexts where show_id='${show}'`);
if(!context){context=sql(`set role authenticated;set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';select public.billing_create_context('${org}','${show}',null,null,'CAD',${q(JSON.stringify(config))},now()-interval '1 day',null,${q(JSON.stringify(products.map(p=>({product_id:p.id,unit_price:p.price,taxes:[{code:'DEMO',name:'Taxe fictive 5 %',jurisdiction:'DEMO ONLY',rate:5}]}))))});`);
 sql(`set role authenticated;set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';select public.billing_set_capabilities('${org}',null,true,true,true);select public.billing_set_capabilities('${org}','${context}',true,true,true,true,2026);`);
}
const customer=sql(`set role authenticated;set request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';select public.billing_get_customer_account('${org}','${contact}');`);
writeFileSync('.tmp/billing-pilot/fixture.json',JSON.stringify({org,show,context,customer,contact,horses,products},null,2));
const password=readFileSync('supabase/seed.sql','utf8').match(/crypt\('([^']+)'/)[1];
const users=JSON.parse(sql("select json_agg(json_build_object('id',id,'email',email)) from auth.users"));
writeFileSync('.tmp/billing-pilot/access.local.json',JSON.stringify({password,users},null,2),{mode:0o600});
console.log('Fictitious association, show, payer, horses and catalog ready; login details saved only in ignored local file.');
