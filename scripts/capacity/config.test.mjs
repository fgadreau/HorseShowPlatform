import assert from "node:assert/strict";
import test from "node:test";
import {
  assertSafeCapacityTarget,
  capacitySummary,
  readCapacityConfig,
} from "./config.mjs";

const PREPROD = "https://preprod.showscore.example";

function environment(overrides = {}) {
  return {
    CAPACITY_ALLOW_TRAFFIC: "true",
    CAPACITY_DEPLOY_ENV: "staging",
    CAPACITY_OBS_URLS: `${PREPROD}/public/associations/a/shows/s/overlay`,
    CAPACITY_PRODUCTION_SHOWSCORE_HOST: "showscore-prod.example",
    CAPACITY_PUBLIC_URL: `${PREPROD}/public/associations/a/shows/s`,
    CAPACITY_TV_URLS: `${PREPROD}/public/associations/a/shows/s/tv`,
    ...overrides,
  };
}

test("le profil baseline représente le prochain show avec 15 télévisions", () => {
  const config = readCapacityConfig(environment({ CAPACITY_PROFILE: "baseline" }));
  assertSafeCapacityTarget(config);

  assert.deepEqual(capacitySummary(config).viewers, {
    mobile: 50,
    obs: 2,
    total: 67,
    tv: 15,
  });
});

test("le profil cible représente 500 visiteurs mobiles", () => {
  const config = readCapacityConfig(environment({ CAPACITY_PROFILE: "target" }));
  assert.equal(config.mobileViewers, 500);
  assert.equal(config.tvViewers, 15);
  assert.equal(config.maxRestRequestsPerViewMinute, 2);
});

test("les paliers intermédiaires évitent un saut direct de 67 à 517 vues", () => {
  const diagnosticTotals = ["diagnostic100", "diagnostic125", "diagnostic150"]
    .map((profile) => capacitySummary(readCapacityConfig(environment({
      CAPACITY_PROFILE: profile,
    }))).viewers.total);
  const intermediate = capacitySummary(readCapacityConfig(environment({ CAPACITY_PROFILE: "intermediate" })));
  const high = capacitySummary(readCapacityConfig(environment({ CAPACITY_PROFILE: "high" })));
  assert.deepEqual(diagnosticTotals, [100, 125, 150]);
  assert.equal(intermediate.viewers.total, 167);
  assert.equal(high.viewers.total, 317);
});

test("le profil distribué conserve 167 vues et accepte un départ coordonné", () => {
  const startAt = "2026-08-06T15:30:00.000Z";
  const config = readCapacityConfig(environment({
    CAPACITY_COORDINATED_START_AT: startAt,
    CAPACITY_PROFILE: "distributed167",
  }));

  assert.equal(capacitySummary(config).viewers.total, 167);
  assert.equal(capacitySummary(config).coordinatedStartAt, startAt);
});

test("le profil d’endurance maintient 167 vues pendant 15 minutes", () => {
  const config = readCapacityConfig(environment({ CAPACITY_PROFILE: "endurance167" }));

  assert.equal(capacitySummary(config).viewers.total, 167);
  assert.equal(capacitySummary(config).duration.holdSeconds, 900);
  assert.equal(
    capacitySummary(config).budgets.maxRecoveredRealtimeReconnectsPerViewHour,
    0.5,
  );
  assert.equal(
    capacitySummary(readCapacityConfig(environment({ CAPACITY_PROFILE: "distributed167" })))
      .budgets.maxRecoveredRealtimeReconnectsPerViewHour,
    0,
  );
});

test("le profil distribué maximal représente 517 sorties pendant cinq minutes", () => {
  const config = readCapacityConfig(environment({ CAPACITY_PROFILE: "distributed500" }));

  assert.deepEqual(capacitySummary(config).viewers, {
    mobile: 500,
    obs: 2,
    total: 517,
    tv: 15,
  });
  assert.equal(capacitySummary(config).duration.holdSeconds, 300);
  assert.deepEqual(capacitySummary(config).ramp, {
    batchSize: 4,
    delayMs: 1_000,
  });
});

test("une date de départ coordonné invalide est refusée", () => {
  assert.throws(
    () => readCapacityConfig(environment({ CAPACITY_COORDINATED_START_AT: "demain matin" })),
    /date ISO valide/,
  );
});

test("la production est toujours refusée", () => {
  const config = readCapacityConfig(environment({
    CAPACITY_PUBLIC_URL: "https://showscore-prod.example/public/show",
    CAPACITY_TV_URLS: "https://showscore-prod.example/public/show/tv",
    CAPACITY_OBS_URLS: "https://showscore-prod.example/public/show/overlay",
  }));

  assert.throws(() => assertSafeCapacityTarget(config), /PRODUCTION/);
});

test("un sous-domaine de production et des hôtes mélangés sont refusés", () => {
  const productionSubdomain = readCapacityConfig(environment({
    CAPACITY_PUBLIC_URL: "https://live.showscore-prod.example/public/show",
    CAPACITY_TV_URLS: "https://live.showscore-prod.example/public/show/tv",
    CAPACITY_OBS_URLS: "https://live.showscore-prod.example/public/show/overlay",
  }));
  assert.throws(() => assertSafeCapacityTarget(productionSubdomain), /PRODUCTION/);

  const mixedHosts = readCapacityConfig(environment({
    CAPACITY_OBS_URLS: "https://other-preprod.example/public/show/overlay",
  }));
  assert.throws(() => assertSafeCapacityTarget(mixedHosts), /même hôte/);
});

test("un lancement distant exige l’autorisation et l’hôte de production", () => {
  const missingPermission = readCapacityConfig(environment({ CAPACITY_ALLOW_TRAFFIC: "false" }));
  assert.throws(() => assertSafeCapacityTarget(missingPermission), /CAPACITY_ALLOW_TRAFFIC=true/);

  const missingProductionHost = readCapacityConfig(environment({ CAPACITY_PRODUCTION_SHOWSCORE_HOST: "" }));
  assert.throws(() => assertSafeCapacityTarget(missingProductionHost), /PRODUCTION_SHOWSCORE_HOST/);
});

test("le mode dry-run valide la forme sans envoyer de trafic", () => {
  const config = readCapacityConfig(environment({
    CAPACITY_ALLOW_TRAFFIC: "false",
    CAPACITY_DRY_RUN: "true",
  }));
  assert.doesNotThrow(() => assertSafeCapacityTarget(config));
});

test("le producteur exige une autorisation et refuse Supabase production", () => {
  const writerEnvironment = {
    CAPACITY_ALLOW_WRITES: "true",
    CAPACITY_PRODUCTION_SUPABASE_PROJECT_REF: "prodref",
    CAPACITY_SUPABASE_PROJECT_REF: "preprodref",
    CAPACITY_SUPABASE_SERVICE_ROLE_KEY: "test-only-service-role",
    CAPACITY_SUPABASE_URL: "https://preprodref.supabase.co",
    CAPACITY_WRITER_ENABLED: "true",
  };
  const safeConfig = readCapacityConfig(environment(writerEnvironment));
  assert.doesNotThrow(() => assertSafeCapacityTarget(safeConfig));

  const missingPermission = readCapacityConfig(environment({
    ...writerEnvironment,
    CAPACITY_ALLOW_WRITES: "false",
  }));
  assert.throws(() => assertSafeCapacityTarget(missingPermission), /CAPACITY_ALLOW_WRITES=true/);

  const production = readCapacityConfig(environment({
    ...writerEnvironment,
    CAPACITY_PRODUCTION_SUPABASE_PROJECT_REF: "preprodref",
  }));
  assert.throws(() => assertSafeCapacityTarget(production), /Supabase de PRODUCTION/);
});
