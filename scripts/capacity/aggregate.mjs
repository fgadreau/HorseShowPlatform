export function aggregateCapacityReports(reports, options = {}) {
  const expectedShards = options.expectedShards ?? 2;
  const expectedViewers = options.expectedViewers ?? 167;
  const profileName = options.profileName ?? "distributed167";
  const writerReports = reports.filter((report) => report.writer);
  const writer = writerReports[0]?.writer ?? null;
  const viewers = reports.flatMap((report) => report.viewers ?? []);
  const sourceProfile = writerReports[0]?.profile ?? reports[0]?.profile;

  if (!sourceProfile) throw new Error("Aucun profil de capacité à agréger.");
  if (writerReports.length !== 1) {
    throw new Error(`Un seul producteur est attendu; valeur reçue: ${writerReports.length}.`);
  }

  const viewerIds = viewers.map((viewer) => viewer.id);
  const uniqueViewerIds = new Set(viewerIds);
  const holdMinutes = sourceProfile.duration.holdSeconds / 60;
  const steadyRestRequests = sum(viewers.map((viewer) => viewer.steadyRestRequests));
  const steadyRestFailures = sum(viewers.map((viewer) => viewer.steadyRestFailures));
  const restRequestsPerViewMinute = steadyRestRequests / Math.max(1, viewers.length) / holdMinutes;
  const restErrorRate = steadyRestFailures / Math.max(1, steadyRestRequests);
  const navigationP95Ms = percentile(viewers.map((viewer) => viewer.navigationMs), 95);
  const failedNavigations = viewers.filter((viewer) => !viewer.navigationSucceeded).length;
  const pageErrors = sum(viewers.map((viewer) => viewer.pageErrors.length));
  const realtimeErrors = sum(
    viewers.map((viewer) => viewer.realtimeErrors + viewer.realtimeStatusErrors),
  );
  const propagation = buildPropagationMetrics(viewers, writer);
  const budgets = sourceProfile.budgets;
  const checks = [
    check("Tous les shards ont produit un rapport", reports.length === expectedShards, reports.length, expectedShards),
    check("Nombre total de vues", viewers.length === expectedViewers, viewers.length, expectedViewers),
    check("Identifiants de vues uniques", uniqueViewerIds.size === viewers.length, uniqueViewerIds.size, viewers.length),
    check("Toutes les vues ont chargé", failedNavigations === 0, failedNavigations, 0),
    check("Navigation p95", navigationP95Ms <= budgets.maxNavigationP95Ms, navigationP95Ms, budgets.maxNavigationP95Ms),
    check(
      "Requêtes REST par vue-minute",
      restRequestsPerViewMinute <= budgets.maxRestRequestsPerViewMinute,
      restRequestsPerViewMinute,
      budgets.maxRestRequestsPerViewMinute,
    ),
    check("Taux d’erreurs REST", restErrorRate <= budgets.maxRestErrorRate, restErrorRate, budgets.maxRestErrorRate),
    check("Erreurs Realtime", realtimeErrors === 0, realtimeErrors, 0),
    check("Erreurs JavaScript non interceptées", pageErrors === 0, pageErrors, 0),
    check("Erreurs du producteur", writer.errors.length === 0, writer.errors.length, 0),
    check("Mutations live publiées", writer.mutations.length > 0, writer.mutations.length, "> 0"),
    check("Fixture live restaurée", writer.restored, writer.restored ? 1 : 0, 1),
    check(
      "Couverture des mutations Realtime",
      propagation.coverage >= budgets.minRealtimeMutationCoverage,
      propagation.coverage,
      budgets.minRealtimeMutationCoverage,
    ),
    check(
      "Propagation Realtime p95",
      propagation.p95Ms <= budgets.maxRealtimePropagationP95Ms,
      propagation.p95Ms,
      budgets.maxRealtimePropagationP95Ms,
    ),
  ];

  return {
    checks,
    endedAt: latestDate(reports.map((report) => report.endedAt)),
    metrics: {
      activeRealtimeConnections: sum(viewers.map((viewer) => viewer.realtimeActive)),
      failedNavigations,
      navigationP95Ms: round(navigationP95Ms),
      pageErrors,
      realtimeErrors,
      realtimePropagation: propagation,
      restErrorRate: round(restErrorRate, 5),
      restRequestsPerViewMinute: round(restRequestsPerViewMinute),
      steadyRestFailures,
      steadyRestRequests,
      topSteadyRestRoutes: aggregateRoutes(viewers, "steadyRestRoutes").slice(0, 15),
    },
    passed: checks.every((item) => item.passed),
    profile: {
      ...sourceProfile,
      profile: profileName,
      viewers: {
        mobile: viewers.filter((viewer) => viewer.role === "mobile").length,
        obs: viewers.filter((viewer) => viewer.role === "obs").length,
        total: viewers.length,
        tv: viewers.filter((viewer) => viewer.role === "tv").length,
      },
      writer: { ...sourceProfile.writer, enabled: true },
    },
    shards: reports.map((report) => ({
      passed: report.passed,
      startedAt: report.startedAt,
      steadyStateStartedAt: report.steadyStateStartedAt,
      viewers: report.viewers?.length ?? 0,
      writer: Boolean(report.writer),
    })),
    startedAt: earliestDate(reports.map((report) => report.startedAt)),
    steadyStateStartedAt: earliestDate(reports.map((report) => report.steadyStateStartedAt)),
    viewers,
    writer,
  };
}

function buildPropagationMetrics(viewers, writer) {
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

function aggregateRoutes(viewers, property) {
  const routes = new Map();
  for (const viewer of viewers) {
    for (const [route, count] of Object.entries(viewer[property])) {
      routes.set(route, (routes.get(route) || 0) + count);
    }
  }
  return Array.from(routes, ([route, count]) => ({ count, route }))
    .sort((left, right) => right.count - left.count);
}

function check(name, passed, actual, limit) {
  return { actual: round(actual, 5), limit, name, passed };
}

function earliestDate(values) {
  return values.filter(Boolean).sort()[0] ?? null;
}

function latestDate(values) {
  return values.filter(Boolean).sort().at(-1) ?? null;
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
