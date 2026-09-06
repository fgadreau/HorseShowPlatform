// Local pilot: no remote email transport, no external assets in PDFs.
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const diseases = {influenza:'Influenza',ehv_1:'EHV-1',ehv_4:'EHV-4'};
const states = {issued:'Émis',superseded:'REMPLACÉ — ne constitue plus une preuve valide',revoked:'RÉVOQUÉ — ne constitue plus une preuve valide'};
export function frenchDate(value, time=false) {
 if(!value)return '';
 const d=new Date(time?value:`${String(value).slice(0,10)}T12:00:00Z`);
 if(Number.isNaN(d.getTime()))return '';
 return new Intl.DateTimeFormat('fr-CA',{dateStyle:'long',...(time?{timeStyle:'short'}:{}),timeZone:'America/Toronto'}).format(d);
}
export function signatureSvg(visual) {
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 200" width="320" height="100" aria-label="Signature électronique du vétérinaire">${(visual??[]).map(line=>`<polyline fill="none" stroke="#18312c" stroke-width="2" stroke-linecap="round" points="${line.map(([x,y])=>`${Number(x)*640},${Number(y)*200}`).join(' ')}"/>`).join('')}</svg>`;
}
// HSP's existing clipboard brand mark, rendered inline with the wordmark.
const logo=`<svg xmlns="http://www.w3.org/2000/svg" width="220" height="48" viewBox="0 0 220 48" role="img" aria-label="HorseShowPlatform"><rect x="0" y="0" width="44" height="44" rx="8" fill="#0f766e"/><g transform="translate(10 10)" fill="none" stroke="white" stroke-width="2"><rect x="5" y="4" width="14" height="18" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/></g><text x="54" y="23" font-family="Arial" font-size="22" font-weight="bold" fill="#18312c">HSP</text><text x="54" y="39" font-family="Arial" font-size="12" fill="#18312c">HorseShowPlatform</text></svg>`;
export function certificateHtml(c,{verificationUrl='',qrSvg=''}={}) {
 if(!c.snapshot || !states[c.status])throw Error('CERTIFICATE_NOT_ISSUED');
 const s=c.snapshot,p=s.certificate,signature=s.signature;
 const testOnly=signature?.signed_content?.test_only===true;
 const row=(label,value)=>value?`<p><strong>${escapeHtml(label)} :</strong> ${escapeHtml(value)}</p>`:'';
 const status=testOnly?'TEST — SIMULATION LOCALE, SANS PREUVE VACCINALE':c.status==='issued'?(signature?'Certificat valide et signé':'Ancien certificat pilote non signé'):states[c.status];
 return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Certificat ${escapeHtml(c.public_number??c.number)}</title><style>
 @page{size:A4;margin:11mm}*{box-sizing:border-box}body{margin:0;font:12px Arial,sans-serif;color:#18312c;line-height:1.3}h1{font-size:21px;margin:3px 0 7px}h2{font-size:13px;margin:8px 0 5px;border-bottom:1px solid #bbcfc4;padding-bottom:3px}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:3px 0}.header,.identity,.proof{display:grid;grid-template-columns:1fr 1fr;gap:16px}.header{align-items:center}.header .metadata{text-align:right}.identity>section{min-width:0}.status{font-weight:bold;padding:7px;background:#eef3f0;margin:8px 0}small{font-size:10px}.vaccines{width:100%;border-collapse:collapse;table-layout:fixed;font-size:11px}.vaccines th,.vaccines td{border:1px solid #bbcfc4;padding:5px;vertical-align:top;overflow-wrap:anywhere}.vaccines th{background:#eef3f0;text-align:left}.vaccines th:first-child{width:27%}.vaccines tr{break-inside:avoid}.vaccines p{margin:2px 0}.proof{grid-template-columns:1.3fr 1fr;margin-top:8px;break-inside:avoid}.signature svg{display:block;width:240px;height:65px;max-width:100%}.verification svg{display:block;width:116px;height:116px;margin:auto}.verification p{font-size:10px;text-align:center}.test-signature{font-size:18px;font-weight:bold}.footnote{border-top:1px solid #bbcfc4;padding-top:6px;margin-top:8px;break-inside:avoid}a{color:inherit}
 </style><div class="header"><div>${logo}<h1>Certificat de vaccination équine</h1></div><div class="metadata">${row('Numéro',c.public_number??c.number)}${row('Version',c.version_number??s.version??1)}${row('Date d’émission',frenchDate(s.issued_at,true))}</div></div><p class="status">${escapeHtml(status)}</p>
 <div class="identity"><section><h2>Cheval et propriétaire</h2>${row('Nom officiel du cheval HSP',p.horse?.name)}${(p.horse?.identifiers??[]).map(i=>row(i.type==='microchip'?'Micropuce':'Enregistrement',i.value)).join('')}${row('Propriétaire',p.owner?.name)}${row('Coordonnées',p.owner?.contact_details)}${row('Courriel du propriétaire',p.owner?.email)}${row('Écurie ou agent',p.agent?.name)}${row('Courriel de l’écurie ou de l’agent',p.agent?.email)}</section>
 <section><h2>Clinique et vétérinaire responsable</h2>${row('Clinique émettrice',s.issuer.name)}${row('Coordonnées de la clinique',s.issuer.contact_details)}${row('Préparé par',s.prepared_name??signature?.signed_content?.prepared_name??'Personnel autorisé de la clinique')}${row('Vétérinaire responsable',s.practitioner.name)}${row('Numéro de permis',s.practitioner.permit_number)}<p><strong>Vétérinaire vérifié auprès de l’OMVQ — Statut actif</strong></p>${row('Vérification effectuée le',frenchDate(s.verification.checked_at,true))}</section></div>
 <h2>Vaccinations administrées</h2><table class="vaccines"><thead><tr><th>Produit / fabricant / maladies couvertes</th><th>Lot ou série</th><th>Date d’administration</th><th>Expiration du produit</th><th>Rappel / fin de validité</th></tr></thead><tbody>${p.administrations.map(a=>`<tr><td><strong>${escapeHtml(a.product)}</strong>${row('Fabricant',a.manufacturer)}<p>${escapeHtml(a.diseases.map(d=>diseases[d]??d).join(', '))}</p></td><td>${escapeHtml(a.lot)}</td><td>${escapeHtml(frenchDate(a.administered_on))}</td><td>${escapeHtml(frenchDate(a.product_expires_on))}</td><td>${escapeHtml(frenchDate(a.valid_until))}${row('Durée déclarée',a.declared_duration)}</td></tr>`).join('')}</tbody></table>
 <div class="proof">${signature?`<div class="signature"><h2>Signature électronique du vétérinaire</h2>${testOnly?'<p class="test-signature">TEST — AUCUNE SIGNATURE RÉELLE</p>':signatureSvg(signature.signature_visual)}${row('Vétérinaire',signature.practitioner_name)}${row('Permis',signature.permit_number)}${row('Signature apposée le',frenchDate(signature.signed_at,true))}<p>${testOnly?'Autorisation simulée par un administrateur pour les essais locaux.':'Signature apposée automatiquement en vertu de l’autorisation préalable du vétérinaire donnée à la clinique.'}</p></div>`:'<div></div>'}
 ${verificationUrl?`<div class="verification"><h2>Authenticité et statut actuel</h2>${qrSvg}<p><a href="${escapeHtml(verificationUrl)}">${escapeHtml(verificationUrl)}</a></p></div>`:''}</div>
 <p class="footnote"><small>${testOnly?'DOCUMENT DE TEST. Aucune autorisation ni signature réelle du vétérinaire. Ne pas utiliser comme preuve de vaccination.':signature?`Ce certificat a été signé électroniquement par le vétérinaire responsable, par apposition automatique autorisée, et émis par ${escapeHtml(s.issuer.name)} à partir d’un accès HSP autorisé. Le statut actif du vétérinaire a été vérifié dans le répertoire public de l’OMVQ ; la vérification était à jour selon la durée de fraîcheur configurée au moment de l’émission. L’authenticité et le statut actuel du certificat peuvent être vérifiés à l’aide du code QR.`:'Ancien document pilote non signé : aucune signature électronique n’est attestée.'}</small></p></html>`;
}
export async function renderCertificatePdf(c, chromium, publicOrigin='http://127.0.0.1:5173') {
 const {default:QRCode}=await import('qrcode');
 const verificationUrl=`${publicOrigin}/vet/verify/${c.public_number??c.number}`;
 const qrSvg=await QRCode.toString(verificationUrl,{type:'svg',errorCorrectionLevel:'M',margin:4});
 const browser=await chromium.launch({headless:true});
 try {
  const context=await browser.newContext({javaScriptEnabled:false});await context.route('**/*',route=>route.abort());
  const page=await context.newPage();
  // Match the A4 content width (210 mm minus two 11 mm margins).
  await page.setViewportSize({width:Math.floor(188*96/25.4),height:1040});
  await page.emulateMedia({media:'print'});
  await page.setContent(certificateHtml(c,{verificationUrl,qrSvg}));
  const height=await page.evaluate(()=>document.body.getBoundingClientRect().height);
  // Modest shrink only: never truncate content or make unusually long records unreadable.
  const scale=Math.max(0.85,Math.min(1,(275*96/25.4-8)/height));
  return await page.pdf({format:'A4',printBackground:true,scale});
 }finally{await browser.close();}
}
export function deliveryRecipients(owner,agent) {
 const recipients=[...new Set([owner,agent].map(v=>String(v??'').trim()).filter(Boolean))];
 if(!recipients.length || recipients.some(v=>v.length>254 || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(v)))throw Error('INVALID_RECIPIENTS');
 return recipients;
}
export async function captureLocalEmail(recipient, certificate, pdf) {
 // Fixed loopback destination. Never call Mailpit's release/relay endpoint.
 const response=await fetch('http://127.0.0.1:54324/api/v1/send',{
  method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),
  body:JSON.stringify({From:{Email:'certificats@hsp.example.test',Name:'HSP — pilote local'},To:[{Email:recipient}],
   Subject:`Certificat de vaccination ${certificate.number}`,
   Text:`Veuillez trouver en pièce jointe le certificat de vaccination ${certificate.number}.\nEssai local HSP : ce message n’est pas transmis à une boîte externe.`,
   Attachments:[{Filename:`${certificate.number}.pdf`,ContentType:'application/pdf',Content:pdf.toString('base64')}],Tags:['hsp-vet-local']})
 });
 if(!response.ok)throw Error('LOCAL_EMAIL_UNCERTAIN');
}
export function createCertificateHandler({userClient,serviceClient,chromium,origin,publicOrigin='http://127.0.0.1:5173',render=renderCertificatePdf,sendMail=captureLocalEmail}) {
 let busy=false;
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.headers.origin!==origin)return send(403,{error:'FORBIDDEN_ORIGIN'});
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Headers','authorization, content-type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method!=='POST')return send(405,{error:'METHOD_NOT_ALLOWED'});
  if(!req.headers.authorization?.startsWith('Bearer '))return send(401,{error:'UNAUTHORIZED'});
  if(busy)return send(429,{error:'Veuillez patienter : un PDF est en cours de préparation.'});
  busy=true;
  try {
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return send(413,{error:'TOO_LARGE'});}
   const input=JSON.parse(body), client=userClient(req.headers.authorization);
   if(!/^[0-9a-f-]{36}$/i.test(input.certificate_id??''))return send(400,{error:'INVALID_CERTIFICATE'});
   const {data:auth,error:authError}=await client.auth.getUser();
   if(authError || !auth.user)return send(401,{error:'UNAUTHORIZED'});
   const {data:c,error}=await client.from('vet_certificates').select('*').eq('id',input.certificate_id).single();
   if(error || !c)return send(403,{error:'VET_ACCESS_DENIED'});
   const {data:issuer}=await client.from('vet_issuers').select('status').eq('id',c.issuer_id).single();
   if(issuer?.status!=='active')return send(403,{error:'VET_ACCESS_DENIED'});
   const email=req.url==='/certificate-email';
   if(!c.snapshot || c.status==='draft' || (email && c.status!=='issued'))return send(409,{error:'Le certificat doit être émis et valide pour être envoyé.'});
   const recipients=email?deliveryRecipients(input.owner_email,input.agent_email):[];
   if(email && !/^[0-9a-f-]{36}$/i.test(input.request_id??''))return send(400,{error:'INVALID_REQUEST'});
   const {data:intact,error:integrityError}=await serviceClient.rpc('vet_signature_intact',{p_id:c.id});
   if(integrityError || !intact)return send(409,{error:'Certificat non signé ou intégrité non confirmée. Préparez une nouvelle version.'});
   const pdf=await render(c,chromium,publicOrigin);
   if(!email){res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${c.number}.pdf"`});res.end(pdf);return;}
   // Recheck access and state after rendering, before any send.
   const {data:current}=await client.from('vet_certificates').select('status').eq('id',c.id).single();
   const {data:active}=await client.from('vet_issuers').select('status').eq('id',c.issuer_id).single();
   if(current?.status!=='issued' || active?.status!=='active')return send(403,{error:'VET_ACCESS_DENIED'});
   const {data:profile,error:profileError}=await client.rpc('current_profile_id');
   if(profileError || !profile)return send(403,{error:'VET_ACCESS_DENIED'});
   const results=[];
   for(const recipient of recipients){
    const {error:insertError}=await serviceClient.from('vet_certificate_deliveries').upsert({request_id:input.request_id,certificate_id:c.id,issuer_id:c.issuer_id,created_by:profile,recipient},{onConflict:'request_id,recipient',ignoreDuplicates:true});
    if(insertError)throw Error('DELIVERY_LOG_UNAVAILABLE');
    const query=()=>serviceClient.from('vet_certificate_deliveries').select('*').eq('request_id',input.request_id).eq('recipient',recipient).eq('created_by',profile).eq('certificate_id',c.id).single();
    const {data:attempt}=await query();if(!attempt)throw Error('DELIVERY_CONFLICT');
    if(attempt.status==='queued'){
     const {data:claimed,error:claimError}=await serviceClient.from('vet_certificate_deliveries').update({status:'processing'}).eq('id',attempt.id).eq('status','queued').select('id');
     if(claimError)throw Error('DELIVERY_LOG_UNAVAILABLE');
     if(claimed?.length){
      let status='local_captured';try{await sendMail(recipient,c,pdf);}catch{status='uncertain';}
      const {error:logError}=await serviceClient.from('vet_certificate_deliveries').update({status,completed_at:new Date().toISOString()}).eq('id',attempt.id);
      if(logError)throw Error('DELIVERY_LOG_UNAVAILABLE');
     }
    }
    const {data:final}=await query();results.push({recipient,status:final?.status??'uncertain'});
   }
   send(200,{local_only:true,results});
  }catch(e){send(503,{error:e.message==='INVALID_RECIPIENTS'?'Indiquez au moins un courriel valide pour le propriétaire ou l’agent.':'Opération non confirmée. Vérifiez l’historique avant de réessayer.'});}
  finally{busy=false;}
 };
}
