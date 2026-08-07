import assert from "node:assert/strict";
import test from "node:test";
import { buildRealtimeConnectionMetrics } from "./realtime-connections.mjs";

function viewer(overrides = {}) {
  return {
    realtimeActive: 1,
    realtimeClosed: 0,
    realtimeErrors: 0,
    realtimeOpened: 1,
    realtimeStatusErrors: 0,
    ...overrides,
  };
}

test("mesure les reconnexions récupérées de l’endurance par vue-heure", () => {
  const viewers = Array.from({ length: 167 }, (_, index) => viewer(
    index < 17
      ? { realtimeClosed: 1, realtimeOpened: 2, realtimeStatusErrors: 1 }
      : {},
  ));

  const metrics = buildRealtimeConnectionMetrics(viewers, 900);

  assert.equal(metrics.activeConnections, 167);
  assert.equal(metrics.recoveredReconnects, 17);
  assert.equal(metrics.unrecoveredFailures, 0);
  assert.ok(metrics.recoveredReconnectsPerViewHour > 0.4);
  assert.ok(metrics.recoveredReconnectsPerViewHour < 0.41);
});

test("conserve une déconnexion sans reconnexion comme échec", () => {
  const metrics = buildRealtimeConnectionMetrics([
    viewer({
      realtimeActive: 0,
      realtimeClosed: 1,
      realtimeOpened: 1,
      realtimeStatusErrors: 1,
    }),
  ], 900);

  assert.equal(metrics.activeConnections, 0);
  assert.equal(metrics.recoveredReconnects, 0);
  assert.equal(metrics.unrecoveredDisconnects, 1);
  assert.equal(metrics.unrecoveredFailures, 1);
});

test("ignore les reconnexions survenues avant la fenêtre stable", () => {
  const metrics = buildRealtimeConnectionMetrics([
    viewer({
      realtimeClosed: 1,
      realtimeOpened: 2,
      realtimeStatusErrors: 1,
      steadyRealtimeClosed: 0,
      steadyRealtimeErrors: 0,
      steadyRealtimeOpened: 0,
      steadyRealtimeStatusErrors: 0,
    }),
  ], 900);

  assert.equal(metrics.recoveredReconnects, 0);
  assert.equal(metrics.realtimeStatusErrors, 0);
  assert.equal(metrics.unrecoveredFailures, 0);
});
