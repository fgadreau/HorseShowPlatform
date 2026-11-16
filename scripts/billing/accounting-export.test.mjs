import test from 'node:test';
import assert from 'node:assert/strict';
import {quickBooksJournalCsv,sage50JournalText,serializeAccountingExport,xeroManualJournalCsv} from '../../src/features/finance/accountingExport.ts';

const payload={software:'quickbooks_online',export_kind:'show_close',context:{name_fr:'Concours'},profile:{options:{xero_no_tax_rate:'Tax Exempt'}},missing_accounts:[],balanced:true,journals:[{number:'HSP-CLOSE-20261114',date:'2026-11-14',narration:'Concours — fermeture',tracking_name:'Concours',tracking_option:'AQR 2026',debits:114.98,credits:114.98,balanced:true,lines:[
 {account_key:'accounts_receivable',account:'1200 Comptes clients',description:'=formule dangereuse',debit:114.98,credit:0},
 {account_key:'revenue:entry',account:'4100',description:'Inscriptions',debit:0,credit:100},
 {account_key:'tax:tps',account:'2310',description:'TPS',debit:0,credit:5},
 {account_key:'tax:tvq',account:'2340',description:'TVQ',debit:0,credit:9.98},
]}]};

test('QuickBooks Online journal CSV has balanced debit/credit columns and protects formulas',()=>{
 const csv=quickBooksJournalCsv(payload);assert(csv.startsWith('\uFEFF"Journal No."'));assert(csv.includes('"11/14/2026"'));assert(csv.includes('"\'=formule dangereuse"'));assert(csv.includes('"114.98"'));assert(csv.includes('"AQR 2026"'));
});
test('Xero manual journal CSV uses account codes, no-tax lines and tracking',()=>{
 const csv=xeroManualJournalCsv({...payload,software:'xero'});assert(csv.includes('"AccountCode"'));assert(csv.includes('"14/11/2026"'));assert(csv.includes('"Tax Exempt"'));assert(csv.includes('"Concours";')===false);assert(csv.includes('"AQR 2026"'));
});
test('Sage 50 Canada text is a zero-sum signed journal with a capped source',()=>{
 const text=sage50JournalText({...payload,software:'sage_50_ca'});assert(text.startsWith('11-14-26,"HSP-CLOSE-20261114"'));assert(text.includes('"1200 Comptes clients",114.98'));assert(text.includes('"4100",-100.00'));assert.equal(text.split('\r\n').filter(Boolean).length,5);
});
test('serialization rejects missing mappings and unbalanced journals',()=>{
 assert.throws(()=>serializeAccountingExport({...payload,missing_accounts:[{key:'tax:tps'}]}),/ACCOUNTING_EXPORT_NOT_READY/);
 assert.throws(()=>serializeAccountingExport({...payload,balanced:false}),/ACCOUNTING_EXPORT_NOT_READY/);
 assert.equal(serializeAccountingExport(payload).extension,'csv');
});
