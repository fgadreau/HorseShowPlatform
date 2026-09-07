import type {Json} from '../../services/billingFolio';
export function displayCents(value: unknown): number;
export function entryGroups(charges: Json[], locale?: string): Json[];
export function entryBlocks(charges: Json[], locale: string, currency: string): {label:string;columns:string[];rows:string[][];total?:number}[];
export function entryChargeLabel(charge: Json, locale: string): string;
