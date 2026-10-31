import { randomInt } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  expectNoHorizontalScroll,
  guardOffline,
  login,
  platformSheet,
  seedAttestation,
  seedInsuredCar,
  seedUser,
} from './support.js';

test('an agent files a vehicle-change avenant from the platform PDF, then collects its amount and the old paper', async ({
  page,
  browser,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const unique = randomInt(10000, 99999);
  const lastName = `Avenant${unique}`;
  const { username } = await seedUser({ role: 'AGENT' });
  // A car insured with RMA, its attestation for the year: the car the avenant replaces.
  const { contract, cin, vehicle } = await seedInsuredCar(username, lastName);
  const old = await seedAttestation(username, contract, vehicle);
  const effect = new Date();
  effect.setUTCHours(0, 0, 0, 0);
  effect.setUTCDate(effect.getUTCDate() - 5);
  const number = String(randomInt(100000000, 999999999));
  const newPlate = `${unique}-A-57`;
  const sheet = await platformSheet(browser, {
    number,
    policy: contract.policyNumber,
    cin,
    name: `${lastName.toUpperCase()} SARA`,
    registration: newPlate,
    from: effect,
    to: contract.endDate,
    avenant: { number: `26${String(unique).padStart(8, '0')}`, total: '512.64' },
  });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto('/scans');
  await page.getByLabel('Scan de l’attestation').setInputFiles({
    name: `avenant-${unique}.pdf`,
    mimeType: 'application/pdf',
    buffer: sheet,
  });
  await page.getByRole('button', { name: 'Lire l’attestation' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vérifier le scan' })).toBeVisible();

  // The PDF says it is an avenant: the contract already recorded is the one it changes.
  const avenant = page.getByRole('region', { name: 'Avenant' });
  await expect(avenant.getByText(/changement de vehicule \(n° 26/)).toBeVisible();
  await expect(avenant.getByLabel('Type d’avenant')).toHaveValue('VEHICLE_CHANGE');
  await expect(avenant.getByLabel('Montant de l’avenant (MAD)')).toHaveValue('512.64');
  await expect(avenant.getByLabel('Véhicule remplacé')).toHaveValue(vehicle.id);
  const contractCard = page.getByRole('region', { name: 'Contrat' });
  await expect(contractCard.getByText(contract.ref)).toBeVisible();
  // The new car is not recorded yet: it is created from the sheet.
  const car = page.getByRole('region', { name: 'Véhicule' });
  await expect(car.getByLabel('Immatriculation')).toHaveValue(newPlate);
  await expect(car.getByLabel('Marque')).toHaveValue('DACIA');
  await car.getByLabel('Catégorie').selectOption({ label: 'Voiture' });
  await expectNoHorizontalScroll(page, expect);
  await shot('avenant-review');
  await page.getByRole('button', { name: 'Enregistrer et suivre' }).click();

  // The contract: the new car covered, the avenant listed, its amount to collect.
  await expect(page.getByRole('heading', { level: 1, name: `Sara ${lastName}` })).toBeVisible({
    timeout: 30_000,
  });
  const amendments = page.getByRole('region', { name: 'Avenants' });
  await expect(amendments.getByText('Changement de véhicule')).toBeVisible();
  await expect(
    amendments.getByText(`${vehicle.registration} remplacé par ${newPlate}`, { exact: false }),
  ).toBeVisible();
  const payments = page.getByRole('region', { name: 'Paiements' });
  await expect(payments.getByText('512,64 MAD').first()).toBeVisible();
  const attestations = page.getByRole('region', { name: 'Attestations' });
  const oldRow = attestations.getByRole('listitem').filter({ hasText: old.number });
  await expect(oldRow.getByText('Papier à récupérer auprès du client')).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('avenant-contract');

  // The client brings the old paper back.
  await oldRow.getByRole('button', { name: 'Papier rendu' }).click();
  await expect(oldRow.getByText(/^Rendue à l’agence le /)).toBeVisible();

  // The old car is archived, and its page tells what replaced it.
  await page.goto(`/vehicules/${vehicle.id}`);
  await expect(page.getByText(/Remplacé par avenant n° 26/)).toBeVisible();
  const history = page.getByRole('region', { name: 'Historique des avenants' });
  await expect(history.getByRole('link', { name: newPlate })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('avenant-old-vehicle');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
