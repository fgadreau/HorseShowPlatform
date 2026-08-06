const LIVE_TABLE_KEYS = new Map([
  ["show_score_scoring_sessions", "block_id"],
  ["show_score_announcer_live_sessions", "class_id"],
]);

export function parseRealtimeFrame(rawPayload) {
  try {
    const parsed = JSON.parse(String(rawPayload));
    return {
      event: Array.isArray(parsed) ? parsed[3] : parsed?.event,
      payload: Array.isArray(parsed) ? parsed[4] : parsed?.payload,
      topic: Array.isArray(parsed) ? parsed[2] : parsed?.topic,
    };
  } catch {
    return null;
  }
}

export function summarizeRealtimeFrame(rawPayload, direction) {
  const frame = parseRealtimeFrame(rawPayload);
  if (!frame?.event) return null;
  const { event, payload, topic } = frame;

  if (direction === "sent" && event === "phx_join") {
    return {
      direction,
      event,
      subscriptions: (payload?.config?.postgres_changes || []).map((subscription) => ({
        event: subscription.event,
        filter: subscription.filter || "",
        schema: subscription.schema,
        table: subscription.table,
      })),
      topic,
    };
  }

  const status = payload?.status || payload?.data?.status || "";
  const message = payload?.message || payload?.response?.message || payload?.data?.message || "";
  const isDiagnostic =
    ["phx_error", "phx_close", "system"].includes(event)
    || (event === "phx_reply" && status && status !== "ok");
  if (!isDiagnostic) return null;

  return {
    channel: payload?.channel || payload?.data?.channel || "",
    direction,
    event,
    extension: payload?.extension || payload?.data?.extension || "",
    message,
    status,
    topic,
  };
}

export function extractCapacityMutation(rawPayload, receivedAt = Date.now()) {
  const frame = parseRealtimeFrame(rawPayload);
  if (frame?.event !== "postgres_changes") return null;

  const data = frame.payload?.data || frame.payload;
  const record = data?.record || data?.new || data?.new_record;
  const marker = Array.isArray(record?.runs)
    ? record.runs.map((run) => run?.capacityMutation).find(Boolean)
    : null;
  if (!marker?.id || !marker?.sentAt) return null;

  const sentAt = Date.parse(marker.sentAt);
  if (!Number.isFinite(sentAt)) return null;
  return {
    id: String(marker.id),
    latencyMs: Math.max(0, receivedAt - sentAt),
    receivedAt: new Date(receivedAt).toISOString(),
    sentAt: marker.sentAt,
    table: String(data?.table || ""),
  };
}

export function findSubscribedBlockId(viewers) {
  const blockIds = new Set();
  for (const viewer of viewers) {
    for (const event of viewer.metrics.realtimeEvents) {
      for (const subscription of event.subscriptions || []) {
        const expectedKey = LIVE_TABLE_KEYS.get(subscription.table);
        if (!expectedKey) continue;
        const match = String(subscription.filter).match(/^([^=]+)=eq\.([0-9a-f-]{36})$/i);
        if (match?.[1] === expectedKey) blockIds.add(match[2].toLowerCase());
      }
    }
  }
  if (blockIds.size !== 1) {
    throw new Error(
      `Le producteur exige un seul bloc live souscrit; blocs détectés: ${blockIds.size || "aucun"}.`,
    );
  }
  return Array.from(blockIds)[0];
}
