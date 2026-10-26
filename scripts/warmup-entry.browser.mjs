import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import {chromium,expect} from '@playwright/test';
import bundled from '@sparticuz/chromium';
const session={id:'warm',name:'Paid warm up 40x',show_id:'show',show_day_id:'day',sort_order:30,schedule_start_time:'07:00:00',price:25,currency:'CAD',capacity:40,state:'open',requests:[]};
const plugin={name:'warmup-entry-fixture',enforce:'pre',transform(code,id){
 if(id.endsWith('/src/services/billingFolio.ts')){const ast=ts.createSourceFile(id,code,ts.ScriptTarget.Latest,true),n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='billingRpc');return code.slice(0,n.body.pos)+` {if(name==='paid_warmup_signup_options')return [{...${JSON.stringify(session)},requests:window.savedWarmup?[{horse_id:'horse',status:'requested',billed:false}]:[]}];if(name==='paid_warmup_request'){window.savedWarmup=args;return 'request';}return [];}`+code.slice(n.body.end);}
 if(id.endsWith('/src/services/supabaseServices.ts')){const ast=ts.createSourceFile(id,code,ts.ScriptTarget.Latest,true),n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='listHorseHealthCompliance');return code.slice(0,n.body.pos)+` {return [{horse_id:'horse',can_proceed:true,compliance_status:'compliant',reasons:[]}];}`+code.slice(n.body.end);}
},configureServer(server){server.middlewares.use('/warmup-entry-fixture',async(req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/warmup-entry-fixture',`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {EntryForm} from '/src/features/entries/EntryForm.tsx';import '/src/styles.css';
const empty=()=>Promise.resolve();createRoot(document.getElementById('root')).render(React.createElement(EntryForm,{locale:'fr',blocks:[],classes:[],entries:[],contactExternalIdentifiers:[],contactRoles:[],externalCredentialIssuers:[],horseExternalIdentifiers:[],horseHealthDocuments:[],membershipRequirements:[],nrhaRiderRankings:[],organization:{id:'org'},profileId:'agent',contacts:[{id:'owner',first_name:'Future',last_name:'Owner',type:'owner'}],horses:[{id:'horse',name:'Sailing For Platinum',primary_owner_contact_id:'owner'}],shows:[{id:'show',name:'Concours Pilote 2026',start_date:'2026-11-05',end_date:'2026-11-08',default_currency:'CAD'}],showDays:[{id:'day',show_id:'show',name:'Jeudi',day_date:'2026-11-05',sort_order:1,day_number:1}],onCreateContact:empty,onCreateEntry:empty,onCreateHorse:empty,onCreateHorseHealthDocument:empty,onVerifyGvlCogginsDocument:empty,onVerifyNrhaEligibility:empty,onVerifyNrhaHorse:empty}));
</script></body></html>`));}catch(e){next(e);}});}};
const server=await createServer({configFile:false,root:process.cwd(),plugins:[plugin,react()],server:{host:'127.0.0.1',port:5196,strictPort:true}});let browser;
try{await server.listen();browser=await chromium.launch({executablePath:await bundled.executablePath(),args:bundled.args});const page=await browser.newPage();page.on('pageerror',e=>console.error(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('http://127.0.0.1:5196/warmup-entry-fixture');
 await expect(page.getByText('Paid warm up 40x · Paid warm-up',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Demander une place'})).toBeDisabled();
 await page.getByRole('combobox').nth(1).click();await page.getByRole('option').filter({hasText:'Sailing For Platinum'}).click();
 await expect(page.getByRole('button',{name:'Demander une place'})).toBeEnabled();
 await expect(page.getByText('Unknown contact',{exact:false})).toHaveCount(0);
 await page.getByRole('button',{name:'Demander une place'}).click();
 await expect(page.getByRole('status')).toContainText('Demande reçue');
 expect(await page.evaluate(()=>window.savedWarmup)).toEqual({p_warmup:'warm',p_horse:'horse',p_cancel:false});
 console.log('PASS: warm-up in entry day schedule, owner visible, horse selection required, request saved without class or rider, not billed.');
}finally{if(browser)await browser.close();await server.close();}
