import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateTotpSecret, timeStep, totpCode } from '../../src/modules/auth/totp.js';
import { contractFixtures } from './fixtures.js';
import { PASSWORD, createTestContext } from './support.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const { signIn, prepareCatalogue, customerWithVehicles, contractBody, issue, series } =
  contractFixtures(ctx);

/** A manager whose second-factor secret the test keeps, to confirm their identity again. */
async function managerWithSecret(username = 'gerant') {
  const secret = generateTotpSecret();
  await ctx.createUser({ username, role: 'MANAGER', totpSecret: secret });
  const client = ctx.client();
  await client.login(username);
  await client.post('/api/auth/totp/verify', { code: totpCode(secret, timeStep(ctx.clock.now())) });
  return { client, secret };
}

/**
 * On 22/10/2026: an issued RMA contract of Sara Test ending on 31/10/2027, paid 1 000 MAD cash
 * (then reversed by the manager) and 234,50 MAD by cheque; ten blank RMA 14 A forms received.
 */
async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const { customer, car } = await customerWithVehicles(agent);
  const draft = (await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id])))
    .body;
  const contract = await issue(agent, draft);
  const pay = (body) =>
    agent.post(`/api/contracts/${contract.id}/payments`, {
      idempotencyKey: randomUUID(),
      ...body,
    });
  const cash = (await pay({ amount: '1000', method: 'CASH' })).body;
  await pay({ amount: '234,50', method: 'CHEQUE', reference: 'Chèque 123' });
  await manager.post(`/api/payments/${cash.id}/reverse`, {
    reason: 'Erreur de saisie',
    idempotencyKey: randomUUID(),
  });
  const holder = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'manager.a' } });
  const batch = await manager.post('/api/attestation-batches', {
    seriesId: (await series('RMA', '14 A')).id,
    firstNumber: '000000101',
    lastNumber: '000000110',
    receivedOn: '2026-10-20',
    location: 'Armoire fermée',
    holderId: holder.id,
  });
  expect(batch.status).toBe(201);
  return { manager, agent, contract, car };
}
const report = (client, name, from = '2026-10-01', to = '2026-10-31') =>
  client.get(`/api/reports/${name}?from=${from}&to=${to}`);

describe('reports', () => {
  it('lists the eight reports for management and the auditor, not for agents', async () => {
    const { manager, agent } = await setup();
    expect((await manager.get('/api/reports')).body.items.map((r) => r.name)).toEqual([
      'contrats-echeances',
      'paiements-jour',
      'paiements-assureur',
      'reversements-dus',
      'soldes-clients',
      'ecarts-caisse',
      'stock-attestations',
      'activite-employes',
    ]);
    expect((await agent.get('/api/reports')).status).toBe(403);
    const auditor = await signIn('auditeur', 'AUDITOR');
    expect((await report(auditor, 'paiements-jour')).status).toBe(200);
    expect((await report(manager, 'inconnu')).status).toBe(400);
    expect(
      (await report(manager, 'paiements-jour', '2026-10-31', '2026-10-01')).body.error.details,
    ).toEqual([{ path: 'to', rule: 'END_BEFORE_START' }]);
    expect(
      (await report(manager, 'paiements-jour', '2026-01-01', '2027-06-01')).body.error.details,
    ).toEqual([{ path: 'to', rule: 'PERIOD_TOO_LONG' }]);
  });

  it('adds up payments per day and per insurer, reversals deducted, and what is owed', async () => {
    const { manager } = await setup();
    const perDay = (await report(manager, 'paiements-jour')).body;
    expect(perDay.rows).toEqual([
      {
        day: '2026-10-22',
        CASH: '0.00',
        CHEQUE: '234.50',
        TRANSFER: '0.00',
        CARD: '0.00',
        OTHER: '0.00',
        count: 3,
        total: '234.50',
      },
    ]);
    expect(perDay.totals).toMatchObject({ total: '234.50', CASH: '0.00', TRANSFER: '0.00' });

    const perInsurer = (await report(manager, 'paiements-assureur')).body;
    expect(perInsurer.rows).toEqual([
      {
        insurer: 'RMA (Royale Marocaine d’Assurance)',
        payments: 2,
        collected: '1234.50',
        reversals: 1,
        reversed: '-1000.00',
        net: '234.50',
      },
    ]);

    // The cheque is owed to RMA by 15/11/2026 (rule L5); the reversed cash is not.
    const owed = (await report(manager, 'reversements-dus')).body;
    expect(owed.rows).toEqual([
      {
        insurer: 'RMA (Royale Marocaine d’Assurance)',
        month: '2026-10',
        count: 1,
        amount: '234.50',
        dueOn: '2026-11-15',
        late: 'Dans le délai',
      },
    ]);
  });

  it('lists the balances customers still owe, oldest first, to chase after 15 days', async () => {
    const { manager, contract } = await setup();
    // 22/10/2026: 1 234,50 due, 234,50 paid net; the cover starts on 01/11/2026.
    const owed = (await report(manager, 'soldes-clients')).body;
    expect(owed.title).toBe('Soldes clients à recouvrer');
    expect(owed.rows).toEqual([
      expect.objectContaining({
        customer: 'Sara Test',
        insurer: 'RMA',
        policyNumber: 'POL-0001',
        startDate: '2026-11-01',
        due: '1234.50',
        paid: '234.50',
        balance: '1000.00',
        lastPayment: '2026-10-22',
        days: 0,
        late: 'Récent',
      }),
    ]);
    expect(owed.totals).toEqual({ due: '1234.50', paid: '234.50', balance: '1000.00' });

    // 21/11/2026: twenty days after the start, to chase.
    ctx.clock.advance(30 * 86_400_000);
    const back = await signIn('manager.b', 'MANAGER');
    const later = (await report(back, 'soldes-clients')).body;
    expect(later.rows[0]).toMatchObject({ days: 20, late: 'Plus de 15 jours' });

    // Paid in full: no longer listed.
    await back.post(`/api/contracts/${contract.id}/payments`, {
      idempotencyKey: randomUUID(),
      amount: '1000',
      method: 'CASH',
    });
    expect((await report(back, 'soldes-clients')).body.rows).toEqual([]);
  });

  it('lists the cash roundings of the agency, the insurer keeping the exact amount', async () => {
    const { manager, agent, contract } = await setup();
    // 1 000,00 left to pay: the customer gives 999,50 and the agency covers 0,50.
    await agent.post(`/api/contracts/${contract.id}/payments`, {
      idempotencyKey: randomUUID(),
      amount: '1000',
      method: 'CASH',
      clientPaid: '999,50',
    });
    const gaps = (await report(manager, 'ecarts-caisse')).body;
    expect(gaps.title).toBe('Écarts de caisse (arrondis)');
    expect(gaps.rows).toEqual([
      {
        day: '2026-10-22',
        receipt: 'REC-2026-00004',
        customer: 'Sara Test',
        policyNumber: 'POL-0001',
        insurer: 'RMA',
        owed: '1000.00',
        clientPaid: '999.50',
        gap: '-0.50',
        by: 'Utilisateur agent.a',
      },
    ]);
    expect(gaps.totals).toEqual({ owed: '1000.00', clientPaid: '999.50', gap: '-0.50' });
    // Other periods and plain payments have none.
    expect((await report(manager, 'ecarts-caisse', '2026-09-01', '2026-09-30')).body.rows).toEqual(
      [],
    );
  });

  it('lists the contracts ending in the period, the stock per series and the activity of each employee', async () => {
    const { manager } = await setup();
    const expiring = (await report(manager, 'contrats-echeances', '2027-10-01', '2027-10-31')).body;
    expect(expiring.rows).toEqual([
      expect.objectContaining({
        month: '2027-10',
        endDate: '2027-10-31',
        customer: 'Sara Test',
        insurer: 'RMA',
        policyNumber: 'POL-0001',
        status: 'Émis',
        renewal: 'Pas encore ouvert',
      }),
    ]);
    expect((await report(manager, 'contrats-echeances')).body.rows).toEqual([]);

    const stock = (await report(manager, 'stock-attestations')).body;
    expect(stock.rows).toEqual([
      expect.objectContaining({ series: 'RMA 14 A', AVAILABLE: 10, USED: 0, total: 10 }),
    ]);
    expect(stock.rows[0].movements).toBeGreaterThan(0);

    const activity = (await report(manager, 'activite-employes')).body;
    expect(activity.rows).toEqual([
      {
        name: 'Utilisateur agent.a',
        role: 'Agent',
        contracts: 1,
        issued: 1,
        attestations: 0,
        payments: 2,
        collected: '1234.50',
        documents: 0,
        renewals: 0,
      },
    ]);
  });

  it('dates stock movements and employee activity by the agency clock, not the database', async () => {
    const { manager, contract, car } = await setup();
    const seriesId = (await series('RMA', '14 A')).id;
    await manager.post('/api/attestation-forms/move', {
      seriesId,
      firstNumber: '000000109',
      lastNumber: '000000110',
      to: 'DAMAGED',
      reason: 'Imprimante bloquée',
    });
    const recorded = await manager.post(`/api/contracts/${contract.id}/attestations`, {
      vehicleId: car.id,
      seriesId,
      number: '000000101',
      validFrom: '2026-11-01',
      validTo: '2027-10-31',
    });
    expect(recorded.status).toBe(201);
    const cancelled = await manager.post(
      `/api/attestations/${recorded.body.attestations[0].id}/cancel`,
      { reason: 'Erreur de saisie', version: 1 },
    );
    expect(cancelled.status).toBe(200);

    // Every record carries the agency's date (22/10/2026), whatever the computer's date.
    const october = { gte: new Date('2026-10-01'), lt: new Date('2026-11-01') };
    const outside = { NOT: { at: october } };
    expect(await ctx.prisma.attestationFormMovement.count({ where: outside })).toBe(0);
    expect(await ctx.prisma.contractStatusChange.count({ where: outside })).toBe(0);
    expect(await ctx.prisma.attestation.count({ where: { NOT: { createdAt: october } } })).toBe(0);
    expect(await ctx.prisma.contract.count({ where: { NOT: { createdAt: october } } })).toBe(0);

    // 10 received, 2 damaged, 1 used then cancelled.
    const stock = (await report(manager, 'stock-attestations')).body;
    expect(stock.rows[0]).toMatchObject({ AVAILABLE: 7, DAMAGED: 2, CANCELLED: 1, movements: 14 });
    const november = (await report(manager, 'stock-attestations', '2026-11-01', '2026-11-30')).body;
    expect(november.rows[0].movements).toBe(0);
    const activity = (await report(manager, 'activite-employes')).body;
    expect(activity.rows).toContainEqual(
      expect.objectContaining({ name: 'Utilisateur manager.a', attestations: 1 }),
    );
  });

  it('exports as CSV or Excel for management only, after confirming their identity, audited', async () => {
    await setup();
    const { client: manager, secret } = await managerWithSecret();
    const path = '/api/reports/paiements-jour/export?from=2026-10-01&to=2026-10-31';

    const tooEarly = await manager.get(`${path}&format=csv`);
    expect(tooEarly.status).toBe(403);
    expect(tooEarly.body.error.code).toBe('REAUTH_REQUIRED');

    ctx.clock.advance(30_000); // the next code: a code is never accepted twice
    const reauth = await manager.post('/api/auth/reauth', {
      password: PASSWORD,
      code: totpCode(secret, timeStep(ctx.clock.now())),
    });
    expect(reauth.status).toBe(200);

    const csv = await manager.getFile(`${path}&format=csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(csv.headers['content-disposition']).toBe(
      'attachment; filename="paiements-jour_2026-10-01_2026-10-31.csv"',
    );
    expect(csv.body.toString('utf8')).toContain('22/10/2026;0,00;234,50;0,00;0,00;0,00;3;234,50');

    const xlsx = await manager.getFile(`${path}&format=xlsx`);
    expect(xlsx.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(xlsx.body.subarray(0, 2).toString()).toBe('PK');
    expect((await manager.get(`${path}&format=pdf`)).status).toBe(400);

    const events = await ctx.prisma.auditLog.findMany({ where: { action: 'report.exported' } });
    expect(events.map((e) => [e.entityId, e.details.format, e.details.rows])).toEqual([
      ['paiements-jour', 'csv', 1],
      ['paiements-jour', 'xlsx', 1],
    ]);
    const auditor = await signIn('auditeur', 'AUDITOR');
    expect((await auditor.get(`${path}&format=csv`)).status).toBe(403);
  });
});
