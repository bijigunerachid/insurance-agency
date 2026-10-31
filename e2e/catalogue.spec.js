import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  loginWithCode,
  seedUser,
  openMenu,
} from './support.js';

test.afterAll(disconnect);

// Model letters are few: each project and repeat takes its own unused one (seeded: A–G, P).
const FREE_LETTERS = 'HIJKLMNOQRSTUVWXYZ';
const PROJECTS = ['desktop-1366', 'phone-390'];
const letterFor = (testInfo) =>
  FREE_LETTERS[
    testInfo.repeatEachIndex * PROJECTS.length + PROJECTS.indexOf(testInfo.project.name)
  ];

const screenshot = (page, testInfo) => (name) =>
  page.screenshot({
    path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
    fullPage: true,
  });

test('a manager confirms a model, a usage and a product from the agency’s documents', async ({
  page,
}, testInfo) => {
  const shot = screenshot(page, testInfo);
  // Synthetic and unique per run: both browser projects share the database.
  const run = randomInt(100000, 999999);
  const letter = letterFor(testInfo);
  const modelLabel = `Modèle test ${run}`;
  const usageLabel = `Usage test ${run}`;
  const productName = `Produit test ${run}`;
  const { username, secret } = await seedUser({ role: 'MANAGER', totp: true });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await loginWithCode(page, username, secret);
  await openMenu(page, 'Catalogue');
  await expect(page.getByRole('heading', { level: 1, name: 'Catalogue' })).toBeVisible();

  // 1. A model shared by both insurers, confirmed from its document.
  const models = page.getByRole('region', { name: 'Modèles d’attestation' });
  await models.getByRole('button', { name: 'Ajouter un modèle' }).click();
  let dialog = page.getByRole('dialog', { name: 'Ajouter un modèle' });
  await dialog.getByLabel('Lettre').fill(letter.toLowerCase());
  await dialog.getByLabel('Libellé').fill(modelLabel);
  await dialog.getByLabel('Source').fill('Document synthétique de test');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  const modelRow = models.getByRole('listitem').filter({ hasText: modelLabel });
  await expect(modelRow).toContainText(`${letter} · ${modelLabel}`);
  await modelRow.getByRole('button', { name: 'Confirmer' }).click();
  dialog = page.getByRole('dialog', { name: new RegExp(modelLabel) });
  await dialog.getByLabel('Document de référence').fill('Référence synthétique 0');
  await dialog.getByRole('button', { name: 'Confirmer' }).click();
  await expect(modelRow.getByText('Confirmé', { exact: true })).toBeVisible();

  // 2. A usage of that model starts "to confirm", then is confirmed with its document.
  const usages = page.getByRole('region', { name: 'Usages des véhicules' });
  await usages.getByRole('button', { name: 'Ajouter un usage' }).click();
  dialog = page.getByRole('dialog', { name: 'Ajouter un usage' });
  await dialog.getByLabel('Libellé').fill(usageLabel);
  await dialog
    .getByLabel('Modèle d’attestation')
    .selectOption({ label: `Modèle ${letter} · ${modelLabel}` });
  await dialog.getByLabel('Source').fill('Document synthétique de test');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  const usageRow = usages.getByRole('listitem').filter({ hasText: usageLabel });
  await expect(usageRow.getByText('À confirmer')).toBeVisible();

  await usageRow.getByRole('button', { name: 'Confirmer' }).click();
  dialog = page.getByRole('dialog', { name: new RegExp(usageLabel) });
  await dialog.getByLabel('Document de référence').fill('Référence synthétique 1');
  await dialog.getByRole('button', { name: 'Confirmer' }).click();
  await expect(usageRow.getByText('Confirmé', { exact: true })).toBeVisible();
  await expect(usageRow.getByText(/Référence synthétique 1/)).toHaveText(
    /^Confirmé par .+ le \d{2}\/\d{2}\/\d{4} · Référence synthétique 1$/,
  );

  // 3. A product cannot be used in a quote until it is confirmed.
  const products = page.getByRole('region', { name: 'Produits' });
  await products.getByRole('button', { name: 'Ajouter un produit' }).click();
  dialog = page.getByRole('dialog', { name: 'Ajouter un produit' });
  await dialog
    .getByLabel('Assureur', { exact: true })
    .selectOption({ label: 'CAT Assurance & Réassurance' });
  await dialog.getByLabel('Branche').selectOption('TAXI');
  await dialog.getByLabel('Nom du produit').fill(productName);
  await dialog.getByLabel('Source').fill('Document synthétique de test');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  const productRow = products.getByRole('listitem').filter({ hasText: productName });
  await expect(productRow.getByText('Pas encore utilisable')).toBeVisible();

  await productRow.getByRole('button', { name: 'Confirmer' }).click();
  dialog = page.getByRole('dialog', { name: new RegExp(productName) });
  await dialog.getByLabel('Document de référence').fill('Référence synthétique 2');
  await dialog.getByRole('button', { name: 'Confirmer' }).click();
  await expect(productRow.getByText('Utilisable dans un devis')).toBeVisible();

  // The series seen on the forms are listed with their shared model. 14 C is checked because
  // no journey confirms it (the contracts journey confirms 14 A in the shared database).
  const series = page.getByRole('region', { name: 'Séries d’attestation' });
  const rma14C = series.getByRole('listitem').filter({ hasText: '14 C' });
  await expect(rma14C).toContainText('Modèle C · Transport de marchandises');
  await expect(rma14C).toContainText('À confirmer');
  await expectNoHorizontalScroll(page, expect);
  await shot('catalogue');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});

test('a manager records a reviewed rule; an agent reads the register', async ({
  browser,
  page,
}, testInfo) => {
  const shot = screenshot(page, testInfo);
  const code = `EZ${randomInt(1000, 9999)}`;
  const { username, secret } = await seedUser({ role: 'MANAGER', totp: true });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await loginWithCode(page, username, secret);
  await openMenu(page, 'Règles');
  await expect(page.getByRole('heading', { level: 1, name: 'Registre des règles' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'L23', exact: true })).toBeVisible();

  await page.getByLabel('Concerne').selectOption('CAT');
  await page.getByLabel('Statut').selectOption('UNKNOWN');
  await expect(page.getByText('2 règles')).toBeVisible();
  await expect(page.getByRole('link', { name: 'C8', exact: true })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('rules-list');

  // An agency rule, then a review that confirms it from a document.
  await page.getByRole('button', { name: 'Nouvelle règle' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nouvelle règle' });
  await dialog.getByLabel('Code').fill(code);
  await dialog.getByLabel('Règle').fill('Règle synthétique de test.');
  await dialog.getByLabel('Effet dans l’application').fill('Aucun, test.');
  await dialog.getByLabel('Source').fill('Document synthétique de test');
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(code) })).toBeVisible();

  await page.getByLabel('Nouveau statut').selectOption('CONFIRMED');
  await page.getByLabel('Note').fill('Vérifié sur le document');
  await page.getByRole('button', { name: 'Enregistrer une revue' }).click();
  await expect(page.getByText('Ce champ est obligatoire.')).toBeVisible();
  await page.getByLabel('Document de référence *').fill('Référence synthétique 3');
  await page.getByRole('button', { name: 'Enregistrer une revue' }).click();

  const history = page.getByRole('region', { name: 'Historique des revues' });
  await expect(history.getByText('Référence : Référence synthétique 3')).toBeVisible();
  await expect(page.getByText(/Règle confirmée : enregistrez une revue/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Modifier' })).toHaveCount(0);
  await expectNoHorizontalScroll(page, expect);
  await shot('rule-detail');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);

  // An agent sees the same register and catalogue, without any action.
  const agentContext = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    viewport: page.viewportSize(),
  });
  const agentPage = await agentContext.newPage();
  const agentGuard = await guardOffline(agentPage);
  const { username: agent } = await seedUser({ role: 'AGENT' });
  await login(agentPage, agent);
  await openMenu(agentPage, 'Catalogue');
  await expect(agentPage.getByText('Usages des véhicules')).toBeVisible();
  await expect(agentPage.getByRole('button', { name: /Ajouter|Confirmer|Modifier/ })).toHaveCount(
    0,
  );
  await openMenu(agentPage, 'Règles');
  await expect(agentPage.getByRole('link', { name: code })).toBeVisible();
  await expect(agentPage.getByRole('button', { name: 'Nouvelle règle' })).toHaveCount(0);
  expect(agentGuard.consoleMessages).toEqual([]);
  expect(agentGuard.errorResponses).toEqual([]);
  await agentContext.close();
});
