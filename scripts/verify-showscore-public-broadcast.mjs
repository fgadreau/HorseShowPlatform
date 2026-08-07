import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const requiredEnvironment = [
  "BROADCAST_PUBLIC_SHOW_ID",
  "BROADCAST_PRIVATE_SHOW_ID",
  "BROADCAST_PUBLIC_BLOCK_ID",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
];

for (const name of requiredEnvironment) {
  if (!String(process.env[name] || "").trim()) {
    throw new Error(`${name} is required.`);
  }
}

const supabaseUrl = process.env.SUPABASE_URL.trim();
const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
const publicShowId = process.env.BROADCAST_PUBLIC_SHOW_ID.trim();
const privateShowId = process.env.BROADCAST_PRIVATE_SHOW_ID.trim();
const publicBlockId = process.env.BROADCAST_PUBLIC_BLOCK_ID.trim();
const timeoutMs = Number(process.env.BROADCAST_TEST_TIMEOUT_MS || 15_000);

const publicClient = createClient(supabaseUrl, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
});
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: WebSocket },
});

function withTimeout(promise, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out after ${timeoutMs} ms.`)),
        timeoutMs
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function subscribeAndWait(channel, expectedStatus) {
  const expectedStatuses = Array.isArray(expectedStatus)
    ? expectedStatus
    : [expectedStatus];
  return withTimeout(
    new Promise((resolve, reject) => {
      channel.subscribe((status, error) => {
        if (expectedStatuses.includes(status)) {
          resolve({ status, error: error?.message || "" });
          return;
        }

        if (
          expectedStatuses.includes("SUBSCRIBED") &&
          ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)
        ) {
          reject(
            new Error(
              `Expected SUBSCRIBED, received ${status}: ${error?.message || "unknown error"}`
            )
          );
        }
      });
    }),
    `Realtime ${expectedStatuses.join(" or ")}`
  );
}

const publicChannel = publicClient.channel(`showscore-public:${publicShowId}`, {
  config: { private: true },
});
const privateChannel = publicClient.channel(`showscore-public:${privateShowId}`, {
  config: { private: true },
});

try {
  const eventPromise = withTimeout(
    new Promise((resolve) => {
      publicChannel.on("broadcast", { event: "change" }, ({ payload }) => {
        if (payload?.block_id === publicBlockId) resolve(payload);
      });
    }),
    "Public Broadcast delivery"
  );

  const publicSubscription = await subscribeAndWait(publicChannel, "SUBSCRIBED");
  const privateRejection = await subscribeAndWait(privateChannel, [
    "CHANNEL_ERROR",
    "TIMED_OUT",
  ]);

  const { data: setup, error: setupError } = await adminClient
    .from("show_score_block_setups")
    .select("pattern")
    .eq("block_id", publicBlockId)
    .maybeSingle();
  if (setupError) throw setupError;
  if (!setup) throw new Error("The public Broadcast test block setup was not found.");

  const { error: updateError } = await adminClient
    .from("show_score_block_setups")
    .update({ pattern: setup.pattern })
    .eq("block_id", publicBlockId);
  if (updateError) throw updateError;

  const payload = await eventPromise;
  if (
    payload?.version !== 1 ||
    payload?.table !== "show_score_block_setups" ||
    payload?.eventType !== "UPDATE" ||
    !payload?.event_id ||
    !payload?.event_seq ||
    !payload?.row_key
  ) {
    throw new Error(`Unexpected Broadcast payload: ${JSON.stringify(payload)}`);
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        publicChannel: publicSubscription.status,
        privateChannel: privateRejection.status,
        deliveredTable: payload.table,
        deliveredEvent: payload.eventType,
        eventSequence: payload.event_seq,
      },
      null,
      2
    )}\n`
  );
} finally {
  await Promise.allSettled([
    publicClient.removeChannel(publicChannel),
    publicClient.removeChannel(privateChannel),
  ]);
}
