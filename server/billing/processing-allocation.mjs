import {cents} from './pdf.mjs';
/** Accounting attribution only; never initiates a Stripe Connect transfer. */
export function allocateProcessingFee(payment,charges,fee){
 const total=cents(payment.amount),cost=cents(fee),parts={association:0,hsp:0};
 if(total<=0||cost<0)throw Error('BILLING_INVALID_AMOUNT');
 for(const a of payment.allocations){const c=charges.find(c=>c.id===a.charge_id);if(!c||!(c.supplier in parts)||cents(a.amount)<0)throw Error('BILLING_INVALID_ALLOCATION');parts[c.supplier]+=cents(a.amount);}
 if(parts.association+parts.hsp!==total)throw Error('BILLING_INVALID_ALLOCATION');
 const association=Math.round(cost*parts.association/total);
 return {association:association/100,hsp:(cost-association)/100,basis:'supplier_payment_allocations',funds_separated:false};
}
