import type {Json} from '../../services/billingFolio';
export function entryBlocksV6(charges: Json[],locale: string,currency: string): {label:string;columns:string[];rows:string[][];rowKinds?:string[];keepTail?:number;endsBib?:boolean}[];
