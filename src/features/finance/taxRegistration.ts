import type {Json} from '../../services/billingFolio';

// Preserve configured tax names and exact registration values from the snapshot.
// Infer a name only when the identifier explicitly identifies the tax system.
export function taxRegistrationLabel(identity:Json,index:1|2,locale:string){
 const configured=index===1?(identity.tax_name_1??identity.tax_name):(identity.tax_name_2??identity.secondary_tax_name);
 const number=String(identity[`tax_number_${index}`]??'');
 const inferred=/TPS|GST|RT\d{4}$/i.test(number)?(locale==='fr'?'TPS / TVH':'GST / HST'):/TVQ|QST|TQ\d{4}$/i.test(number)?(locale==='fr'?'TVQ':'QST'):null;
 const name=String(configured??'').trim()||inferred;
 return name?`${locale==='fr'?'No':'No.'} ${name}`:locale==='fr'?`No de taxe ${index}`:`Tax registration no. ${index}`;
}
