import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  loginWithCode,
  openMenu,
  seedContractEndingSoon,
  seedIssue,
  seedPaymentToRemit,
  seedUser,
  signOut,
} from './support.js';

test.afterAll(disconnect);

test('an agent prints their own production; a manager sees everyone’s', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  // Agent A: two contracts issued today (800 MAD), one paid 300; agent B: one.
  const lastName = `Prod${randomInt(100000, 999999)}`;
  const a = await seedUser({ role: 'AGENT' });
  const b = await seedUser({ role: 'AGENT' });
  const manager = await seedUser({ role: 'MANAGER', totp: true });
  const options = { premiumTotal: '800.00' };
  const first = await seedContractEndingSoon(a.username, `${lastName}a`, options);
  const second = await seedContractEndingSoon(a.username, `${lastName}b`, options);
  const other = await seedContractEndingSoon(b.username, `${lastName}c`, options);
  for (const [user, contract] of [
    [a, first],
    [a, second],
    [b, other],
  ]) {
    await seedIssue(user.username, contract);
  }
  await seedPaymentToRemit(a.username, second, { amount: '300.00', daysAgo: 0 });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  // 1. The agent opens it from the menu: their own two contracts of the month, not B's.
  await login(page, a.username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await openMenu(page, 'État de production');
  await expect(page.getByRole('heading', { level: 1, name: 'État de production' })).toBeVisible();
  const table = page.getByRole('table', { name: 'État de production' });
  const listed = (contract) => page.getByText(contract.policyNumber, { exact: true });
  await expect(listed(first).first()).toBeVisible();
  await expect(listed(second).first()).toBeVisible();
  await expect(listed(other)).toHaveCount(0);
  await expect(page.getByLabel('Employé')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Exporter en Excel' })).toHaveCount(0);
  await expect(page.getByText('Encaissement : 300,00 MAD')).toBeVisible();
  if (!testInfo.project.name.startsWith('phone')) {
    await expect(table.getByRole('row').last()).toContainText('1 600,00 MAD');
    await expect(table.getByRole('row').last()).toContainText('1 300,00 MAD');
  }
  await expectNoHorizontalScroll(page, expect);
  await shot('production-agent');

  // 2. Partly paid only.
  await page
    .getByRole('group', { name: 'Paiement' })
    .getByText('Payé en partie', { exact: true })
    .click();
  await expect(listed(first)).toHaveCount(0);
  await expect(listed(second).first()).toBeVisible();

  // 3. The printed sheet: the agency's columns and totals, A4 landscape.
  await page.emulateMedia({ media: 'print' });
  const printed = page.locator('article.print-landscape');
  await expect(printed).toBeVisible();
  // Hidden from screen readers (the table above says the same): read as printed.
  await expect(printed.locator('th')).toHaveText([
    'Ordre',
    'N° de police',
    'Client',
    'Prime',
    'Effet',
    'Échéance',
    'Reste',
    'Date encaissée',
    'Annulé le',
    'Opérateur',
  ]);
  await expect(printed).toContainText('Encaissement');
  await shot('production-print');
  await page.emulateMedia({ media: 'screen' });

  // 4. A manager sees everyone's and may choose an employee.
  await signOut(page);
  await loginWithCode(page, manager.username, manager.secret);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto('/production');
  await expect(listed(other).first()).toBeVisible();
  await expect(listed(first).first()).toBeVisible();
  await expect(page.getByLabel('Employé')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exporter en Excel' })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('production-manager');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
