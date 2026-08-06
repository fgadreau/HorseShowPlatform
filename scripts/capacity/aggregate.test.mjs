import assert from "node:assert/strict";
import test from "node:test";
import { aggregateCapacityReports } from "./aggregate.mjs";

function viewer(id, role, mutationIds) {
  return {
    id,
    navigationMs: 500,
    navigationSucceeded: true,
    pageErrors: [],
    realtimeActive: 1,
    realtimeErrors: 0,
    realtimeMutations: mutationIds.map((mutationId) => ({ id: mutationId, latencyMs: 100 })),
    realtimeStatusErrors: 0,
    role,
    steadyRestFailures: 0,
    steadyRestRequests: 0,
    steadyRestRoutes: {},
  };
}

function profile(viewerCount, writerEnabled) {
  return {
    budgets: {
      maxNavigationP95Ms: 15_000,
      maxRealtimePropagationP95Ms: 2_000,
      maxRestErrorRate: 0.005,
      maxRestRequestsPerViewMinute: 2,
      minRealtimeMutationCoverage: 0.99,
    },
    coordinatedStartAt: "2026-08-06T15:30:00.000Z",
    duration: { holdSeconds: 120, settleSeconds: 25 },
    profile: "distributed167",
    viewers: { mobile: viewerCount, obs: 0, total: viewerCount, tv: 0 },
    writer: { enabled: writerEnabled, intervalMs: 5_000, settleMs: 3_000 },
  };
}

function report(index, viewers, writer = null) {
  return {
    endedAt: `2026-08-06T15:32:0${index}.000Z`,
    passed: true,
    profile: profile(viewers.length, Boolean(writer)),
    startedAt: `2026-08-06T15:28:0${index}.000Z`,
    steadyStateStartedAt: "2026-08-06T15:30:03.000Z",
    viewers,
    writer,
  };
}

test("agrège deux shards et recalcule la couverture sur toutes les vues", () => {
  const writer = {
    errors: [],
    mutations: [{ id: "mutation-1" }, { id: "mutation-2" }],
    restored: true,
  };
  const reports = [
    report(0, [viewer("shard-0-mobile-001", "mobile", ["mutation-1", "mutation-2"])], writer),
    report(1, [viewer("shard-1-tv-001", "tv", ["mutation-1", "mutation-2"])]),
  ];

  const aggregate = aggregateCapacityReports(reports, {
    expectedShards: 2,
    expectedViewers: 2,
  });

  assert.equal(aggregate.passed, true);
  assert.equal(aggregate.metrics.realtimePropagation.expectedDeliveries, 4);
  assert.equal(aggregate.metrics.realtimePropagation.receivedDeliveries, 4);
  assert.equal(aggregate.profile.viewers.total, 2);
});

test("échoue si un shard manque une mutation", () => {
  const writer = {
    errors: [],
    mutations: [{ id: "mutation-1" }, { id: "mutation-2" }],
    restored: true,
  };
  const reports = [
    report(0, [viewer("shard-0-mobile-001", "mobile", ["mutation-1", "mutation-2"])], writer),
    report(1, [viewer("shard-1-tv-001", "tv", ["mutation-1"])]),
  ];

  const aggregate = aggregateCapacityReports(reports, {
    expectedShards: 2,
    expectedViewers: 2,
  });

  assert.equal(aggregate.passed, false);
  assert.equal(aggregate.metrics.realtimePropagation.coverage, 0.75);
});
