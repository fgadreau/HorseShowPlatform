import { requireSupabase } from '../../lib/supabase';
import type { MembershipImportRow } from '../../lib/membershipCsv';
export type MembershipImportSource = 'external_purchase' | 'complimentary';
export type ImportCandidate = {id:string;name:string;email_hint:string|null;has_account:boolean;in_directory:boolean};
export type MembershipImportPreview = {token:string;type_name:string;season:number;rows:{row:number;action:'link'|'create'|'skip'|'resolve'|'conflict';error:string|null;contact_id:string|null;contact_name:string;has_account:boolean;candidates:ImportCandidate[];valid_from:string;valid_until:string}[]};
export type MembershipImportResult = {created:number;skipped:number;new_contacts:number;batch_id:string};
export async function previewMembershipImport(org:string,type:string,rows:MembershipImportRow[],source:MembershipImportSource):Promise<MembershipImportPreview> {
  const {data,error}=await requireSupabase().rpc('preview_membership_import',{p_org:org,p_type:type,p_rows:rows,p_source:source});if(error)throw error;return data;
}
export async function applyMembershipImport(operation:string,org:string,type:string,rows:MembershipImportRow[],source:MembershipImportSource,token:string):Promise<MembershipImportResult> {
  const {data,error}=await requireSupabase().rpc('apply_membership_import',{p_operation:operation,p_org:org,p_type:type,p_rows:rows,p_source:source,p_token:token});if(error)throw error;return data;
}
