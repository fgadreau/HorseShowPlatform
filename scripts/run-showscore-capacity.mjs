import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium, devices } from "playwright";
import {
  assertSafeCapacityTarget,
  capacitySummary,
  readCapacityConfig,
} from "./capacity/config.mjs";
import {
  extractCapacityMutation,
  findSubscribedBlockId,
  summarizeRealtimeFrame,
} from "./capacity/realtime.mjs";
import { createCapacityWriter } from "./capacity/writer.mjs";

const config = readCapacityConfig();
assertSafeCapacityTarget(config);

const announcedSummary = capacitySummary(config);
console.log(JSON.stringify(announcedSummary, null, 2));

if (config.dryRun) {
  console.log("Dry-run terminé: aucun trafic n’a été envoyé.");
  process.exit(0);
}

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-dev-shm-usage"],
});

const commonContext = {
  extraHTTPHeaders: config.vercelProtectionBypass
    ? {
        "x-vercel-protection-bypass": config.vercelProtectionBypass,
        "x-vercel-set-bypass-cookie": "true",
      }
    : undefined,
  locale: "fr-CA",
  timezoneId: "America/Toronto",
};

const [tvContext, mobileContext, obsContext] = await Promise.all([
  browser.newContext({ ...commonContext, viewport: { height: 1080, width: 1920 } }),
  browser.newContext({ ...commonContext, ...devices["iPhone 14"] }),
  browser.newContext({ ...commonContext, viewport: { height: 1080, width: 1920 } }),
]);

const viewerDefinitions = [
  ...buildViewerDefinitions("tv", config.tvViewers, config.tvUrls, tvContext),
  ...buildViewerDefinitions("mobile", config.mobileViewers, [config.mobileUrl], mobileContext),
  ...buildViewerDefinitions("obs", config.obsViewers, config.obsUrls, obsContext),
];
const runStartedAt = new Date();
let steadyStateStartedAt = null;
let writer = null;

try {
  const viewers = [];
  for (let index = 0; index < viewerDefinitions.length; index += config.rampBatchSize) {
    const batch = viewerDefinitions.slice(index, index + config.rampBatchSize);
    const opened = await Promise.all(batch.map(openViewer));
    viewers.push(...opened);
    console.log(`Rampe: ${viewers.length}/${viewerDefinitions.length} vues ouvertes.`);
    if (index + config.rampBatchSize < viewerDefinitions.length && config.rampDelayMs > 0) {
      await wait(config.rampDelayMs);
    }
  }

  console.log(`Stabilisation pendant ${config.settleSeconds} s.`);
  await wait(config.settleSeconds * 1_000);
  if (config.writerEnabled) {
    const blockId = findSubscribedBlockId(viewers);
    writer = await createCapacityWriter(config, blockId);
    console.log(`Producteur prêt pour le bloc ${blockId}.`);
    await writer.activate();
    if (config.writerSettleMs > 0) {
      console.log(`Stabilisation live pendant ${config.writerSettleMs} ms.`);
      await wait(config.writerSettleMs);
    }
  }
  steadyStateStartedAt = new Date();
  for (const viewer of viewers) viewer.metrics.steadyState = true;

  console.log(`Mesure de l’état stable pendant ${config.holdSeconds} s.`);
  await Promise.all([
    waitWithProgress(config.holdSeconds, viewers.length),
    writer?.runFor(config.holdSeconds * 1_000),
  ]);
  for (const viewer of viewers) viewer.metrics.steadyState = false;
  await writer?.restore();

  const report = buildReport({
    config,
    runStartedAt,
    steadyStateStartedAt,
    viewers,
    writer: writer?.summary() || null,
  });
  await writeReport(config.reportDirectory, report);
  printOutcome(report);
  if (!report.passed) process.exitCode = 1;
} finally {
  await writer?.restore();
  await Promise.allSettled([tvContext.close(), mobileContext.close(), obsContext.close()]);
  await browser.close();
}

function buildViewerDefinitions(role, count, urls, context) {
  return Array.from({ length: count }, (_, index) => ({
    context,
    id: `${role}-${String(index + 1).padStart(3, "0")}`,
    role,
    url: urls[index % urls.length],
  }));
}

async function openViewer(definition) {
  const page = await definition.context.newPage();
  const metrics = createViewerMetrics(definition);
  const requestStarts = new WeakMap();

  page.on("request", (request) => {
    requestStarts.set(request, performance.now());
    if (isSupabaseRest(request.url())) {
      const route = normalizeRestRoute(request.url());
      metrics.restRequests += 1;
      metrics.restRoutes.set(route, (metrics.restRoutes.get(route) || 0) + 1);
      if (metrics.steadyState) {
        metrics.steadyRestRequests += 1;
        metrics.steadyRestRoutes.set(route, (metrics.steadyRestRoutes.get(route) || 0) + 1);
      }
    }
  });

  page.on("requestfailed", (request) => {
    if (!isSupabaseRest(request.url())) return;
    metrics.restFailures += 1;
    if (metrics.steadyState) metrics.steadyRestFailures += 1;
  });

  page.on("response", (response) => {
    const request = response.request();
    const startedAt = requestStarts.get(request);
    if (isSupabaseRest(response.url())) {
      if (response.status() >= 400) {
        metrics.restFailures += 1;
        if (metrics.steadyState) metrics.steadyRestFailures += 1;
      }
      if (startedAt !== undefined) metrics.restDurationsMs.push(performance.now() - startedAt);
    }
  });

  page.on("websocket", (socket) => {
    if (!isSupabaseRealtime(socket.url())) return;
    metrics.realtimeOpened += 1;
    metrics.realtimeActive += 1;
    socket.on("framereceived", (event) => {
      const mutation = extractCapacityMutation(event.payload);
      if (mutation && metrics.steadyState) metrics.realtimeMutations.push(mutation);
      const summary = summarizeRealtimeFrame(event.payload, "received");
      if (summary) metrics.realtimeEvents.push(summary);
    });
    socket.on("framesent", (event) => {
      const summary = summarizeRealtimeFrame(event.payload, "sent");
      if (summary) metrics.realtimeEvents.push(summary);
    });
    socket.on("close", () => {
      metrics.realtimeActive = Math.max(0, metrics.realtimeActive - 1);
      metrics.realtimeClosed += 1;
    });
    socket.on("socketerror", () => {
      metrics.realtimeErrors += 1;
    });
  });

  page.on("pageerror", (error) => metrics.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const messageText = message.text();
    metrics.consoleErrors.push(messageText);
    if (/abonnement temps réel|realtime subscription/i.test(messageText)) {
      metrics.realtimeStatusErrors += 1;
    }
  });

  const navigationStartedAt = performance.now();
  try {
    const response = await page.goto(definition.url, {
      timeout: config.maxNavigationP95Ms * 2,
      waitUntil: "domcontentloaded",
    });
    metrics.navigationMs = performance.now() - navigationStartedAt;
    metrics.navigationStatus = response?.status() ?? 0;
    metrics.navigationSucceeded = Boolean(response?.ok());
    await page.locator("body").waitFor({ state: "visible", timeout: 10_000 });
  } catch (error) {
    metrics.navigationMs = performance.now() - navigationStartedAt;
    metrics.navigationError = error instanceof Error ? error.message : String(error);
  }

  return { ...definition, metrics, page };
}

function createViewerMetrics({ id, role, url }) {
  return {
    consoleErrors: [],
    id,
    navigationError: "",
    navigationMs: 0,
    navigationStatus: 0,
    navigationSucceeded: false,
    pageErrors: [],
    realtimeActive: 0,
    realtimeClosed: 0,
    realtimeErrors: 0,
    realtimeEvents: [],
    realtimeMutations: [],
    realtimeOpened: 0,
    realtimeStatusErrors: 0,
    restDurationsMs: [],
    restFailures: 0,
    restRequests: 0,
    restRoutes: new Map(),
    role,
    steadyRestFailures: 0,
    steadyRestRequests: 0,
    steadyRestRoutes: new Map(),
    steadyState: false,
    url,
  };
}

function buildReport({ config: activeConfig, runStartedAt: startedAt, steadyStateStartedAt: steadyAt, viewers, writer }) {
  const endedAt = new Date();
  const holdMinutes = activeConfig.holdSeconds / 60;
  const serializedViewers = viewers.map(({ metrics }) => serializeMetrics(metrics));
  const navigationDurations = serializedViewers.map((viewer) => viewer.navigationMs);
  const steadyRestRequests = sum(serializedViewers.map((viewer) => viewer.steadyRestRequests));
  const steadyRestFailures = sum(serializedViewers.map((viewer) => viewer.steadyRestFailures));
  const restRequestsPerViewMinute = steadyRestRequests / Math.max(1, viewers.length) / holdMinutes;
  const restErrorRate = steadyRestFailures / Math.max(1, steadyRestRequests);
  const navigationP95Ms = percentile(navigationDurations, 95);
  const failedNavigations = serializedViewers.filter((viewer) => !viewer.navigationSucceeded).length;
  const pageErrors = sum(serializedViewers.map((viewer) => viewer.pageErrors.length));
  const realtimeErrors = sum(
    serializedViewers.map((viewer) => viewer.realtimeErrors + viewer.realtimeStatusErrors),
  );
  const propagation = buildPropagationMetrics(serializedViewers, writer);
  const checks = [
    check("Toutes les vues ont chargé", failedNavigations === 0, failedNavigations, 0),
    check("Navigation p95", navigationP95Ms <= activeConfig.maxNavigationP95Ms, navigationP95Ms, activeConfig.maxNavigationP95Ms),
    check(
      "Requêtes REST par vue-minute",
      restRequestsPerViewMinute <= activeConfig.maxRestRequestsPerViewMinute,
      restRequestsPerViewMinute,
      activeConfig.maxRestRequestsPerViewMinute,
    ),
    check("Taux d’erreurs REST", restErrorRate <= activeConfig.maxRestErrorRate, restErrorRate, activeConfig.maxRestErrorRate),
    check("Erreurs Realtime", realtimeErrors === 0, realtimeErrors, 0),
    check("Erreurs JavaScript non interceptées", pageErrors === 0, pageErrors, 0),
  ];
  if (writer) {
    checks.push(
      check("Erreurs du producteur", writer.errors.length === 0, writer.errors.length, 0),
      check("Mutations live publiées", writer.mutations.length > 0, writer.mutations.length, "> 0"),
      check("Fixture live restaurée", writer.restored, writer.restored ? 1 : 0, 1),
      check(
        "Couverture des mutations Realtime",
        propagation.coverage >= activeConfig.minRealtimeMutationCoverage,
        propagation.coverage,
        activeConfig.minRealtimeMutationCoverage,
      ),
      check(
        "Propagation Realtime p95",
        propagation.p95Ms <= activeConfig.maxRealtimePropagationP95Ms,
        propagation.p95Ms,
        activeConfig.maxRealtimePropagationP95Ms,
      ),
    );
  }

  return {
    checks,
    endedAt: endedAt.toISOString(),
    metrics: {
      activeRealtimeConnections: sum(serializedViewers.map((viewer) => viewer.realtimeActive)),
      failedNavigations,
      navigationP95Ms: round(navigationP95Ms),
      pageErrors,
      realtimeErrors,
      realtimePropagation: propagation,
      restErrorRate: round(restErrorRate, 5),
      restRequestsPerViewMinute: round(restRequestsPerViewMinute),
      steadyRestFailures,
      steadyRestRequests,
      topSteadyRestRoutes: aggregateRoutes(serializedViewers, "steadyRestRoutes").slice(0, 15),
    },
    passed: checks.every((item) => item.passed),
    profile: capacitySummary(activeConfig),
    startedAt: startedAt.toISOString(),
    steadyStateStartedAt: steadyAt?.toISOString() ?? null,
    viewers: serializedViewers,
    writer,
  };
}

function serializeMetrics(metrics) {
  return {
    ...metrics,
    navigationMs: round(metrics.navigationMs),
    restDurationsMs: undefined,
    restP95Ms: round(percentile(metrics.restDurationsMs, 95)),
    restRoutes: Object.fromEntries(metrics.restRoutes),
    steadyRestRoutes: Object.fromEntries(metrics.steadyRestRoutes),
  };
}

function aggregateRoutes(viewers, property) {
  const routes = new Map();
  for (const viewer of viewers) {
    for (const [route, count] of Object.entries(viewer[property])) {
      routes.set(route, (routes.get(route) || 0) + count);
    }
  }
  return Array.from(routes, ([route, count]) => ({ count, route })).sort((left, right) => right.count - left.count);
}

function buildPropagationMetrics(viewers, writer) {
  if (!writer) {
    return { coverage: 0, expectedDeliveries: 0, p95Ms: 0, receivedDeliveries: 0 };
  }
  const mutationIds = new Set(writer.mutations.map((mutation) => mutation.id));
  const latencies = [];
  let receivedDeliveries = 0;
  for (const viewer of viewers) {
    const receivedById = new Map();
    for (const mutation of viewer.realtimeMutations) {
      if (!mutationIds.has(mutation.id) || receivedById.has(mutation.id)) continue;
      receivedById.set(mutation.id, mutation);
      latencies.push(mutation.latencyMs);
      receivedDeliveries += 1;
    }
  }
  const expectedDeliveries = writer.mutations.length * viewers.length;
  return {
    coverage: round(receivedDeliveries / Math.max(1, expectedDeliveries), 5),
    expectedDeliveries,
    p95Ms: round(percentile(latencies, 95)),
    receivedDeliveries,
  };
}

function check(name, passed, actual, limit) {
  return { actual: round(actual, 5), limit, name, passed };
}

async function writeReport(directory, report) {
  await fs.mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = path.join(directory, `showscore-capacity-${stamp}.json`);
  const markdownPath = path.join(directory, `showscore-capacity-${stamp}.md`);
  await Promise.all([
    fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    fs.writeFile(markdownPath, markdownReport(report), "utf8"),
  ]);
  console.log(`Rapports: ${jsonPath} et ${markdownPath}`);
}

function markdownReport(report) {
  const lines = [
    "# Rapport de capacité ShowScore",
    "",
    `- Résultat: **${report.passed ? "RÉUSSI" : "ÉCHEC"}**`,
    `- Profil: ${report.profile.profile}`,
    `- Vues: ${report.profile.viewers.total} (${report.profile.viewers.tv} TV, ${report.profile.viewers.mobile} mobiles, ${report.profile.viewers.obs} OBS)`,
    `- État stable: ${report.profile.duration.holdSeconds} secondes`,
    `- Producteur live: ${report.writer ? `${report.writer.mutations.length} mutations (${report.writer.source})` : "désactivé"}`,
    "",
    "## Seuils",
    "",
    "| Vérification | Mesure | Limite | Résultat |",
    "| --- | ---: | ---: | --- |",
    ...report.checks.map((item) => `| ${item.name} | ${item.actual} | ${item.limit} | ${item.passed ? "OK" : "ÉCHEC"} |`),
    "",
    "## Routes REST les plus sollicitées",
    "",
    "| Route | Requêtes |",
    "| --- | ---: |",
    ...report.metrics.topSteadyRestRoutes.map((item) => `| \`${item.route}\` | ${item.count} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function printOutcome(report) {
  for (const item of report.checks) {
    console.log(`${item.passed ? "OK" : "ÉCHEC"} — ${item.name}: ${item.actual} (limite ${item.limit})`);
  }
}

function isSupabaseRest(url) {
  try {
    return new URL(url).pathname.startsWith("/rest/v1/");
  } catch {
    return false;
  }
}

function isSupabaseRealtime(url) {
  try {
    return new URL(url).pathname.startsWith("/realtime/v1/");
  } catch {
    return false;
  }
}

function normalizeRestRoute(url) {
  const parsed = new URL(url);
  const columns = parsed.searchParams.get("select") ? "?select=…" : "";
  return `${parsed.pathname}${columns}`;
}

function percentile(values, targetPercentile) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil((targetPercentile / 100) * sorted.length) - 1);
  return sorted[index];
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitWithProgress(seconds, viewerCount) {
  const deadline = Date.now() + seconds * 1_000;
  while (Date.now() < deadline) {
    const remainingSeconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1_000));
    console.log(`Mesure: ${viewerCount} vues actives, ${remainingSeconds} s restantes.`);
    await wait(Math.min(30_000, Math.max(1, deadline - Date.now())));
  }
}
