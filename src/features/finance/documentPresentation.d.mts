import type {Json} from '../../services/billingFolio';
export function documentTaxes(charge:Json,locale?:string):Json[];
export function taxText(tax:Json,locale?:string):string;
export function registrationLabel(identity:Json,index:number,locale?:string):string;
export function registrationValue(identity:Json,index:number,locale?:string):string;
export function isTestDocument(snapshot:Json):boolean;
