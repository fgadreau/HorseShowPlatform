import assert from 'node:assert/strict';
import {chromium as localBrowser} from '@playwright/test';
import {serverlessBrowser} from '../../server/vet/serverless-browser.mjs';
const chromium=process.env.VET_TEST_SERVERLESS==='true'?serverlessBrowser:localBrowser;
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {renderCertificatePdf} from '../../server/vet/certificate-delivery.mjs';
const administration={product:'Vaccin équin de démonstration',manufacturer:'Fabricant de démonstration',diseases:['influenza','ehv_1','ehv_4'],lot:'LOT-DEMO-2026',administered_on:'2026-09-05',product_expires_on:'2027-09-05',valid_until:'2027-03-05',declared_duration:'6 mois'};
const certificate={public_number:'VET-ABC123456789',version_number:1,status:'issued',snapshot:{issued_at:'2026-09-05T23:27:00Z',prepared_name:'Camille Secrétaire',certificate:{horse:{name:'Cheval officiel de démonstration',identifiers:[{type:'microchip',value:'123456789012345'},{type:'registration',value:'REG-2026-123456'}]},owner:{name:'Alexandre Propriétaire',contact_details:'123, rue de démonstration, Québec (Québec) G1A 1A1',email:'proprietaire@example.test'},agent:{name:'Écurie de démonstration',email:'agent@example.test'},administrations:[]},issuer:{name:'Clinique vétérinaire de démonstration',contact_details:'456, avenue de démonstration, Québec\n418 555-0100 · clinique@example.test'},practitioner:{name:'Amélie Croteau',permit_number:'4887'},verification:{checked_at:'2026-09-05T23:20:00Z'},signature:{practitioner_name:'Amélie Croteau',permit_number:'4887',signed_at:'2026-09-05T23:27:00Z',signature_visual:[[[.1,.2],[.2,.6],[.3,.2],[.5,.5]]]}}};
for(const count of [1,3,6]){
 certificate.snapshot.certificate.administrations=Array.from({length:count},(_,i)=>({...administration,lot:`LOT-DEMO-${i+1}`}));
 const pdf=await renderCertificatePdf(certificate,chromium,'https://sturdy-sniffle-69vvp94vqvvx34jw6-5173.app.github.dev');
 const doc=await getDocument({data:new Uint8Array(pdf),useSystemFonts:true}).promise;
 assert.equal(doc.numPages,1,`${count} administrations must fit on one A4 page`);
 const page=await doc.getPage(1);const text=(await page.getTextContent()).items.map(i=>i.str).join(' ');
 for(const value of ['Cheval officiel','Alexandre Propriétaire','4887','Signature électronique','Authenticité','VET-ABC123456789',`LOT-DEMO-${count}`])assert.ok(text.includes(value),`PDF missing ${value}`);
 const links=await page.getAnnotations();assert.ok(links.some(a=>a.url?.includes('/vet/verify/VET-ABC123456789')));
 assert.ok(!text.includes('Non renseigné'));
 await doc.destroy();console.log(`PASS PDF: ${count} administrations, one A4 page, complete names/lots/signature and verification link`);
}
