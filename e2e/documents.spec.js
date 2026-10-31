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

/** A small synthetic PDF: only its first bytes matter to the server. */
const pdf = (text) => Buffer.from(`%PDF-1.7\n% ${text}\n%%EOF\n`);

test('an agent attaches the scan of an insurer document to a contract and opens it', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const lastName = `Document${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  const contract = await seedContractEndingSoon(username, lastName);
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto(`/contrats/${contract.id}`);
  const documents = page.getByRole('region', { name: 'Documents de l’assureur' });
  await expect(documents.getByText('Aucun document joint.')).toBeVisible();

  // 1. The scan of the attestation printed by the platform.
  await documents.getByRole('button', { name: 'Joindre un document' }).click();
  let dialog = page.getByRole('dialog', { name: 'Joindre un document de l’assureur' });
  await dialog.getByLabel('Type de document').selectOption({ label: 'Attestation d’assurance' });
  await dialog.getByLabel('Fichier').setInputFiles({
    name: `Attestation ${lastName}.pdf`,
    mimeType: 'application/pdf',
    buffer: pdf('flou'),
  });
  await shot('document-upload');
  await dialog.getByRole('button', { name: 'Joindre' }).click();
  const link = documents.getByRole('link', { name: `Attestation ${lastName}.pdf` });
  await expect(link).toBeVisible();

  // 2. Opening it gives back the same file, from the agency's server.
  const response = await page.request.get(await link.getAttribute('href'));
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/pdf');
  expect((await response.body()).toString()).toContain('% flou');

  // 3. A clearer scan replaces it; the first one stays in the history.
  await documents.getByRole('button', { name: 'Remplacer' }).click();
  dialog = page.getByRole('dialog', { name: /^Remplacer « Attestation / });
  await dialog.getByLabel('Fichier').setInputFiles({
    name: `Attestation nette ${lastName}.pdf`,
    mimeType: 'application/pdf',
    buffer: pdf('net'),
  });
  await dialog.getByRole('button', { name: 'Joindre' }).click();
  await expect(
    documents.getByText(`Remplacé par « Attestation nette ${lastName}.pdf »`),
  ).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('documents');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
