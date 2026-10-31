import { expect, test } from '@playwright/test';
import {
  currentCode,
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  PASSWORD,
  seedUser,
  openMenu,
  expectNoMenuLink,
} from './support.js';

test.afterAll(disconnect);

test.describe('Sign-in journeys', () => {
  test('an agent signs in, sees only what the role allows, and signs out', async ({
    page,
  }, testInfo) => {
    const { username } = await seedUser({ role: 'AGENT' });
    const { external, consoleMessages, errorResponses } = await guardOffline(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    // The installation's agency, before sign-in: its logo, its name in the tab, its icon.
    await expect(
      page.getByRole('img', { name: 'Agence Essai Assurances et Conseils' }),
    ).toBeVisible();
    await expect(page).toHaveTitle("Agence Essai Assurances et Conseils · Gestion de l'agence");
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/api/agency/icon');
    await expectNoHorizontalScroll(page, expect);
    await page.screenshot({ path: testInfo.outputPath(`login-${testInfo.project.name}.png`) });

    await login(page, username);
    // Everyone lands on the home dashboard (renewals to follow).
    await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
    await openMenu(page, 'Mon compte');
    await expect(page.getByRole('heading', { level: 1, name: 'Mon compte' })).toBeVisible();
    await expect(page.getByText(username)).toBeVisible();
    await expectNoMenuLink(page, expect, 'État du système');
    await expectNoHorizontalScroll(page, expect);
    await page.screenshot({
      path: testInfo.outputPath(`account-${testInfo.project.name}.png`),
      fullPage: true,
    });

    // The session cookie is not readable by scripts.
    expect(await page.evaluate(() => document.cookie)).toBe('');

    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page.getByText('Vous êtes déconnecté.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();

    expect(external).toEqual([]);
    expect(consoleMessages).toEqual([]);
    expect(errorResponses).toEqual([]);
  });

  test('an agent turns on two-step verification after confirming the password', async ({
    page,
  }) => {
    const { username } = await seedUser({ role: 'AGENT' });
    const { external, consoleMessages, errorResponses } = await guardOffline(page);
    await login(page, username);
    await openMenu(page, 'Mon compte');
    await page.getByRole('button', { name: 'Activer la vérification en deux étapes' }).click();

    const reauth = page.getByRole('dialog', { name: 'Confirmer votre identité' });
    await reauth.getByLabel('Mot de passe').fill(PASSWORD);
    await reauth.getByRole('button', { name: 'Confirmer' }).click();

    await expect(page.getByAltText('Code QR à scanner avec votre application')).toBeVisible();
    const key = await page.locator('p.font-mono').innerText();
    await page.getByLabel('Code à 6 chiffres').fill(currentCode(key));
    await page.getByRole('button', { name: 'Activer', exact: true }).click();
    await expect(page.getByText('Activée')).toBeVisible();

    expect(external).toEqual([]);
    expect(consoleMessages).toEqual([]);
    // The only error answer is the server asking for the password before enrolment.
    expect(errorResponses).toEqual(['POST /api/auth/totp/enroll/start 403']);
  });

  test('a wrong password shows a generic message', async ({ page }) => {
    const { username } = await seedUser();
    await login(page, username, 'Pas-Le-Bon-Mot-De-Passe');
    await expect(page.getByRole('alert')).toHaveText('Identifiant ou mot de passe incorrect.');
  });

  test('a new administrator must set up two-step verification before entering', async ({
    page,
  }, testInfo) => {
    const { username } = await seedUser({ role: 'ADMIN' });
    const { external } = await guardOffline(page);

    await login(page, username);
    await expect(
      page.getByRole('heading', { name: 'Activer la vérification en deux étapes' }),
    ).toBeVisible();
    await expect(page.getByAltText('Code QR à scanner avec votre application')).toBeVisible();
    await expectNoHorizontalScroll(page, expect);
    await page.screenshot({
      path: testInfo.outputPath(`totp-enroll-${testInfo.project.name}.png`),
      fullPage: true,
    });

    // Read the manual key, as a user would type it into an authenticator app.
    const key = await page.locator('p.font-mono').innerText();
    await page.getByLabel('Code à 6 chiffres').fill(currentCode(key));
    await page.getByRole('button', { name: 'Activer' }).click();

    await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
    expect(external).toEqual([]);
  });

  test('a temporary password must be replaced at first sign-in', async ({ page }) => {
    const { username } = await seedUser({ mustChangePassword: true });
    await login(page, username);
    await expect(
      page.getByRole('heading', { name: 'Choisir un nouveau mot de passe' }),
    ).toBeVisible();

    await page.getByLabel('Mot de passe actuel').fill(PASSWORD);
    await page
      .getByLabel('Nouveau mot de passe', { exact: true })
      .fill('Nouveau-Choix-Solide-2026');
    await page.getByLabel('Confirmer le nouveau mot de passe').fill('Nouveau-Choix-Solide-2026');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  });
});
