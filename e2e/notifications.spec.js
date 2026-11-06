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

test('an agent is told at once what a colleague recorded, and of a renewal coming', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const phone = testInfo.project.name.startsWith('phone');
  const lastName = `Notif${randomInt(100000, 999999)}`;
  const a = await seedUser({ role: 'AGENT' });
  const b = await seedUser({ role: 'AGENT' });
  // Agent A's contract ends in 10 days: its renewal is announced (15-day step) to everyone.
  const contract = await seedContractEndingSoon(a.username, lastName, { premiumTotal: '800.00' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  // 1. Agent B is working.
  await login(page, b.username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Notifications/ })).toBeVisible();

  // 2. Meanwhile agent A takes a payment of 300 MAD, in another browser.
  const other = await browser.newContext({
    viewport: page.viewportSize(),
    baseURL: testInfo.project.use.baseURL,
    ignoreHTTPSErrors: true,
  });
  const colleague = await other.newPage();
  await login(colleague, a.username);
  await expect(colleague.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await colleague.goto('/contrats');
  await colleague.getByLabel('Rechercher (n° de police, client)').fill(contract.policyNumber);
  await colleague.getByRole('button', { name: 'Rechercher' }).click();
  await expect(colleague.getByText('1 résultat', { exact: true })).toBeVisible();
  await colleague
    .getByRole('button', { name: `Encaisser un paiement pour ${contract.policyNumber}` })
    .click();
  const dialog = colleague.getByRole('dialog', { name: 'Encaisser un paiement' });
  await dialog.getByLabel('Montant (MAD)').fill('300');
  await dialog.getByRole('button', { name: 'Encaisser' }).click();
  await expect(
    colleague.getByRole('heading', { level: 1, name: 'Reçu de paiement' }),
  ).toBeVisible();
  await other.close();

  // 3. B's next check (every 30 s, or at once when the tab is shown again): a pop-up.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const popup = page.getByRole('link', {
    name: new RegExp(`a encaissé 300,00\\sMAD pour le contrat ${contract.policyNumber}`),
  });
  await expect(popup).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('popup');

  // 4. The bell counts it; its panel says who did it.
  const bell = page.getByRole('button', { name: /^Notifications, \d+ nouvelles?$/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const panel = page.getByRole('region', { name: 'Dernières notifications' });
  await expect(panel.getByText(new RegExp(`a encaissé 300,00\\sMAD`)).first()).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('bell');

  // 5. Seen: the count is gone; the history keeps everything.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible();
  await page.goto('/notifications');
  await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  // The renewal coming, with who follows it: the alerts of the day are looked for at most once
  // a minute, so it may take that long to be written.
  const renewal = page.getByText(
    `Renouvellement dans 10 jours : Sara ${lastName} (${contract.policyNumber}), suivi par Utilisateur test agent`,
  );
  await expect(async () => {
    await page.reload();
    await page
      .getByRole('group', { name: 'Afficher' })
      .getByText('Renouvellements', { exact: true })
      .click();
    await expect(renewal).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 90_000, intervals: [5000] });
  if (!phone) await expect(page.getByText(/^Dernière action : À préparer/).first()).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('history');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
