import { useEffect, useState } from "react";
import type { Locale } from "../../lib/i18n";
import type { Horse, Organization, OrganizationBackNumber } from "../../types/domain";
import { requireSupabase } from "../../lib/supabase";
import { errorMessage, formatCurrency } from "../../lib/display";
import { assignBackNumber } from "../../services/supabaseServices";
import { uiText } from "../dashboard/shared";
type Request = { id:string;horse_id:string;fee:number;created_at:string };
export function MyPendingBackNumberRequests({locale,organization,horses,revision}:{locale:Locale;organization:Organization;horses:Horse[];revision:string}) {
  const [requests,setRequests]=useState<Request[]>([]);
  const [error,setError]=useState('');
  useEffect(()=>{let live=true;void requireSupabase().from('back_number_requests').select('id,horse_id,fee,created_at').eq('organization_id',organization.id).eq('status','pending').order('created_at').then(({data,error})=>{if(!live)return;if(error)setError(error.message);else setRequests(data??[]);});return()=>{live=false;};},[organization.id,revision]);
  if(error)return <p role="alert">{error}</p>;
  if(!requests.length)return null;
  return <section className="panel span-2"><h2>{uiText(locale,'Dossards en attente','Pending back numbers')}</h2>{requests.map(request=><p key={request.id}><strong>{horses.find(horse=>horse.id===request.horse_id)?.name??uiText(locale,'Cheval','Horse')}</strong> — {uiText(locale,'En attente du secrétariat','Awaiting the office')} · {formatCurrency(request.fee,organization.currency)}</p>)}<p>{uiText(locale,"Les frais sont déjà enregistrés. Le secrétariat assignera un numéro avant la création de l'ordre de passage.","The fee has already been recorded. The office will assign a number before the draw is created.")}</p></section>;
}
export function BackNumberRequestsPanel({locale,organization,horses,backNumbers,onAssigned}:{locale:Locale;organization:Organization;horses:Horse[];backNumbers:OrganizationBackNumber[];onAssigned:()=>void|Promise<void>}) {
  const [automatic,setAutomatic]=useState(organization.back_number_auto_assign??false);
  const [fee,setFee]=useState(String(organization.back_number_request_fee??0));
  const [requests,setRequests]=useState<Request[]>([]);
  const [numbers,setNumbers]=useState<Record<string,string>>({});
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const stockKey=backNumbers.map(row=>`${row.id}:${row.status}:${row.assigned_horse_id}`).join('|');
  useEffect(()=>{let live=true;void requireSupabase().from('back_number_requests').select('id,horse_id,fee,created_at').eq('organization_id',organization.id).eq('status','pending').order('created_at').then(({data,error})=>{if(!live)return;if(error)setNotice(error.message);else setRequests(data??[]);});return()=>{live=false;};},[organization.id,revision,stockKey]);
  const available=backNumbers.filter(row=>row.status==='available'&&row.association_issued!==false).sort((a,b)=>a.number-b.number);
  return <section className="panel span-2 stack">
    <h2>{uiText(locale,"Demandes et frais de dossards","Back number requests and fees")}</h2>
    <form className="stack" onSubmit={event=>{event.preventDefault();setBusy(true);setNotice('');void (async()=>{const {error}=await requireSupabase().from('organizations').update({back_number_auto_assign:automatic,back_number_request_fee:Number(fee)}).eq('id',organization.id);if(error)throw error;setNotice(uiText(locale,'Réglages enregistrés.','Settings saved.'));await onAssigned();})().catch(error=>setNotice(errorMessage(error))).finally(()=>setBusy(false));}}>
      <label className="check-row"><input type="checkbox" checked={automatic} onChange={event=>setAutomatic(event.target.checked)}/><span>{uiText(locale,"Assigner automatiquement un dossard disponible lors d'une demande","Automatically assign available stock when a number is requested")}</span></label>
      <label>{uiText(locale,"Frais d'un nouveau dossard","New back number fee")}<input required min="0" step="0.01" type="number" value={fee} onChange={event=>setFee(event.target.value)}/></label>
      <button className="primary-button" disabled={busy} type="submit">{uiText(locale,"Enregistrer les réglages","Save settings")}</button>
    </form>
    <p role="status">{notice}</p>
    <p>{uiText(locale,"Les frais sont enregistrés une seule fois à la demande. L'annulation d'une inscription ne libère pas le dossard et n'annule pas ces frais.","The fee is recorded once per request. Cancelling an entry does not release the number or reverse this fee.")}</p>
    {requests.map(request=><div className="form-section stack" key={request.id}>
      <strong style={{overflowWrap:'anywhere'}}>{horses.find(horse=>horse.id===request.horse_id)?.name??uiText(locale,'Cheval introuvable','Horse unavailable')} — {formatCurrency(request.fee,organization.currency)}</strong>
      <label>{uiText(locale,"Dossard à assigner","Number to assign")}<input aria-label={`${uiText(locale,"Dossard à assigner","Number to assign")} ${horses.find(horse=>horse.id===request.horse_id)?.name??uiText(locale,'Cheval','Horse')}`} type="number" min="1" step="1" value={numbers[request.id]??''} placeholder={available[0]?String(available[0].number):''} onChange={event=>setNumbers(current=>({...current,[request.id]:event.target.value}))}/></label>
      <button className="primary-button" type="button" disabled={busy||!Number.isInteger(Number(numbers[request.id]))||Number(numbers[request.id])<1} onClick={()=>{setBusy(true);setNotice('');void assignBackNumber({organization_id:organization.id,assignment_mode:'horse',horse_id:request.horse_id,number:Number(numbers[request.id])}).then(async()=>{setRevision(value=>value+1);await onAssigned();}).catch(error=>setNotice(errorMessage(error))).finally(()=>setBusy(false));}}>{uiText(locale,"Assigner ce dossard","Assign this number")}</button>
    </div>)}
    {!requests.length?<p>{uiText(locale,"Aucune demande en attente.","No pending requests.")}</p>:null}
  </section>;
}
