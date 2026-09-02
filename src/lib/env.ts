const DEPLOY_ENVIRONMENT_LABELS: Record<string, string> = {
  local: "LOCAL",
  development: "DEV",
  dev: "DEV",
  staging: "PRÉPROD",
  preview: "PREVIEW",
  production: "PROD",
  prod: "PROD",
};

function cleanEnvironmentValue(value: unknown) {
  return String(value ?? "").trim();
}

function supabaseProjectRefFromUrl(value: string) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    const match = hostname.match(/^([a-z0-9-]+)\.supabase\.co$/);
    return match?.[1] ?? (hostname === "127.0.0.1" || hostname === "localhost" ? "local" : "");
  } catch {
    return "";
  }
}

export const appEnv = {
  deployEnvironment: cleanEnvironmentValue(import.meta.env.VITE_DEPLOY_ENV).toLowerCase(),
  supabaseUrl: cleanEnvironmentValue(import.meta.env.VITE_SUPABASE_URL),
  supabaseKey: cleanEnvironmentValue(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
  ),
  supabaseProjectRef: cleanEnvironmentValue(import.meta.env.VITE_SUPABASE_PROJECT_REF),
  productionSupabaseProjectRef: cleanEnvironmentValue(import.meta.env.VITE_PRODUCTION_SUPABASE_PROJECT_REF),
  stripePublishableKey: cleanEnvironmentValue(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY),
};

export function getSupabaseConfigurationError() {
  const { deployEnvironment, productionSupabaseProjectRef, supabaseProjectRef, supabaseUrl } = appEnv;
  const configuredProjectRef = supabaseProjectRefFromUrl(supabaseUrl);
  const isOnlineEnvironment = ["development", "dev", "staging", "preview", "production", "prod"].includes(
    deployEnvironment,
  );

  if (!isOnlineEnvironment) {
    return "";
  }

  if (!supabaseUrl || !appEnv.supabaseKey) {
    return "VITE_SUPABASE_URL et la clé publique Supabase sont requis pour cet environnement.";
  }

  if (!supabaseProjectRef || !productionSupabaseProjectRef) {
    return "Les références Supabase courante et de production doivent être configurées.";
  }

  if (!configuredProjectRef || configuredProjectRef !== supabaseProjectRef) {
    return "L’URL Supabase ne correspond pas à VITE_SUPABASE_PROJECT_REF.";
  }

  if (["production", "prod"].includes(deployEnvironment)) {
    return supabaseProjectRef === productionSupabaseProjectRef
      ? ""
      : "Un déploiement de production doit utiliser le projet Supabase de production.";
  }

  return supabaseProjectRef === productionSupabaseProjectRef
    ? "Un environnement hors production ne peut pas utiliser le projet Supabase de production."
    : "";
}

export function getDeployEnvironmentLabel() {
  if (!appEnv.deployEnvironment || ["production", "prod"].includes(appEnv.deployEnvironment)) {
    return "";
  }

  return DEPLOY_ENVIRONMENT_LABELS[appEnv.deployEnvironment] ?? appEnv.deployEnvironment.toUpperCase();
}

export const supabaseConfigurationError = getSupabaseConfigurationError();
export const isSupabaseConfigured = Boolean(
  appEnv.supabaseUrl && appEnv.supabaseKey && !supabaseConfigurationError,
);
