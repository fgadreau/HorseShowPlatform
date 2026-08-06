const SAFE_DEPLOY_ENVIRONMENTS = new Set([
  "local",
  "development",
  "dev",
  "staging",
  "preview",
  "test",
  "preprod",
]);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export const CAPACITY_PROFILES = Object.freeze({
  smoke: Object.freeze({
    holdSeconds: 30,
    mobileViewers: 5,
    obsViewers: 1,
    rampBatchSize: 3,
    rampDelayMs: 500,
    settleSeconds: 10,
    tvViewers: 3,
  }),
  baseline: Object.freeze({
    holdSeconds: 120,
    mobileViewers: 50,
    obsViewers: 2,
    rampBatchSize: 10,
    rampDelayMs: 1_000,
    settleSeconds: 20,
    tvViewers: 15,
  }),
  intermediate: Object.freeze({
    holdSeconds: 120,
    mobileViewers: 150,
    obsViewers: 2,
    rampBatchSize: 15,
    rampDelayMs: 1_000,
    settleSeconds: 25,
    tvViewers: 15,
  }),
  high: Object.freeze({
    holdSeconds: 180,
    mobileViewers: 300,
    obsViewers: 2,
    rampBatchSize: 20,
    rampDelayMs: 1_000,
    settleSeconds: 30,
    tvViewers: 15,
  }),
  target: Object.freeze({
    holdSeconds: 300,
    mobileViewers: 500,
    obsViewers: 2,
    rampBatchSize: 25,
    rampDelayMs: 1_000,
    settleSeconds: 30,
    tvViewers: 15,
  }),
});

export function readCapacityConfig(environment = process.env) {
  const profileName = textValue(environment.CAPACITY_PROFILE) || "smoke";
  const profile = CAPACITY_PROFILES[profileName];
  if (!profile) {
    throw new Error(
      `CAPACITY_PROFILE inconnu: ${profileName}. Valeurs permises: ${Object.keys(CAPACITY_PROFILES).join(", ")}.`,
    );
  }

  const config = {
    allowTraffic: environment.CAPACITY_ALLOW_TRAFFIC === "true",
    allowWrites: environment.CAPACITY_ALLOW_WRITES === "true",
    deployEnvironment: textValue(environment.CAPACITY_DEPLOY_ENV).toLowerCase(),
    dryRun: environment.CAPACITY_DRY_RUN === "true",
    holdSeconds: integerValue(environment.CAPACITY_HOLD_SECONDS, profile.holdSeconds, 5, 3_600),
    maxNavigationP95Ms: integerValue(environment.CAPACITY_MAX_NAVIGATION_P95_MS, 15_000, 1_000, 120_000),
    maxRealtimePropagationP95Ms: integerValue(
      environment.CAPACITY_MAX_REALTIME_PROPAGATION_P95_MS,
      2_000,
      100,
      120_000,
    ),
    maxRestErrorRate: decimalValue(environment.CAPACITY_MAX_REST_ERROR_RATE, 0.005, 0, 1),
    maxRestRequestsPerViewMinute: decimalValue(
      environment.CAPACITY_MAX_REST_REQUESTS_PER_VIEW_MINUTE,
      2,
      0,
      10_000,
    ),
    mobileUrl: urlValue(environment.CAPACITY_PUBLIC_URL, "CAPACITY_PUBLIC_URL"),
    mobileViewers: integerValue(environment.CAPACITY_MOBILE_VIEWERS, profile.mobileViewers, 0, 500),
    minRealtimeMutationCoverage: decimalValue(
      environment.CAPACITY_MIN_REALTIME_MUTATION_COVERAGE,
      0.99,
      0,
      1,
    ),
    obsUrls: urlList(environment.CAPACITY_OBS_URLS, "CAPACITY_OBS_URLS"),
    obsViewers: integerValue(environment.CAPACITY_OBS_VIEWERS, profile.obsViewers, 0, 20),
    productionHost: normalizeHost(environment.CAPACITY_PRODUCTION_SHOWSCORE_HOST),
    profileName,
    rampBatchSize: integerValue(environment.CAPACITY_RAMP_BATCH_SIZE, profile.rampBatchSize, 1, 100),
    rampDelayMs: integerValue(environment.CAPACITY_RAMP_DELAY_MS, profile.rampDelayMs, 0, 60_000),
    reportDirectory: textValue(environment.CAPACITY_REPORT_DIR) || ".tmp/capacity",
    settleSeconds: integerValue(environment.CAPACITY_SETTLE_SECONDS, profile.settleSeconds, 0, 600),
    supabaseProjectRef: textValue(environment.CAPACITY_SUPABASE_PROJECT_REF).toLowerCase(),
    supabaseServiceRoleKey: textValue(environment.CAPACITY_SUPABASE_SERVICE_ROLE_KEY),
    supabaseUrl: urlValue(environment.CAPACITY_SUPABASE_URL, "CAPACITY_SUPABASE_URL"),
    productionSupabaseProjectRef: textValue(
      environment.CAPACITY_PRODUCTION_SUPABASE_PROJECT_REF,
    ).toLowerCase(),
    tvUrls: urlList(environment.CAPACITY_TV_URLS, "CAPACITY_TV_URLS"),
    tvViewers: integerValue(environment.CAPACITY_TV_VIEWERS, profile.tvViewers, 0, 50),
    vercelProtectionBypass: textValue(environment.SHOWSCORE_VERCEL_AUTOMATION_BYPASS_SECRET),
    writerEnabled: environment.CAPACITY_WRITER_ENABLED === "true",
    writerIntervalMs: integerValue(environment.CAPACITY_WRITER_INTERVAL_MS, 5_000, 1_000, 60_000),
  };

  assertCapacityConfiguration(config);
  return config;
}

export function assertSafeCapacityTarget(config) {
  if (config.dryRun) return;

  if (!config.allowTraffic) {
    throw new Error("CAPACITY_ALLOW_TRAFFIC=true est requis avant d’envoyer de la charge.");
  }

  if (!SAFE_DEPLOY_ENVIRONMENTS.has(config.deployEnvironment)) {
    throw new Error(`Environnement de capacité refusé: ${config.deployEnvironment || "non défini"}.`);
  }

  const urls = targetUrls(config);
  const hosts = new Set(urls.map((url) => new URL(url).hostname.toLowerCase()));
  const allLocal = Array.from(hosts).every((host) => LOCAL_HOSTS.has(host));

  if (hosts.size !== 1) {
    throw new Error("Toutes les URL du test doivent cibler le même hôte ShowScore.");
  }

  if (!allLocal && !config.productionHost) {
    throw new Error(
      "CAPACITY_PRODUCTION_SHOWSCORE_HOST est requis pour prouver que la cible n’est pas la production.",
    );
  }

  if (
    config.productionHost
    && Array.from(hosts).some(
      (host) => host === config.productionHost || host.endsWith(`.${config.productionHost}`),
    )
  ) {
    throw new Error("Sécurité capacité: une URL cible correspond à l’hôte ShowScore de PRODUCTION.");
  }

  for (const url of urls) {
    const parsed = new URL(url);
    if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.protocol !== "https:") {
      throw new Error(`La cible distante doit utiliser HTTPS: ${url}`);
    }
  }

  assertSafeWriterTarget(config);
}

export function capacitySummary(config) {
  return {
    budgets: {
      maxNavigationP95Ms: config.maxNavigationP95Ms,
      maxRealtimePropagationP95Ms: config.maxRealtimePropagationP95Ms,
      maxRestErrorRate: config.maxRestErrorRate,
      maxRestRequestsPerViewMinute: config.maxRestRequestsPerViewMinute,
      minRealtimeMutationCoverage: config.minRealtimeMutationCoverage,
    },
    duration: {
      holdSeconds: config.holdSeconds,
      settleSeconds: config.settleSeconds,
    },
    profile: config.profileName,
    ramp: {
      batchSize: config.rampBatchSize,
      delayMs: config.rampDelayMs,
    },
    targetHosts: Array.from(new Set(targetUrls(config).map((url) => new URL(url).hostname))),
    viewers: {
      mobile: config.mobileViewers,
      obs: config.obsViewers,
      total: config.mobileViewers + config.obsViewers + config.tvViewers,
      tv: config.tvViewers,
    },
    writer: {
      enabled: config.writerEnabled,
      intervalMs: config.writerIntervalMs,
    },
  };
}

function assertCapacityConfiguration(config) {
  const totalViewers = config.mobileViewers + config.obsViewers + config.tvViewers;
  if (totalViewers < 1 || totalViewers > 550) {
    throw new Error(`Le test doit contenir de 1 à 550 vues; valeur reçue: ${totalViewers}.`);
  }
  if (config.mobileViewers > 0 && !config.mobileUrl) {
    throw new Error("CAPACITY_PUBLIC_URL est requis lorsque des visiteurs mobiles sont demandés.");
  }
  if (config.tvViewers > 0 && config.tvUrls.length === 0) {
    throw new Error("CAPACITY_TV_URLS est requis lorsque des télévisions sont demandées.");
  }
  if (config.obsViewers > 0 && config.obsUrls.length === 0) {
    throw new Error("CAPACITY_OBS_URLS est requis lorsque des vues OBS sont demandées.");
  }
  if (config.writerEnabled) {
    const missing = [
      ["CAPACITY_SUPABASE_URL", config.supabaseUrl],
      ["CAPACITY_SUPABASE_SERVICE_ROLE_KEY", config.supabaseServiceRoleKey],
      ["CAPACITY_SUPABASE_PROJECT_REF", config.supabaseProjectRef],
      ["CAPACITY_PRODUCTION_SUPABASE_PROJECT_REF", config.productionSupabaseProjectRef],
    ].filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) {
      throw new Error(`Configuration du producteur incomplète: ${missing.join(", ")}.`);
    }
  }
}

function assertSafeWriterTarget(config) {
  if (!config.writerEnabled) return;
  if (!config.allowWrites) {
    throw new Error("CAPACITY_ALLOW_WRITES=true est requis pour activer le producteur.");
  }

  const urlProjectRef = supabaseProjectRefFromUrl(config.supabaseUrl);
  if (!urlProjectRef || urlProjectRef !== config.supabaseProjectRef) {
    throw new Error("L’URL Supabase du producteur ne correspond pas à la référence de projet courante.");
  }
  if (config.supabaseProjectRef === config.productionSupabaseProjectRef) {
    throw new Error("Sécurité capacité: le producteur cible le projet Supabase de PRODUCTION.");
  }
}

function targetUrls(config) {
  return [config.mobileUrl, ...config.tvUrls, ...config.obsUrls].filter(Boolean);
}

function textValue(value) {
  return String(value ?? "").trim();
}

function normalizeHost(value) {
  const normalized = textValue(value).toLowerCase();
  if (!normalized) return "";
  try {
    return new URL(normalized.includes("://") ? normalized : `https://${normalized}`).hostname.toLowerCase();
  } catch {
    throw new Error("CAPACITY_PRODUCTION_SHOWSCORE_HOST n’est pas un hôte valide.");
  }
}

function supabaseProjectRefFromUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    if (LOCAL_HOSTS.has(hostname)) return "local";
    return hostname.match(/^([a-z0-9-]+)\.supabase\.co$/)?.[1] ?? "";
  } catch {
    return "";
  }
}

function integerValue(value, fallback, minimum, maximum) {
  const normalized = textValue(value);
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Valeur entière invalide (${minimum} à ${maximum}): ${normalized}.`);
  }
  return parsed;
}

function decimalValue(value, fallback, minimum, maximum) {
  const normalized = textValue(value);
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Valeur numérique invalide (${minimum} à ${maximum}): ${normalized}.`);
  }
  return parsed;
}

function urlValue(value, name) {
  const normalized = textValue(value);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (!new Set(["http:", "https:"]).has(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`${name} doit contenir une URL HTTP(S) valide.`);
  }
}

function urlList(value, name) {
  const normalized = textValue(value);
  if (!normalized) return [];
  return normalized
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => urlValue(item, name));
}
