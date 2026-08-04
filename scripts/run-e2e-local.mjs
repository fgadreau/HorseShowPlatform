import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

loadEnvironmentFiles();

const status = spawnSync("npx", ["supabase", "status", "-o", "env"], {
  cwd: process.cwd(),
  encoding: "utf8",
});

if (status.status !== 0) {
  process.stderr.write(status.stderr || "Supabase local n’est pas démarré. Lance `npx supabase start`.\n");
  process.exit(status.status ?? 1);
}

const local = parseEnvironment(status.stdout);
const productionProjectRef = firstValue("E2E_PRODUCTION_SUPABASE_PROJECT_REF", "VITE_PRODUCTION_SUPABASE_PROJECT_REF");
if (!productionProjectRef) {
  process.stderr.write("VITE_PRODUCTION_SUPABASE_PROJECT_REF doit être configuré pour activer le garde-fou anti-PROD.\n");
  process.exit(1);
}

const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    E2E_ALLOW_WRITES: "true",
    E2E_BASE_URL: process.env.E2E_BASE_URL || "http://127.0.0.1:5173",
    E2E_DEPLOY_ENV: "local",
    E2E_PRODUCTION_SUPABASE_PROJECT_REF: productionProjectRef,
    E2E_SUPABASE_PROJECT_REF: "local",
    E2E_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY || local.ANON_KEY,
    E2E_SUPABASE_SERVICE_ROLE_KEY: local.SECRET_KEY || local.SERVICE_ROLE_KEY,
    E2E_SUPABASE_URL: local.API_URL,
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);

function loadEnvironmentFiles() {
  for (const filename of [".env", ".env.local", ".env.e2e", ".env.e2e.local", ".env.example"]) {
    const filePath = path.join(process.cwd(), filename);
    if (!fs.existsSync(filePath)) continue;
    const values = parseEnvironment(fs.readFileSync(filePath, "utf8"));
    for (const [name, value] of Object.entries(values)) {
      if (process.env[name] === undefined) process.env[name] = value;
    }
  }
}

function parseEnvironment(contents) {
  const parsed = {};
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    parsed[match[1]] = unquote(match[2]);
  }
  return parsed;
}

function firstValue(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}
