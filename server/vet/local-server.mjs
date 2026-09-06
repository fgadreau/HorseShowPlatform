// Local pilot only: no hosted browser or new external service. All DB traffic is loopback.
import http from 'node:http';
import { createAuthorizationHandler } from './authorization.mjs';
import { createCertificateHandler } from './certificate-delivery.mjs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from '@playwright/test';
import { lookupOmvq } from './omvq.mjs';

export function assertLocalUrl(value) {
 const url = new URL(value);
 if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.username || url.password) throw new Error('VET_LOCAL_DATABASE_REQUIRED');
 return url.origin;
}
export function createVerificationHandler({ userClient, serviceClient, lookup, enabled, origin, cooldownMs = 30000 }) {
 let busy = false, nextLookup = 0;
 return async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers.origin !== origin) { res.writeHead(403); res.end(); return; }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
  if (req.method !== 'POST' || req.url !== '/verify') return send(404, { error: 'NOT_FOUND' });
  if (!enabled) return send(503, { error: 'VET_OMVQ_DISABLED' });
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return send(401, { error: 'UNAUTHORIZED' });
  try {
   let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 2048) return send(413, { error: 'TOO_LARGE' }); }
   const { practitioner_id } = JSON.parse(body);
   if (!/^[0-9a-f-]{36}$/i.test(practitioner_id ?? '')) return send(400, { error: 'INVALID_REQUEST' });
   const client = userClient(auth);
   const { data: user, error: authError } = await client.auth.getUser();
   if (authError || !user.user) return send(401, { error: 'UNAUTHORIZED' });
   const { data: ctx, error } = await client.rpc('vet_verification_context', { p_practitioner: practitioner_id });
   if (error) return send(403, { error: error.message });
   if (ctx.cached) return send(200, { result: ctx.cached.result, checked_at: ctx.cached.checked_at, cached: true });
   if (busy || Date.now() < nextLookup) return send(429, { error: 'VET_RATE_LIMIT' });
   busy = true; nextLookup = Date.now() + cooldownMs;
   try {
    const result = await lookup(ctx.practitioner);
    const { error: writeError } = await serviceClient.rpc('vet_record_verification', {
     p_practitioner: practitioner_id, p_name: result.name ?? null, p_permit: result.permit ?? null,
     p_status: result.status ?? null, p_result: result.result,
    });
    if (writeError) return send(503, { error: 'VET_VERIFICATION_NOT_SAVED' });
    return send(200, { result: result.result, cached: false });
   } finally { busy = false; }
  } catch { return send(503, { error: 'VET_VERIFICATION_UNAVAILABLE' }); }
 };
}
export function startLocalServer() {
 const url = assertLocalUrl(process.env.VET_SUPABASE_URL ?? 'http://127.0.0.1:54321');
 const origin = assertLocalUrl(process.env.VET_WEB_ORIGIN ?? 'http://127.0.0.1:5173');
 const key = process.env.VET_SUPABASE_ANON_KEY;
 const secret = process.env.VET_SUPABASE_SERVICE_ROLE_KEY;
 if (!key || !secret) throw new Error('Local Supabase keys required (server environment only).');
 const options = { auth: { persistSession: false, autoRefreshToken: false } };
 const handler = createVerificationHandler({
  userClient: auth => createClient(url, key, { ...options, global: { headers: { Authorization: auth } } }),
  serviceClient: createClient(url, secret, options), lookup: p => lookupOmvq(p, { chromium }),
  enabled: process.env.VET_OMVQ_ENABLED === 'true', origin,
 });
 const publicOrigin=process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ? `https://${process.env.CODESPACE_NAME}-5173.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}` : origin;
 const authorizationHandler=createAuthorizationHandler({userClient:auth=>createClient(url,key,{...options,global:{headers:{Authorization:auth}}}),serviceClient:createClient(url,secret,options),origin,publicOrigin,localTestEnabled:process.env.VET_LOCAL_TEST_AUTHORIZATION==='true'});
 const certificateHandler = createCertificateHandler({
  userClient: auth => createClient(url, key, { ...options, global: { headers: { Authorization: auth } } }),
  serviceClient: createClient(url, secret, options), chromium, origin, publicOrigin,
 });
 const server = http.createServer((req,res) => ['/certificate-pdf','/certificate-email'].includes(req.url) ? certificateHandler(req,res) : ['/authorization-request','/authorization-summary','/authorization-approve','/authorization-test'].includes(req.url) ? authorizationHandler(req,res) : handler(req,res));
 server.requestTimeout = 60000;
 server.listen(54330, '127.0.0.1', () => console.log('Veterinary local worker: http://127.0.0.1:54330 (OMVQ opt-in)'));
 return server;
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) startLocalServer();
