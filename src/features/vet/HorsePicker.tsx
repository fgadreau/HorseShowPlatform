import { useState } from 'react';
import { vetRpc } from '../../services/vetServices';
import type { VetCertificate, VetPayload } from '../../services/vetServices';
type Candidate = {selection_id:string;horse_name:string;owner_name:string;identifiers:{type:string;value:string}[];breed?:string;color?:string;birth_year?:string};
type Search = {search_id:string;results:Candidate[];more_matches:boolean};
export function HorsePicker({payload,horseId,save,onLinked,onPayload}:{payload:VetPayload;horseId:string|null;save:()=>Promise<VetCertificate>;onLinked:(c:VetCertificate)=>Promise<void>;onPayload:(p:VetPayload)=>void}) {
 const [changing,setChanging]=useState(false),[name,setName]=useState(payload.horse?.name??''),[owner,setOwner]=useState(payload.owner.name);
 const [registration,setRegistration]=useState(''),[chip,setChip]=useState('');
 const [search,setSearch]=useState<Search|null>(null),[creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [first,setFirst]=useState(''),[last,setLast]=useState(''),[email,setEmail]=useState(payload.owner.email??'');
 const effectiveOwner=owner||payload.owner.name;
 const [reviewed,setReviewed]=useState(''),[reason,setReason]=useState('');
 function edit(fn:()=>void){fn();setSearch(null);setCreating(false);setReviewed('');setReason('');}
 async function act(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError('');try{await fn();}catch(e){const message=e instanceof Error?e.message:'';setError(message.includes('VET_DUPLICATE_IDENTIFIER')?'Ce numéro appartient déjà à un cheval. Sélectionnez le cheval existant ou faites clarifier son identification par HSP.':message.includes('VET_OWNER_REVIEW_REQUIRED')?'Le courriel correspond à un propriétaire dont l’identité doit être clarifiée par HSP.':message.includes('VET_SEARCH')?'Refaites la recherche avec les renseignements du cheval et du propriétaire.':message.includes('VET_MICROCHIP')?'La micropuce doit comporter entre 10 et 20 chiffres.':message || 'Opération impossible.');}finally{setBusy(false);}}
 function field(label:string,value:string,change:(v:string)=>void,type='text'){return <label>{label}<input type={type} value={value} onChange={e=>change(e.target.value)} /></label>;}
 async function choose(id:string){const c=await save();const linked=await vetRpc<VetCertificate>('vet_link_horse',{p_certificate:c.id,p_selection:id,p_confirmed:true});await onLinked(linked);setChanging(false);setSearch(null);setCreating(false);}
 return <div className="vet-guide"><h3>3. Cheval HSP</h3>
 {horseId && payload.horse && <div><strong>Cheval sélectionné : {payload.horse.name}</strong><p>Propriétaire : {payload.horse.owner_name}</p>{payload.horse.identifiers?.map((i,n)=><p key={n}>{i.type==='microchip'?'Micropuce':'Enregistrement'} : {i.value}</p>)}<button onClick={()=>{setChanging(true);setName(payload.horse?.name??'');setOwner(payload.horse?.owner_name??payload.owner.name);setSearch(null);}}>Changer de cheval</button></div>}
 {(!horseId||changing)&&<fieldset disabled={busy}><h4>Rechercher le cheval dans HSP</h4><p>Indiquez le nom du cheval et du propriétaire, ou utilisez un numéro d’enregistrement ou une micropuce. Aucune association n’est nécessaire.</p>
 {field('Nom du cheval',name,v=>edit(()=>setName(v)))}{field('Nom du propriétaire',effectiveOwner,v=>edit(()=>setOwner(v)))}
 {field('Numéro d’enregistrement (facultatif)',registration,v=>edit(()=>setRegistration(v)))}{field('Numéro de micropuce (facultatif)',chip,v=>edit(()=>setChip(v)))}
 <button onClick={()=>void act(async()=>{const c=await save();const r=await vetRpc<Search>('vet_search_horse_candidates',{p_certificate:c.id,p_name:name,p_owner:effectiveOwner,p_registration:registration,p_microchip:chip});setSearch(r);setCreating(false);setReviewed('');})}>Rechercher le cheval</button>
 {search&&<><h4>Résultats de la recherche</h4>{search.results.length===0&&<p>Aucun cheval correspondant trouvé.</p>}{search.more_matches&&<p>Plus de dix correspondances : précisez votre recherche avant de choisir.</p>}
 {search.results.map(c=><div className="vet-candidate" key={c.selection_id}><strong>{c.horse_name}</strong><p>Propriétaire : {c.owner_name}</p>{c.identifiers?.map((i,n)=><p key={n}>{i.type==='microchip'?'Micropuce':'Enregistrement'} : {i.value}</p>)}<p>{[c.breed,c.color,c.birth_year].filter(Boolean).join(' · ')}</p><button onClick={()=>void act(()=>choose(c.selection_id))}>Sélectionner ce cheval</button></div>)}
 {!creating&&<><p>{search.results.length?'Si aucun de ces chevaux n’est le bon, vous pourrez expliquer pourquoi il s’agit d’un cheval différent.':''}</p><button onClick={()=>{const parts=effectiveOwner.trim().split(/\s+/);setFirst(parts.shift()??'');setLast(parts.join(' '));setEmail(payload.owner.email??'');setCreating(true);}}>Créer ce cheval dans HSP</button></>}
 {creating&&<div><h4>Créer le cheval absent de HSP</h4><p><strong>{name}</strong>{registration&&` · Enregistrement ${registration}`}{chip&&` · Micropuce ${chip}`}</p>
 {field('Prénom du propriétaire',first,setFirst)}{field('Nom de famille du propriétaire',last,setLast)}{field('Courriel du propriétaire (facultatif)',email,v=>{setEmail(v);onPayload({...payload,owner:{...payload.owner,email:v}});},'email')}
 {field('Écurie ou agent',payload.agent.name,v=>onPayload({...payload,agent:{...payload.agent,name:v}}))}{field('Courriel de l’écurie ou de l’agent',payload.agent.email,v=>onPayload({...payload,agent:{...payload.agent,email:v}}),'email')}
 {reviewed&&<div role="alert"><p>Une correspondance potentielle existe. Sélectionnez un cheval ci-dessus, ou expliquez pourquoi il s’agit bien d’un cheval différent.</p>{field('Motif : il s’agit d’un cheval différent',reason,setReason)}</div>}
 <button disabled={!!reviewed&&reason.trim().length<10} onClick={()=>void act(async()=>{
  const c=await save();const result=await vetRpc<{certificate?:VetCertificate;needs_confirmation?:boolean;reviewed_matches?:string;results:Candidate[];more_matches:boolean}>('vet_create_searched_horse',{p_certificate:c.id,p_search:search.search_id,p_owner_first:first,p_owner_last:last,p_owner_email:email,p_reviewed_matches:reviewed,p_difference_reason:reason});
  if(result.certificate){await onLinked(result.certificate);setCreating(false);setChanging(false);setSearch(null);}else{setSearch({...search,results:result.results,more_matches:result.more_matches});setReviewed(result.reviewed_matches??'');setReason('');}
 })}>{reviewed?'Confirmer le cheval différent et le créer':'Créer et rattacher le cheval'}</button><button onClick={()=>setCreating(false)}>Annuler la création</button>
 </div>}</>}
 </fieldset>}{error&&<p role="alert">{error}</p>}
 </div>;
}
