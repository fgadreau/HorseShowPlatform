/** A blank override inherits; zero is an explicit sponsorship. No silent rounding. */
export function parseHspFeeAmount(input:string):number|null {
 const value=input.trim().replace(',','.');
 if(!value)return null;
 if(!/^\d{1,10}(\.\d{1,2})?$/.test(value))throw Error('Montant invalide / Invalid amount');
 return Number(value);
}
