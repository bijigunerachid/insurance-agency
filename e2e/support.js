import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { expect as expectPage } from '@playwright/test';
import { hashPassword } from '../backend/src/modules/auth/passwords.js';
import { generateTotpSecret, timeStep, totpCode } from '../backend/src/modules/auth/totp.js';
import { createPrisma } from '../backend/src/services/prisma.js';
import { createSecretBox } from '../backend/src/services/secretBox.js';

// E2E tests use the same test database as the backend started by Playwright (backend/.env.test).
process.loadEnvFile(fileURLToPath(new URL('../backend/.env.test', import.meta.url)));

export const PASSWORD = 'Synthétique-E2E-2026!';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost']);

let prisma;
function db() {
  prisma ??= createPrisma(process.env.DATABASE_URL);
  return prisma;
}

/** Creates a synthetic user with a unique name so parallel tests never share accounts. */
export async function seedUser({ role = 'AGENT', totp = false, mustChangePassword = false } = {}) {
  const username = `e2e.${role.toLowerCase()}.${randomBytes(4).toString('hex')}`;
  const roleRow = await db().role.findUniqueOrThrow({ where: { code: role } });
  const secret = totp ? generateTotpSecret() : null;
  const box = createSecretBox(process.env.TOTP_ENCRYPTION_KEY);
  await db().user.create({
    data: {
      username,
      displayName: `Utilisateur test ${role.toLowerCase()}`,
      passwordHash: await hashPassword(PASSWORD),
      roleId: roleRow.id,
      mustChangePassword,
      totpSecret: secret ? box.encrypt(secret) : null,
      totpEnabledAt: secret ? new Date() : null,
    },
  });
  return { username, secret };
}

export function currentCode(secret) {
  return totpCode(secret.replace(/\s/g, ''), timeStep(new Date()));
}

/**
 * Code of the next 30-second step. The server accepts one step of clock drift, and refuses a
 * step already used, so a second confirmation right after sign-in uses this one.
 */
export function nextCode(secret) {
  return totpCode(secret.replace(/\s/g, ''), timeStep(new Date()) + 1);
}

/** Signs in a user who has a second factor. */
export async function loginWithCode(page, username, secret) {
  await login(page, username);
  await page.getByLabel('Code à 6 chiffres').fill(currentCode(secret));
  await page.getByRole('button', { name: 'Vérifier' }).click();
}

export async function disconnect() {
  await prisma?.$disconnect();
}

/**
 * Blocks and records every request that would leave this machine, records console messages
 * written by the page, and records API error responses ("METHOD /path STATUS").
 * Chrome's own "Failed to load resource" lines are left out of consoleMessages because they
 * only repeat an HTTP status; tests assert those statuses exactly through `errorResponses`.
 */
export async function guardOffline(page) {
  const external = [];
  const consoleMessages = [];
  const errorResponses = [];
  await page.route('**/*', (route) => {
    const { hostname, protocol } = new URL(route.request().url());
    if (protocol === 'data:' || LOCAL_HOSTS.has(hostname)) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  page.on('console', (msg) => {
    if (!msg.text().startsWith('Failed to load resource')) {
      consoleMessages.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      const { pathname } = new URL(response.url());
      errorResponses.push(`${response.request().method()} ${pathname} ${response.status()}`);
    }
  });
  return { external, consoleMessages, errorResponses };
}

// Pages whose workspace cards are answered by the journeys below (once per page).
const bothWorkspaces = new WeakSet();

/**
 * The workspace cards come after every sign-in. Journeys about another subject work on both
 * insurers, as before the cards: whenever the cards show, "both" is chosen for them. The
 * workspace journey itself signs in with `{ workspaces: 'ask' }` and chooses.
 */
async function answerWorkspaceCards(page) {
  if (bothWorkspaces.has(page)) return;
  bothWorkspaces.add(page);
  await page.addLocatorHandler(
    page.getByRole('button', { name: 'Travailler sur les deux compagnies' }),
    (button) => button.click(),
  );
}

export async function login(page, username, password = PASSWORD, { workspaces = 'both' } = {}) {
  if (workspaces === 'both') await answerWorkspaceCards(page);
  await page.goto('/');
  await page.getByLabel('Identifiant').fill(username);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

/** « Se déconnecter » is in the person's menu, at the top right (their initials). */
export async function signOut(page) {
  await page.getByRole('button', { name: /^Menu de / }).click();
  await page.getByRole('menuitem', { name: 'Se déconnecter' }).click();
}

export async function expectNoHorizontalScroll(page, expect) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * Confirms, as a synthetic manager, what a contract needs in the catalogue (model A, usage
 * Tourisme, series RMA 14 A) and adds a confirmed product with a unique name (at RMA unless
 * another insurer is given). Confirming
 * these in the screens is the catalogue journey's job; here it is only the starting point.
 * Idempotent: both browser projects and repeats share the database.
 */
export async function prepareCatalogueForContracts(productName, insurerCode = 'RMA') {
  const { username } = await seedUser({ role: 'MANAGER' });
  const manager = await db().user.findUniqueOrThrow({ where: { username } });
  const confirmed = {
    status: 'CONFIRMED',
    confirmedAt: new Date(),
    confirmedById: manager.id,
    confirmationRef: 'Préparation des tests (synthétique)',
  };
  const pending = { status: 'TO_CONFIRM' };
  await db().attestationModel.updateMany({ where: { code: 'A', ...pending }, data: confirmed });
  await db().vehicleUsage.updateMany({ where: { label: 'Tourisme', ...pending }, data: confirmed });
  const rma = await db().insurer.findUniqueOrThrow({ where: { code: 'RMA' } });
  await db().attestationSeries.updateMany({
    where: { insurerId: rma.id, code: '14 A', ...pending },
    data: confirmed,
  });
  const insurer = await db().insurer.findUniqueOrThrow({ where: { code: insurerCode } });
  await db().product.create({
    data: {
      insurerId: insurer.id,
      line: 'CAR',
      name: productName,
      source: 'Produit synthétique de test',
      ...confirmed,
    },
  });
}

/** Confirms a usage of the catalogue and its model, as a manager would from the forms. */
export async function confirmUsage(label) {
  const { username } = await seedUser({ role: 'MANAGER' });
  const manager = await db().user.findUniqueOrThrow({ where: { username } });
  const confirmed = {
    status: 'CONFIRMED',
    confirmedAt: new Date(),
    confirmedById: manager.id,
    confirmationRef: 'Préparation des tests (synthétique)',
  };
  const usage = await db().vehicleUsage.findUniqueOrThrow({ where: { label } });
  await db().attestationModel.updateMany({
    where: { code: usage.modelCode, status: 'TO_CONFIRM' },
    data: confirmed,
  });
  await db().vehicleUsage.updateMany({ where: { label, status: 'TO_CONFIRM' }, data: confirmed });
}

/**
 * Confirms models D and E with their usages, series RMA 14 D and the RMA product Scooters, for an
 * electric moped's white D sheet (owner, 29/10/2026).
 */
export async function prepareElectricMoped() {
  const { username } = await seedUser({ role: 'MANAGER' });
  const manager = await db().user.findUniqueOrThrow({ where: { username } });
  const confirmed = {
    status: 'CONFIRMED',
    confirmedAt: new Date(),
    confirmedById: manager.id,
    confirmationRef: 'Préparation des tests (synthétique)',
  };
  const pending = { status: 'TO_CONFIRM' };
  await db().attestationModel.updateMany({ where: { code: 'D', ...pending }, data: confirmed });
  await db().vehicleUsage.updateMany({ where: { label: 'Divers', ...pending }, data: confirmed });
  // Where the moped usages of the RMA list sit (model E).
  await db().attestationModel.updateMany({ where: { code: 'E', ...pending }, data: confirmed });
  await db().vehicleUsage.updateMany({
    where: { label: 'Véhicules à deux ou trois roues', ...pending },
    data: confirmed,
  });
  const rma = await db().insurer.findUniqueOrThrow({ where: { code: 'RMA' } });
  await db().attestationSeries.updateMany({
    where: { insurerId: rma.id, code: '14 D', ...pending },
    data: confirmed,
  });
  await db().product.updateMany({
    where: { insurerId: rma.id, name: 'Scooters', ...pending },
    data: confirmed,
  });
}

/**
 * Confirms model B, usage « Transport public de voyageurs », series CAT 91 B and the CAT product
 * « Transport de voyageurs », for a coach read from a CAT sheet.
 */
export async function prepareCatCoach() {
  const { username } = await seedUser({ role: 'MANAGER' });
  const manager = await db().user.findUniqueOrThrow({ where: { username } });
  const confirmed = {
    status: 'CONFIRMED',
    confirmedAt: new Date(),
    confirmedById: manager.id,
    confirmationRef: 'Préparation des tests (synthétique)',
  };
  const pending = { status: 'TO_CONFIRM' };
  await db().attestationModel.updateMany({ where: { code: 'B', ...pending }, data: confirmed });
  await db().vehicleUsage.updateMany({
    where: { label: 'Transport public de voyageurs', ...pending },
    data: confirmed,
  });
  const cat = await db().insurer.findUniqueOrThrow({ where: { code: 'CAT' } });
  await db().attestationSeries.updateMany({
    where: { insurerId: cat.id, code: '91 B', ...pending },
    data: confirmed,
  });
  await db().product.updateMany({
    where: { insurerId: cat.id, name: 'Transport de voyageurs', ...pending },
    data: confirmed,
  });
}

/**
 * Confirms model F with its usage, series CAT 91 F and the CAT product « Assurance aux
 * frontières », for border insurance (owner, 02/11/2026).
 */
export async function prepareCatBorder() {
  const { username } = await seedUser({ role: 'MANAGER' });
  const manager = await db().user.findUniqueOrThrow({ where: { username } });
  const confirmed = {
    status: 'CONFIRMED',
    confirmedAt: new Date(),
    confirmedById: manager.id,
    confirmationRef: 'Préparation des tests (synthétique)',
  };
  const pending = { status: 'TO_CONFIRM' };
  await db().attestationModel.updateMany({ where: { code: 'F', ...pending }, data: confirmed });
  await db().vehicleUsage.updateMany({
    where: { label: 'Assurance aux frontières', ...pending },
    data: confirmed,
  });
  const cat = await db().insurer.findUniqueOrThrow({ where: { code: 'CAT' } });
  await db().attestationSeries.updateMany({
    where: { insurerId: cat.id, code: '91 F', ...pending },
    data: confirmed,
  });
  await db().product.updateMany({
    where: { insurerId: cat.id, line: 'BORDER', ...pending },
    data: confirmed,
  });
}

/** Confirms the provisional model P and series RMA 14 P, for the provisional scan journey. */
export async function prepareProvisionalSeries() {
  const { username } = await seedUser({ role: 'MANAGER' });
  const manager = await db().user.findUniqueOrThrow({ where: { username } });
  const confirmed = {
    status: 'CONFIRMED',
    confirmedAt: new Date(),
    confirmedById: manager.id,
    confirmationRef: 'Préparation des tests (synthétique)',
  };
  await db().attestationModel.updateMany({
    where: { code: 'P', status: 'TO_CONFIRM' },
    data: confirmed,
  });
  const rma = await db().insurer.findUniqueOrThrow({ where: { code: 'RMA' } });
  await db().attestationSeries.updateMany({
    where: { insurerId: rma.id, code: '14 P', status: 'TO_CONFIRM' },
    data: confirmed,
  });
}

/**
 * Confirms model E and series CAT 91 E for the stock journey. No other journey records
 * attestations on CAT 91 E, so receiving its forms never changes what they check.
 */
export async function prepareSeriesForStock() {
  const { username } = await seedUser({ role: 'MANAGER' });
  const manager = await db().user.findUniqueOrThrow({ where: { username } });
  const confirmed = {
    status: 'CONFIRMED',
    confirmedAt: new Date(),
    confirmedById: manager.id,
    confirmationRef: 'Préparation des tests (synthétique)',
  };
  await db().attestationModel.updateMany({
    where: { code: 'E', status: 'TO_CONFIRM' },
    data: confirmed,
  });
  const cat = await db().insurer.findUniqueOrThrow({ where: { code: 'CAT' } });
  await db().attestationSeries.updateMany({
    where: { insurerId: cat.id, code: '91 E', status: 'TO_CONFIRM' },
    data: confirmed,
  });
}

/**
 * An issued contract of a new synthetic customer that ends in 10 days, created by `username`
 * (so its renewal is theirs). Recording a contract through the screens is the contract
 * journey's job; here it is the starting point of the renewal journey.
 */
export async function seedContractEndingSoon(
  username,
  lastName,
  { premiumTotal = null, insurerCode = 'RMA', customerId = null } = {},
) {
  const productName = `Produit renouvellement ${lastName}`;
  await prepareCatalogueForContracts(productName, insurerCode);
  const user = await db().user.findUniqueOrThrow({ where: { username } });
  const product = await db().product.findFirstOrThrow({ where: { name: productName } });
  const suffix = randomBytes(3).readUIntBE(0, 3) % 100000;
  // A second contract for a customer already seeded (one at each insurer), or a new customer.
  const customer = customerId
    ? { id: customerId }
    : await db().customer.create({
        data: {
          ref: `CLI-${String(900000 + (suffix % 99999)).padStart(6, '0')}`,
          type: 'INDIVIDUAL',
          firstName: 'Sara',
          lastName,
          searchText: `sara ${lastName.toLowerCase()}`,
          createdById: user.id,
        },
      });
  const day = (offset) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offset);
    return date;
  };
  return db().contract.create({
    data: {
      ref: `CTR-2099-${String(suffix).padStart(5, '0')}`,
      customerId: customer.id,
      productId: product.id,
      insurerId: product.insurerId,
      policyNumber: `POL-E2E-${suffix}`,
      insurerReference: 'Courriel synthétique',
      startDate: day(-355),
      endDate: day(10),
      tacitRenewal: false,
      premiumTotal,
      status: 'ISSUED',
      createdById: user.id,
    },
  });
}

/**
 * A cash payment on `contract` received `daysAgo` days ago, recorded by `username`. Recording
 * payments through the screens is the payment journey's job; here it is money still to remit.
 * Its receipt number uses the year 2098 so it never meets a number given by the application.
 */
export async function seedPaymentToRemit(username, contract, { amount, daysAgo }) {
  const user = await db().user.findUniqueOrThrow({ where: { username } });
  const number = String(randomBytes(3).readUIntBE(0, 3) % 100000).padStart(5, '0');
  return db().payment.create({
    data: {
      receiptNumber: `REC-2098-${number}`,
      contractId: contract.id,
      kind: 'PAYMENT',
      amount,
      method: 'CASH',
      receivedAt: new Date(Date.now() - daysAgo * 86_400_000),
      receivedById: user.id,
      idempotencyKey: randomUUID(),
    },
  });
}

/** The first entry of the menu, a page or « Plus », at both widths. */
const menuEntry = (nav) =>
  nav
    .getByRole('link')
    .or(nav.getByRole('button', { name: 'Plus' }))
    .first();

/** Opens a page of the menu: the daily pages are always shown, the others under "Plus". */
export async function openMenu(page, name) {
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  // An assertion first: it lets the workspace cards be answered (isVisible would not). On a
  // phone the menu is a bar fixed at the bottom: its first entry is what shows.
  await expectPage(menuEntry(nav)).toBeVisible();
  const link = nav.getByRole('link', { name, exact: true });
  if (!(await link.isVisible())) {
    const more = nav.getByRole('button', { name: 'Plus' });
    if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
  }
  await link.click();
}

/** The page is in neither part of the menu (the person may not open it). */
export async function expectNoMenuLink(page, expect, name) {
  const nav = page.getByRole('navigation', { name: 'Navigation principale' });
  await expect(menuEntry(nav)).toBeVisible();
  const more = nav.getByRole('button', { name: 'Plus' });
  if ((await more.count()) && (await more.getAttribute('aria-expanded')) !== 'true') {
    await more.click();
  }
  await expect(nav.getByRole('link', { name, exact: true })).toHaveCount(0);
  // On a phone "Plus" is a panel over the page: closed again, as a person would.
  await page.keyboard.press('Escape');
}

/**
 * A customer with a CIN, a car with the usage Tourisme, covered by an issued RMA contract with a
 * policy number: what a scanned attestation of that car then finds already recorded. Values are
 * unique so both browsers can run at once.
 */
export async function seedInsuredCar(username, lastName) {
  const seeded = await seedContractEndingSoon(username, lastName);
  // A policy number as RMA prints it: 15 digits.
  const contract = await db().contract.update({
    where: { id: seeded.id },
    data: {
      policyNumber: `4000705${String(randomBytes(4).readUInt32BE(0)).padStart(10, '0').slice(-8)}`,
    },
  });
  const user = await db().user.findUniqueOrThrow({ where: { username } });
  const tourisme = await db().vehicleUsage.findUniqueOrThrow({ where: { label: 'Tourisme' } });
  const suffix = randomBytes(3).readUIntBE(0, 3) % 100000;
  const cin = `ZX${String(suffix).padStart(6, '0')}`;
  await db().customer.update({
    where: { id: contract.customerId },
    data: { identityType: 'CIN', identityNumber: cin },
  });
  const registration = `${String(suffix).padStart(5, '0')}-B-9`;
  const vehicle = await db().vehicle.create({
    data: {
      ownerId: contract.customerId,
      registration,
      registrationKey: registration.replace(/-/g, ''),
      category: 'CAR',
      make: 'Dacia',
      model: 'Logan',
      usageId: tourisme.id,
      createdById: user.id,
    },
  });
  await db().contractVehicle.create({
    data: { contractId: contract.id, vehicleId: vehicle.id, addedById: user.id },
  });
  return { contract, cin, registration, vehicle };
}

/**
 * The 14 A attestation of the seeded car for the whole contract, as recorded when it was
 * issued: what a vehicle-change avenant then replaces.
 */
export async function seedAttestation(username, contract, vehicle) {
  const user = await db().user.findUniqueOrThrow({ where: { username } });
  const series = await db().attestationSeries.findFirstOrThrow({
    where: { code: '14 A', insurer: { code: 'RMA' } },
  });
  return db().attestation.create({
    data: {
      contractId: contract.id,
      vehicleId: vehicle.id,
      seriesId: series.id,
      number: String(100000000 + (randomBytes(4).readUInt32BE(0) % 800000000)),
      provisional: false,
      validFrom: contract.startDate,
      validTo: contract.endDate,
      createdById: user.id,
    },
  });
}

/**
 * `count` provisional RMA 14 P attestations of the seeded car in a row, one month each from the
 * start of its contract: the agency takes three in a row, then the next must be definitive.
 */
export async function seedProvisionals(username, contract, vehicle, count) {
  const user = await db().user.findUniqueOrThrow({ where: { username } });
  const series = await db().attestationSeries.findFirstOrThrow({
    where: { code: '14 P', insurer: { code: 'RMA' } },
  });
  for (let i = 0; i < count; i += 1) {
    const validFrom = new Date(contract.startDate);
    validFrom.setUTCMonth(validFrom.getUTCMonth() + i);
    const validTo = new Date(validFrom);
    validTo.setUTCDate(validTo.getUTCDate() + 28);
    await db().attestation.create({
      data: {
        contractId: contract.id,
        vehicleId: vehicle.id,
        seriesId: series.id,
        number: String(100000000 + (randomBytes(4).readUInt32BE(0) % 800000000)),
        provisional: true,
        validFrom,
        validTo,
        createdById: user.id,
      },
    });
  }
}

const FRENCH_MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];
const dashed = (date) =>
  `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
const worded = (date) =>
  `Jeu ${String(date.getUTCDate()).padStart(2, '0')} ${FRENCH_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()} 18H`;

/**
 * A synthetic PDF laid out like the RMA platform's sheet (as test/fixtures/make-platform-sheet.mjs),
 * with the given values, drawn by the browser of the test. With `avenant` ({ number, total }), it
 * is a vehicle-change avenant, its own total in place of the premium. With `electric`, the vehicle
 * block of an electric two-wheeler: « Electrique », 3 typed before « 2.R » (owner, 29/10/2026).
 */
export async function platformSheet(
  browser,
  {
    number,
    policy,
    cin,
    name,
    registration,
    from,
    to,
    avenant = null,
    replaces = null,
    series = '14A',
    usage = 'TOURISME',
    make = 'DACIA LOGAN',
    body = 'VP',
    electric = false,
  },
) {
  const total = avenant ? avenant.total : '600.00';
  const left = [
    avenant
      ? [
          [0, 'AVENANT DE CHANGEMENT DE VEHICULE N'],
          [260, avenant.number],
        ]
      : replaces
        ? [
            [0, 'REMPLACEMENT DE POLICE N'],
            [260, replaces],
          ]
        : [[0, 'AFFAIRE NOUVELLE']],
    [
      [0, policy],
      [160, 'A9999'],
      [260, `${series} ${number}`],
    ],
    [
      [0, dashed(from)],
      [80, '18H'],
      [160, dashed(to)],
      [240, '18H'],
      [300, usage],
    ],
    [
      [0, '99999999999999999999'],
      [160, 'DUREE FERME'],
    ],
    ...(electric
      ? [
          [
            [0, registration],
            [300, 'Electrique'],
          ],
          [[0, '01-01-2025']],
          [
            [0, '3'],
            [60, '2.R'],
          ],
        ]
      : []),
    [
      [0, `#${total}#`],
      [55, '#0.00#'],
      [110, '#0.00#'],
      [165, `#${total}#`],
      [225, '#0.00#'],
      [280, '#0.00#'],
      [330, `#${total}#`],
    ],
  ];
  const right = [
    [[0, name]],
    [[0, cin]],
    [[0, '1 RUE DE L ESSAI']],
    [[0, policy]],
    [
      [0, 'AGENCE ESSAI'],
      [200, 'A9999'],
    ],
    [[0, registration]],
    [[0, make]],
    [[0, body]],
    [[0, worded(from)]],
    [[0, worded(to)]],
  ];
  const column = (rows, x) =>
    rows
      .map((parts, r) =>
        parts
          .map(
            ([left, text]) =>
              `<div style="position:absolute;left:${x + left}px;top:${40 + r * 26}px;font:10px Arial">${text}</div>`,
          )
          .join(''),
      )
      .join('');
  const page = await browser.newPage();
  await page.setContent(
    `<!doctype html><html><body style="margin:0">${column(left, 20)}${column(right, 600)}</body></html>`,
  );
  const pdf = await page.pdf({ width: '1123px', height: '794px' });
  await page.close();
  return pdf;
}
