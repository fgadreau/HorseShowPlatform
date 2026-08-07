import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Dialog,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { createE2EAdminClient } from "./support/admin";
import {
  FULL_CLASS_CONFIG,
  assertFullClassConfiguration,
  buildExpectedPayout,
  createCrossAppEntries,
  type CrossAppFixture,
} from "./support/cross-app-fixture";
import { buildContactScenarios, futureDate, scenarioSize } from "./support/data-factory";
import { readE2EConfig } from "./support/environment";
import { readRunState } from "./support/run-state";

// A retry would reuse the same disposable organization before global teardown
// and collide with the show, contacts and entries created by the first attempt.
test.describe.configure({ retries: 0 });

type AnnouncerOutcome =
  | { score: number; status: "scored" }
  | { score: null; status: "no_score" | "scratch" };

type DisplayRun = {
  backNumber: string;
  horse: string;
  rider: string;
};

type PublicDisplays = {
  arenaTvPage: Page;
  competitionTvPage: Page;
  context: BrowserContext;
  generalTvPage: Page;
  livestreamTvPage: Page;
  overlayPage: Page;
  sentinel: string;
};

type TvDisplayCodes = {
  competition: string;
  general: string;
  livestream: string;
};

// One valid 8 × 8 H.264 frame. Keeping the fixture inline lets CI exercise the
// real resumable upload and browser playback without a third-party video URL.
const TINY_MP4_BASE64 =
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAr9tZGF0AAACoAYF//+c3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDEyNSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMTIgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDM6MHgxMTMgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTEgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz02IGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MyBiX3B5cmFtaWQ9MiBiX2FkYXB0PTEgYl9iaWFzPTAgZGlyZWN0PTEgd2VpZ2h0Yj0xIG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj0yNCBzY2VuZWN1dD00MCBpbnRyYV9yZWZyZXNoPTAgcmNfbG9va2FoZWFkPTQwIHJjPWNyZiBtYnRyZWU9MSBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0xOjEuMDAAgAAAAA9liIQAV/0TAAYdeBTXzg8AAALvbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAACoAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAhl0cmFrAAAAXHRraGQAAAAPAAAAAAAAAAAAAAABAAAAAAAAACoAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAgAAAAIAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAAqAAAAAAABAAAAAAGRbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAwAAAAAgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABPG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAPxzdGJsAAAAmHN0c2QAAAAAAAAAAQAAAIhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAgACABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAAMmF2Y0MBZAAK/+EAGWdkAAqs2V+WXAWyAAADAAIAAAMAYB4kSywBAAZo6+PLIsAAAAAYc3R0cwAAAAAAAAABAAAAAQAAAgAAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAEAAAABAAAAFHN0c3oAAAAAAAACtwAAAAEAAAAUc3RjbwAAAAAAAAABAAAAMAAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNTQuNjMuMTA0";

test("le méga robot complète un vrai parcours de préproduction", async ({ browser, page }, testInfo) => {
  test.slow();
  const state = readRunState();
  const participantCount = scenarioSize();
  const announcerOutcomes = buildAnnouncerOutcomes(participantCount);
  const announcerScores = announcerOutcomes
    .filter((outcome): outcome is Extract<AnnouncerOutcome, { status: "scored" }> => outcome.status === "scored")
    .map((outcome) => outcome.score)
    .sort((a, b) => b - a);
  const rankedTeamCount = Math.min(announcerScores.length, 10);
  const expectedPayout = buildExpectedPayout(participantCount);
  const expectedAwards = buildExpectedAwards(expectedPayout.netPurse, participantCount);
  const blockName = `[E2E] Bloc annonceur — ${state.runId}`;
  const warmupName = `[E2E] Warm-up chrono — ${state.runId}`;
  let crossAppFixture: CrossAppFixture | null = null;
  let championshipParticipantNames: string[] = [];
  let displayRuns: DisplayRun[] = [];
  let tvDisplayCodes: TvDisplayCodes | null = null;
  let warmupId = "";
  const browserErrors: string[] = [];
  let showScoreContext: BrowserContext | null = null;
  let publicDisplays: PublicDisplays | null = null;
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });

  await test.step("connexion avec un administrateur jetable", async () => {
    await page.addInitScript(() => localStorage.setItem("horseshow.locale", "fr"));
    await page.goto("/");
    await page.getByRole("button", { name: "Se connecter" }).click();
    const authForm = page.locator("form.stack");
    await authForm.getByLabel("Courriel", { exact: true }).fill(state.email);
    await authForm.getByLabel("Mot de passe", { exact: true }).fill(state.password);
    await authForm.getByRole("button", { name: "Connexion", exact: true }).click();
    await expect(page.getByRole("button", { name: "Déconnexion" })).toBeVisible();
    await expect(page.locator(".workspace-header h1")).toHaveText(state.organizationName);
  });

  await test.step("création et ouverture d’un concours", async () => {
    await navigateTo(page, "shows");
    await page.getByTestId("create-show-button").click();
    const assistant = page.getByTestId("show-assistant");
    await expect(assistant).toBeVisible();
    await assistant.getByLabel("Nom", { exact: true }).fill(state.showName);
    await assistant.getByLabel("Slug", { exact: true }).fill(state.showSlug);
    await assistant.getByLabel("Début", { exact: true }).fill(futureDate(30));
    await assistant.getByLabel("Fin", { exact: true }).fill(futureDate(32));
    await assistant.getByLabel("Lieu", { exact: true }).fill("Centre équestre QA — Saint-Hyacinthe, QC");
    await assistant.getByRole("button", { name: "Créer le brouillon" }).click();

    await expect(assistant.getByText("Paiements du concours")).toBeVisible();
    await assistant.locator("label").filter({ hasText: /^Réservations/ }).locator("select").selectOption("manual");
    await assistant.locator("label").filter({ hasText: /^Inscriptions/ }).locator("select").selectOption("manual");
    await assistant.getByRole("button", { name: "Sauvegarder" }).click();
    await expect(assistant.locator(".readiness-summary strong")).toContainText("prêts");
    await assistant.getByRole("button", { name: "Ouvrir les inscriptions" }).click();
    await expect(assistant.getByRole("button", { name: "Concours ouvert" })).toBeDisabled();
    await assistant.locator(".assistant-readiness .form-actions").getByRole("button", { name: "Fermer", exact: true }).click();

    const showRow = page.locator(`[data-show-slug="${state.showSlug}"]`);
    await expect(showRow).toContainText(state.showName);
    await expect(showRow).toContainText("open");
  });

  await test.step("publication d’une annonce avec caractères réels", async () => {
    const showRow = page.locator(`[data-show-slug="${state.showSlug}"]`);
    await showRow.getByRole("button", { name: "Annonces" }).click();
    const dialog = page.getByRole("dialog", { name: "Annonces publiques" });
    const title = `Horaire révisé — ${state.runId}`;
    await dialog.getByLabel("Titre", { exact: true }).fill(title);
    await dialog.getByLabel("Message", { exact: true }).fill("Départ à 8 h 05. Café, météo ☀ et vérification des dossards à l’entrée.");
    await dialog.getByRole("button", { name: "Publier" }).click();
    await expect(dialog.getByText(title)).toBeVisible();
    await dialog.getByRole("button", { name: "Close modal" }).click();
  });

  await test.step("saisie de contacts variés par les vrais formulaires", async () => {
    await navigateTo(page, "people");
    const contacts = buildContactScenarios(state);

    for (const [index, contact] of contacts.entries()) {
      await test.step(`contact ${index + 1}/${contacts.length}: ${contact.firstName} ${contact.lastName}`, async () => {
        await page.getByTestId("create-contact-button").click();
        const form = page.getByTestId("contact-create-form");
        await form.getByLabel("Prénom", { exact: true }).fill(contact.firstName);
        await form.getByLabel("Nom", { exact: true }).fill(contact.lastName);
        await form.getByLabel("Courriel", { exact: true }).fill(contact.email);
        await form.getByLabel("Téléphone", { exact: true }).fill(contact.phone);
        await form.getByLabel("Écurie", { exact: true }).fill(contact.barn);
        await form.getByLabel("Adresse", { exact: true }).fill(contact.address);
        await form.getByLabel("Appartement, suite, unité", { exact: true }).fill(contact.addressLine2);
        await form.getByLabel("Ville", { exact: true }).fill(contact.city);
        await form.getByLabel("Province / État", { exact: true }).fill(contact.state);
        await form.getByLabel("Code postal", { exact: true }).fill(contact.postalCode);
        await form.getByLabel("Pays", { exact: true }).fill(contact.country);
        await form.getByLabel("Date de naissance", { exact: true }).fill(contact.dateOfBirth);
        const contactResponsePromise = waitForContactCreateResponse(page);
        await form.getByRole("button", { name: "Créer le contact", exact: true }).click();
        const createDifferentContact = form.getByRole("button", { name: "Ce sont des fiches différentes — créer quand même", exact: true });
        let contactResponse = await Promise.race([
          contactResponsePromise,
          createDifferentContact.waitFor({ state: "visible" }).then(() => null),
        ]);
        if (!contactResponse) {
          const confirmedContactResponsePromise = waitForContactCreateResponse(page);
          await createDifferentContact.click();
          contactResponse = await confirmedContactResponsePromise;
        }
        const contactPayload = contactResponse.request().postDataJSON() as { created_by_user_id?: string };
        expect(contactPayload.created_by_user_id).toBe(state.profileId);
        expect(contactResponse.ok(), await contactResponse.text()).toBeTruthy();
        await expect(form).toBeHidden();
      });
    }

    const search = page.getByLabel("Rechercher un contact", { exact: true });
    await search.fill(contacts[0].email);
    await expect(page.getByText(`${contacts[0].firstName} ${contacts[0].lastName}`, { exact: true })).toBeVisible();
    await expect(page.getByText(new RegExp(`1 résultat sur ${contacts.length} contacts?`))).toBeVisible();
  });

  await test.step("configuration complète du bloc et de la classe", async () => {
    await navigateTo(page, "blocks");
    await page.getByRole("button", { name: state.showName }).click();
    await page.getByRole("button", { name: "Bloc libre", exact: true }).first().click();

    const blockForm = page.getByRole("dialog").getByTestId("block-create-form");
    await blockForm.getByRole("textbox", { name: "Manège / arène", exact: true }).fill("Arène E2E");
    await blockForm.getByRole("textbox", { name: "Juge(s)", exact: true }).fill("Juge E2E");
    await blockForm.getByRole("combobox", { name: "Mode de départ", exact: true }).selectOption("fixed");
    await blockForm.getByRole("textbox", { name: "Heure", exact: true }).fill("09:00");
    await selectSearchOption(blockForm.getByRole("combobox", { name: "Patron", exact: true }), "Reining #1");
    await blockForm.getByRole("textbox", { name: "Nom du bloc", exact: true }).fill(blockName);
    await blockForm.getByRole("textbox", { name: "Libellé d'horaire", exact: true }).fill("Open — annonceur");
    await blockForm.getByRole("textbox", { name: /^Fermeture des inscriptions/ }).fill(pastDateTimeLocal());
    await blockForm.getByRole("button", { name: "Créer le bloc", exact: true }).click();
    await expect(blockForm).toBeHidden();

    const blockCard = page.locator(`[data-block-name="${blockName}"]`);
    await blockCard.locator(".schedule-block-trigger").click();
    await blockCard.getByRole("button", { name: "+ Classe", exact: true }).click();

    const classForm = page.getByRole("dialog").getByTestId("class-create-form");
    const nrhaCheckbox = classForm.getByRole("checkbox", { name: "National Reining Horse Association", exact: true });
    if (!(await nrhaCheckbox.isChecked())) await nrhaCheckbox.check();
    await classForm.getByRole("combobox", { name: "Politique de dossard", exact: true }).selectOption("horse_rider_team");
    await selectSearchOption(classForm.getByRole("combobox", { name: "Classe NRHA", exact: true }), `${FULL_CLASS_CONFIG.classCode} ${FULL_CLASS_CONFIG.className}`);
    await classForm.getByRole("spinbutton", { name: "Frais d'inscription", exact: true }).fill(String(FULL_CLASS_CONFIG.entryFee));
    await classForm.getByRole("spinbutton", { name: "Frais de juge", exact: true }).fill(String(FULL_CLASS_CONFIG.judgeFee));

    const payoutFields = classForm.getByRole("group", { name: "Bourses / Payouts" });
    const payoutDetails = payoutFields.locator("details.payout-settings-details");
    await payoutDetails.locator("summary").click();
    await expect(payoutDetails).toHaveAttribute("open", "");
    await payoutDetails.locator("label").filter({ hasText: /^Type de paiement/ }).locator("select").selectOption("house_custom");
    await payoutDetails.locator("label").filter({ hasText: /^Added money/ }).locator("input").fill(String(FULL_CLASS_CONFIG.addedMoney));
    await payoutDetails.locator("label").filter({ hasText: /^Trophée \/ plaque/ }).locator("input").fill(String(FULL_CLASS_CONFIG.trophyFee));
    await payoutDetails.locator("label").filter({ hasText: /^Retenue personnalisée/ }).locator("input").fill(String(FULL_CLASS_CONFIG.retainagePercent));
    await payoutDetails.locator("label").filter({ hasText: /^Frais d'organisme/ }).locator("input").fill(String(FULL_CLASS_CONFIG.sanctioningFeePercent));
    const payoutRow = payoutFields.locator(".payout-rule-row").nth(1);
    await payoutRow.locator("input").nth(0).fill("1");
    await payoutRow.locator("input").nth(1).fill(String(FULL_CLASS_CONFIG.payoutMaxEntries));
    await payoutRow.locator("input").nth(2).fill(FULL_CLASS_CONFIG.payoutPercentages);
    await payoutDetails.locator("label").filter({ hasText: /^Aperçu avec/ }).locator("input").fill(String(participantCount));
    await expect(payoutFields.locator(".payout-preview")).toContainText(moneyPattern(expectedPayout.netPurse));
    await payoutDetails.locator("label").filter({ hasText: /^Notes de paiement/ }).locator("textarea").fill(FULL_CLASS_CONFIG.payoutNotes);
    await classForm.getByRole("textbox", { name: "Critères d'éligibilité", exact: true }).fill(FULL_CLASS_CONFIG.eligibilityNotes);
    await classForm.getByRole("button", { name: "Créer la classe", exact: true }).click();
    await expect(classForm).toBeHidden();

    await expect(blockCard.locator(`[data-class-code="${FULL_CLASS_CONFIG.classCode}"]`)).toContainText("Paiement maison personnalisé");
  });

  await test.step("inscriptions réelles et préparation du passage ShowScore", async () => {
    crossAppFixture = await createCrossAppEntries(state, blockName);
    await assertFullClassConfiguration(crossAppFixture);

    await page.reload();
    await expect(page.getByRole("button", { name: "Déconnexion" })).toBeVisible();
    await navigateTo(page, "scoring");
    const scoringGroup = page.locator(".scoring-class-group").filter({ hasText: blockName });
    await expect(scoringGroup).toContainText(String(participantCount));
    await scoringGroup.getByRole("button", { name: "Sortir ordre", exact: true }).click();
    await expect(scoringGroup).toContainText("Ordre sorti");
    await scoringGroup.getByRole("button", { name: "Voir ordre", exact: true }).click();
    for (const participantName of crossAppFixture.participantNames) {
      await expect(scoringGroup).toContainText(participantName);
    }

    const admin = createE2EAdminClient();
    const { data: setup, error: setupError } = await admin
      .from("show_score_block_setups")
      .select("runs,block_classes,is_draw_imported")
      .eq("block_id", crossAppFixture.blockId)
      .single<{ runs: Array<Record<string, unknown>>; block_classes: Array<Record<string, unknown>>; is_draw_imported: boolean }>();
    if (setupError) throw setupError;
    expect(setup.is_draw_imported).toBe(true);
    expect(setup.runs).toHaveLength(participantCount);
    expect(setup.block_classes).toEqual(expect.arrayContaining([expect.objectContaining({ code: FULL_CLASS_CONFIG.classCode })]));
    displayRuns = setup.runs.map((run) => ({
      backNumber: String(run.backNumber ?? run.back_number ?? "").trim(),
      horse: String(run.horse ?? "").trim(),
      rider: String(run.rider ?? "").trim(),
    }));
    expect(displayRuns).toHaveLength(participantCount);
    expect(displayRuns.every((run) => run.rider && run.horse && run.backNumber)).toBe(true);
    championshipParticipantNames = setup.runs
      .filter((_, index) => announcerOutcomes[index]?.status === "scored")
      .slice(0, rankedTeamCount)
      .map((run) => String(run.rider ?? "").trim());
    expect(championshipParticipantNames).toHaveLength(rankedTeamCount);
    expect(championshipParticipantNames.every(Boolean)).toBe(true);
  });

  await test.step("saisie des résultats par l’annonceur dans ShowScore", async () => {
    if (!crossAppFixture) throw new Error("Fixture HSP → ShowScore absente.");
    const config = readE2EConfig();
    if (!config.showScoreUrl) throw new Error("E2E_SHOWSCORE_URL est requis pour le parcours inter-apps.");
    showScoreContext = await browser.newContext({
      extraHTTPHeaders: config.showScoreVercelProtectionBypass
        ? {
            "x-vercel-protection-bypass": config.showScoreVercelProtectionBypass,
            "x-vercel-set-bypass-cookie": "true",
          }
        : undefined,
      locale: "fr-CA",
      timezoneId: "America/Toronto",
    });
    const showScorePage = await showScoreContext.newPage();
    showScorePage.on("pageerror", (error) => browserErrors.push(`ShowScore: ${error.message}`));
    showScorePage.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(`ShowScore: ${message.text()}`);
    });
    await showScorePage.addInitScript(() => localStorage.setItem("showscore.language", "fr"));
    await showScorePage.goto(`${config.showScoreUrl}/login`);
    await showScorePage.getByLabel("Courriel", { exact: true }).fill(state.email);
    await showScorePage.getByLabel("Mot de passe", { exact: true }).fill(state.password);
    await showScorePage.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(showScorePage).toHaveURL(/\/associations/);

    await showScorePage.goto(`${config.showScoreUrl}/associations/${state.organizationId}/shows`);
    await expect(showScorePage.locator("body")).toContainText(state.showName);

    await showScorePage.goto(
      `${config.showScoreUrl}/associations/${state.organizationId}/shows/${crossAppFixture.showId}?day=${crossAppFixture.showDayId}`,
    );
    await verifyShowScoreDayTabs(showScorePage, crossAppFixture);
    const activeDayActions = showScorePage.locator(
      `[data-show-day-actions="${crossAppFixture.showDayId}"]`,
    );
    await expect(activeDayActions).toBeVisible();
    await expect(activeDayActions.getByRole("button", { name: "Modifier", exact: true })).toBeVisible();
    await expect(activeDayActions.getByRole("button", { name: "Supprimer", exact: true })).toBeVisible();
    const activeDayContent = showScorePage.locator(
      `[data-show-day-content="${crossAppFixture.showDayId}"]`,
    );
    await expect(activeDayContent).toBeVisible();
    await expect(activeDayContent).toContainText(blockName);
    await expect(showScorePage.getByRole("link", { name: "Ouvrir les blocs", exact: true })).toHaveCount(0);

    await showScorePage.goto(
      `${config.showScoreUrl}/associations/${state.organizationId}/shows/${crossAppFixture.showId}/days/${crossAppFixture.showDayId}`,
    );
    await expect(showScorePage).toHaveURL(
      new RegExp(`/shows/${crossAppFixture.showId}\\?day=${crossAppFixture.showDayId}$`),
    );
    await expect(showScorePage.locator("body")).toContainText(blockName);
    await verifyShowScoreDayTabs(showScorePage, crossAppFixture, blockName);
    tvDisplayCodes = await configureShowScoreTvViews(showScorePage);
    const setupLink = showScorePage.locator(
      `a[href="/associations/${state.organizationId}/classes/${crossAppFixture.blockId}/setup"]`,
    );
    await expect(setupLink).toHaveText("Ouvrir setup");
    await setupLink.click();
    const runCountField = showScorePage
      .getByText("Nombre de runs", { exact: true })
      .locator("..")
      .getByRole("spinbutton");
    await expect(runCountField).toHaveValue(String(participantCount));
    const liveSource = showScorePage.getByLabel("Source des données live", { exact: true });
    const acceptLiveSourceDialog = (dialog: Dialog) => {
      void dialog.accept();
    };
    showScorePage.once("dialog", acceptLiveSourceDialog);
    await liveSource.selectOption("announcer");
    await expect(liveSource).toHaveValue("announcer");
    showScorePage.off("dialog", acceptLiveSourceDialog);
    const admin = createE2EAdminClient();
    await expect.poll(async () => {
      const [{ data: setup, error: setupError }, { data: session, error: sessionError }] = await Promise.all([
        admin
          .from("show_score_block_setups")
          .select("live_data_source")
          .eq("block_id", crossAppFixture!.blockId)
          .single<{ live_data_source: string }>(),
        admin
          .from("show_score_announcer_live_sessions")
          .select("runs")
          .eq("class_id", crossAppFixture!.blockId)
          .maybeSingle<{ runs: Array<Record<string, unknown>> }>(),
      ]);
      if (setupError) throw setupError;
      if (sessionError) throw sessionError;
      return {
        source: setup.live_data_source,
        runCount: session?.runs?.length ?? 0,
      };
    }).toEqual({ source: "announcer", runCount: participantCount });

    publicDisplays = await openPublicDisplays({
      browser,
      browserErrors,
      showScoreUrl: config.showScoreUrl,
      showScoreVercelProtectionBypass: config.showScoreVercelProtectionBypass,
      organizationId: state.organizationId,
      showId: crossAppFixture.showId,
      showName: state.showName,
      tvDisplayCodes,
    });
    await attachPublicDisplayScreenshots(testInfo, publicDisplays, "avant-le-premier-passage");

    await showScorePage.goto(
      `${config.showScoreUrl}/associations/${state.organizationId}/shows/${crossAppFixture.showId}?day=${crossAppFixture.showDayId}`,
    );
    await verifyShowScoreDayTabs(showScorePage, crossAppFixture, blockName);
    warmupId = await configureShowScorePaidWarmup({
      page: showScorePage,
      organizationId: state.organizationId,
      showId: crossAppFixture.showId,
      showDayId: crossAppFixture.showDayId,
      showScoreUrl: config.showScoreUrl,
      warmupName,
    });

    await testShowScorePaidWarmupTimer({
      displays: publicDisplays,
      organizationId: state.organizationId,
      page: showScorePage,
      showDayId: crossAppFixture.showDayId,
      showId: crossAppFixture.showId,
      showScoreUrl: config.showScoreUrl,
      testInfo,
      warmupId,
      warmupName,
    });

    for (const managementView of ["scribe", "schedule", "time"]) {
      await showScorePage.goto(
        `${config.showScoreUrl}/associations/${state.organizationId}/shows/${crossAppFixture.showId}/${managementView}?day=${crossAppFixture.showDayId}`,
      );
      await expect(showScorePage.locator("body")).toContainText(blockName);
      await verifyShowScoreDayTabs(showScorePage, crossAppFixture, blockName);
    }

    await showScorePage.goto(`${config.showScoreUrl}/associations/${state.organizationId}/shows/${crossAppFixture.showId}/announcer?day=${crossAppFixture.showDayId}`);
    await expect(showScorePage.locator("body")).toContainText(blockName);
    await verifyShowScoreDayTabs(showScorePage, crossAppFixture, blockName);
    await expect(showScorePage.locator("body")).toContainText(/Source\s*:\s*annonceur/i);
    await expect(showScorePage.locator("body")).toContainText(new RegExp(`Runs\\s*:\\s*${participantCount}`, "i"));
    const announcerClass = showScorePage.locator(`[data-announcer-class-id="${crossAppFixture.blockId}"]`);
    const announcerClassHeader = announcerClass.locator('[role="button"][aria-expanded]');
    if ((await announcerClassHeader.getAttribute("aria-expanded")) !== "true") {
      await announcerClassHeader.click();
    }
    for (const [index, outcome] of announcerOutcomes.entries()) {
      await test.step(`résultat annonceur ${index + 1}/${participantCount}: ${outcome.status}${outcome.score == null ? "" : ` ${outcome.score}`}`, async () => {
        if (outcome.status === "scored") {
          await scoreNextAnnouncerRun(
            showScorePage,
            String(outcome.score).replace(".", ","),
            index === 0
              ? async () => {
                  await assertPublicDisplayRun(publicDisplays!, displayRuns[index]);
                  await attachPublicDisplayScreenshots(testInfo, publicDisplays!, "cavalier-en-piste");
                }
              : undefined,
          );
        } else {
          await completeNextAnnouncerRunWithStatus(showScorePage, outcome.status);
        }
        await expect.poll(async () => {
          const { data, error } = await admin
            .from("show_score_announcer_live_sessions")
            .select("runs")
            .eq("class_id", crossAppFixture!.blockId)
            .single<{ runs: Array<Record<string, unknown>> }>();
          if (error) throw error;
          return data.runs.filter((run) => ["scored", "no_score", "scratch"].includes(String(run.status))).length;
        }).toBe(index + 1);
        if (index === 0) {
          await assertPublicDisplayResult(publicDisplays!, displayRuns[index], String(outcome.score));
          await attachPublicDisplayScreenshots(testInfo, publicDisplays!, "premier-score");
        } else if (outcome.status === "no_score") {
          await assertPublicDisplayResult(publicDisplays!, displayRuns[index], "NS");
          await attachPublicDisplayScreenshots(testInfo, publicDisplays!, "no-score");
        } else if (outcome.status === "scratch") {
          await assertPublicDisplayResult(publicDisplays!, displayRuns[index], "SCR");
          await attachPublicDisplayScreenshots(testInfo, publicDisplays!, "scratch");
        }
      });
    }
    const completeBlock = showScorePage.getByRole("button", { name: "Marquer le bloc terminé", exact: true });
    if (!(await completeBlock.isVisible())) {
      await announcerClassHeader.click();
    }
    await completeBlock.click();

    await expect.poll(async () => {
      const { data, error } = await admin
        .from("show_score_announcer_live_sessions")
        .select("completed_at,runs")
        .eq("class_id", crossAppFixture!.blockId)
        .single<{ completed_at: string | null; runs: Array<Record<string, unknown>> }>();
      if (error) throw error;
      return {
        completed: Boolean(data.completed_at),
        outcomes: data.runs
          .map((run) => ({
            score: run.status === "scored" ? parseShowScoreScore(run.scoreTotal) : null,
            status: String(run.status),
          }))
          .sort(compareOutcomes),
      };
    }).toEqual({ completed: true, outcomes: [...announcerOutcomes].sort(compareOutcomes) });

    await assertPublicDisplaysRemainOpen(publicDisplays);
    await attachPublicDisplayScreenshots(testInfo, publicDisplays, "bloc-termine");
  });

  await test.step("approbation, publication et retour automatique des résultats dans HSP", async () => {
    if (!crossAppFixture || !showScoreContext) throw new Error("Session ShowScore absente.");
    const config = readE2EConfig();
    const showScorePage = showScoreContext.pages()[0];
    await showScorePage.goto(`${config.showScoreUrl}/associations/${state.organizationId}/shows/${crossAppFixture.showId}/secretariat?day=${crossAppFixture.showDayId}`);
    await expect(showScorePage.locator("body")).toContainText(blockName);
    await verifyShowScoreDayTabs(showScorePage, crossAppFixture, blockName);
    const resultRow = showScorePage.getByRole("row").filter({ hasText: blockName });
    await resultRow.getByRole("button", { name: "Approuver résultats annonceur", exact: true }).click();
    await expect(resultRow).toContainText("Résultats annonceur validés");
    await resultRow.getByRole("button", { name: "Publier résultats", exact: true }).click();
    await expect(resultRow).toContainText(/Publiés · 1 classe/);

    const admin = createE2EAdminClient();
    await expect.poll(async () => {
      const { data, error } = await admin
        .from("scored_runs")
        .select("run_id,final_score,status")
        .eq("show_id", crossAppFixture!.showId);
      if (error) throw error;
      return (data ?? [])
        .map((run) => ({ score: run.final_score == null ? null : Number(run.final_score), status: String(run.status) }))
        .sort(compareOutcomes);
    }).toEqual([...announcerOutcomes].sort(compareOutcomes));
    await expect.poll(async () => {
      const { data, error } = await admin
        .from("entry_results")
        .select("entry_id,final_score,status")
        .in("entry_id", crossAppFixture!.entryIds);
      if (error) throw error;
      return (data ?? [])
        .map((result) => ({ score: result.final_score == null ? null : Number(result.final_score), status: String(result.status) }))
        .sort(compareOutcomes);
    }).toEqual([...announcerOutcomes].sort(compareOutcomes));
  });

  await test.step("ajout des résultats ShowScore au championnat AQR", async () => {
    if (!crossAppFixture || !showScoreContext) throw new Error("Session ShowScore absente.");
    const config = readE2EConfig();
    const showScorePage = showScoreContext.pages()[0];
    await showScorePage.goto(`${config.showScoreUrl}/associations/${state.organizationId}/championship`);
    await showScorePage.getByRole("button", { name: "Modifier", exact: true }).click();
    await showScorePage.getByLabel("Titre", { exact: true }).fill(`[E2E] Championnat ${state.runId}`);
    await showScorePage.getByRole("button", { name: "Terminer", exact: true }).click();
    await showScorePage
      .getByRole("button")
      .filter({ hasText: "Importer depuis ShowScore" })
      .click();
    await showScorePage.getByRole("button", { name: "Analyser les résultats ShowScore", exact: true }).click();
    await expect(showScorePage.locator("body")).toContainText(`${participantCount} inscrits · ${announcerScores.length} résultats scorés`);
    await expect(showScorePage.locator("body")).toContainText(/Code import 1100 → championnat 1100/);
    await expect(showScorePage.locator("body")).toContainText(`1 classes sélectionnées · ${announcerScores.length} lignes actives · 0 lignes ignorées`);
    await showScorePage.getByRole("button", { name: "Ajouter au championnat", exact: true }).click();
    await expect(showScorePage.locator("body")).toContainText(new RegExp(`${rankedTeamCount}\\s*Équipes`));
    await showScorePage.getByRole("button", { name: "Publier provisoire", exact: true }).click();
    await expect(showScorePage.locator("body")).toContainText("Championnat enregistré.");

    const admin = createE2EAdminClient();
    const { data: season, error: seasonError } = await admin
      .from("show_score_public_championship_seasons")
      .select("status,public_payload")
      .eq("organization_id", state.organizationId)
      .single<{ status: string; public_payload: Record<string, unknown> }>();
    if (seasonError) throw seasonError;
    expect(season.status).toBe("published");
    expect(JSON.stringify(season.public_payload)).toContain(FULL_CLASS_CONFIG.classCode);

    await showScorePage.goto(`${config.showScoreUrl}/public/associations/${state.organizationId}/championnat`);
    await expect(showScorePage.locator("body")).toContainText("Open");
    const publicClassCard = showScorePage.locator("article").filter({ hasText: "Omnium NRHA (Open)" });
    await publicClassCard.getByRole("button").first().click();
    for (const participantName of championshipParticipantNames) {
      await expect(publicClassCard).toContainText(participantName);
    }
  });

  await test.step("calcul, révision et publication des payouts dans HSP", async () => {
    if (!crossAppFixture) throw new Error("Résultats HSP absents.");
    await page.reload();
    await expect(page.getByRole("button", { name: "Déconnexion" })).toBeVisible();
    await navigateTo(page, "results");
    await expect(page.getByRole("heading", { name: "Résultats officiels et bourses", exact: true })).toBeVisible();

    const resultBlock = page.locator(".results-block").filter({ hasText: blockName });
    await resultBlock.locator(".results-block-header").click();
    const resultClass = resultBlock.locator(".results-classRecord").filter({ has: page.getByRole("heading", { name: FULL_CLASS_CONFIG.className, exact: true }) });
    await resultClass.getByTitle("Ouvrir").click();
    await expect(resultClass.locator(".results-worksheet")).toContainText(moneyPattern(expectedPayout.grossEntryFees));
    await expect(resultClass.locator(".results-worksheet")).toContainText(moneyPattern(expectedPayout.baseAfterTrophy));
    await expect(resultClass.locator(".results-worksheet")).toContainText(moneyPattern(expectedPayout.sanctioningFeeAmount));
    await expect(resultClass.locator(".results-worksheet")).toContainText(moneyPattern(expectedPayout.retainageAmount));
    await expect(resultClass.locator(".results-worksheet")).toContainText(moneyPattern(expectedPayout.netPurse));
    if (announcerOutcomes.some((outcome) => outcome.status === "no_score")) {
      await expect(resultClass.locator(".results-table")).toContainText("No score");
    }
    if (announcerOutcomes.some((outcome) => outcome.status === "scratch")) {
      await expect(resultClass.locator(".results-table")).toContainText("Scratch");
    }
    for (const award of expectedAwards) {
      await expect(resultClass.locator(".results-table")).toContainText(moneyPattern(award));
    }

    await resultClass.getByRole("button", { name: "Recalculer", exact: true }).click();
    await expect(resultClass).toContainText("Draft");
    await resultClass.getByRole("button", { name: "Marquer révisé", exact: true }).click();
    await expect(resultClass).toContainText("Révisé");
    await resultClass.getByRole("button", { name: "Publier", exact: true }).click();
    await expect(resultClass).toContainText("Publié");

    const admin = createE2EAdminClient();
    const { data: calculation, error: calculationError } = await admin
      .from("payout_calculations")
      .select("*")
      .eq("class_id", crossAppFixture.classId)
      .eq("status", "published")
      .single<Record<string, unknown>>();
    if (calculationError) throw calculationError;
    expectMoney(calculation.gross_entry_fees, expectedPayout.grossEntryFees);
    expectMoney(calculation.trophy_or_plaque_fee, expectedPayout.trophyFee);
    expectMoney(calculation.base_after_trophy_fee, expectedPayout.baseAfterTrophy);
    expectMoney(calculation.nrha_fee_amount, expectedPayout.sanctioningFeeAmount);
    expectMoney(calculation.net_entry_fee, expectedPayout.netEntryFee);
    expectMoney(calculation.retainage_amount, expectedPayout.retainageAmount);
    expectMoney(calculation.final_net_entry_fee, expectedPayout.finalNetEntryFee);
    expectMoney(calculation.added_money, expectedPayout.addedMoney);
    expectMoney(calculation.net_purse, expectedPayout.netPurse);

    const { data: awards, error: awardsError } = await admin
      .from("payout_awards")
      .select("amount,percentage,rank")
      .eq("calculation_id", String(calculation.id));
    if (awardsError) throw awardsError;
    const sortedAwards = (awards ?? []).sort((a, b) => a.rank - b.rank);
    expect(sortedAwards.map((award) => Number(award.amount))).toEqual(expectedAwards);
    expect(sortedAwards.map((award) => award.rank)).toEqual(expectedAwards.map(() => 1));

    await page.goto(`/shows/${state.showSlug}`);
    await expect(page.getByRole("heading", { name: state.showName, exact: true })).toBeVisible();
    await expect(page.locator("body")).toContainText(moneyPattern(expectedPayout.netPurse));
    for (const award of expectedAwards) {
      await expect(page.locator("body")).toContainText(moneyPattern(award));
    }
  });

  await publicDisplays?.context.close();
  await showScoreContext?.close();

  expect(browserErrors, `Erreurs JavaScript du navigateur:\n${browserErrors.join("\n")}`).toEqual([]);
});

async function navigateTo(page: Page, view: string) {
  await page.locator(`#primary-navigation [data-view="${view}"]`).click();
  await expect(page.locator(`#primary-navigation [data-view="${view}"]`)).toHaveClass(/active/);
}

async function selectSearchOption(locator: Locator, value: string) {
  await locator.fill(value);
  await locator.press("Enter");
}

async function scoreNextAnnouncerRun(page: Page, score: string, onRunStarted?: () => Promise<void>) {
  const enterResult = page.getByRole("button", { name: "Entrer le résultat", exact: true });
  if (!(await enterResult.isVisible())) {
    await page.getByRole("button", { name: "Démarrer prochain", exact: true }).click();
    await expect(enterResult).toBeVisible();
  }
  await onRunStarted?.();
  await enterResult.click();
  const scoreInput = page.getByLabel("Juge E2E", { exact: true });
  await scoreInput.fill(score);
  await page.getByRole("button", { name: "Enregistrer le score", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

async function openPublicDisplays({
  browser,
  browserErrors,
  showScoreUrl,
  showScoreVercelProtectionBypass,
  organizationId,
  showId,
  showName,
  tvDisplayCodes,
}: {
  browser: Browser;
  browserErrors: string[];
  showScoreUrl: string;
  showScoreVercelProtectionBypass: string;
  organizationId: string;
  showId: string;
  showName: string;
  tvDisplayCodes: TvDisplayCodes;
}): Promise<PublicDisplays> {
  const context = await browser.newContext({
    extraHTTPHeaders: showScoreVercelProtectionBypass
      ? {
          "x-vercel-protection-bypass": showScoreVercelProtectionBypass,
          "x-vercel-set-bypass-cookie": "true",
        }
      : undefined,
    locale: "fr-CA",
    timezoneId: "America/Toronto",
    viewport: { width: 1920, height: 1080 },
  });
  await context.addInitScript(() => localStorage.setItem("showscore.language", "fr"));
  const [generalTvPage, arenaTvPage, competitionTvPage, livestreamTvPage, overlayPage] = await Promise.all([
    context.newPage(),
    context.newPage(),
    context.newPage(),
    context.newPage(),
    context.newPage(),
  ]);
  observePublicDisplayErrors(generalTvPage, "TV générale", browserErrors);
  observePublicDisplayErrors(arenaTvPage, "TV manège", browserErrors);
  observePublicDisplayErrors(competitionTvPage, "TV compétition", browserErrors);
  observePublicDisplayErrors(livestreamTvPage, "TV livestream", browserErrors);
  observePublicDisplayErrors(overlayPage, "OBS", browserErrors);

  const arena = new URLSearchParams({ arena: "Arène E2E" }).toString();
  const publicPath = `/public/associations/${organizationId}/shows/${showId}`;
  await Promise.all([
    generalTvPage.goto(`${showScoreUrl}/tv/${tvDisplayCodes.general}`),
    arenaTvPage.goto(`${showScoreUrl}${publicPath}/tv?${arena}`),
    competitionTvPage.goto(`${showScoreUrl}/tv/${tvDisplayCodes.competition}`),
    livestreamTvPage.goto(`${showScoreUrl}/tv/${tvDisplayCodes.livestream}`),
    overlayPage.goto(`${showScoreUrl}${publicPath}/overlay?${arena}`),
  ]);

  await expect(generalTvPage).toHaveURL(new RegExp(`${publicPath}/tv$`));
  await expect(arenaTvPage).toHaveURL(new RegExp(`${publicPath}/tv\\?`));
  await expect(competitionTvPage).toHaveURL(new RegExp(`${publicPath}/tv\\?`));
  await expect(livestreamTvPage).toHaveURL(new RegExp(`${publicPath}/livestream/tv$`));
  await expect(overlayPage).toHaveURL(new RegExp(`${publicPath}/overlay\\?`));
  expect(new URL(arenaTvPage.url()).searchParams.get("arena")).toBe("Arène E2E");
  expect(new URL(competitionTvPage.url()).searchParams.get("mode")).toBe("competition");
  expect(new URL(competitionTvPage.url()).searchParams.get("arena")).toBe("Arène E2E");
  await expect(generalTvPage.locator("[data-tv-display-mode]")).toBeVisible();
  await expect(arenaTvPage.locator("[data-tv-display-mode]")).toBeVisible();
  await expect(competitionTvPage.locator('[data-tv-display-mode="competition-video"]')).toBeVisible();
  await expect(competitionTvPage.locator('[data-tv-layout="competition-video"]')).toBeVisible();
  await expect(livestreamTvPage.locator("[data-livestream-tv-page]")).toBeVisible();
  await expect(livestreamTvPage.locator("[data-livestream-tv-waiting]")).toBeVisible();
  await expect(overlayPage.locator("[data-overlay-layout]")).toBeVisible();
  await expect(overlayPage.locator("[data-overlay-bottom-bar]")).toBeVisible();
  for (const displayPage of [generalTvPage, arenaTvPage, competitionTvPage, livestreamTvPage, overlayPage]) {
    await expect(displayPage.locator("body")).toContainText(showName);
  }

  const competitionVideo = competitionTvPage.locator("[data-tv-competition-video]");
  await expect(competitionVideo).toHaveAttribute("src", /tv-display-media/);
  await expect.poll(
    () => competitionVideo.evaluate((video: HTMLVideoElement) => video.readyState),
    { timeout: 35_000 },
  ).toBeGreaterThanOrEqual(1);
  expect(
    await competitionVideo.evaluate((video: HTMLVideoElement) => ({
      error: video.error?.code ?? null,
      height: video.videoHeight,
      width: video.videoWidth,
    })),
  ).toEqual({ error: null, height: 8, width: 8 });

  for (const displayPage of [generalTvPage, arenaTvPage, competitionTvPage, livestreamTvPage, overlayPage]) {
    expect(await displayPage.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth }))).toEqual({
      height: 1080,
      width: 1920,
    });
    expect(displayPage.url()).not.toContain("/login");
    expect(
      await displayPage.evaluate(() =>
        Object.keys(localStorage).filter((key) => /^sb-.*-auth-token$/i.test(key)),
      ),
    ).toEqual([]);
  }

  expect(
    await overlayPage.locator("[data-overlay-layout]").evaluate((element) => {
      const style = getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage };
    }),
  ).toEqual({ backgroundColor: "rgba(0, 0, 0, 0)", backgroundImage: "none" });

  const sentinel = crypto.randomUUID();
  await Promise.all(
    [generalTvPage, arenaTvPage, competitionTvPage, livestreamTvPage, overlayPage].map((displayPage) =>
      displayPage.evaluate((value) => Reflect.set(window, "__e2ePublicDisplaySentinel", value), sentinel),
    ),
  );

  return { arenaTvPage, competitionTvPage, context, generalTvPage, livestreamTvPage, overlayPage, sentinel };
}

function observePublicDisplayErrors(page: Page, display: string, browserErrors: string[]) {
  page.on("pageerror", (error) => browserErrors.push(`ShowScore ${display}: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`ShowScore ${display}: ${message.text()}`);
  });
}

async function assertPublicDisplayRun(displays: PublicDisplays, run: DisplayRun) {
  await Promise.all([
    ...liveTvPages(displays).flatMap((displayPage) => [
      expect(displayPage.locator("body")).toContainText(run.rider, { timeout: 35_000 }),
      expect(displayPage.locator("body")).toContainText(run.horse, { timeout: 35_000 }),
    ]),
    expect(displays.overlayPage.locator("body")).toContainText(run.rider, { timeout: 35_000 }),
    expect(displays.overlayPage.locator("body")).toContainText(run.horse, { timeout: 35_000 }),
  ]);
  await assertPublicDisplaysRemainOpen(displays);
}

async function assertPublicDisplayResult(displays: PublicDisplays, run: DisplayRun, result: string) {
  await Promise.all([
    ...liveTvPages(displays).flatMap((displayPage) => [
      expect(displayPage.locator("body")).toContainText(run.rider, { timeout: 35_000 }),
      expect(displayPage.locator("body")).toContainText(result, { timeout: 35_000 }),
    ]),
    expect(displays.overlayPage.locator("body")).toContainText(run.rider, { timeout: 35_000 }),
    expect(displays.overlayPage.locator("body")).toContainText(result, { timeout: 35_000 }),
  ]);
  await assertPublicDisplaysRemainOpen(displays);
}

async function assertPublicDisplaysRemainOpen(displays: PublicDisplays) {
  await expect(displays.generalTvPage.locator("[data-tv-display-mode]")).toBeVisible();
  await expect(displays.arenaTvPage.locator("[data-tv-display-mode]")).toBeVisible();
  await expect(displays.competitionTvPage.locator('[data-tv-display-mode="competition-video"]')).toBeVisible();
  await expect(displays.livestreamTvPage.locator("[data-livestream-tv-page]")).toBeVisible();
  await expect(displays.overlayPage.locator("[data-overlay-layout]")).toBeVisible();
  for (const displayPage of allPublicDisplayPages(displays)) {
    expect(await displayPage.evaluate(() => Reflect.get(window, "__e2ePublicDisplaySentinel"))).toBe(displays.sentinel);
  }
}

async function attachPublicDisplayScreenshots(testInfo: TestInfo, displays: PublicDisplays, label: string) {
  const [generalTv, arenaTv, competitionTv, livestreamTv, overlayScreenshot] = await Promise.all([
    displays.generalTvPage.screenshot(),
    displays.arenaTvPage.screenshot(),
    displays.competitionTvPage.screenshot(),
    displays.livestreamTvPage.screenshot(),
    displays.overlayPage.screenshot({ omitBackground: true }),
  ]);
  await Promise.all([
    testInfo.attach(`TV générale 1920x1080 — ${label}`, { body: generalTv, contentType: "image/png" }),
    testInfo.attach(`TV manège 1920x1080 — ${label}`, { body: arenaTv, contentType: "image/png" }),
    testInfo.attach(`TV compétition 1920x1080 — ${label}`, { body: competitionTv, contentType: "image/png" }),
    testInfo.attach(`TV livestream 1920x1080 — ${label}`, { body: livestreamTv, contentType: "image/png" }),
    testInfo.attach(`OBS transparent 1920x1080 — ${label}`, { body: overlayScreenshot, contentType: "image/png" }),
  ]);
}

function liveTvPages(displays: PublicDisplays) {
  return [displays.generalTvPage, displays.arenaTvPage, displays.competitionTvPage];
}

function allPublicDisplayPages(displays: PublicDisplays) {
  return [...liveTvPages(displays), displays.livestreamTvPage, displays.overlayPage];
}

async function configureShowScoreTvViews(page: Page): Promise<TvDisplayCodes> {
  await page.getByRole("button", { name: "Réglages Live / Vue en direct", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const livestreamPublic = dialog.getByRole("checkbox", {
    name: "Publier la page Livestream du show",
    exact: true,
  });
  if (!(await livestreamPublic.isChecked())) await livestreamPublic.check();
  await dialog.locator('input[aria-label^="Lien du livestream pour le"]').first().fill(
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  );

  const competitionSettings = dialog.locator('[data-tv-settings="competition"]');
  await competitionSettings.locator('input[type="text"]').fill("Arène E2E");
  await competitionSettings.locator('input[type="file"]').setInputFiles({
    name: "e2e-competition-arena.mp4",
    mimeType: "video/mp4",
    buffer: Buffer.from(TINY_MP4_BASE64, "base64"),
  });
  await expect(competitionSettings).toContainText("e2e-competition-arena.mp4");

  await dialog.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(competitionSettings).toContainText("Vidéo actuelle", { timeout: 60_000 });
  await expect(competitionSettings).toContainText("e2e-competition-arena.mp4");

  const codes = {
    general: await readTvDisplayCode(dialog.locator("[data-tv-short-code]")),
    competition: await readTvDisplayCode(dialog.locator("[data-tv-competition-short-code]")),
    livestream: await readTvDisplayCode(dialog.locator("[data-tv-livestream-short-code]")),
  };
  await dialog.getByRole("button", { name: "Annuler", exact: true }).last().click();
  await expect(dialog).toBeHidden();
  return codes;
}

async function configureShowScorePaidWarmup({
  page,
  organizationId,
  showId,
  showDayId,
  showScoreUrl,
  warmupName,
}: {
  page: Page;
  organizationId: string;
  showId: string;
  showDayId: string;
  showScoreUrl: string;
  warmupName: string;
}) {
  await page.getByRole("button", { name: "+ Ajouter un paid warm up", exact: true }).click();
  await expect(page).toHaveURL(/\/paid-warmups\/[^/]+\/setup$/);
  const warmupId = new URL(page.url()).pathname.match(/\/paid-warmups\/([^/]+)\/setup$/)?.[1] ?? "";
  expect(warmupId).not.toBe("");

  const settings = page.getByRole("heading", { name: "Réglages", exact: true }).locator("..");
  await settings.locator("label").filter({ hasText: /^Nom$/ }).locator("..").locator("input").fill(warmupName);
  await settings.locator("label").filter({ hasText: /^Manège \/ arena$/ }).locator("..").locator("input").fill("Arène E2E");
  await settings.locator("label").filter({ hasText: /^Temps par cavalier$/ }).locator("..").locator("input").fill("5");
  const publicLive = page.getByRole("checkbox", { name: "Autoriser le live public pour ce paid warm up", exact: true });
  if (!(await publicLive.isChecked())) await publicLive.check();
  await page.locator("textarea").fill("1\tCavalière Chrono E2E");
  await page.getByRole("button", { name: "Importer dans cet ordre", exact: true }).click();
  await expect(page.locator("body")).toContainText("1 cavalier(s) importé(s) dans l’ordre fourni.");

  const admin = createE2EAdminClient();
  await expect.poll(async () => {
    const { data, error } = await admin
      .from("show_score_paid_warmups")
      .select("name,arena,duration_minutes_per_rider,is_public_live,entries")
      .eq("id", warmupId)
      .single<{
        arena: string;
        duration_minutes_per_rider: number;
        entries: Array<Record<string, unknown>>;
        is_public_live: boolean;
        name: string;
      }>();
    if (error) throw error;
    return {
      arena: data.arena,
      duration: Number(data.duration_minutes_per_rider),
      isPublic: data.is_public_live,
      name: data.name,
      riders: data.entries.map((entry) => String(entry.rider ?? "")),
    };
  }).toEqual({
    arena: "Arène E2E",
    duration: 5,
    isPublic: true,
    name: warmupName,
    riders: ["Cavalière Chrono E2E"],
  });

  await page.goto(`${showScoreUrl}/associations/${organizationId}/shows/${showId}?day=${showDayId}`);
  await expect(page.locator("body")).toContainText(warmupName);
  return warmupId;
}

async function testShowScorePaidWarmupTimer({
  displays,
  organizationId,
  page,
  showDayId,
  showId,
  showScoreUrl,
  testInfo,
  warmupId,
  warmupName,
}: {
  displays: PublicDisplays;
  organizationId: string;
  page: Page;
  showDayId: string;
  showId: string;
  showScoreUrl: string;
  testInfo: TestInfo;
  warmupId: string;
  warmupName: string;
}) {
  await page.goto(`${showScoreUrl}/associations/${organizationId}/shows/${showId}/announcer?day=${showDayId}`);
  const warmupCard = page.locator(`[data-announcer-warmup-id="${warmupId}"]`);
  await expect(warmupCard).toContainText(warmupName);
  await warmupCard.getByRole("button", { name: "Démarrer en piste", exact: true }).click();

  const admin = createE2EAdminClient();
  await expect.poll(async () => {
    const { data, error } = await admin
      .from("show_score_paid_warmups")
      .select("active_started_at,is_public_live")
      .eq("id", warmupId)
      .single<{ active_started_at: string | null; is_public_live: boolean }>();
    if (error) throw error;
    return { running: Boolean(data.active_started_at), visible: data.is_public_live };
  }).toEqual({ running: true, visible: true });

  const tvTimers = [
    displays.generalTvPage.locator("[data-tv-warmup-timer]"),
    displays.competitionTvPage.locator("[data-tv-warmup-timer]"),
  ];
  for (const timer of tvTimers) {
    await expect(timer).toBeVisible({ timeout: 45_000 });
    await expect(timer).toHaveAttribute("data-tv-warmup-timer-kind", "rider");
    await expect(timer).toContainText(/\d+:\d{2}/);
  }
  await expect(displays.generalTvPage.locator("body")).toContainText("Cavalière Chrono E2E");
  await expect(displays.competitionTvPage.locator("body")).toContainText("Cavalière Chrono E2E");

  const firstRemaining = Number(await tvTimers[0].getAttribute("data-tv-warmup-remaining-seconds"));
  expect(firstRemaining).toBeGreaterThan(0);
  await expect.poll(async () => Number(await tvTimers[0].getAttribute("data-tv-warmup-remaining-seconds"))).toBeLessThan(firstRemaining);
  await assertPublicDisplaysRemainOpen(displays);
  await attachPublicDisplayScreenshots(testInfo, displays, "warm-up-chrono-en-cours");

  await warmupCard.getByRole("button", { name: "Arrêter et marquer passé", exact: true }).click();
  await expect.poll(async () => {
    const { data, error } = await admin
      .from("show_score_paid_warmups")
      .select("active_started_at,is_public_live,entries")
      .eq("id", warmupId)
      .single<{
        active_started_at: string | null;
        entries: Array<Record<string, unknown>>;
        is_public_live: boolean;
      }>();
    if (error) throw error;
    return {
      activeStartedAt: data.active_started_at,
      isPublic: data.is_public_live,
      statuses: data.entries.map((entry) => String(entry.status ?? "")),
    };
  }).toEqual({ activeStartedAt: null, isPublic: false, statuses: ["done"] });

  for (const timer of tvTimers) await expect(timer).toBeHidden({ timeout: 45_000 });
}

async function readTvDisplayCode(locator: Locator) {
  await expect(locator).toBeVisible();
  const code = String(await locator.getAttribute("data-tv-short-code")
    ?? await locator.getAttribute("data-tv-competition-short-code")
    ?? await locator.getAttribute("data-tv-livestream-short-code")
    ?? "").trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  return code;
}

async function completeNextAnnouncerRunWithStatus(page: Page, status: "no_score" | "scratch") {
  const buttonName = status === "no_score" ? "No score" : "Scratch";
  const confirmation = new Promise<void>((resolve, reject) => {
    page.once("dialog", (dialog) => {
      dialog.accept().then(resolve, reject);
    });
  });
  await page.getByRole("button", { name: buttonName, exact: true }).first().click();
  await confirmation;
}

function pastDateTimeLocal() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return `${date.toISOString().slice(0, 10)}T18:00`;
}

function expectMoney(actual: unknown, expected: number) {
  expect(Number(actual)).toBeCloseTo(expected, 2);
}

function buildAnnouncerOutcomes(participantCount: number): AnnouncerOutcome[] {
  let scoredIndex = 0;

  return Array.from({ length: participantCount }, (_, index) => {
    if (participantCount >= 5 && index === participantCount - 2) return { score: null, status: "scratch" };
    if (participantCount >= 3 && index === participantCount - (participantCount >= 5 ? 3 : 2)) {
      return { score: null, status: "no_score" };
    }
    const score = scoredIndex < 2 ? 80 : 80 - scoredIndex * 0.5;
    scoredIndex += 1;
    return { score, status: "scored" };
  });
}

function buildExpectedAwards(netPurse: number, participantCount: number) {
  const percentages = FULL_CLASS_CONFIG.payoutPercentages.split(",").map((value) => Number(value.trim()));
  if (participantCount === 1) return [money(netPurse * (percentages[0] / 100))];
  const tiedPercentage = percentages.reduce((total, percentage) => total + percentage, 0) / 2;
  return [money(netPurse * (tiedPercentage / 100)), money(netPurse * (tiedPercentage / 100))];
}

function compareOutcomes(
  first: { score: number | null; status: string },
  second: { score: number | null; status: string },
) {
  return first.status.localeCompare(second.status) || (second.score ?? Number.NEGATIVE_INFINITY) - (first.score ?? Number.NEGATIVE_INFINITY);
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseShowScoreScore(value: unknown) {
  const normalized = String(value ?? "").trim().replace("½", ".5").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`Score ShowScore invalide: ${value}`);
  return parsed;
}

function moneyPattern(amount: number) {
  const [integer, decimal] = amount.toFixed(2).split(".");
  const groups: string[] = [];
  for (let end = integer.length; end > 0; end -= 3) {
    groups.unshift(integer.slice(Math.max(0, end - 3), end));
  }
  return new RegExp(`${groups.join("[\\s\\u00a0\\u202f,.]?")}[,.]${decimal}`);
}

async function verifyShowScoreDayTabs(
  page: Page,
  fixture: CrossAppFixture,
  expectedActiveText?: string,
) {
  const otherDayId = fixture.showDayIds.find((dayId) => dayId !== fixture.showDayId);
  if (!otherDayId) throw new Error("Une deuxième journée ShowScore est requise.");

  const dayNavigation = page.getByRole("navigation", {
    name: "Changer de journée du show",
    exact: true,
  });
  await expect(dayNavigation).toBeVisible();
  const tabList = dayNavigation.getByRole("tablist");
  await expect(tabList).toBeVisible();
  await expect(tabList.getByRole("tab")).toHaveCount(fixture.showDayIds.length);

  const activeTab = tabList.locator(`[data-show-day-tab="${fixture.showDayId}"]`);
  const otherTab = tabList.locator(`[data-show-day-tab="${otherDayId}"]`);
  await expect(activeTab).toHaveAttribute("aria-selected", "true");

  const sentinel = crypto.randomUUID();
  await page.evaluate((value) => Reflect.set(window, "__e2eShowDayTabSentinel", value), sentinel);
  await otherTab.click();
  await expect(otherTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(new RegExp(`[?&]day=${otherDayId}`));
  expect(await page.evaluate(() => Reflect.get(window, "__e2eShowDayTabSentinel"))).toBe(sentinel);
  if (expectedActiveText) {
    await expect(page.locator("body")).not.toContainText(expectedActiveText);
  }

  await activeTab.click();
  await expect(activeTab).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(new RegExp(`[?&]day=${fixture.showDayId}`));
  expect(await page.evaluate(() => Reflect.get(window, "__e2eShowDayTabSentinel"))).toBe(sentinel);
  if (expectedActiveText) {
    await expect(page.locator("body")).toContainText(expectedActiveText);
  }
}

function waitForContactCreateResponse(page: Page) {
  return page.waitForResponse((response) =>
    response.request().method() === "POST" && /\/rest\/v1\/contacts(?:\?|$)/.test(response.url()),
  );
}
