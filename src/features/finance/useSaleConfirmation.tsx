import {useEffect,useRef,useState} from 'react';
import {billingRpc,durableRpc,type Json} from '../../services/billingFolio';
export function useSaleConfirmation(identity:string,locale:string){
 const [quote,setQuote]=useState<Json>();const resolver=useRef<(v:boolean)=>void>(()=>{}),modal=useRef<HTMLDialogElement>(null);const fr=locale==='fr';
 useEffect(()=>{if(quote)modal.current?.showModal();},[quote]);
 function finish(accepted:boolean){modal.current?.close();setQuote(undefined);resolver.current(accepted);}
 async function sale(command:Json,required:boolean){
  if(!required)return durableRpc(identity,'add_billing_sale',{p_sale:command});
  const q=await billingRpc('prepare_billing_operation_quote',{p_sale:command});
  setQuote(q);const accepted=await new Promise<boolean>(resolve=>{resolver.current=resolve;});
  if(!accepted)return null;
  return durableRpc(identity,'add_billing_sale',{p_sale:{...command,quote_id:q.quote_id}});
 }
 const money=(v:unknown)=>new Intl.NumberFormat(locale,{style:'currency',currency:quote?.currency??'CAD'}).format(Number(v));
 const dialog=<dialog ref={modal} onCancel={e=>{e.preventDefault();finish(false);}} aria-label={fr?'Confirmer les frais':'Confirm charges'}>{quote&&<><h3>{fr?'Vérifiez avant tout engagement':'Review before committing'}</h3><p>DÉMONSTRATION — sans valeur comptable ou fiscale</p><p>{fr?'L’association facture et encaisse la part HSP comme mandataire.':'The association bills and collects the HSP portion as agent.'}</p>{quote.lines.map((l:Json)=><div key={l.product_id}><strong>{quote.suppliers[l.supplier].name} — {l.supplier==='hsp'&&!fr?'HSP service fee':l.description}</strong><p>{money(l.subtotal)} + {l.taxes.map((t:Json)=>`${t.name} ${t.rate}% : ${money(t.amount)}`).join(' · ')||l.exemption_reason} = {money(l.total)}</p><small>{quote.suppliers[l.supplier].tax_number_1}</small></div>)}<p>{fr?'À communiquer au payeur avant confirmation.':'Communicate this summary to the payer before confirming.'}</p><button autoFocus onClick={()=>finish(false)}>{fr?'Retour sans engagement':'Back without committing'}</button><button onClick={()=>finish(true)}>{fr?'Confirmer':'Confirm'} — {money(quote.total)}</button></>}</dialog>;
 return {sale,dialog};
}
