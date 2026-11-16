import {spawnSync} from 'node:child_process';
import {copyFileSync,mkdirSync,writeFileSync} from 'node:fs';

// These are isolated regression fixtures, not live PREPROD user journeys.
// Keep each result visible even when another suite fails.
const suites=[
  ['Équipe et rôles','scripts/association-team.browser.mjs'],
  ['Paramètres du concours','scripts/show-settings.browser.mjs'],
  ['Import des cartes','scripts/membership-import.browser.mjs'],
  ['Inscriptions et annulations','scripts/entry-lifecycle.browser.mjs'],
  ['Poste de contrôle','scripts/control-room.browser.mjs'],
  ['Export comptable','scripts/billing/accounting-export.test.mjs','--test'],
  ['Factures par courriel (transport simulé)','scripts/billing/invoice-email.test.mjs','--test'],
  ['Factures PDF et frais de juge','scripts/billing/invoice-print.browser.mjs'],
  ['Rapports NRHA avec et sans conversion','scripts/nrha-reports.browser.mjs'],
  ['Fiches des chevaux','scripts/horse-edit.browser.mjs'],
  ['Accès agent aux chevaux','scripts/horse-access.browser.mjs'],
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
  if(file==='scripts/nrha-reports.browser.mjs'){
    const build=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p','tsconfig.reports-test.json'],{stdio:'inherit',timeout:120000});
    if(build.status!==0){results.push({name,file,status:'failed',durationMs:Date.now()-started,error:'Report test compilation failed'});continue;}
    copyFileSync('scripts/draw-test-package.json','.tmp/reports-tests/package.json');
  }
  const run=spawnSync(process.execPath,[...(flag?[flag]:[]),file],{stdio:'inherit',timeout:300000});
  results.push({name,file,status:run.status===0&&!run.error?'passed':'failed',durationMs:Date.now()-started,error:run.error?.message});
}
mkdirSync('.tmp/robot-recent',{recursive:true});
writeFileSync('.tmp/robot-recent/results.json',JSON.stringify({kind:'isolated-regressions',results},null,2));
console.table(results.map(({name,status})=>({name,status})));
if(results.some(r=>r.status==='failed'))process.exitCode=1;
