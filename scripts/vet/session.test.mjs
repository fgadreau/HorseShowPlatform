import test from 'node:test';
import assert from 'node:assert/strict';
import { vetAuthenticatedFetch } from '../../src/services/vetSession.ts';

function authFixture(validRefresh = true) {
 let refreshes = 0;
 return {
  get refreshes() { return refreshes; },
  getSession: async () => ({ data: { session: { access_token: 'old' } } }),
  refreshSession: async () => { refreshes++; return validRefresh
   ? { data: { session: { access_token: 'new' } } }
   : { data: { session: null }, error: new Error('Revoked session') }; },
 };
}
test('worker renews a rejected session once and preserves the request', async () => {
 const auth = authFixture(); const calls = [];
 const response = await vetAuthenticatedFetch(auth, '/worker', { method: 'POST', body: '{"vet":"test"}' }, async (_url, init) => {
  calls.push(init); return new Response('{}', { status: calls.length === 1 ? 401 : 200 });
 });
 assert.equal(response.status, 200); assert.equal(auth.refreshes, 1);
 assert.deepEqual(calls.map(c => c.headers.get('Authorization')), ['Bearer old', 'Bearer new']);
 assert.equal(calls[1].body, calls[0].body);
});
test('role denial and server errors never retry a mutation', async () => {
 for (const status of [403, 500]) {
  const auth = authFixture(); let calls = 0;
  const result = await vetAuthenticatedFetch(auth, '/worker', {}, async () => { calls++; return new Response('{}', { status }); });
  assert.equal(result.status, status); assert.equal(calls, 1); assert.equal(auth.refreshes, 0);
 }
});
test('revoked session asks for reconnection without retrying the action', async () => {
 const auth = authFixture(false); let calls = 0;
 await assert.rejects(vetAuthenticatedFetch(auth, '/worker', {}, async () => { calls++; return new Response('{}', { status: 401 }); }), /Reconnectez-vous/);
 assert.equal(calls, 1);
});
test('persistent authentication rejection stops after one renewal', async () => {
 const auth = authFixture(); let calls = 0;
 await assert.rejects(vetAuthenticatedFetch(auth, '/worker', {}, async () => { calls++; return new Response('{}', { status: 401 }); }), /Reconnectez-vous/);
 assert.equal(calls, 2); assert.equal(auth.refreshes, 1);
});
