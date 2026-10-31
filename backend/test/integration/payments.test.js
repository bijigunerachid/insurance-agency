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

/** A contract with the insurer's premium of 1 234,50 MAD (contractBody's default). */
async function setup(overrides = {}) {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const { customer, car } = await customerWithVehicles(agent);
  const contract = (
    await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id], overrides))
  ).body;
  return { manager, agent, contract };
}
const pay = (client, contract, body) =>
  client.post(`/api/contracts/${contract.id}/payments`, {
    method: 'CASH',
    idempotencyKey: randomUUID(),
    ...body,
  });

describe('payments at the agency', () => {
  it('records a payment with a numbered receipt and never more than the premium (L4)', async () => {
    const { agent, contract } = await setup();

    const first = await pay(agent, contract, { amount: '1 000,00', payerName: 'Karim Test' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      receiptNumber: 'REC-2026-00001',
      kind: 'PAYMENT',
      amount: '1000.00',
      method: 'CASH',
      payerName: 'Karim Test',
      receivedBy: { displayName: 'Utilisateur agent.a' },
      contract: { ref: contract.ref, customer: { displayName: 'Sara Test' } },
      agency: { name: null, address: null },
    });
    const state = (await agent.get(`/api/contracts/${contract.id}/payments`)).body;
    expect(state).toMatchObject({ premiumTotal: '1234.50', paid: '1000.00', balance: '234.50' });

    const tooMuch = await pay(agent, contract, { amount: '234.51' });
    expect(tooMuch.body.error.details).toEqual([{ path: 'amount', rule: 'AMOUNT_ABOVE_BALANCE' }]);
    const noCheque = await pay(agent, contract, { amount: '100', method: 'CHEQUE' });
    expect(noCheque.body.error.details).toEqual([{ path: 'reference', rule: 'REQUIRED' }]);
    const zero = await pay(agent, contract, { amount: '0' });
    expect(zero.body.error.details).toEqual([{ path: 'amount', rule: 'AMOUNT_NOT_POSITIVE' }]);

    const rest = await pay(agent, contract, {
      amount: '234.50',
      method: 'CHEQUE',
      reference: 'Chèque n° 123456, Banque Test',
    });
    expect(rest.body.receiptNumber).toBe('REC-2026-00002');
    expect((await agent.get(`/api/contracts/${contract.id}/payments`)).body.balance).toBe('0.00');
    expect(await ctx.auditActions()).toContain('payment.recorded');
  });

  it('needs the insurer premium first, and records one payment for a repeated request', async () => {
    const { agent, contract } = await setup();
    const customer = await ctx.prisma.customer.findFirstOrThrow();
    const product = await ctx.prisma.product.findFirstOrThrow({
      where: { id: contract.product.id },
    });
    const unpriced = (
      await agent.post(
        '/api/contracts',
        contractBody(customer, product.id, [contract.vehicles[0].id], { premiumTotal: null }),
      )
    ).body;
    const noPremium = await pay(agent, unpriced, { amount: '100' });
    expect(noPremium.body.error.code).toBe('PREMIUM_REQUIRED');

    const key = randomUUID();
    const once = await pay(agent, contract, { amount: '100', idempotencyKey: key });
    const twice = await pay(agent, contract, { amount: '100', idempotencyKey: key });
    expect(twice.body.id).toBe(once.body.id);
    expect(await ctx.prisma.payment.count({ where: { contractId: contract.id } })).toBe(1);
  });

  it('adds up two payments recorded at the same moment, never beyond the premium', async () => {
    const { agent, contract } = await setup();
    const colleague = await signIn('agent.b', 'AGENT');
    const results = await Promise.all([
      pay(agent, contract, { amount: '1000' }),
      pay(colleague, contract, { amount: '1000' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await agent.get(`/api/contracts/${contract.id}/payments`)).body.paid).toBe('1000.00');
  });

  it('lets only management reverse a payment, with a reason and a new receipt', async () => {
    const { manager, agent, contract } = await setup();
    const payment = (await pay(agent, contract, { amount: '500' })).body;
    const body = () => ({ reason: 'Erreur de montant', idempotencyKey: randomUUID() });

    expect((await agent.post(`/api/payments/${payment.id}/reverse`, body())).status).toBe(403);
    const reversal = await manager.post(`/api/payments/${payment.id}/reverse`, body());
    expect(reversal.status).toBe(201);
    expect(reversal.body).toMatchObject({
      receiptNumber: 'REC-2026-00002',
      kind: 'REVERSAL',
      amount: '-500.00',
      reason: 'Erreur de montant',
      reverses: { id: payment.id, receiptNumber: 'REC-2026-00001' },
    });
    const state = (await agent.get(`/api/contracts/${contract.id}/payments`)).body;
    expect(state).toMatchObject({ paid: '0.00', balance: '1234.50' });
    expect(state.items.find((p) => p.id === payment.id).reversedBy).toMatchObject({
      receiptNumber: 'REC-2026-00002',
    });

    const again = await manager.post(`/api/payments/${payment.id}/reverse`, body());
    expect(again.body.error.code).toBe('ALREADY_REVERSED');
    const ofReversal = await manager.post(`/api/payments/${reversal.body.id}/reverse`, body());
    expect(ofReversal.body.error.code).toBe('NOT_A_PAYMENT');
    const short = await manager.post(`/api/payments/${payment.id}/reverse`, {
      reason: 'x',
      idempotencyKey: randomUUID(),
    });
    expect(short.status).toBe(400);
  });

  it('lists the payments of a period with totals per method, readable by an auditor', async () => {
    const { agent, contract } = await setup();
    await pay(agent, contract, { amount: '200' });
    await pay(agent, contract, { amount: '300', method: 'TRANSFER', reference: 'VIR-1' });
    const auditor = await signIn('auditor.a', 'AUDITOR');

    const today = await auditor.get('/api/payments?from=2026-10-22&to=2026-10-22');
    expect(today.body).toMatchObject({
      total: 2,
      totals: {
        amount: '500.00',
        byMethod: [
          { method: 'CASH', amount: '200.00' },
          { method: 'TRANSFER', amount: '300.00' },
        ],
      },
    });
    expect(today.body.items[0].contract).toMatchObject({ ref: contract.ref, insurer: 'RMA' });
    expect((await auditor.get('/api/payments?from=2026-10-23')).body.total).toBe(0);
    expect((await auditor.post(`/api/contracts/${contract.id}/payments`, {})).status).toBe(403);
  });
});

describe('cash roundings of the agency', () => {
  it('keeps the exact premium as the payment and the agency’s gap beside it', async () => {
    // Premium 750,66: the customer gives 750,00 and the agency covers 0,66 (owner, 29/10/2026).
    const { manager, agent, contract } = await setup({ premiumTotal: '750.66' });

    const notCash = await pay(agent, contract, {
      amount: '750.66',
      method: 'CARD',
      clientPaid: '750',
    });
    expect(notCash.body.error.details).toEqual([
      { path: 'clientPaid', rule: 'ROUNDING_CASH_ONLY' },
    ]);
    const same = await pay(agent, contract, { amount: '750.66', clientPaid: '750,66' });
    expect(same.body.error.details).toEqual([{ path: 'clientPaid', rule: 'ROUNDING_SAME_AMOUNT' }]);
    const part = await pay(agent, contract, { amount: '700', clientPaid: '700,50' });
    expect(part.body.error.details).toEqual([
      { path: 'clientPaid', rule: 'ROUNDING_WHOLE_BALANCE' },
    ]);

    const paid = await pay(agent, contract, { amount: '750,66', clientPaid: '750,00' });
    expect(paid.status).toBe(201);
    expect(paid.body).toMatchObject({
      receiptNumber: 'REC-2026-00001',
      amount: '750.66',
      clientPaid: '750.00',
      roundingGap: '-0.66',
    });
    // Paid in full: the insurer is owed the exact premium, not what the customer gave.
    const state = (await agent.get(`/api/contracts/${contract.id}/payments`)).body;
    expect(state).toMatchObject({ paid: '750.66', balance: '0.00' });
    const summary = (await manager.get('/api/remittances/summary')).body;
    expect(summary.insurers.find((i) => i.code === 'RMA').months[0].amount).toBe('750.66');
    const audit = await ctx.owner.query(
      `SELECT "details" FROM "audit_log" WHERE "action" = 'payment.recorded'`,
    );
    expect(audit.rows[0].details).toMatchObject({ amount: '750.66', clientPaid: '750.00' });

    const list = (await manager.get('/api/payments?from=2026-10-22&to=2026-10-22')).body;
    expect(list.totals).toMatchObject({ amount: '750.66', roundingGap: '-0.66', roundings: 1 });
    // Cancelled, the payment no longer counts its rounding.
    await manager.post(`/api/payments/${paid.body.id}/reverse`, {
      reason: 'Erreur de contrat',
      idempotencyKey: randomUUID(),
    });
    const after = (await manager.get('/api/payments?from=2026-10-22&to=2026-10-22')).body;
    expect(after.totals).toMatchObject({ roundingGap: '0.00', roundings: 0 });
  });

  it('refuses a rounding the database would not keep', async () => {
    const { agent, contract } = await setup();
    const payment = (await pay(agent, contract, { amount: '500' })).body;
    const insert = (method, clientPaid) =>
      runtime.query(
        `INSERT INTO "payment" ("receiptNumber", "contractId", "kind", "amount", "method",
           "reference", "receivedById", "clientPaid", "idempotencyKey")
         SELECT 'REC-2026-09998', "contractId", 'PAYMENT', 10, $2, 'Réf', "receivedById", $3,
           gen_random_uuid() FROM "payment" WHERE "id" = $1`,
        [payment.id, method, clientPaid],
      );
    await expect(insert('CHEQUE', 11)).rejects.toThrow(/payment_client_paid/);
    await expect(insert('CASH', 10)).rejects.toThrow(/payment_client_paid/);
    await expect(insert('CASH', 0)).rejects.toThrow(/payment_client_paid/);
  });
});

describe('cash handed over and change given back', () => {
  it('prints what the customer gave and the change, the payment staying the amount', async () => {
    // Premium 751,55: the customer gives 800,00 and gets 48,45 back (owner, 30/10/2026).
    const { agent, contract } = await setup({ premiumTotal: '751.55' });

    const card = await pay(agent, contract, {
      amount: '751.55',
      method: 'CARD',
      cashTendered: '800',
    });
    expect(card.body.error.details).toEqual([{ path: 'cashTendered', rule: 'CHANGE_CASH_ONLY' }]);
    const short = await pay(agent, contract, { amount: '751,55', cashTendered: '751,50' });
    expect(short.body.error.details).toEqual([{ path: 'cashTendered', rule: 'CHANGE_BELOW_PAID' }]);

    const paid = await pay(agent, contract, { amount: '751,55', cashTendered: '800' });
    expect(paid.status).toBe(201);
    expect(paid.body).toMatchObject({
      amount: '751.55',
      cashTendered: '800.00',
      change: '48.45',
      clientPaid: null,
    });
    const receipt = (await agent.get(`/api/payments/${paid.body.id}`)).body;
    expect(receipt).toMatchObject({ cashTendered: '800.00', change: '48.45' });
    expect((await agent.get(`/api/contracts/${contract.id}/payments`)).body).toMatchObject({
      paid: '751.55',
      balance: '0.00',
    });
    const audit = await ctx.owner.query(
      `SELECT "details" FROM "audit_log" WHERE "action" = 'payment.recorded'`,
    );
    expect(audit.rows[0].details).toMatchObject({ amount: '751.55', cashTendered: '800' });
  });

  it('counts the change from the rounded sum when the agency rounded', async () => {
    // 751,55 rounded to 752,00; the customer gives 800,00 and gets 48,00 back.
    const { agent, contract } = await setup({ premiumTotal: '751.55' });
    const below = await pay(agent, contract, {
      amount: '751.55',
      clientPaid: '752',
      cashTendered: '751.80',
    });
    expect(below.body.error.details).toEqual([{ path: 'cashTendered', rule: 'CHANGE_BELOW_PAID' }]);
    const paid = await pay(agent, contract, {
      amount: '751.55',
      clientPaid: '752',
      cashTendered: '800',
    });
    expect(paid.body).toMatchObject({
      clientPaid: '752.00',
      cashTendered: '800.00',
      change: '48.00',
    });
  });

  it('refuses cash handed over the database would not keep', async () => {
    const { agent, contract } = await setup();
    const payment = (await pay(agent, contract, { amount: '500' })).body;
    const insert = (method, clientPaid, cashTendered) =>
      runtime.query(
        `INSERT INTO "payment" ("receiptNumber", "contractId", "kind", "amount", "method",
           "reference", "receivedById", "clientPaid", "cashTendered", "idempotencyKey")
         SELECT 'REC-2026-09997', "contractId", 'PAYMENT', 10, $2, 'Réf', "receivedById", $3, $4,
           gen_random_uuid() FROM "payment" WHERE "id" = $1`,
        [payment.id, method, clientPaid, cashTendered],
      );
    await expect(insert('CHEQUE', null, 20)).rejects.toThrow(/payment_cash_tendered/);
    await expect(insert('CASH', null, 9.99)).rejects.toThrow(/payment_cash_tendered/);
    await expect(insert('CASH', 11, 10.5)).rejects.toThrow(/payment_cash_tendered/);
  });
});

describe('payment database protections', () => {
  it('never changes or deletes a payment, and a reversal cancels its exact amount', async () => {
    const { agent, contract } = await setup();
    const payment = (await pay(agent, contract, { amount: '500' })).body;

    await expect(runtime.query('DELETE FROM "payment"')).rejects.toThrow(/permission denied/);
    await expect(runtime.query('UPDATE "payment" SET "amount" = 1')).rejects.toThrow(
      /permission denied/,
    );
    await expect(ctx.owner.query('UPDATE "payment" SET "amount" = 1')).rejects.toThrow(
      /never changed/,
    );
    const insertReversal = (amount, reason) =>
      runtime.query(
        `INSERT INTO "payment" ("receiptNumber", "contractId", "kind", "amount", "method",
           "receivedById", "reversesId", "reason", "idempotencyKey")
         SELECT 'REC-2026-09999', "contractId", 'REVERSAL', $2, 'CASH', "receivedById", "id",
           $3, gen_random_uuid() FROM "payment" WHERE "id" = $1`,
        [payment.id, amount, reason],
      );
    await expect(insertReversal(-100, 'Test')).rejects.toThrow(/exact amount/);
    // The right amount, but no reason.
    await expect(insertReversal(-500, null)).rejects.toThrow(/payment_kind/);
  });
});
