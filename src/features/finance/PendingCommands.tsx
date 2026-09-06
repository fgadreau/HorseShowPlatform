import {useEffect,useState} from 'react';
import {pendingCommands,replayBillingCommand} from '../../services/billingFolio';
export function PendingCommands({identity,locale,onResolved}:{identity:string;locale:string;onResolved:(name:string,result:any)=>void}){
 const [,refresh]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const update=()=>refresh(v=>v+1);window.addEventListener('billing-command-change',update);window.addEventListener('storage',update);return()=>{window.removeEventListener('billing-command-change',update);window.removeEventListener('storage',update);};},[]);
 const commands=pendingCommands(identity),fr=locale==='fr';
 if(!commands.length&&!error)return null;
 return <aside role="status"><p>{commands.length>0&&(fr?'Une commande précédente doit être résolue avant une nouvelle opération. La reprise conserve son contenu original.':'Resolve the previous command before a new operation. Recovery preserves its original content.')}</p>{commands.map(c=><button key={c.name} disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const result=await replayBillingCommand(identity,c.name);onResolved(c.name,result);}catch(e){setError((e as Error).message);if(!pendingCommands(identity).length)onResolved('',{});}finally{setBusy(false);}}}>{fr?'Résoudre la commande précédente':'Resolve previous command'}</button>)}{error&&<p role="alert">{error}</p>}</aside>;
}
