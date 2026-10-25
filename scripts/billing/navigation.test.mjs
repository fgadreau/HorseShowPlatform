import test from 'node:test';import assert from 'node:assert/strict';
import {financeRoute,showSections} from '../../src/features/finance/navigation.ts';
for(const [path,view,org,show,folio] of [['/associations/a/finance','billing','a','',''],['/associations/a/finance/accounts/f','billing','a','','f'],['/me/accounts/f','my-invoices','','','f'],...Object.entries(showSections).map(([s,v])=>['/associations/a/shows/s/'+s,v,'a','s',''])])test('route '+path,()=>assert.deepEqual(financeRoute(path),{view,org,show,folio}));
for(const path of ['/vet','/vet/verify/x','/shows/public-slug','/'])test('unrelated route preserved '+path,()=>assert.equal(financeRoute(path),null));
