import labels from '../../src/lib/billingDocumentTranslations.json' with {type:'json'};
// DEMO only. No database or provider connection.
export function consolidatedFixture({fee=5,source='platform',multiple=false,kind='invoice',paymentIndex=0}={}){
 const line=(id,supplier,base)=>{const taxes=[{code:'TPS-DEMO',name:'TPS DEMO',jurisdiction:'DEMO QC',rate:5},{code:'TVQ-DEMO',name:'TVQ DEMO',jurisdiction:'DEMO QC',rate:9.975}].map(t=>({...t,base,amount:Math.round(base*t.rate)/100}));const tax_amount=taxes.reduce((n,t)=>n+Math.round(t.amount*100),0)/100;return {id,supplier,description_i18n:{fr:labels.fr.entriesStallDemo,en:labels.en.entriesStallDemo},description:supplier==='hsp'?(fee===0?'Frais de service HSP commandités — 0,00 $':`Frais de service HSP — ${fee.toFixed(2).replace('.',',')} $ plus taxes`):'Inscriptions et stalle DEMO',quantity:1,unit_price:base,subtotal:base,taxes,tax_amount,total:Math.round((base+tax_amount)*100)/100,...(supplier==='hsp'?{hsp_fee:{amount:fee,source,sponsored:fee===0,sponsorship_level:fee===0?source:null,note:'Configuration fictive DEMO',changed_by:'DEMO-ADMIN',changed_at:'2026-09-09T10:00:00Z'}}:{})};};
 const charges=[line('DEMO-ASSOC-LINE','association',100),line('DEMO-HSP-LINE','hsp',fee)];
 const total=charges.reduce((n,c)=>n+Math.round(c.total*100),0)/100;
 const payments=multiple?[
 {id:'DEMO-PAY-1',amount:40,method:'stripe_test',reference:'DEMO-CHECKOUT',allocations:[{charge_id:charges[0].id,amount:40}]},
 {id:'DEMO-PAY-2',amount:50,method:'etransfer',reference:'DEMO-INTERAC',allocations:[{charge_id:charges[0].id,amount:50}]},
 {id:'DEMO-PAY-3',amount:Math.round((total-90)*100)/100,method:'cash',reference:'DEMO-CASH',allocations:[{charge_id:charges[0].id,amount:Math.round((charges[0].total-90)*100)/100},...(fee?[{charge_id:charges[1].id,amount:charges[1].total}]:[])]}
 ]:[{id:'DEMO-PAY-1',amount:total,method:'cheque',reference:'DEMO-CHEQUE',allocations:charges.filter(c=>c.total).map(c=>({charge_id:c.id,amount:c.total}))}];
 payments.forEach((p,i)=>p.received_at=`2026-09-09T${12+i}:00:00Z`);
 const included=kind==='receipt'?payments.slice(0,paymentIndex+1):payments;
 const received=included.reduce((n,p)=>n+Math.round(p.amount*100),0)/100;
 const account=`DEMO-ACC-${fee===0?'SPONSORED':multiple?'MULTI':fee===5?'STANDARD':'CUSTOM'}`;
 payments.forEach((p,i)=>p.receipt_number=`${account}-RCPT-${i+1}`);
 const supplier=(key,name)=>({fiscal_id:`${account}-${key}`,identity:{billing_name:name+' DEMO',name:name+' DEMO',address:'123 rue Exemple DEMO, Ville fictive QC',tax_number_1:`DEMO-${key}-TPS-NON-VALIDE`,tax_number_2:`DEMO-${key}-TVQ-NON-VALIDE`}});
 const snapshot={account_number:account,folio_id:account,currency:'CAD',state:kind==='invoice'?'closed':'open',context:{timezone:'America/Toronto',name_fr:'Concours fictif DEMO 2026',name_en:'Fictitious DEMO show 2026'},seller:{name:'Association DEMO'},payer:{first_name:'Camille',last_name:'DEMO'},supplier_invoices:{association:supplier('ASSOC','Association'),hsp:supplier('HSP','Horse Show Platform')},charges,payments:included,subtotal:100+fee,tax_amount:Math.round((total-100-fee)*100)/100,total,received,balance:Math.round((total-received)*100)/100,issued_at:included.at(-1).received_at};
 return {id:`${account}-${kind}-${paymentIndex}`,kind,number:kind==='receipt'?`${account}-RCPT-${paymentIndex+1}`:`${account}-INV-1`,payment_id:kind==='receipt'?included.at(-1).id:null,created_at:snapshot.issued_at,snapshot};
}
