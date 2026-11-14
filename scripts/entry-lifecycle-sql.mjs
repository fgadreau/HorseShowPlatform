// A fresh, isolated local database only. No remote URL or linked project is accepted.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { runEntryDrawRaces } from './entry-draw-races.mjs';

assert.equal(process.argv.length, 2, 'This test accepts no remote connection or container arguments');
const host = execFileSync('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], { encoding: 'utf8' }).trim();
const localDocker = value => value === 'unix:///var/run/docker.sock' || /^npipe:\/\/\/\/\.\/pipe\/(dockerDesktopLinuxEngine|docker_engine)$/.test(value);
assert(localDocker(host) && (!process.env.DOCKER_HOST || localDocker(process.env.DOCKER_HOST)), 'Only the local Docker engine is permitted');
mkdirSync('.tmp/entry-lifecycle-tests', { recursive: true });
const workdir = mkdtempSync('.tmp/entry-lifecycle-tests/fresh-');
const workspace = resolve('.tmp/entry-lifecycle-tests') + sep;
assert(resolve(workdir).startsWith(workspace));
const project = `entry-lifecycle-test-${randomUUID().slice(0, 8)}`;
const container = `supabase_db_${project}`;
const cli = args => execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', ...args, '--workdir', workdir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
async function freePort() {
  const server = createServer(); await new Promise(done => server.listen(0, '127.0.0.1', done));
  const port = server.address().port; await new Promise(done => server.close(done)); return port;
}
const sql = (source, variables = []) => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...variables, '-Atq'], { input: source, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
let started = false;
const report = { localOnly: true, project, migrations: [], passed: false };
try {
  cli(['init']);
  const configPath = workdir + '/supabase/config.toml';
  const config = readFileSync(configPath, 'utf8').replace(/^project_id = .*$/m, `project_id = "${project}"`).replace(/(\[db\][\s\S]*?\nport = )\d+/, `$1${await freePort()}`).replace(/^shadow_port = \d+/m, `shadow_port = ${await freePort()}`);
  writeFileSync(configPath, config);
  assert(!existsSync(workdir + '/supabase/.temp/project-ref'));
  assert.equal(execFileSync('docker', ['ps', '-aq', '--filter', `name=^/${container}$`], { encoding: 'utf8' }).trim(), '');
  console.log('Starting isolated local PostgreSQL:', project);
  started = true; cli(['db', 'start']);
  const labels = JSON.parse(execFileSync('docker', ['inspect', '--format', '{{json .Config.Labels}}', container], { encoding: 'utf8' }));
  assert(Object.values(labels).includes(project));
  for (const name of readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort()) {
    sql('begin; set local client_min_messages=error;\n' + readFileSync('supabase/migrations/' + name, 'utf8') + '\ncommit;');
    report.migrations.push(name);
    if (report.migrations.length % 25 === 0) console.log('Migrations replayed:', report.migrations.length);
  }
  // The historical seed's entries assume the former lifecycle. Only identity,
  // organization and directory fixtures are needed; the test submits real entries.
  sql('begin;\n' + readFileSync('supabase/seed.sql', 'utf8').split('insert into public.entries (')[0] + '\ncommit;');
  const variables = ['-v', 'org_id=30000000-0000-0000-0000-000000000001', '-v', 'show_id=40000000-0000-0000-0000-000000000001', '-v', 'staff_uid=10000000-0000-0000-0000-000000000001'];
  sql(readFileSync('supabase/tests/entry_lifecycle.sql', 'utf8'), variables);
  sql(readFileSync('supabase/tests/association_roles.sql', 'utf8'));
  sql(readFileSync('supabase/tests/membership_import.sql', 'utf8'));
  console.log('PASS: external memberships, contact matching, hidden/free cards, ownership and financial isolation');
  console.log('PASS: association roles, shared ShowScore access, admin authorization and last-admin protection');
  await runEntryDrawRaces({ sql, container, variables });
  report.passed = true;
  console.log('PASS: fresh migrations, activation, cancellation accounting and draw guards');
} catch (error) {
  report.error = String(error.stderr || error.message).slice(-5000);
  console.error(report.error); process.exitCode = 1;
} finally {
  writeFileSync('.tmp/entry-lifecycle-tests/results.json', JSON.stringify(report, null, 2));
  if (started) {
    try { cli(['stop', '--no-backup']); } catch { console.error('Isolated test cleanup incomplete:', project); }
  }
}
