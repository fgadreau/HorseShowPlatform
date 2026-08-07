import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const MARKER_PREFIX = "showscore-capacity-";

export async function createCapacityWriter(config, blockId, dependencies = {}) {
  const client = dependencies.client || createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const now = dependencies.now || Date.now;
  const wait = dependencies.wait || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const uuid = dependencies.uuid || randomUUID;

  const setup = await selectSingle(
    client.from("show_score_block_setups").select("live_data_source").eq("block_id", blockId),
    "Impossible de lire la source live du bloc ciblé",
  );
  const source = setup.live_data_source === "announcer" ? "announcer" : "scribe";
  const table = source === "announcer"
    ? "show_score_announcer_live_sessions"
    : "show_score_scoring_sessions";
  const key = source === "announcer" ? "class_id" : "block_id";
  const columns = source === "announcer" ? "runs,revision,updated_at" : "runs,updated_at";
  const original = await selectSingle(
    client.from(table).select(columns).eq(key, blockId),
    `Impossible de lire la session live ${source}`,
  );
  const originalPublication = await selectSingle(
    client
      .from("show_score_publication_states")
      .select("status,updated_at")
      .eq("block_id", blockId),
    "Impossible de lire l’état de publication du bloc ciblé",
  );

  if (!Array.isArray(original.runs) || original.runs.length === 0) {
    throw new Error(`La session live ${source} ne contient aucun passage à animer.`);
  }
  if (findCapacityMarker(original.runs)) {
    throw new Error("La fixture contient déjà un marqueur de capacité; restauration manuelle requise.");
  }

  let lastUpdatedAt = original.updated_at;
  let lastPublicationUpdatedAt = originalPublication.updated_at;
  let revision = Number(original.revision || 0);
  let lastMarkerId = "";
  let publicationChanged = false;
  let publicationRestored = true;
  let restored = false;
  const errors = [];
  const mutations = [];

  async function updateRuns(runs, markerId = "") {
    const payload = { runs };
    if (source === "announcer") payload.revision = revision + 1;
    let query = client
      .from(table)
      .update(payload)
      .eq(key, blockId)
      .eq("updated_at", lastUpdatedAt)
      .select(source === "announcer" ? "revision,updated_at" : "updated_at");
    const { data, error } = await query;
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error("La session live a changé pendant le test; écriture concurrente refusée.");
    }
    lastUpdatedAt = data[0].updated_at;
    if (source === "announcer") revision = Number(data[0].revision || revision + 1);
    lastMarkerId = markerId;
  }

  async function runFor(durationMs) {
    const deadline = now() + durationMs;
    let sequence = 0;
    while (hasCapacityDeliveryWindow(now(), deadline, config.writerIntervalMs)) {
      sequence += 1;
      const sentAtMs = now();
      const marker = {
        id: `${MARKER_PREFIX}${uuid()}`,
        sentAt: new Date(sentAtMs).toISOString(),
        sequence,
      };
      try {
        await updateRuns(mutateRuns(original.runs, marker, sequence), marker.id);
        mutations.push(marker);
        console.log(`Producteur: mutation ${sequence} publiée sur ${source}.`);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
        break;
      }
      await wait(Math.min(config.writerIntervalMs, Math.max(0, deadline - now())));
    }
  }

  async function activate() {
    if (["live", "live_no_score", "live_scoring", "live_finished"].includes(originalPublication.status)) {
      return;
    }
    const { data, error } = await client
      .from("show_score_publication_states")
      .update({ status: "live_scoring" })
      .eq("block_id", blockId)
      .eq("updated_at", lastPublicationUpdatedAt)
      .select("updated_at");
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error("L’état de publication a changé; activation live concurrente refusée.");
    }
    lastPublicationUpdatedAt = data[0].updated_at;
    publicationChanged = true;
    publicationRestored = false;
    console.log(`Producteur: fixture passée de ${originalPublication.status} à live_scoring.`);
  }

  async function restore() {
    if (restored) return;
    try {
      if (lastMarkerId) {
        const current = await selectSingle(
          client.from(table).select(columns).eq(key, blockId),
          "Impossible de vérifier la fixture avant restauration",
        );
        if (findCapacityMarker(current.runs)?.id !== lastMarkerId) {
          throw new Error("La session live a été modifiée par un autre acteur; restauration automatique refusée.");
        }
        lastUpdatedAt = current.updated_at;
        if (source === "announcer") revision = Number(current.revision || revision);
        await updateRuns(original.runs);
      }

      if (publicationChanged && !publicationRestored) {
        const { data, error } = await client
          .from("show_score_publication_states")
          .update({ status: originalPublication.status })
          .eq("block_id", blockId)
          .eq("updated_at", lastPublicationUpdatedAt)
          .select("updated_at");
        if (error) throw error;
        if (!Array.isArray(data) || data.length !== 1) {
          throw new Error("L’état de publication a changé; restauration concurrente refusée.");
        }
        lastPublicationUpdatedAt = data[0].updated_at;
        publicationRestored = true;
      }
      restored = true;
      console.log("Producteur: fixture live restaurée.");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  function summary() {
    return {
      blockId,
      enabled: true,
      errors: [...errors],
      intervalMs: config.writerIntervalMs,
      mutations: [...mutations],
      originalPublicationStatus: originalPublication.status,
      restored,
      source,
      table,
    };
  }

  return { activate, restore, runFor, summary };
}

export function hasCapacityDeliveryWindow(nowMs, deadlineMs, intervalMs) {
  return nowMs + intervalMs <= deadlineMs;
}

export function mutateRuns(originalRuns, marker, sequence) {
  const runs = structuredClone(originalRuns);
  const target = runs.find((run) => Number.isFinite(Number(run?.scoreTotal))) || runs[0];
  const originalScore = Number(target.scoreTotal);
  target.scoreTotal = Number.isFinite(originalScore)
    ? originalScore + (sequence % 2 === 1 ? 0.5 : 0)
    : sequence % 2 === 1 ? 70.5 : 70;
  target.capacityMutation = marker;
  return runs;
}

function findCapacityMarker(runs) {
  if (!Array.isArray(runs)) return null;
  return runs
    .map((run) => run?.capacityMutation)
    .find((marker) => String(marker?.id || "").startsWith(MARKER_PREFIX)) || null;
}

async function selectSingle(query, context) {
  const { data, error } = await query.single();
  if (error) throw new Error(`${context}: ${error.message}`);
  return data;
}
