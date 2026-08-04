import fs from "node:fs";
import path from "node:path";

export const E2E_STATE_PATH = path.join(process.cwd(), ".tmp", "e2e", "run-state.json");

export type E2ERunState = {
  createdAt: string;
  email: string;
  organizationId: string | null;
  organizationName: string;
  organizationSlug: string;
  password: string;
  profileId: string;
  runId: string;
  showName: string;
  showSlug: string;
  userId: string;
};

export function readRunState(): E2ERunState {
  if (!fs.existsSync(E2E_STATE_PATH)) {
    throw new Error(`État E2E introuvable: ${E2E_STATE_PATH}`);
  }
  return JSON.parse(fs.readFileSync(E2E_STATE_PATH, "utf8")) as E2ERunState;
}

export function writeRunState(state: E2ERunState) {
  fs.mkdirSync(path.dirname(E2E_STATE_PATH), { recursive: true });
  const temporaryPath = `${E2E_STATE_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, E2E_STATE_PATH);
}
