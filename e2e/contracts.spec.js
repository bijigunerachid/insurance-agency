import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  prepareCatalogueForContracts,
  seedUser,
} from './support.js';

test.afterAll(disconnect);

test('an agent records a contract from draft to issue, with its attestation', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  // Synthetic and unique per run: both browser projects share the database.
  const run = randomInt(100000, 999999);
  const lastName = `Contrat${run}`;
  const plate = `${randomInt(10000, 99999)}-B-${randomInt(1, 89)}`;
  const productName = `Produit contrat ${run}`;
  const policy = `POL-${run}`;
  const serial = String(randomInt(100000000, 999999999));
  await prepareCatalogueForContracts(productName);
  const { username } = await seedUser({ role: 'AGENT' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  // 1. A customer and a car of usage Tourisme (model A).
  await login(page, username);
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await page.getByRole('link', { name: 'Nouveau client' }).click();
  await page.getByLabel('Prénom').fill('Sara');
  await page.getByLabel('Nom', { exact: true }).fill(lastName);
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Sara ${lastName}` })).toBeVisible();
  await page.getByRole('link', { name: 'Ajouter un véhicule' }).click();
  await page.getByLabel('Immatriculation').fill(plate);
  await page.getByLabel('Marque').fill('Dacia');
  await page.getByLabel('Modèle').fill('Logan');
  await page.getByLabel('Usage (attestation)').selectOption({ label: 'Tourisme' });
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: plate })).toBeVisible();
  await page.getByRole('link', { name: `Sara ${lastName}` }).click();

  // 2. A draft contract with a confirmed product.
  await page.getByRole('link', { name: 'Nouveau contrat' }).click();
  await page.getByLabel('Produit').selectOption({ label: `RMA · ${productName}` });
  await page.getByLabel('Début').fill('2026-11-01');
  await page.getByLabel('Fin').fill('2027-10-31');
  await page.getByLabel(/Prime confirmée/).fill('1 234,50');
  await page.getByRole('checkbox', { name: new RegExp(plate) }).check();
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  // The contract page opens on the insured person, the reference just under the name.
  // In the page (the header shows it too, as « Contrats › CTR-… »).
  await expect(page.locator('#contenu').getByText(/^CTR-\d{4}-\d{5}/)).toBeVisible();
  // Status badges sit under the title (the history lists the same words).
  const header = page.getByRole('heading', { level: 1 }).locator('..');
  await expect(header.getByText('En préparation', { exact: true })).toBeVisible();
  // The premium shows in the contract and, as what is left to pay, in its payments.
  await expect(page.getByText('1 234,50 MAD').first()).toBeVisible();

  // 3. Sent to the insurer, then issued with the insurer's policy number.
  await page.getByRole('button', { name: 'Envoyer à l’assureur' }).click();
  await page
    .getByRole('dialog', { name: 'Envoyer à l’assureur' })
    .getByRole('button', { name: 'Envoyer à l’assureur' })
    .click();
  await expect(header.getByText('Envoyé à l’assureur', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer l’émission' }).click();
  let dialog = page.getByRole('dialog', { name: 'Enregistrer l’émission' });
  await dialog.getByLabel(/N° de police/).fill(policy);
  await dialog.getByLabel(/Preuve de l’assureur/).fill('Courriel synthétique de l’assureur');
  await dialog.getByRole('button', { name: 'Enregistrer l’émission' }).click();
  // Shown in the summary card (and again in the folded details).
  await expect(page.getByText(policy).first()).toBeVisible();
  await expect(header.getByText('Émis', { exact: true })).toBeVisible();
  // Suspending or terminating is a manager's action.
  await expect(page.getByRole('button', { name: /suspension|résiliation/ })).toHaveCount(0);

  // 4. The definitive attestation of model A, number as printed.
  await page.getByRole('button', { name: 'Enregistrer une attestation' }).click();
  dialog = page.getByRole('dialog', { name: 'Enregistrer une attestation' });
  await dialog.getByLabel('Série').selectOption({ label: '14 A · Tourisme' });
  await dialog.getByLabel('Numéro').fill(serial);
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  const attestations = page.getByRole('region', { name: 'Attestations' });
  await expect(attestations.getByText(`n° ${serial}`)).toBeVisible();
  await expect(attestations.getByText(/Modèle A \(n° 1, jaune\)/)).toBeVisible();

  await expectNoHorizontalScroll(page, expect);
  await shot('contract');
  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
