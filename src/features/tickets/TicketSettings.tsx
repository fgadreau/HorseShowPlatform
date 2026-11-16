import {useEffect,useState} from 'react';
import {billingRpc} from '../../services/billingFolio';
import type {Block,Organization} from '../../types/domain';
import type {Locale} from '../../lib/i18n';
import {ticketCatalog,ticketError,type TicketCatalogItem,type TicketOption,type TicketTax} from './ticketService';
const newOption=():TicketOption=>({name:'',price:0,taxable:false,tax_mode:'exclusive',capacity:null,is_active:true,sort_order:0});
export function TicketSettings({block,organization,locale,onSaved}:{block:Block;organization:Organization;locale:Locale;onSaved:()=>void}){
 const fr=locale==='fr',t=(a:string,b:string)=>fr?a:b;
 const [initial,setInitial]=useState<TicketCatalogItem>(),[loaded,setLoaded]=useState(false),[options,setOptions]=useState<TicketOption[]>([newOption()]);
 const [policy,setPolicy]=useState('manual'),[capacity,setCapacity]=useState(''),[active,setActive]=useState(false),[open,setOpen]=useState(''),[close,setClose]=useState('');
 const [taxes,setTaxes]=useState<TicketTax[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const local=(date:string|null)=>date?new Date(new Date(date).getTime()-new Date(date).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
 useEffect(()=>{let live=true;void ticketCatalog(organization.id,block.show_id,true).then(items=>{if(!live)return;const item=items.find(i=>i.block.id===block.id);setInitial(item);if(item){setOptions(item.options);setTaxes(item.taxes);setPolicy(item.config.payment_policy);setCapacity(item.config.capacity?.toString()??'');setActive(item.config.is_active);setOpen(local(item.config.sales_open_at));setClose(local(item.config.sales_close_at));}setLoaded(true);}).catch(e=>{if(live)setError(ticketError(e,fr));});return()=>{live=false;};},[block.id,block.show_id,organization.id,fr]);
 function patch(index:number,change:Partial<TicketOption>){setOptions(rows=>rows.map((r,i)=>i===index?{...r,...change}:r));}
 return <form className="stack" onSubmit={e=>{e.preventDefault();setBusy(true);setError('');void billingRpc('save_ticket_block',{p_block:block.id,p_config:{payment_policy:policy,capacity:capacity?Number(capacity):null,is_active:active,sales_open_at:open?new Date(open).toISOString():null,sales_close_at:close?new Date(close).toISOString():null},p_options:options.map((o,i)=>({...o,sort_order:i})),p_taxes:taxes,p_revision:initial?.config.revision??null}).then(onSaved).catch(e=>setError(ticketError(e,fr))).finally(()=>setBusy(false));}}>
  <p>{t('Les commandes retiennent leurs places jusqu’au paiement ou à leur annulation par le secrétariat. Fermez les ventes avant de finaliser les comptes.','Orders retain their places until payment or cancellation by the secretary. Close sales before finalizing accounts.')}</p>
  {error?<p role="alert">{error}</p>:null}
  <fieldset className="stack nested-fieldset" disabled={busy||!loaded}><legend>{t('Ventes et capacité','Sales and capacity')}</legend>
   <label className="check-row"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/>{t('Publier les ventes dans les comptes HSP','Publish sales in HSP accounts')}</label>
   <label>{t('Mode de paiement','Payment policy')}<select value={policy} onChange={e=>setPolicy(e.target.value)}><option value="manual">{t('Gestion manuelle — ajout au compte','Manual — add to account')}</option><option value="pay_at_booking">{t('Paiement à la réservation','Pay when booking')}</option></select></label>
   <div className="form-grid"><label>{t('Capacité totale (facultative)','Total capacity (optional)')}<input type="number" min={1} step={1} value={capacity} onChange={e=>setCapacity(e.target.value)}/></label><label>{t('Ouverture des ventes','Sales open')}<input type="datetime-local" value={open} onChange={e=>setOpen(e.target.value)}/></label><label>{t('Fermeture des ventes','Sales close')}<input type="datetime-local" value={close} onChange={e=>setClose(e.target.value)}/></label></div>
  </fieldset>
  <fieldset className="stack nested-fieldset" disabled={busy||!loaded}><legend>{t('Taxes du bloc','Block taxes')}</legend><p>{t('Saisissez les taxes à appliquer aux options taxables. Les options non taxables restent sans taxe. Les taux sont verrouillés après la première commande.','Enter taxes for taxable options. Non-taxable options remain tax-free. Rates are locked after the first order.')}</p>
   {taxes.map((tax,i)=><div className="form-grid" key={i}><label>{t('Nom de taxe','Tax name')}<input required disabled={initial?.has_orders} value={tax.name} onChange={e=>setTaxes(ts=>ts.map((v,j)=>i===j?{...v,name:e.target.value}:v))}/></label><label>{t('Taux (%)','Rate (%)')}<input type="number" required min="0.000001" max="100" step="0.000001" disabled={initial?.has_orders} value={tax.rate||''} onChange={e=>setTaxes(ts=>ts.map((v,j)=>i===j?{...v,rate:Number(e.target.value)}:v))}/></label>{!initial?.has_orders?<button type="button" className="text-button" onClick={()=>setTaxes(ts=>ts.filter((_,j)=>j!==i))}>{t('Retirer la taxe','Remove tax')}</button>:null}</div>)}
   {!initial?.has_orders?<button type="button" className="text-button" disabled={taxes.length>=5} onClick={()=>setTaxes(ts=>[...ts,{code:'TAX'+crypto.randomUUID().slice(0,8),name:'',rate:0,jurisdiction:organization.state||organization.country||'CA'}])}>{t('Ajouter une taxe','Add tax')}</button>:null}
  </fieldset>
  {options.map((o,i)=><fieldset className="stack nested-fieldset" key={o.id??i} disabled={busy||!loaded}><legend>{t('Option de billet','Ticket option')} {i+1}</legend><div className="form-grid">
   <label>{t('Nom','Name')}<input required maxLength={150} value={o.name} placeholder={t('Adulte, enfant, clinique 3 jours…','Adult, child, 3-day clinic…')} onChange={e=>patch(i,{name:e.target.value})}/></label>
   <label>{t('Prix','Price')} ({initial?.currency??organization.currency})<input type="number" required min={0} step="0.01" value={o.price} onChange={e=>patch(i,{price:Number(e.target.value)})}/></label>
   <label>{t('Capacité de cette option (facultative)','Option capacity (optional)')}<input type="number" min={1} step={1} value={o.capacity??''} onChange={e=>patch(i,{capacity:e.target.value?Number(e.target.value):null})}/></label>
  </div><label className="check-row"><input type="checkbox" checked={o.taxable} onChange={e=>patch(i,{taxable:e.target.checked})}/>{t('Billet taxable','Taxable ticket')}</label>
  {o.taxable?<label>{t('Affichage du prix','Price display')}<select value={o.tax_mode} onChange={e=>patch(i,{tax_mode:e.target.value as TicketOption['tax_mode']})}><option value="exclusive">{t('Taxes en sus','Tax excluded')}</option><option value="inclusive">{t('Taxes incluses','Tax included')}</option></select></label>:null}
  <label className="check-row"><input type="checkbox" checked={o.is_active} onChange={e=>patch(i,{is_active:e.target.checked})}/>{t('Option offerte','Option available')}</label>
  {options.length>1?<button className="text-button" type="button" onClick={()=>setOptions(rows=>rows.filter((_,j)=>j!==i))}>{t('Retirer cette option des ventes','Remove option from sales')}</button>:null}
  </fieldset>)}
  <button className="secondary-button" type="button" disabled={busy||options.length>=30} onClick={()=>setOptions(rows=>[...rows,newOption()])}>{t('Ajouter une option de billet','Add ticket option')}</button>
  <button className="primary-button" type="submit" disabled={busy||!loaded}>{t('Enregistrer la billetterie','Save ticket sales')}</button>
 </form>;
}
