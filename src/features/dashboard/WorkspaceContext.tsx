import {useRef, useState} from 'react';
import {Building2, CalendarDays, Check, ChevronDown, MapPin, Search, X} from 'lucide-react';
import type {Organization, Show} from '../../types/domain';
import './workspaceContext.css';

export function WorkspaceContext({organizations, shows, organization, show, showContext, loading, locale, onOrganizationChange, onShowChange}: {
 organizations: Organization[]; shows: Show[]; organization: Organization | null; show: Show | null;
 showContext: boolean; loading: boolean; locale: string;
 onOrganizationChange: (id: string) => void; onShowChange: (id: string) => void;
}) {
 const fr=locale==='fr', dialog=useRef<HTMLDialogElement>(null);
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const text=(a:string,b:string)=>fr?a:b;
 const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const available=shows.filter(s=>s.organization_id===organization?.id)
  .filter(s=>normalized(`${s.name} ${s.location??''} ${s.start_date}`).includes(normalized(search)))
  .sort((a,b)=>b.start_date.localeCompare(a.start_date)||a.name.localeCompare(b.name));
 const date=(s:Show)=>[s.start_date,s.end_date].filter(Boolean).map(d=>new Date(d+'T00:00:00').toLocaleDateString(fr?'fr-CA':'en-CA',{day:'numeric',month:'short',year:'numeric'})).join(' – ');
 const status=(s:Show)=>({open:text('Inscriptions ouvertes','Entries open'),draft:text('Brouillon','Draft'),closed:text('Fermé','Closed'),archived:text('Archivé','Archived'),published:text('Publié','Published')}[s.status]??s.status);
 function launch(){setSearch('');setOpen(true);dialog.current?.showModal();}
 return <>
  <button type="button" className="workspace-context-trigger" onClick={launch} aria-haspopup="dialog" aria-expanded={open} aria-label={text('Changer d’association ou de concours','Change association or show')}>
   <span className="workspace-context-icon"><Building2 size={20} aria-hidden="true"/></span>
   <span className="workspace-context-copy"><span className="workspace-context-caption">{text('Association active','Active association')}</span><strong>{organization?.name??text('Choisir une association','Choose an association')}</strong>
    {showContext&&<span className="workspace-context-show" data-testid="active-show-context" data-show-id={show?.id??''}><CalendarDays size={14} aria-hidden="true"/>{show?.name??text('Choisir un concours','Choose a show')}</span>}
   </span><span className="workspace-context-change">{text('Changer','Change')}<ChevronDown size={15} aria-hidden="true"/></span>
  </button>
  <span className="sr-only" role="status">{organization?.name}{showContext&&show?` · ${show.name}`:''}</span>
  <dialog ref={dialog} className="workspace-context-dialog" aria-labelledby="workspace-context-title" onClose={()=>setOpen(false)}>
   <header><div><span className="workspace-context-caption">{text('VOTRE ESPACE DE TRAVAIL','YOUR WORKSPACE')}</span><h2 id="workspace-context-title">{text('Choisir votre contexte','Choose your context')}</h2><p>{text('Sélectionnez l’association, puis le concours dans lequel vous souhaitez travailler.','Select the association, then the show you want to work in.')}</p></div><button type="button" className="workspace-context-close" aria-label={text('Fermer le sélecteur de contexte','Close context picker')} onClick={()=>dialog.current?.close()}><X size={20}/></button></header>
   <label className="workspace-context-association"><Building2 size={18} aria-hidden="true"/><span>Association<select aria-label="Association" value={organization?.id??''} disabled={loading||!organizations.length} onChange={e=>{setSearch('');onOrganizationChange(e.target.value);}}><option value="" disabled>{text('Choisir une association','Choose an association')}</option>{organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></span></label>
   {showContext&&<><label className="workspace-context-search"><Search size={18} aria-hidden="true"/><input autoFocus type="search" aria-label={text('Rechercher un concours','Search shows')} placeholder={text('Nom, lieu ou date du concours…','Show name, location or date…')} value={search} onChange={e=>setSearch(e.target.value)}/></label><div className="workspace-context-options" aria-busy={loading}>
    {loading?<p role="status">{text('Chargement des concours…','Loading shows…')}</p>:available.length?available.map(s=><button type="button" key={s.id} className={`workspace-context-option ${s.id===show?.id?'selected':''}`} aria-pressed={s.id===show?.id} data-show-id={s.id} onClick={()=>{onShowChange(s.id);dialog.current?.close();}}><CalendarDays size={21} aria-hidden="true"/><span><strong>{s.name}</strong><small>{date(s)}</small>{s.location&&<small><MapPin size={12} aria-hidden="true"/>{s.location}</small>}<span className="workspace-context-status">{status(s)}</span></span>{s.id===show?.id&&<Check size={18} aria-hidden="true"/>}</button>):<p className="workspace-context-empty">{search?text('Aucun concours ne correspond à cette recherche.','No shows match this search.'):text('Aucun concours accessible dans cette association.','No accessible shows in this association.')}</p>}
   </div></>}
   <footer><span>{text('Vos droits d’accès restent propres à chaque association.','Your access is specific to each association.')}</span><button type="button" onClick={()=>dialog.current?.close()}>{text('Terminé','Done')}</button></footer>
  </dialog>
 </>;
}
