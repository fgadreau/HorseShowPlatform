import type { FullConfig } from "@playwright/test";
import { createE2EAdminClient, createE2EUserClient } from "./support/admin";
import { cleanupPreviousE2ERun } from "./support/cleanup";
import { loadE2EEnvironment } from "./support/environment";
import { writeRunState } from "./support/run-state";

export default async function globalSetup(_config: FullConfig) {
  loadE2EEnvironment();
  await cleanupPreviousE2ERun();
  const admin = createE2EAdminClient();
  const runId = buildRunId();
  const email = `e2e+${runId}@example.test`;
  const password = `E2E-${crypto.randomUUID()}-aA1!`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: "Mega",
      last_name: `Robot ${runId}`,
      type_user: "admin",
    },
  });

  if (error || !data.user) {
    throw error ?? new Error("Supabase n’a pas retourné l’utilisateur E2E.");
  }

  try {
    const profileId = await waitForProfile(admin, data.user.id);
    const suffix = runId.toLowerCase();
    const organizationName = `[E2E] Méga Robot — ${runId}`;
    const organizationSlug = `e2e-${suffix}`;
    const organizationId = await createOrganizationFixture({
      admin,
      email,
      name: organizationName,
      password,
      slug: organizationSlug,
    });

    writeRunState({
      createdAt: new Date().toISOString(),
      email,
      organizationId,
      organizationName,
      organizationSlug,
      password,
      profileId,
      runId,
      showName: `[E2E] Classique Préprod — ${runId}`,
      showSlug: `e2e-show-${suffix}`,
      userId: data.user.id,
    });
  } catch (setupError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw setupError;
  }
}

async function createOrganizationFixture({
  admin,
  email,
  name,
  password,
  slug,
}: {
  admin: ReturnType<typeof createE2EAdminClient>;
  email: string;
  name: string;
  password: string;
  slug: string;
}) {
  const { data: discipline, error: disciplineError } = await admin.from("disciplines").select("id").limit(1).single<{ id: string }>();
  if (disciplineError) throw disciplineError;

  const userClient = createE2EUserClient();
  const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const { data, error } = await userClient.rpc("create_organization_with_disciplines", {
    target_name: name,
    target_slug: slug,
    target_primary_contact_email: `contact.${slug}@example.test`,
    target_timezone: "America/Toronto",
    target_currency: "CAD",
    target_discipline_ids: [discipline.id],
    target_default_discipline_id: discipline.id,
    target_requires_host_membership: false,
  }).single<{ id: string }>();
  await userClient.auth.signOut();
  if (error) throw error;
  return data.id;
}

async function waitForProfile(admin: ReturnType<typeof createE2EAdminClient>, userId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { data, error } = await admin.from("user_profiles").select("id").eq("user_id", userId).maybeSingle<{ id: string }>();
    if (error) throw error;
    if (data?.id) return data.id;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Le profil E2E n’a pas été créé par Supabase.");
}

function buildRunId() {
  const time = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `${time}-${crypto.randomUUID().slice(0, 6)}`;
}
