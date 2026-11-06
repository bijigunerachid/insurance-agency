import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  loginWithCode,
  seedContractEndingSoon,
  seedUser,
} from './support.js';

test.afterAll(disconnect);

test('on « Aujourd’hui » everyone sees the agency’s renewals, with who follows each', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  // A colleague recorded a contract ending soon: they follow its renewal.
  const colleague = await seedUser({ role: 'AGENT' });
  await seedContractEndingSoon(colleague.username, `Renouv${randomInt(100000, 999999)}`);
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  // A manager, who records no contract, sees renewals followed by others.
  const manager = await seedUser({ role: 'MANAGER', totp: true });
  await loginWithCode(page, manager.username, manager.secret);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  const next = page.getByRole('region', { name: 'Prochains renouvellements' });
  await expect(next.getByRole('radio', { name: 'Tous' })).toBeChecked();
  await expect(next.getByText(/Suivi par /).first()).toBeVisible();
  await expect(next.getByText(/Suivi par vous/)).toHaveCount(0);
  await expectNoHorizontalScroll(page, expect);
  await next.scrollIntoViewIfNeeded();
  await shot('today-renewals-all');

  // Their own: none.
  await next.getByText('Les miens', { exact: true }).click();
  await expect(next.getByText('Aucun renouvellement à suivre pour vous.')).toBeVisible();
  await expect(next.getByText(/Suivi par /)).toHaveCount(0);

  // The colleague sees them too, theirs saying « vous ».
  await page.context().clearCookies();
  await login(page, colleague.username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await next.getByText('Les miens', { exact: true }).click();
  await expect(next.getByText(/Suivi par vous/).first()).toBeVisible();
  await shot('today-renewals-mine');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
