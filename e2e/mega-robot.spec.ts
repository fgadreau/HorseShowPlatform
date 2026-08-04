import { expect, test, type Page } from "@playwright/test";
import { buildContactScenarios, futureDate } from "./support/data-factory";
import { readRunState } from "./support/run-state";

test("le méga robot complète un vrai parcours de préproduction", async ({ page }) => {
  test.slow();
  const state = readRunState();
  const browserErrors: string[] = [];
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

  expect(browserErrors, `Erreurs JavaScript du navigateur:\n${browserErrors.join("\n")}`).toEqual([]);
});

async function navigateTo(page: Page, view: string) {
  await page.locator(`#primary-navigation [data-view="${view}"]`).click();
  await expect(page.locator(`#primary-navigation [data-view="${view}"]`)).toHaveClass(/active/);
}
