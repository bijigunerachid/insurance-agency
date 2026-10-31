import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { numbersOf } from '../../src/modules/stock/service.js';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
const runtime = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

beforeEach(() => ctx.reset());
afterAll(async () => {
  await runtime.end();
  await ctx.close();
});

const { signIn, series, prepareCatalogue, customerWithVehicles, contractBody, issue } =
  contractFixtures(ctx);

const userId = async (username) =>
  (await ctx.prisma.user.findUniqueOrThrow({ where: { username } })).id;

/** RMA 14 A forms 000000101 to 000000110, kept by the manager. */
async function receive(manager, overrides = {}) {
  return manager.post('/api/attestation-batches', {
    seriesId: (await series('RMA', '14 A')).id,
    firstNumber: '000 000 101',
    lastNumber: '000000110',
    receivedOn: '2026-10-20',
    insurerReference: 'Bordereau RMA synthétique',
    location: 'Armoire fermée, bureau du gérant',
    holderId: await userId('manager.a'),
    ...overrides,
  });
}
const move = async (client, first, last, body) =>
  client.post('/api/attestation-forms/move', {
    seriesId: (await series('RMA', '14 A')).id,
    firstNumber: first,
    lastNumber: last,
    ...body,
  });
const formByNumber = (number) => ctx.prisma.attestationForm.findFirstOrThrow({ where: { number } });

describe('receiving blank attestations', () => {
  it('records a batch form by form, keeps the leading zeros and refuses an overlap', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    await prepareCatalogue(manager);

    const res = await receive(manager);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      firstNumber: '000000101',
      lastNumber: '000000110',
      quantity: 10,
      series: { code: '14 A', insurer: { code: 'RMA' } },
      holder: { displayName: 'Utilisateur manager.a' },
    });
    const summary = (await manager.get('/api/attestation-stock/summary')).body;
    expect(summary.series).toEqual([
      expect.objectContaining({
        total: 10,
        counts: expect.objectContaining({ AVAILABLE: 10, ASSIGNED: 0 }),
      }),
    ]);
    expect(await ctx.prisma.attestationFormMovement.count()).toBe(10);
    expect(await ctx.auditActions()).toContain('stock.batch_received');

    const overlap = await receive(manager, { firstNumber: '000000108', lastNumber: '000000112' });
    expect(overlap.status).toBe(409);
    expect(overlap.body.error).toMatchObject({
      code: 'FORMS_ALREADY_IN_STOCK',
      details: { count: 3, numbers: [{ number: '000000108', status: 'AVAILABLE' }, {}, {}] },
    });
  });

  it('validates the range, the series and who may receive', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    await prepareCatalogue(manager);
    for (const [overrides, rule] of [
      [{ firstNumber: '101', lastNumber: '0110' }, 'SAME_LENGTH'],
      [{ firstNumber: '000000110', lastNumber: '000000101' }, 'RANGE_ORDER'],
      [{ firstNumber: '000000001', lastNumber: '000005001' }, 'RANGE_TOO_LARGE'],
    ]) {
      const res = await receive(manager, overrides);
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([{ path: 'lastNumber', rule }]);
    }
    const unconfirmed = await receive(manager, { seriesId: (await series('RMA', '14 E')).id });
    expect(unconfirmed.body.error.details).toEqual([
      { path: 'seriesId', rule: 'SERIES_NOT_USABLE' },
    ]);

    const agent = await signIn('agent.a', 'AGENT');
    expect((await receive(agent)).status).toBe(403);
    const auditor = await signIn('auditor.a', 'AUDITOR');
    expect((await auditor.get('/api/attestation-stock/summary')).status).toBe(200);
    expect(numbersOf('0098', '0101')).toEqual(['0098', '0099', '0100', '0101']);
  });
});

describe('stock movements', () => {
  it('assigns forms, records exceptions with a reason and keeps every movement', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    await prepareCatalogue(manager);
    await signIn('agent.a', 'AGENT');
    await receive(manager);

    const assigned = await move(manager, '000000101', '000000105', {
      to: 'ASSIGNED',
      holderId: await userId('agent.a'),
    });
    expect(assigned.body).toEqual({ count: 5 });
    const noReason = await move(manager, '000000106', '000000106', { to: 'DAMAGED' });
    expect(noReason.body.error.details).toEqual([{ path: 'reason', rule: 'REQUIRED' }]);
    await move(manager, '000000106', '000000106', { to: 'DAMAGED', reason: 'Imprimante bloquée' });
    const lostDamaged = await move(manager, '000000105', '000000106', {
      to: 'LOST',
      reason: 'Introuvable',
    });
    expect(lostDamaged.body.error).toMatchObject({
      code: 'FORM_STATUS_CONFLICT',
      details: { count: 1, numbers: [{ number: '000000106', status: 'DAMAGED' }] },
    });
    const missing = await move(manager, '000000109', '000000111', {
      to: 'ASSIGNED',
      holderId: await userId('agent.a'),
    });
    expect(missing.body.error).toMatchObject({
      code: 'FORMS_NOT_IN_STOCK',
      details: { missing: 1 },
    });
    const returned = await move(manager, '000000106', '000000106', {
      to: 'RETURNED',
      reason: 'Rendu à RMA avec le bordereau 12',
    });
    expect(returned.body).toEqual({ count: 1 });

    const form = await formByNumber('000000106');
    const detail = (await manager.get(`/api/attestation-forms/${form.id}`)).body;
    expect(detail.movements.map((m) => [m.from, m.to, m.reason])).toEqual([
      ['DAMAGED', 'RETURNED', 'Rendu à RMA avec le bordereau 12'],
      ['AVAILABLE', 'DAMAGED', 'Imprimante bloquée'],
      [null, 'AVAILABLE', null],
    ]);
    const summary = (await manager.get('/api/attestation-stock/summary')).body;
    expect(summary.series[0].counts).toMatchObject({ AVAILABLE: 4, ASSIGNED: 5, RETURNED: 1 });
    expect(summary.assigned).toEqual([
      expect.objectContaining({
        holder: expect.objectContaining({ displayName: 'Utilisateur agent.a' }),
        count: 5,
      }),
    ]);
    const agentForms = await manager.get(
      `/api/attestation-forms?holderId=${await userId('agent.a')}&status=ASSIGNED`,
    );
    expect(agentForms.body.items.map((f) => f.number)).toEqual([
      '000000101',
      '000000102',
      '000000103',
      '000000104',
      '000000105',
    ]);
  });
});

describe('stock and contract attestations', () => {
  async function issuedContract() {
    const manager = await signIn('manager.a', 'MANAGER');
    const products = await prepareCatalogue(manager);
    const agent = await signIn('agent.a', 'AGENT');
    const other = await signIn('agent.b', 'AGENT');
    const { customer, car } = await customerWithVehicles(agent);
    const draft = (
      await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id]))
    ).body;
    const contract = await issue(agent, draft);
    await receive(manager);
    await move(manager, '000000101', '000000102', {
      to: 'ASSIGNED',
      holderId: await userId('agent.a'),
    });
    return { manager, agent, other, contract, car };
  }
  const record = async (client, contract, car, number, overrides = {}) =>
    client.post(`/api/contracts/${contract.id}/attestations`, {
      vehicleId: car.id,
      seriesId: (await series('RMA', '14 A')).id,
      number,
      validFrom: '2026-11-01',
      validTo: '2027-10-31',
      ...overrides,
    });

  it('uses the form from the stock when a paper attestation is recorded', async () => {
    const { agent, other, contract, car } = await issuedContract();

    const notInStock = await record(agent, contract, car, '000000999');
    expect(notInStock.body.error.details).toEqual([
      { path: 'number', rule: 'NUMBER_NOT_IN_STOCK' },
    ]);
    // Another agent cannot use a form given to agent.a.
    const heldByOther = await record(other, contract, car, '000000101');
    expect(heldByOther.body.error.details).toEqual([
      { path: 'number', rule: 'FORM_HELD_BY_OTHER' },
    ]);

    const ok = await record(agent, contract, car, '000000101');
    expect(ok.status).toBe(201);
    const form = await formByNumber('000000101');
    expect(form).toMatchObject({ status: 'USED', attestationId: ok.body.attestations[0].id });
    const listed = await agent.get('/api/attestation-forms?q=101');
    expect(listed.body.items[0]).toMatchObject({ status: 'USED', contract: { ref: contract.ref } });

    // A used form cannot be used twice, nor moved by hand.
    const reassigned = await move(await signIn('manager.b', 'MANAGER'), '000000101', '000000101', {
      to: 'LOST',
      reason: 'x',
    });
    expect(reassigned.body.error.code).toBe('FORM_STATUS_CONFLICT');

    // Cancelling the attestation cancels its form, with the reason.
    const cancelled = await agent.post(`/api/attestations/${ok.body.attestations[0].id}/cancel`, {
      reason: 'Erreur de saisie de l’assuré',
      version: 1,
    });
    expect(cancelled.status).toBe(200);
    const after = await formByNumber('000000101');
    expect(after.status).toBe('CANCELLED');
    const last = await ctx.prisma.attestationFormMovement.findFirst({
      where: { formId: after.id },
      orderBy: { id: 'desc' },
    });
    expect(last).toMatchObject({
      fromStatus: 'USED',
      toStatus: 'CANCELLED',
      reason: 'Erreur de saisie de l’assuré',
    });
  });

  it('lets a manager use any form, and leaves electronic attestations and untracked series alone', async () => {
    const { manager, agent, contract, car } = await issuedContract();
    expect((await record(manager, contract, car, '000000102')).status).toBe(201);
    expect((await record(agent, contract, car, '000000103')).status).toBe(201);
    // Electronic (QR) attestations use no paper form.
    const electronic = await record(agent, contract, car, '777777777', { medium: 'ELECTRONIC' });
    expect(electronic.status).toBe(201);
    // RMA 14 P has no batch yet: its numbers are not checked against the stock.
    const provisional = await record(agent, contract, car, '555', {
      seriesId: (await series('RMA', '14 P')).id,
      validFrom: '2026-10-23',
      validTo: '2026-11-22',
    });
    expect(provisional.status).toBe(201);
    expect(await ctx.prisma.attestationForm.count({ where: { status: 'USED' } })).toBe(2);
  });
});

describe('stock database protections', () => {
  it('never deletes forms, keeps movements append-only and enforces the rules', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    await prepareCatalogue(manager);
    await receive(manager);
    const form = await formByNumber('000000101');

    for (const table of ['attestation_batch', 'attestation_form', 'attestation_form_movement']) {
      await expect(runtime.query(`DELETE FROM "${table}"`)).rejects.toThrow(/permission denied/);
    }
    await expect(
      runtime.query('UPDATE "attestation_form_movement" SET "reason" = \'x\''),
    ).rejects.toThrow(/permission denied/);
    await expect(ctx.owner.query('DELETE FROM "attestation_form_movement"')).rejects.toThrow(
      /append-only/,
    );
    await expect(
      runtime.query(`UPDATE "attestation_form" SET "status" = 'USED' WHERE "id" = $1`, [form.id]),
    ).rejects.toThrow(/attestation_form_attestation/);
    await expect(
      runtime.query(
        `INSERT INTO "attestation_form_movement" ("formId", "fromStatus", "toStatus", "userId")
         SELECT $1, 'AVAILABLE', 'LOST', "holderId" FROM "attestation_form" WHERE "id" = $1`,
        [form.id],
      ),
    ).rejects.toThrow(/attestation_form_movement_exception_reason/);
  });
});
