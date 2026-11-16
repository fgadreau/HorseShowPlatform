import { requireSupabase } from '../lib/supabase';
export type HouseList={id:string;organization_id:string;name:string};
export type HouseEdition={id:string;list_id:string;season_year:number;source_name:string|null};
export type HousePerson={id:string;rider_name:string;rider_contact_id:string|null};
export type HouseRule={class_template_id:string;require_membership:boolean;minimum_age:number|null;maximum_age:number|null;age_basis:'january_1'|'show_date';excluded_list_ids:string[];nrha_reference_template_id:string|null};
export type HouseAssessment={class_id:string;applies:boolean;can_proceed:boolean;reasons:string[];overridden?:boolean;nrha_pending?:boolean};
export async function houseRpc<T>(name:string,args:Record<string,unknown>):Promise<T>{const {data,error}=await requireSupabase().rpc(name,args);if(error)throw error;return data as T;}
export async function assessHouse(org:string,show:string,horse:string,rider:string){return houseRpc<HouseAssessment[]>('assess_house_classes',{p_org:org,p_show:show,p_horse:horse,p_rider:rider});}
export async function checkHouseNrha(classId:string,horse:string,rider:string){const {data,error}=await requireSupabase().functions.invoke('house-class-nrha',{body:{classId,horseId:horse,riderContactId:rider}});if(error)throw error;return data;}
export function grantHouseOverride(classId:string,horse:string,rider:string,reason:string){return houseRpc<string>('grant_house_eligibility_override',{p_class:classId,p_horse:horse,p_rider:rider,p_reason:reason});}
