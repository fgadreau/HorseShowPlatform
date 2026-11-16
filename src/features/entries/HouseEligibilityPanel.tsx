import {useEffect,useId,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {errorMessage} from '../../lib/display';
import {grantHouseOverride,type HouseAssessment} from '../../services/houseEligibility';
import {requireSupabase} from '../../lib/supabase';
import type {ClassRecord} from '../../types/domain';
import type {Locale} from '../../lib/i18n';
export function HouseEligibilityPanel({rows,classes,horse,rider,locale,canOverride=false,onRefresh}:{rows:HouseAssessment[];classes:ClassRecord[];horse:string;rider:string;locale:Locale;canOverride?:boolean;onRefresh:()=>void}){
 const [expanded,setExpanded]=useState(false);
 const contentId=useId();
 const [reason,setReason]=useState(''),[classId,setClassId]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [audit,setAudit]=useState<Array<{id:string;class_id:string;reason:string;created_at:string;actor_id:string;actor?:{first_name:string|null;last_name:string|null}|null}>>([]);
 const signature=rows.filter(r=>r.overridden).map(r=>r.class_id).sort().join(',');
 useEffect(()=>{setAudit([]);if(!canOverride||!signature)return;let live=true;void requireSupabase().from('house_eligibility_overrides').select('id,class_id,reason,created_at,actor_id,actor:user_profiles!house_eligibility_overrides_actor_id_fkey(first_name,last_name)').in('class_id',signature.split(',')).eq('horse_id',horse).eq('rider_contact_id',rider).order('created_at',{ascending:false}).then(({data,error})=>{if(live){if(error)setError(error.message);else setAudit((data??[]) as unknown as typeof audit);}});return()=>{live=false;};},[signature,horse,rider,canOverride]);
 const applicable=rows.filter(r=>r.applies),blocked=applicable.filter(r=>!r.can_proceed),t=(a:string,b:string)=>locale==='fr'?a:b;
 if(!applicable.length)return null;
 return <div>
  <button className="text-button" type="button" aria-expanded={expanded} aria-controls={contentId} style={{display:'inline-flex',alignItems:'center',gap:6}} onClick={()=>setExpanded(value=>!value)}><ChevronDown size={14} aria-hidden="true" style={{transform:expanded?undefined:'rotate(-90deg)'}}/>{t('Éligibilité maison','House eligibility')}</button>
  <div id={contentId} hidden={!expanded}>
  <section className="stack form-section"><h3>{t('Éligibilité aux classes maison','House class eligibility')}</h3>
  {applicable.map(r=><div key={r.class_id}><strong>{classes.find(c=>c.id===r.class_id)?.name}</strong><p>{r.overridden?t('Dérogation enregistrée.','Override recorded.'):r.can_proceed?t('Admissible selon les règles maison.','Eligible under house rules.'):r.reasons.join(' ')}</p></div>)}
  <button className="text-button" type="button" disabled={busy} onClick={onRefresh}>{t('Relancer les vérifications maison','Retry house checks')}</button>
  {error?<p role="alert">{error}</p>:null}
  {canOverride&&blocked.length?<div className="stack"><label>{t('Classe à autoriser par dérogation','Class to override')}<select aria-label={t('Classe à autoriser par dérogation','Class to override')} value={classId} onChange={e=>setClassId(e.target.value)}><option value="">—</option>{blocked.map(r=><option key={r.class_id} value={r.class_id}>{classes.find(c=>c.id===r.class_id)?.name}</option>)}</select></label><label>{t('Raison obligatoire de la dérogation','Required override reason')}<textarea minLength={5} maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="secondary-button" disabled={busy||!blocked.some(r=>r.class_id===classId)||reason.trim().length<5} type="button" onClick={()=>{setBusy(true);setError('');void grantHouseOverride(classId,horse,rider,reason).then(()=>{setReason('');setClassId('');onRefresh();}).catch(e=>setError(errorMessage(e))).finally(()=>setBusy(false));}}>{t('Accorder la dérogation','Grant override')}</button></div>:null}
  {audit.map(a=><small key={a.id}>{classes.find(c=>c.id===a.class_id)?.name} · {a.reason} · {new Date(a.created_at).toLocaleString(locale)} · {t('Auteur','Author')} : {[a.actor?.first_name,a.actor?.last_name].filter(Boolean).join(' ')||t('Personnel autorisé','Authorized staff')}</small>)}
 </section></div></div>;
}
