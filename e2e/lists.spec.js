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

test('an agent finds a client and a contract in the lists, takes a payment from the list, sees renewals', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const phone = testInfo.project.name.startsWith('phone');
  const lastName = `Liste${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  const contract = await seedContractEndingSoon(username, lastName, { premiumTotal: '800.00' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();

  // 1. Clients: the search box in reach; on a phone the other filters wait behind one button.
  await page.goto('/clients');
  await page.getByLabel('Nom, référence, téléphone, CIN ou ICE').fill(lastName);
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page.getByRole('link', { name: `Sara ${lastName}` })).toBeVisible();
  if (phone) {
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByLabel('Type', { exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Filtres' }).click();
    await expect(page.getByLabel('Type', { exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Filtres' })).toHaveCount(0);
  }
  await expectNoHorizontalScroll(page, expect);
  await shot('customers-list');

  // 2. Contracts: what is left to pay, and « Encaisser » right on the row or card.
  await page.goto('/contrats');
  await page.getByLabel('Rechercher (référence, police, client)').fill(contract.ref);
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page.getByRole('link', { name: contract.ref })).toBeVisible();
  await expect(page.getByText('800,00 MAD')).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('contracts-list');
  await page.getByRole('button', { name: `Encaisser un paiement pour ${contract.ref}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Encaisser un paiement' });
  // The whole balance is proposed; a smaller amount says what stays owed.
  await expect(dialog.getByText('Ce paiement solde le contrat.')).toBeVisible();
  await dialog.getByLabel('Montant (MAD)').fill('300');
  await expect(dialog.getByText('Reste après ce paiement : 500,00 MAD')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'Espèces' })).toBeChecked();
  await shot('payment-form');
  await dialog.getByRole('button', { name: 'Encaisser' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reçu de paiement' })).toBeVisible();

  // 3. Today's payments: the total first, each line with its amount at the right.
  await page.goto('/paiements');
  const line = page.getByRole('listitem').filter({ hasText: contract.ref });
  await expect(line).toContainText(`Sara ${lastName}`);
  await expect(line).toContainText('300,00 MAD');
  await expectNoHorizontalScroll(page, expect);
  await shot('payments-list');

  // 4. Renewals: the contract ends in 10 days, its line opens the follow-up.
  await page.goto('/renouvellements');
  await expect(page.getByRole('link', { name: `Sara ${lastName}` })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('renewals-list');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
