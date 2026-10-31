import { expect, test } from '@playwright/test';
import {
  currentCode,
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  seedUser,
  openMenu,
} from './support.js';

test.afterAll(disconnect);

test.describe('System status page', () => {
  test('shows the real server and database status to a manager, with no external requests', async ({
    page,
  }, testInfo) => {
    const { username, secret } = await seedUser({ role: 'MANAGER', totp: true });
    const { external, consoleMessages, errorResponses } = await guardOffline(page);

    await login(page, username);
    await page.getByLabel('Code à 6 chiffres').fill(currentCode(secret));
    await page.getByRole('button', { name: 'Vérifier' }).click();

    await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
    await openMenu(page, 'État du système');
    await expect(page.getByRole('heading', { level: 1, name: 'État du système' })).toBeVisible();
    const database = page.getByText('Base de données').locator('..');
    await expect(database.getByText('Disponible')).toBeVisible();

    expect(external).toEqual([]);
    expect(consoleMessages).toEqual([]);
    expect(errorResponses).toEqual([]);
    await expectNoHorizontalScroll(page, expect);
    await page.screenshot({
      path: testInfo.outputPath(`system-status-${testInfo.project.name}.png`),
      fullPage: true,
    });
  });

  test('offers a skip link as the first keyboard stop once signed in', async ({ page }) => {
    const { username } = await seedUser();
    await login(page, username);
    await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Aller au contenu' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
  });
});
