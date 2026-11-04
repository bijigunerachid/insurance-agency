import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  loginWithCode,
  nextCode,
  PASSWORD,
  seedUser,
  openMenu,
  expectNoMenuLink,
  signOut,
} from './support.js';

test.afterAll(disconnect);

test('an administrator creates an account; the new employee signs in; the audit log shows it', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const { username: admin, secret } = await seedUser({ role: 'ADMIN', totp: true });
  const newUsername = `e2e.nouveau.${Date.now().toString(36)}`;
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  // 1. The administrator opens the user list and creates an account.
  await loginWithCode(page, admin, secret);
  await openMenu(page, 'Utilisateurs');
  await expect(page.getByRole('heading', { level: 1, name: 'Utilisateurs' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('users');

  await page.getByRole('button', { name: 'Nouvel utilisateur' }).click();
  const form = page.getByRole('dialog', { name: 'Nouvel utilisateur' });
  await form.getByLabel('Identifiant').fill(newUsername);
  await form.getByLabel('Nom affiché').fill('Employé de test');
  await form.getByRole('button', { name: 'Nouvel utilisateur' }).click();

  // 2. Sensitive action: the server asks to confirm identity first.
  const reauth = page.getByRole('dialog', { name: 'Confirmer votre identité' });
  await reauth.getByLabel('Mot de passe').fill(PASSWORD);
  await reauth.getByLabel('Code à 6 chiffres').fill(nextCode(secret));
  await reauth.getByRole('button', { name: 'Confirmer' }).click();

  // 3. The temporary password is shown once.
  const temp = page.getByRole('dialog', { name: 'Mot de passe temporaire' });
  await expect(temp).toBeVisible();
  await shot('temporary-password');
  const temporaryPassword = await temp.locator('dd.select-all').innerText();
  expect(temporaryPassword).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);
  await temp.getByRole('button', { name: "J'ai noté le mot de passe" }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Employé de test' })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('user-detail');

  // 4. The audit log shows the creation.
  await openMenu(page, "Journal d'audit");
  await expect(page.getByText('Compte créé').last()).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('audit');
  await signOut(page);
  await expect(page.getByText('Vous êtes déconnecté.')).toBeVisible();

  // 5. The new employee signs in on the same workstation, from the page left open (the audit
  //    log, which an agent may not see), with the temporary password, and must replace it.
  expect(new URL(page.url()).pathname).toBe('/journal');
  await page.getByLabel('Identifiant').fill(newUsername);
  await page.getByLabel('Mot de passe').fill(temporaryPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(
    page.getByRole('heading', { name: 'Choisir un nouveau mot de passe' }),
  ).toBeVisible();
  await page.getByLabel('Mot de passe actuel').fill(temporaryPassword);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('Mon-Propre-Choix-2026!');
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('Mon-Propre-Choix-2026!');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await expectNoMenuLink(page, expect, 'Utilisateurs');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  // The only error answer is the server asking to confirm identity before creating the account.
  expect(errorResponses).toEqual(['POST /api/users 403']);
});
