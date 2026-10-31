import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  disconnect,
  expectNoHorizontalScroll,
  guardOffline,
  login,
  openMenu,
  platformSheet,
  prepareCatalogueForContracts,
  prepareCatCoach,
  prepareElectricMoped,
  prepareProvisionalSeries,
  seedInsuredCar,
  seedProvisionals,
  seedUser,
} from './support.js';

test.afterAll(disconnect);

/** The synthetic filled attestation also used by the reader's unit test (no real form). */
const PICTURE = fileURLToPath(
  new URL('../backend/test/fixtures/attestation-synthetique.png', import.meta.url),
);

test('an agent scans an attestation, checks what was read and files it to follow the insurance', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000); // the server reads the picture (a few seconds, two browsers at once)
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const unique = randomInt(100000, 999999);
  const productName = `Produit scan ${unique}`;
  await prepareCatalogueForContracts(productName);
  const { username } = await seedUser({ role: 'AGENT' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await openMenu(page, 'Scanner une attestation');

  // 1. The scan is read by the agency's server.
  // Its own copy of the picture (bytes added after the image end): the same file twice is refused.
  await page.getByLabel('Scan de l’attestation').setInputFiles({
    name: `attestation-${unique}.png`,
    mimeType: 'image/png',
    buffer: Buffer.concat([readFileSync(PICTURE), Buffer.from(` ${unique}`)]),
  });
  await page.getByRole('button', { name: 'Lire l’attestation' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vérifier le scan' })).toBeVisible({
    timeout: 60_000,
  });

  // 2. What was read is proposed beside the scan.
  await expect(page.getByLabel('Série')).toHaveValue(/.+/);
  await expect(page.getByLabel('Série').locator('option:checked')).toHaveText(/RMA 14 A/);
  await expect(page.getByLabel('Valable du')).toHaveValue('2026-11-01');
  await expect(page.getByLabel('Valable au')).toHaveValue('2027-10-31');
  await expect(page.getByText('Imprimé : TEST SYNTHETIQUE')).toBeVisible();
  const vehicle = page.getByRole('region', { name: 'Véhicule' });
  await expect(vehicle.getByLabel('Marque')).toHaveValue('DACIA');
  await expect(vehicle.getByLabel('Usage', { exact: true })).toHaveValue(/.+/);
  // The usage printed (TOURISME) names the one of the RMA GAMA list.
  await expect(vehicle.getByLabel('Usage assureur (RMA)').locator('option:checked')).toHaveText(
    'TOURISME',
  );
  await expectNoHorizontalScroll(page, expect);
  await shot('scan-review');

  // 3. The agent checks and completes it (unique values: both browsers run at once).
  await page.getByLabel('N° de l’attestation').fill(`7${String(unique).padStart(8, '0')}`);
  await page.getByLabel('N° de police').fill(`POL-SCAN-${unique}`);
  const customer = page.getByRole('region', { name: 'Client' });
  await customer.getByLabel('Nom', { exact: true }).fill(`Scan${unique}`);
  await customer.getByLabel('Prénom').fill('Sara');
  await customer.getByLabel('Numéro de la pièce').fill(`ZZ${unique}`);
  await vehicle.getByLabel('Immatriculation').fill(`${unique}-A-6`);
  await vehicle.getByLabel('Catégorie').selectOption({ label: 'Voiture' });
  const contract = page.getByRole('region', { name: 'Contrat' });
  await contract.getByLabel('Produit').selectOption({ label: productName });
  await page.getByRole('button', { name: 'Enregistrer et suivre' }).click();

  // 4. The contract is issued with its attestation and the scan, and followed from now on.
  await expect(page.getByText(/^CTR-/).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Émis').first()).toBeVisible();
  await expect(page.getByText(`POL-SCAN-${unique}`).first()).toBeVisible();
  await expect(
    page.getByText(new RegExp(`7${String(unique).padStart(8, '0')}`)).first(),
  ).toBeVisible();
  const documents = page.getByRole('region', { name: 'Documents de l’assureur' });
  await expect(documents.getByText('Attestation d’assurance')).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});

/** The synthetic sheet laid out like the RMA platform's PDF (no real customer). */
const PLATFORM_SHEET = fileURLToPath(
  new URL('../backend/test/fixtures/platform-synthetique.pdf', import.meta.url),
);

/** The synthetic provisional sheet: the attestation half only, no series or number printed. */
const PROVISIONAL_SHEET = fileURLToPath(
  new URL('../backend/test/fixtures/platform-provisoire-synthetique.pdf', import.meta.url),
);

test('an agent uploads a provisional PDF: series 14 P proposed, the number typed from the pink form', async ({
  page,
}, testInfo) => {
  const unique = randomInt(100000, 999999);
  const productName = `Produit provisoire ${unique}`;
  await prepareCatalogueForContracts(productName);
  await prepareProvisionalSeries();
  const { username } = await seedUser({ role: 'AGENT' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto('/scans');
  await page.getByLabel('Scan de l’attestation').setInputFiles({
    name: `provisoire-${unique}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.concat([
      readFileSync(PROVISIONAL_SHEET),
      Buffer.from(`
% ${unique}
`),
    ]),
  });
  await page.getByRole('button', { name: 'Lire l’attestation' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vérifier le scan' })).toBeVisible();
  await expect(page.getByText(/Lu exactement depuis le PDF de la plateforme/)).toBeVisible();
  await expect(
    page.getByText(/Attestation provisoire : le PDF n’imprime ni la série/),
  ).toBeVisible();
  await expect(page.getByLabel('Série').locator('option:checked')).toHaveText(/14 P/);
  await expect(page.getByLabel('N° de l’attestation')).toHaveValue('');
  await expect(page.getByLabel('N° de police')).toHaveValue('400000000000333');
  const customer = page.getByRole('region', { name: 'Client' });
  await expect(customer.getByLabel('Numéro de la pièce')).toHaveValue('ZZ777777');
  // Model P says nothing about the vehicle: the usage Tourisme proposes a car.
  const vehicle = page.getByRole('region', { name: 'Véhicule' });
  await expect(vehicle.getByLabel('Catégorie')).toHaveValue('CAR');
  await expectNoHorizontalScroll(page, expect);
  await page.screenshot({
    path: testInfo.outputPath(`provisional-review-${testInfo.project.name}.png`),
    fullPage: true,
  });

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});

test('a fourth provisional in a row for the same vehicle is flagged, never refused', async ({
  page,
}, testInfo) => {
  await prepareCatalogueForContracts(`Produit provisoire ${randomInt(100000, 999999)}`);
  await prepareProvisionalSeries();
  const { username } = await seedUser({ role: 'AGENT' });
  const { contract, vehicle, registration } = await seedInsuredCar(
    username,
    `Provisoire${randomInt(100000, 999999)}`,
  );
  await seedProvisionals(username, contract, vehicle, 3);
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto('/scans');
  await page.getByLabel('Scan de l’attestation').setInputFiles({
    name: `provisoire-${registration}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.concat([
      readFileSync(PROVISIONAL_SHEET),
      Buffer.from(`
% ${registration}
`),
    ]),
  });
  await page.getByRole('button', { name: 'Lire l’attestation' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vérifier le scan' })).toBeVisible();
  // The same car as the three provisionals already recorded.
  await page
    .getByRole('region', { name: 'Véhicule' })
    .getByLabel('Immatriculation')
    .fill(registration);
  await expect(
    page.getByText(/Ce véhicule a déjà 3 attestations provisoires de suite/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enregistrer et suivre' })).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await page.screenshot({
    path: testInfo.outputPath(`provisional-warning-${testInfo.project.name}.png`),
    fullPage: true,
  });

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});

test('an agent uploads the PDF of the RMA platform: every value is read exactly, premium included', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const unique = randomInt(100000, 999999);
  const productName = `Produit plateforme ${unique}`;
  await prepareCatalogueForContracts(productName);
  const { username } = await seedUser({ role: 'AGENT' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto('/scans');
  // Its own copy (a comment added at the end): the same file twice is refused.
  await page.getByLabel('Scan de l’attestation').setInputFiles({
    name: `plateforme-${unique}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.concat([readFileSync(PLATFORM_SHEET), Buffer.from(`\n% ${unique}\n`)]),
  });
  await page.getByRole('button', { name: 'Lire l’attestation' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vérifier le scan' })).toBeVisible();
  await expect(page.getByText(/Lu exactement depuis le PDF de la plateforme/)).toBeVisible();
  await expect(page.getByLabel('N° de l’attestation')).toHaveValue('999000222');
  await expect(page.getByLabel('N° de quittance')).toHaveValue('99999999999999999999');
  await expect(page.getByText(/Total à payer 1\s520,00\sMAD/)).toBeVisible();
  const vehicle = page.getByRole('region', { name: 'Véhicule' });
  await expect(vehicle.getByLabel('Numéro de châssis (VIN)')).toHaveValue('VF1ABCDEF12345678');
  await expect(vehicle.getByLabel('Carburant')).toHaveValue('DIESEL');
  const contract = page.getByRole('region', { name: 'Contrat' });
  await expect(contract.getByLabel('Prime de l’assureur (MAD, facultatif)')).toHaveValue('1520.00');
  // The platform's reference printed above the name is not taken for the client.
  const customer = page.getByRole('region', { name: 'Client' });
  await expect(customer.getByLabel('Nom', { exact: true })).toHaveValue('TEST');
  await expect(customer.getByLabel('Prénom')).toHaveValue('SYNTHETIQUE');
  await expect(customer.getByLabel('Numéro de la pièce')).toHaveValue('ZZ999999');
  await expect(customer.getByLabel('Adresse')).toHaveValue('1 RUE DE L ESSAI KENITRA');
  await expectNoHorizontalScroll(page, expect);
  await shot('platform-review');

  // Unique values: both browsers run at once.
  await page.getByLabel('N° de l’attestation').fill(`8${String(unique).padStart(8, '0')}`);
  await page.getByLabel('N° de police').fill(`4${String(unique).padStart(14, '0')}`);
  await customer.getByLabel('Nom', { exact: true }).fill(`Plateforme${unique}`);
  await customer.getByLabel('Numéro de la pièce').fill(`ZY${unique}`);
  await vehicle.getByLabel('Immatriculation').fill(`${unique}-B-6`);
  await vehicle.getByLabel('Numéro de châssis (VIN)').fill(`VF1TEST${unique}0000`);
  await vehicle.getByLabel('Catégorie').selectOption({ label: 'Voiture' });
  // A car product fits an RMA 14 A: it is listed first, under its own heading.
  await expect(
    contract.locator('optgroup[label="Correspondent à l’attestation"] option', {
      hasText: productName,
    }),
  ).toHaveCount(1);
  await contract.getByLabel('Produit').selectOption({ label: productName });
  await page.getByRole('button', { name: 'Enregistrer et suivre' }).click();

  // Up to 30 s, like the first journey: the other browser may be reading a picture meanwhile.
  await expect(page.getByText(/^CTR-/).first()).toBeVisible({
    timeout: 30_000,
  });
  const payments = page.getByRole('region', { name: 'Paiements' });
  // Same patience: the payments load after the contract while the other browser may be reading.
  await expect(payments.getByText('1 520,00 MAD').first()).toBeVisible({ timeout: 30_000 });
  // The guarantees printed on the sheet, kept on the contract as read.
  const guarantees = page.getByRole('region', { name: 'Garanties imprimées par l’assureur' });
  await expect(guarantees.getByText('Responsabilité civile', { exact: true })).toBeVisible();
  await expect(guarantees.getByText('1 200,00 MAD')).toBeVisible();
  // The formula printed after the optional guarantees, once, with its meaning.
  await expect(guarantees.getByText('Défense et recours')).toBeVisible();
  await expect(guarantees.locator('p', { hasText: /^Formule :/ })).toHaveText(
    'Formule : RC (responsabilité civile)',
  );
  await guarantees.scrollIntoViewIfNeeded();
  await expectNoHorizontalScroll(page, expect);
  await shot('contract-guarantees');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});

/** The synthetic CAT sheet (values only, laid out like CAT's PDF). */
const CAT_SHEET = fileURLToPath(
  new URL('../backend/test/fixtures/platform-cat-synthetique.pdf', import.meta.url),
);

test('an agent uploads the PDF of the CAT platform: read exactly, CAT 91 B, a coach of a company', async ({
  page,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const unique = randomInt(100000, 999999);
  await prepareCatCoach();
  const { username } = await seedUser({ role: 'AGENT' });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto('/scans');
  // Its own copy (a comment added at the end): both browsers run at once.
  await page.getByLabel('Scan de l’attestation').setInputFiles({
    name: `cat-${unique}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.concat([readFileSync(CAT_SHEET), Buffer.from(`\n% ${unique}\n`)]),
  });
  await page.getByRole('button', { name: 'Lire l’attestation' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vérifier le scan' })).toBeVisible();
  await expect(page.getByText(/Lu exactement depuis le PDF de la plateforme/)).toBeVisible();
  // The series is printed on the paper, not in the PDF: proposed from the usage « CAR DE LIGNE ».
  await expect(page.getByLabel('Série').locator('option:checked')).toHaveText(/CAT 91 B/);
  await expect(page.getByLabel('N° de l’attestation')).toHaveValue('165000111');
  await expect(page.getByLabel('N° de police')).toHaveValue('C2026/000111');
  await expect(page.getByText(/Total à payer 13\s010,16\sMAD/)).toBeVisible();
  const customer = page.getByRole('region', { name: 'Client' });
  await expect(customer.getByLabel('Type')).toHaveValue('BUSINESS');
  await expect(customer.getByLabel('Raison sociale')).toHaveValue('TRANSPORTS ESSAI SARL');
  const vehicle = page.getByRole('region', { name: 'Véhicule' });
  await expect(vehicle.getByLabel('Catégorie')).toHaveValue('PASSENGER_TRANSPORT');
  await expect(vehicle.getByLabel('Marque')).toHaveValue('MERCEDES');
  await expect(vehicle.getByLabel('Nombre de places')).toHaveValue('50');
  await expect(vehicle.getByLabel('Usage', { exact: true }).locator('option:checked')).toHaveText(
    'Transport public de voyageurs',
  );
  // CAT has no list of its own usages in the app: no RMA list for a CAT sheet.
  await expect(vehicle.getByLabel('Usage assureur (RMA)')).toHaveCount(0);
  await expectNoHorizontalScroll(page, expect);
  await shot('scan-cat-review');

  // Unique values: both browsers run at once.
  await page.getByLabel('N° de l’attestation').fill(`6${String(unique).padStart(8, '0')}`);
  await page.getByLabel('N° de police').fill(`C2026/${unique}`);
  await customer.getByLabel('Raison sociale').fill(`TRANSPORTS ESSAI ${unique} SARL`);
  await customer.getByLabel('Numéro de la pièce').fill(`ZX${unique}`);
  await vehicle.getByLabel('Immatriculation').fill(`${unique}-B-6`);
  await vehicle.getByLabel('Numéro de châssis (VIN)').fill(`WDBC${unique}`);
  const contract = page.getByRole('region', { name: 'Contrat' });
  await contract.getByLabel('Produit').selectOption({ label: 'Transport de voyageurs' });
  await page.getByRole('button', { name: 'Enregistrer et suivre' }).click();

  await expect(page.getByText(/^CTR-/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(`C2026/${unique}`).first()).toBeVisible();
  const guarantees = page.getByRole('region', { name: 'Garanties imprimées par l’assureur' });
  await expect(guarantees.getByText('500 000 · franchise 5 %')).toBeVisible();
  await guarantees.scrollIntoViewIfNeeded();
  await expectNoHorizontalScroll(page, expect);
  await shot('contract-cat');

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});

test('an electric moped on a white D sheet: only the RMA usages its cut label may be are offered', async ({
  page,
  browser,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const unique = randomInt(100000, 999999);
  await prepareElectricMoped();
  const { username } = await seedUser({ role: 'AGENT' });
  const day = (offset) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offset);
    return date;
  };
  const number = String(randomInt(100000000, 999999999));
  // The platform cuts the usage: « CYLINDRÉE < 50 CM3 VITESSE ».
  const sheet = await platformSheet(browser, {
    number,
    policy: `4000742${String(unique).padStart(8, '0')}`,
    cin: `ZE${unique}`,
    name: `TESTI ELECTRIQUE${unique}`,
    registration: `${unique}-D-13`,
    from: day(-1),
    to: day(363),
    series: '14D',
    usage: 'CYLINDRÉE < 50 CM3 VITESSE',
    make: 'VOLTA',
    body: '2.R',
    electric: true,
  });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await page.goto('/scans');
  await page.getByLabel('Scan de l’attestation').setInputFiles({
    name: `electrique-${number}.pdf`,
    mimeType: 'application/pdf',
    buffer: sheet,
  });
  await page.getByRole('button', { name: 'Lire l’attestation' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vérifier le scan' })).toBeVisible();
  await expect(page.getByLabel('Série').locator('option:checked')).toHaveText(/RMA 14 D/);

  const vehicle = page.getByRole('region', { name: 'Véhicule' });
  await expect(vehicle.getByLabel('Carburant')).toHaveValue('ELECTRIC');
  await expect(vehicle.getByLabel('Cylindrée (cm³)')).toHaveValue('3');
  await expect(vehicle.getByLabel('Catégorie')).toHaveValue('MOTORCYCLE');
  // The usage of the attestation stays Divers (white D).
  await expect(vehicle.getByLabel('Usage', { exact: true }).locator('option:checked')).toHaveText(
    'Divers',
  );
  // Only the two RMA usages the cut label may be, nothing chosen for the employee.
  const rmaUsage = vehicle.getByLabel('Usage assureur (RMA)');
  await expect(rmaUsage.locator('option')).toHaveText([
    'Non précisé',
    'CYLINDRÉE < 50 CM3 VITESSE < 60 KM/H',
    'CYLINDRÉE < 50 CM3 VITESSE > 60 KM/H',
  ]);
  await expect(vehicle.getByText(/seuls les 2 usages qui commencent ainsi/)).toBeVisible();
  // The agency files it as a scooter (owner, 29/10/2026).
  const contract = page.getByRole('region', { name: 'Contrat' });
  await expect(contract.getByLabel('Produit').locator('option:checked')).toHaveText('Scooters');
  await expectNoHorizontalScroll(page, expect);
  await shot('scan-electric-moped');

  await rmaUsage.selectOption({ label: 'CYLINDRÉE < 50 CM3 VITESSE > 60 KM/H' });
  await expect(vehicle.getByLabel('Usage', { exact: true }).locator('option:checked')).toHaveText(
    'Divers',
  );
  // Every RMA usage, on request.
  await vehicle.getByRole('button', { name: 'Afficher tous les usages de l’assureur' }).click();
  await expect(rmaUsage.getByRole('option', { name: 'TOURISME', exact: true })).toHaveCount(1);
  await page.getByLabel('N° de l’attestation').fill(number);
  await page.getByRole('button', { name: 'Enregistrer et suivre' }).click();

  await expect(page.getByText(/^CTR-/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('CYLINDRÉE < 50 CM3 VITESSE > 60 KM/H')).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});

test('a scan of a car already insured: everything is recognised and filed in one click', async ({
  page,
  browser,
}, testInfo) => {
  const shot = (name) =>
    page.screenshot({
      path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
      fullPage: true,
    });
  const lastName = `Connu${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  const { contract, cin, registration } = await seedInsuredCar(username, lastName);
  const day = (offset) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offset);
    return date;
  };
  const number = String(randomInt(100000000, 999999999));
  const sheet = await platformSheet(browser, {
    number,
    policy: contract.policyNumber,
    cin,
    name: `SARA ${lastName.toUpperCase()}`,
    registration,
    from: day(-5),
    to: day(5),
  });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await openMenu(page, 'Scanner une attestation');
  await page.getByLabel('Scan de l’attestation').setInputFiles({
    name: `connu-${number}.pdf`,
    mimeType: 'application/pdf',
    buffer: sheet,
  });
  await page.getByRole('button', { name: 'Lire l’attestation' }).click();

  const quick = page.getByRole('region', { name: 'Tout est reconnu' });
  await expect(quick).toBeVisible();
  await expect(quick.getByText(`Attestation 14 A n° ${number}`)).toBeVisible();
  await expect(quick.getByText(`Ajoutée au contrat ${contract.ref}`)).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await shot('scan-quick');
  await quick.getByRole('button', { name: 'Enregistrer et suivre' }).click();

  // The attestation is on the contract, with the scan.
  await expect(page.getByText(contract.ref).first()).toBeVisible();
  await expect(page.getByText(new RegExp(`n° ${number}`))).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});

test('a new policy that replaces one the agency follows becomes its next contract', async ({
  page,
  browser,
}, testInfo) => {
  const lastName = `Remplace${randomInt(100000, 999999)}`;
  const { username } = await seedUser({ role: 'AGENT' });
  const { contract, cin, registration } = await seedInsuredCar(username, lastName);
  const day = (offset) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offset);
    return date;
  };
  const number = String(randomInt(100000000, 999999999));
  const policy = `4000741${String(randomInt(10000000, 99999999))}`;
  const sheet = await platformSheet(browser, {
    number,
    policy,
    replaces: contract.policyNumber,
    cin,
    name: `SARA ${lastName.toUpperCase()}`,
    registration,
    from: day(-2),
    to: day(180),
  });
  const { external, consoleMessages, errorResponses } = await guardOffline(page);

  await login(page, username);
  await expect(page.getByRole('heading', { level: 1, name: /^Bonjour / })).toBeVisible();
  await openMenu(page, 'Scanner une attestation');
  await page.getByLabel('Scan de l’attestation').setInputFiles({
    name: `remplacement-${number}.pdf`,
    mimeType: 'application/pdf',
    buffer: sheet,
  });
  await page.getByRole('button', { name: 'Lire l’attestation' }).click();

  const quick = page.getByRole('region', { name: 'Tout est reconnu' });
  await expect(quick).toBeVisible();
  await expect(
    quick.getByText(`Remplacement du contrat ${contract.ref} (nouvelle police)`),
  ).toBeVisible();
  await expectNoHorizontalScroll(page, expect);
  await page.screenshot({
    path: testInfo.outputPath(`scan-replacement-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await quick.getByRole('button', { name: 'Enregistrer et suivre' }).click();

  // A new contract with the new policy, following the replaced one.
  await expect(page.getByText(policy).first()).toBeVisible();
  await expect(page.getByRole('link', { name: contract.ref })).toBeVisible();

  expect(external).toEqual([]);
  expect(consoleMessages).toEqual([]);
  expect(errorResponses).toEqual([]);
});
