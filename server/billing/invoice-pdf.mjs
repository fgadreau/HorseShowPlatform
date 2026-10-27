import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {invoiceBody,escapeHtml} from './invoice-html.mjs';
import {serverlessBrowser} from '../vet/serverless-browser.mjs';
import {rawBody,UUID,PREPROD_REF,PREPROD_ORIGIN} from './hosted-core.mjs';
import {documentTaxes} from '../../src/features/finance/documentPresentation.mjs';
const css=readFileSync(new URL('../../src/features/finance/billingDocument.css',import.meta.url),'utf8');

export async function renderInvoicePdf(document,locale,{browser=serverlessBrowser}={}){
 const body=invoiceBody(document,locale); // Validate and escape before launching a browser.
 const instance=await browser.launch({timeout:15000});
 const timer=setTimeout(()=>void instance.close().catch(()=>{}),45000);let page;
 try{
  page=await instance.newPage({javaScriptEnabled:false});await page.route('**/*',route=>route.abort());
  await page.setContent(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${escapeHtml(document.number??document.snapshot.account_number)}</title><style>${css}</style></head><body><article class="billing-document">${body}</article></body></html>`,{timeout:10000});
  const derived=document.kind!=='receipt'&&document.snapshot.charges.some(c=>documentTaxes(c,locale).some(t=>t.derived));
  const note=derived?(locale==='fr'?'Taxes historiques ventilées; total inchangé.':'Historical taxes itemized; original total unchanged.'):'';
  const footer=`<div style="font:8px Arial,sans-serif;color:#746770;width:100%;margin:0 12mm;display:flex;justify-content:space-between"><span>${escapeHtml(document.number??document.snapshot.account_number)}</span><span>${note}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
  return await page.pdf({preferCSSPageSize:true,printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:footer});
 }finally{clearTimeout(timer);await page?.close().catch(()=>{});await instance.close();}
}

// Read-only PREPROD delivery: no service role, client HTML or client financial amounts.
// The same authenticated RPC policies as the app authorize each download.
export function createInvoicePdfHandler({env=process.env,clientFactory=createClient,render=renderInvoicePdf,transport=fetch}={}){
 let active=0;
 return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  const json=(status,error)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error}));};
  if(env.VITE_DEPLOY_ENV!=='staging'||env.VITE_SUPABASE_PROJECT_REF!==PREPROD_REF||env.VITE_SUPABASE_URL!==`https://${PREPROD_REF}.supabase.co`||env.VITE_PRODUCTION_SUPABASE_PROJECT_REF===PREPROD_REF||!env.VITE_PRODUCTION_SUPABASE_PROJECT_REF||env.VERCEL_GIT_COMMIT_REF!=='preprod')return json(404,'BILLING_PDF_UNAVAILABLE');
  if(req.method!=='POST')return json(405,'BILLING_INVALID_REQUEST');
  if(req.headers.origin!==PREPROD_ORIGIN)return json(403,'BILLING_FORBIDDEN');
  if(!/^Bearer \S+$/.test(req.headers.authorization??''))return json(401,'BILLING_FORBIDDEN');
  const key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY;if(!key)return json(503,'BILLING_PDF_UNAVAILABLE');
  let claimed=false;
  try{
   const body=req.body==null?JSON.parse((await rawBody(req,2048)).toString()):typeof req.body==='string'?JSON.parse(req.body):req.body;
   if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['documentId','locale','personal'].includes(k))||typeof body.documentId!=='string'||!UUID.test(body.documentId)||!['fr','en'].includes(body.locale)||typeof body.personal!=='boolean')return json(400,'BILLING_INVALID_REQUEST');
   const signal=AbortSignal.timeout(20000);
   const client=clientFactory(env.VITE_SUPABASE_URL,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:req.headers.authorization},fetch:(url,options={})=>transport(url,{...options,signal:options.signal?AbortSignal.any([signal,options.signal]):signal})}});
   const {data:auth,error:authError}=await client.auth.getUser(req.headers.authorization.slice(7));if(authError||!auth?.user)return json(401,'BILLING_FORBIDDEN');
   const {error:scopeError}=await client.rpc('billing_pdf_status',{p_document:body.documentId,p_personal:body.personal});if(scopeError)return json(403,'BILLING_FORBIDDEN');
   const {data:document,error}=await client.rpc('get_billing_document',{p_id:body.documentId});if(error||!document||document.id!==body.documentId)return json(403,'BILLING_FORBIDDEN');
   if(active>=2){res.setHeader('Retry-After','2');return json(429,'BILLING_PDF_BUSY');}active++;claimed=true;
   const bytes=Buffer.from(await render(document,body.locale));if(bytes.length>4*1024*1024)return json(413,'BILLING_PDF_TOO_LARGE');
   res.setHeader('Content-Type','application/pdf');const name=String(document.number??document.snapshot.account_number).replace(/[^a-zA-Z0-9_-]/g,'_');res.setHeader('Content-Disposition',`attachment; filename="${name}-${body.locale}.pdf"`);res.end(bytes);
  }catch(e){return e instanceof SyntaxError||e?.message==='BILLING_INVALID_REQUEST'?json(400,'BILLING_INVALID_REQUEST'):json(503,'BILLING_PDF_UNAVAILABLE');}finally{if(claimed)active--;}
 };
}
