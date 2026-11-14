import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

// Called only by the fresh local database test, after its container identity check.
export async function runEntryDrawRaces({ sql, container, variables }) {
  assert(/^supabase_db_entry-lifecycle-test-[a-f0-9]{8}$/.test(container));
  const fixture = readFileSync('supabase/tests/entry_lifecycle.sql', 'utf8').split('reset role;')[0];
  sql(fixture + `reset role;create table public.entry_lifecycle_race_fixture as select current_setting('test.block')::uuid block_id,current_setting('test.entry1')::uuid entry_id;commit;`, variables);
  const ids = JSON.parse(sql('select row_to_json(f) from public.entry_lifecycle_race_fixture f;'));
  const actor = "set request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';";
  function connection(source) {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atq'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', signal;
    const ready = new Promise(resolve => { signal = resolve; });
    child.stdout.on('data', data => { out += data; if (out.includes('RACE_READY')) signal(); });
    child.stderr.on('data', data => { err += data; });
    const result = new Promise((resolve, reject) => {
      child.on('error', reject); child.on('close', code => { signal(); resolve({ code, out, err }); });
    });
    child.stdin.end('begin;' + actor + source + '\ncommit;');
    return { ready, result };
  }
  const request = randomUUID();
  const requester = connection(`select public.request_entry_cancellation('${request}','${ids.entry_id}','class','Race test');select 'RACE_READY';select pg_sleep(0.7);`);
  await requester.ready;
  const drawer = connection(`update public.blocks set draw_prepared_at=clock_timestamp() where id='${ids.block_id}';`);
  const [requested, blocked] = await Promise.all([requester.result, drawer.result]);
  assert.equal(requested.code, 0, requested.err);
  assert.notEqual(blocked.code, 0); assert.match(blocked.err, /ENTRY_DRAW_PENDING_CANCELLATIONS/);
  assert.equal(sql(`select (draw_prepared_at is null)::text from public.blocks where id='${ids.block_id}';`).trim(), 'true');
  sql(`begin;${actor}select public.withdraw_entry_cancellation('${request}');commit;`);
  const firstDraw = connection(`update public.blocks set draw_prepared_at=clock_timestamp() where id='${ids.block_id}';select 'RACE_READY';select pg_sleep(0.7);`);
  await firstDraw.ready;
  const lateRequest = connection(`select public.request_entry_cancellation('${randomUUID()}','${ids.entry_id}','class','Late race');`);
  const [generated, rejected] = await Promise.all([firstDraw.result, lateRequest.result]);
  assert.equal(generated.code, 0, generated.err);
  assert.notEqual(rejected.code, 0); assert.match(rejected.err, /ENTRY_DRAW_GENERATED_USE_SCRATCH/);
  console.log('PASS: concurrent request blocks draw; concurrent generated draw rejects cancellation');
}
