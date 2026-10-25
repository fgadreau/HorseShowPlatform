// Explicit local setup using an existing Stripe TEST Express account. Never run by a migration.
import {createClient} from '@supabase/supabase-js';
import {localUrl} from './local-server.mjs';
import {testConfig,stripeClient,rpc} from './stripe.mjs';
const [org,connected]=process.argv.slice(2);
if(!/^[a-f0-9-]{36}$/i.test(org??'')||!/^acct_[A-Za-z0-9]+$/.test(connected??''))throw Error('Usage: configure-test.mjs organization_uuid existing_test_express_account');
const url=localUrl(process.env.BILLING_SUPABASE_URL??'http://127.0.0.1:54321');
const key=process.env.BILLING_SUPABASE_SERVICE_ROLE_KEY;if(!key)throw Error('BILLING_LOCAL_KEYS_REQUIRED');
const stripe=stripeClient(testConfig()),platform=await stripe('/account'),account=await stripe(`/accounts/${connected}`);
if(account.type!=='express'||account.id!==connected||!account.charges_enabled)throw Error('BILLING_PROVIDER_ACCOUNT');
await rpc(createClient(url,key,{auth:{persistSession:false}}),'billing_stripe_configure',{p_org:org,p_platform:platform.id,p_connected:connected,p_enabled:true});
console.log('Stripe TEST mapping enabled for the explicitly selected local association.');
