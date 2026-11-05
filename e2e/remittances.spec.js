import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  loginWithCode,
  seedContractEndingSoon,
  seedPaymentToRemit,
  seedUser,
} from './support.js';

test.afterAll(disconnect);

test('a manager sees a late remittance, records it with its bordereau and cancels it', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  // Each browser project uses its own insurer: both run at the same time on one database.
  const insurerCode = testInfo.project.name.startsWith('desktop') ? 'RMA' : 'CAT';
  const lastName = `Reversement${randomInt(100000, 999999)}`;
  const { username, secret } = await seedUser({ role: 'MANAGER', totp: true });
  const contract = await seedContractEndingSoon(username, lastName, {
    premiumTotal: '800.00',
    insurerCode,
  });
  // Collected 75 days ago: its month ended more than 15 days ago, so it is late (rule L5).
  const payment = await seedPaymentToRemit(username, contract, { amount: '800.00', daysAgo: 75 });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  // 1. The home page warns that premiums should already have been remitted.
  await loginWithCode(page, username, secret);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  const late = page.getByRole('link', {
    name: new RegExp(`^Reversement ${insurerCode} en retard : `),
  });
  await expect(late).toBeVisible();
  await late.click();

  // 2. What is owed to the insurer, per month of collection.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reversements aux assureurs' }),
  ).toBeVisible();
  const card = page.getByRole('region', { name: new RegExp(`^${insurerCode}`) });
  await expect(card.getByText(/^En retard de \d+ jours?$/).first()).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('remittances');

  // 3. The previous months are proposed; the reference of the transfer is required.
  await card.getByRole('button', { name: 'Enregistrer un reversement' }).click();
  const dialog = page.getByRole('dialog', { name: new RegExp(`^Reversement à ${insurerCode}`) });
  await expect(dialog.getByText(/^Montant à reverser : /)).toBeVisible();
  const submit = dialog.getByRole('button', { name: 'Enregistrer un reversement' });
  await expect(submit).toBeDisabled();
  await dialog.getByLabel('Référence du virement').fill('VIR-E2E-0001');
  await shot('remittance-dialog');
  await submit.click();

  // 4. The bordereau lists the payment and can be printed.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bordereau de reversement' }),
  ).toBeVisible();
  await expect(page.getByText(/^VER-\d{4}-\d{5}$/)).toBeVisible();
  await expect(page.getByRole('cell', { name: payment.receiptNumber })).toBeVisible();
  await expect(page.getByRole('cell', { name: `Sara ${lastName}` })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('bordereau');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Imprimer' })).toBeHidden();
  await expect(page.getByRole('cell', { name: payment.receiptNumber })).toBeVisible();
  await shot('bordereau-print');
  await page.emulateMedia({ media: 'screen' });

  // 5. Recorded by mistake: cancelled with a reason, the payment is to remit again.
  await page.getByRole('button', { name: 'Annuler le reversement' }).click();
  const cancel = page.getByRole('dialog', { name: /^Annuler le reversement VER-/ });
  await cancel.getByLabel('Motif').fill('Virement refusé par la banque');
  await cancel.getByRole('button', { name: 'Annuler le reversement' }).click();
  await expect(
    page.getByText(/^Reversement annulé le .* : Virement refusé par la banque$/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Annuler le reversement' })).toBeHidden();
  await page.getByRole('link', { name: 'Retour aux reversements' }).click();
  await expect(card.getByText(/^En retard de \d+ jours?$/).first()).toBeVisible();
  const history = page.getByRole('region', { name: 'Reversements enregistrés' });
  // A table row on a computer, a card on a phone: the newest remittance first, cancelled.
  const newest =
    testInfo.project.name === 'phone-390'
      ? history.getByRole('listitem').first()
      : history.getByRole('row').nth(1);
  await expect(newest).toContainText('Annulé');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
