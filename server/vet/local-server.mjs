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
export { createVerificationHandler } from './verification.mjs';
import { createVerificationHandler } from './verification.mjs';
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
