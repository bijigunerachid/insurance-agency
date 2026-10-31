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

test('a Windows alert tells the agent an insurance is ending; clicking it opens the renewals', async ({
  page,
  context,
}, testInfo) => {
  const lastName = `Alerte${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  // Ends in 10 days: its renewal opens and is this agent's.
  await seedContractEndingSoon(username, lastName);
  await context.grantPermissions(['notifications']);
  // Records the notifications instead of showing them on the test machine.
  await page.addInitScript(() => {
    window.__alerts = [];
    class Recorder {
      static permission = 'granted';
      static requestPermission = async () => 'granted';
      constructor(title, options) {
        this.title = title;
        this.body = options.body;
        this.close = () => {};
        window.__alerts.push(this);
      }
    }
    window.Notification = Recorder;
  });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await expect(page.getByText('Alertes Windows activées sur ce PC.')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.__alerts.length), { timeout: 15_000 })
    .toBeGreaterThan(0);
  const [alert] = await page.evaluate(() =>
    window.__alerts.map((a) => ({ title: a.title, body: a.body })),
  );
  expect(alert.title).toBe('Assurances à renouveler');
  expect(alert.body).toMatch(/(finit|finissent) dans moins de 30 jours/);
  expect(alert.body).not.toContain(lastName);
  await expectNoHorizontalScroll(page, expect);
  await page.screenshot({
    path: testInfo.outputPath(`alerts-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await page.evaluate(() => window.__alerts[0].onclick());
  await expect(page.getByRole('heading', { level: 1, name: 'Renouvellements' })).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
