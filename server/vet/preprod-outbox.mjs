import {randomBytes,randomUUID,createCipheriv,createDecipheriv} from 'node:crypto';
export function outboxKey(value){if(!/^[A-Za-z0-9+/]{43}=$/.test(value??''))throw Error('OUTBOX_KEY_REQUIRED');const key=Buffer.from(value,'base64');if(key.length!==32)throw Error('OUTBOX_KEY_REQUIRED');return key;}
export function encryptMessage(message,key,id){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(id));const data=Buffer.concat([cipher.update(JSON.stringify(message),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
export function decryptMessage(value,key,id){const data=Buffer.from(value,'base64');const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));decipher.setAAD(Buffer.from(id));decipher.setAuthTag(data.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));}
export function createPreprodOutbox(service,key){
 async function capture(meta,message){
  const id=randomUUID(),encrypted_message=encryptMessage(message,key,id);
  if(encrypted_message.length>=4000000)throw Error('OUTBOX_TOO_LARGE');
  const cleanup=await service.from('vet_preprod_outbox').delete().lt('expires_at',new Date().toISOString());if(cleanup.error)throw Error('OUTBOX_UNAVAILABLE');
  const r=await service.from('vet_preprod_outbox').insert({id,...meta,encrypted_message});if(r.error)throw Error('OUTBOX_UNAVAILABLE');
 }
 return {
  captureAuthorization:async({client,authorizationId,email,link})=>{
   const {data:a,error}=await client.from('vet_signature_authorizations').select('issuer_id,requested_by').eq('id',authorizationId).single();if(error||!a)throw Error('OUTBOX_ACCESS_DENIED');
   await capture({issuer_id:a.issuer_id,created_by:a.requested_by,recipient:email,kind:'authorization'},{subject:'TEST PREPROD — autorisation de signature',text:'Courriel de test capturé uniquement dans HSP. Aucun envoi externe.',link});
  },
  sendMail:async(recipient,c,pdf,{profile})=>{await capture({issuer_id:c.issuer_id,created_by:profile,recipient,kind:'certificate',certificate_id:c.id},{subject:`TEST PREPROD — certificat ${c.public_number}`,text:'Courriel de test capturé uniquement dans HSP. Aucun envoi externe.',attachment:{name:`${c.public_number}.pdf`,base64:pdf.toString('base64')}});},
  read:async(client,id)=>{
   const {data:allowed,error}=await client.from('vet_preprod_outbox').select('id').eq('id',id).single();if(error||!allowed)throw Error('OUTBOX_ACCESS_DENIED');
   const {data:row,error:readError}=await service.from('vet_preprod_outbox').select('encrypted_message,expires_at').eq('id',id).single();if(readError||!row||new Date(row.expires_at)<=new Date())throw Error('OUTBOX_ACCESS_DENIED');
   return decryptMessage(row.encrypted_message,key,id);
  }
 };
}
