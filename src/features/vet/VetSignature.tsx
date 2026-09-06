import { VetPublicCertificate, type PublicCertificate } from './VetPublicCertificate';
import { useEffect,useRef,useState } from 'react';
import { requireSupabase } from '../../lib/supabase';
import { vetWorker,vetRpc,vetLocalServices } from '../../services/vetServices';
type Point=[number,number];
type Summary={authorized_account_name:string;clinic:string;clinic_contact:string;name:string;permit:string;attestation:string;expires_at:string;valid_days:number};
const date=(v:string)=>new Intl.DateTimeFormat('fr-CA',{dateStyle:'long',timeStyle:'short',timeZone:'America/Toronto'}).format(new Date(v));
function SignAuthorization({token,onDone}:{token:string;onDone:()=>void}) {
 const [summary,setSummary]=useState<Summary|null>(null),[error,setError]=useState(''),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false);
 const canvas=useRef<HTMLCanvasElement>(null),strokes=useRef<Point[][]>([]),drawing=useRef(false);
 useEffect(()=>{void vetWorker<Summary>('authorization-summary',{token},true).then(setSummary).catch(e=>setError(e.message));},[token]);
 function point(e:React.PointerEvent<HTMLCanvasElement>):Point{const r=e.currentTarget.getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
 function paint(){const c=canvas.current;if(!c)return;const ctx=c.getContext('2d')!;ctx.clearRect(0,0,c.width,c.height);ctx.strokeStyle='#18312c';ctx.lineWidth=2;ctx.lineCap='round';for(const line of strokes.current){ctx.beginPath();line.forEach(([x,y],i)=>i?ctx.lineTo(x*c.width,y*c.height):ctx.moveTo(x*c.width,y*c.height));ctx.stroke();}}
 return <div className="vet-guide"><h3>Autorisation du vétérinaire</h3>{error&&<p role="alert">{error}</p>}{summary&&<>
 <p>Je suis <strong>{summary.name}</strong>, permis <strong>{summary.permit}</strong>, vétérinaire vérifié auprès de l’OMVQ — statut actif.</p>
 <p>Clinique autorisée : <strong>{summary.clinic}</strong><br/>{summary.clinic_contact}</p>
 <p><strong>Compte personnel autorisé : {summary.authorized_account_name}</strong></p>
 <p>Cette autorisation permet à ce compte, au sein de la clinique, d’émettre les certificats en votre nom, sans demande de signature pour chaque certificat. Elle sera valable {summary.valid_days} jours et pourra être révoquée par la clinique. Pour la retirer, contactez la clinique aux coordonnées ci-dessus.</p>
 <blockquote>{summary.attestation}</blockquote><p>Demande valable jusqu’au {date(summary.expires_at)}.</p>
 <fieldset disabled={busy}><label><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> Je suis le vétérinaire indiqué et j’accepte cette autorisation.</label>
 <p>Dessinez votre signature avec la souris ou le doigt.</p><canvas aria-label="Signature du vétérinaire" ref={canvas} width={640} height={200} style={{width:'100%',maxWidth:640,height:200,touchAction:'none',border:'1px solid #617e71',background:'white'}}
 onPointerDown={e=>{if(busy)return;drawing.current=true;e.currentTarget.setPointerCapture(e.pointerId);strokes.current.push([point(e)]);}}
 onPointerMove={e=>{if(drawing.current&&!busy&&strokes.current.flat().length<3000){strokes.current[strokes.current.length-1].push(point(e));paint();}}}
 onPointerUp={()=>{drawing.current=false;strokes.current=strokes.current.filter(s=>s.length>1);paint();}} onPointerCancel={()=>{drawing.current=false;}}/>
 <button onClick={()=>{strokes.current=[];paint();}}>Effacer la signature</button>
 <button disabled={!accepted} onClick={()=>{setBusy(true);setError('');void vetWorker('authorization-approve',{token,visual:strokes.current,accepted},true).then(onDone).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Signer l’autorisation préalable</button></fieldset>
 <p>Signature électronique avec piste d’audit ; aucune qualification juridique particulière n’est attribuée à ce mécanisme.</p>
 </>}</div>;
}
type Authorization={id:string;status:string;method:string;expires_at:string;valid_until:string|null;authorized_at:string|null};
export function VetAuthorizationPanel({practitionerId,admin=false}:{practitionerId:string;admin?:boolean}) {
 const [items,setItems]=useState<Authorization[]>([]),[token,setToken]=useState(''),[email,setEmail]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const profile=await vetRpc<string>('current_profile_id');const {data,error}=await requireSupabase().from('vet_signature_authorizations').select('id,status,method,expires_at,valid_until,authorized_at').eq('practitioner_id',practitionerId).eq('requested_by',profile).order('created_at',{ascending:false});if(error)throw error;setItems(data??[]);}
 useEffect(()=>{void load().catch(e=>setNotice(e.message));},[practitionerId]);
 const [testAccount,setTestAccount]=useState('');
 const localTest=admin&&import.meta.env.DEV&&import.meta.env.VITE_DEPLOY_ENV==='local'&&import.meta.env.VITE_VET_LOCAL_PROXY==='true';
 const active=items.find(a=>a.status==='active'&&a.valid_until&&new Date(a.valid_until)>new Date());
 async function request(method:string){if(busy)return;setBusy(true);setNotice('');try{const r=await vetWorker<{token?:string}>('authorization-request',{practitioner_id:practitionerId,method,email});setToken(r.token??'');await load();if(!r.token)setNotice('Lien personnel capturé dans Mailpit. Aucun envoi externe.');}catch(e){setNotice(e instanceof Error?e.message:'Demande impossible.');}finally{setBusy(false);}}
 if(!vetLocalServices)return <div className="vet-guide"><h4>En attente de vérification</h4><p>Le service de vérification et de signature n’est pas encore disponible dans cet environnement. Vous pouvez préparer et enregistrer le brouillon.</p></div>;
 return <div className="vet-guide"><h4>Signature automatique — autorisation préalable</h4>
 <p>{active?`Autorisation active jusqu’au ${date(active.valid_until!)}. Votre compte peut apposer la signature automatiquement à l’émission, quel que soit l’appareil utilisé.`:'En attente d’autorisation : le vétérinaire doit autoriser votre compte personnel dans cette clinique une seule fois avant toute émission.'}</p>
 {localTest&&<details><summary>Simulation pour les tests locaux</summary><p>Crée une autorisation fictive valable 24 heures. Aucun consentement réel du vétérinaire n’est attesté. Les certificats seront marqués TEST et ne constitueront pas une preuve vaccinale reconnue.</p><label>Compte à autoriser pour le test (courriel)<input type="email" value={testAccount} onChange={e=>setTestAccount(e.target.value)} placeholder="Vide : mon compte administrateur"/></label><button disabled={busy} onClick={()=>{setBusy(true);setNotice('');void vetWorker('authorization-test',{practitioner_id:practitionerId,email:testAccount}).then(async()=>{await load();setNotice('Autorisation de test créée pour le compte indiqué (ou votre compte si le champ est vide). Vous pouvez émettre un certificat TEST.');}).catch(e=>setNotice(e.message)).finally(()=>setBusy(false));}}>Créer l’autorisation de test</button></details>}
 {active?.method==='local_test'&&<p><strong>SIMULATION LOCALE — aucune autorisation réelle du vétérinaire.</strong></p>}
 {notice&&<p role="status">{notice}</p>}
 {!active&&<fieldset disabled={busy}><button onClick={()=>void request('clinic_device')}>Le vétérinaire autorise sur cet appareil</button><label>Courriel personnel du vétérinaire<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><button onClick={()=>void request('personal_link')}>Envoyer un lien d’autorisation — test local</button></fieldset>}
 {token&&<SignAuthorization token={token} onDone={()=>{setToken('');setNotice('Autorisation signée. Vous pouvez émettre les certificats.');void load();}}/>}
 {items.slice(0,5).map(a=><p key={a.id}>{a.status==='active'?(a.valid_until&&new Date(a.valid_until)>new Date()?'Autorisation active':'Autorisation expirée'):a.status==='pending'?(new Date(a.expires_at)>new Date()?'En attente de signature de l’autorisation':'Demande de signature expirée'):a.status==='revoked'?'Autorisation révoquée':'Demande annulée'}
 {['active','pending'].includes(a.status)&&<button disabled={busy} onClick={()=>{if(window.confirm('Annuler cette demande ou révoquer cette autorisation ? Les certificats déjà émis seront conservés.')){setBusy(true);void vetRpc('vet_cancel_authorization',{p_id:a.id}).then(()=>{setToken('');return load();}).catch(e=>setNotice(e.message)).finally(()=>setBusy(false));}}}>{a.status==='active'?'Révoquer l’autorisation':'Annuler la demande'}</button>}</p>)}
 </div>;
}
export function VetPublicPage(){
 const [token]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token')??'');const [done,setDone]=useState(false),[status,setStatus]=useState<PublicCertificate|null>(null),[error,setError]=useState('');
 const verify=window.location.pathname.startsWith('/vet/verify/');
 useEffect(()=>{if(!verify){window.history.replaceState(null,'',window.location.pathname);return;}const number=window.location.pathname.split('/').pop();void vetRpc<PublicCertificate|null>('vet_public_certificate_status',{p_number:number}).then(v=>v?setStatus(v):setError('Certificat introuvable.')).catch(()=>setError('Vérification temporairement indisponible.'));},[]);
 const labels:Record<string,string>={test:'TEST — certificat simulé, sans valeur de preuve vaccinale',valid:'Certificat valide et signé',superseded:'Remplacé par une correction',revoked:'Révoqué',unverified:'Certificat non vérifié ou non signé'};
 return <main className="vet-app"><h1>{verify?'Vérifier un certificat HSP':'Autorisation personnelle du vétérinaire'}</h1>{error&&<p role="alert">{error}</p>}
 {verify?status&&<div className="vet-guide"><h2>{labels[String(status.status)]}</h2><p>{String(status.number)} · Version {String(status.version)}</p>{!!status.issued_at&&<p>Émis le {date(String(status.issued_at))}</p>}{!!status.replacement_number&&<a href={`/vet/verify/${status.replacement_number}`}>Consulter la correction</a>}{status.status==='test'&&['revoked','superseded'].includes(status.certificate_status)&&<p>{labels[status.certificate_status]}</p>}<VetPublicCertificate certificate={status}/></div>:done?<p>Votre autorisation est enregistrée. Ce lien ne peut plus être utilisé. Vous pouvez fermer cette page.</p>:token?<SignAuthorization token={token} onDone={()=>setDone(true)}/>:<p>Lien absent ou incomplet. Ouvrez le lien personnel reçu de votre clinique.</p>}
 </main>;
}
