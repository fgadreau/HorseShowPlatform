import fs from "node:fs";
import path from "node:path";

const SAFE_DEPLOY_ENVIRONMENTS = new Set(["local", "development", "dev", "staging", "preview", "test"]);

export type E2EConfig = {
  allowWrites: boolean;
  baseUrl: string;
  currentProjectRef: string;
  deployEnvironment: string;
  productionProjectRef: string;
  publishableKey: string;
  serviceRoleKey: string;
  showScoreUrl: string;
  showScoreVercelProtectionBypass: string;
  supabaseUrl: string;
};

export function loadE2EEnvironment(root = process.cwd()) {
  for (const filename of [".env", ".env.local", ".env.e2e", ".env.e2e.local"]) {
    const filePath = path.join(root, filename);
    if (!fs.existsSync(filePath)) continue;

    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = unquote(match[2]);
    }
  }
}

export function readE2EConfig({ requireSecrets = true }: { requireSecrets?: boolean } = {}): E2EConfig {
  const supabaseUrl = value("E2E_SUPABASE_URL", "VITE_SUPABASE_URL");
  const publishableKey = value("E2E_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY");
  const serviceRoleKey = value("E2E_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  const currentProjectRef = value("E2E_SUPABASE_PROJECT_REF", "VITE_SUPABASE_PROJECT_REF");
  const productionProjectRef = value("E2E_PRODUCTION_SUPABASE_PROJECT_REF", "VITE_PRODUCTION_SUPABASE_PROJECT_REF");
  const deployEnvironment = value("E2E_DEPLOY_ENV", "VITE_DEPLOY_ENV").toLowerCase();
  const baseUrl = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:5173";
  const showScoreUrl = process.env.E2E_SHOWSCORE_URL?.trim() || "";
  const showScoreVercelProtectionBypass = process.env.SHOWSCORE_VERCEL_AUTOMATION_BYPASS_SECRET?.trim() || "";
  const allowWrites = process.env.E2E_ALLOW_WRITES === "true";

  if (requireSecrets) {
    const missing = [
      ["Supabase URL", supabaseUrl],
      ["publishable key", publishableKey],
      ["service-role key", serviceRoleKey],
      ["current project ref", currentProjectRef],
      ["production project ref", productionProjectRef],
      ["deploy environment", deployEnvironment],
    ].filter(([, configured]) => !configured).map(([name]) => name);

    if (missing.length) {
      throw new Error(`Configuration E2E incomplète: ${missing.join(", ")}. Consulte docs/E2E_TEST_ROBOT.md.`);
    }
  }

  return {
    allowWrites,
    baseUrl,
    currentProjectRef,
    deployEnvironment,
    productionProjectRef,
    publishableKey,
    serviceRoleKey,
    showScoreUrl,
    showScoreVercelProtectionBypass,
    supabaseUrl,
  };
}

export function assertSafeWriteTarget(config: E2EConfig) {
  if (!config.allowWrites) {
    throw new Error("E2E_ALLOW_WRITES=true est requis pour créer des données jetables.");
  }

  if (!SAFE_DEPLOY_ENVIRONMENTS.has(config.deployEnvironment)) {
    throw new Error(`Environnement E2E refusé: ${config.deployEnvironment || "non défini"}.`);
  }

  const urlProjectRef = projectRefFromUrl(config.supabaseUrl);
  if (!urlProjectRef || urlProjectRef !== config.currentProjectRef) {
    throw new Error("L’URL Supabase E2E ne correspond pas à la référence de projet courante.");
  }

  if (config.currentProjectRef === config.productionProjectRef) {
    throw new Error("Sécurité E2E: le projet Supabase courant est le projet de PRODUCTION.");
  }

  const appUrl = new URL(config.baseUrl);
  if (!new Set(["http:", "https:"]).has(appUrl.protocol)) {
    throw new Error("E2E_BASE_URL doit être une URL HTTP(S).");
  }

  if (config.showScoreUrl) {
    const showScoreUrl = new URL(config.showScoreUrl);
    if (!new Set(["http:", "https:"]).has(showScoreUrl.protocol)) {
      throw new Error("E2E_SHOWSCORE_URL doit être une URL HTTP(S).");
    }
  }
}

function value(...names: string[]) {
  for (const name of names) {
    const configured = process.env[name]?.trim();
    if (configured) return configured;
  }
  return "";
}

function projectRefFromUrl(valueToParse: string) {
  try {
    const hostname = new URL(valueToParse).hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0"].includes(hostname)) return "local";
    return hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1] ?? "";
  } catch {
    return "";
  }
}

function unquote(valueToParse: string) {
  const trimmed = valueToParse.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed.replace(/\s+#.*$/, "").trim();
}
