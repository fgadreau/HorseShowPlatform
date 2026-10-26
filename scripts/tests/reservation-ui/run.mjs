import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import {chromium,expect} from '@playwright/test';
import bundledChromium from '@sparticuz/chromium';
const server=await createServer({configFile:false,root:process.cwd(),server:{host:'127.0.0.1',port:5180,strictPort:true},plugins:[{name:'isolated-reservation-fixture',enforce:'pre',transform(code,id){
 if(id.endsWith('/src/features/dashboard/StallsViews.tsx'))return code+'\nexport { StallBookingForm };';
 if(id.endsWith('/src/services/billingFolio.ts')) {
   const ast=ts.createSourceFile(id,code,ts.ScriptTarget.Latest,true);
   const node=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='billingRpc');
   return code.slice(0,node.body.pos)+` {return new URLSearchParams(location.search).has('closed') ? [{account_number:'A-1',balance:50,currency:'CAD'}] : [];}`+code.slice(node.body.end);
 }
 if(id.endsWith('/src/services/supabaseServices.ts')){
  const ast=ts.createSourceFile(id,code,ts.ScriptTarget.Latest,true);
  const replacements=[];
  for(const node of ast.statements){if(ts.isFunctionDeclaration(node)&&['listHorseHealthCompliance','ensureContactRoles'].includes(node.name?.text)){
   const body=node.name.text==='ensureContactRoles'?'return;':"return (input.horse_ids || []).map(horse_id => ({horse_id, can_proceed:true, compliance_status:'compliant', reasons:[]}));";
   replacements.push({start:node.body.pos,end:node.body.end,value:' {'+body+'}'});
  }}
  for(const r of replacements.reverse())code=code.slice(0,r.start)+r.value+code.slice(r.end);
  return code;
 }
}},react()]});
await server.listen();
const browser=await chromium.launch({executablePath:await bundledChromium.executablePath(),args:bundledChromium.args});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.setDefaultTimeout(10000);
 page.on('pageerror',e=>console.error('BROWSER:',e.message));
 async function prepare(query=''){
  await page.goto('http://127.0.0.1:5180/scripts/tests/reservation-ui/index.html'+query);
  const responsible=page.getByRole('combobox').first();
  await responsible.click();await page.getByRole('option').filter({hasText:'Laurence'}).click();
  await page.locator('select').filter({has:page.locator('option[value="stall"]')}).selectOption('stall');
  await page.locator('.horse-reservation-row').filter({hasText:'Great Holly Whiz'}).getByRole('checkbox').first().check();
 }
 await prepare();
 await expect(page.getByText('Ce payeur n’a pas encore de connexion HSP.',{exact:false})).toBeVisible();
 await expect(page.getByLabel('Ajouter de la ripe')).toBeDisabled();
 await expect(page.getByText('Aucune option de ripe disponible', {exact:false})).toBeVisible();
 await expect(page.getByRole('button',{name:'Créer la réservation',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Créer la réservation',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.bookings.length)).toBe(1);
 expect(await page.evaluate(()=>({payer:window.bookings[0].payer_contact_id,booker:window.bookings[0].booker_contact_id}))).toEqual({payer:'payer',booker:'booker'});
 console.log('PASS: agent books the stall for its owner without an HSP login; payer remains separate from booker.');
 console.log('PASS: missing shavings option explains disabled checkbox and does not block stall-only booking.');
 await prepare('?bedding');
 await page.locator('.horse-reservation-row').filter({hasText:'Second Horse'}).getByRole('checkbox').first().check();
 const rows=page.locator('.horse-reservation-row');
 await rows.filter({hasText:'Great Holly Whiz'}).getByLabel('Ajouter de la ripe').check();
 await page.getByRole('spinbutton',{name:'Quantite de ripe pour Great Holly Whiz'}).fill('7');
 await rows.filter({hasText:'Second Horse'}).getByLabel('Ajouter de la ripe').check();
 await page.getByRole('spinbutton',{name:'Quantite de ripe pour Second Horse'}).fill('3');
 await page.getByRole('button',{name:'Créer la réservation',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.bookings.length)).toBe(4);
 expect(await page.evaluate(()=>window.bookings.filter(b=>b.stall_option_id==='bedding').map(b=>({horse:b.horse_id,quantity:b.quantity,total:b.total_price})))).toEqual([{horse:'horse1',quantity:7,total:70},{horse:'horse2',quantity:3,total:30}]);
 console.log('PASS: two horses receive independent shavings quantities (7 and 3) and corresponding charges.');
 await prepare('?debt');
 await expect(page.getByRole('button',{name:'Créer la réservation',exact:true})).toBeEnabled();
 console.log('PASS: historical draft invoices no longer block reservations.');
 await prepare('?closed');
 await expect(page.getByRole('button',{name:'Créer la réservation',exact:true})).toBeDisabled();
 await expect(page.locator('#reservation-create-status')).toBeVisible();
 await expect(page.locator('#reservation-create-status')).toContainText('fermé avec un solde dû');
 console.log('PASS: closed account balance blocks submission and shows the reason inside the mobile modal.');
 await prepare('?failure');
 await page.getByRole('button',{name:'Créer la réservation',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Le prix a changé');
 await expect(page.getByRole('button',{name:'Créer la réservation',exact:true})).toBeEnabled();
 expect(await page.evaluate(()=>window.bookings.length)).toBe(0);
 console.log('PASS: a server refusal stays visible in the form and preserves the request for retry.');
 await page.goto('http://127.0.0.1:5180/scripts/tests/reservation-ui/index.html?camping');
 await page.getByRole('combobox').first().click();await page.getByRole('option').filter({hasText:'Laurence'}).click();
 await page.locator('select').filter({has:page.locator('option[value="camping"]')}).selectOption('camping');
 await expect(page.getByRole('button',{name:'Créer la réservation',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Créer la réservation',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.bookings.length)).toBe(1);
 expect(await page.evaluate(()=>window.bookings[0].stall_option_id)).toBe('camping');
 console.log('PASS: camping-only requests submit without selecting a stall or a horse.');
} finally {await browser.close();await server.close();}
