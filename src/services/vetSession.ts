import type { SupabaseClient } from '@supabase/supabase-js';

const reconnect = 'Votre session n’est plus valide. Reconnectez-vous avec votre compte HSP, puis réessayez. Ce message ne signifie pas que votre compte a perdu ses droits administrateur.';

// Retry only an authentication rejection, before the worker performs a mutation.
export async function vetAuthenticatedFetch(auth: SupabaseClient['auth'], url: string, init: RequestInit, request: typeof fetch = fetch): Promise<Response> {
 const { data, error } = await auth.getSession();
 if (error || !data.session) throw new Error(reconnect);
 const send = (token: string) => {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return request(url, { ...init, headers });
 };
 let response = await send(data.session.access_token);
 if (response.status !== 401) return response;
 const refreshed = await auth.refreshSession();
 if (refreshed.error || !refreshed.data.session) throw new Error(reconnect);
 response = await send(refreshed.data.session.access_token);
 if (response.status === 401) throw new Error(reconnect);
 return response;
}
