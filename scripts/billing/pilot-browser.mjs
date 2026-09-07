import {serverlessBrowser} from '../../server/vet/serverless-browser.mjs';import {readFileSync,writeFileSync} from 'node:fs';
const state=JSON.parse(readFileSync('.tmp/billing-pilot/integrated.json')),access=JSON.parse(readFileSync('.tmp/billing-pilot/access.local.json'));const stage=process.argv[2],amount=process.argv[3]??'200';
const browser=await serverlessBrowser.launch();const page=await browser.newPage({viewport:{width:1365,height:1000}});page.setDefaultTimeout(30000);
try{
 await page.goto('http://localhost:5173/me/accounts');const email=access.users.find(x=>x.id.endsWith('004')).email;
 await page.evaluate(async({email,password})=>{const {requireSupabase}=await import('/src/lib/supabase.ts');const r=await requireSupabase().auth.signInWithPassword({email,password});if(r.error)throw Error('LOGIN_FAILED');},{email,password:access.password});
 await page.goto('http://localhost:5173/me/accounts/'+state.folio);await page.getByRole('heading').filter({hasText:'DEMO-ACC'}).waitFor();
 if(stage==='inspect'||stage==='pay'){
  await page.getByLabel('Montant partiel ou solde').fill(amount);await page.getByRole('button',{name:'Payer mon compte — TEST',exact:true}).click();
  await page.waitForTimeout(5000);
  for(const frame of page.frames()){const inputs=await frame.locator('input').evaluateAll(xs=>xs.map(x=>({name:x.name,placeholder:x.placeholder,aria:x.getAttribute('aria-label')})));if(inputs.length)console.log(JSON.stringify(inputs));}
  await page.screenshot({path:'.tmp/billing-pilot/payment-element.png',fullPage:true});
  if(stage==='pay'){
   const frame=page.frames().find(f=>f.url().includes('elements-inner-payment'));if(!frame)throw Error('Payment Element frame absent');
   await frame.locator('input[name="number"]').fill('4242424242424242');await frame.locator('input[name="expiry"]').fill('1230');await frame.locator('input[name="cvc"]').fill('123');
   const postal=frame.locator('input[name="postalCode"]');if(await postal.count())await postal.fill('H2X 1Y4');
   await page.getByRole('button',{name:'Confirmer le paiement test',exact:true}).click();await page.waitForTimeout(7000);await page.screenshot({path:'.tmp/billing-pilot/payment-confirmed-'+amount+'.png',fullPage:true});
   console.log('Payment submitted through real browser Payment Element; server outcome must be checked separately');
  }
 }else if(stage==='finalize'){
  await page.getByRole('button',{name:'Vérifier le récapitulatif de fermeture',exact:true}).click();await page.getByRole('dialog').waitFor();await page.screenshot({path:'.tmp/billing-pilot/recap.png',fullPage:true});await page.getByRole('button',{name:'Finaliser mon compte',exact:true}).click();await page.waitForTimeout(3000);await page.screenshot({path:'.tmp/billing-pilot/finalized.png',fullPage:true});console.log('Finalization submitted through real payer UI');
 }else {await page.screenshot({path:'.tmp/billing-pilot/account.png',fullPage:true});}
 const alerts=await page.getByRole('alert').allTextContents();console.log(JSON.stringify({alerts}));
}finally{await browser.close();}
