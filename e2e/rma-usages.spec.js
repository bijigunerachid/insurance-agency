import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  confirmUsage,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  seedInsuredCar,
  seedUser,
} from './support.js';

test('an agent records a van with the usage chosen on the RMA platform, and finds the RMA list in the catalogue', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const unique = randomInt(10000, 99999);
  await confirmUsage('Transport de marchandises');
  const { username } = await seedUser({ role: 'AGENT' });
  const { contract } = await seedInsuredCar(username, `Usage${unique}`);
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto(`/vehicules/nouveau?client=${contract.customerId}`);
  await expect(page.getByRole('heading', { name: 'Ajouter un véhicule' })).toBeVisible();

  // The usage chosen on the platform fills the usage of the attestation.
  const gama = page.getByLabel('Usage assureur (RMA)');
  await expect(gama.locator('optgroup[label="RMA · C1"]')).toHaveCount(1);
  await gama.selectOption({ label: 'C1 (COMMERCE <= 3,5T)' });
  await expect(page.getByLabel('Usage (attestation)')).toHaveValue(
    await page
      .getByLabel('Usage (attestation)')
      .locator('option', { hasText: 'Transport de marchandises' })
      .getAttribute('value'),
  );
  const plate = `${unique}-A-13`;
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Catégorie').selectOption({ label: 'Véhicule utilitaire' });
  await page.getByLabel('Marque').fill('TATA');
  await page.getByLabel('Modèle').fill('Xenon');
  await expectNoHorizontalScroll(page, expect);
  await shot('rma-usage-form');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByRole('heading', { level: 1, name: new RegExp(plate) })).toBeVisible();
  await expect(page.getByText('C1 (COMMERCE <= 3,5T)')).toBeVisible();
  await expect(page.getByText('Transport de marchandises')).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('rma-usage-vehicle');

  // The whole RMA list, under the platform's headings, each with its attestation.
  await page.goto('/catalogue');
  const list = page.getByRole('region', { name: 'Usages de l’assureur' });
  await list.getByText('RMA · DIVERS (34)').click();
  const ambulances = list.getByRole('listitem').filter({ hasText: 'AMBULANCES <= 3,5T' });
  await expect(ambulances.getByText('Attestation : Divers (modèle D)')).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await list.screenshot({
    path: testInfo.outputPath(`rma-usage-catalogue-${testInfo.project.name}.png`),
  });

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
