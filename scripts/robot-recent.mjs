import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';

// These are isolated regression fixtures, not live PREPROD user journeys.
// Keep each result visible even when another suite fails.
const suites=[
  ['Équipe et rôles','scripts/association-team.browser.mjs'],
  ['Paramètres du concours','scripts/show-settings.browser.mjs'],
  ['Import des cartes','scripts/membership-import.browser.mjs'],
  ['Inscriptions et annulations','scripts/entry-lifecycle.browser.mjs'],
  ['Poste de contrôle','scripts/control-room.browser.mjs'],
  ['Export comptable','scripts/billing/accounting-export.test.mjs','--test'],
  ['Ancienne facturation retirée','scripts/billing/retirement.browser.mjs'],
  ['Nominations CSV','scripts/presentation-nomination-csv.test.mjs','--test'],
  ['Draw de présentation','scripts/presentation-draw.browser.mjs'],
  ['Éligibilités maison','scripts/house-eligibility.test.mjs','--test'],
  ['Listes, cartes incompatibles et chevaux avec stalle','scripts/house-eligibility.browser.mjs'],
  ['Horaire et panneau discret','scripts/schedule-eligibility.browser.mjs'],
  ['Billetterie et événements autonomes','scripts/ticketing.browser.mjs'],
];
const results=[];
for(const [name,file,flag] of suites){
  console.log(`\n=== ${name} ===`);
  const started=Date.now();
  const run=spawnSync(process.execPath,[...(flag?[flag]:[]),file],{stdio:'inherit',timeout:300000});
  results.push({name,file,status:run.status===0&&!run.error?'passed':'failed',durationMs:Date.now()-started,error:run.error?.message});
}
mkdirSync('.tmp/robot-recent',{recursive:true});
writeFileSync('.tmp/robot-recent/results.json',JSON.stringify({kind:'isolated-regressions',results},null,2));
console.table(results.map(({name,status})=>({name,status})));
if(results.some(r=>r.status==='failed'))process.exitCode=1;
