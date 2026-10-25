import {warmupError} from "./errors";
import { useEffect, useState } from 'react';
import { billingRpc, type Json } from '../../services/billingFolio';
import type { Horse } from '../../types/domain';
import { WarmupScheduleExport } from './WarmupScheduleExport';

export function WarmupRoster({warmupId,horses=[]}:{warmupId:string;horses?:Horse[]}) {
 const [data,setData]=useState<Json>();const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [product,setProduct]=useState('');const [preview,setPreview]=useState<Json>();const [horse,setHorse]=useState('');
 async function refresh(){setData(await billingRpc('paid_warmup_roster',{p_warmup:warmupId}));}
 useEffect(()=>{let live=true;void billingRpc('paid_warmup_roster',{p_warmup:warmupId}).then(d=>{if(live)setData(d);}).catch(e=>{if(live)setError(warmupError(e));});return()=>{live=false;};},[warmupId]);
 async function run(action:()=>Promise<unknown>){setBusy(true);setError('');try{await action();setPreview(undefined);await refresh();}catch(e){setError(warmupError(e));}finally{setBusy(false);}}
 if(!data)return <p role="status">{error||'Chargement / Loading…'}</p>;
 const w=data.warmup;const requests:Json[]=data.requests;const selected=requests.filter(r=>r.status==='selected');
 const labels:Record<string,string>={requested:'Demande / Requested',selected:'Retenu / Selected',waiting:'Liste d’attente / Waiting',cancelled:'Annulé / Cancelled'};
 const args={p_warmup:warmupId,p_version:w.registration_version};
 const manage=(action:string,extra:Json={})=>run(()=>billingRpc('paid_warmup_manage',{...args,p_action:action,...extra}));
 function move(id:string,direction:number){const ids=selected.map(r=>r.id);const index=ids.indexOf(id);const next=index+direction;if(next<0||next>=ids.length)return;[ids[index],ids[next]]=[ids[next],ids[index]];void manage('reorder',{p_order:ids});}
 async function review(){setBusy(true);setError('');try{setPreview(await billingRpc('paid_warmup_billing_preview',{...args,p_product:product||null}));}catch(e){setError(warmupError(e));}finally{setBusy(false);}}
 const money=(amount:unknown)=>new Intl.NumberFormat('fr-CA',{style:'currency',currency:data.currency??data.catalog?.currency??'CAD'}).format(Number(amount));
 return <div className="stack">
  <p>{requests.filter(r=>r.status!=='cancelled').length} demandes · {selected.length} / {w.capacity} places · {money(w.entry_fee)} par cheval, avant taxes.</p>
  <p>Une place par cheval. Les frais sont créés uniquement après confirmation. Retirer un cheval déjà facturé ne crée aucun remboursement automatique.</p>
  {error?<p role="alert">{error}</p>:null}
  <div className="row-actions">
   <button type="button" disabled={busy||w.registration_state!=='open'} onClick={()=>{if(window.confirm('Fermer les demandes et effectuer le tirage au sort ? Le tirage ne peut pas être relancé.'))void manage('draw');}}>Fermer les demandes et tirer au sort</button>
   <button type="button" disabled={busy||w.registration_state==='open'||selected.length>=w.capacity} onClick={()=>void manage('promote')}>Attribuer une place au prochain en attente</button>
   <button type="button" disabled={busy} onClick={()=>void run(async()=>{})}>Actualiser</button>
  </div>
  <form onSubmit={e=>{e.preventDefault();void run(()=>billingRpc('paid_warmup_request',{p_warmup:warmupId,p_horse:horse}));}}>
   <label>Ajouter une demande pour un cheval<select required value={horse} onChange={e=>setHorse(e.target.value)}><option value="">Choisir un cheval</option>{horses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><button disabled={busy||!horse}>Ajouter à la liste des demandes / d’attente</button>
  </form>
  <div style={{overflowX:'auto'}}><table><thead><tr><th>Ordre</th><th>Propriétaire / cheval</th><th>État</th><th>Facturation</th><th>Actions</th></tr></thead><tbody>{requests.map(r=><tr key={r.id}>
   <td>{r.position??'—'}</td><td>{r.owner_name} — {r.horse_name}</td><td>{labels[r.status]}{r.draw_rank?` · tirage #${r.draw_rank}`:''}</td>
   <td>{r.billed_at?(r.status==='cancelled'?'Déjà facturé — correction manuelle si nécessaire':'Validé / facturé'):'Non facturé'}</td>
   <td><div className="row-actions">{r.status==='selected'?<><button type="button" aria-label={`Monter ${r.horse_name}`} disabled={busy||selected[0]?.id===r.id} onClick={()=>move(r.id,-1)}>↑</button><button type="button" aria-label={`Descendre ${r.horse_name}`} disabled={busy||selected[selected.length-1]?.id===r.id} onClick={()=>move(r.id,1)}>↓</button></>:null}{r.status!=='cancelled'?<button type="button" disabled={busy} onClick={()=>{if(window.confirm(r.billed_at?'Retirer ce cheval ? Les frais restent à traiter manuellement dans la facturation.':'Retirer ce cheval de la liste ?'))void manage('remove',{p_request:r.id});}}>Retirer</button>:null}</div></td>
  </tr>)}</tbody></table></div>
  <WarmupScheduleExport warmup={w} labels={selected.map(r=>`${r.owner_name} — ${r.horse_name}`)}/>
  {w.registration_state!=='open'?<section>
   <h3>Validation de l’association et facturation</h3>
   <label>Produit de facturation (même prix que la séance)<select value={product} onChange={e=>{setProduct(e.target.value);setPreview(undefined);}}><option value="">Sélectionner le produit</option>{(data.catalog?.products??[]).filter((p:Json)=>Number(p.price)===Number(w.entry_fee)).map((p:Json)=><option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}</select></label>
   {!data.catalog&&Number(w.entry_fee)>0?<p>Le contexte de facturation de ce concours doit être configuré. Le tirage et les exports restent disponibles.</p>:null}
   <button type="button" disabled={busy||(!product&&Number(w.entry_fee)>0)||!selected.some(r=>!r.billed_at)} onClick={()=>void review()}>Vérifier les frais avant validation</button>
   {preview?<section role="region" aria-label="Confirmer la facturation"><h4>Frais à créer</h4>{preview.items.map((item:Json)=><div key={item.request_id}><strong>{requests.find(r=>r.id===item.request_id)?.horse_name}</strong>{item.lines.map((line:Json,i:number)=><p key={i}>{line.description} : {money(line.subtotal)} + {money(line.tax_amount)} taxes = {money(line.total)}</p>)}</div>)}<p>Aucun débit bancaire n’est lancé par cette validation. Les paiements et remboursements se gèrent dans la facturation.</p><button type="button" disabled={busy} onClick={()=>void run(()=>billingRpc('paid_warmup_validate',{...args,p_product:product||null,p_hash:preview.hash}))}>Valider la liste et créer les frais</button><button type="button" onClick={()=>setPreview(undefined)}>Retour sans facturer</button></section>:null}
  </section>:null}
 </div>;
}
