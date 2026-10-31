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

test('an agent types the conditions particulières beside the scan and corrects the missing premium', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const lastName = `Saisie${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  // Issued, with the insurer's policy number but no premium yet.
  const contract = await seedContractEndingSoon(username, lastName);
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto(`/contrats/${contract.id}`);
  const documents = page.getByRole('region', { name: 'Documents de l’assureur' });
  await documents.getByRole('button', { name: 'Joindre un document' }).click();
  const dialog = page.getByRole('dialog', { name: 'Joindre un document de l’assureur' });
  await dialog.getByLabel('Type de document').selectOption({ label: 'Conditions particulières' });
  await dialog.getByLabel('Fichier').setInputFiles({
    name: `CP ${lastName}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n% conditions particulieres\n%%EOF\n'),
  });
  await dialog.getByRole('button', { name: 'Joindre' }).click();

  // 1. Beside the scan, the values printed on the document.
  await documents.getByRole('link', { name: 'Saisir les informations' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Saisie : Conditions particulières' }),
  ).toBeVisible();
  await page.getByLabel('N° de police').fill(contract.policyNumber);
  await page.getByLabel('Prime TTC (MAD)').fill('1 500,00');
  await page.getByRole('button', { name: 'Enregistrer la saisie' }).click();
  await expect(page.getByText('Saisie enregistrée.')).toBeVisible();

  // 2. The comparison: same policy number, premium missing in the app.
  const checks = page.getByRole('region', { name: 'Comparaison avec l’application' });
  const policy = checks.getByRole('listitem').filter({ hasText: 'N° de police' });
  await expect(policy.getByText('Identique')).toBeVisible();
  const premium = checks.getByRole('listitem').filter({ hasText: 'Prime TTC (MAD)' });
  await expect(premium.getByText('Absent de l’application')).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('capture');

  // 3. One click copies the premium onto the issued contract.
  await premium.getByRole('button', { name: 'Corriger le contrat' }).click();
  await expect(page.getByText('Contrat corrigé avec la valeur du document.')).toBeVisible();
  await expect(premium.getByText('Identique')).toBeVisible();
  await page.getByRole('link', { name: 'Retour au contrat' }).click();
  const payments = page.getByRole('region', { name: 'Paiements' });
  await expect(payments.getByText('1 500,00 MAD').first()).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
