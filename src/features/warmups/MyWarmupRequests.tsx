import {warmupError} from "./errors";
import {useEffect,useState} from 'react';
import {billingRpc,type Json} from '../../services/billingFolio';
import type {Horse} from '../../types/domain';
export function MyWarmupRequests({organizationId,horses}:{organizationId:string;horses:Horse[]}) {
 const [sessions,setSessions]=useState<Json[]>([]);const [horse,setHorse]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 async function refresh(){setSessions(await billingRpc('paid_warmup_signup_options',{p_org:organizationId}));}
 useEffect(()=>{let live=true;void billingRpc('paid_warmup_signup_options',{p_org:organizationId}).then(d=>{if(live)setSessions(d);}).catch(e=>{if(live)setError(warmupError(e));});return()=>{live=false;};},[organizationId]);
 async function request(session:Json,horseId:string,cancel=false){setBusy(true);setError('');try{await billingRpc('paid_warmup_request',{p_warmup:session.id,p_horse:horseId,p_cancel:cancel});await refresh();}catch(e){setError(warmupError(e));}finally{setBusy(false);}}
 const states:Record<string,string>={requested:'Demande reçue, non facturée',waiting:'Liste d’attente, non facturée',selected:'Place attribuée',cancelled:'Demande annulée'};
 return <section className="panel span-2"><h2>Mes demandes de paid warm-up</h2><p>Les séances sont aussi proposées dans l’horaire du formulaire Inscription. Une demande par cheval et par séance. En cas de surnombre, l’association tire les places au sort dans l’application. Seules les places retenues puis validées sont facturées.</p>{error?<p role="alert">{error}</p>:null}
  {!sessions.length?<p>Aucune séance accessible pour cette association.</p>:<label>Mon cheval<select value={horse} onChange={e=>setHorse(e.target.value)}><option value="">Sélectionner un cheval</option>{horses.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>}
  {sessions.map(s=><article key={s.id}><h3>{s.show_name} — {s.name}</h3><p>{s.price} {s.currency} avant taxes · {s.capacity} places</p><button type="button" disabled={busy||!horse||s.state!=='open'||s.requests.some((r:Json)=>r.horse_id===horse&&r.status!=='cancelled')} onClick={()=>void request(s,horse)}>Demander une place</button>{s.state!=='open'?<p>Les demandes sont fermées. L’association gère les places et la liste d’attente.</p>:null}{s.requests.map((r:Json)=><p key={r.id}>{horses.find(h=>h.id===r.horse_id)?.name??'Cheval'} — {states[r.status]}{r.billed?' · Validé / facturé':''}{r.status!=='cancelled'?<button type="button" disabled={busy} onClick={()=>{if(window.confirm(r.billed?'Annuler la place ? Aucun remboursement automatique ; contactez la secrétaire.':'Annuler cette demande ?'))void request(s,r.horse_id,true);}}>Annuler</button>:null}</p>)}</article>)}
 </section>;
}
