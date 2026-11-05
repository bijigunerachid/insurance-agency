import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  seedContractEndingSoon,
  seedPaymentToRemit,
  seedUser,
} from './support.js';

test.afterAll(disconnect);

test('an agent lists the contracts paid in nothing, in part or in full', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  // Three contracts of customers whose names start alike, premium 800 MAD each: nothing paid, 300, all of it.
  const lastName = `Paie${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  const options = { premiumTotal: '800.00' };
  const nothing = await seedContractEndingSoon(username, `${lastName}a`, options);
  const part = await seedContractEndingSoon(username, `${lastName}b`, options);
  const all = await seedContractEndingSoon(username, `${lastName}c`, options);
  await seedPaymentToRemit(username, part, { amount: '300.00', daysAgo: 1 });
  await seedPaymentToRemit(username, all, { amount: '800.00', daysAgo: 1 });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto('/contrats');
  await page.getByLabel('Rechercher (n° de police, client)').fill(lastName);
  await page.getByRole('button', { name: 'Rechercher' }).click();
  const listed = (contract) => page.getByRole('link', { name: contract.policyNumber });
  for (const contract of [nothing, part, all]) await expect(listed(contract)).toBeVisible();

  // The choice is always in view, on a phone too.
  const payment = page.getByRole('group', { name: 'Paiement' });
  const only = async (label, shown) => {
    await payment.getByText(label, { exact: true }).click();
    for (const contract of [nothing, part, all]) {
      await expect(listed(contract)).toHaveCount(contract === shown ? 1 : 0);
    }
  };
  await only('Rien payé', nothing);
  await only('Payé en partie', part);
  await expectNoHorizontalScroll(page, expect);
  await shot('paid-in-part');
  await only('Payé', all);
  await payment.getByText('Tous', { exact: true }).click();
  for (const contract of [nothing, part, all]) await expect(listed(contract)).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
