import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium,expect} from '@playwright/test';
import bundledChromium from '@sparticuz/chromium';
const server=await createServer({configFile:false,envDir:false,plugins:[{name:'isolated-horse-access',enforce:'pre',load(id){if(id.endsWith('/src/lib/supabase.ts'))return 'export const supabase=null;export const requireSupabase=()=>window.horseClient;';}},react()],server:{host:'127.0.0.1',port:5194,strictPort:true,fs:{deny:['.env','.env.*','**/.git/**','**/.tmp/**']}}});let browser;
try{
 await server.listen();await mkdir('.tmp/horse-access',{recursive:true});const launch=process.platform==='linux'?{executablePath:await bundledChromium.executablePath(),args:bundledChromium.args}:{channel:'chrome'};browser=await chromium.launch({...launch,headless:true});const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 for(const locale of ['en','fr'])for(const [width,height]of [[320,568],[390,844],[844,390]]){
  await page.setViewportSize({width,height});const text=(fr,en)=>locale==='fr'?fr:en;
  async function open(role='requester'){await page.goto(`http://127.0.0.1:5194/scripts/tests/horse-access/index.html?locale=${locale}&role=${role}`);}
  async function ownerForm(){await page.getByRole('button',{name:text('Créer pour un autre propriétaire','Create for another owner'),exact:true}).click();return page.getByRole('dialog');}
  await open();await page.getByRole('button',{name:text('Demander à devenir agent d’un cheval','Request access as a horse agent'),exact:true}).click();let dialog=page.getByRole('dialog');
  await dialog.getByLabel(text('Nom exact ou numéro du cheval','Exact horse name or number')).fill('Pilot Horse');await dialog.getByRole('button',{name:text('Rechercher le cheval','Find horse'),exact:true}).click();
  await dialog.getByRole('button',{name:text('Demander à devenir agent','Request to become agent'),exact:true}).click();await expect(page.getByText(text('En attente — aucun nouvel accès accordé','Pending — no new access granted'),{exact:false})).toBeVisible();
  assert.equal(await page.getByRole('button',{name:text('Approuver l’accès d’agent','Approve agent access')}).count(),0);
  if(locale==='fr'&&width===390)await page.screenshot({path:'.tmp/horse-access/pending-agent-mobile.png',fullPage:true});
  await page.getByRole('button',{name:text('Annuler ma demande','Cancel my request'),exact:true}).click();await expect(page.getByText(text('Annulée','Cancelled'),{exact:true})).toBeVisible();
  await open('owner');await page.getByRole('button',{name:text('Approuver l’accès d’agent','Approve agent access'),exact:true}).click();await expect(page.getByText(text('Approuvée','Approved'),{exact:true})).toBeVisible();
  await open();dialog=await ownerForm();await dialog.getByLabel(text('Numéro NRHA du propriétaire','Owner NRHA number')).fill('123');await dialog.getByRole('button',{name:text('Rechercher le propriétaire','Find owner'),exact:true}).click();await expect(dialog.getByText('Owner Pilot',{exact:true})).toBeVisible();
  await dialog.getByLabel(text('Nom du cheval','Horse name'),{exact:true}).fill('New Private Owner Horse');await dialog.getByRole('button',{name:text('Créer le cheval pour ce propriétaire','Create horse for this owner'),exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.created.length)).toBe(1);assert.equal(await page.evaluate(()=>window.created[0].p_number),'123');
  await open();dialog=await ownerForm();await dialog.getByRole('button',{name:text('Nom et confirmation','Name and confirmation'),exact:true}).click();await dialog.getByLabel(text('Prénom du propriétaire','Owner first name'),{exact:true}).fill('Owner');await dialog.getByLabel(text('Nom du propriétaire','Owner last name'),{exact:true}).fill('Pilot');await dialog.getByLabel(text('Nom du cheval','Horse name'),{exact:true}).fill('Proposed Horse');await dialog.getByRole('button',{name:text('Demander la confirmation du propriétaire','Request owner confirmation'),exact:true}).click();await expect(page.getByText(text('En attente — aucun nouvel accès accordé','Pending — no new access granted'),{exact:false})).toBeVisible();assert.equal(await page.evaluate(()=>window.created.length),0);
  await open('nrha-private');dialog=await ownerForm();await dialog.getByLabel(text('Numéro NRHA du propriétaire','Owner NRHA number')).fill('123');await dialog.getByRole('button',{name:text('Rechercher le propriétaire','Find owner'),exact:true}).click();await dialog.getByLabel(text('Nom du cheval','Horse name'),{exact:true}).fill('Private Owner Horse');await dialog.getByRole('button',{name:text('Demander l’accord du propriétaire','Request owner approval'),exact:true}).click();await expect(page.getByText(text('En attente — aucun nouvel accès accordé','Pending — no new access granted'),{exact:false})).toBeVisible();assert.equal(await page.evaluate(()=>window.created.length),0);
  await open('nrha-owner');await page.getByRole('button',{name:text('Confirmer et créer le cheval','Confirm and create horse'),exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.calls.some(call=>call.name==='decide_horse_owner_confirmation'&&call.args.p_owner==='owner'))).toBe(true);
  await open('staff');await page.getByRole('combobox',{name:text('Fiche du propriétaire confirmée','Confirmed owner record')}).click();await page.getByRole('option').filter({hasText:'Owner Pilot'}).click();await page.getByRole('button',{name:text('Confirmer et créer le cheval','Confirm and create horse'),exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.calls.some(call=>call.name==='decide_horse_owner_confirmation'&&call.args.p_owner==='owner'))).toBe(true);
  for(const role of ['form','owned']){
   await open(role);await page.getByRole('button',{name:text('Pas de numéro NRHA ? Créer manuellement','No NRHA number? Create manually'),exact:true}).click();await page.getByLabel(text('Nom du cheval','Horse name'),{exact:true}).fill('Pilot Horse');await page.getByRole('button',{name:text('Créer le cheval','Create horse'),exact:true}).click();
   const review=page.getByRole('region',{name:text('Cheval existant possible','Possible existing horse')});await expect(review).toBeVisible();assert.equal(await page.evaluate(()=>window.created.length),0);
   await review.getByRole('button',{name:role==='owned'?text('Utiliser ce cheval','Use this horse'):text('Demander à devenir agent','Request to become agent'),exact:true}).click();
   if(role==='owned')await expect.poll(()=>page.evaluate(()=>window.selected)).toEqual(['horse']);else await expect.poll(()=>page.evaluate(()=>window.requests.length)).toBe(1);
   assert.equal(await page.evaluate(()=>window.created.length),0);
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);console.log(`PASS horse access ${locale} ${width}x${height}`);
 }
 assert.deepEqual(errors,[]);console.log('PASS horse access: minimal existing-horse search, pending/cancel, owner approval, staff owner confirmation, NRHA owner creation, name-only pending without creation, existing horse reuse/request before duplicate creation, shared mobile styles FR/EN. External traffic blocked.');
}finally{await browser?.close();await server.close();}
