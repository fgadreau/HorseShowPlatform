// Optional local tooling, not an application dependency or a Vercel deploy.
// Install: npm install --prefix .tmp/hosted-tools --cache .tmp/npm-cache --ignore-scripts --no-audit --no-fund @vercel/nft@1.11.0
import {nodeFileTrace} from '../../.tmp/hosted-tools/node_modules/@vercel/nft/out/index.js';
import {statSync,readdirSync,writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const cwd=process.cwd();assert.equal(readFileSync('package.json','utf8').includes('horseshowplatform'),true);
// Workspace dependency links can point at the main checkout. No file is edited there.
const base=resolve(cwd.includes('/.worktrees/')?cwd.split('/.worktrees/')[0]:cwd),reports=[];
for(const entry of ['api/billing.js','api/billing-documents.js']){
 const trace=await nodeFileTrace([resolve(entry)],{base,processCwd:cwd});
 const files=new Set([...trace.fileList].map(p=>resolve(base,p)));
 if(entry.includes('documents')){
  const walk=p=>{for(const e of readdirSync(p,{withFileTypes:true})){const f=resolve(p,e.name);if(e.isDirectory())walk(f);else files.add(f);}};
  walk(resolve('node_modules/@sparticuz/chromium/bin'));files.add(resolve('public/branding/hsp-logo-aubergine.svg'));
 }
 let bytes=0;for(const f of files){const s=statSync(f);if(s.isFile())bytes+=s.size;}
 const required=entry.includes('documents')?['public/branding/hsp-logo-aubergine.svg',...Array.from({length:5},(_,i)=>`server/billing/pdf-v${i+1}.mjs`)]:['server/billing/hosted-stripe.mjs'];
 const missing=required.filter(p=>!files.has(resolve(p))),unexpected=[...files].filter(p=>p.startsWith(cwd+'/.tmp/')||/\/.env(?:\.|$)/.test(p));
 reports.push({entry,tracer:'@vercel/nft 1.11.0',files:files.size,bytes,missing,unexpected,warnings:[...trace.warnings].map(w=>w.message)});
 assert.equal(missing.length,0);assert.equal(unexpected.length,0);assert(bytes<250*1024*1024);
}
mkdirSync('.tmp/billing-hosted',{recursive:true});
writeFileSync('.tmp/billing-hosted/package-results.json',JSON.stringify({complete:true,kind:'local NFT estimate plus declared includeFiles; not a Vercel deployment build',reports},null,2));
console.log(JSON.stringify(reports.map(({warnings,...r})=>({...r,warningCount:warnings.length}))));
