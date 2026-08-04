import type { FullConfig } from "@playwright/test";
import { cleanupPreviousE2ERun } from "./support/cleanup";

export default async function globalTeardown(_config: FullConfig) {
  if (process.env.E2E_KEEP_DATA === "true") return;
  await cleanupPreviousE2ERun();
}
