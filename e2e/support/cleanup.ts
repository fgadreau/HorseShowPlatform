import fs from "node:fs";
import { createE2EAdminClient } from "./admin";
import { E2E_STATE_PATH, readRunState } from "./run-state";

export async function cleanupPreviousE2ERun() {
  if (!fs.existsSync(E2E_STATE_PATH)) return;

  const state = readRunState();
  assertDisposableState(state);
  const admin = createE2EAdminClient();
  const organizationId = state.organizationId ?? await findOrganizationId(admin, state.organizationSlug, state.profileId);
  let contactIds: string[] = [];
  let horseIds: string[] = [];

  if (organizationId) {
    const { data: directories, error: directoriesError } = await admin
      .from("organization_disciplines")
      .select("id")
      .eq("organization_id", organizationId);
    if (directoriesError) throw directoriesError;
    const directoryIds = (directories ?? []).map((row) => row.id);

    if (directoryIds.length) {
      const [contacts, horses] = await Promise.all([
        admin.from("directory_contacts").select("contact_id").in("organization_discipline_id", directoryIds),
        admin.from("directory_horses").select("horse_id").in("organization_discipline_id", directoryIds),
      ]);
      if (contacts.error) throw contacts.error;
      if (horses.error) throw horses.error;
      contactIds = [...new Set((contacts.data ?? []).map((row) => row.contact_id))];
      horseIds = [...new Set((horses.data ?? []).map((row) => row.horse_id))];
    }

    if (horseIds.length) {
      const { error: validationDeleteError } = await admin
        .from("horse_document_validations")
        .delete()
        .in("horse_id", horseIds);
      if (validationDeleteError) throw validationDeleteError;
    }

    const { error } = await admin.from("organizations").delete().eq("id", organizationId).eq("slug", state.organizationSlug);
    if (error) throw error;
  }

  if (horseIds.length) {
    const { error } = await admin.from("horses").delete().in("id", horseIds);
    if (error) throw error;
  }
  if (contactIds.length) {
    const { error } = await admin.from("contacts").delete().in("id", contactIds);
    if (error) throw error;
  }

  const { error: userDeleteError } = await admin.auth.admin.deleteUser(state.userId);
  if (userDeleteError && !/not found/i.test(userDeleteError.message)) throw userDeleteError;
  fs.rmSync(E2E_STATE_PATH, { force: true });
}

function assertDisposableState(state: ReturnType<typeof readRunState>) {
  if (!state.organizationName.startsWith("[E2E]") || !state.organizationSlug.startsWith("e2e-") || !state.email.endsWith("@example.test")) {
    throw new Error("Nettoyage refusé: l’état ne décrit pas uniquement des données E2E jetables.");
  }
}

async function findOrganizationId(admin: ReturnType<typeof createE2EAdminClient>, slug: string, profileId: string) {
  const { data, error } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .eq("created_by_user_id", profileId)
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  return data?.id ?? null;
}
