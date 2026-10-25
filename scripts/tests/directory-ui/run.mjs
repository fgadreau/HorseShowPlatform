// Run from the repository root: node scripts/tests/directory-ui/run.mjs
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import fs from 'node:fs';
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
 return code;
}},react()],server:{host:'127.0.0.1',port:5182,strictPort:true}});
await server.listen();
const executablePath=process.env.CHROMIUM_EXECUTABLE_PATH ?? (fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
const browser=await chromium.launch({executablePath,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5182/scripts/tests/directory-ui/index.html');
 await page.getByRole('button',{name:'Ranch — Choisir',exact:true}).click();
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
 await page.getByRole('button',{name:'Ranch — Choisir',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'Inscription refusée'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Ranch — Choisir',exact:true})).toBeEnabled();
 await page.evaluate(()=>{window.failEnrollment=false});
 await page.getByRole('button',{name:'Ranch — Choisir',exact:true}).click();
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
 expect(errors).toEqual([]);
 console.log('PASS: failed enrollment displays its error, allows a retry and produces no browser exception.');
}finally{await browser.close();await server.close();}
