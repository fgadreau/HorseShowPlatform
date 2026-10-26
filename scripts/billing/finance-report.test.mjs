import test from 'node:test';
import assert from 'node:assert/strict';
import {csvCell,financeReportCsv} from '../../src/features/finance/financeReport.ts';
test('CSV protects spreadsheet formulas and preserves monetary numeric values',()=>{
 assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');
 assert.equal(csvCell('  +1'),'"\'  +1"');assert.equal(csvCell('-suspicious'),'"\'-suspicious"');
 assert.equal(csvCell(-7.34),'"-7.34"');assert.equal(csvCell('Normal; text'),'"Normal; text"');
});
test('report CSV separates net revenue, tax, HSP, collections and active expenses in each language',()=>{
 const report={context:{name_fr:'Concours démo',name_en:'Demo show',currency:'CAD'},totals:{revenue:100,association_processing_fees:1.10,association_tax:5,association_collected:55,association_balance:50,hsp_subtotal:5,unknown_processing_fees:0},expenses_total:20,management_result:78.90,revenue_categories:[{category:'entry',subtotal:100,tax_amount:5,total:105}],payment_methods:[{method:'cash',amount:60}],expenses:[{description:'Juges',category:'judges',incurred_on:'2026-10-26',amount:20,voided_at:null},{description:'Ne pas déduire',category:'other',incurred_on:'2026-10-26',amount:50,voided_at:'2026-10-26'}]};
 for(const locale of ['fr','en']){const csv=financeReportCsv(report,locale);assert(csv.startsWith('\uFEFF'));assert(csv.includes('"78.9"'));assert(csv.includes('"CAD"'));assert(csv.includes(locale==='fr'?'HSP hors taxes, exclus des revenus':'HSP fees before tax, excluded from revenue'));assert(csv.includes(locale==='fr'?'Inscriptions':'Entries'));assert(!csv.includes('Ne pas déduire'));assert(!csv.includes('undefined'));}
});
