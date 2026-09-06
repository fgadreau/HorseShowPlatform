// Local visual fixture only. Not an application entry point or a production route.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/styles.css';
import { translations } from '../../src/lib/i18n';
import { AuthScreen } from '../../src/features/auth/AuthScreen';
import { Dashboard } from '../../src/features/dashboard/Dashboard';
import { LandingPage } from '../../src/features/shows/LandingPage';
import { PublicShowPage } from '../../src/features/shows/PublicShowPage';
import { ShowEditForm } from '../../src/features/shows/ShowEditForm';
import { ModalDialog } from '../../src/components/ui';
import { VetApp } from '../../src/features/vet/VetApp';
const org = {id:'preview-org',name:'Association de démonstration',currency:'CAD',plan_tier:'professional',country:'CA'};
const show = {id:'preview-show',organization_id:org.id,name:'Concours de septembre',slug:'demo',start_date:'2026-09-18',end_date:'2026-09-20',status:'published',is_public:true,location:'Québec',default_currency:'CAD',organizations:{name:org.name}};
// All requests stay in this fixture; no credentials or real data are used.
window.fetch = async (input) => {
 const url = new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
 let data: unknown = [];
 if(url.pathname.endsWith('/token')) data={access_token:'eyJhbGciOiJIUzI1NiJ9.'+btoa(JSON.stringify({sub:'preview-vet',exp:Math.floor(Date.now()/1000)+3600}))+'.preview',refresh_token:'fixture-only',expires_in:3600,token_type:'bearer',user:{id:'preview-vet',email:'vet@example.test'}};
 else if(url.pathname.includes('/auth/')) data={id:'preview-vet',email:'vet@example.test'};
 else if(url.pathname.endsWith('/vet_issuers')) data=[{id:'clinic',name:'Clinique de démonstration',kind:'clinic',status:'active',contact_details:'Québec'}];
 else if(url.pathname.endsWith('/is_platform_admin')) data=false;
 else if(url.pathname.endsWith('/shows')) data=url.searchParams.has('slug')?show:[show];
 else if(url.pathname.endsWith('/organizations')) data=org;
 else if(url.pathname.endsWith('/organization_health_policies')) data=null;
 else if(url.pathname.endsWith('/show_days')) data=[{id:'day',show_id:show.id,day_date:show.start_date,day_name:'Vendredi',sort_order:0}];
 return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
};
const noop=async()=>{};
function Preview(){
 const params=new URLSearchParams(location.search);
 const [screen,setScreen]=useState(params.get('screen')||'auth');
 const [locale,setLocale]=useState(params.get('locale')==='en'?'en':'fr');
 const [view,setView]=useState('shows');const [modal,setModal]=useState(screen==='form');
 const context={profile:{id:'preview-user',user_id:'preview-user',first_name:'Camille',last_name:'Martin',email:'camille@example.test',type_user:'secretary'},organizations:[org],organizationMembers:[{organization_id:org.id,user_id:'preview-user',role:'secretary'}],shows:[show,{...show,id:'second',name:'Finale de saison',status:'draft'}]};
 const dashboardProps=new Proxy({activeView:view,context,locale,t:translations[locale],loading:false,notice:null,selectedOrganizationId:org.id,onViewChange:setView,onLocaleChange:setLocale},{get:(obj,key)=>key in obj?obj[key]:noop});
 return <><div style={{padding:'8px 16px',background:'#fef3c7',color:'#78350f',fontSize:13}}>APERÇU LOCAL — données fictives · {['auth','navigation','form','public','show','vet'].map(s=><a style={{marginRight:12,color:'inherit'}} key={s} href={`?screen=${s}&locale=${locale}`}>{s}</a>)}</div>
 {screen==='auth'?<AuthScreen locale={locale} t={translations[locale]} notice={null} onLocaleChange={setLocale} onNotice={noop}/>:
 screen==='public'?<LandingPage onSignIn={()=>setScreen('auth')}/>:
 screen==='show'?<PublicShowPage slug="demo"/>:
 screen==='vet'?<VetApp/>:<Dashboard {...dashboardProps}/>}
 {modal&&<ModalDialog title={locale==='fr'?'Modifier le concours':'Edit show'} onClose={()=>setModal(false)}><ShowEditForm locale={locale} show={show} onCancel={()=>setModal(false)} onUpdateShow={noop}/></ModalDialog>}
 </>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
