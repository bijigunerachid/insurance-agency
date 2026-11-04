import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  seedContractEndingSoon,
  seedUser,
  signOut,
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
  // Sara (the RMA client) also has a CAT contract: her page shows both.
  const second = await seedContractEndingSoon(username, `${lastName}Deux`, {
    insurerCode: 'CAT',
    customerId: rma.customerId,
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

  // The clients: Sara (RMA) is listed, the CAT-only client is not.
  await page.getByRole('link', { name: 'Clients' }).first().click();
  await expect(page.getByText(/^Espace RMA : les clients qui ont un contrat RMA/)).toBeVisible();
  await page.getByRole('searchbox', { name: /Nom, référence/ }).fill(lastName);
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect(page.getByRole('link', { name: `Sara ${lastName}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `Sara ${lastName}Cat` })).toHaveCount(0);
  // Her page: the RMA contract first, the CAT one under « Autres compagnies ».
  await page.getByRole('link', { name: `Sara ${lastName}`, exact: true }).click();
  const others = page.getByRole('region', { name: 'Autres compagnies' });
  await expect(others.getByRole('link', { name: second.ref }).first()).toBeVisible();
  await expect(others.getByRole('link', { name: rma.ref })).toHaveCount(0);
  await expectNoHorizontalScroll(page, expect);
  await shot('workspace-rma-client');

  // Another space from the header's menu: CAT, staying on Sara's page.
  const clientUrl = page.url();
  await page.getByRole('button', { name: 'Espace RMA — changer d’espace' }).click();
  await page.getByRole('menuitemradio', { name: 'CAT Essai' }).click();
  await expect(page.getByRole('button', { name: 'Espace CAT — changer d’espace' })).toBeVisible();
  expect(page.url()).toBe(clientUrl);
  await searchContracts();
  await expect(
    page.getByText('Espace CAT : seuls les dossiers CAT sont affichés ici.'),
  ).toBeVisible();
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
  // Signing out once the page has loaded: the background requests (renewal alerts) are
  // answered, so the error check below stays strict. Signing out sooner is covered by the
  // screen test « says déconnecté, not session ended » (Auth.test.jsx).
  await page.waitForLoadState('networkidle');
  // The big cards are still one choice away, from any page.
  await page.getByRole('button', { name: 'Les deux compagnies — changer d’espace' }).click();
  await page.getByRole('menuitem', { name: 'Voir les cartes des espaces' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Bienvenue, / })).toBeVisible();
  await catCard.click();
  await expect(page.getByRole('button', { name: 'Espace CAT — changer d’espace' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await signOut(page);
  await expect(page.getByText('Vous êtes déconnecté.')).toBeVisible();
  await login(page, username, undefined, { workspaces: 'ask' });
  await expect(page.getByRole('heading', { level: 1, name: /^Bienvenue, / })).toBeVisible();
  // From the cards, signing out is one click.
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
