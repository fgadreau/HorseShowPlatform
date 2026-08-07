import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { assertSafeWriteTarget, loadE2EEnvironment, readE2EConfig } from "./environment";

export function createE2EAdminClient() {
  loadE2EEnvironment();
  const config = readE2EConfig();
  assertSafeWriteTarget(config);

  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket,
    },
  });
}

export function createE2EUserClient() {
  loadE2EEnvironment();
  const config = readE2EConfig();
  assertSafeWriteTarget(config);

  return createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    realtime: {
      transport: WebSocket,
    },
  });
}
