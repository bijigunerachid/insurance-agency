import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  openMenu,
  seedUser,
} from './support.js';

test.afterAll(disconnect);

test('an agent registers a taxi in a customer’s fleet and finds it by plate', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  // Synthetic, unique per run.
  const company = `Taxis Test ${randomInt(100000, 999999)}`;
  const number = randomInt(10000, 99999);
  const { username } = await seedUser({ role: 'AGENT' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  // 1. Create the business customer.
  await login(page, username);
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('link', { name: 'Nouveau client' }).click();
  await page.getByLabel('Entreprise').check();
  await page.getByLabel('Raison sociale').fill(company);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: company })).toBeVisible();

  // 2. Create a fleet from the customer's page.
  await page.getByRole('button', { name: 'Créer une flotte' }).click();
  await page.getByLabel('Nom de la flotte').fill('Grands taxis');
  await page.getByRole('button', { name: 'Créer la flotte' }).click();
  await expect(page.getByRole('link', { name: 'Grands taxis' })).toBeVisible();

  // 3. Add a taxi: the seats are required by law (rule L14).
  await page.getByRole('link', { name: 'Ajouter un véhicule' }).click();
  await page.getByLabel('Immatriculation').fill(`${number}-B-6`);
  await page.getByLabel('Catégorie').selectOption('TAXI');
  await page.getByLabel('Marque').fill('Mercedes');
  await page.getByLabel('Modèle').fill('Vito');
  await page.getByLabel('Type de taxi').selectOption('GRAND');
  await page.getByLabel('Flotte').selectOption({ label: 'Grands taxis' });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Ce champ est obligatoire pour cette catégorie.')).toBeVisible();
  await page.getByLabel('Nombre de places *').fill('7');
  await expectNoHorizontalScroll(page, expect);
  await shot('vehicle-form');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(page.getByRole('heading', { level: 1, name: `${number}-B-6` })).toBeVisible();
  await expect(page.getByText('Grand taxi')).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('vehicle-detail');

  // 4. Find it from the vehicle list, typing the plate differently.
  await openMenu(page, 'Véhicules');
  await page.getByLabel('Immatriculation, marque, modèle ou client').fill(`${number} b 6`);
  await page.getByRole('button', { name: 'Rechercher' }).click();
  // Wait for the filtered result (the unfiltered list may still be on screen).
  await expect(page.getByText('1 résultat')).toBeVisible();
  const row = page.getByRole('row', { name: new RegExp(`${number}-B-6`) });
  await expect(row.getByRole('cell', { name: 'Grands taxis' })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('vehicles-list');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  // The only error answer is the missing number of seats.
  expect(errorResponses).toEqual(['POST /api/vehicles 400']);
});

test('an agent registers a moped with its cylindrée only', async ({ page }, testInfo) => {
  // Synthetic, unique per run.
  const person = `Cyclo ${randomInt(100000, 999999)}`;
  const plate = `${randomInt(10000, 99999)}-A-6`;
  const { username } = await seedUser({ role: 'AGENT' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('link', { name: 'Nouveau client' }).click();
  await page.getByLabel('Entreprise').check();
  await page.getByLabel('Raison sociale').fill(person);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: person })).toBeVisible();

  // A two-wheeler needs its fiscal power or its cylindrée (rule L14): the RMA sheet of a moped
  // prints only the cylindrée.
  await page.getByRole('link', { name: 'Ajouter un véhicule' }).click();
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Catégorie').selectOption('MOTORCYCLE');
  await page.getByLabel('Marque').fill('Fice');
  // No model: the RMA platform sheet prints the make alone (owner, 29/10/2026).
  await expect(page.getByLabel('Puissance fiscale (CV) *')).toBeVisible();
  await page.getByLabel('Cylindrée (cm³) *').fill('49');
  await expect(page.getByLabel('Puissance fiscale (CV)', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await page.screenshot({
    path: testInfo.outputPath(`moped-form-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: plate })).toBeVisible();
  await expect(page.getByText('49', { exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
