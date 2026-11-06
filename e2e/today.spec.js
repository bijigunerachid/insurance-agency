import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  seedContractEndingSoon,
  seedUser,
} from './support.js';

test.afterAll(disconnect);

test('an agent starts the day: sees what is owed, finds a contract with the search box', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const lastName = `Accueil${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  // An issued contract with its premium, nothing paid yet.
  const contract = await seedContractEndingSoon(username, lastName, { premiumTotal: '600.00' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await expect(page.getByRole('link', { name: /Scanner une attestation/ }).first()).toBeVisible();
  const todo = page.getByRole('region', { name: 'À faire' });
  await expect(todo.getByRole('link', { name: /doi(t|vent) encore/ })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('today');

  // The policy number, typed any way, finds the contract.
  const search = page.getByRole('searchbox', { name: 'Rechercher' });
  await search.fill(contract.policyNumber.replace(/-/g, ' ').toLowerCase());
  // In the page (a pop-up of the alerts may name the same contract).
  const result = page
    .getByRole('main')
    .getByRole('link', { name: new RegExp(contract.policyNumber) });
  await expect(result).toBeVisible();
  await shot('today-search');
  await result.click();

  // The contract opens on its summary: who, until when, what is left to pay.
  await expect(page.getByRole('heading', { level: 1, name: `Sara ${lastName}` })).toBeVisible();
  await expect(page.getByText(/^Assuré jusqu’au /)).toBeVisible();
  await expect(page.getByText('600,00 MAD').first()).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('contract-summary');

  // From the to-do line "doit encore", pay in one go and get the receipt.
  await page.getByRole('link', { name: 'Aujourd’hui' }).first().click();
  await page
    .getByRole('region', { name: 'À faire' })
    .getByRole('link', { name: /doi(t|vent) encore/ })
    .click();
  // Other journeys add contracts still owed too: this one is searched for in the list.
  await page.getByLabel('Rechercher (n° de police, client)').fill(contract.policyNumber);
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page.getByText('1 résultat', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: `Encaisser un paiement pour ${contract.policyNumber}` })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Encaisser un paiement' });
  await dialog.getByLabel('Montant (MAD)').fill('600');
  await shot('pay-from-list');
  await dialog.getByRole('button', { name: 'Encaisser' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reçu de paiement' })).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Exemplaire client' }).getByText('600,00 MAD'),
  ).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
