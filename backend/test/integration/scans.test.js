import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { REFERENCE_PRODUCT_NAMES } from '../../src/modules/catalogue/reference.js';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
const runtime = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
beforeEach(() => ctx.reset());
afterAll(async () => {
  await runtime.end();
  await ctx.close();
});

const { signIn, prepareCatalogue, series, confirm } = contractFixtures(ctx);

/** What the reader returns for a filled RMA 14 A attestation (synthetic values). */
const READ_14A = `ATTESTATION D'ASSURANCE OBLIGATOIRE
DES VEHICULES TERRESTRES A MOTEUR
USAGE : TOURISME | Jlaxiuul
NUMERO D'ORDRE | 14 À 21 8362562
PROPRIETAIRE DU VEHICULE
Nom EL AMRANI SAIDA
N° de la carte d'identité nationale ou n° de registre de commerce AB123456
Adresse 12 RUE DES ORANGERS CASABLANCA
POLICE D'ASSURANCE
Entreprise RMA
Numéro de la police 4012345678
Intermédiaire AGENCE SYNTHETIQUE
VEHICULE
N° d'immatriculation 12345-A-6
Marque et type DACIA LOGAN
Type de carrosserie BERLINE
DU: 01 11 2026
AU: 31 10 2027`;

const pdf = (text) => Buffer.from(`%PDF-1.7\n% ${text}\n%%EOF\n`);
const filesOnDisk = () =>
  readdirSync(ctx.config.DOCUMENTS_DIR, { recursive: true, withFileTypes: true }).filter((e) =>
    e.isFile(),
  ).length;

async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const tourisme = await ctx.prisma.vehicleUsage.findUniqueOrThrow({
    where: { label: 'Tourisme' },
  });
  return { manager, agent, products, tourisme };
}
const upload = (client, text, name = 'scan.pdf') => {
  ctx.reading = text === null ? null : { text, confidence: 78, angle: 90 };
  return client.upload('/api/scans', pdf(name), { name });
};
/** The values as the employee checked them, everything new. */
const newRecords = ({ tourisme, products }, overrides = {}) => ({
  number: '218362562',
  validFrom: '2026-11-01',
  validTo: '2027-10-31',
  policyNumber: '4012345678',
  customer: {
    create: {
      type: 'INDIVIDUAL',
      firstName: 'Saida',
      lastName: 'El Amrani',
      identityType: 'CIN',
      identityNumber: 'AB123456',
      addressLine: '12 rue des Orangers',
      city: 'Casablanca',
    },
  },
  vehicle: {
    create: {
      registration: '12345-A-6',
      category: 'CAR',
      make: 'Dacia',
      model: 'Logan',
      usageId: tourisme.id,
    },
  },
  contract: {
    create: { productId: products.RMA, startDate: '2026-11-01', endDate: '2027-10-31' },
  },
  printed: { seriesCode: '14 A', number: '218362562', holderName: 'EL AMRANI SAIDA' },
  ...overrides,
});

describe('scanned attestations', () => {
  it('reads a scan and proposes its values, with the series and insurer of the catalogue', async () => {
    const { agent } = await setup();
    const res = await upload(agent, READ_14A, 'Attestation Saida.pdf');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      originalName: 'Attestation Saida.pdf',
      status: 'PENDING',
      read: true,
      confidence: 78,
      uploadedBy: { displayName: 'Utilisateur agent.a' },
    });
    const gama = await ctx.prisma.insurerUsage.findFirstOrThrow({ where: { label: 'TOURISME' } });
    expect(res.body.proposed).toEqual({
      seriesCode: '14 A',
      seriesId: (await series('RMA', '14 A')).id,
      number: '218362562',
      insurerCode: 'RMA',
      usage: 'TOURISME',
      // The RMA GAMA usage it names, and the legal usage that one belongs to.
      insurerUsageId: gama.id,
      insurerUsageUsageId: gama.usageId,
      holderName: 'EL AMRANI SAIDA',
      holderIdNumber: 'AB123456',
      holderAddress: '12 RUE DES ORANGERS CASABLANCA',
      policyNumber: '4012345678',
      intermediary: 'AGENCE SYNTHETIQUE',
      registration: '12345-A-6',
      makeAndType: 'DACIA LOGAN',
      bodyType: 'BERLINE',
      validFrom: '2026-11-01',
      validTo: '2027-10-31',
    });
    // The values are personal data: the audit says what was found, not what it says.
    const [event] = await ctx.prisma.auditLog.findMany({ where: { action: 'scan.uploaded' } });
    expect(JSON.stringify(event.details)).not.toContain('AMRANI');

    // The same file is not waiting twice, and nothing is left on disk for the second.
    expect((await upload(agent, READ_14A, 'Attestation Saida.pdf')).body.error.code).toBe(
      'DUPLICATE_SCAN',
    );
    expect(filesOnDisk()).toBe(1);
    expect((await agent.get('/api/scans')).body.items.map((s) => s.id)).toEqual([res.body.id]);
    const opened = await agent.getFile(`/api/scans/${res.body.id}/file`);
    expect(opened.body.toString()).toContain('Attestation Saida.pdf');

    // An unreadable scan is kept with nothing proposed: everything is typed.
    const blank = await upload(agent, null, 'illisible.pdf');
    expect(blank.body).toMatchObject({ read: false, proposed: {} });
    const auditor = await signIn('auditeur', 'AUDITOR');
    expect((await auditor.get('/api/scans')).status).toBe(403);
  });

  it('offers only the RMA usages a usage cut short on the sheet may be', async () => {
    // As « CYLINDRÉE < 50 CM3 VITESSE » on the electric moped's sheet (owner, 29/10/2026).
    const { agent } = await setup();
    const res = await upload(
      agent,
      READ_14A.replace('USAGE : TOURISME', 'USAGE : TRANSPORT PERSONNEL'),
      'Attestation coupee.pdf',
    );
    const choices = await ctx.prisma.insurerUsage.findMany({
      where: { label: { startsWith: 'TRANSPORT PERSONNEL' } },
      orderBy: { sortOrder: 'asc' },
    });
    expect(choices.map((u) => u.label)).toEqual([
      'TRANSPORT PERSONNEL <= 3,5T',
      'TRANSPORT PERSONNEL +3,5T',
    ]);
    expect(res.body.proposed).toMatchObject({ insurerUsageChoices: choices.map((u) => u.id) });
    expect(res.body.proposed).not.toHaveProperty('insurerUsageId');
  });

  it('keeps the reading of the number that is an unused form of the stock', async () => {
    const { manager, agent } = await setup();
    const holder = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'manager.a' } });
    const batch = await manager.post('/api/attestation-batches', {
      seriesId: (await series('RMA', '14 A')).id,
      firstNumber: '999000110',
      lastNumber: '999000112',
      receivedOn: '2026-10-20',
      location: 'Armoire fermée',
      holderId: holder.id,
    });
    expect(batch.status).toBe(201);
    // One digit too many was read: "999 0000 111".
    const read = READ_14A.replace('14 À 21 8362562', '14 À 9990000111');
    const scan = (await upload(agent, read)).body;
    expect(scan.proposed).toMatchObject({
      number: '999000111',
      numberToCheck: false,
      numberFromStock: true,
    });
    // Without that form in stock, the number stays to check.
    const unknown = READ_14A.replace('14 À 21 8362562', '14 À 8880000777');
    const other = (await upload(agent, unknown, 'autre.pdf')).body;
    expect(other.proposed).toMatchObject({ numberToCheck: true });
    expect(other.proposed.numberCandidates).toContain('888000777');
  });

  it('proposes the provisional series when a scanned pink form has its code misread', async () => {
    const { manager, agent } = await setup();
    const holder = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'manager.a' } });
    await manager.post('/api/attestation-batches', {
      seriesId: (await series('RMA', '14 P')).id,
      firstNumber: '999000120',
      lastNumber: '999000122',
      receivedOn: '2026-10-20',
      location: 'Armoire fermée',
      holderId: holder.id,
    });
    // A blank provisional form, scanned: « 14 P » read « 44 P », one digit too many, no insurer.
    const form = (code, digits, insurer = '') => `ATTESTATION D'ASSURANCE OBLIGATOIRE
ATTESTATION PROVISOIRE
NUMERO D'ORDRE | ${code} ${digits}
${insurer}`;
    const misread = (await upload(agent, form('44 P', '9990001211'), 'provisoire.pdf')).body;
    expect(misread.proposed).toMatchObject({
      usage: 'Provisoire',
      seriesCode: '14 P',
      seriesReadAs: '44 P',
      seriesId: (await series('RMA', '14 P')).id,
      insurerCode: 'RMA',
      // The reading that is a blank form of the stock.
      number: '999000121',
      numberFromStock: true,
    });
    expect(misread.proposed).not.toHaveProperty('seriesUnknown');

    // The insurer read: its own provisional series, whatever the code looks like.
    const cat = (await upload(agent, form('81 P', '999000333', 'Entreprise CAT'), 'cat.pdf')).body;
    expect(cat.proposed).toMatchObject({ seriesCode: '91 P', seriesReadAs: '81 P' });

    // As close to both, no insurer: nothing is guessed, the employee chooses.
    const doubt = (await upload(agent, form('55 P', '999000444'), 'doute.pdf')).body;
    expect(doubt.proposed).toMatchObject({ seriesCode: '55 P', seriesUnknown: true });
    expect(doubt.proposed).not.toHaveProperty('seriesId');

    // A definitive form misread stays unknown: only « ATTESTATION PROVISOIRE » is corrected.
    const definitive = READ_14A.replace('14 À 21 8362562', '44 A 218362562');
    const other = (await upload(agent, definitive, 'definitive.pdf')).body;
    expect(other.proposed).toMatchObject({ seriesCode: '44 A', seriesUnknown: true });
  });

  it('reads the PDF of the platform exactly and issues the contract with its premium and quittance', async () => {
    const data = await setup();
    const { agent } = data;
    const sheet = readFileSync(new URL('../fixtures/platform-synthetique.pdf', import.meta.url));
    // The image reader must not be used: it would propose nothing.
    ctx.reading = null;
    const scan = (await agent.upload('/api/scans', sheet, { name: 'platform.pdf' })).body;
    expect(scan).toMatchObject({ read: true, confidence: 100 });
    expect(scan.proposed).toMatchObject({
      source: 'PLATFORM_PDF',
      seriesCode: '14 A',
      seriesId: (await series('RMA', '14 A')).id,
      number: '999000222',
      policyNumber: '400000000000111',
      quittanceNumber: '99999999999999999999',
      premiumTotal: '1520.00',
      vin: 'VF1ABCDEF12345678',
    });
    // The usage chosen on the platform ("TOURISME"), from the RMA GAMA list, with its legal usage.
    const gama = await ctx.prisma.insurerUsage.findFirstOrThrow({ where: { label: 'TOURISME' } });
    expect(scan.proposed).toMatchObject({
      insurerUsageId: gama.id,
      insurerUsageUsageId: data.tourisme.id,
    });

    const res = await agent.post(`/api/scans/${scan.id}/file`, {
      ...newRecords(data, {
        number: '999000222',
        validFrom: '2026-11-01',
        validTo: '2027-11-01',
        policyNumber: '400000000000111',
        quittanceNumber: '99999999999999999999',
        contract: {
          create: {
            productId: data.products.RMA,
            startDate: '2026-11-01',
            endDate: '2027-11-01',
            premiumTotal: '1520.00',
          },
        },
        vehicle: {
          create: {
            registration: '99999-A-6',
            category: 'CAR',
            make: 'DACIA',
            model: 'LOGAN',
            insurerUsageId: scan.proposed.insurerUsageId,
            // Sent by the review page as typed, like the cylindrée read before "2.R" on a moped.
            engineCc: '1461',
          },
        },
        printed: { seriesCode: '14 A', number: '999000222' },
      }),
      seriesId: scan.proposed.seriesId,
      version: scan.version,
    });
    expect(res.status).toBe(200);
    const contract = (await agent.get(`/api/contracts/${res.body.contractId}`)).body;
    expect(contract.vehicles[0]).toMatchObject({
      usage: { label: 'Tourisme' },
      insurerUsage: { label: 'TOURISME' },
    });
    const vehicle = await ctx.prisma.vehicle.findFirstOrThrow({
      where: { registration: '99999-A-6' },
    });
    expect(vehicle).toMatchObject({ engineCc: 1461, fiscalPowerCv: null });
    expect(contract).toMatchObject({
      status: 'ISSUED',
      policyNumber: '400000000000111',
      premiumTotal: '1520.00',
      insurerReference: 'Quittance n° 99999999999999999999, attestation 14 A n° 999000222',
      // The guarantees printed on the platform sheet, kept on the contract as read, and the
      // formula printed after them.
      guarantees: [
        { label: 'Responsabilité civile', details: '50 000 000', premium: '1200.00' },
        { label: 'Défense et recours', details: 'Forfait 10.000.00' },
      ],
      formula: 'RC',
    });
  });

  it('reads the PDF of the CAT platform exactly, proposes CAT 91 B, and files the issued contract', async () => {
    // Synthetic sheet laid out like the owner's CAT sample of 29/10/2026 (values only).
    const data = await setup();
    const { manager, agent } = data;
    await confirm(
      manager,
      '/api/attestation-models',
      await ctx.prisma.attestationModel.findUniqueOrThrow({ where: { code: 'B' } }),
    );
    const transport = await ctx.prisma.vehicleUsage.findUniqueOrThrow({
      where: { label: 'Transport public de voyageurs' },
    });
    await confirm(manager, '/api/vehicle-usages', transport);
    await confirm(manager, '/api/attestation-series', await series('CAT', '91 B'));
    ctx.reading = null;
    const sheet = readFileSync(
      new URL('../fixtures/platform-cat-synthetique.pdf', import.meta.url),
    );
    const scan = (await agent.upload('/api/scans', sheet, { name: 'cat.pdf' })).body;
    expect(scan).toMatchObject({ read: true, confidence: 100 });
    expect(scan.proposed).toMatchObject({
      source: 'PLATFORM_PDF',
      insurerCode: 'CAT',
      seriesCode: '91 B',
      seriesId: (await series('CAT', '91 B')).id,
      number: '165000111',
      policyNumber: 'C2026/000111',
      premiumTotal: '13010.16',
    });
    // CAT has no list of its own usages in the app: none is proposed.
    expect(scan.proposed).not.toHaveProperty('insurerUsageId');

    const res = await agent.post(`/api/scans/${scan.id}/file`, {
      ...newRecords(data, {
        number: '165000111',
        validFrom: '2026-11-01',
        validTo: '2027-10-31',
        policyNumber: 'C2026/000111',
        customer: {
          create: {
            type: 'BUSINESS',
            legalName: 'TRANSPORTS ESSAI SARL',
            identityType: 'CIN',
            identityNumber: 'ZZ999111',
          },
        },
        vehicle: {
          create: {
            registration: '99999-B-6',
            category: 'PASSENGER_TRANSPORT',
            make: 'MERCEDES',
            model: 'CAR',
            usageId: transport.id,
            seats: '50',
          },
        },
        contract: {
          create: {
            productId: data.products.CAT,
            startDate: '2026-11-01',
            endDate: '2027-10-31',
            premiumTotal: '13010.16',
          },
        },
        printed: { seriesCode: '91 B', number: '165000111' },
      }),
      seriesId: scan.proposed.seriesId,
      version: scan.version,
    });
    expect(res.status).toBe(200);
    const contract = (await agent.get(`/api/contracts/${res.body.contractId}`)).body;
    expect(contract).toMatchObject({
      status: 'ISSUED',
      insurer: { code: 'CAT' },
      policyNumber: 'C2026/000111',
      premiumTotal: '13010.16',
      insurerReference: 'Attestation 91 B n° 165000111 (scan)',
      guarantees: expect.arrayContaining([
        { label: 'Vol', details: '500 000 · franchise 5 %', premium: '600.00' },
      ]),
    });
    expect(contract.guarantees).toHaveLength(6);
    expect(contract.attestations).toEqual([
      expect.objectContaining({
        number: '165000111',
        series: expect.objectContaining({ code: '91 B' }),
      }),
    ]);
  });

  it('reads the provisional PDF of the platform: series 14 P, the number typed from the pink form', async () => {
    const data = await setup();
    const { agent } = data;
    const sheet = readFileSync(
      new URL('../fixtures/platform-provisoire-synthetique.pdf', import.meta.url),
    );
    ctx.reading = null;
    const scan = (await agent.upload('/api/scans', sheet, { name: 'provisoire.pdf' })).body;
    expect(scan).toMatchObject({ read: true, confidence: 100 });
    expect(scan.proposed).toMatchObject({
      source: 'PLATFORM_PDF',
      provisional: true,
      seriesCode: '14 P',
      seriesId: (await series('RMA', '14 P')).id,
      policyNumber: '400000000000333',
      validFrom: '2025-07-15',
      validTo: '2025-08-15',
      registration: '77777 -B- 06',
    });
    expect(scan.proposed).not.toHaveProperty('number');
    // « TOURI SME » is the RMA usage TOURISME, with its legal usage.
    const gama = await ctx.prisma.insurerUsage.findFirstOrThrow({ where: { label: 'TOURISME' } });
    expect(scan.proposed.insurerUsageId).toBe(gama.id);

    // Filed with the number of the pink form, for exactly one month like the platform prints it.
    const res = await agent.post(`/api/scans/${scan.id}/file`, {
      ...newRecords(data, {
        number: '999000444',
        validFrom: '2026-11-01',
        validTo: '2026-12-01',
        policyNumber: '400000000000333',
        contract: {
          create: { productId: data.products.RMA, startDate: '2026-11-01', endDate: '2027-11-01' },
        },
        printed: { seriesCode: '14 P', number: '999000444' },
      }),
      seriesId: scan.proposed.seriesId,
      version: scan.version,
    });
    expect(res.status).toBe(200);
    const contract = (await agent.get(`/api/contracts/${res.body.contractId}`)).body;
    expect(contract.attestations[0]).toMatchObject({
      number: '999000444',
      provisional: true,
      validFrom: '2026-11-01',
      validTo: '2026-12-01',
      series: { code: '14 P' },
    });
    // The next scan of that vehicle counts its provisionals in a row (after three the next must be
    // definitive: a warning on the review page, never a refusal).
    const matches = () => agent.get(`/api/scans/${scan.id}/matches?registration=12345-A-6`);
    const again = (await matches()).body;
    expect(again.vehicle).toMatchObject({ registration: '12345-A-6', provisionalsInARow: 1 });
    // A cancelled one no longer counts.
    await agent.post(`/api/attestations/${contract.attestations[0].id}/cancel`, {
      reason: 'Erreur de saisie',
      version: contract.attestations[0].version,
    });
    const cancelled = (await agent.get(`/api/scans/${scan.id}/matches?registration=12345-A-6`))
      .body;
    expect(cancelled.vehicle.provisionalsInARow).toBe(0);
    // Three in a row, then a definitive one: the count starts again after it.
    const vehicleId = contract.vehicles[0].id;
    const record = (number, validFrom, validTo, seriesCode) =>
      ctx.owner.query(
        `INSERT INTO "attestation" ("contractId", "vehicleId", "seriesId", "number", "provisional",
           "validFrom", "validTo", "createdById", "updatedAt")
         SELECT $1, $2, s."id", $3, s."code" = '14 P', $4, $5, c."createdById", now()
         FROM "contract" c, "attestation_series" s
         JOIN "insurer" i ON i."id" = s."insurerId" AND i."code" = 'RMA'
         WHERE c."id" = $1 AND s."code" = $6`,
        [contract.id, vehicleId, number, validFrom, validTo, seriesCode],
      );
    await record('999000501', '2026-11-02', '2026-11-30', '14 P');
    await record('999000502', '2026-12-01', '2026-12-30', '14 P');
    await record('999000503', '2027-01-01', '2027-01-30', '14 P');
    expect((await matches()).body.vehicle.provisionalsInARow).toBe(3);
    await record('999000504', '2027-02-01', '2027-11-01', '14 A');
    expect((await matches()).body.vehicle.provisionalsInARow).toBe(0);
  });

  it('corrects the usage of a vehicle already recorded to the model of the attestation', async () => {
    const data = await setup();
    const { agent } = data;
    const customer = (
      await agent.post('/api/customers', {
        type: 'INDIVIDUAL',
        firstName: 'Saida',
        lastName: 'Test',
      })
    ).body;
    // Recorded earlier with the usage Tourisme (model A).
    const car = (
      await agent.post('/api/vehicles', {
        ownerId: customer.id,
        registration: '12345-A-6',
        category: 'CAR',
        make: 'Dacia',
        model: 'Logan',
        usageId: data.tourisme.id,
      })
    ).body;
    const goods = await ctx.prisma.vehicleUsage.findUniqueOrThrow({
      where: { label: 'Transport de marchandises' },
    });
    expect(goods.status).toBe('CONFIRMED');
    // The attestation printed is a 14 C (model C, goods transport).
    const scan = (await upload(agent, READ_14A.replace('14 À 21 8362562', '14 C 218362562'))).body;
    const matches = (await agent.get(`/api/scans/${scan.id}/matches?registration=12345-A-6`)).body;
    expect(matches.vehicle).toMatchObject({
      id: car.id,
      usageId: data.tourisme.id,
      usageModel: 'A',
    });

    const body = (vehicle, version) => ({
      ...newRecords(data, { customer: { id: customer.id }, vehicle }),
      seriesId: scan.proposed.seriesId,
      version,
    });
    const refused = await agent.post(`/api/scans/${scan.id}/file`, body({ id: car.id }, 1));
    expect(refused.body.error.details).toEqual([{ path: 'seriesId', rule: 'MODEL_MISMATCH' }]);

    // With the usage chosen on the platform, read from the sheet ("C1 (COMMERCE <= 3,5T)").
    const c1 = await ctx.prisma.insurerUsage.findFirstOrThrow({
      where: { label: 'C1 (COMMERCE <= 3,5T)' },
    });
    const current = (await agent.get(`/api/scans/${scan.id}`)).body;
    const res = await agent.post(
      `/api/scans/${scan.id}/file`,
      body({ id: car.id, usageId: goods.id, insurerUsageId: c1.id }, current.version),
    );
    expect(res.status).toBe(200);
    expect((await agent.get(`/api/vehicles/${car.id}`)).body).toMatchObject({
      usage: { label: 'Transport de marchandises' },
      insurerUsage: { label: 'C1 (COMMERCE <= 3,5T)' },
    });
    const events = await ctx.prisma.auditLog.findMany({ where: { action: 'vehicle.updated' } });
    expect(events.at(-1).details).toMatchObject({ fields: ['usageId', 'insurerUsageId'] });
  });

  it('files a scan: new customer, vehicle and contract, issued, attestation recorded, scan attached', async () => {
    const data = await setup();
    const { agent } = data;
    const scan = (await upload(agent, READ_14A)).body;
    const res = await agent.post(`/api/scans/${scan.id}/file`, {
      ...newRecords(data),
      seriesId: scan.proposed.seriesId,
      version: scan.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.scan).toMatchObject({
      status: 'FILED',
      closed: { by: { displayName: 'Utilisateur agent.a' } },
    });

    const contract = (await agent.get(`/api/contracts/${res.body.contractId}`)).body;
    expect(contract).toMatchObject({
      status: 'ISSUED',
      policyNumber: '4012345678',
      customer: { displayName: 'Saida El Amrani' },
      startDate: '2026-11-01',
      endDate: '2027-10-31',
    });
    expect(contract.attestations).toEqual([
      expect.objectContaining({
        number: '218362562',
        series: expect.objectContaining({ code: '14 A' }),
      }),
    ]);
    const documents = (await agent.get(`/api/contracts/${contract.id}/documents`)).body.items;
    expect(documents).toEqual([
      expect.objectContaining({ type: 'ATTESTATION', originalName: 'scan.pdf' }),
    ]);
    const capture = (await agent.get(`/api/documents/${documents[0].id}/capture`)).body;
    expect(capture.checks.find((c) => c.field === 'attestation').status).toBe('MATCH');
    // One file on disk: the scan became the contract's document.
    expect(filesOnDisk()).toBe(1);

    // The next scan of the same attestation finds everything already recorded.
    const matches = await agent.get(
      `/api/scans/${scan.id}/matches?identityNumber=ab%20123456&registration=12345%20A%206&policyNumber=4012-345-678&seriesId=${scan.proposed.seriesId}&number=218362562`,
    );
    expect(matches.body).toMatchObject({
      customer: { ref: expect.stringMatching(/^CLI-/), displayName: 'Saida El Amrani' },
      vehicle: { registration: '12345-A-6', usage: 'Tourisme' },
      contract: { id: contract.id, status: 'ISSUED' },
      attestation: { id: contract.id, ref: contract.ref },
    });
    const again = await agent.post(`/api/scans/${scan.id}/file`, {
      ...newRecords(data),
      seriesId: scan.proposed.seriesId,
      version: res.body.scan.version,
    });
    expect(again.body.error.code).toBe('SCAN_CLOSED');
    const actions = await ctx.auditActions();
    for (const action of [
      'customer.created',
      'vehicle.created',
      'contract.created',
      'attestation.recorded',
      'scan.filed',
    ]) {
      expect(actions).toContain(action);
    }
  });

  it('goes on where it stopped: a filing refused for a missing policy number never creates twice', async () => {
    const data = await setup();
    const { agent } = data;
    const scan = (await upload(agent, READ_14A)).body;
    const body = { ...newRecords(data), seriesId: scan.proposed.seriesId };
    const withoutPolicy = { ...body, policyNumber: undefined };

    const refused = await agent.post(`/api/scans/${scan.id}/file`, {
      ...withoutPolicy,
      version: 1,
    });
    expect(refused.body.error.details).toEqual([{ path: 'policyNumber', rule: 'REQUIRED' }]);
    // Refused before the contract: no contract is recorded without its policy number.
    const progress = (await agent.get(`/api/scans/${scan.id}`)).body;
    expect(progress.progress).toEqual({
      customerId: expect.any(String),
      vehicleId: expect.any(String),
      contractId: null,
    });
    expect(await ctx.prisma.contract.count()).toBe(0);
    // The old version is refused; the current one goes on from the contract.
    expect(
      (await agent.post(`/api/scans/${scan.id}/file`, { ...body, version: 1 })).body.error.code,
    ).toBe('VERSION_CONFLICT');
    const done = await agent.post(`/api/scans/${scan.id}/file`, {
      ...body,
      version: progress.version,
    });
    expect(done.status).toBe(200);
    expect(await ctx.prisma.customer.count()).toBe(1);
    expect(await ctx.prisma.vehicle.count()).toBe(1);
    expect(await ctx.prisma.contract.count()).toBe(1);
    expect(await ctx.prisma.attestation.count()).toBe(1);
  });

  it('files a provisional attestation on a contract sent to the insurer, not yet issued', async () => {
    const data = await setup();
    const { agent } = data;
    const read = READ_14A.replace('14 À 21 8362562', '14 P 213661657').replace(
      'USAGE : TOURISME',
      'ATTESTATION PROVISOIRE',
    );
    const scan = (await upload(agent, read)).body;
    expect(scan.proposed).toMatchObject({ seriesCode: '14 P', usage: 'Provisoire' });
    const res = await agent.post(`/api/scans/${scan.id}/file`, {
      // The provisional sheet prints the policy number too: the contract is recorded with it.
      ...newRecords(data, {
        number: '213661657',
        validTo: '2026-11-30',
        printed: { seriesCode: '14 P', number: '213661657' },
      }),
      seriesId: scan.proposed.seriesId,
      version: scan.version,
    });
    expect(res.status).toBe(200);
    const contract = (await agent.get(`/api/contracts/${res.body.contractId}`)).body;
    expect(contract.status).toBe('AWAITING_INSURER');
    expect(contract.policyNumber).toBe(newRecords(data).policyNumber);
    expect(contract.attestations[0]).toMatchObject({ provisional: true, validTo: '2026-11-30' });
  });

  it('sets a scan aside with a reason, and never changes or deletes a closed scan', async () => {
    const { agent } = await setup();
    const scan = (await upload(agent, READ_14A)).body;
    const discard = (body) => agent.post(`/api/scans/${scan.id}/discard`, body);
    expect((await discard({ reason: '', version: 1 })).status).toBe(400);
    const done = (await discard({ reason: 'Scan envoyé deux fois', version: 1 })).body;
    expect(done).toMatchObject({
      status: 'DISCARDED',
      closed: { reason: 'Scan envoyé deux fois' },
    });
    expect((await agent.get('/api/scans?status=DISCARDED')).body.items).toHaveLength(1);
    // The same file can now be scanned again.
    expect((await upload(agent, READ_14A)).status).toBe(201);

    await expect(runtime.query('DELETE FROM "attestation_scan"')).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      runtime.query(`UPDATE "attestation_scan" SET "originalName" = 'x'`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      ctx.owner.query(
        `UPDATE "attestation_scan" SET "discardReason" = 'Autre raison' WHERE "status" = 'DISCARDED'`,
      ),
    ).rejects.toThrow(/never changes/);
    await expect(
      ctx.owner.query(
        `UPDATE "attestation_scan" SET "status" = 'FILED' WHERE "status" = 'PENDING'`,
      ),
    ).rejects.toThrow(/attestation_scan_closing/);
  });
});

describe('the product of a scanned attestation', () => {
  it('lists the products that fit first, proposes the one the sheet points to, then the agency’s last choice', async () => {
    const data = await setup();
    const { agent } = data;
    // The agency's reference products at RMA, confirmed; the fixture's own product set aside.
    const gerant = await ctx.prisma.user.findFirstOrThrow({ where: { username: 'manager.a' } });
    await ctx.prisma.product.updateMany({
      where: { insurer: { code: 'RMA' }, name: { in: REFERENCE_PRODUCT_NAMES } },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedById: gerant.id,
        confirmationRef: 'Test',
      },
    });
    await ctx.prisma.product.update({ where: { id: data.products.RMA }, data: { active: false } });
    const productId = async (name) =>
      (await ctx.prisma.product.findFirstOrThrow({ where: { name, insurer: { code: 'RMA' } } })).id;
    const sheet = readFileSync(new URL('../fixtures/platform-synthetique.pdf', import.meta.url));
    ctx.reading = null;
    const send = async (copy) =>
      (
        await agent.upload('/api/scans', Buffer.concat([sheet, Buffer.from(`\n% ${copy}\n`)]), {
          name: `platform-${copy}.pdf`,
        })
      ).body;
    const choice = (scan, seriesId = scan.proposed.seriesId) =>
      agent.get(`/api/scans/${scan.id}/products?seriesId=${seriesId}`);

    // An RMA 14 A printed "TOURISME": the car product; fleets also fit. Taxis are sold with CAT
    // only (owner, 29/10/2026), like passenger transport: not offered at RMA.
    const first = await send(1);
    const res = await choice(first);
    expect(res.status).toBe(200);
    expect(res.body.suggestion).toEqual({
      productId: await productId('Véhicules de tourisme'),
      reason: 'SHEET',
    });
    const fits = (name) => res.body.items.find((p) => p.name === name)?.fits;
    expect(['Véhicules de tourisme', 'Flottes automobiles'].map(fits)).toEqual([true, true]);
    expect(['Scooters', 'Assurance provisoire', 'Véhicules utilitaires'].map(fits)).toEqual([
      false,
      false,
      false,
    ]);
    expect(
      res.body.items.some((p) => ['PASSENGER_TRANSPORT', 'TAXI', 'TRIPORTEUR'].includes(p.line)),
    ).toBe(false);

    // The agency files it as a fleet: the next sheet of the same kind proposes it.
    const filed = await agent.post(`/api/scans/${first.id}/file`, {
      ...newRecords(data, {
        number: '999000222',
        validFrom: '2026-11-01',
        validTo: '2027-11-01',
        policyNumber: '400000000000111',
        contract: {
          create: {
            productId: await productId('Flottes automobiles'),
            startDate: '2026-11-01',
            endDate: '2027-11-01',
          },
        },
        printed: { seriesCode: '14 A', number: '999000222' },
      }),
      seriesId: first.proposed.seriesId,
      version: first.version,
    });
    expect(filed.status).toBe(200);
    const second = await send(2);
    expect((await choice(second)).body.suggestion).toEqual({
      productId: await productId('Flottes automobiles'),
      reason: 'LAST_CHOICE',
    });
    // A product no longer sold is not proposed again.
    await ctx.prisma.product.update({
      where: { id: await productId('Flottes automobiles') },
      data: { active: false },
    });
    expect((await choice(second)).body.suggestion.reason).toBe('SHEET');

    // Another series chosen on the screen: a provisional one fits only the provisional product.
    const provisional = await choice(second, (await series('RMA', '14 P')).id);
    expect(provisional.body.suggestion).toEqual({
      productId: await productId('Assurance provisoire'),
      reason: 'SHEET',
    });
    expect(provisional.body.items.filter((p) => p.fits).map((p) => p.name)).toEqual([
      'Assurance provisoire',
    ]);

    // A goods series chosen for a sheet printed "TOURISME": the usage does not fit, nothing proposed.
    const goods = await choice(second, (await series('RMA', '14 C')).id);
    expect(goods.body.suggestion).toBeNull();
    expect(goods.body.items.filter((p) => p.fits).length).toBeGreaterThan(1);

    // Checked input; an unknown series is not found.
    expect((await agent.get(`/api/scans/${second.id}/products`)).status).toBe(400);
    expect((await choice(second, randomUUID())).status).toBe(404);
  });
});

describe('an avenant scanned from the platform PDF', () => {
  // A vehicle-change avenant with invented values (test/fixtures/make-platform-sheet.mjs).
  const avenant = readFileSync(
    new URL('../fixtures/platform-avenant-synthetique.pdf', import.meta.url),
  );
  const filing = (data, scan, overrides) =>
    newRecords(data, {
      number: '999000333',
      validFrom: '2026-06-27',
      validTo: '2027-03-21',
      policyNumber: '400000000000222',
      quittanceNumber: '99999999999999999998',
      vehicle: {
        create: {
          registration: '88888-A-57',
          category: 'CAR',
          make: 'Renault',
          model: 'Clio',
          usageId: data.tourisme.id,
        },
      },
      amendment: {
        kind: 'VEHICLE_CHANGE',
        number: '2600000001',
        effectiveDate: '2026-06-27',
        amount: '512.64',
      },
      printed: { seriesCode: '14 A', number: '999000333', holderName: 'TEST AVENANT' },
      seriesId: scan.proposed.seriesId,
      version: scan.version,
      ...overrides,
    });
  const sendAvenant = async (agent) => {
    ctx.reading = null;
    return (await agent.upload('/api/scans', avenant, { name: 'avenant.pdf' })).body;
  };

  it('proposes the avenant, and files it on a contract made before the app: its amount is owed', async () => {
    const data = await setup();
    const scan = await sendAvenant(data.agent);
    expect(scan.proposed).toMatchObject({
      amendmentKind: 'VEHICLE_CHANGE',
      amendmentNumber: '2600000001',
      policyNumber: '400000000000222',
      premiumTotal: '512.64',
    });

    const res = await data.agent.post(
      `/api/scans/${scan.id}/file`,
      filing(data, scan, {
        contract: {
          create: {
            productId: data.products.RMA,
            startDate: '2026-06-27',
            endDate: '2027-03-21',
            premiumTotal: '512.64',
          },
        },
      }),
    );
    expect(res.status).toBe(200);
    const contract = (await data.agent.get(`/api/contracts/${res.body.contractId}`)).body;
    expect(contract).toMatchObject({
      status: 'ISSUED',
      policyNumber: '400000000000222',
      // The avenant's total is not the contract's premium: only the avenant is owed.
      premiumTotal: null,
      amountDue: '512.64',
      // An avenant's sheet repeats the year's guarantees: they are not taken as the contract's.
      guarantees: [],
      formula: null,
      amendments: [
        {
          kind: 'VEHICLE_CHANGE',
          number: '2600000001',
          amount: '512.64',
          insurerReference: 'Quittance n° 99999999999999999998',
          previousVehicle: null,
          vehicle: { registration: '88888-A-57' },
          attestation: { number: '999000333', series: '14 A' },
        },
      ],
    });
  });

  it('files it on the contract already in the app: the old vehicle leaves, its attestation is replaced', async () => {
    const data = await setup();
    const { agent, products, tourisme } = data;
    const customer = (
      await agent.post('/api/customers', {
        type: 'INDIVIDUAL',
        firstName: 'Test',
        lastName: 'Avenant',
        identityType: 'CIN',
        identityNumber: 'ZZ888888',
      })
    ).body;
    const oldCar = (
      await agent.post('/api/vehicles', {
        ownerId: customer.id,
        registration: '77777-A-57',
        category: 'CAR',
        make: 'Dacia',
        model: 'Logan',
        usageId: tourisme.id,
      })
    ).body;
    const draft = (
      await agent.post('/api/contracts', {
        customerId: customer.id,
        policyNumber: '400000000000222',
        productId: products.RMA,
        startDate: '2026-03-25',
        endDate: '2027-03-21',
        premiumTotal: '2500.00',
        vehicleIds: [oldCar.id],
      })
    ).body;
    const sent = await agent.post(`/api/contracts/${draft.id}/transition`, {
      to: 'AWAITING_INSURER',
      version: draft.version,
    });
    await agent.post(`/api/contracts/${draft.id}/transition`, {
      to: 'ISSUED',
      policyNumber: '400000000000222',
      insurerReference: 'Quittance synthétique',
      version: sent.body.version,
    });
    const first = await agent.post(`/api/contracts/${draft.id}/attestations`, {
      vehicleId: oldCar.id,
      seriesId: (await series('RMA', '14 A')).id,
      number: '999000111',
      validFrom: '2026-03-25',
      validTo: '2027-03-21',
    });
    expect(first.status).toBe(201);

    const scan = await sendAvenant(agent);
    const matches = (
      await agent.get(
        `/api/scans/${scan.id}/matches?policyNumber=400000000000222&seriesId=${scan.proposed.seriesId}`,
      )
    ).body;
    expect(matches.contract).toMatchObject({
      id: draft.id,
      vehicles: [{ id: oldCar.id, registration: '77777-A-57' }],
    });
    const res = await agent.post(
      `/api/scans/${scan.id}/file`,
      filing(data, scan, {
        customer: { id: customer.id },
        contract: { id: draft.id },
        amendment: {
          kind: 'VEHICLE_CHANGE',
          number: '2600000001',
          effectiveDate: '2026-06-27',
          amount: '512.64',
          previousVehicleId: oldCar.id,
        },
      }),
    );
    expect(res.status).toBe(200);
    const contract = (await agent.get(`/api/contracts/${draft.id}`)).body;
    expect(contract.vehicles.map((v) => v.registration)).toEqual(['88888-A-57']);
    expect(contract).toMatchObject({ premiumTotal: '2500.00', amountDue: '3012.64' });
    expect(contract.attestations.find((a) => a.number === '999000111').replaced).toMatchObject({
      number: '2600000001',
    });
    expect((await agent.get(`/api/vehicles/${oldCar.id}`)).body.archivedAt).not.toBeNull();
    // The scan joins the contract's documents, like any filed attestation.
    expect((await agent.get(`/api/scans/${scan.id}`)).body.status).toBe('FILED');
  });
});
