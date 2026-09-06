import { requireSupabase } from '../lib/supabase';
import { vetAuthenticatedFetch } from './vetSession';
export const vetLocalServices = import.meta.env.DEV && (import.meta.env.VITE_VET_LOCAL_PROXY === 'true' || ['localhost','127.0.0.1'].includes(window.location.hostname));
export const vetPendingServices = 'En attente de vérification : le service vétérinaire hébergé n’est pas encore configuré. Le brouillon est conservé ; signature, émission, PDF et courriels restent indisponibles.';
export type VetIssuer = { id: string; name: string; kind: 'clinic' | 'independent'; status: 'active' | 'suspended'; contact_details: string };
export type VetPractitioner = { id: string; issuer_id: string; name: string; permit_number: string };
export type VetAdministration = { product: string; manufacturer: string; lot: string; product_expires_on: string; administered_on: string; valid_until: string; declared_duration: string; diseases: string[] };
export type VetPayload = { owner: { name: string; contact_details: string; email?: string }; agent: { name: string; email: string }; horse?: { name: string; owner_name: string; identifiers?: {type:string;value:string}[] }; administrations: VetAdministration[] };
export type VetCertificate = { id: string; public_number: string; version_number: number; signature_id: string | null; issuer_id: string; practitioner_id: string | null; horse_id: string | null; status: 'draft' | 'issued' | 'superseded' | 'revoked'; number: string | null; revision: number; payload: VetPayload; snapshot: Record<string, unknown> | null; created_by: string; issued_by: string | null; issued_at: string | null; replaces_id: string | null };
export type VetSelection = { selection_id: string; horse_name: string; owner_name: string; method: string };
export const emptyAdministration = (): VetAdministration => ({ product: '', manufacturer: '', lot: '', product_expires_on: '', administered_on: '', valid_until: '', declared_duration: '', diseases: [] });
export const emptyPayload = (): VetPayload => ({ owner: { name: '', contact_details: '' }, agent: { name: '', email: '' }, administrations: [emptyAdministration()] });
export async function vetRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
 const { data, error } = await requireSupabase().rpc(name, args);
 if (error) throw new Error(error.message);
 return data as T;
}
export async function vetLoad(issuerId?: string) {
 const client = requireSupabase();
 const [issuers, admin] = await Promise.all([
  client.from('vet_issuers').select('id,name,kind,status,contact_details').order('name'),
  client.rpc('is_platform_admin'),
 ]);
 if (issuers.error) throw new Error(issuers.error.message);
 if (admin.error) throw new Error(admin.error.message);
 const list = (issuers.data ?? []) as VetIssuer[];
 const id = issuerId && list.some(i => i.id === issuerId) ? issuerId : list.find(i => i.status === 'active')?.id;
 const [certificates, practitioners, checks] = id ? await Promise.all([
  client.from('vet_certificates').select('*').eq('issuer_id', id).order('created_at', { ascending: false }).limit(100),
  client.from('vet_practitioners').select('id,issuer_id,name,permit_number').eq('issuer_id', id).order('name'),
  client.from('vet_verifications').select('practitioner_id,result,checked_at,returned_name,returned_permit,returned_status').order('checked_at', { ascending: false }).limit(100),
 ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
 for (const r of [certificates, practitioners, checks]) if (r.error) throw new Error(r.error.message);
 return { issuers: list, admin: !!admin.data, issuerId: id ?? '', certificates: (certificates.data ?? []) as VetCertificate[], practitioners: (practitioners.data ?? []) as VetPractitioner[], checks: checks.data ?? [] };
}
export async function vetVerify(practitionerId: string) {
 // This first slice deliberately has no remotely hosted browser endpoint.
 const localProxy = import.meta.env.DEV && import.meta.env.VITE_DEPLOY_ENV === 'local' && import.meta.env.VITE_VET_LOCAL_PROXY === 'true';
 if (!localProxy && !['localhost', '127.0.0.1'].includes(window.location.hostname)) throw new Error(vetPendingServices);
 const response = await vetAuthenticatedFetch(requireSupabase().auth, localProxy ? '/__local-vet/verify' : 'http://127.0.0.1:54330/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ practitioner_id: practitionerId }) });
 const result = await response.json();
 if (!response.ok) throw new Error(result.error ?? 'Vérification indisponible.');
 return result as { result: string; cached: boolean };
}

export async function vetCertificateFile(certificateId: string, delivery?: { request_id: string; owner_email: string; agent_email: string }) {
 const localProxy = import.meta.env.DEV && import.meta.env.VITE_DEPLOY_ENV === 'local' && import.meta.env.VITE_VET_LOCAL_PROXY === 'true';
 if (!localProxy && !['localhost', '127.0.0.1'].includes(window.location.hostname)) throw new Error(vetPendingServices);
 const endpoint = delivery ? 'certificate-email' : 'certificate-pdf';
 const response = await vetAuthenticatedFetch(requireSupabase().auth, `${localProxy ? '/__local-vet' : 'http://127.0.0.1:54330'}/${endpoint}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ certificate_id: certificateId, ...delivery }),
 });
 if (!response.ok) { const error = await response.json(); throw new Error(error.error ?? 'Opération impossible.'); }
 if (delivery) {
  const result = await response.json();
  if (!result.results.every((r: {status: string}) => r.status === 'local_captured')) throw new Error('Envoi non confirmé pour au moins un destinataire. Consultez l’historique et Mailpit avant un nouvel essai.');
  return;
 }
 const url = URL.createObjectURL(await response.blob());
 const link = document.createElement('a');link.href = url;link.download = `HSP-VET-${certificateId.replace(/-/g, '').toUpperCase()}.pdf`;link.click();
 setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function vetWorker<T>(endpoint: string, body: Record<string,unknown>, anonymous=false): Promise<T> {
 const proxy = import.meta.env.DEV && import.meta.env.VITE_DEPLOY_ENV === 'local' && import.meta.env.VITE_VET_LOCAL_PROXY === 'true';
 if(!proxy && !['localhost','127.0.0.1'].includes(window.location.hostname)) throw new Error(vetPendingServices);
 const url = `${proxy?'/__local-vet':'http://127.0.0.1:54330'}/${endpoint}`;
 const init = {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)};
 const response = anonymous ? await fetch(url,init) : await vetAuthenticatedFetch(requireSupabase().auth,url,init);
 const result=await response.json();if(!response.ok)throw new Error(result.error??'Opération impossible.');return result;
}
