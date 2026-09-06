import type {ViewKey} from '../../types/ui';
export const showSections:Record<string,ViewKey>={overview:'shows',entries:'entries',reservations:'stalls',schedule:'blocks',accounts:'show-accounts',scoring:'scoring',results:'results',health:'health'};
export function financeRoute(path=window.location.pathname){
 const p=path.split('/').filter(Boolean);
 if(p[0]==='me'&&p[1]==='accounts')return {view:'my-invoices' as ViewKey,org:'',show:'',folio:p[2]??''};
 if(p[0]==='associations'&&p[1]){
  if(p[2]==='finance')return {view:'billing' as ViewKey,org:p[1],show:'',folio:p[3]==='accounts'?p[4]??'':''};
  if(p[2]==='shows')return {view:showSections[p[4]??'overview']??'shows',org:p[1],show:p[3]??'',folio:''};
 }
 return null;
}
export function navigateBilling(path:string){window.history.pushState({},'',path);window.dispatchEvent(new PopStateEvent('popstate'));}
