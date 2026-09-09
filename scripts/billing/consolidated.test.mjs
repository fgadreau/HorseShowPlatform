import assert from 'node:assert/strict';
import test from 'node:test';
import {parseHspFeeAmount} from '../../src/features/finance/hspFeeAmount.ts';
import {consolidatedFixture} from './consolidated-fixtures.mjs';
import {documentModel} from '../../server/billing/pdf.mjs';
import {allocateProcessingFee} from '../../server/billing/processing-allocation.mjs';
test('free amount at cent precision: 7,34, zero, empty and invalid input',()=>{
 for(const [s,n] of [['5',5],['7,34',7.34],['7.34',7.34],['0,00',0],['',null],['  ',null]])assert.equal(parseHspFeeAmount(s),n);
 for(const s of ['-1','7.345','NaN','Infinity','1e2','1,2,3'])assert.throws(()=>parseHspFeeAmount(s));
});
for(const fee of [5,0,7.34])test(`consolidated supplier totals, receipt balances and immutable input: ${fee}`,()=>{
 const d=consolidatedFixture({fee,multiple:true}),before=JSON.stringify(d),m=documentModel(d,'fr');
 assert.equal(JSON.stringify(d),before);assert.equal(d.snapshot.balance,0);assert.equal(d.snapshot.payments.length,3);
 const a=m.blocks.find(b=>b.kind==='supplier'&&b.supplier==='association'),h=m.blocks.find(b=>b.kind==='supplier'&&b.supplier==='hsp');
 assert(a&&h);assert(!JSON.stringify(a).includes('Frais de service HSP'));assert(!JSON.stringify(h).includes('Inscriptions et stalle'));
 assert(a.identifier!==h.identifier);assert(JSON.stringify(m.blocks).includes('TPS DEMO'));assert(JSON.stringify(m.blocks).includes('TVQ DEMO'));
 for(let i=0;i<3;i++){const r=consolidatedFixture({fee,multiple:true,kind:'receipt',paymentIndex:i});const model=documentModel(r,'fr');assert(model.blocks.some(b=>b.label==='Paiement reçu'));assert.equal(Math.round(r.snapshot.total*100)-Math.round(r.snapshot.received*100),Math.round(r.snapshot.balance*100));}
 const p=d.snapshot.payments.at(-1),split=allocateProcessingFee(p,d.snapshot.charges,1.23);assert.equal(Math.round(split.association*100)+Math.round(split.hsp*100),123);assert.equal(split.funds_separated,false);
});
test('inconsistent totals and missing ownership rejected',()=>{const d=consolidatedFixture();d.snapshot.total++;assert.throws(()=>documentModel(d,'fr'));const s=consolidatedFixture();delete s.snapshot.charges[0].supplier;assert.throws(()=>documentModel(s,'fr'),/SUPPLIER/);});

test('receipt allocation zero is never sponsorship; HSP account position remains visible',()=>{
 const d=consolidatedFixture({multiple:true,kind:'receipt',paymentIndex:0});
 for(const locale of ['fr','en']){const m=documentModel(d,locale),text=JSON.stringify(m.blocks);assert(!/commandités|Sponsored HSP/.test(text));assert(text.includes(locale==='fr'?'Répartition de ce paiement seulement':'Allocation of this payment only'));assert.equal(m.totals.hsp,575);assert.equal(m.paid.hsp,0);assert(text.includes(locale==='fr'?'5,75':'$5.75'));assert(!m.blocks.find(b=>b.label===m.t.history).boldRows);}
});
test('commercial descriptions and amounts are localized, using frozen sponsorship level',()=>{
 for(const level of ['show','association']){const d=consolidatedFixture({fee:0,source:level});const m=documentModel(d,'en');assert(JSON.stringify(m).includes(level==='show'?'Fees sponsored for this show':'Fees sponsored for this association'));assert(!JSON.stringify(m.blocks).includes('commandités'));}
 const m=documentModel(consolidatedFixture({fee:7.34}),'en');assert(JSON.stringify(m.blocks).includes('HSP service fee — $7.34 plus tax'));assert(!JSON.stringify(m.blocks).includes('7,34'));assert(JSON.stringify(m.blocks).includes('QST DEMO (9.975%)'));
});
test('snapshot timezone handles daylight saving and never reads current account settings',()=>{
 const d=consolidatedFixture();d.snapshot.issued_at='2026-01-09T12:00:00Z';assert(documentModel(d,'en').issued.includes('7:00'));d.snapshot.issued_at='2026-07-09T12:00:00Z';assert(documentModel(d,'en').issued.includes('8:00'));
});
test('paid and outstanding accounts have distinct inclusion notices and explicit invoice identifiers',()=>{
 const d=consolidatedFixture({multiple:true,kind:'receipt',paymentIndex:1});d.kind='invoice';const m=documentModel(d,'en');assert(m.reminder.includes('Pay only the account balance'));for(const b of m.blocks.filter(b=>b.supplier)){assert(b.notice.includes('Do not pay this portion separately'));assert(b.identifier.includes('invoice number'));}
 const paid=documentModel(consolidatedFixture(),'fr');assert(paid.reminder.includes('déjà acquittées'));assert(paid.blocks[0].kind==='summary');
});
test('statement never presents its supplier references as issued invoices',()=>{
 const d=consolidatedFixture();d.kind='statement';d.number=null;const m=documentModel(d,'en');assert(m.consolidation.includes('does not replace the final invoice'));assert(m.blocks.filter(b=>b.supplier).every(b=>!b.label.includes('invoice')&&!b.identifier.includes('invoice number')));
});
