export function createVerificationHandler({ userClient, serviceClient, lookup, enabled, origin, cooldownMs = 30000, claimLookup }) {
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
   if (claimLookup && !await claimLookup()) return send(429, {error:'VET_RATE_LIMIT'});
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
