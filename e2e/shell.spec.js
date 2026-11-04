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

test('an agent finds a client from any page with the quick search, and reduces the menu', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const phone = testInfo.project.name.startsWith('phone');
  const lastName = `Rapide${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  await seedContractEndingSoon(username, lastName, { premiumTotal: '300.00' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.getByRole('link', { name: 'Contrats' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contrats' })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('shell-contracts');

  // From the contracts page: Ctrl+K, Escape closes; the button opens it again.
  await page.keyboard.press('Control+K');
  const dialog = page.getByRole('dialog', { name: 'Recherche rapide' });
  await expect(dialog.getByRole('searchbox', { name: 'Recherche rapide' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Recherche rapide' }).click();
  await dialog.getByRole('searchbox', { name: 'Recherche rapide' }).fill(lastName.toLowerCase());
  await shot('shell-quick-search');
  await dialog.getByRole('link', { name: new RegExp(`Sara ${lastName}`) }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Sara ${lastName}` })).toBeVisible();
  await expect(dialog).toBeHidden();

  if (!phone) {
    // The side menu reduced to icons, still so after a reload.
    await page.getByRole('button', { name: 'Réduire le menu' }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Réduire le menu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('link', { name: 'Clients', exact: true })).toBeVisible();
    await expectNoHorizontalScroll(page, expect);
    await shot('shell-collapsed');
    await page.getByRole('button', { name: 'Réduire le menu' }).click();
  }

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
