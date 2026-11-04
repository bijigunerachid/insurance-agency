import { expect, test } from '@playwright/test';

const { PRODUCTION_URL, SMOKE_USERNAME, SMOKE_PASSWORD } = process.env;

test.beforeAll(() => {
  if (!PRODUCTION_URL || !SMOKE_USERNAME || !SMOKE_PASSWORD) {
    throw new Error('Set PRODUCTION_URL, SMOKE_USERNAME and SMOKE_PASSWORD (see the config).');
  }
});

test('the installed server answers over HTTPS, locked down, and an agent signs in', async ({
  page,
}, testInfo) => {
  const origin = new URL(PRODUCTION_URL).origin;
  // Every request stays on the agency's server; any console message (a CSP refusal) fails.
  const outside = [];
  const consoleMessages = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin && url.protocol !== 'data:') outside.push(request.url());
  });
  page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));

  // 1. The screens, with the security headers set by the proxy.
  const response = await page.goto('/');
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['strict-transport-security']).toContain('max-age=');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers.server).toBeUndefined();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('production-login.png') });

  // 2. A wrong password: the API answers through the proxy, with the generic message.
  await page.getByLabel('Identifiant').fill(SMOKE_USERNAME);
  await page.getByLabel('Mot de passe').fill('pas-le-bon-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText(/Identifiant ou mot de passe incorrect/)).toBeVisible();

  // 3. The right one: the home page, then a list read from the database.
  await page.getByLabel('Mot de passe').fill(SMOKE_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  // With two active insurers the workspace cards come first (their images through the proxy).
  const landing = page.getByRole('heading', { level: 1, name: /^(Bonjour |Bienvenue, )/ });
  await expect(landing).toBeVisible();
  if ((await landing.textContent()).startsWith('Bienvenue')) {
    await page.screenshot({ path: testInfo.outputPath('production-workspaces.png') });
    await page.getByRole('button', { name: 'Travailler sur les deux compagnies' }).click();
  }
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.getByRole('link', { name: 'Clients', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Clients' })).toBeVisible();
  await page.goto('/accueil');
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('production-home.png'), fullPage: true });
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByText('Vous êtes déconnecté.')).toBeVisible();

  // The wrong password above is expected in the console (401); nothing else.
  expect(consoleMessages.filter((m) => !m.includes('401'))).toEqual([]);
  expect(outside).toEqual([]);
});
