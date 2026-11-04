import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  prepareCatBorder,
  seedUser,
} from './support.js';

test.afterAll(disconnect);

test('an agent records CAT border insurance for a car registered abroad, 10 days', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  // Synthetic and unique per run: both browser projects share the database.
  const run = randomInt(100000, 999999);
  const lastName = `Frontiere${run}`;
  const plate = `FR-${run}-XY`;
  await prepareCatBorder();
  const { username } = await seedUser({ role: 'AGENT' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  // 1. A visitor with a passport, and a car registered abroad, usage « Assurance aux frontières ».
  await login(page, username);
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('link', { name: 'Nouveau client' }).click();
  await page.getByLabel('Prénom').fill('Lena');
  await page.getByLabel('Nom', { exact: true }).fill(lastName);
  await page.getByLabel('Pièce d’identité').selectOption({ label: 'Passeport' });
  await page.getByLabel('Numéro de la pièce').fill(`X${run}`);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Lena ${lastName}` })).toBeVisible();
  await page.getByRole('link', { name: 'Ajouter un véhicule' }).click();
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Marque').fill('Renault');
  await page.getByLabel('Modèle').fill('Clio');
  await page.getByLabel('Usage (attestation)').selectOption({ label: 'Assurance aux frontières' });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: plate })).toBeVisible();
  await page.getByRole('link', { name: `Lena ${lastName}` }).click();

  // 2. The contract: the end comes from the chosen duration; no tacit renewal is offered.
  await page.getByRole('link', { name: 'Nouveau contrat' }).click();
  await page.getByLabel('Produit').selectOption({ label: 'CAT · Assurance aux frontières' });
  const durations = page.getByRole('group', { name: 'Durée de l’assurance aux frontières' });
  await expect(durations.getByRole('button', { name: '10 jours' })).toBeDisabled();
  await page.getByLabel('Début').fill('2026-11-02');
  await durations.getByRole('button', { name: '10 jours' }).click();
  await expect(page.getByLabel('Fin')).toHaveValue('2026-11-12');
  await expect(page.getByRole('checkbox', { name: /tacite reconduction/ })).toHaveCount(0);
  await expect(page.getByText(/pas de tacite reconduction ni de suivi/)).toBeVisible();
  await page.getByLabel(/Prime confirmée/).fill('350');
  await page.getByRole('checkbox', { name: new RegExp(plate) }).check();
  await expectNoHorizontalScroll(page, expect);
  await shot('border-form');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  // In the page (the header shows it too, as « Contrats › CTR-… »).
  await expect(page.locator('#contenu').getByText(/^CTR-\d{4}-\d{5}/)).toBeVisible();
  await expect(page.getByText('Assurance aux frontières').first()).toBeVisible();
  await expect(page.getByText('Assuré jusqu’au 12/11/2026')).toBeVisible();
  await expect(page.getByText('Chargement…')).toHaveCount(0);
  await expectNoHorizontalScroll(page, expect);
  await shot('border-contract');
  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
