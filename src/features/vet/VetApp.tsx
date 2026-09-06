import { Brand } from "../../components/Brand";
import { useVetServices } from './useVetServices';
import { VetTestOutbox } from './VetTestOutbox';
import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { vetLoad, vetRpc, vetVerify, vetLocalServices, vetPendingServices, vetCertificateFile, emptyPayload, emptyAdministration } from '../../services/vetServices';
import type { VetAdministration, VetCertificate, VetPayload } from '../../services/vetServices';
import './vet.css';
import { HorsePicker } from './HorsePicker';
import { VetAuthorizationPanel, VetPublicPage } from './VetSignature';

type Context = Awaited<ReturnType<typeof vetLoad>>;
const statusLabels = { draft: 'Brouillon', issued: 'Signé et valide', superseded: 'Remplacé par une correction', revoked: 'Révoqué' };
function certificateLabel(c: VetCertificate) {
 const test=(c.snapshot?.signature as {signed_content?:{test_only?:boolean}})?.signed_content?.test_only;
 if(test)return `TEST — ${c.status==='issued'?'certificat simulé':statusLabels[c.status]}`;
 return c.status==='issued'&&!c.signature_id?'Ancien certificat non signé':statusLabels[c.status];
}
const diseaseLabels: Record<string, string> = { influenza: 'Influenza', ehv_1: 'EHV-1', ehv_4: 'EHV-4' };
const verificationMessages: Record<string, string> = {
 verified: 'Vétérinaire vérifié : le nom et le permis correspondent, et le statut OMVQ est Actif.',
 name_mismatch: 'Le nom ne correspond pas au permis dans le répertoire OMVQ. Corrigez le nom ci-dessous, puis relancez la vérification. Votre brouillon reste modifiable.',
 inactive: 'Le vétérinaire n’est pas actif dans le répertoire OMVQ. L’émission est bloquée ; le brouillon est conservé.',
 ambiguous: 'Le répertoire ne permet pas de confirmer une fiche unique avec ce permis. Vérifiez le permis avant de réessayer.',
 unavailable: 'Le répertoire OMVQ est temporairement inaccessible. Enregistrez votre brouillon et réessayez plus tard.',
 not_found: 'Aucun vétérinaire trouvé pour ce permis. Corrigez le numéro, puis réessayez.',
};
const errorMessages: Record<string, string> = {
 VET_FRESH_VERIFICATION_REQUIRED: 'Vérifiez le vétérinaire à l’étape 1 avant d’émettre le certificat.',
 VET_REASON_REQUIRED: 'Indiquez le motif de révocation dans le champ prévu sous le certificat.',
 VET_REASON_TOO_LONG: 'Le motif de révocation doit comporter au maximum 2 000 caractères.',
 VET_PRIOR_AUTHORIZATION_REQUIRED: 'Le vétérinaire doit d’abord autoriser votre compte personnel à apposer sa signature dans cette clinique (étape 1).',
 VET_DELIVERY_EMAIL_REQUIRED: 'Indiquez au moins un courriel de transmission : propriétaire ou écurie/agent.',
 VET_OWNER_DETAILS_REQUIRED: 'Complétez le nom et les coordonnées du propriétaire à l’étape 2.',
 VET_CONFIRMED_HORSE_REQUIRED: 'Recherchez et rattachez le cheval à l’étape 3.',
 VET_PRODUCT_DETAILS_REQUIRED: 'Chaque vaccin doit avoir un nom commercial, un fabricant et un numéro de lot.',
 VET_INVALID_DATES: 'Vérifiez les dates : administration au plus tard aujourd’hui, produit non expiré à cette date et rappel après l’administration.',
 VET_VALIDITY_REQUIRED: 'Indiquez une date de rappel ou une durée déclarée pour chaque vaccin.',
 VET_DISEASES_REQUIRED: 'Cochez au moins une maladie couverte par chaque vaccin.',
 VET_SEARCH_CRITERIA_REQUIRED: 'Pour rechercher, indiquez le nom du cheval ET celui du propriétaire, un numéro d’enregistrement ou une micropuce.',
 VET_RATE_LIMIT: 'Veuillez patienter avant de relancer une recherche OMVQ.',
 VET_OMVQ_DISABLED: 'La vérification OMVQ est désactivée. Votre brouillon peut être enregistré.',
};
function friendlyError(message: string) {
 return Object.entries(errorMessages).find(([key]) => message.includes(key))?.[1]
  ?? (message.includes('vet_practitioners_declaration_key') ? 'Ce vétérinaire existe déjà. Sélectionnez sa fiche dans la liste.' : message);
}
function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
 return <label>{label}<input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} /></label>;
}
export function VetApp() {
 if(window.location.pathname.startsWith('/vet/authorize') || window.location.pathname.startsWith('/vet/verify/')) return <VetPublicPage />;
 return <VetPrivateApp />;
}
function VetPrivateApp() {
 const services=useVetServices();
 const [session, setSession] = useState<Session | null>(null);
 const sessionUser = useRef<string | null>(null);
 const [ready, setReady] = useState(false);
 const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
 const [context, setContext] = useState<Context | null>(null);
 const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false); const lock = useRef(false);
 const [editorKey,setEditorKey]=useState(0);
 const [selected, setSelected] = useState<VetCertificate | null>(null);
 const [payload, setPayload] = useState<VetPayload>(emptyPayload);
 const [practitioner, setPractitioner] = useState('');
 const [correctingPractitioner, setCorrectingPractitioner] = useState(false);
 const [practitionerEditor, setPractitionerEditor] = useState(false);
 const [vetName, setVetName] = useState(''); const [vetPermit, setVetPermit] = useState('');
 const [deliveryOwner, setDeliveryOwner] = useState('');const [deliveryAgent, setDeliveryAgent] = useState('');
 const [deliveryId, setDeliveryId] = useState(() => crypto.randomUUID());
 const [deliveries, setDeliveries] = useState<{recipient: string;status: string;created_at: string}[]>([]);
 const [health, setHealth] = useState<Record<string, { status: string; reason?: string; certificate_id: string | null; valid_until: string | null }> | null>(null);
 const [issuerName, setIssuerName] = useState(''); const [issuerKind, setIssuerKind] = useState('clinic'); const [issuerContact, setIssuerContact] = useState('');
 const [linkMinutes,setLinkMinutes]=useState('30'),[authorizationDays,setAuthorizationDays]=useState('365');
 const [memberEmail, setMemberEmail] = useState(''); const [ttl, setTtl] = useState('24'); const [enabled, setEnabled] = useState(false); const [reason, setReason] = useState('');
 useEffect(() => {
  if (!supabase) { setReady(true); return; }
  const updateSession = (s: Session | null) => {
   const userId = s?.user.id ?? null;
   if (sessionUser.current !== userId) { setContext(null); setSelected(null); }
   sessionUser.current = userId;
   setSession(s); setReady(true);
  };
  void supabase.auth.getSession().then(({ data }) => updateSession(data.session));
  const { data } = supabase.auth.onAuthStateChange((_e, s) => updateSession(s));
  return () => data.subscription.unsubscribe();
 }, []);
 useEffect(() => { if (session) void refresh().catch(e => setNotice(e.message)); }, [session?.user.id]);
 async function refresh(id?: string) {
  const ctx = await vetLoad(id); setContext(ctx); return ctx;
 }
 async function act(fn: () => Promise<void>) {
  if (lock.current) return; lock.current = true; setBusy(true); setNotice('');
  try { await fn(); } catch (e) { setNotice(e instanceof Error ? friendlyError(e.message) : 'Opération impossible.'); }
  finally { lock.current = false; setBusy(false); }
 }
 function open(c: VetCertificate | null) {
  setEditorKey(k=>k+1);
  setPractitionerEditor(false); setNotice('');setDeliveries([]);setDeliveryId(crypto.randomUUID());
  setDeliveryOwner(c?.payload.owner.email ?? '');setDeliveryAgent(c?.payload.agent.email ?? '');
  setSelected(c); setPayload(c?.payload ?? emptyPayload()); setPractitioner(c?.practitioner_id ?? '');setHealth(null);
 }
 async function save(practitionerId = practitioner) {
  if (!context?.issuerId) throw new Error('Émetteur requis.');
  const c = await vetRpc<VetCertificate>('vet_save_draft', { p_issuer: context.issuerId, p_id: selected?.id ?? crypto.randomUUID(), p_revision: selected?.revision ?? 1, p_practitioner: practitionerId || null, p_payload: payload });
  setSelected(c); await refresh(context.issuerId);return c;
 }
 function administration(index: number, key: keyof VetAdministration, value: string | string[]) {
  setPayload(p => ({ ...p, administrations: p.administrations.map((a, i) => i === index ? { ...a, [key]: value } : a) }));
 }
 const issuer = context?.issuers.find(i => i.id === context.issuerId);
 const currentPractitioner = context?.practitioners.find(p => p.id === practitioner);
 const check = context?.checks.find(c => c.practitioner_id === practitioner);
 const readOnly = !!selected && selected.status !== 'draft';
 if (!supabase) return <main className="vet-app"><Brand /><h1>Portail vétérinaire</h1><p>Configurer Supabase local pour accéder au pilote.</p></main>;
 if (!ready) return <main className="vet-app">Chargement…</main>;
 return <main className="vet-app">
  <header><div><a href="/"><Brand /></a><p>HSP · Pilote privé</p><h1>Certificats vétérinaires</h1></div><nav><a href="/">HSP</a>{session && <button onClick={() => void act(async () => { const { error } = await supabase!.auth.signOut({ scope: 'local' }); if (error) throw error; })}>Déconnexion</button>}</nav></header>
  {!services.ready && <p className="vet-notice" role="status">PREPROD — préparation des certificats. {vetPendingServices}</p>}
  {notice && <p role="alert" className="vet-notice">{notice}</p>}
  {!session ? <form onSubmit={e => { e.preventDefault();void act(async () => { const { error } = await supabase!.auth.signInWithPassword({ email, password });if (error) throw error; }); }}>
   <h2>Connexion privée</h2><p>Accès réservé aux comptes autorisés par HSP.</p><Field label="Courriel" value={email} onChange={setEmail} type="email" required /><Field label="Mot de passe" value={password} onChange={setPassword} type="password" required /><button className="primary-button" disabled={busy}>Se connecter</button>
  </form> : !context ? <p>Chargement des accès…</p> : <>
   {!context.issuers.length && !context.admin && <p role="alert">Accès vétérinaire refusé. Votre compte ne possède aucun émetteur actif autorisé.</p>}
   {!!context.issuers.length && <label>Émetteur<select aria-label="Émetteur" value={context.issuerId} onChange={e => { open(null);void act(async () => { await refresh(e.target.value); }); }}>{context.issuers.map(i => <option key={i.id} value={i.id}>{i.name} — {i.status}</option>)}</select></label>}
   {!vetLocalServices&&context.issuerId&&<VetTestOutbox issuerId={context.issuerId}/>}
   {context.admin && <details><summary>Administration HSP — émetteurs et accès</summary><fieldset disabled={busy}>
    <h2>Autoriser un émetteur</h2><Field label="Nom de l’émetteur" value={issuerName} onChange={setIssuerName} /><label>Type<select value={issuerKind} onChange={e => setIssuerKind(e.target.value)}><option value="clinic">Clinique</option><option value="independent">Vétérinaire indépendant</option></select></label><Field label="Coordonnées de l’émetteur" value={issuerContact} onChange={setIssuerContact} />
    <button onClick={() => void act(async () => { const id = await vetRpc<string>('vet_admin_save_issuer', { p_id: null, p_name: issuerName, p_kind: issuerKind, p_contact_details: issuerContact, p_status: 'active' });open(null);await refresh(id); })}>Créer et autoriser</button>
    {issuer && <><h3>Accès à {issuer.name}</h3><Field label="Courriel du compte HSP existant" value={memberEmail} onChange={setMemberEmail} /><button onClick={() => void act(async () => { await vetRpc('vet_admin_set_member', { p_issuer: issuer.id, p_email: memberEmail, p_active: true });setNotice('Accès accordé.'); })}>Accorder l’accès</button><button onClick={() => void act(async () => { await vetRpc('vet_admin_set_member', { p_issuer: issuer.id, p_email: memberEmail, p_active: false });setNotice('Accès retiré.'); })}>Retirer l’accès</button>
    <button onClick={() => void act(async () => { await vetRpc('vet_admin_save_issuer', { p_id: issuer.id, p_name: issuer.name, p_kind: issuer.kind, p_contact_details: issuer.contact_details, p_status: issuer.status === 'active' ? 'suspended' : 'active' });open(null);await refresh(issuer.id); })}>{issuer.status === 'active' ? 'Suspendre cet émetteur' : 'Réactiver cet émetteur'}</button></>}
    <h3>Vérification OMVQ</h3>{!vetLocalServices&&<button onClick={()=>void act(async()=>{await import('../../services/vetServices').then(m=>m.vetWorker('browser-check',{}));setNotice('Navigateur et génération PDF PREPROD opérationnels. Aucun accès OMVQ effectué.');})}>Tester le navigateur PREPROD</button>}<label><input type="checkbox" disabled={!services.omvq} checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Autoriser la vérification OMVQ et l’émission</label><Field label="Fraîcheur maximale (heures, 1 à 168)" value={ttl} onChange={setTtl} type="number" /><button onClick={() => void act(async () => { await vetRpc('vet_admin_settings', { p_enabled: services.omvq && enabled, p_freshness_hours: Number(ttl) });setNotice('Configuration enregistrée.'); })}>Enregistrer la configuration</button>
    <h3>Autorisation préalable de signature</h3><Field label="Expiration du lien personnel (minutes, 5 à 120)" type="number" value={linkMinutes} onChange={setLinkMinutes}/><Field label="Durée de l’autorisation (jours, 1 à 365)" type="number" value={authorizationDays} onChange={setAuthorizationDays}/><button onClick={()=>void act(async()=>{await vetRpc('vet_set_signature_settings',{p_link_minutes:Number(linkMinutes),p_valid_days:Number(authorizationDays)});setNotice('Paramètres de signature enregistrés. Les autorisations existantes conservent leur échéance.');})}>Enregistrer les paramètres de signature</button>
   </fieldset></details>}
   {issuer?.status === 'active' && <div className="vet-layout"><aside><h2>Certificats</h2><button className="primary-button" disabled={busy} onClick={() => open(null)}>Nouveau brouillon</button><p>100 certificats les plus récents.</p>{context.certificates.map(c => <button aria-pressed={selected?.id === c.id} className="vet-list-item" key={c.id} onClick={() => open(c)}>{c.payload.horse?.name || 'Cheval à rattacher'}<small>{certificateLabel(c)} · {c.number?.slice(-8) ?? c.id.slice(0, 8)}</small></button>)}</aside>
    <section><h2>{selected ? certificateLabel(selected) : 'Nouveau certificat'}</h2>
     {selected?.snapshot && (selected.snapshot.signature as {signed_content?:{test_only?:boolean}})?.signed_content?.test_only && <p className="vet-notice"><strong>TEST — autorisation simulée. Ce certificat ne constitue pas une preuve vaccinale reconnue.</strong></p>}
     {selected?.number && <p>{selected.number}<br />Émis le {selected.issued_at ? new Date(selected.issued_at).toLocaleString('fr-CA') : ''}</p>}
     {!readOnly && <div className="vet-guide"><p><strong>Complétez les 4 étapes, puis émettez le certificat.</strong> Vous pouvez enregistrer un brouillon à tout moment et revenir le compléter depuis la liste à gauche.</p><ol>
      <li>{check?.result === 'verified' ? '✓' : '○'} Vétérinaire vérifié dans le répertoire OMVQ</li>
      <li>{payload.owner.name.trim() && payload.owner.contact_details.trim() ? '✓' : '○'} Propriétaire et coordonnées</li>
      <li>{selected?.horse_id ? '✓' : '○'} Cheval rattaché au dossier HSP</li>
      <li>Vaccins, dates et maladies couvertes à compléter ci-dessous</li>
     </ol><p>Une erreur de vérification ne ferme pas le brouillon. Vous pouvez corriger le vétérinaire ou en sélectionner un autre.</p></div>}
     <fieldset disabled={busy || readOnly}>
      <h3>1. Vétérinaire responsable</h3>
      <label>Vétérinaire responsable<select aria-label="Vétérinaire responsable" value={practitioner} onChange={e => setPractitioner(e.target.value)}><option value="">Sélectionner</option>{context.practitioners.map(p => <option value={p.id} key={p.id}>{p.name} — {p.permit_number}</option>)}</select></label>
      <button onClick={() => { setVetName('');setVetPermit('');setCorrectingPractitioner(false);setPractitionerEditor(true); }}>Ajouter un vétérinaire responsable</button>
      {currentPractitioner && <button onClick={() => { setVetName(currentPractitioner.name);setVetPermit(currentPractitioner.permit_number);setCorrectingPractitioner(true);setPractitionerEditor(true); }}>Corriger le nom ou le permis</button>}
      {practitionerEditor && <div className="vet-guide"><h4>Nom et permis du vétérinaire</h4><p>Aucun compte HSP n’est nécessaire pour ce vétérinaire. Une correction crée une nouvelle fiche ; les certificats déjà émis restent inchangés.</p><Field label="Nom du vétérinaire" value={vetName} onChange={setVetName} /><Field label="Numéro de permis OMVQ" value={vetPermit} onChange={setVetPermit} />
       <button disabled={!vetName.trim() || !vetPermit.trim()} onClick={() => void act(async () => {
        const existing = context.practitioners.find(p => p.name === vetName.trim() && p.permit_number === vetPermit.trim());
        const id = existing?.id ?? await vetRpc<string>('vet_add_practitioner', { p_issuer: issuer.id, p_name: vetName, p_permit: vetPermit });
        setPractitioner(id);await save(id);setPractitionerEditor(false);setNotice('Vétérinaire sélectionné et brouillon enregistré. Vous pouvez maintenant lancer la vérification OMVQ.');
       })}>{correctingPractitioner ? 'Enregistrer la correction' : 'Ajouter le vétérinaire'}</button><button onClick={() => setPractitionerEditor(false)}>Annuler</button></div>}
      <p>Le numéro doit être exact. Les accents, majuscules et titres (« Dre », « m.v. ») sont ignorés pour comparer le nom complet.</p>
      <button disabled={!practitioner} onClick={() => void act(async () => { await save();const result = await vetVerify(practitioner);await refresh(issuer.id);setNotice(verificationMessages[result.result] ?? 'Vérification non confirmée. Le brouillon reste modifiable.'); })}>Vérifier dans le répertoire OMVQ</button>
      {check && <div className="vet-guide" role="status"><p>{verificationMessages[check.result] ?? 'Vérification non confirmée.'}</p>
       {check.returned_name && <p>Fiche OMVQ : <strong>{check.returned_name}</strong> — permis {check.returned_permit} — {check.returned_status}</p>}
       <small>Dernière vérification : {new Date(check.checked_at).toLocaleString('fr-CA')}</small></div>}
      {practitioner && <VetAuthorizationPanel key={practitioner} practitionerId={practitioner} admin={context.admin} />}
      <h3>2. Propriétaire et destinataire</h3><p>Le nom et les coordonnées du propriétaire sont requis. L’écurie ou l’agent est facultatif.</p><Field label="Nom du propriétaire sur le certificat" value={payload.owner.name} onChange={v => setPayload(p => ({ ...p, owner: { ...p.owner, name: v } }))} /><label>Coordonnées du propriétaire<textarea value={payload.owner.contact_details} onChange={e => setPayload(p => ({ ...p, owner: { ...p.owner, contact_details: e.target.value } }))} /></label>
      <Field label="Courriel du propriétaire pour l’envoi" type="email" value={payload.owner.email ?? ''} onChange={v => setPayload(p => ({ ...p, owner: { ...p.owner, email: v } }))} />
      <Field label="Écurie ou agent" value={payload.agent.name} onChange={v => setPayload(p => ({ ...p, agent: { ...p.agent, name: v } }))} /><Field label="Courriel de l’écurie ou de l’agent" type="email" value={payload.agent.email} onChange={v => setPayload(p => ({ ...p, agent: { ...p.agent, email: v } }))} />
      <HorsePicker key={editorKey} payload={payload} horseId={selected?.horse_id??null} save={save} onPayload={setPayload} onLinked={async c=>{setSelected(c);setPayload(c.payload);await refresh(issuer.id);setNotice('Cheval rattaché au certificat.');}} />
      <h3>4. Vaccins administrés</h3><p>Ajoutez une administration par produit injecté, puis cochez toutes les maladies qu’il couvre. L’expiration est celle du flacon ; la date de rappel indique la fin de validité vaccinale.</p>
      {payload.administrations.map((a, index) => <div className="vet-administration" key={index}><h4>Administration {index + 1}</h4><div className="vet-grid">
       <Field label="Nom commercial" value={a.product} onChange={v => administration(index, 'product', v)} /><Field label="Fabricant" value={a.manufacturer} onChange={v => administration(index, 'manufacturer', v)} /><Field label="Lot ou série" value={a.lot} onChange={v => administration(index, 'lot', v)} />
       <Field label="Expiration du produit" type="date" value={a.product_expires_on} onChange={v => administration(index, 'product_expires_on', v)} /><Field label="Date d’administration" type="date" value={a.administered_on} onChange={v => administration(index, 'administered_on', v)} /><Field label="Date de rappel / fin de validité" type="date" value={a.valid_until} onChange={v => administration(index, 'valid_until', v)} />
       <Field label="Durée déclarée (si date inconnue)" value={a.declared_duration} onChange={v => administration(index, 'declared_duration', v)} /></div>
       <p>Maladies couvertes</p>{Object.entries(diseaseLabels).map(([key, label]) => <label key={key}><input type="checkbox" checked={a.diseases.includes(key)} onChange={e => administration(index, 'diseases', e.target.checked ? [...a.diseases, key] : a.diseases.filter(d => d !== key))} />{label}</label>)}
       <button disabled={payload.administrations.length === 1} onClick={() => setPayload(p => ({ ...p, administrations: p.administrations.filter((_a, i) => i !== index) }))}>Retirer cette administration</button>
      </div>)}
      <button onClick={() => setPayload(p => ({ ...p, administrations: [...p.administrations, emptyAdministration()] }))}>Ajouter une administration</button>
      <p>Une durée libre sans date de rappel sera conservée, mais donnera une conformité incomplète.</p>
      <button onClick={() => void act(async () => { await save();setNotice('Brouillon enregistré.'); })}>Enregistrer le brouillon</button>
      <p>Avant d’émettre, relisez les informations : après émission, toute correction nécessite une nouvelle version.</p>
      <p>La signature sera apposée automatiquement en vertu de l’autorisation préalable du vétérinaire. Relisez le cheval, le propriétaire, les vaccins, les lots et les dates avant de confirmer.</p>
      <button className="primary-button" onClick={() => void act(async () => { const c = await save();const issued = await vetRpc<VetCertificate>('vet_issue_certificate', { p_id: c.id });open(issued);await refresh(issuer.id);setNotice(certificateLabel(issued).startsWith('TEST')?'Certificat TEST émis avec une autorisation simulée.':'Certificat émis. Son contenu est désormais immuable.'); })}>Émettre le certificat</button>
     </fieldset>
     {selected?.status==='draft' && <button className="vet-danger" disabled={busy} onClick={()=>{if(window.confirm('Supprimer définitivement ce brouillon ? Les autres certificats seront conservés.'))void act(async()=>{await vetRpc('vet_delete_draft',{p_id:selected.id});open(null);await refresh(issuer.id);setNotice('Brouillon supprimé.');});}}>Supprimer le brouillon</button>}
     {readOnly && <div className="vet-guide"><h3>PDF et transmission</h3>
      <button disabled={busy} onClick={() => void act(async () => { await vetCertificateFile(selected.id);setNotice('PDF téléchargé. Vous pouvez l’ouvrir pour le lire ou l’imprimer.'); })}>Télécharger le certificat PDF</button>
      {selected.status === 'issued' && <><p><strong>Mode test :</strong> les courriels sont capturés dans {vetLocalServices?'Mailpit':'la boîte privée PREPROD'} avec le PDF en pièce jointe. Aucun courriel réel n’est transmis au propriétaire ou à l’agent.</p>
       <Field label="Envoyer au propriétaire — courriel" type="email" value={deliveryOwner} onChange={v => {setDeliveryOwner(v);setDeliveryId(crypto.randomUUID());}} />
       <Field label="Envoyer à l’agent — courriel" type="email" value={deliveryAgent} onChange={v => {setDeliveryAgent(v);setDeliveryId(crypto.randomUUID());}} />
       <p>Laissez vide un destinataire qui ne doit pas recevoir le certificat. Chaque destinataire reçoit un message séparé.</p>
       <button disabled={busy || (!deliveryOwner.trim() && !deliveryAgent.trim())} onClick={() => void act(async () => {
        await vetCertificateFile(selected.id,{request_id:deliveryId,owner_email:deliveryOwner,agent_email:deliveryAgent});
        setNotice('Courriels capturés dans la boîte de test, avec le PDF en pièce jointe. Aucun envoi externe.');
       })}>{vetLocalServices?'Envoyer le PDF — test local':'Capturer le PDF dans la boîte de test'}</button>
      </>}
      <button disabled={busy} onClick={() => void act(async () => { const {data,error}=await supabase!.from('vet_certificate_deliveries').select('recipient,status,created_at').eq('certificate_id',selected.id).order('created_at',{ascending:false});if(error)throw error;setDeliveries(data ?? []);setNotice(data?.length ? 'Historique actualisé.' : 'Aucun envoi enregistré.'); })}>Consulter les envois</button>
      {deliveries.map((d,i) => <p key={i}>{d.recipient} — {d.status==='local_captured'?'Capturé dans Mailpit':d.status==='preprod_captured'?'Capturé dans la boîte privée PREPROD':d.status==='queued'?'En attente': 'Résultat à vérifier dans Mailpit'} — {new Date(d.created_at).toLocaleString('fr-CA')}</p>)}
     </div>}
     {readOnly && <><p>Préparé par : {String(selected.snapshot?.prepared_name ?? "Personnel autorisé")} · {issuer.name}</p><details><summary>Instantané officiel conservé</summary><pre>{JSON.stringify(selected.snapshot, null, 2)}</pre></details>
      {selected.status === 'issued' && <button disabled={busy} onClick={() => void act(async () => { const c = await vetRpc<VetCertificate>('vet_correct_certificate', { p_id: selected.id });open(c);await refresh(issuer.id); })}>Préparer une nouvelle version</button>}
      {context.admin && selected.status === 'issued' && <><label>Motif de révocation<textarea aria-label="Motif de révocation" value={reason} maxLength={2000} onChange={e=>setReason(e.target.value)} placeholder="Exemple : erreur dans la date d’administration" /></label><p>Indiquez pourquoi ce certificat ne doit plus être reconnu. Un motif court est accepté.</p><button disabled={busy || !reason.trim()} onClick={() => void act(async () => { await vetRpc('vet_revoke_certificate', { p_id: selected.id, p_reason: reason.trim() });const ctx = await refresh(issuer.id);open(ctx.certificates.find(c => c.id === selected.id) ?? null);setReason('');setNotice('Certificat révoqué. Le motif est enregistré et l’original est conservé.'); })}>Révoquer ce certificat</button></>}
     </>}
     {selected?.horse_id && <><button disabled={busy} onClick={() => void act(async () => { setHealth(await vetRpc('vet_get_certificate_health', { p_certificate: selected.id })); })}>Actualiser l’état vaccinal du cheval</button>{health && <table><thead><tr><th>Maladie</th><th>État</th><th>Validité</th><th>Certificat source</th></tr></thead><tbody>{Object.entries(health).map(([d, v]) => <tr key={d}><td>{diseaseLabels[d]}</td><td>{v.reason==='test_certificate'?'Certificat TEST — ne constitue pas une preuve vaccinale':({valid:'Valide',expired:'Expiré',incomplete:'Incomplet',pending_verification:'Preuve non vérifiée ou signature non confirmée',missing:'Aucune preuve',future_date:'Administration à venir',revoked:'Certificat révoqué',superseded:'Certificat remplacé'} as Record<string,string>)[v.status]??'État indéterminé'}</td><td>{v.valid_until ?? 'Non déterminée'}</td><td>{v.certificate_id ?? 'Aucune preuve'}</td></tr>)}</tbody></table>}</>}
    </section>
   </div>}
  </>}
 </main>;
}
