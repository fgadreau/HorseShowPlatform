import {useState} from 'react';
import {requireSupabase} from '../../lib/supabase';
import type {Json} from '../../services/billingFolio';

export function PdfDownload({document,personal,locale}:{document:Json;personal:boolean;locale:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),fr=locale==='fr';
 async function download(view:boolean){
  setBusy(true);setError('');let tab:Window|null=null;
  try{
   if(view){tab=window.open('','_blank');if(!tab)throw Error('POPUP_BLOCKED');tab.opener=null;}
   const {data}=await requireSupabase().auth.getSession();
   const response=await fetch('/api/billing-pdf',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token??''}`},body:JSON.stringify({documentId:document.id,personal,locale})});
   if(!response.ok||!response.headers.get('Content-Type')?.includes('application/pdf'))throw Error('PDF_UNAVAILABLE');
   const blob=await response.blob();if(await blob.slice(0,4).text()!=='%PDF')throw Error('PDF_UNAVAILABLE');
   const url=URL.createObjectURL(blob);
   if(tab)tab.location.href=url;
   else{const a=window.document.createElement('a');a.href=url;const title=document.kind==='invoice'?(fr?'Facture':'Invoice'):document.kind==='receipt'?(fr?'Reçu':'Receipt'):(fr?'Relevé':'Statement');a.download=`${title} ${document.number??document.snapshot.account_number}.pdf`;a.click();}
   setTimeout(()=>URL.revokeObjectURL(url),300000);
  }catch(e){tab?.close();setError((e as Error).message==='POPUP_BLOCKED'?(fr?'Autorisez l’ouverture du PDF, ou utilisez Télécharger.':'Allow the PDF popup, or use Download.'):(fr?'Le PDF est indisponible pour le moment. Réessayez.':'The PDF is temporarily unavailable. Please retry.'));}
  finally{setBusy(false);}
 }
 return <div data-pdf-controls className="finance-actions"><button disabled={busy} type="button" onClick={()=>void download(false)}>{busy?(fr?'Préparation du PDF…':'Preparing PDF…'):(fr?'Télécharger le PDF':'Download PDF')}</button><button disabled={busy} type="button" onClick={()=>void download(true)}>{fr?'Ouvrir le PDF pour imprimer':'Open PDF to print'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
