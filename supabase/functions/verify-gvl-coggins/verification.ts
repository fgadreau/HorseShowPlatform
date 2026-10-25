const corsHeaders = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function certificateId(value:unknown){
 if(typeof value!=='string')return null;const text=value.trim();if(UUID.test(text))return text.toLowerCase();
 try{const url=new URL(text.startsWith('gvlcertcheck.ai/')?'https://'+text:text);const pattern=url.hostname==='user.globalvetlink.com'?/^\/gvl2\/check\/([^/]+)\/?$/:/^\/check\/([^/]+)\/?$/;const id=pattern.exec(url.pathname)?.[1];return ['https:','http:'].includes(url.protocol)&&['gvlcertcheck.ai','www.gvlcertcheck.ai','user.globalvetlink.com'].includes(url.hostname)&&!url.port&&!url.username&&!url.password&&id&&UUID.test(id)?id.toLowerCase():null;}catch{return null;}
}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json','Cache-Control':'no-store'}});}
const record=(value:unknown):Record<string,any>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{};
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
function date(value:unknown){const s=text(value).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const t=Date.parse(s+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?s:null;}
const name=(value:unknown)=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');

export function assessCertificate(raw:unknown,body:Record<string,unknown>,id:string,now=new Date()){
 const payload=record(raw);const animal=record(payload.animal);const metadata=record(payload.metadata);const test=record(payload.test);
 const horseName=text(record(animal.registeredName).name)||text(animal.name)||null;
 const dob=date(animal.dob);const sampled=date(test.sampledDate);
 const expectedName=text(body.horseName);const expectedDob=date(body.horseDateOfBirth);const year=typeof body.horseBirthYear==='number'&&Number.isInteger(body.horseBirthYear)?body.horseBirthYear:null;
 const warnings:string[]=[];
 if(payload.type!=='EIA')warnings.push('NOT_EIA_DOCUMENT');
 if(text(metadata.status).toUpperCase()!=='SIGNED')warnings.push('NOT_SIGNED');
 const voided=Boolean(metadata.voidedBy||metadata.voidReason||metadata.voidDate)||['VOID','VOIDED','CANCELLED','REVOKED'].includes(text(metadata.status).toUpperCase());
 if(voided)warnings.push('VOIDED');
 if(text(test.result).toLowerCase()!=='negative')warnings.push('NOT_NEGATIVE');
 if(!sampled)warnings.push('MISSING_SAMPLE_DATE');else if(sampled>now.toISOString().slice(0,10))warnings.push('FUTURE_SAMPLE_DATE');
 if(!expectedName||!horseName)warnings.push('MISSING_HORSE_NAME');else if(name(expectedName)!==name(horseName))warnings.push('HORSE_NAME_MISMATCH');
 if(body.horseDateOfBirth&&!expectedDob)warnings.push('INVALID_EXPECTED_DOB');
 if(expectedDob&&expectedDob!==dob)warnings.push('HORSE_DOB_MISMATCH');
 if(!expectedDob&&year&&dob?.slice(0,4)!==String(year))warnings.push('HORSE_BIRTH_YEAR_MISMATCH');
 if(!expectedDob&&!year)warnings.push('HORSE_IDENTITY_INCOMPLETE');
 const rejected=voided||payload.type!=='EIA'||['positive','positive/reactor','reactor'].includes(text(test.result).toLowerCase());
 const verified=warnings.length===0;
 const lab=typeof payload.lab==='string'?payload.lab:text(record(payload.lab).name)||text(test.lab)||'GlobalVetLink';
 return {status:rejected?'rejected':verified?'verified':'pending_review',source_url:`https://gvlcertcheck.ai/check/${id}`,certificate_number:text(payload.serialNumber)||(typeof payload.id==='number'?`EIA-${payload.id}`:null),issuer_name:lab,test_or_administered_on:sampled,result:text(test.result)||null,horse_name:horseName,horse_date_of_birth:dob,horse_external_id:text(test.gvlId)||(typeof animal.id==='number'?String(animal.id):null),verification_source:'gvl_qr',verified_at:verified?now.toISOString():null,warnings,payload};
}

export async function handleGvlRequest(request:Request,fetcher:typeof fetch=fetch){
 if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(request.method!=='POST')return json({error:'Method not allowed.'},405);
 let body:Record<string,unknown>;try{const parsed=await request.json();if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error();body=parsed;}catch{return json({error:'Invalid JSON body.'},400);}
 const id=certificateId(body.url||body.uuid);if(!id)return json({error:'Lien ou code GVL invalide. / Invalid GVL certificate link or code.'},400);
 try{
  const response=await fetcher(`https://www.gvlcertcheck.ai/api/check/${id}`,{headers:{Accept:'application/json','User-Agent':'HorseShowPlatform/1.0'},signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok)return json({error:`GVL a retourné le statut ${response.status}. / GVL returned status ${response.status}.`},502);
  if(!response.headers.get('Content-Type')?.toLowerCase().includes('application/json'))return json({error:'Réponse GVL inattendue. / Unexpected GVL response.'},502);
  const payload=await response.json();if(!payload||typeof payload!=='object'||Array.isArray(payload)||typeof payload.type!=='string')return json({error:'Réponse GVL incomplète. / Incomplete GVL response.'},502);
  return json(assessCertificate(payload,body,id));
 }catch(error){return json({error:error instanceof Error&&['TimeoutError','AbortError'].includes(error.name)?'GVL ne répond pas à temps. Le document nécessite une révision. / GVL timed out; document review is required.':'Consultation GVL indisponible. Le document nécessite une révision. / GVL lookup unavailable; document review is required.'},502);}
}
