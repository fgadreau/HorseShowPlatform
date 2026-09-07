// Local launcher. Run from worktree with node --env-file=.env.billing.local.
import {spawn} from 'node:child_process';
const key=process.env.STRIPE_SECRET_KEY;
if(!key?.startsWith('sk_test_')||!process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_'))throw Error('Stripe TEST configuration required');
const child=spawn('/workspaces/HorseShowPlatform/.worktrees/billing-pilot/.tmp/billing-pilot/stripe-cli/node_modules/.bin/stripe',['--config','/workspaces/HorseShowPlatform/.worktrees/billing-pilot/.tmp/billing-pilot/stripe-cli-config.toml','listen','--skip-update','--events','payment_intent.succeeded,payment_intent.processing,payment_intent.payment_failed,payment_intent.canceled,payment_intent.requires_action,payment_intent.amount_capturable_updated,charge.refunded,charge.dispute.created,charge.dispute.updated,application_fee.created,application_fee.refunded','--forward-to','http://127.0.0.1:54331/webhook','--forward-connect-to','http://127.0.0.1:54331/webhook'],{env:{...process.env,STRIPE_API_KEY:key},stdio:['ignore','pipe','pipe']});
// Buffer complete lines so secrets split across stream chunks cannot escape redaction.
for(const stream of [child.stdout,child.stderr]){let pending='';const clean=s=>s.replace(/(?:sk|pk)_(?:test|live)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+/g,'[REDACTED]');stream.on('data',b=>{pending+=b.toString();const lines=pending.split(/\r?\n/);pending=lines.pop();for(const line of lines){const secret=line.match(/whsec_[A-Za-z0-9]+/);if(secret){if(secret[0]!==process.env.STRIPE_WEBHOOK_SECRET){console.error('WEBHOOK_SECRET_MISMATCH');child.kill();process.exitCode=1;return;}console.log('WEBHOOK_SECRET_MATCH_CONFIRMED');}console.log(clean(line));}});stream.on('end',()=>{if(pending)console.log(clean(pending));});}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Listener could not start');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
