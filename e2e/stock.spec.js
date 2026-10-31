import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  loginWithCode,
  prepareSeriesForStock,
  seedUser,
  openMenu,
} from './support.js';

test.afterAll(disconnect);

test('a manager receives blank attestations and declares one damaged, with its history', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  // Synthetic numbers, unique per run: both browser projects share the database.
  const base = randomInt(100000000, 899999999);
  const first = String(base);
  const last = String(base + 4);
  const damaged = String(base + 2);
  await prepareSeriesForStock();
  const { username, secret } = await seedUser({ role: 'MANAGER', totp: true });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await loginWithCode(page, username, secret);
  await openMenu(page, 'Stock d’attestations');
  await expect(page.getByRole('heading', { level: 1, name: 'Stock d’attestations' })).toBeVisible();

  // 1. Five forms of CAT 91 E received, kept by the manager.
  await page.getByRole('button', { name: 'Réceptionner un lot' }).click();
  let dialog = page.getByRole('dialog', { name: 'Réceptionner un lot' });
  await dialog
    .getByLabel('Série')
    .selectOption({ label: 'CAT 91 E · Véhicules à deux ou trois roues' });
  await dialog.getByLabel('Premier numéro').fill(first);
  await dialog.getByLabel('Dernier numéro').fill(last);
  await dialog.getByLabel('Reçu le').fill('2026-10-20');
  await dialog.getByLabel('Lieu de rangement').fill('Armoire fermée (test)');
  await dialog.getByLabel('Responsable').selectOption({ label: 'Utilisateur test manager' });
  await dialog.getByRole('button', { name: 'Réceptionner un lot' }).click();
  await expect(page.getByText(`5 formulaires · n° ${first} à ${last}`).first()).toBeVisible();

  // 2. One of them declared damaged, with a reason.
  await page.getByRole('button', { name: 'Enregistrer un mouvement' }).click();
  dialog = page.getByRole('dialog', { name: 'Enregistrer un mouvement' });
  await dialog.getByLabel('Mouvement').selectOption({ label: 'Déclarer abîmé' });
  await dialog
    .getByLabel('Série')
    .selectOption({ label: 'CAT 91 E · Véhicules à deux ou trois roues' });
  await dialog.getByLabel('Premier numéro').fill(damaged);
  await dialog.getByLabel('Dernier numéro').fill(damaged);
  await dialog.getByLabel('Motif').fill('Imprimante bloquée (test)');
  await dialog.getByRole('button', { name: 'Déclarer abîmé' }).click();
  await expect(page.getByText('1 formulaire mis à jour.')).toBeVisible();

  // 3. The form's history shows both movements.
  const search = page.getByRole('region', { name: 'Rechercher un formulaire' });
  await search.getByLabel('Numéro').fill(damaged);
  await search.getByRole('button', { name: 'Rechercher' }).click();
  await expect(search.getByRole('listitem').filter({ hasText: damaged })).toContainText('Abîmé');
  await expectNoHorizontalScroll(page, expect);
  await shot('stock');
  await search.getByRole('button', { name: `CAT 91 E n° ${damaged}` }).click();
  dialog = page.getByRole('dialog', { name: new RegExp(damaged) });
  await expect(dialog.getByText('En stock → Abîmé')).toBeVisible();
  await expect(dialog.getByText(/Imprimante bloquée \(test\)/)).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
