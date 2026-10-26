// Local synthetic fixtures. NRHA and Supabase responses are simulated; no external calls.
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import {chromium,expect} from '@playwright/test';
import bundled from '@sparticuz/chromium';
const fixture={
 organization:{id:'org',currency:'CAD',tax_rate:0},
 show:{id:'show',name:'Entry TEST',start_date:'2026-11-05',end_date:'2026-11-08',entry_payment_policy:'manual'},
 block:{id:'block',organization_id:'org',show_id:'show',show_day_id:'day',name:'Open / Omnium',block_type:'competition',sort_order:1,schedule_start_mode:'fixed',scheduled_time:'08:00',entries_close_at:null},
 horse:{id:'horse',name:'TEST Horse',primary_owner_contact_id:'owner',date_of_birth:'2020-01-01'},
 contacts:[{id:'owner',first_name:'TEST',last_name:'Owner',type:'owner'},{id:'rider',first_name:'TEST',last_name:'Rider',type:'rider',date_of_birth:'1980-01-01'}],
 classes:[['c1','1100','Open'],['c2','1200','Intermediate Open']].map(([id,code,name],i)=>({id,code,name,organization_id:'org',show_id:'show',block_id:'block',entry_fee:i===0?25:30,judge_fee:i===0?10:15,sort_order:i,eligibility_rules:{},governing_body_assignments:[{governing_body_id:'nrha',code:'NRHA',name:'NRHA',reporting_class_code:code,eligibility_profile_code:'category_1_ancillary_year_end',sanction_metadata:{}}]})),
};
const plugin={name:'entry-submit-fixture',enforce:'pre',transform(code,id){
 const replace=(name,body)=>{const ast=ts.createSourceFile(id,code,ts.ScriptTarget.Latest,true),n=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name);return code.slice(0,n.body.pos)+' {'+body+'}'+code.slice(n.body.end);};
 if(id.endsWith('/src/lib/supabase.ts'))return replace('requireSupabase','return window.fixtureClient;');
 if(id.endsWith('/src/services/billingFolio.ts'))return replace('billingRpc','return [];');
 if(id.endsWith('/src/services/supabaseServices.ts'))return replace('listHorseHealthCompliance',"return [{horse_id:'horse',can_proceed:true,compliance_status:'compliant',reasons:[]}];")+'\nexport {assertEntryProgramLimits};';
},configureServer(server){server.middlewares.use('/entry-submit-fixture',async(req,res,next)=>{try{res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml('/entry-submit-fixture',`<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script type="module">
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {EntryForm} from '/src/features/entries/EntryForm.tsx';import {assertEntryProgramLimits} from '/src/services/supabaseServices.ts';import '/src/styles.css';
const f=${JSON.stringify(fixture)},mode=new URLSearchParams(location.search).get('mode');if(mode==='same-judge')f.classes[1].judge_fee=10;
window.checks={};window.created=[];window.failedOnce=false;window.calls=[];
const initial=mode==='existing'?[{id:'existing',horse_id:'horse',class_id:'c1',rider_contact_id:'rider',owner_contact_id:'owner',status:'draft'}]:[];
window.fixtureEntries=initial;
window.fixtureClient={from(table){if(table!=='entries')throw Error('Unexpected query '+table);const filters=[];
 const result=()=>{const data=window.fixtureEntries.filter(e=>filters.every(fn=>fn(e)));return {data,count:data.length,error:null};};
 const q={select(){return q},eq(k,v){filters.push(e=>e[k]===v);return q},neq(k,v){filters.push(e=>e[k]!==v);return q},not(k,op,value){const inactive=value.slice(1,-1).split(',');filters.push(e=>!inactive.includes(e[k]));return q},returns(){return Promise.resolve(result())},then(ok,bad){return Promise.resolve(result()).then(ok,bad)}};return q;}};
window.checkProgramLimits=assertEntryProgramLimits;
const empty=()=>Promise.resolve();
function Harness(){const [entries,setEntries]=useState(initial);return React.createElement(EntryForm,{locale:'fr',blocks:[f.block],classes:f.classes,entries,
 contacts:f.contacts,contactRoles:[],contactExternalIdentifiers:[{contact_id:'rider',external_credential_issuer_id:'nrha',identifier_value:'12345',expires_on:'2027-12-31',status:'active'}],externalCredentialIssuers:[{id:'nrha',code:'NRHA',name:'NRHA'}],horseExternalIdentifiers:[{horse_id:'horse',external_credential_issuer_id:'nrha',identifier_type:'competition_license',identifier_value:'98765'}],horseHealthDocuments:[],membershipRequirements:[],nrhaRiderRankings:[],organization:f.organization,profileId:'agent',horses:[f.horse],shows:[f.show],showDays:[{id:'day',show_id:'show',day_date:'2026-11-05',day_name:'Jeudi',sort_order:1,day_number:1}],onCreateContact:empty,onCreateHorse:empty,onCreateHorseHealthDocument:empty,onVerifyGvlCogginsDocument:empty,onVerifyNrhaHorse:empty,
 onVerifyNrhaEligibility:async input=>{const id=input.decisionContext.classId;window.checks[id]=(window.checks[id]??0)+1;const final=window.checks[id]>1&&id==='c2';const denied=mode==='denied'&&final;const unavailable=mode==='unavailable'&&final;return {eligible:!denied&&!unavailable,status:unavailable?'unavailable':denied?'ineligible':'eligible',reasons:denied?[{message:'TEST NRHA refusal'}]:[]};},
 onCreateEntry:async input=>{window.calls.push(input.class_id);await assertEntryProgramLimits({...input,rider_contact_id:input.rider_contact_id??null});if(mode==='partial'&&input.class_id==='c2'&&!window.failedOnce){window.failedOnce=true;throw Error('TEST temporary failure');}const row={id:'entry-'+input.class_id,...input,status:'draft'};window.created.push(row);window.fixtureEntries=[...window.fixtureEntries,row];setEntries(window.fixtureEntries);},onCreated:()=>{window.completed=true;}});}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
</script></body></html>`));}catch(e){next(e);}});}};
const server=await createServer({configFile:false,root:process.cwd(),plugins:[plugin,react()],server:{host:'127.0.0.1',port:5197,strictPort:true}});let browser;
try{await server.listen();browser=await chromium.launch({executablePath:await bundled.executablePath(),args:bundled.args});const page=await browser.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>console.error(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const classButton=id=>page.locator('.entry-showbill-class').filter({hasText:id==='c1'?'1100 - Open':'1200 - Intermediate Open'});
 async function prepare(mode){await page.goto('http://127.0.0.1:5197/entry-submit-fixture?mode='+mode);await page.getByRole('combobox').nth(1).click();await page.getByRole('option').filter({hasText:'TEST Horse'}).click();await page.getByRole('combobox').nth(2).click();await page.getByRole('option').filter({hasText:'TEST Rider'}).click();await expect(classButton('c2')).toBeEnabled();}
 const submit=()=>page.getByRole('button',{name:/Créer les? brouillons? et la facture/});
 await prepare('success');
 await expect(classButton('c1').locator('.entry-judge-fee')).toContainText('$10.00');
 await classButton('c1').click();await expect(page.locator('.entry-block-judge-fee')).toContainText('$10.00');
 await expect(classButton('c2')).toContainText('Frais du bloc si sélectionnée : $15.00');
 await classButton('c2').click();await expect(classButton('c1').locator('s')).toHaveText('$10.00');await expect(classButton('c2').locator('s')).toHaveCount(0);
 await expect(page.locator('.entry-checkout-judge-line')).toHaveCount(1);await expect(page.locator('.entry-checkout-judge-line')).toContainText('$15.00');
 await expect(page.locator('.entry-checkout-judge-line')).toContainText('1200 - Intermediate Open');
 await classButton('c2').click();await expect(classButton('c1').locator('s')).toHaveCount(0);await expect(page.locator('.entry-checkout-judge-line')).toContainText('$10.00');
 await classButton('c2').click();await submit().click();await expect.poll(()=>page.evaluate(()=>window.created.length)).toBe(2);expect(await page.evaluate(()=>window.checks)).toEqual({c1:2,c2:2});expect(await page.evaluate(()=>window.completed)).toBe(true);
 console.log('PASS: two NRHA classes in one block submit; each has its final NRHA verification.');
 await prepare('partial');await classButton('c1').click();await classButton('c2').click();await submit().click();await expect(page.getByText(/1 inscription créée.*TEST temporary failure/)).toBeVisible();await expect(classButton('c1')).not.toHaveClass(/selected/);await expect(classButton('c2')).toHaveClass(/selected/);await expect(submit()).toBeEnabled();await submit().click();await expect.poll(()=>page.evaluate(()=>window.created.length)).toBe(2);expect(await page.evaluate(()=>window.calls)).toEqual(['c1','c2','c2']);
 console.log('PASS: interrupted submission retains only unsaved classes; retry never resubmits the saved entry.');
 for(const mode of ['denied','unavailable']){await prepare(mode);await classButton('c1').click();await classButton('c2').click();await submit().click();await expect(page.getByText(/Validation finale NRHA refusée:/)).toBeVisible();expect(await page.evaluate(()=>window.created.length)).toBe(0);}
 console.log('PASS: final NRHA refusal or unavailable source prevents all writes.');
 await prepare('existing');await expect(classButton('c1')).toBeDisabled();await expect(classButton('c1')).toContainText('Ce cheval est déjà inscrit dans cette classe.');await classButton('c2').click();await submit().click();await expect.poll(()=>page.evaluate(()=>window.created.length)).toBe(1);
 console.log('PASS: existing class duplicate is explained precisely while another class in the same block remains available.');
 const duplicate=await page.evaluate(async()=>{try{await window.checkProgramLimits({class_id:'c2',horse_id:'horse',rider_contact_id:'rider',owner_contact_id:'owner'});return null;}catch(e){return e.message;}});expect(duplicate).toBe('Ce cheval est déjà inscrit dans cette classe.');
 console.log('PASS: submission service still rejects an actual duplicate in the same class.');
 const riderLimit=await page.evaluate(async()=>{window.fixtureEntries=Array.from({length:3},(_,i)=>({id:'other-'+i,horse_id:'other-horse-'+i,class_id:'c2',rider_contact_id:'rider',owner_contact_id:'owner',status:'draft'}));try{await window.checkProgramLimits({class_id:'c2',horse_id:'new-horse',rider_contact_id:'rider',owner_contact_id:'owner'});return null;}catch(e){return e.message;}});
 expect(riderLimit).toContain('trois fois dans une même classe');
 console.log('PASS: the rider limit of three entries in one class remains enforced.');
 await prepare('same-judge');await classButton('c1').click();await expect(classButton('c2').locator('s')).toHaveText('$10.00');await expect(classButton('c2')).toContainText('Aucun frais de juge supplémentaire');await classButton('c2').click();await expect(page.locator('.entry-checkout-judge-line')).toHaveCount(1);await expect(page.locator('.entry-checkout-judge-line')).toContainText('$10.00');
 console.log('PASS: judge fees show per class, strike included fees, update when selecting/removing a higher-fee class, and appear once per block in the summary.');


}finally{if(browser)await browser.close();await server.close();}
