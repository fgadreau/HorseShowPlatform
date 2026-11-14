import {invoiceEmail} from './email.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const DEFAULT_ORIGINS = ['https://preprod.horseshowplatform.com', 'https://horseshowplatform.com', 'http://localhost:5173'];

const envValue = (env, name) => typeof env?.get === 'function' ? env.get(name) : env?.[name];
const namedKey = (env, modernName, legacyName) => {
  const modern = envValue(env, modernName);
  if (modern) {
    try { const parsed = JSON.parse(modern); if (parsed.default) return parsed.default; } catch {/* Fall back to the legacy key. */}
  }
  return envValue(env, legacyName) ?? '';
};
const json = (status, code, headers = {}) => new Response(JSON.stringify({ok: status >= 200 && status < 300, code}), {
  status,
  headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers},
});
const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
const base64 = bytes => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
};

export function createInvoiceEmailHandler({createClient, fetchImpl = fetch, env = Deno.env} = {}) {
  if (typeof createClient !== 'function') throw Error('BILLING_EMAIL_CONFIGURATION');
  const origins = new Set((envValue(env, 'BILLING_ALLOWED_ORIGINS') ?? DEFAULT_ORIGINS.join(',')).split(',').map(value => value.trim()).filter(Boolean));
  return async request => {
    const origin = request.headers.get('Origin');
    const cors = origin && origins.has(origin) ? {'Access-Control-Allow-Origin': origin, Vary: 'Origin'} : {};
    if (origin && !origins.has(origin)) return json(403, 'BILLING_EMAIL_ORIGIN', cors);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {...cors, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '600'}});
    if (request.method !== 'POST') return json(405, 'BILLING_EMAIL_METHOD', {...cors, Allow: 'POST'});
    const authorization = request.headers.get('Authorization') ?? '';
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return json(401, 'BILLING_EMAIL_AUTH', cors);
    let body;
    try { body = await request.json(); } catch { return json(400, 'BILLING_EMAIL_REQUEST', cors); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || !UUID.test(body.documentId ?? '') || !['fr', 'en'].includes(body.locale) || Object.keys(body).some(key => !['documentId', 'locale'].includes(key))) return json(400, 'BILLING_EMAIL_REQUEST', cors);

    const url = envValue(env, 'SUPABASE_URL') ?? '';
    const publicKey = namedKey(env, 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
    const secretKey = namedKey(env, 'SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
    const resendKey = envValue(env, 'RESEND_API_KEY') ?? '';
    if (!url || !publicKey || !secretKey || !resendKey) return json(503, 'BILLING_EMAIL_CONFIGURATION', cors);
    const userClient = createClient(url, publicKey, {global: {headers: {Authorization: authorization}}, auth: {persistSession: false, autoRefreshToken: false}});
    const serviceClient = createClient(url, secretKey, {auth: {persistSession: false, autoRefreshToken: false}});
    const {data: authData, error: authError} = await userClient.auth.getUser(token);
    const replyTo = String(authData?.user?.email ?? '').trim().toLowerCase();
    if (authError || !authData?.user) return json(401, 'BILLING_EMAIL_AUTH', cors);
    if (!EMAIL.test(replyTo)) return json(422, 'BILLING_EMAIL_REPLY_TO_MISSING', cors);

    const {data: status, error: statusError} = await userClient.rpc('billing_pdf_status', {p_document: body.documentId, p_personal: false});
    if (statusError) return json(403, 'BILLING_EMAIL_FORBIDDEN', cors);
    if (status?.state !== 'completed' || !status.locales?.includes(body.locale)) return json(409, 'BILLING_EMAIL_PDF_NOT_READY', cors);
    const {data: document, error: documentError} = await userClient.rpc('get_billing_document', {p_id: body.documentId});
    if (documentError || !document || document.id !== body.documentId || document.kind !== 'invoice') return json(403, 'BILLING_EMAIL_FORBIDDEN', cors);
    const recipient = String(document.snapshot?.payer?.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(recipient)) return json(422, 'BILLING_EMAIL_RECIPIENT_MISSING', cors);

    const {data: artifact, error: artifactError} = await serviceClient.rpc('billing_pdf_file', {p_document: body.documentId, p_locale: body.locale});
    if (artifactError || !artifact?.path || !Number.isInteger(artifact.bytes) || artifact.bytes < 1 || artifact.bytes > MAX_PDF_BYTES || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) return json(409, 'BILLING_EMAIL_PDF_NOT_READY', cors);
    const {data: blob, error: downloadError} = await serviceClient.storage.from('billing-pdfs').download(artifact.path);
    if (downloadError || !blob) return json(409, 'BILLING_EMAIL_PDF_NOT_READY', cors);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length !== artifact.bytes || new TextDecoder().decode(bytes.subarray(0, 4)) !== '%PDF') return json(409, 'BILLING_EMAIL_PDF_INVALID', cors);
    const digest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    if (digest !== artifact.sha256) return json(409, 'BILLING_EMAIL_PDF_INVALID', cors);
    const replyDigest = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(replyTo)))).slice(0, 16);

    const message = invoiceEmail(document, body.locale);
    let resend;
    try {
      resend = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `billing-invoice/${body.documentId}/${body.locale}/${authData.user.id}/${replyDigest}/${artifact.sha256}`},
        body: JSON.stringify({
          from: envValue(env, 'BILLING_FROM_EMAIL') ?? 'Horse Show Platform <facturation@horseshowplatform.com>',
          to: [recipient],
          reply_to: replyTo,
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: [{filename: message.filename, content: base64(bytes)}],
        }),
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(15000) : undefined,
      });
    } catch { return json(503, 'BILLING_EMAIL_UNAVAILABLE', cors); }
    if (!resend.ok) return json(503, 'BILLING_EMAIL_UNAVAILABLE', cors);
    return json(200, 'BILLING_EMAIL_SENT', cors);
  };
}
