import { execFileSync, spawn } from 'node:child_process';
import { assertLocalUrl } from '../../server/vet/local-server.mjs';
const command = process.argv[2];
if (!['dev', 'worker', 'test'].includes(command)) throw new Error('Usage: node scripts/vet/run-local.mjs dev|worker|test');
const workdir = process.env.VET_LOCAL_WORKDIR;
if (!workdir) throw new Error('VET_LOCAL_WORKDIR must point to the local Supabase CLI workdir.');
const local = JSON.parse(execFileSync('./node_modules/.bin/supabase', ['status', '--workdir', workdir, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const url = assertLocalUrl(local.API_URL);
const env = { ...process.env, VITE_DEPLOY_ENV: 'local', VITE_VET_LOCAL_PROXY: 'true', VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: local.ANON_KEY, VITE_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY };
let args;
if (command === 'dev') args = ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0', '--strictPort'];
else {
 Object.assign(env, { VET_SUPABASE_URL: url, VET_SUPABASE_ANON_KEY: local.ANON_KEY, VET_SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY });
 args = [command === 'worker' ? 'server/vet/local-server.mjs' : 'scripts/vet/local-pilot.mjs'];
}
const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
