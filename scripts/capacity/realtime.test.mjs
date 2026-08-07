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

test("le bloc explicite est utilisé avec un canal Broadcast privé", () => {
  const viewers = [{
    metrics: {
      realtimeEvents: [{
        event: "phx_join",
        private: true,
        subscriptions: [],
        topic: "realtime:showscore-public:e3000000-0000-0000-0000-000000000099",
      }],
    },
  }];

  assert.equal(findSubscribedBlockId(viewers, BLOCK_ID.toUpperCase()), BLOCK_ID);
  assert.throws(
    () => findSubscribedBlockId(viewers),
    /CAPACITY_WRITER_BLOCK_ID est requis/,
  );
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

test("une mutation du producteur est extraite d’une trame Broadcast", () => {
  const sentAt = "2026-08-06T03:00:00.000Z";
  const payload = JSON.stringify({
    event: "broadcast",
    payload: {
      event: "change",
      payload: {
        event_seq: 42,
        eventType: "UPDATE",
        new: {
          block_id: BLOCK_ID,
          runs: [{ capacityMutation: { id: "showscore-capacity-broadcast", sentAt } }],
        },
        table: "show_score_scoring_sessions",
      },
    },
    topic: "realtime:showscore-public:e3000000-0000-0000-0000-000000000099",
  });

  assert.deepEqual(extractCapacityMutation(payload, Date.parse(sentAt) + 87), {
    id: "showscore-capacity-broadcast",
    latencyMs: 87,
    receivedAt: "2026-08-06T03:00:00.087Z",
    sentAt,
    table: "show_score_scoring_sessions",
  });
});

test("la jointure Broadcast privée est conservée dans les diagnostics", () => {
  const payload = JSON.stringify({
    event: "phx_join",
    payload: { config: { broadcast: { ack: false }, private: true } },
    topic: "realtime:showscore-public:e3000000-0000-0000-0000-000000000099",
  });

  assert.deepEqual(summarizeRealtimeFrame(payload, "sent"), {
    direction: "sent",
    event: "phx_join",
    private: true,
    subscriptions: [],
    topic: "realtime:showscore-public:e3000000-0000-0000-0000-000000000099",
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
