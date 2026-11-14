import {createServer} from 'vite';import react from '@vitejs/plugin-react';
import {chromium,expect} from '@playwright/test';import {serverlessBrowser} from '../server/vet/serverless-browser.mjs';
import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
mkdirSync('.tmp/membership-import-ui',{recursive:true});
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" class="association-settings" style="max-width:1100px;margin:24px auto;padding:16px"></main><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {MembershipImportSettings} from '/src/features/settings/MembershipImportSettings.tsx';import '/src/styles.css';import '/src/features/settings/associationSettings.css';
window.calls=[];window.refreshes=0;window.fail=false;const locale=new URLSearchParams(location.search).get('locale')||'fr';
const types=[{id:'paid',name:'Régulier',season_year:2026,is_active:true,is_public:true,price:100},{id:'board',name:'CA gratuit',season_year:2026,is_active:true,is_public:false,price:0},{id:'old',name:'Inactif',season_year:2026,is_active:false,is_public:false,price:0}];
const contacts=[{id:'local',first_name:'Sam',last_name:'Cavalier',email:'sam@example.test',linked_user_id:'user-sam'}];
createRoot(document.getElementById('root')).render(React.createElement(MembershipImportSettings,{organizationId:'org',types,contacts,locale,onRefresh:()=>window.refreshes++}));</script></body></html>`;
const mock=`export async function previewMembershipImport(org,type,rows,source){window.calls.push({kind:'preview',org,type,rows,source});return {token:'signed',type_name:'Card',season:2026,rows:rows.map((r,i)=>({row:i+1,action:r.contact_id?'link':r.create_contact?'create':'resolve',error:null,contact_id:r.contact_id||null,contact_name:r.contact_id==='global'?'Alex Importé':r.contact_id?'Sam Cavalier':'',has_account:!!r.contact_id,candidates:r.email==='alex@example.test'?[{id:'global',name:'Alex Importé',email_hint:'a***@example.test',has_account:true,in_directory:false}]:[],valid_from:'2026-01-01',valid_until:'2026-12-31'}))};}
export async function applyMembershipImport(operation,org,type,rows,source,token){window.calls.push({kind:'apply',operation,org,type,rows,source,token});if(window.fail)throw Error('MEMBERSHIP_IMPORT_PREVIEW_CHANGED');return {created:rows.length,skipped:0,new_contacts:rows.filter(r=>r.create_contact).length,batch_id:operation}}`;
const server=await createServer({configFile:false,envDir:false,plugins:[react(),{name:'import-test',enforce:'pre',resolveId(source,importer){if(source==='./membershipImportService'&&importer?.includes('MembershipImportSettings'))return '\0import-mock';},load(id){if(id==='\0import-mock')return mock;},configureServer(server){server.middlewares.use('/import-test',async(_req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/import-test',html));}catch(error){next(error);}});}}],server:{host:'127.0.0.1',port:5205,strictPort:true}});
let browser;try{
 await server.listen();browser=process.platform==='linux'?await serverlessBrowser.launch({headless:true}):await chromium.launch(process.platform==='win32'?{channel:'chrome',headless:true}:{headless:true});
 const page=await browser.newPage({viewport:{width:1365,height:1100}});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 for(const locale of ['fr','en']){const fr=locale==='fr';await page.goto('http://127.0.0.1:5205/import-test?locale='+locale);
  const type=page.getByLabel(fr?'Type de carte et saison':'Membership type and season');await type.selectOption('paid');
  const file=page.getByLabel(fr?'Charger un fichier CSV':'Upload CSV');
  await file.setInputFiles({name:'membres.csv',mimeType:'text/csv',buffer:Buffer.from('prenom,nom,courriel,contact_id,numero_membre\nAlex,Importé,alex@example.test,,EXT1\nSam,Cavalier,sam@example.test,local,EXT2\nNouveau,Cavalier,new@example.test,,EXT3')});
  await expect(page.locator('.membership-import-row')).toHaveCount(3);assert.equal((await page.evaluate(()=>window.calls)).length,0);
  const review=page.getByRole('button',{name:fr?'Vérifier les correspondances et les cartes':'Check matches and memberships',exact:true});await review.click();
  await expect(page.getByText(fr?'1 correspondance(s) suggérée(s) dans la liste. Confirmez la bonne personne.':'1 suggested match(es) in the list. Confirm the correct person.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:fr?'Confirmer l’activation des cartes':'Confirm membership activation',exact:true})).toHaveCount(0);
  const first=page.locator('.membership-import-row').nth(0).getByRole('combobox');await first.selectOption('global');await expect(first).toHaveValue('global');
  await page.locator('.membership-import-row').nth(2).getByRole('combobox').selectOption('create');await review.click();
  const apply=page.getByRole('button',{name:fr?'Confirmer l’activation des cartes':'Confirm membership activation',exact:true});await expect(apply).toBeDisabled();
  await page.getByRole('checkbox').check();await page.evaluate(()=>window.fail=true);await apply.click();await expect(page.getByRole('alert')).toContainText(fr?'Les données ont changé':'Data changed');
  await page.evaluate(()=>window.fail=false);await review.click();await page.getByRole('checkbox').check();await page.screenshot({path:'.tmp/membership-import-ui/review-'+locale+'.png'});await apply.click();
  await expect(page.getByRole('status')).toContainText(fr?'3 carte(s) activée(s)':'3 card(s) activated');
  const imports=(await page.evaluate(()=>window.calls)).filter(c=>c.kind==='apply');assert.equal(imports.length,2);assert.equal(imports[0].operation,imports[1].operation);assert.equal(imports[1].rows[0].contact_id,'global');assert.equal(imports[1].rows[2].create_contact,true);assert.equal(imports[1].source,'external_purchase');assert.equal(imports[1].token,'signed');
  await page.getByLabel(fr?'Origine des cartes':'Membership source').selectOption('complimentary');await expect(type.locator('option[value="paid"]')).toHaveCount(0);await expect(type.locator('option[value="board"]')).toHaveCount(1);await type.selectOption('board');
  await page.getByRole('button',{name:fr?'Attribuer à une personne':'Assign to one person',exact:true}).click();await first.selectOption('local');await review.click();await page.getByRole('checkbox').check();
  await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'.tmp/membership-import-ui/mobile-'+locale+'.png'});await apply.click();
  const last=(await page.evaluate(()=>window.calls)).filter(c=>c.kind==='apply').at(-1);assert.equal(last.source,'complimentary');assert.equal(last.type,'board');assert.equal(await page.evaluate(()=>window.refreshes),2);
  await file.setInputFiles({name:'bad.csv',mimeType:'text/csv',buffer:Buffer.from('email,courriel\na,b')});await expect(page.getByRole('alert')).toContainText(fr?'Plusieurs colonnes':'Multiple columns');await page.setViewportSize({width:1365,height:1100});
 }
 assert.deepEqual(errors,[]);console.log('PASS: CSV review, explicit existing-account matches, new contacts, stale preview/retry, confirmation, free hidden cards, invalid CSV, FR/EN and mobile');
}finally{await browser?.close();await server.close();}
