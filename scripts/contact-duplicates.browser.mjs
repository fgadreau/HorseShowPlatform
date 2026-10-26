import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
import {chromium,expect} from '@playwright/test';
import bundledChromium from '@sparticuz/chromium';
const server=await createServer({configFile:false,envDir:false,plugins:[react()],server:{host:'127.0.0.1',port:5195,strictPort:true,fs:{deny:['.env','.env.*','**/.git/**','**/.tmp/**']}}});let browser;
try{
 await server.listen();const launch=process.platform==='linux'?{executablePath:await bundledChromium.executablePath(),args:bundledChromium.args}:{channel:'chrome'};browser=await chromium.launch({...launch,headless:true});const page=await browser.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 for(const locale of ['en','fr'])for(const [width,height]of [[320,568],[390,844],[844,390]])for(const scenario of ['form','picker','dismissed']){
  await page.setViewportSize({width,height});await page.goto(`http://127.0.0.1:5195/scripts/tests/contact-duplicates/index.html?locale=${locale}&scenario=${scenario}`);
  const create=locale==='fr'?'Créer le contact':'Create contact',distinct=locale==='fr'?'Ce sont des fiches différentes — créer quand même':'These are different records — create anyway';
  async function fill(){
   if(scenario==='picker'){
    const picker=page.getByRole('combobox');await picker.click();
    const option=page.getByRole('option').filter({hasText:'Yannick Goulet'}).first();
    assert.equal((await option.innerText()).trim(),'Yannick Goulet');
    await option.click();await expect(picker).toHaveValue('Yannick Goulet');
    await page.locator('.contact-picker-row .ghost-button').click();
    assert.equal(await page.getByRole('dialog').locator('select').count(),0);
    await expect(page.getByRole('dialog').getByRole('heading',{name:locale==='fr'?'Nouveau contact':'New contact',exact:true})).toBeVisible();
   }
   else await page.getByRole('button',{name:locale==='fr'?'Création manuelle':'Manual creation',exact:true}).click();
   await page.getByLabel(locale==='fr'?'Prénom':'First name',{exact:true}).fill('Yannick');await page.getByLabel(locale==='fr'?'Nom':'Last name',{exact:true}).fill('Goulet');
   await page.getByLabel(locale==='fr'?'Date de naissance':'Date of birth',{exact:true}).fill('1990-01-01');
   await page.getByRole('button',{name:scenario==='picker'?(locale==='fr'?'Créer et sélectionner':'Create and select'):create,exact:true}).click();
  }
  await fill();const review=page.getByRole('region',{name:locale==='fr'?'Doublons possibles':'Possible duplicates'});await expect(review).toBeVisible();await expect(review.locator('.identity-candidate-card')).toHaveCount(3);assert.equal(await page.evaluate(()=>window.creations.length),0);
  const reuse=review.getByRole('button',{name:locale==='fr'?'Utiliser cette fiche':'Use this record',exact:true});await reuse.first().click();assert.equal(await page.evaluate(()=>window.creations.length),0);
  await fill();await expect(review.locator('.identity-candidate-card')).toHaveCount(3);await review.getByRole('button',{name:distinct,exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.creations.length)).toBe(1);assert.equal(await page.evaluate(()=>window.dismissals.length),0);
  await fill();await expect(review.locator('.identity-candidate-card')).toHaveCount(4);assert.equal(await page.evaluate(()=>window.creations.length),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  console.log(`PASS duplicates ${scenario} ${locale} ${width}x${height}`);
 }
 for(const locale of ['en','fr']){
  await page.goto(`http://127.0.0.1:5195/scripts/tests/contact-duplicates/index.html?locale=${locale}&scenario=edit`);
  assert.equal(await page.locator('select').count(),0);
  await page.getByRole('button',{name:locale==='fr'?'Sauvegarder':'Save changes',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.creations.length)).toBe(1);
  assert.equal(await page.evaluate(()=>window.creations[0].type),'owner');
 }
 assert.deepEqual(errors,[]);console.log('PASS: name-only contact choices and selection, no role/type controls, edit preserves stored type; duplicate review and reuse; FR/EN mobile, external traffic blocked.');
}finally{await browser?.close();await server.close();}
