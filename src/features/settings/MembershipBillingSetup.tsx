import {useEffect,useState} from 'react';
import {billingRpc,type Json} from '../../services/billingFolio';
import type {Organization,OrganizationMembershipType} from '../../types/domain';
import {membershipBillingError} from '../people/membershipBilling';

export function MembershipBillingSetup({organization,types,locale}:{organization:Organization|null;types:OrganizationMembershipType[];locale:string}){
 const fr=locale==='fr';const [data,setData]=useState<Json>();const [selected,setSelected]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [rate1,setRate1]=useState('');const [rate2,setRate2]=useState('');const [message,setMessage]=useState('');
 const [name1,setName1]=useState('');const [name2,setName2]=useState('');
 useEffect(()=>{let live=true;setData(undefined);if(organization)void billingRpc('membership_billing_admin',{p_org:organization.id}).then(d=>{if(live)setData(d);}).catch(e=>{if(live)setError(membershipBillingError(e,locale));});return()=>{live=false;};},[organization?.id,types,locale]);
 async function refresh(){setData(await billingRpc('membership_billing_admin',{p_org:organization!.id}));}
 async function run(action:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await action();await refresh();}catch(e){setError(membershipBillingError(e,locale));}finally{setBusy(false);}}
 const type=data?.types.find((t:Json)=>t.id===selected);const money=(n:unknown)=>new Intl.NumberFormat(fr?'fr-CA':'en-CA',{style:'currency',currency:organization?.currency??'CAD'}).format(Number(n));
 async function configure(){
  if(!type)return;
  const taxes=type.tax_applicable?[{code:'TAX1',name:name1.trim(),rate:Number(rate1.replace(',','.')),jurisdiction:organization?.state||'CA'},{code:'TAX2',name:name2.trim(),rate:Number(rate2.replace(',','.')),jurisdiction:organization?.state||'CA'}].filter(t=>t.name||t.rate):[];
  if(type.tax_applicable&&(!taxes.length||taxes.some(t=>!t.name||!Number.isFinite(t.rate)||t.rate<=0)))throw Error('MEMBERSHIP_TAX_CONFIG_REQUIRED');
  if(!window.confirm(fr?`Relier « ${type.name} » à la facturation ? Prix : ${money(type.price)}${type.tax_applicable?' plus les taxes saisies':' sans taxes'}. Aucun débit bancaire automatique.`:`Connect “${type.name}” to the billing flow? Price: ${money(type.price)}${type.tax_applicable?' plus the entered taxes':' with no tax'}. No automatic bank charge.`))return;
  await billingRpc('membership_billing_configure',{p_type:type.id,p_taxes:taxes});setMessage(fr?'La carte est reliée au parcours.':'The membership is connected to the billing flow.');
 }
 return <section className="stack"><h3>{fr?'Relier les cartes à la facturation':'Connect memberships to billing'}</h3>
 <p>{fr?'Enregistre d’abord le type de carte et son choix de taxes dans « Cartes de membre ». Les cartes sont sans taxes par défaut. Une carte payante sera active après réception et affectation du paiement.':'First save the membership type and its tax choice in “Memberships”. New memberships default to no tax. A paid membership activates after payment is received and allocated.'}</p>
 {error?<p role="alert">{error}</p>:null}{message?<p role="status">{message}</p>:null}
 {!data?<p>{fr?'Chargement…':'Loading…'}</p>:<>
 <label>{fr?'Carte à relier':'Membership to connect'}<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setRate1('');setRate2('');setName1('');setName2('');}}><option value="">{fr?'Choisir une carte':'Choose a membership'}</option>{data.types.map((t:Json)=><option key={t.id} value={t.id}>{t.name} — {t.season_year}{t.context_id?' ✓':''}</option>)}</select></label>
 {type?<><p>{money(type.price)} — {type.tax_applicable?(fr?'Prix avant taxes':'Price before tax'):(fr?'Sans taxes':'No tax')}</p>
 {!type.context_id&&type.tax_applicable?<div className="form-grid">{[[name1,setName1,rate1,setRate1],[name2,setName2,rate2,setRate2]].map(([name,setName,rate,setRate],index)=><div className="stack" key={index}><label>{fr?`Nom de la taxe ${index+1}`:`Tax ${index+1} name`}<input value={name as string} onChange={e=>(setName as (v:string)=>void)(e.target.value)}/></label><label>{fr?'Taux (%)':'Rate (%)'}<input inputMode="decimal" value={rate as string} onChange={e=>(setRate as (v:string)=>void)(e.target.value)}/></label></div>)}</div>:null}
 {!type.context_id?<button type="button" disabled={busy||!data.can_configure} onClick={()=>void run(configure)}>{fr?'Confirmer et relier la carte':'Confirm and connect membership'}</button>:<a href={`/associations/${organization?.id}/finance?tab=outside&context=${type.context_id}`}>{fr?'Voir les comptes de ces cartes':'View membership accounts'}</a>}</>:null}
 </>}
 </section>;
}
