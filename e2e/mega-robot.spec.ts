import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { createE2EAdminClient } from "./support/admin";
import {
  EXPECTED_PAYOUT,
  FULL_CLASS_CONFIG,
  assertFullClassConfiguration,
  createCrossAppEntries,
  type CrossAppFixture,
} from "./support/cross-app-fixture";
import { buildContactScenarios, futureDate } from "./support/data-factory";
import { readE2EConfig } from "./support/environment";
import { readRunState } from "./support/run-state";

// A retry would reuse the same disposable organization before global teardown
// and collide with the show, contacts and entries created by the first attempt.
test.describe.configure({ retries: 0 });

test("le méga robot complète un vrai parcours de préproduction", async ({ browser, page }) => {
  test.slow();
  const state = readRunState();
  const blockName = `[E2E] Bloc annonceur — ${state.runId}`;
  let crossAppFixture: CrossAppFixture | null = null;
  const browserErrors: string[] = [];
  let showScoreContext: BrowserContext | null = null;
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
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
        const contactResponsePromise = page.waitForResponse((response) =>
          response.request().method() === "POST" && /\/rest\/v1\/contacts(?:\?|$)/.test(response.url()),
        );
        await form.getByRole("button", { name: "Créer le contact", exact: true }).click();
        const contactResponse = await contactResponsePromise;
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
    await payoutFields.getByText("Configurer les bourses / payouts", { exact: true }).click();
    await payoutFields.getByRole("combobox", { name: "Type de paiement", exact: true }).selectOption("house_custom");
    await payoutFields.getByRole("spinbutton", { name: "Added money", exact: true }).fill(String(FULL_CLASS_CONFIG.addedMoney));
    await payoutFields.getByRole("spinbutton", { name: "Trophée / plaque", exact: true }).fill(String(FULL_CLASS_CONFIG.trophyFee));
    await payoutFields.getByRole("spinbutton", { name: /^Retenue personnalisée/ }).fill(String(FULL_CLASS_CONFIG.retainagePercent));
    await payoutFields.getByRole("spinbutton", { name: /^Frais d'organisme/ }).fill(String(FULL_CLASS_CONFIG.sanctioningFeePercent));
    const payoutRow = payoutFields.locator(".payout-rule-row").nth(1);
    await payoutRow.locator("input").nth(0).fill("1");
    await payoutRow.locator("input").nth(1).fill("5");
    await payoutRow.locator("input").nth(2).fill(FULL_CLASS_CONFIG.payoutPercentages);
    await payoutFields.getByRole("spinbutton", { name: "Aperçu avec", exact: true }).fill("2");
    await expect(payoutFields.locator(".payout-preview")).toContainText(/Bourse:\s*330[,.]85/);
    await payoutFields.getByRole("textbox", { name: "Notes de paiement", exact: true }).fill(FULL_CLASS_CONFIG.payoutNotes);
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
    await expect(scoringGroup).toContainText("2");
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
    expect(setup.runs).toHaveLength(2);
    expect(setup.block_classes).toEqual(expect.arrayContaining([expect.objectContaining({ code: FULL_CLASS_CONFIG.classCode })]));
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

    await showScorePage.goto(`${config.showScoreUrl}/associations/${state.organizationId}/classes/${crossAppFixture.blockId}/setup`);
    const liveSource = showScorePage.getByLabel("Source des données live", { exact: true });
    showScorePage.once("dialog", (dialog) => dialog.accept());
    await liveSource.selectOption("announcer");
    await expect(liveSource).toHaveValue("announcer");

    await showScorePage.goto(`${config.showScoreUrl}/associations/${state.organizationId}/shows/${crossAppFixture.showId}/announcer`);
    await expect(showScorePage.locator("body")).toContainText("Contrôle live par l’annonceur");
    await scoreNextAnnouncerRun(showScorePage, "72,5");
    await scoreNextAnnouncerRun(showScorePage, "70");
    await showScorePage.getByRole("button", { name: "Marquer le bloc terminé", exact: true }).click();
    await expect(showScorePage.locator("body")).toContainText("Bloc terminé par l’annonceur");

    const admin = createE2EAdminClient();
    await expect.poll(async () => {
      const { data, error } = await admin
        .from("show_score_announcer_live_sessions")
        .select("completed_at,runs")
        .eq("class_id", crossAppFixture!.blockId)
        .single<{ completed_at: string | null; runs: Array<Record<string, unknown>> }>();
      if (error) throw error;
      return {
        completed: Boolean(data.completed_at),
        scores: data.runs.map((run) => String(run.scoreTotal ?? "")).sort(),
      };
    }).toEqual({ completed: true, scores: ["70", "72½"] });
  });

  await test.step("approbation, publication et retour automatique des résultats dans HSP", async () => {
    if (!crossAppFixture || !showScoreContext) throw new Error("Session ShowScore absente.");
    const config = readE2EConfig();
    const showScorePage = showScoreContext.pages()[0];
    await showScorePage.goto(`${config.showScoreUrl}/associations/${state.organizationId}/shows/${crossAppFixture.showId}/secretariat`);
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
      return (data ?? []).map((run) => ({ score: Number(run.final_score), status: run.status })).sort((a, b) => b.score - a.score);
    }).toEqual([
      { score: 72.5, status: "scored" },
      { score: 70, status: "scored" },
    ]);
    await expect.poll(async () => {
      const { data, error } = await admin
        .from("entry_results")
        .select("entry_id,final_score,status")
        .in("entry_id", crossAppFixture!.entryIds);
      if (error) throw error;
      return (data ?? []).map((result) => Number(result.final_score)).sort((a, b) => b - a);
    }).toEqual([72.5, 70]);
  });

  await test.step("ajout des résultats ShowScore au championnat AQR", async () => {
    if (!crossAppFixture || !showScoreContext) throw new Error("Session ShowScore absente.");
    const config = readE2EConfig();
    const showScorePage = showScoreContext.pages()[0];
    await showScorePage.goto(`${config.showScoreUrl}/associations/${state.organizationId}/championship`);
    await showScorePage.getByRole("button", { name: "Modifier", exact: true }).click();
    await showScorePage.getByLabel("Titre", { exact: true }).fill(`[E2E] Championnat ${state.runId}`);
    await showScorePage.getByRole("button", { name: "Terminer", exact: true }).click();
    await showScorePage.getByRole("button", { name: "Analyser les résultats ShowScore", exact: true }).click();
    await expect(showScorePage.locator("body")).toContainText("2 inscrits · 2 résultats scorés");
    await expect(showScorePage.locator("body")).toContainText(/championnat 1100 · Open/);
    await showScorePage.getByRole("button", { name: "Ajouter au championnat", exact: true }).click();
    await expect(showScorePage.locator("body")).toContainText(crossAppFixture.participantNames[0]);
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
    for (const participantName of crossAppFixture.participantNames) {
      await expect(showScorePage.locator("body")).toContainText(participantName);
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
    await expect(resultClass.locator(".results-worksheet")).toContainText(/Brut\s*300[,.]00/);
    await expect(resultClass.locator(".results-worksheet")).toContainText(/Après trophée\s*270[,.]00/);
    await expect(resultClass.locator(".results-worksheet")).toContainText(/Frais NRHA\s*13[,.]50/);
    await expect(resultClass.locator(".results-worksheet")).toContainText(/Retenue\s*25[,.]65/);
    await expect(resultClass.locator(".results-worksheet")).toContainText(/Bourse nette\s*330[,.]85/);
    await expect(resultClass.locator(".results-table")).toContainText(/198[,.]51/);
    await expect(resultClass.locator(".results-table")).toContainText(/132[,.]34/);

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
    expectMoney(calculation.gross_entry_fees, EXPECTED_PAYOUT.grossEntryFees);
    expectMoney(calculation.trophy_or_plaque_fee, EXPECTED_PAYOUT.trophyFee);
    expectMoney(calculation.base_after_trophy_fee, EXPECTED_PAYOUT.baseAfterTrophy);
    expectMoney(calculation.nrha_fee_amount, EXPECTED_PAYOUT.sanctioningFeeAmount);
    expectMoney(calculation.net_entry_fee, EXPECTED_PAYOUT.netEntryFee);
    expectMoney(calculation.retainage_amount, EXPECTED_PAYOUT.retainageAmount);
    expectMoney(calculation.final_net_entry_fee, EXPECTED_PAYOUT.finalNetEntryFee);
    expectMoney(calculation.added_money, EXPECTED_PAYOUT.addedMoney);
    expectMoney(calculation.net_purse, EXPECTED_PAYOUT.netPurse);

    const { data: awards, error: awardsError } = await admin
      .from("payout_awards")
      .select("amount,percentage,rank")
      .eq("calculation_id", String(calculation.id));
    if (awardsError) throw awardsError;
    expect((awards ?? []).sort((a, b) => a.rank - b.rank).map((award) => Number(award.amount))).toEqual([...EXPECTED_PAYOUT.awards]);

    await page.goto(`/shows/${state.showSlug}`);
    await expect(page.getByRole("heading", { name: state.showName, exact: true })).toBeVisible();
    await expect(page.locator("body")).toContainText("330,85");
    await expect(page.locator("body")).toContainText("198,51");
    await expect(page.locator("body")).toContainText("132,34");
  });

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

async function scoreNextAnnouncerRun(page: Page, score: string) {
  const enterResult = page.getByRole("button", { name: "Entrer le résultat", exact: true });
  if (!(await enterResult.isVisible())) {
    await page.getByRole("button", { name: "Démarrer prochain", exact: true }).click();
  }
  await enterResult.click();
  const scoreInput = page.getByLabel("Juge E2E", { exact: true });
  await scoreInput.fill(score);
  await page.getByRole("button", { name: "Enregistrer le score", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

function pastDateTimeLocal() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return `${date.toISOString().slice(0, 10)}T18:00`;
}

function expectMoney(actual: unknown, expected: number) {
  expect(Number(actual)).toBeCloseTo(expected, 2);
}
