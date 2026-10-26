// Run from the repository root: node scripts/tests/directory-ui/run.mjs
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import bundledChromium from '@sparticuz/chromium';
import {chromium,expect} from '@playwright/test';
const server=await createServer({configFile:false,plugins:[{name:'directory-fixture',enforce:'pre',transform(code,id){
 if(id.endsWith('/src/lib/supabase.ts')){
  const ast=ts.createSourceFile(id,code,ts.ScriptTarget.Latest,true);
  const n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='requireSupabase');
  return code.slice(0,n.body.pos)+' {return window.testClient;}'+code.slice(n.body.end);
 }
 if(!id.endsWith('/src/services/supabaseServices.ts'))return;
 const ast=ts.createSourceFile(id,code,ts.ScriptTarget.Latest,true);
 const edits=[];
 for(const n of ast.statements){if(ts.isFunctionDeclaration(n)&&['joinPublicDirectory','listHorseHealthCompliance'].includes(n.name?.text))edits.push({start:n.body.pos,end:n.body.end,value:n.name.text==='joinPublicDirectory'?" {if(window.failEnrollment)throw new Error('Inscription refusée');window.enrollments.push(directoryId);return 'owner';}":' {return [];}'});}
 for(const e of edits.reverse())code=code.slice(0,e.start)+e.value+code.slice(e.end);
 return code+'\nexport {ensureHorseOrganizationLink};';
}},react()],server:{host:'127.0.0.1',port:5182,strictPort:true}});
await server.listen();
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH ?? await bundledChromium.executablePath();
const browser=await chromium.launch({executablePath,args:bundledChromium.args});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5182/scripts/tests/directory-ui/index.html');
 await expect(page.getByRole('combobox',{name:'Répertoire',exact:true})).toHaveValue('dir1');
 expect(await page.evaluate(()=>window.enrollments)).toEqual([]);
 await page.getByRole('combobox',{name:'Répertoire',exact:true}).selectOption('dir2');
 await page.getByRole('button',{name:'Confirmer mon répertoire',exact:true}).click();
 await expect(page.getByRole('button',{name:'Ranch — Ajouté',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Reining — Choisir',exact:true}).click();
 expect(await page.evaluate(()=>window.enrollments)).toEqual(['dir2','dir1']);
 console.log('PASS: mobile user explicitly enrolls in two directories and receives persisted-selection feedback.');
 await page.getByRole('button',{name:'Cheval',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:'Ranch',exact:true}).click();
 await dialog.getByRole('button',{name:'Reining',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Reining',exact:true})).toHaveAttribute('aria-pressed','false');
 await dialog.getByRole('button',{name:'Ranch',exact:true}).click();
 await expect(dialog.getByRole('button',{name:'Ranch',exact:true})).toHaveAttribute('aria-pressed','true');
 await dialog.getByRole('button',{name:'Pas de numéro NRHA ? Créer manuellement',exact:true}).click();
 await dialog.getByRole('textbox',{name:'Nom du cheval',exact:true}).fill('Directory test horse');
 await dialog.getByRole('button',{name:'Créer le cheval',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.createdHorses.length)).toBe(1);
 expect(await page.evaluate(()=>window.createdHorses[0].organization_discipline_ids)).toEqual(['dir2']);
 console.log('PASS: real horse form submits only the selected nondefault directory; the last selection cannot be cleared.');
 await page.goto('http://127.0.0.1:5182/scripts/tests/directory-ui/index.html?failure');
 await page.getByRole('combobox',{name:'Répertoire',exact:true}).selectOption('dir2');
 await page.getByRole('button',{name:'Confirmer mon répertoire',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Inscription refusée'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Confirmer mon répertoire',exact:true})).toBeEnabled();
 await page.evaluate(()=>{window.failEnrollment=false});
 await page.getByRole('button',{name:'Confirmer mon répertoire',exact:true}).click();
 await expect(page.getByRole('button',{name:'Ranch — Ajouté',exact:true})).toBeDisabled();
 const serviceResult=await page.evaluate(async()=>{
  const input={organization_id:'org',name:'Service horse',primary_owner_contact_id:'owner',created_by_user_id:'profile'};
  await window.createHorseThroughService({...input,organization_discipline_ids:['dir2','dir2']});
  const linked=window.serviceWrites.filter(w=>w.table==='directory_horses').map(w=>w.value.organization_discipline_id);
  const horsePayload=window.serviceWrites.find(w=>w.table==='horses').value;
  const invalid=[];
  for(const ids of [[],['foreign-or-inactive']]){
   window.serviceWrites=[];
   try{await window.createHorseThroughService({...input,organization_discipline_ids:ids});invalid.push({rejected:false});}
   catch{invalid.push({rejected:true,writes:window.serviceWrites.length});}
  }
  return {linked,hasDirectoryPayload:'organization_discipline_ids' in horsePayload,invalid};
 });
 expect(serviceResult).toEqual({linked:['dir2'],hasDirectoryPayload:false,invalid:[{rejected:true,writes:0},{rejected:true,writes:0}]});
 console.log('PASS: creation service links only the chosen directory, deduplicates IDs and rejects empty/invalid selections before writes.');
 const contactResult=await page.evaluate(async()=>{
  const contacts=new Map();const links=new Map();const events=[];
  window.testClient={from(table){
   let value;let operation='select';const filters={};let failure=null;
   const linkKey=()=>filters.contact_id+'|'+filters.organization_discipline_id;
   const result=()=>{
    if(failure)return {data:null,error:failure};
    if(table==='organization_disciplines')return {data:filters.ids?[{id:'dir1'}]:{id:'dir1'},error:null};
    if(table==='directory_contacts')return {data:operation==='select'?links.get(linkKey())??null:value,error:null};
    if(table==='contacts')return {data:operation==='select'?contacts.get(filters.id):value,error:null};
    return {data:{...value,id:table==='horses'?'horse':'identifier'},error:null};
   };
   const write=(op,payload)=>{
    operation=op;value=payload;events.push(table);
    if(table==='contacts')contacts.set(payload.id,payload);
    if(table==='contact_external_identifiers'&&[...links.values()].some(l=>l.contact_id===payload.contact_id))failure={message:'RLS: identity locked after directory enrollment'};
    if(table==='directory_contacts'){
     const k=payload.contact_id+'|'+payload.organization_discipline_id;
     if(links.has(k))failure={message:'RLS: redundant directory update denied'};
     else links.set(k,{...payload,id:'link'});
    }
    return chain;
   };
   const chain={select(){return chain},eq(k,v){filters[k]=v;return chain},in(k,v){filters.ids=v;return chain},order(){return chain},limit(){return chain},
    insert(v){return write('insert',v)},upsert(v){return write('upsert',v)},
    single(){return Promise.resolve(result())},maybeSingle(){return Promise.resolve(result())},then(resolve,reject){return Promise.resolve(result()).then(resolve,reject)}};
   return chain;
  }};
  const owner=await window.createContactThroughService({organization_id:'org',type:'owner',first_name:'Imported',last_name:'Owner',created_by_user_id:'profile',external_memberships:[{external_credential_issuer_id:'nrha',identifier_value:'12345',status:'unknown'}]});
  await window.createHorseThroughService({organization_id:'org',organization_discipline_ids:['dir1'],name:'Imported horse',primary_owner_contact_id:owner.id,created_by_user_id:'profile'});
  return {identifierBeforeLink:events.indexOf('contact_external_identifiers')<events.indexOf('directory_contacts'),directoryWrites:events.filter(t=>t==='directory_contacts').length};
 });
 expect(contactResult).toEqual({identifierBeforeLink:true,directoryWrites:1});
 console.log('PASS: imported owner identifiers are initialized before directory authority changes; horse creation reuses the existing link without a forbidden update.');
 const horseLinkResult=await page.evaluate(async()=>{
  let existing=true;const writes=[];
  window.testClient={from(table){if(table!=='directory_horses')throw Error('Unexpected table');const chain={select(){return chain},eq(){return chain},maybeSingle(){return Promise.resolve({data:existing?{id:'existing-link'}:null,error:null})},upsert(value){writes.push(value);if(existing)throw Error('RLS: agent cannot update directory identity');return Promise.resolve({error:null})}};return chain;}};
  const input={organization_id:'org',organization_discipline_id:'dir1',horse_id:'horse',source:'reservation',created_by_user_id:'booker'};
  await window.ensureHorseDirectoryLink(input);const existingWrites=writes.length;
  existing=false;await window.ensureHorseDirectoryLink(input);
  return {existingWrites,createdLinks:writes.length,directory:writes[0].organization_discipline_id,horse:writes[0].horse_id};
 });
 expect(horseLinkResult).toEqual({existingWrites:0,createdLinks:1,directory:'dir1',horse:'horse'});
 console.log('PASS: a booking agent reuses an existing horse directory link without an identity update; missing links still use the authorized insert path.');
 expect(errors).toEqual([]);
 console.log('PASS: failed enrollment displays its error, allows a retry and produces no browser exception.');
}finally{await browser.close();await server.close();}
