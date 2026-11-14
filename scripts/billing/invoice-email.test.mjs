import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createInvoiceEmailHandler} from '../../supabase/functions/send-billing-invoice/handler.mjs';
import {invoiceEmail} from '../../supabase/functions/send-billing-invoice/email.mjs';

const documentId = '11111111-1111-4111-8111-111111111111';
const pdf = Buffer.from('%PDF-fixture-invoice');
const sha256 = createHash('sha256').update(pdf).digest('hex');
const document = {
  id: documentId,
  kind: 'invoice',
  number: 'HSP-DEMO-42',
  snapshot: {
    account_number: 'AQR-42',
    payer: {first_name: 'Alex', last_name: '<Démo>', email: 'PAYER@example.test'},
    context: {name_fr: 'Concours <Démo>', name_en: 'Demo <Show>'},
  },
};
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'public-test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-test',
  RESEND_API_KEY: 'resend-test',
};

function setup({statusError = null, status = {state: 'completed', locales: ['en', 'fr']}, stored = pdf, hash = sha256, resendStatus = 200, userEmail = 'Secretary@Example.test', found = document} = {}) {
  const calls = [], requests = [];
  const user = {
    auth: {getUser: async token => {calls.push(['getUser', token]); return {data: {user: userEmail ? {id: 'staff', email: userEmail} : {id: 'staff'}}, error: null};}},
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'billing_pdf_status') return {data: status, error: statusError};
      if (name === 'get_billing_document') return {data: found, error: null};
      throw Error(name);
    },
  };
  const service = {
    rpc: async (name, args) => {calls.push([name, args]); return {data: {path: 'org/document/fr.pdf', bytes: stored.length, sha256: hash}, error: null};},
    storage: {from: bucket => ({download: async path => {calls.push(['download', {bucket, path}]); return {data: new Blob([stored]), error: null};}})},
  };
  let clients = 0;
  const handler = createInvoiceEmailHandler({
    env,
    createClient: (url, key, options) => {calls.push(['client', {url, key, options}]); return clients++ === 0 ? user : service;},
    fetchImpl: async (url, options) => {requests.push({url, options, body: JSON.parse(options.body)}); return new Response('{}', {status: resendStatus});},
  });
  return {handler, calls, requests};
}

const request = (body = {documentId, locale: 'fr'}, headers = {}) => new Request('https://example.supabase.co/functions/v1/send-billing-invoice', {
  method: 'POST',
  headers: {'Content-Type': 'application/json', Authorization: 'Bearer user-token', Origin: 'https://preprod.horseshowplatform.com', ...headers},
  body: JSON.stringify(body),
});

test('sends the immutable archived PDF to the frozen payer email and replies to authenticated secretary', async () => {
  const fixture = setup();
  const response = await fixture.handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {ok: true, code: 'BILLING_EMAIL_SENT'});
  assert.equal(fixture.requests.length, 1);
  const sent = fixture.requests[0];
  assert.equal(sent.url, 'https://api.resend.com/emails');
  assert.deepEqual(sent.body.to, ['payer@example.test']);
  assert.equal(sent.body.reply_to, 'secretary@example.test');
  assert.equal(sent.body.from, 'Horse Show Platform <facturation@horseshowplatform.com>');
  assert.deepEqual(Buffer.from(sent.body.attachments[0].content, 'base64'), pdf);
  assert.match(sent.options.headers['Idempotency-Key'], new RegExp(`${documentId}/fr/staff/[a-f0-9]{16}/${sha256}$`));
  const statusCall = fixture.calls.find(([name]) => name === 'billing_pdf_status');
  assert.deepEqual(statusCall[1], {p_document: documentId, p_personal: false});
});

test('rejects browser attempts to override recipient or reply-to', async () => {
  const fixture = setup();
  const response = await fixture.handler(request({documentId, locale: 'fr', recipient: 'attacker@example.test', replyTo: 'attacker@example.test'}));
  assert.equal(response.status, 400);
  assert.equal(fixture.requests.length, 0);
});

test('requires staff PDF authorization and a completed archived locale', async () => {
  const forbidden = setup({statusError: {message: 'forbidden'}});
  assert.equal((await forbidden.handler(request())).status, 403);
  assert.equal(forbidden.requests.length, 0);
  const pending = setup({status: {state: 'pending', locales: []}});
  const response = await pending.handler(request());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'BILLING_EMAIL_PDF_NOT_READY');
  assert.equal(pending.requests.length, 0);
});

test('requires a valid authenticated reply address and frozen payer address', async () => {
  const noReply = setup({userEmail: ''});
  assert.equal((await noReply.handler(request())).status, 422);
  const noRecipient = setup({found: {...document, snapshot: {...document.snapshot, payer: {...document.snapshot.payer, email: ''}}}});
  const response = await noRecipient.handler(request());
  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, 'BILLING_EMAIL_RECIPIENT_MISSING');
  assert.equal(noRecipient.requests.length, 0);
});

test('refuses a PDF whose bytes do not match the immutable artifact hash', async () => {
  const fixture = setup({hash: '0'.repeat(64)});
  const response = await fixture.handler(request());
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'BILLING_EMAIL_PDF_INVALID');
  assert.equal(fixture.requests.length, 0);
});

test('does not leak Resend errors to the browser', async () => {
  const fixture = setup({resendStatus: 422});
  const response = await fixture.handler(request());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {ok: false, code: 'BILLING_EMAIL_UNAVAILABLE'});
});

test('builds accessible bilingual email content and escapes invoice data', () => {
  for (const locale of ['fr', 'en']) {
    const message = invoiceEmail(document, locale);
    assert.match(message.html, new RegExp(`<html lang="${locale}" dir="ltr">`));
    assert.match(message.html, /<title>.+<\/title>/);
    assert.equal((message.html.match(/<h1/g) ?? []).length, 1);
    assert.doesNotMatch(message.html, /Concours <Démo>|Alex <Démo>/);
    assert.match(message.html, /&lt;(Démo|Show)&gt;/);
    assert.ok(message.text.length > 100);
  }
});
