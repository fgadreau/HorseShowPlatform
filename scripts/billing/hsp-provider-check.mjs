// Read-only verification of the actual sandbox charge, HSP gross credit and application fee.
import {createClient} from '@supabase/supabase-js';import {readFileSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
assert.equal(process.env.BILLING_SUPABASE_URL,'http://127.0.0.1:54321');assert(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'));
const s=JSON.parse(readFileSync('.tmp/hsp-direct/integrated.json')),connect=JSON.parse(readFileSync('.tmp/hsp-direct/connect.json'));
const db=createClient(process.env.BILLING_SUPABASE_URL,process.env.BILLING_SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
async function stripe(path,account){const r=await fetch('https://api.stripe.com/v1'+path,{headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,...(account?{'Stripe-Account':account}:{})}});assert(r.ok,'Sandbox read failed');const x=await r.json();assert(x.livemode!==true);return x;}
assert.equal((await stripe('/account')).id,connect.platform);
const {data:attempts,error}=await db.from('billing_stripe_attempts').select('id,provider_id,charge_mode,connected_account,amount,application_fee_amount,state').eq('folio_id',s.folio).order('created_at');assert(!error);
const rows=[];for(const a of attempts){assert.equal(a.charge_mode,'direct');assert.equal(a.connected_account,connect.account);const pi=await stripe('/payment_intents/'+a.provider_id,a.connected_account);assert.equal(pi.status,'succeeded');assert.equal(pi.amount_received,Math.round(Number(a.amount)*100));assert.equal(pi.application_fee_amount,Math.round(Number(a.application_fee_amount)*100));assert(!pi.transfer_data);
 const c=await stripe('/charges/'+pi.latest_charge,a.connected_account);let fee=null;if(c.application_fee){fee=await stripe('/application_fees/'+c.application_fee);assert.equal(fee.account,a.connected_account);assert.equal(fee.charge,c.id);assert.equal(fee.amount,525);}
 const bt=await stripe('/balance_transactions/'+c.balance_transaction,a.connected_account);rows.push({attempt:a.id,paymentIntent:pi.id,amount:pi.amount_received/100,applicationFee:pi.application_fee_amount/100,applicationFeeId:fee?.id??null,connectedStripeProcessingFees:bt.fee_details.filter(f=>f.type==='stripe_fee').reduce((n,f)=>n+f.amount,0)/100,currency:pi.currency,state:pi.status});
}
assert.equal(rows.length,2);assert.equal(rows.reduce((n,r)=>n+r.applicationFee,0),5.25);assert.equal(rows.reduce((n,r)=>n+r.amount,0),509.25);
const result={complete:true,realStripeSandbox:true,rows,applicationFeeCollectedOnce:true,grossCredited:509.25,liveMoney:false};writeFileSync('.tmp/hsp-direct/provider-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
