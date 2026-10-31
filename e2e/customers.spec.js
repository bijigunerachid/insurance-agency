import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { disconnect, expectNoHorizontalScroll, guardOffline, login, seedUser } from './support.js';

test.afterAll(disconnect);

test('agents create a customer, are warned about a duplicate, and reveal a masked CIN with a reason', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  // Synthetic, unique per run so parallel projects never collide.
  const lastName = `Testeur${randomInt(100000, 999999)}`;
  const cin = `ZT${randomInt(100000, 999999)}`;
  const phone = `06${randomInt(10000000, 99999999)}`;
  const { username: owner } = await seedUser({ role: 'AGENT' });
  const { username: colleague } = await seedUser({ role: 'AGENT' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  // 1. The first agent creates the customer.
  await login(page, owner);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Clients' })).toBeVisible();
  await page.getByRole('link', { name: 'Nouveau client' }).click();
  await page.getByLabel('Prénom').fill('Karim');
  await page.getByLabel('Nom', { exact: true }).fill(lastName);
  await page.getByLabel('Pièce d’identité').selectOption('CIN');
  await page.getByLabel('Numéro de la pièce').fill(cin.toLowerCase());
  await page.getByLabel('Téléphone').fill(phone);
  await page.getByLabel('Ville').fill('Casablanca');
  await expectNoHorizontalScroll(page, expect);
  await shot('customer-form');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByRole('heading', { level: 1, name: `Karim ${lastName}` })).toBeVisible();
  // The responsible agent sees the full, normalised identity number and phone (in the details).
  await page.getByText('Coordonnées et suivi').click();
  await expect(page.getByText(cin, { exact: true })).toBeVisible();
  // Stored as +212…, shown in the familiar local form.
  // Under the name, a link that calls the number.
  await expect(
    page.getByRole('link', { name: phone.replace(/(\d{2})(?=\d)/g, '$1 ') }),
  ).toHaveAttribute('href', /^tel:\+212/);
  await expectNoHorizontalScroll(page, expect);
  await shot('customer-detail');

  // 2. A second customer with the same phone triggers a duplicate warning.
  await page.getByRole('link', { name: 'Retour aux clients' }).click();
  await page.getByRole('link', { name: 'Nouveau client' }).click();
  await page.getByLabel('Prénom').fill('Salma');
  await page.getByLabel('Nom', { exact: true }).fill(lastName);
  await page.getByLabel('Téléphone').fill(phone);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  const duplicate = page.getByRole('dialog', { name: 'Client semblable trouvé' });
  await expect(duplicate.getByText(/même téléphone/)).toBeVisible();
  await shot('customer-duplicate');
  await duplicate
    .getByRole('button', { name: 'Ce n’est pas le même client : enregistrer' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: `Salma ${lastName}` })).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByText('Vous êtes déconnecté.')).toBeVisible();

  // 3. Another agent finds the customer; the CIN is masked until a reason is given.
  await page.getByLabel('Identifiant').fill(colleague);
  await page.getByLabel('Mot de passe').fill('Synthétique-E2E-2026!');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByLabel('Nom, référence, téléphone, CIN ou ICE').fill(`karim ${lastName}`);
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await page.getByRole('link', { name: `Karim ${lastName}` }).click();
  const masked = `${cin.slice(0, 2)}${'*'.repeat(cin.length - 4)}${cin.slice(-2)}`;
  await page.getByText('Coordonnées et suivi').click();
  await expect(page.getByText(masked)).toBeVisible();
  await page.getByRole('button', { name: 'Afficher le numéro' }).click();
  const reveal = page.getByRole('dialog', { name: 'Afficher la pièce d’identité' });
  await reveal.getByLabel('Motif').fill('Client présent au guichet');
  await reveal.getByRole('button', { name: 'Afficher le numéro' }).click();
  await expect(page.getByText(cin, { exact: true })).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  // The only error answer is the duplicate warning.
  expect(errorResponses).toEqual(['POST /api/customers 409']);
});
