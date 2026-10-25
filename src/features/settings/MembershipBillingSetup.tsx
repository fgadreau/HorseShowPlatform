import {useEffect,useState} from 'react';
import {billingRpc,type Json} from '../../services/billingFolio';
import type {Organization,OrganizationMembershipType} from '../../types/domain';
import {membershipBillingError} from '../people/membershipBilling';

export function MembershipBillingSetup({organization,types,locale}:{organization:Organization|null;types:OrganizationMembershipType[];locale:string}){
 const fr=locale==='fr';const [data,setData]=useState<Json>();const [selected,setSelected]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [rate1,setRate1]=useState('');const [rate2,setRate2]=useState('');const [message,setMessage]=useState('');
 const [payers,setPayers]=useState<Record<string,string>>({});
 const [name1,setName1]=useState('');const [name2,setName2]=useState('');
 useEffect(()=>{let live=true;setData(undefined);if(organization)void billingRpc('membership_billing_admin',{p_org:organization.id}).then(d=>{if(live)setData(d);}).catch(e=>{if(live)setError(membershipBillingError(e,locale));});return()=>{live=false;};},[organization?.id,types,locale]);
 async function refresh(){setData(await billingRpc('membership_billing_admin',{p_org:organization!.id}));}
 async function run(action:()=>Promise<void>){setBusy(true);setError('');setMessage('');try{await action();await refresh();}catch(e){setError(membershipBillingError(e,locale));}finally{setBusy(false);}}
 const type=data?.types.find((t:Json)=>t.id===selected);const money=(n:unknown)=>new Intl.NumberFormat(fr?'fr-CA':'en-CA',{style:'currency',currency:organization?.currency??'CAD'}).format(Number(n));
 async function configure(){
  if(!type)return;
  const taxes=type.tax_applicable?[{code:'TAX1',name:name1.trim(),rate:Number(rate1.replace(',','.')),jurisdiction:organization?.state||'CA'},{code:'TAX2',name:name2.trim(),rate:Number(rate2.replace(',','.')),jurisdiction:organization?.state||'CA'}].filter(t=>t.name||t.rate):[];
  if(type.tax_applicable&&(!taxes.length||taxes.some(t=>!t.name||!Number.isFinite(t.rate)||t.rate<=0)))throw Error('MEMBERSHIP_TAX_CONFIG_REQUIRED');
  if(!window.confirm(fr?`Relier « ${type.name} » à la nouvelle facturation ? Prix : ${money(type.price)}${type.tax_applicable?' plus les taxes saisies':' sans taxes'}. Les anciens achats seront repris séparément après vérification. Aucun débit bancaire automatique.`:`Connect “${type.name}” to the new billing flow? Price: ${money(type.price)}${type.tax_applicable?' plus the entered taxes':' with no tax'}. Legacy purchases require a separate review. No automatic bank charge.`))return;
  await billingRpc('membership_billing_configure',{p_type:type.id,p_taxes:taxes});setMessage(fr?'La carte est reliée au nouveau parcours.':'The membership is connected to the new billing flow.');
 }
 async function reconcile(m:Json){
  const payer=payers[m.id]??m.payer_id;
  if(!data.payers.some((p:Json)=>p.id===payer))throw Error('MEMBERSHIP_PAYER_REQUIRED');
  const q=await billingRpc('membership_billing_quote',{p_type:m.type_id});
  if(Number(q.total)!==Number(m.total))throw Error('MEMBERSHIP_LEGACY_MANUAL_REVIEW');
  if(!window.confirm(fr?`Reprendre la carte de ${m.name} pour ${money(q.total)} ? L’ancienne facture impayée sera annulée et conservée dans l’historique. Un seul frais sera créé dans le nouveau compte. La carte attendra le paiement.`:`Transfer ${m.name}'s membership for ${money(q.total)}? The unpaid legacy invoice will be voided and retained for audit. One charge will be created in the new account. The membership will await payment.`))return;
  await billingRpc('membership_billing_reconcile',{p_membership:m.id,p_total:Number(q.total),p_payer:payer});setMessage(fr?'Carte reprise : un seul frais dans le nouveau compte.':'Membership transferred: one charge in the new account.');
 }
 return <section className="stack"><h3>{fr?'Relier les cartes à la facturation':'Connect memberships to billing'}</h3>
 <p>{fr?'Enregistre d’abord la carte ci-dessus et son choix de taxes. Les cartes sont sans taxes par défaut. Une carte payante sera active après réception et affectation du paiement.':'First save the membership above and its tax choice. New memberships default to no tax. A paid membership activates after payment is received and allocated.'}</p>
 {error?<p role="alert">{error}</p>:null}{message?<p role="status">{message}</p>:null}
 {!data?<p>{fr?'Chargement…':'Loading…'}</p>:<>
 <label>{fr?'Carte à relier':'Membership to connect'}<select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setRate1('');setRate2('');setName1('');setName2('');}}><option value="">{fr?'Choisir une carte':'Choose a membership'}</option>{data.types.map((t:Json)=><option key={t.id} value={t.id}>{t.name} — {t.season_year}{t.context_id?' ✓':''}</option>)}</select></label>
 {type?<><p>{money(type.price)} — {type.tax_applicable?(fr?'Prix avant taxes':'Price before tax'):(fr?'Sans taxes':'No tax')}</p>
 {!type.context_id&&type.tax_applicable?<div className="form-grid">{[[name1,setName1,rate1,setRate1],[name2,setName2,rate2,setRate2]].map(([name,setName,rate,setRate],index)=><div className="stack" key={index}><label>{fr?`Nom de la taxe ${index+1}`:`Tax ${index+1} name`}<input value={name as string} onChange={e=>(setName as (v:string)=>void)(e.target.value)}/></label><label>{fr?'Taux (%)':'Rate (%)'}<input inputMode="decimal" value={rate as string} onChange={e=>(setRate as (v:string)=>void)(e.target.value)}/></label></div>)}</div>:null}
 {!type.context_id?<button type="button" disabled={busy||!data.can_configure} onClick={()=>void run(configure)}>{fr?'Confirmer et relier la carte':'Confirm and connect membership'}</button>:<a href={`/associations/${organization?.id}/finance?tab=outside&context=${type.context_id}`}>{fr?'Voir les comptes de ces cartes':'View membership accounts'}</a>}</>:null}
 {data.legacy.length?<><h4>{fr?'Cartes déjà créées à vérifier':'Existing memberships to review'}</h4>{data.legacy.map((m:Json)=><div key={m.id} className="row-actions"><label>{fr?'Payeur du nouveau compte':'New account payer'}<select disabled={busy} value={payers[m.id]??(data.payers.some((p:Json)=>p.id===m.payer_id)?m.payer_id:'')} onChange={e=>setPayers(current=>({...current,[m.id]:e.target.value}))}><option value="">{fr?'Choisir le payeur':'Choose payer'}</option>{data.payers.map((p:Json)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><span>{m.name} — {money(m.total)} — {fr?'déjà payé':'already paid'} : {money(m.paid)}</span><button type="button" disabled={busy||!data.types.some((t:Json)=>t.id===m.type_id&&t.context_id)||Number(m.paid)!==0||m.invoice_status!=='draft'||!(payers[m.id]??(data.payers.some((p:Json)=>p.id===m.payer_id)?m.payer_id:''))} onClick={()=>void run(()=>reconcile(m))}>{fr?'Vérifier et reprendre cet achat':'Review and transfer purchase'}</button></div>)}</>:null}
 </>}
 </section>;
}
