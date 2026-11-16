const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function createHouseNrhaHandler({createClient,env,fetcher=fetch}){
 return async request=>{
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(request.method==='OPTIONS')return reply({});
  if(request.method!=='POST')return reply({error:'Method not allowed'},405);
  try{
   const authorization=request.headers.get('authorization')??'';
   if(!authorization.startsWith('Bearer '))return reply({error:'Authentication required'},401);
   const client=createClient(env('SUPABASE_URL'),env('SUPABASE_ANON_KEY'),{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
   const {data:identity,error:authError}=await client.auth.getUser(authorization.slice(7));
   if(authError||!identity?.user)return reply({error:'Authentication required'},401);
   let body;try{body=await request.json();}catch{return reply({error:'Invalid JSON'},400);}
   if(![body.classId,body.horseId,body.riderContactId].every(x=>typeof x==='string'&&uuid.test(x)))return reply({error:'Invalid team'},400);
   const {data:p,error}=await client.rpc('house_nrha_check_context',{p_class:body.classId,p_horse:body.horseId,p_rider:body.riderContactId});
   if(error)return reply({error:'Verification not authorized'},403);
   if(!p||![p.classCode,p.memberNumber,p.competitionLicenseNumber].every(x=>/^\d+$/.test(String(x??''))))return reply({error:'NRHA identifiers or reference class missing'},422);
   const service=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
   const cached=await service.from('house_nrha_checks').select('eligible,reasons').eq('class_id',body.classId).eq('horse_id',body.horseId).eq('rider_contact_id',body.riderContactId).eq('fingerprint',p.fingerprint).gt('expires_at',new Date().toISOString()).order('checked_at',{ascending:false}).limit(1).maybeSingle();
   if(cached.error)throw cached.error;if(cached.data)return reply(cached.data);
   const key=env('NRHA_API_KEY');if(!key)return reply({error:'NRHA temporarily unavailable'},503);
   const url=new URL((env('NRHA_API_BASE_URL')??'https://data.nrha.com').replace(/\/+$/,'')+'/api/private/third-party/tools/events/eligibility-calculator');
   for(const [key,value] of Object.entries({'class-code':p.classCode,'member-number':p.memberNumber,'competition-license-number':p.competitionLicenseNumber,date:p.date}))url.searchParams.set(key,String(value));
   const response=await fetcher(url,{headers:{Accept:'application/json',Access:key},signal:AbortSignal.timeout(20000)});
   if(!response.ok)return reply({error:'NRHA temporarily unavailable'},502);
   const payload=await response.json();if(typeof payload.eligible!=='boolean')return reply({error:'Invalid NRHA response'},502);
   const reasons=Array.isArray(payload.reasons)?payload.reasons.map(r=>typeof r==='string'?r:r?.message).filter(r=>typeof r==='string').map(r=>r.slice(0,2000)).slice(0,20):[];
   const result=await service.from('house_nrha_checks').insert({class_id:body.classId,horse_id:body.horseId,rider_contact_id:body.riderContactId,fingerprint:p.fingerprint,eligible:payload.eligible,reasons});
   if(result.error)throw result.error;
   return reply({eligible:payload.eligible,reasons});
  }catch{return reply({error:'Verification unavailable; entry remains blocked.'},503);}
 };
}
