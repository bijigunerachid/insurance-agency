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

test('an agent sees a renewal on the home page, follows it and prepares the new contract', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const lastName = `Renouv${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  const contract = await seedContractEndingSoon(username, lastName);
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  // 1. The home page lists the renewal: the contract ends in 10 days.
  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  const row = page.getByRole('listitem').filter({ hasText: contract.policyNumber });
  await expect(row).toContainText('Dans 10 jours');
  await expectNoHorizontalScroll(page, expect);
  await shot('home');

  // 2. The follow-up: customer contacted, with a note.
  await row.getByRole('link', { name: `Sara ${lastName}` }).click();
  await page.getByLabel('Nouvelle étape').selectOption({ label: 'Client contacté' });
  await page.getByLabel('Note').fill('Appelé, passe à l’agence lundi');
  await page.getByRole('button', { name: 'Enregistrer le suivi' }).click();
  const history = page.getByRole('region', { name: 'Historique du suivi' });
  await expect(history.getByText('À préparer → Client contacté')).toBeVisible();
  await expect(history.getByText('Appelé, passe à l’agence lundi')).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('renewal');

  // 3. The new contract is prepared as a draft, linked to the old one.
  // The platform gives a new policy number at every renewal: last year's is refused.
  await page.getByRole('button', { name: 'Préparer le nouveau contrat' }).click();
  const dialog = page.getByRole('dialog', { name: 'Préparer le nouveau contrat' });
  const policy = dialog.getByLabel('N° de police');
  await expect(policy).toHaveValue('');
  await policy.fill(contract.policyNumber);
  await dialog.getByRole('button', { name: 'Préparer le nouveau contrat' }).click();
  await expect(
    dialog.getByText('un renouvellement a toujours un nouveau n° de police'),
  ).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('renew-same-number');
  const newNumber = `${contract.policyNumber}-27`;
  await policy.fill(newNumber);
  await dialog.getByRole('button', { name: 'Préparer le nouveau contrat' }).click();
  const header = page.getByRole('heading', { level: 1 }).locator('..');
  await expect(header.getByText('En préparation', { exact: true })).toBeVisible();
  await expect(header).toContainText(newNumber);
  // Last year's contract stays reachable under its own number.
  await expect(page.getByRole('link', { name: contract.policyNumber, exact: true })).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
