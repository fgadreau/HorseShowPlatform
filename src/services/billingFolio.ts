import {requireSupabase} from '../lib/supabase';
export type Json = any;
export async function billingRpc(name:string,args:Record<string,unknown>={}):Promise<Json>{const {data,error}=await requireSupabase().rpc(name,args);if(error)throw Error(error.message);return data;}
export async function stripeAction(body:Record<string,unknown>){
 const {data}=await requireSupabase().auth.getSession();
 const res=await fetch('/__local-billing/payment',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token??''}`},body:JSON.stringify(body)});
 let result;try{result=await res.json();}catch{throw Error('BILLING_STRIPE_TEST_CONFIG_REQUIRED');}if(!res.ok)throw Error(result.error);return result;
}
// Persist keys by identity + exact command. A reload or lost response cannot create another operation.
export async function durableRpc(identity:string,name:string,args:Record<string,unknown>){
 const scope=`hsp-billing-command:${identity}:${name}`;
 const content=JSON.stringify(args),pending=JSON.parse(localStorage.getItem(scope)??'null');
 if(pending&&pending.content!==content)throw Error('BILLING_PREVIOUS_COMMAND_UNRESOLVED');
 const id=pending?.id??crypto.randomUUID();localStorage.setItem(scope,JSON.stringify({id,content}));
 try{const result=await billingRpc(name,{...args,p_request_id:id});localStorage.removeItem(scope);return result;}
 catch(e){
  // Explicit SQL rejection has no committed effect. Network/unknown failure must retain the exact command.
  if(/^BILLING_(?!SERVER_ERROR|PROVIDER_RETRY)[A-Z_]+$/.test((e as Error).message))localStorage.removeItem(scope);
  throw e;
 }
}
export function durableStripeKey(identity:string,folio:string,amount:string){const key=`hsp-stripe:${identity}:${folio}:${amount}`;let id=sessionStorage.getItem(key);if(!id){id=crypto.randomUUID();sessionStorage.setItem(key,id);}return id;}
