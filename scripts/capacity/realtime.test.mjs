import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCapacityMutation,
  findSubscribedBlockId,
  parseRealtimeFrame,
  summarizeRealtimeFrame,
} from "./realtime.mjs";
import { mutateRuns } from "./writer.mjs";

const BLOCK_ID = "e3000000-0000-0000-0000-000000000001";

test("les abonnements Realtime révèlent un unique bloc live", () => {
  const viewers = [{
    metrics: {
      realtimeEvents: [{
        subscriptions: [
          { filter: `block_id=eq.${BLOCK_ID}`, table: "show_score_scoring_sessions" },
          { filter: `class_id=eq.${BLOCK_ID}`, table: "show_score_announcer_live_sessions" },
        ],
      }],
    },
  }];
  assert.equal(findSubscribedBlockId(viewers), BLOCK_ID);
});

test("une mutation du producteur est extraite d’une trame postgres_changes", () => {
  const sentAt = "2026-08-06T03:00:00.000Z";
  const payload = JSON.stringify({
    event: "postgres_changes",
    payload: {
      data: {
        record: {
          runs: [{ capacityMutation: { id: "showscore-capacity-test", sentAt } }],
        },
        table: "show_score_scoring_sessions",
      },
    },
    topic: `realtime:public-show:${BLOCK_ID}`,
  });
  assert.deepEqual(extractCapacityMutation(payload, Date.parse(sentAt) + 125), {
    id: "showscore-capacity-test",
    latencyMs: 125,
    receivedAt: "2026-08-06T03:00:00.125Z",
    sentAt,
    table: "show_score_scoring_sessions",
  });
});

test("le parseur accepte le format Phoenix tableau et conserve les diagnostics", () => {
  const payload = JSON.stringify([null, null, "realtime:test", "system", {
    channel: "test",
    extension: "postgres_changes",
    message: "Subscribed to PostgreSQL",
    status: "ok",
  }]);
  assert.equal(parseRealtimeFrame(payload)?.event, "system");
  assert.equal(summarizeRealtimeFrame(payload, "received")?.status, "ok");
});

test("le producteur clone les passages et alterne un score réaliste", () => {
  const original = [{ id: "run-1", scoreTotal: 72.5 }];
  const marker = { id: "showscore-capacity-test", sentAt: "2026-08-06T03:00:00.000Z" };
  const mutated = mutateRuns(original, marker, 1);
  assert.equal(mutated[0].scoreTotal, 73);
  assert.deepEqual(mutated[0].capacityMutation, marker);
  assert.deepEqual(original, [{ id: "run-1", scoreTotal: 72.5 }]);
});
