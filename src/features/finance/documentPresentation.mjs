import {displayCents} from './entryGroups.mjs';

// Presentation of stored taxes only. Never change a charge, payment or snapshot.
export function documentTaxes(charge,locale='fr'){
 const fr=locale==='fr';
 return (charge.taxes??[]).flatMap(t=>{
  const named=String(t.name??'')+' '+String(t.code??'');
  const combined=/(TPS|GST)/i.test(named)&&/(TVQ|QST)/i.test(named)&&Math.abs(Number(t.rate)-14.975)<0.000001;
  if(!combined)return [{...t}];
  const base=displayCents(t.base??charge.subtotal),recorded=displayCents(t.amount);
  // Integer arithmetic, positive and negative credit lines rounded symmetrically.
  const round=(n,d)=>Math.sign(n)*Math.round(Math.abs(n)/d);
  const gst=round(base*5,100),qst=round(base*9975,100000),adjustment=recorded-gst-qst;
  return [
   {code:'GST',name:fr?'TPS':'GST',rate:5,amount:gst/100,derived:true},
   {code:'QST',name:fr?'TVQ':'QST',rate:9.975,amount:qst/100,derived:true},
   ...(adjustment?[{code:'HISTORICAL_ROUNDING',name:fr?'Arrondi historique':'Historical rounding',rate:null,amount:adjustment/100,derived:true}]:[]),
  ];
 });
}

export function taxText(t,locale='fr'){
 const rate=t.rate==null?'':` (${new Intl.NumberFormat(locale==='fr'?'fr-CA':'en-CA',{maximumFractionDigits:6}).format(Number(t.rate))} %)`;
 return t.name+rate;
}

export function registrationLabel(identity,index,locale='fr'){
 const configured=index===1?(identity.tax_name_1??identity.tax_name):(identity.tax_name_2??identity.secondary_tax_name);
 const value=String(identity[`tax_number_${index}`]??'');
 const inferred=/TVQ|QST|TQ\d{4}$/i.test(value)?(locale==='fr'?'TVQ':'QST'):/TPS|GST/i.test(value)?(locale==='fr'?'TPS':'GST'):/RT\d{4}$/i.test(value)?(locale==='fr'?'TPS / TVH':'GST / HST'):null;
 const name=String(configured??'').trim()||inferred;
 return name?`${locale==='fr'?'No':'No.'} ${name}`:locale==='fr'?`No de taxe ${index}`:`Tax registration no. ${index}`;
}

export function registrationValue(identity,index,locale='fr'){
 const value=String(identity[`tax_number_${index}`]??'').trim();
 if(!value)return locale==='fr'?'Non renseigné':'Not provided';
 // Explicit fixtures, not a general validation of real registration numbers.
 if(/DEMO|NON[- ]VALIDE|INVALID|^0{5,}/i.test(value))return locale==='fr'?'Donnée de test — non valide':'Test value — not valid';
 return value;
}

export function isTestDocument(s){
 return Object.values(s.suppliers??{association:s.seller??{}}).some(v=>v.demo===true||/D[ÉE]MONSTRATION|\bDEMO\b|\bTEST\b/i.test(v.name??'')||[1,2].some(i=>/DEMO|NON[- ]VALIDE|INVALID|^0{5,}/i.test(String(v[`tax_number_${i}`]??''))));
}
