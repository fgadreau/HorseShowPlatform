import {mkdirSync,writeFileSync} from 'node:fs';
import {serverlessBrowser} from '../../server/vet/serverless-browser.mjs';
import {renderDocument} from '../../server/billing/pdf.mjs';
import {proofCases} from './document-proof-cases.mjs';
import {inspectProof} from './document-proof-inspection.mjs';
const dir='docs/billing-demo-20260909';mkdirSync(dir,{recursive:true});const cases=proofCases();
writeFileSync(`${dir}/results.json`,JSON.stringify({complete:false,documents:[]}));
const browser=await serverlessBrowser.launch(),documents=[];
try{for(const {name,document} of cases)for(const locale of ['fr','en'])documents.push(await inspectProof({bytes:await renderDocument(document,locale,{browser}),document,locale,path:`${dir}/${name}-${locale}.pdf`,origin:'fixture'}));
 writeFileSync(`${dir}/snapshots.json`,JSON.stringify(cases,null,2));writeFileSync(`${dir}/results.json`,JSON.stringify({complete:true,documents},null,2));console.log(JSON.stringify({complete:true,documents:documents.length,pages:documents.reduce((n,d)=>n+d.pages,0)}));
}finally{await browser.close();}
