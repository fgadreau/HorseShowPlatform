// Creates only a NEW fictitious test account. Never updates an existing account.
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
assert.equal(process.argv.length,2);assert(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'));
const dir='.tmp/hsp-direct';mkdirSync(dir,{recursive:true});const path=dir+'/connect.json';
const state=existsSync(path)?JSON.parse(readFileSync(path)):{key:'hsp-direct-demo-'+randomUUID()};
const save=()=>writeFileSync(path,JSON.stringify(state,null,2),{mode:0o600});save();
async function stripe(path,params){const r=await fetch('https://api.stripe.com/v1'+path,{method:params?'POST':'GET',headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,'Stripe-Version':'2024-06-20',...(params?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':state.key}:{})},body:params?new URLSearchParams(params):undefined});const v=await r.json();if(!r.ok)throw Error('STRIPE_TEST_ACCOUNT_CONFIGURATION:'+String(v.error?.code??r.status));assert(v.livemode!==true);return v;}
const platform=await stripe('/account');
if(state.platform)assert.equal(state.platform,platform.id);else{state.platform=platform.id;save();}
let account=await stripe(state.account?'/accounts/'+state.account:'/accounts',state.account?undefined:{country:'CA','controller[fees][payer]':'account','controller[losses][payments]':'stripe','controller[requirement_collection]':'stripe','controller[stripe_dashboard][type]':'full','business_profile[name]':'HSP Direct DEMONSTRATION fictive','business_profile[product_description]':'Entirely fictitious horse show sandbox prototype. No real transactions.','metadata[hsp_demo]':'true'});
state.account=account.id;save();
if(!account.capabilities?.card_payments){const previous=state.key;state.key+='-card-capability';account=await stripe('/accounts/'+state.account,{'capabilities[card_payments][requested]':'true'});state.key=previous;}
state.configuration={fees:account.controller?.fees?.payer,losses:account.controller?.losses?.payments,dashboard:account.controller?.stripe_dashboard?.type,charges_enabled:account.charges_enabled,payouts_enabled:account.payouts_enabled,capabilities:account.capabilities};save();
assert.equal(state.configuration.fees,'account');assert.equal(state.configuration.losses,'stripe');assert.equal(state.configuration.dashboard,'full');
console.log(JSON.stringify({testOnly:true,platform:state.platform,account:state.account,configuration:state.configuration}));
