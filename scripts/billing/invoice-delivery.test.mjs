import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {documentTaxes,registrationValue} from '../../src/features/finance/documentPresentation.mjs';
import {invoiceBody} from '../../server/billing/invoice-html.mjs';
import {createInvoicePdfHandler} from '../../server/billing/invoice-pdf.mjs';
import {PREPROD_REF,PREPROD_ORIGIN} from '../../server/billing/hosted-core.mjs';
const id='11111111-1111-4111-8111-111111111111';
const env={VITE_DEPLOY_ENV:'staging',VITE_SUPABASE_PROJECT_REF:PREPROD_REF,VITE_SUPABASE_URL:`https://${PREPROD_REF}.supabase.co`,VITE_PRODUCTION_SUPABASE_PROJECT_REF:'other',VITE_SUPABASE_ANON_KEY:'public-test',VERCEL_GIT_COMMIT_REF:'preprod'};
const charge=(base,tax)=>({subtotal:base,taxes:[{name:'TPS + TVQ',rate:14.975,code:'COMBINED',amount:tax}]});
test('historical combined tax is split without modifying stored amounts, including rounding and credits',()=>{
 for(const [base,tax] of [[200,29.95],[57,8.54],[66.67,9.98],[44,6.59],[5,.75],[.1,.01],[-.1,-.01]]){
  const c=charge(base,tax),original=structuredClone(c),taxes=documentTaxes(c);
  assert.equal(Math.round(taxes.reduce((n,t)=>n+t.amount,0)*100),Math.round(tax*100));assert.deepEqual(c,original);
  assert.equal(taxes[0].name,'TPS');assert.equal(taxes[1].name,'TVQ');assert.equal(taxes[0].rate,5);assert.equal(taxes[1].rate,9.975);
 }
 assert.equal(documentTaxes(charge(.1,.01)).at(-1).name,'Arrondi historique');
 const separate={taxes:[{name:'GST',code:'GST',rate:5,amount:5},{name:'QST',code:'QST',rate:9.975,amount:9.98}]};assert.deepEqual(documentTaxes(separate,'en'),separate.taxes);
 assert.deepEqual(documentTaxes({subtotal:100,taxes:[{name:'HST',code:'HST',rate:13,amount:13}]}),[{name:'HST',code:'HST',rate:13,amount:13}]);
});
test('only explicit fixture registration numbers are masked; real values and unknown historical values are preserved',()=>{
 for(const number of ['DEMO-ASSO-NON-VALIDE','000000000002222222'])assert.equal(registrationValue({tax_number_1:number},1),'Donnée de test — non valide');
 for(const number of ['123456789RT0001','1234567890TQ0001','historical-unverified'])assert.equal(registrationValue({tax_number_1:number},1),number);
});
const document={id,kind:'invoice',number:'INV-001',created_at:'2026-10-26T12:00:00Z',snapshot:{account_number:'ACC-1',currency:'CAD',context:{name_fr:'Concours',name_en:'Show'},payer:{first_name:'<script>alert(1)</script>'},suppliers:{association:{name:'Association <img src=x onerror=alert(1)>',tax_number_1:'123456789RT0001'}},charges:[{...charge(200,29.95),id:'c',description:'<img src=x>',quantity:1,unit_price:200,tax_amount:29.95,total:229.95}],payments:[],subtotal:200,tax_amount:29.95,total:229.95,received:0,balance:229.95}};
test('shared invoice template escapes every supplied identity and description and removes the combined rate',()=>{
 const html=invoiceBody(document,'fr');assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('14.975'));assert(!html.includes('14,975'));assert(html.includes('TPS (5 %)'));assert(html.includes('TVQ (9,975 %)'));assert(html.includes('INV-001'));
});
async function request(handler,{body={documentId:id,locale:'fr',personal:false},headers={},method='POST'}={}){
 const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method=method;req.headers={origin:PREPROD_ORIGIN,authorization:'Bearer user-token',...headers};
 const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(value){this.body=value;}};await handler(req,res);return res;
}
function setup({authorized=true,found=document,validUser=true,overrideEnv={}}={}){
 const calls=[];let renders=0;
 const handler=createInvoicePdfHandler({env:{...env,...overrideEnv},clientFactory:(url,key,options)=>{assert.equal(key,'public-test');assert.equal(options.global.headers.Authorization,'Bearer user-token');return {auth:{getUser:async()=>({data:{user:validUser?{id:'staff'}:null}})},rpc:async(name,args)=>{calls.push({name,args});return name==='billing_pdf_status'?{error:authorized?null:{message:'forbidden'}}:{data:found,error:null};}};},render:async(d,l)=>{renders++;assert.equal(d,found);assert.equal(l,'fr');return Buffer.from('%PDF-fixture');}});
 return {handler,calls,get renders(){return renders;}};
}
test('delivery authorizes scope and document with caller token before rendering; never accepts browser HTML or amounts',async()=>{
 const f=setup();const res=await request(f.handler);assert.equal(res.statusCode,200);assert.equal(res.headers['Content-Type'],'application/pdf');assert.match(res.headers['Cache-Control'],/no-store/);assert.equal(f.renders,1);assert.deepEqual(f.calls.map(c=>c.name),['billing_pdf_status','get_billing_document']);
 assert.equal((await request(f.handler,{body:{documentId:id,locale:'fr',personal:false,html:'<p>fake invoice</p>'}})).statusCode,400);assert.equal(f.renders,1);
});
test('unauthorized, cross-account, missing, malformed and wrong-environment requests never launch Chromium',async()=>{
 for(const options of [{authorized:false},{found:null},{validUser:false},{found:{...document,id:'other'}},{overrideEnv:{VITE_DEPLOY_ENV:'production'}},{overrideEnv:{VITE_PRODUCTION_SUPABASE_PROJECT_REF:PREPROD_REF}}]){const f=setup(options);assert.notEqual((await request(f.handler)).statusCode,200);assert.equal(f.renders,0);}
 const f=setup();for(const options of [{headers:{origin:'https://evil.example'}},{headers:{authorization:''}},{method:'GET'},{body:{documentId:'bad',locale:'fr',personal:false}},{body:{documentId:id,locale:'xx',personal:false}}])assert.notEqual((await request(f.handler,options)).statusCode,200);assert.equal(f.renders,0);
});
