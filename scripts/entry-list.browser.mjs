import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import {chromium,expect} from '@playwright/test';
import bundled from '@sparticuz/chromium';
const fixture={
 horses:[{id:'z',name:'Zorro'},{id:'e',name:'Éclair'},{id:'a',name:'Alpha'}],
 contacts:[{id:'owner',first_name:'Éloïse',last_name:'Owner',type:'owner'},{id:'r1',first_name:'Sophie',last_name:'Rider',type:'rider'},{id:'r2',first_name:'Alex',last_name:'Rider',type:'rider'}],
 classes:[{id:'c1',name:'Open',code:'1100',block_id:'block',governing_body_assignments:[]},{id:'c2',name:'Intermediate Open',code:'1200',block_id:'block',governing_body_assignments:[]}],
 blocks:[{id:'block',name:'Open / Omnium',pattern:'R8'}],
 entries:[['ez','z','c2','r2',10],['ee1','e','c1','r1',20],['ee2','e','c2','r2',20],['ea','a','c1','r2',42]].map(([id,horse_id,class_id,rider_contact_id,entry_number])=>({id,horse_id,class_id,rider_contact_id,entry_number,owner_contact_id:'owner',show_id:'show',organization_id:'org',status:'draft'})),
};
const plugin={name:'grouped-entry-fixture',enforce:'pre',transform(code,id){if(id.endsWith('/src/services/supabaseServices.ts')){const ast=ts.createSourceFile(id,code,ts.ScriptTarget.Latest,true),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='evaluateEntryEligibilityRequirements');return code.slice(0,node.body.pos)+' {return null;}'+code.slice(node.body.end);}if(id.endsWith('/src/services/billingFolio.ts')){const ast=ts.createSourceFile(id,code,ts.ScriptTarget.Latest,true),node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='billingRpc');return code.slice(0,node.body.pos)+' {return [];}'+code.slice(node.body.end);}},configureServer(server){server.middlewares.use('/entry-list-fixture',async(req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/entry-list-fixture',`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {EntriesView} from '/src/features/entries/EntriesView.tsx';import {MyEntriesView} from '/src/features/entries/MyEntriesView.tsx';import '/src/styles.css';
const f=${JSON.stringify(fixture)},empty=()=>Promise.resolve();createRoot(document.getElementById('root')).render(React.createElement(new URLSearchParams(location.search).has('personal')?MyEntriesView:EntriesView,{...f,locale:'fr',contactRoles:[],contactExternalIdentifiers:[],externalCredentialIssuers:[],horseExternalIdentifiers:[],horseHealthDocuments:[],membershipRequirements:[],nrhaRiderRankings:[],organization:null,profileId:'profile',showDays:[],shows:[{id:'show',name:'TEST',start_date:'2026-11-05'}],onCreateContact:empty,onCreateEntry:empty,onCreateHorse:empty,onCreateHorseHealthDocument:empty,onDeleteEntry:async id=>{window.deleted=id;},onUpdateEntry:empty,onVerifyGvlCogginsDocument:empty,onVerifyNrhaEligibility:empty,onVerifyNrhaHorse:empty}));
</script></body></html>`));}catch(e){next(e);}});}};
const server=await createServer({configFile:false,root:process.cwd(),plugins:[plugin,react()],server:{host:'127.0.0.1',port:5195,strictPort:true}});let browser;
try{await server.listen();browser=await chromium.launch({executablePath:await bundled.executablePath(),args:bundled.args});const page=await browser.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>console.error(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 for(const suffix of ['', '?personal']){
  await page.goto('http://127.0.0.1:5195/entry-list-fixture'+suffix);
  const groups=page.locator('details.entry-horse-group'),search=page.getByRole('searchbox',{name:'Rechercher dans les inscriptions'});
  await expect(groups).toHaveCount(3);expect(await groups.locator('summary strong').allTextContents()).toEqual(['Alpha','Éclair','Zorro']);await expect(page.locator('details[open]')).toHaveCount(0);
  await groups.nth(1).locator('summary').click();await expect(page.locator('details[open] .table-row:not(.table-head)')).toHaveCount(2);await expect(page.locator('details[open]').getByText('Patron: Reining #8').first()).toBeVisible();
  await search.fill('eclair');await expect(groups).toHaveCount(1);await expect(page.locator('details[open] .table-row:not(.table-head)')).toHaveCount(2);
  await search.fill('sophie');await expect(groups).toHaveCount(1);await expect(page.locator('details[open] .table-row:not(.table-head)')).toHaveCount(1);await expect(page.getByRole('status').last()).toContainText('1 cheval · 1 inscription');
  await search.fill('1200');await expect(groups).toHaveCount(2);expect(await groups.locator('summary strong').allTextContents()).toEqual(['Éclair','Zorro']);
  await search.fill('aucun resultat');await expect(groups).toHaveCount(0);await expect(page.getByText('Aucune inscription ne correspond à la recherche.')).toBeVisible();await page.getByRole('button',{name:'Effacer la recherche'}).click();await expect(groups).toHaveCount(3);
  await search.fill('42');await expect(groups).toHaveCount(1);await expect(groups.locator('summary strong')).toHaveText('Alpha');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Supprimer',exact:true}).click();expect(await page.evaluate(()=>window.deleted)).toBe('ea');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.setViewportSize({width:1280,height:900});
 }
 console.log('PASS: association and personal lists group horses alphabetically, expand details, filter immediately by unaccented name/rider/class/number, clear/no-results, retain correct delete target and fit mobile.');
}finally{if(browser)await browser.close();await server.close();}
