import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {certificateHtml,deliveryRecipients,createCertificateHandler,frenchDate,signatureSvg} from '../../server/vet/certificate-delivery.mjs';
const certificate={id:'a1000000-0000-0000-0000-000000000001',issuer_id:'issuer',number:'HSP-VET-TEST',status:'issued',
 payload:{owner:{name:'NEW CENTRAL NAME'}},snapshot:{certificate:{horse:{name:'Cheval <script>alert(1)</script>'},owner:{name:'Original Owner',contact_details:'Québec'},agent:{},administrations:[{product:'Produit',manufacturer:'Fabricant',lot:'LOT',diseases:['influenza','ehv_1','ehv_4'],product_expires_on:'2026-09-10',administered_on:'2026-09-01',valid_until:'2027-03-01'}]},issuer:{name:'Clinique'},practitioner:{name:'Amelie Croteau',permit_number:'4887'},verification:{returned_name:'Dre Amélie Croteau m.v.',returned_status:'Actif'}}};
test('PDF uses immutable snapshot, escapes content and separates expiry from validity',()=>{
 const html=certificateHtml(certificate);
 assert.ok(html.includes('Original Owner'));assert.ok(!html.includes('NEW CENTRAL NAME'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 for(const value of ['10 septembre 2026','1 mars 2027','EHV-1','EHV-4','Influenza','4887','Amelie Croteau'])assert.ok(html.includes(value));
 assert.throws(()=>certificateHtml({...certificate,status:'draft'}));
 assert.ok(certificateHtml({...certificate,status:'revoked'}).includes('RÉVOQUÉ'));
 assert.ok(certificateHtml({...certificate,status:'superseded'}).includes('REMPLACÉ'));
});
test('email recipients require explicit valid addresses and identical addresses are deduplicated',()=>{
 assert.deepEqual(deliveryRecipients(' a@example.test ','a@example.test'),['a@example.test']);
 for(const values of [['',''],['bad',''],['x@example.test\r\nBcc:other@example.test','']])assert.throws(()=>deliveryRecipients(...values));
});
async function request({authorized=true,active=true,intact=true,status='issued',email=false,origin='http://127.0.0.1:5173'}={}){
 let renders=0,sends=0;
 const client={auth:{getUser:async()=>({data:{user:authorized?{id:'user'}:null}})},from:table=>({select(){return this;},eq(){return this;},single:async()=>({data:table==='vet_certificates'?{...certificate,status}: {status:active?'active':'suspended'}})})};
 const handler=createCertificateHandler({userClient:()=>client,serviceClient:{rpc:async()=>({data:intact,error:null})},origin:'http://127.0.0.1:5173',render:async()=>{renders++;return Buffer.from('%PDF-test');},sendMail:async()=>{sends++;}});
 const server=http.createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {const response=await fetch(`http://127.0.0.1:${server.address().port}/${email?'certificate-email':'certificate-pdf'}`,{method:'POST',headers:{Origin:origin,Authorization:'Bearer test'},body:JSON.stringify({certificate_id:certificate.id})});await response.arrayBuffer();return {status:response.status,renders,sends};}
 finally{await new Promise(r=>server.close(r));}
}
test('PDF and email refuse unauthenticated, suspended, draft and cross-origin requests before rendering',async()=>{
 for(const opts of [{authorized:false},{active:false},{intact:false},{status:'draft'},{origin:'https://other.test'},{status:'revoked',email:true}]){const r=await request(opts);assert.ok([401,403,409].includes(r.status));assert.equal(r.renders,0);assert.equal(r.sends,0);}
 const r=await request();assert.equal(r.status,200);assert.equal(r.renders,1);assert.equal(r.sends,0);
});

test('French dates use Quebec timezone, signed PDF has no internal UUID and hides absent fields',()=>{
 assert.equal(frenchDate('2026-09-05T23:27:00Z',true),'5 septembre 2026 à 19 h 27');
 assert.equal(frenchDate('2026-09-05'),'5 septembre 2026');
 const c={...certificate,public_number:'VET-ABC123456789',version_number:2,snapshot:{...certificate.snapshot,issued_at:'2026-09-05T23:27:00Z',prepared_name:'Camille Secrétaire',created_by:certificate.id,issued_by:certificate.id,signature:{signature_visual:[[[0.1,0.1],[0.2,0.2]]],practitioner_name:'Amélie Croteau',permit_number:'4887',signed_at:'2026-09-05T23:27:00Z'}}};
 const html=certificateHtml(c,{verificationUrl:'http://127.0.0.1:5173/vet/verify/VET-ABC123456789',qrSvg:'<svg aria-label="QR"/>'});
 for(const text of ['Camille Secrétaire','Certificat valide et signé','autorisation préalable','Signature électronique du vétérinaire','HorseShowPlatform','/vet/verify/VET-ABC123456789','5 septembre 2026 à 19 h 27'])assert.ok(html.includes(text));
 assert.ok(!html.includes(c.id));assert.ok(!html.includes('Non renseigné'));assert.ok(!html.includes('Écurie ou agent'));assert.ok(signatureSvg(c.snapshot.signature.signature_visual).includes('polyline'));
});

test('QR is decoded back to the private-pilot public status URL',async()=>{
 const {default:QRCode}=await import('qrcode');const {PNG}=await import('pngjs');const {default:jsQR}=await import('jsqr');
 const url='https://codespace-5173.app.github.dev/vet/verify/VET-ABC123456789';
 const png=PNG.sync.read(await QRCode.toBuffer(url,{type:'png',width:320,margin:4,errorCorrectionLevel:'M'}));
 const decoded=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
 assert.equal(decoded?.data,url);
});

test('simulated authorization produces an unmistakable test PDF without claiming vet consent',()=>{
 const c={...certificate,snapshot:{...certificate.snapshot,signature:{signed_content:{test_only:true},signature_visual:[],practitioner_name:'Amélie Croteau',permit_number:'4887'}}};
 const html=certificateHtml(c);
 assert.ok(html.includes('TEST — AUCUNE SIGNATURE RÉELLE'));assert.ok(html.includes('Ne pas utiliser comme preuve de vaccination'));
 assert.ok(!html.includes('Certificat valide et signé'));assert.ok(!html.includes('Ce certificat a été signé électroniquement par le vétérinaire responsable'));
});
