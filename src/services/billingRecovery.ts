// Store the submitted payload, never a payload rebuilt from a refreshed account.
type Args = Record<string, any>;
export type PendingCommand = {name:string; id:string; content:string};
const prefix=(identity:string)=>`hsp-billing-command:${identity}:`;
export function pendingCommands(identity:string):PendingCommand[]{
 return Object.keys(localStorage).filter(k=>k.startsWith(prefix(identity))).sort().map(k=>({...JSON.parse(localStorage.getItem(k)!),name:k.slice(prefix(identity).length)}));
}
function changed(){window.dispatchEvent(new Event('billing-command-change'));}
async function execute(identity:string,command:PendingCommand,rpc:(name:string,args:Args)=>Promise<any>){
 const scope=prefix(identity)+command.name;
 try{const result=await rpc(command.name,{...JSON.parse(command.content),p_request_id:command.id});localStorage.removeItem(scope);changed();return result;}
 catch(e){
  // Only explicit post-idempotency validation failures establish a rejection.
  // Unknown transport errors, forbidden access and conflicts keep the command.
  if(/^BILLING_(STALE_VERSION|STALE_RECAP|INVALID_AMOUNT|INVALID_ALLOCATION|ALLOCATION_TOTAL_MISMATCH|PAYMENT_EXCEEDS_BALANCE|UNEXPECTED_FIELD)$/.test((e as Error).message)){localStorage.removeItem(scope);changed();}
  throw e;
 }
}
export async function submitCommand(identity:string,name:string,args:Args,rpc:(name:string,args:Args)=>Promise<any>){
 const content=JSON.stringify(args),pending=pendingCommands(identity);
 if(pending.some(c=>c.name!==name||c.content!==content))throw Error('BILLING_PREVIOUS_COMMAND_UNRESOLVED');
 const command=pending[0]??{name,id:crypto.randomUUID(),content};
 localStorage.setItem(prefix(identity)+name,JSON.stringify(command));changed();
 return execute(identity,command,rpc);
}
export function replayCommand(identity:string,name:string,rpc:(name:string,args:Args)=>Promise<any>){
 const command=pendingCommands(identity).find(c=>c.name===name);
 if(!command)throw Error('BILLING_PREVIOUS_COMMAND_UNRESOLVED');
 return execute(identity,command,rpc);
}
// A timeout, changed account version or changed amount never renews a Stripe key.
export function pendingStripe(identity:string,folio:string){return JSON.parse(localStorage.getItem(`hsp-stripe:${identity}:${folio}`)??'null');}
export function stripeKey(identity:string,folio:string,amount:string){
 const scope=`hsp-stripe:${identity}:${folio}`,pending=JSON.parse(localStorage.getItem(scope)??'null');
 if(pending&&pending.amount!==amount)throw Error('BILLING_PREVIOUS_COMMAND_UNRESOLVED');
 const command=pending??{id:crypto.randomUUID(),amount};localStorage.setItem(scope,JSON.stringify(command));return command.id;
}
export function observeStripe(identity:string,folio:string,result:Args){
 const scope=`hsp-stripe:${identity}:${folio}`,pending=JSON.parse(localStorage.getItem(scope)??'null');
 if(!pending)return;
 const attempt=result.attempt_id??result.id;
 if(pending.attempt&&pending.attempt!==attempt)return;
 // Only responses from the authenticated server are passed here.
 if(['canceled','succeeded'].includes(result.state)){localStorage.removeItem(scope);return;}
 if(attempt)localStorage.setItem(scope,JSON.stringify({...pending,attempt}));
}
