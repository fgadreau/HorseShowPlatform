import {useEffect,useState} from 'react';
import {billingRpc,type Json} from '../../services/billingFolio';
import {parseHspFeeAmount} from './hspFeeAmount';
export function HspFeeSettings({org,show,locale,onSaved}:{org:string;show:string;locale:string;onSaved:()=>void}){
 const fr=locale==='fr',[data,setData]=useState<Json>(),[scope,setScope]=useState(show?'show':'association'),[amount,setAmount]=useState(''),[note,setNote]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>billingRpc('get_billing_hsp_fee_settings',{p_org:org,p_show:show||null}).then(setData);
 useEffect(()=>{let live=true;setData(undefined);void billingRpc('get_billing_hsp_fee_settings',{p_org:org,p_show:show||null}).then(d=>{if(live)setData(d);}).catch(()=>{});return()=>{live=false;};},[org,show]);
 useEffect(()=>{const row=data?.settings.find((r:Json)=>r.scope===scope);setAmount(row?.amount==null?'':String(row.amount).replace('.',fr?',':'.'));setNote(row?.note??'');},[data,scope,fr]);
 if(!data)return null;
 return <details><summary>{fr?'Réglages des frais HSP':'HSP fee settings'}</summary><form onSubmit={e=>{e.preventDefault();setMessage('');let value;try{value=parseHspFeeAmount(amount);if(scope==='platform'&&(value===null||value===0))throw Error(fr?'Le défaut plateforme doit être supérieur à zéro.':'Platform default must be greater than zero.');}catch(e){setMessage((e as Error).message);return;}setBusy(true);void billingRpc('set_billing_hsp_fee',{p_scope:scope,p_id:scope==='platform'?'00000000-0000-0000-0000-000000000000':scope==='show'?show:org,p_amount:value,p_note:note||null}).then(load).then(()=>{onSaved();setMessage(fr?'Réglage enregistré. Les frais déjà ajoutés restent inchangés.':'Setting saved. Existing fees remain unchanged.');}).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));}}>
 <label>{fr?'Niveau':'Scope'}<select value={scope} disabled={busy} onChange={e=>setScope(e.target.value)}>{data.platform_admin&&<option value="platform">{fr?'Défaut plateforme':'Platform default'}</option>}<option value="association">Association</option>{show&&<option value="show">{fr?'Ce concours':'This show'}</option>}</select></label>
 <label>{fr?'Montant avant taxes ($)':'Amount before taxes ($)'}<input aria-label={fr?'Montant des frais HSP':'HSP fee amount'} inputMode="decimal" placeholder="7,34" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)}/></label>
 <p>{fr?'Montant libre, au cent près : par exemple 7,34 $. Zéro = commandité. Champ vide = hériter du niveau supérieur. Priorité : concours, association, plateforme.':'Any amount to the nearest cent, for example $7.34. Zero = sponsored. Blank = inherit. Priority: show, association, platform.'}</p>
 <label>{fr?'Note ou raison (facultative)':'Note or reason (optional)'}<input maxLength={1000} value={note} disabled={busy} onChange={e=>setNote(e.target.value)}/></label><button disabled={busy}>{fr?'Enregistrer les frais HSP':'Save HSP fee'}</button>{message&&<p role="status">{message}</p>}
 </form></details>;
}
