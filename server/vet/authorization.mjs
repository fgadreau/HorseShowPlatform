import { randomBytes,createHash } from 'node:crypto';
export const hashToken=token=>createHash('sha256').update(token).digest('hex');
export function createAuthorizationHandler({userClient,serviceClient,origin,publicOrigin,localTestEnabled=false}) {
 let inFlight=0;const attempts=new Map();
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  const send=(code,value)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(req.headers.origin!==origin)return send(403,{error:'Origine refusée.'});
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','authorization, content-type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
  if(req.method!=='POST')return send(405,{error:'Méthode refusée.'});
  if(inFlight>=4)return send(429,{error:'Veuillez patienter avant de réessayer.'});inFlight++;
  try {
   let body='';for await(const chunk of req){body+=chunk;if(body.length>65000)return send(413,{error:'Signature trop volumineuse.'});}
   const input=JSON.parse(body);
   if(req.url==='/authorization-test'){
    if(!localTestEnabled)return send(404,{error:'Simulation désactivée.'});
    if(!req.headers.authorization?.startsWith('Bearer '))return send(401,{error:'Connexion administrateur requise.'});
    const client=userClient(req.headers.authorization);const {data:auth,error:authError}=await client.auth.getUser();
    if(authError||!auth.user)return send(401,{error:'Session expirée ou invalidée. Reconnectez-vous avec votre compte HSP, puis réessayez.'});
    const {data:admin,error:adminError}=await client.rpc('is_platform_admin');
    if(adminError||admin!==true)return send(403,{error:'Simulation réservée à l’administrateur HSP.'});
    const {data:profile,error:profileError}=await client.rpc('current_profile_id');
    if(profileError||!profile)return send(403,{error:'Compte administrateur introuvable.'});
    const {data:id,error}=await serviceClient.rpc('vet_create_local_test_authorization',{p_admin:profile,p_practitioner:input.practitioner_id,p_email:input.email??''});
    if(error)return send(403,{error:error.message.includes('FRESH')?'Vérifiez d’abord le vétérinaire auprès de l’OMVQ.':error.message.includes('REAL_AUTHORIZATION')?'Ce compte possède déjà une autorisation réelle active.':error.message.includes('TARGET')?'Ce compte doit déjà avoir accès à cette clinique.':'Simulation refusée. Vérifiez la clinique et le compte cible.'});
    return send(200,{id,test_only:true});
   }
   if(req.url==='/authorization-request'){
    if(!req.headers.authorization?.startsWith('Bearer '))return send(401,{error:'Connexion requise.'});
    const client=userClient(req.headers.authorization);const {data:auth}=await client.auth.getUser();if(!auth.user)return send(401,{error:'Connexion requise.'});
    const token=randomBytes(32).toString('hex');
    const {data:id,error}=await client.rpc('vet_request_authorization',{p_practitioner:input.practitioner_id,p_token_hash:hashToken(token),p_method:input.method,p_email:input.email??''});
    if(error)return send(403,{error:error.message.includes('VET_FRESH')?'Vérifiez d’abord le vétérinaire dans le répertoire OMVQ.':error.message.includes('EMAIL')?'Indiquez le courriel personnel du vétérinaire.':'Demande refusée. Vérifiez vos accès et les informations du vétérinaire.'});
    if(input.method==='personal_link'){
     const link=`${publicOrigin}/vet/authorize#token=${token}`;
     try{
      const result=await fetch('http://127.0.0.1:54324/api/v1/send',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({From:{Email:'certificats@hsp.example.test',Name:'HSP — pilote local'},To:[{Email:input.email}],Subject:'HSP : autorisation préalable de signature électronique',Text:`Veuillez lire et signer votre autorisation personnelle pour la clinique :\n${link}\nCe lien expire rapidement et ne peut être utilisé qu’une fois. Ne le transférez pas.\nEssai local : ce courriel est capturé dans Mailpit.`,Tags:['hsp-vet-authorization-local']})});
      if(!result.ok)throw Error('mail');
     }catch{await client.rpc('vet_cancel_authorization',{p_id:id});return send(503,{error:'Le courriel local n’a pas été confirmé. Cette demande a été annulée ; vous pouvez en créer une nouvelle.'});}
     return send(200,{id,local_only:true});
    }
    return send(200,{id,token});
   }
   if(!/^[a-f0-9]{64}$/.test(input.token??''))return send(403,{error:'Lien invalide, expiré, annulé ou déjà utilisé.'});
   const hash=hashToken(input.token),now=Date.now();
   for(const [key,value] of attempts)if(value.until<now)attempts.delete(key);
   const attempt=attempts.get(hash)??{count:0,until:now+60000};attempt.count++;attempts.set(hash,attempt);
   if(attempt.count>10)return send(429,{error:'Veuillez patienter une minute avant de réessayer.'});
   if(req.url==='/authorization-summary'){
    const {data,error}=await serviceClient.rpc('vet_authorization_summary',{p_hash:hash});
    if(error)return send(403,{error:'Lien invalide, expiré, annulé ou déjà utilisé, ou vérification OMVQ à renouveler.'});
    return send(200,data);
   }
   const {error}=await serviceClient.rpc('vet_approve_authorization',{p_hash:hash,p_visual:input.visual,p_accepted:input.accepted});
   if(error)return send(403,{error:error.message.includes('VET_SIGNATURE_REQUIRED')?'Dessinez votre signature et acceptez l’attestation.':'Autorisation non acceptée : lien expiré, annulé, déjà utilisé ou vérification OMVQ à renouveler.'});
   send(200,{accepted:true});
  }catch{send(400,{error:'Demande invalide. Aucune autorisation confirmée.'});}finally{inFlight--;}
 };
}
