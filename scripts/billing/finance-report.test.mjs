import test from 'node:test';
import assert from 'node:assert/strict';
import {csvCell,financeReportCsv} from '../../src/features/finance/financeReport.ts';
test('CSV protects spreadsheet formulas and preserves monetary numeric values',()=>{
 assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');
 assert.equal(csvCell('  +1'),'"\'  +1"');assert.equal(csvCell('-suspicious'),'"\'-suspicious"');
 assert.equal(csvCell(-7.34),'"-7.34"');assert.equal(csvCell('Normal; text'),'"Normal; text"');
});
test('CSV exports the full localized reservation breakdown without duplicating category totals',()=>{
 const report={context:{name_fr:'Démo',name_en:'Demo',currency:'CAD'},totals:{revenue:60,association_processing_fees:0,association_tax:3,association_collected:63,association_balance:0,hsp_subtotal:0,unknown_processing_fees:0},revenue_categories:[{category:'reservation',subtotal:60,tax_amount:3,total:63}],reservation_revenue:[{product_id:'tack',label_fr:'Tack écurie principale',label_en:'Main barn tack',subtotal:20,tax_amount:1,total:21},{product_id:'stall',label_fr:'Stalle écurie régulière',label_en:'Regular barn stall',subtotal:30,tax_amount:1.5,total:31.5},{product_id:'shavings',label_fr:'Ripe',label_en:'Shavings',subtotal:4,tax_amount:.2,total:4.2},{product_id:'hay',label_fr:'Foin',label_en:'Hay',subtotal:6,tax_amount:.3,total:6.3}],payment_methods:[]};
 for(const locale of ['fr','en']){const csv=financeReportCsv(report,locale);assert(csv.includes(locale==='fr'?'Détail des réservations':'Reservation breakdown'));for(const row of report.reservation_revenue)assert(csv.includes(`"${locale==='fr'?row.label_fr:row.label_en}";"${row.subtotal}"`));assert.equal(csv.split('\r\n').filter(row=>row.startsWith(locale==='fr'?'"Réservations";':'"Reservations";')).length,1);}
});
test('report CSV separates net revenue, tax, HSP, collections and balances in each language',()=>{
 const report={context:{name_fr:'Concours démo',name_en:'Demo show',currency:'CAD'},totals:{revenue:100,association_processing_fees:1.10,association_tax:5,association_collected:55,association_balance:50,hsp_subtotal:5,unknown_processing_fees:0},expenses_total:20,management_result:78.90,revenue_categories:[{category:'entry',subtotal:100,tax_amount:5,total:105}],payment_methods:[{method:'cash',amount:60}],expenses:[{description:'Juges',category:'judges',incurred_on:'2026-10-26',amount:20,voided_at:null},{description:'Ne pas déduire',category:'other',incurred_on:'2026-10-26',amount:50,voided_at:'2026-10-26'}]};
 for(const locale of ['fr','en']){const csv=financeReportCsv(report,locale);assert(csv.startsWith('\uFEFF'));assert(csv.includes('"55"'));assert(csv.includes('"50"'));assert(!csv.includes('"78.9"'));assert(!csv.includes('Juges'));assert(!csv.includes(locale==='fr'?'Dépenses saisies':'Recorded expenses'));assert(csv.includes('"CAD"'));assert(csv.includes(locale==='fr'?'HSP hors taxes, exclus des revenus':'HSP fees before tax, excluded from revenue'));assert(csv.includes(locale==='fr'?'Inscriptions':'Entries'));assert(!csv.includes('Ne pas déduire'));assert(!csv.includes('undefined'));}
});
