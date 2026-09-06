import {useState} from 'react';
import {requireSupabase} from '../../lib/supabase';
import {vetWorker} from '../../services/vetServices';
type Message={subject:string;text:string;link?:string;attachment?:{name:string;base64:string}};
export function VetTestOutbox({issuerId}:{issuerId:string}){
 const [rows,setRows]=useState<{id:string;recipient:string;kind:string;created_at:string}[]>([]),[message,setMessage]=useState<Message|null>(null),[error,setError]=useState('');
 async function load(){setError('');setMessage(null);const r=await requireSupabase().from('vet_preprod_outbox').select('id,recipient,kind,created_at').eq('issuer_id',issuerId).order('created_at',{ascending:false}).limit(30);if(r.error)setError('Boîte de test indisponible.');else setRows(r.data??[]);}
 function download(){if(!message?.attachment)return;const bytes=Uint8Array.from(atob(message.attachment.base64),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));const a=document.createElement('a');a.href=url;a.download=message.attachment.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
 return <details><summary>Boîte de courriels de test PREPROD</summary><p>Aucun message n’est envoyé à une boîte externe. Seuls vos messages de cette clinique sont visibles, pendant 24 heures.</p><button onClick={()=>void load()}>Actualiser la boîte de test</button>{error&&<p role="alert">{error}</p>}
 {rows.map(r=><p key={r.id}><button onClick={()=>{setError('');void vetWorker<Message>('outbox-message',{id:r.id}).then(setMessage).catch(()=>setError('Message expiré ou inaccessible.'));}}>{r.kind==='authorization'?'Autorisation de signature':'Certificat'} — {r.recipient}</button></p>)}
 {message&&<article><h3>{message.subject}</h3><p>{message.text}</p>{message.link&&<a href={message.link} target="_blank" rel="noreferrer">Ouvrir le lien personnel de test</a>}{message.attachment&&<button onClick={download}>Télécharger le PDF joint au message de test</button>}</article>}</details>;
}
