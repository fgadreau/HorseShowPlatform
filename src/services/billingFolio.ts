import {requireSupabase} from '../lib/supabase';
export type Json = any;
export async function billingRpc(name:string,args:Record<string,unknown>={}):Promise<Json>{const {data,error}=await requireSupabase().rpc(name,args);if(error)throw Error(error.message);return data;}
export async function stripeAction(body:Record<string,unknown>){
 const {data}=await requireSupabase().auth.getSession();
 const res=await fetch('/__local-billing/payment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token??''}`},body:JSON.stringify(body)});
 let result;try{result=await res.json();}catch{throw Error('BILLING_STRIPE_TEST_CONFIG_REQUIRED');}if(!res.ok)throw Error(result.error);return result;
}
export {pendingCommands,observeStripe,pendingStripe} from './billingRecovery';
import {submitCommand,replayCommand,stripeKey} from './billingRecovery';
export const durableRpc=(identity:string,name:string,args:Record<string,unknown>)=>submitCommand(identity,name,args,billingRpc);
export const replayBillingCommand=(identity:string,name:string)=>replayCommand(identity,name,billingRpc);
export const durableStripeKey=stripeKey;
