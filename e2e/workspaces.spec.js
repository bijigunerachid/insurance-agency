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

/** Every image of the cards really loaded (synthetic logos and photos of the test settings). */
async function expectImagesLoaded(page) {
  const images = page.getByRole('list', { name: 'Espaces de travail' }).locator('img');
  await expect(images).toHaveCount(4);
  for (const image of await images.all()) {
    await expect
      .poll(() => image.evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true);
  }
}

test('after sign-in, an agent chooses a workspace, switches it, and finds the cards again', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const lastName = `Espace${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  const rma = await seedContractEndingSoon(username, lastName, { premiumTotal: '600.00' });
  // Its own name: the helper makes one product per name (here at CAT); the search finds both.
  const cat = await seedContractEndingSoon(username, `${lastName}Cat`, {
    premiumTotal: '400.00',
    insurerCode: 'CAT',
  });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username, undefined, { workspaces: 'ask' });
  await expect(page.getByRole('heading', { level: 1, name: /^Bienvenue, / })).toBeVisible();
  await expect(page.getByText('Choisissez votre espace de travail')).toBeVisible();
  const rmaCard = page.getByRole('button', { name: 'Accéder à l’espace RMA' });
  const catCard = page.getByRole('button', { name: 'Accéder à l’espace CAT' });
  await expect(rmaCard).toHaveAccessibleDescription('RMA Essai Assurance automobile (synthétique)');
  await expect(catCard).toBeVisible();
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
  await expectImagesLoaded(page);
  await expectNoHorizontalScroll(page, expect);
  await shot('workspace-cards');

  // With the keyboard: the RMA card opens the RMA workspace.
  await rmaCard.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await expect(
    page.getByText('Espace RMA : seuls les dossiers RMA sont affichés ici.'),
  ).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('workspace-rma-home');

  // The contracts list shows RMA's contract only.
  const searchContracts = async () => {
    await page.getByRole('link', { name: 'Contrats' }).first().click();
    await page.getByRole('searchbox', { name: /Rechercher/ }).fill(lastName);
    await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  };
  await searchContracts();
  await expect(page.getByRole('link', { name: rma.ref }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: cat.ref })).toHaveCount(0);

  // Another workspace from the header: back to the cards, then CAT.
  await page.getByRole('button', { name: 'Espace RMA — changer d’espace' }).click();
  await expect(page).toHaveURL(/\/$/);
  await catCard.click();
  await expect(
    page.getByText('Espace CAT : seuls les dossiers CAT sont affichés ici.'),
  ).toBeVisible();
  await searchContracts();
  await expect(page.getByRole('link', { name: cat.ref }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: rma.ref })).toHaveCount(0);
  await shot('workspace-cat-contracts');

  // "See both" on the list itself.
  await page.getByRole('button', { name: 'Voir les deux' }).click();
  await expect(page.getByRole('link', { name: rma.ref }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: cat.ref }).first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Les deux compagnies — changer d’espace' }),
  ).toBeVisible();

  // A reload keeps the workspace; signing out and in again shows the cards again.
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Les deux compagnies — changer d’espace' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await login(page, username, undefined, { workspaces: 'ask' });
  await expect(page.getByRole('heading', { level: 1, name: /^Bienvenue, / })).toBeVisible();
  // From the cards, signing out is one click.
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
