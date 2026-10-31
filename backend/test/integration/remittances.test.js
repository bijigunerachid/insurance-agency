import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
const runtime = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

beforeEach(() => ctx.reset());
afterAll(async () => {
  await runtime.end();
  await ctx.close();
});

const { signIn, prepareCatalogue, customerWithVehicles, contractBody } = contractFixtures(ctx);
const DAY = 86_400_000;

/** An RMA contract with the insurer's premium of 1 234,50 MAD; the clock starts on 22/10/2026. */
async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const { customer, car } = await customerWithVehicles(agent);
  const contract = (
    await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id]))
  ).body;
  const rma = await ctx.prisma.insurer.findUniqueOrThrow({ where: { code: 'RMA' } });
  return { manager, agent, contract, rma };
}
const pay = async (client, contract, amount) =>
  (
    await client.post(`/api/contracts/${contract.id}/payments`, {
      amount,
      method: 'CASH',
      idempotencyKey: randomUUID(),
    })
  ).body;
const remit = (client, body) =>
  client.post('/api/remittances', {
    method: 'TRANSFER',
    reference: 'Virement n° 0001',
    remittedOn: '2026-10-22',
    idempotencyKey: randomUUID(),
    ...body,
  });
const rmaMonths = async (client) =>
  (await client.get('/api/remittances/summary')).body.insurers.find((i) => i.code === 'RMA');

describe('remittances to the insurers (rule L5)', () => {
  it('shows what is owed per month with the legal due date, and records a remittance once', async () => {
    const first = await setup();
    const october = await pay(first.agent, first.contract, '1000');
    ctx.clock.advance(10 * DAY); // 01/11/2026: yesterday's sessions have expired.
    const { contract, rma } = first;
    const manager = await signIn('manager.b', 'MANAGER');
    const agent = await signIn('agent.b', 'AGENT');
    await pay(agent, contract, '234,50');

    expect((await agent.get('/api/remittances/summary')).status).toBe(403);
    const summary = (await manager.get('/api/remittances/summary')).body;
    expect(summary.today).toBe('2026-11-01');
    expect(summary.insurers.map((i) => [i.code, i.total])).toEqual([
      ['CAT', '0.00'],
      ['RMA', '1234.50'],
    ]);
    expect(summary.insurers[1].months).toEqual([
      {
        month: '2026-10',
        amount: '1000.00',
        count: 1,
        dueOn: '2026-11-15',
        daysLeft: 14,
        overdue: false,
      },
      {
        month: '2026-11',
        amount: '234.50',
        count: 1,
        dueOn: '2026-12-15',
        daysLeft: 44,
        overdue: false,
      },
    ]);

    // What a remittance of October would include, shown before recording it.
    const preview = (
      await manager.get(
        `/api/remittances/outstanding?insurerId=${rma.id}&collectedUntil=2026-10-31`,
      )
    ).body;
    expect(preview).toMatchObject({ amount: '1000.00', collectedUntil: '2026-10-31' });
    expect(preview.items).toEqual([
      expect.objectContaining({
        receiptNumber: october.receiptNumber,
        kind: 'PAYMENT',
        amount: '1000.00',
        customer: 'Sara Test',
        contract: { id: contract.id, ref: contract.ref },
      }),
    ]);

    const october31 = { insurerId: rma.id, collectedUntil: '2026-10-31' };
    const changed = await remit(manager, { ...october31, expectedAmount: '1234.50' });
    expect(changed.status).toBe(409);
    expect(changed.body.error).toMatchObject({
      code: 'AMOUNT_CHANGED',
      details: { amount: '1000.00' },
    });
    const noReference = await remit(manager, {
      ...october31,
      expectedAmount: '1000',
      reference: ' ',
    });
    expect(noReference.body.error.details).toEqual([{ path: 'reference', rule: 'REQUIRED' }]);
    const future = await remit(manager, {
      ...october31,
      expectedAmount: '1000',
      remittedOn: '2026-11-02',
    });
    expect(future.body.error.details).toEqual([{ path: 'remittedOn', rule: 'DATE_IN_FUTURE' }]);
    expect((await remit(agent, { ...october31, expectedAmount: '1000' })).status).toBe(403);

    const body = {
      ...october31,
      expectedAmount: '1 000,00',
      method: 'PLATFORM',
      reference: 'Plateforme RMA, réf. 77',
      idempotencyKey: randomUUID(),
    };
    const created = await remit(manager, body);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      number: 'VER-2026-00001',
      insurer: { code: 'RMA' },
      amount: '1000.00',
      method: 'PLATFORM',
      collectedUntil: '2026-10-31',
      remittedOn: '2026-10-22',
      itemCount: 1,
      status: 'ACTIVE',
      cancellation: null,
      recordedBy: { displayName: 'Utilisateur manager.b' },
    });
    expect(created.body.items.map((i) => i.receiptNumber)).toEqual([october.receiptNumber]);
    // The same request again (double click, retry) records nothing more.
    expect((await remit(manager, body)).body.id).toBe(created.body.id);
    expect(await ctx.prisma.remittance.count()).toBe(1);

    expect((await rmaMonths(manager)).months.map((m) => m.month)).toEqual(['2026-11']);
    const again = await remit(manager, { ...october31, expectedAmount: '0' });
    expect(again.body.error.code).toBe('NOTHING_TO_REMIT');
    expect(await ctx.auditActions()).toContain('remittance.recorded');
  });

  it('flags late months, nets reversals, and cancels a mistaken remittance with a reason', async () => {
    const start = await setup();
    const first = await pay(start.agent, start.contract, '1000');
    ctx.clock.advance(29 * DAY); // 20/11/2026: October was due on 15/11.
    const { contract, rma } = start;
    const manager = await signIn('manager.b', 'MANAGER');
    const agent = await signIn('agent.b', 'AGENT');
    const late = await rmaMonths(manager);
    expect(late.months[0]).toMatchObject({ month: '2026-10', overdue: true, daysLeft: -5 });
    expect(late.overdueAmount).toBe('1000.00');

    // A payment reversed before being remitted is not owed at all.
    await manager.post(`/api/payments/${first.id}/reverse`, {
      reason: 'Erreur de saisie',
      idempotencyKey: randomUUID(),
    });
    expect((await rmaMonths(manager)).months).toEqual([]);

    const second = await pay(agent, contract, '500');
    const today = { insurerId: rma.id, collectedUntil: '2026-11-20', remittedOn: '2026-11-20' };
    const remittance = (await remit(manager, { ...today, expectedAmount: '500' })).body;
    expect(remittance).toMatchObject({ amount: '500.00', itemCount: 1 });

    const path = `/api/remittances/${remittance.id}/cancel`;
    expect((await agent.post(path, { reason: 'Montant erroné' })).status).toBe(403);
    expect((await manager.post(path, { reason: '' })).status).toBe(400);
    const cancelled = (await manager.post(path, { reason: 'Virement refusé par la banque' })).body;
    expect(cancelled).toMatchObject({
      status: 'CANCELLED',
      cancellation: {
        reason: 'Virement refusé par la banque',
        by: { displayName: 'Utilisateur manager.b' },
      },
      itemCount: 1,
    });
    expect((await manager.post(path, { reason: 'Encore une fois' })).body.error.code).toBe(
      'REMITTANCE_ALREADY_CANCELLED',
    );
    // Its payment is to remit again, in a new remittance with a new number.
    expect((await rmaMonths(manager)).total).toBe('500.00');
    const redone = (await remit(manager, { ...today, expectedAmount: '500' })).body;
    expect(redone).toMatchObject({ number: 'VER-2026-00002', amount: '500.00' });

    // A reversal of a remitted payment is deducted from the next remittance.
    await manager.post(`/api/payments/${second.id}/reverse`, {
      reason: 'Contrat annulé par l’assureur',
      idempotencyKey: randomUUID(),
    });
    expect((await rmaMonths(manager)).total).toBe('-500.00');
    const nothing = await remit(manager, { ...today, expectedAmount: '0' });
    expect(nothing.body.error.code).toBe('NOTHING_TO_REMIT');

    const auditor = await signIn('auditeur', 'AUDITOR');
    const cancelledList = (await auditor.get('/api/remittances?status=CANCELLED')).body;
    expect(cancelledList.items.map((r) => r.number)).toEqual(['VER-2026-00001']);
    expect((await auditor.get(`/api/remittances?insurerId=${rma.id}`)).body.total).toBe(2);
    expect((await auditor.post(path, { reason: 'Pas autorisé' })).status).toBe(403);
    expect(await ctx.auditActions()).toContain('remittance.cancelled');
  });

  it('never includes a payment in two remittances recorded at the same moment', async () => {
    const { manager, agent, contract, rma } = await setup();
    await pay(agent, contract, '1000');
    const body = { insurerId: rma.id, collectedUntil: '2026-10-22', expectedAmount: '1000' };
    const results = await Promise.all([remit(manager, body), remit(manager, body)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409).body.error.code).toBe('NOTHING_TO_REMIT');
    expect(await ctx.prisma.remittanceItem.count()).toBe(1);
  });

  it('protects remittances in the database', async () => {
    const { manager, agent, contract, rma } = await setup();
    const payment = await pay(agent, contract, '1000');
    const remittance = (
      await remit(manager, {
        insurerId: rma.id,
        collectedUntil: '2026-10-22',
        expectedAmount: '1000',
      })
    ).body;

    // The application's database account can neither edit nor delete.
    await expect(runtime.query('UPDATE "remittance" SET "amount" = 1')).rejects.toThrow(
      /permission denied/,
    );
    await expect(runtime.query('DELETE FROM "remittance_item"')).rejects.toThrow(
      /permission denied/,
    );
    // Not even the schema owner can change a remittance other than by cancelling it…
    await expect(ctx.owner.query('UPDATE "remittance" SET "amount" = 1')).rejects.toThrow(
      /only cancelled, once/,
    );
    await expect(ctx.owner.query('DELETE FROM "remittance"')).rejects.toThrow(/never deleted/);
    await expect(ctx.owner.query('UPDATE "remittance_item" SET "released" = true')).rejects.toThrow(
      /only released when its remittance is cancelled/,
    );
    // …include a payment twice, or a payment of another insurer.
    const cat = await ctx.prisma.insurer.findUniqueOrThrow({ where: { code: 'CAT' } });
    const user = await ctx.prisma.user.findFirstOrThrow({ where: { username: 'manager.a' } });
    const insert = (insurerId, number) =>
      ctx.owner.query(
        `INSERT INTO "remittance" ("number", "insurerId", "collectedUntil", "amount", "method", "remittedOn", "recordedById", "idempotencyKey")
         VALUES ($1, $2, '2026-10-22', 1000, 'CASH', '2026-10-22', $3, gen_random_uuid()) RETURNING "id"`,
        [number, insurerId, user.id],
      );
    const item = (remittanceId) =>
      ctx.owner.query(
        `INSERT INTO "remittance_item" ("remittanceId", "paymentId", "amount") VALUES ($1, $2, 1000)`,
        [remittanceId, payment.id],
      );
    const other = (await insert(rma.id, 'VER-2026-00098')).rows[0].id;
    await expect(item(other)).rejects.toThrow(/remittance_item_payment_open/);
    const atCat = (await insert(cat.id, 'VER-2026-00099')).rows[0].id;
    await expect(item(atCat)).rejects.toThrow(/only includes payments of its insurer/);
    await expect(
      ctx.owner.query(
        `UPDATE "remittance" SET "cancelledAt" = now(), "cancelledById" = $1 WHERE "id" = $2`,
        [user.id, remittance.id],
      ),
    ).rejects.toThrow(/remittance_cancellation/);
    await expect(insert(rma.id, 'VER-26-1')).rejects.toThrow(/remittance_number_format/);
  });
});
