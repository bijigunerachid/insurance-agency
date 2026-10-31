import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  PASSWORD,
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  loginWithCode,
  nextCode,
  seedContractEndingSoon,
  seedPaymentToRemit,
  seedUser,
  openMenu,
} from './support.js';

test.afterAll(disconnect);

test('a manager reads the payments of the day and exports them to Excel after confirming their identity', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const lastName = `Rapport${randomInt(100000, 999999)}`;
  const { username, secret } = await seedUser({ role: 'MANAGER', totp: true });
  const contract = await seedContractEndingSoon(username, lastName, { premiumTotal: '900.00' });
  await seedPaymentToRemit(username, contract, { amount: '900.00', daysAgo: 0 });
  // A customer who paid 510,00 of 512,64.
  const short = await seedContractEndingSoon(username, `${lastName}B`, {
    premiumTotal: '512.64',
  });
  await seedPaymentToRemit(username, short, { amount: '510.00', daysAgo: 0 });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await loginWithCode(page, username, secret);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await openMenu(page, 'Rapports');
  await expect(page.getByRole('heading', { level: 1, name: 'Rapports' })).toBeVisible();

  // 1. Payments per day this month: today's line includes the 900 MAD just received.
  await page.getByLabel('Rapport', { exact: true }).selectOption({ label: 'Paiements par jour' });
  // The current month is proposed, its quick button marked.
  await expect(page.getByRole('button', { name: 'Ce mois-ci' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const table = page.getByRole('table');
  await expect(table.getByRole('columnheader', { name: 'Espèces' })).toBeVisible();
  await expect(table.getByRole('row').last()).toContainText('Total');
  await expectNoHorizontalScroll(page, expect);
  await shot('reports');

  // 2. The export asks for the password and the code again, then downloads the workbook.
  await page.getByRole('button', { name: 'Exporter en Excel' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmer votre identité' });
  await dialog.getByLabel('Mot de passe').fill(PASSWORD);
  await dialog.getByLabel('Code à 6 chiffres').fill(nextCode(secret));
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Confirmer' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^paiements-jour_\d{4}-\d{2}-01_\d{4}-\d{2}-\d{2}\.xlsx$/,
  );
  expect(
    readFileSync(await file.path())
      .subarray(0, 2)
      .toString(),
  ).toBe('PK');
  await expect(page.getByText(/^Fichier téléchargé : paiements-jour_/)).toBeVisible();

  // 3. The balances still owed: 2,64 MAD, long after the start of the cover, to chase.
  await page
    .getByLabel('Rapport', { exact: true })
    .selectOption({ label: 'Soldes clients à recouvrer' });
  const owed = page.getByRole('row', { name: new RegExp(`Sara ${lastName}B`) });
  await expect(owed).toContainText('2,64');
  await expect(owed).toContainText('Plus de 15 jours');
  await expect(page.getByRole('row', { name: new RegExp(`Sara ${lastName} `) })).toHaveCount(0);
  await expectNoHorizontalScroll(page, expect);
  await shot('report-balances');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  // The first export attempt is refused until the identity is confirmed: expected.
  expect(errorResponses).toEqual([
    expect.stringMatching(/^GET \/api\/reports\/paiements-jour\/export 403$/),
  ]);
});
