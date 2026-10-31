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

test('an agent records a payment at the counter and prints its receipt', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const lastName = `Paiement${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  const contract = await seedContractEndingSoon(username, lastName, { premiumTotal: '1234.50' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  // 1. On the contract: premium 1 234,50 MAD, nothing paid yet.
  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto(`/contrats/${contract.id}`);
  const payments = page.getByRole('region', { name: 'Paiements' });
  await expect(payments.getByText('1 234,50 MAD').first()).toBeVisible();

  // 2. Cash payment of 500 MAD: the receipt opens.
  await payments.getByRole('button', { name: 'Encaisser' }).click();
  const dialog = page.getByRole('dialog', { name: 'Encaisser un paiement' });
  await dialog.getByLabel('Montant (MAD)').fill('500');
  // The customer hands over 600 MAD: the change is said, then printed.
  await dialog.getByLabel('Somme reçue (facultatif, MAD)').fill('600');
  await expect(dialog.getByText('À rendre : 100,00 MAD')).toBeVisible();
  await dialog.getByRole('button', { name: 'Encaisser' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reçu de paiement' })).toBeVisible();
  // One sheet, two copies: one for the agency, one for the client.
  const agencyCopy = page.getByRole('article', { name: 'Exemplaire agence' });
  const clientCopy = page.getByRole('article', { name: 'Exemplaire client' });
  for (const copy of [agencyCopy, clientCopy]) {
    await expect(copy.getByText(/^REC-\d{4}-\d{5}$/)).toBeVisible();
    // The agency's own logo heads the copy; its legal line closes it.
    const logo = copy.getByRole('img', { name: 'Agence Essai Assurances et Conseils' });
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(copy.locator('footer')).toContainText(
      'Agence Essai Assurances et Conseils S.A.R.L au capital de 100 000,00 DH',
    );
    await expect(copy.locator('footer')).toContainText('ICE 000000000000000');
    await expect(copy.getByText('Signature du client')).toBeVisible();
    await expect(copy.getByText('Cachet et signature de l’agence')).toBeVisible();
    await expect(copy.getByText('500,00 MAD', { exact: true })).toBeVisible();
    await expect(copy.getByText('Somme reçue : 600,00 MAD · Rendu : 100,00 MAD')).toBeVisible();
    await expect(copy.getByText(`Sara ${lastName}`, { exact: false })).toBeVisible();
  }
  await expectNoHorizontalScroll(page, expect);
  await shot('receipt');
  // Printed: only the receipt, without the menu, the header or the buttons.
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Imprimer' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeHidden();
  await expect(agencyCopy.getByText('500,00 MAD')).toBeVisible();
  await expect(clientCopy.getByText('500,00 MAD')).toBeVisible();
  // Both copies fit on one A4 sheet.
  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true });
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);
  await shot('receipt-print');
  await page.emulateMedia({ media: 'screen' });

  // 3. Back on the contract: 734,50 MAD left to pay.
  await page.getByRole('link', { name: 'Retour au contrat' }).click();
  await expect(payments.getByText('734,50 MAD')).toBeVisible();

  // 4. The rest in cash: the customer gives 735,00, the agency keeps the 0,50 gap. The payment
  // and the receipt stay at the exact 734,50 owed to the insurer.
  await payments.getByRole('button', { name: 'Encaisser' }).click();
  await dialog.getByLabel('Le client a payé un montant arrondi').check();
  await dialog.getByLabel('Montant donné par le client (MAD)').fill('735');
  await expect(dialog.getByRole('status')).toHaveText(
    'Écart pour l’agence : +0,50 MAD (gardé par l’agence).',
  );
  await expectNoHorizontalScroll(page, expect);
  await shot('payment-rounding');
  await dialog.getByRole('button', { name: 'Encaisser' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reçu de paiement' })).toBeVisible();
  await expect(agencyCopy.getByText('734,50 MAD')).toBeVisible();
  await expect(page.getByText(/735,00|Arrondi|Écart/)).toHaveCount(0);
  await page.getByRole('link', { name: 'Retour au contrat' }).click();
  await expect(payments.getByText('0,00 MAD', { exact: true })).toBeVisible();
  await expect(
    payments.getByText('Arrondi : le client a donné 735,00 MAD (écart agence +0,50 MAD)'),
  ).toBeVisible();

  // 5. The day's payments show the roundings beside the totals per method.
  await page.goto('/paiements');
  await expect(page.getByText(/^Écarts? d’arrondi · \d+ paiements?$/)).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('payments-roundings');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
