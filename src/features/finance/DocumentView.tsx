import {DocumentPdf} from './DocumentPdf';
import {PdfDownload} from './PdfDownload';
import {invoiceBody} from '../../../server/billing/invoice-html.mjs';
import documentStyles from './billingDocument.css?inline';
import type {Json} from '../../services/billingFolio';

export function DocumentView({document,locale,personal=true,invoicePreview=false,showPdfControls=true}:{document:Json;locale:string;personal?:boolean;invoicePreview?:boolean;showPdfControls?:boolean}){
 return <>
  <style>{documentStyles}</style>
  <article className="billing-document" dangerouslySetInnerHTML={{__html:invoiceBody(document,locale,{invoicePreview})}}/>
  {!invoicePreview&&showPdfControls&&<>
   <PdfDownload document={document} personal={personal} locale={locale}/>
   <details className="finance-pdf-archive"><summary>{locale==='fr'?'Version PDF archivée':'Archived PDF version'}</summary><DocumentPdf documentId={document.id} personal={personal} locale={locale}/></details>
  </>}
 </>;
}
