// Browser test harness only; never imported by the application.
import React from 'react';
import '../../src/theme.css';
import '../../src/styles.css';
import {createRoot} from 'react-dom/client';
import {Dashboard} from '../../src/features/dashboard/Dashboard';
import {translations} from '../../src/lib/i18n';
import {financeRoute} from '../../src/features/finance/navigation';
import {FinanceView} from '../../src/features/finance/FinanceView';
function Harness(){const [url,setUrl]=React.useState(location.href);React.useEffect(()=>{const fn=()=>setUrl(location.href);addEventListener('popstate',fn);return()=>removeEventListener('popstate',fn);},[]);if(new URL(url).searchParams.has('shell')){
 const org={id:'org-demo',name:'Association fictive',currency:'CAD',subscription_plan:'premium'};
 const context=new Proxy({profile:{id:'demo-user',user_id:'demo-auth',first_name:'Faux',last_name:'Payeur'},isPlatformAdmin:false,organizations:[org],organizationMembers:[{organization_id:org.id,user_id:'demo-user',role:'admin'}],shows:[{id:'show-demo',organization_id:org.id,name:'Concours fictif',start_date:'2026-09-06',end_date:'2026-09-07',status:'published'},{id:'show-second',organization_id:org.id,name:'Deuxième concours fictif',start_date:'2026-10-01',end_date:'2026-10-02',status:'draft'}]},{get:(o,k)=>k in o?(o as any)[k]:[]});
 const props=new Proxy({activeView:financeRoute()?.view??'billing',context,selectedOrganizationId:org.id,locale:'fr',t:translations.fr,loading:false,notice:null,onViewChange:()=>{},onChangeOrganization:()=>{}},{get:(o,k)=>k in o?(o as any)[k]:async()=>{}});
 return <Dashboard {...props as any}/>;
 }return <FinanceView key={url.split('?')[0]} org="org-demo" personal={location.pathname.startsWith('/me')} locale={new URL(url).searchParams.get('lang')??'fr'} identity="demo-user" legacy={<p>Legacy preserved</p>} contacts={[{id:'contact-demo',first_name:'Faux',last_name:'Payeur'}]}/>;}
createRoot(document.getElementById('root')!).render(<Harness/>);
