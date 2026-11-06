import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateTotpSecret, timeStep, totpCode } from '../../src/modules/auth/totp.js';
import { contractFixtures } from './fixtures.js';
import { PASSWORD, createTestContext } from './support.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const { signIn, prepareCatalogue, customerWithVehicles, contractBody, issue } =
  contractFixtures(ctx);

const DAY = 24 * 3600 * 1000;

/**
 * The agency clock starts on 22/10/2026. agent.a records three contracts (premium 1 234,50): on
 * the 22nd an RMA one paid in full and a CAT one cancelled by the insurer since; on the 23rd an
 * RMA one paid 500 starting in December; and an RMA draft never issued. agent.b records an RMA
 * contract issued on the 23rd, nothing paid.
 */
async function setup() {
  const first = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(first);
  let a = await signIn('agent.a', 'AGENT');
  let b = await signIn('agent.b', 'AGENT');
  const sara = await customerWithVehicles(a, 'Sara');
  const nadia = await customerWithVehicles(b, 'Nadia');
  const record = async (client, { customer, car }, product, overrides = {}) =>
    (await client.post('/api/contracts', contractBody(customer, product, [car.id], overrides)))
      .body;
  const issued = async (client, owner, product, overrides) => {
    const draft = await record(client, owner, product, overrides);
    return issue(client, draft, draft.policyNumber);
  };
  const pay = (client, contract, amount) =>
    client.post(`/api/contracts/${contract.id}/payments`, {
      method: 'CASH',
      amount,
      idempotencyKey: randomUUID(),
    });

  const paid = await issued(a, sara, products.RMA);
  expect((await pay(a, paid, '1234.50')).status).toBe(201);
  const cat = await issued(a, sara, products.CAT);
  const cancelled = await first.post(`/api/contracts/${cat.id}/transition`, {
    to: 'CANCELLED',
    reason: 'Résiliation par l’assureur',
    insurerReference: 'Courriel de l’assureur',
    effectiveDate: '2026-11-15',
    version: cat.version,
  });
  expect(cancelled.status).toBe(200);

  // The next day: everyone signs in again (sessions end after a while without activity).
  ctx.clock.advance(DAY);
  const again = async (username) => {
    const client = ctx.client();
    await client.login(username);
    return client;
  };
  a = await again('agent.a');
  b = await again('agent.b');
  const manager = await signIn('manager.b', 'MANAGER');
  const part = await issued(a, sara, products.RMA, { startDate: '2026-12-01' });
  expect((await pay(a, part, '500')).status).toBe(201);
  const draft = await record(a, sara, products.RMA);
  const other = await issued(b, nadia, products.RMA);
  return { manager, a, b, products, paid, part, cat, draft, other };
}
const production = (client, query) => client.get(`/api/production?${query}`);
const OCTOBER = 'from=2026-10-01&to=2026-10-31';

describe('état de production', () => {
  it('lists the contracts issued in the period with what is left to pay, and its totals', async () => {
    const { manager, paid, part, cat, draft, other } = await setup();
    const res = await production(manager, OCTOBER);
    expect(res.status).toBe(200);
    // By date of issue; the draft never issued is not production.
    expect(res.body.rows.map((r) => r.id)).toEqual([paid.id, cat.id, part.id, other.id]);
    expect(res.body.rows.map((r) => r.id)).not.toContain(draft.id);
    const row = (contract) => res.body.rows.find((r) => r.id === contract.id);
    expect(row(paid)).toEqual({
      order: 1,
      id: paid.id,
      policyNumber: paid.policyNumber,
      customer: 'Sara Test',
      premium: '1234.50',
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      balance: '0.00',
      collectedOn: '2026-10-22',
      cancelledOn: null,
      operator: 'Utilisateur agent.a',
      status: 'ISSUED',
    });
    expect(row(part)).toMatchObject({ balance: '734.50', collectedOn: '2026-10-23' });
    // Cancelled since: still production, with the date the insurer's cancellation took effect.
    expect(row(cat)).toMatchObject({
      cancelledOn: '2026-11-15',
      status: 'CANCELLED',
      premium: '1234.50',
      // Nothing left to collect on it: out of the totals.
      balance: null,
    });
    expect(row(other)).toMatchObject({ balance: '1234.50', operator: 'Utilisateur agent.b' });
    expect(res.body.totals).toEqual({
      count: 4,
      premium: '3703.50',
      balance: '1969.00',
      collected: '1734.50',
    });
    expect(res.body).toMatchObject({ basis: 'ISSUE', from: '2026-10-01', operator: null });
    expect(res.body.columns.map((c) => c.label)).toEqual([
      'Ordre',
      'N° de police',
      'Client',
      'Prime',
      'Effet',
      'Échéance',
      'Reste',
      'Date encaissée',
      'Annulé le',
      'Opérateur',
    ]);

    // One day of issue only, in the agency's time zone.
    const day = await production(manager, 'from=2026-10-22&to=2026-10-22');
    expect(day.body.rows.map((r) => r.id)).toEqual([paid.id, cat.id]);
    // By date of effect: only the contract starting in December.
    const effect = await production(manager, 'basis=EFFECT&from=2026-12-01&to=2026-12-31');
    expect(effect.body.rows.map((r) => r.id)).toEqual([part.id]);
  });

  it('filters by insurer, employee and payment', async () => {
    const { manager, products, a, paid, part, cat, other } = await setup();
    const ids = async (query) =>
      (await production(manager, `${OCTOBER}&${query}`)).body.rows.map((r) => r.id).sort();
    const cat_ = await ctx.prisma.product.findUniqueOrThrow({ where: { id: products.CAT } });
    expect(await ids(`insurerId=${cat_.insurerId}`)).toEqual([cat.id]);
    const agentA = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'agent.a' } });
    expect(await ids(`operatorId=${agentA.id}`)).toEqual([paid.id, part.id, cat.id].sort());
    expect(await ids('payment=PAID')).toEqual([paid.id]);
    expect(await ids('payment=PARTIAL')).toEqual([part.id]);
    expect(await ids('payment=NONE')).toEqual([cat.id, other.id].sort());
    const one = (await production(manager, `${OCTOBER}&operatorId=${agentA.id}`)).body;
    expect(one.operator).toEqual({ id: agentA.id, displayName: 'Utilisateur agent.a' });
    // Management chooses among the employees who recorded contracts.
    const operators = (await manager.get('/api/production/operators')).body.items;
    expect(operators.map((o) => o.displayName)).toEqual([
      'Utilisateur agent.a',
      'Utilisateur agent.b',
    ]);
    expect((await production(a, `${OCTOBER}&payment=SOME`)).status).toBe(400);
    expect((await production(a, 'from=2026-10-31&to=2026-10-01')).status).toBe(400);
    expect((await production(a, 'from=2025-01-01&to=2026-10-31')).status).toBe(400);
  });

  it('shows an agent their own production only, and refuses another’s', async () => {
    const { a, b, paid, part, cat, other } = await setup();
    const mine = (await production(a, OCTOBER)).body;
    expect(mine.rows.map((r) => r.id).sort()).toEqual([paid.id, part.id, cat.id].sort());
    expect(mine.operator.displayName).toBe('Utilisateur agent.a');
    expect((await production(b, OCTOBER)).body.rows.map((r) => r.id)).toEqual([other.id]);
    expect((await a.get('/api/production/operators')).body.items).toEqual([
      { id: mine.operator.id, displayName: 'Utilisateur agent.a' },
    ]);

    const agentB = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'agent.b' } });
    const refused = await production(a, `${OCTOBER}&operatorId=${agentB.id}`);
    expect(refused.status).toBe(403);
    const denied = await ctx.prisma.auditLog.findFirst({
      where: { action: 'security.access_denied' },
    });
    expect(denied.details).toMatchObject({ permission: 'production.all' });
    // Its own id is accepted.
    expect((await production(a, `${OCTOBER}&operatorId=${mine.operator.id}`)).status).toBe(200);
    // No Excel file for an agent.
    expect((await a.get(`/api/production/export?${OCTOBER}`)).status).toBe(403);
  });

  it('exports Excel for management after confirming their identity, with the totals, audited', async () => {
    await setup();
    const secret = generateTotpSecret();
    await ctx.createUser({ username: 'gerant', role: 'MANAGER', totpSecret: secret });
    const manager = ctx.client();
    await manager.login('gerant');
    await manager.post('/api/auth/totp/verify', {
      code: totpCode(secret, timeStep(ctx.clock.now())),
    });
    const path = `/api/production/export?${OCTOBER}`;
    expect((await manager.get(path)).body.error.code).toBe('REAUTH_REQUIRED');
    ctx.clock.advance(30_000);
    await manager.post('/api/auth/reauth', {
      password: PASSWORD,
      code: totpCode(secret, timeStep(ctx.clock.now())),
    });

    const xlsx = await manager.getFile(path);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(xlsx.headers['content-disposition']).toBe(
      'attachment; filename="etat-production_2026-10-01_2026-10-31.xlsx"',
    );
    expect(xlsx.body.subarray(0, 2).toString()).toBe('PK');
    const csv = (await manager.getFile(`${path}&format=csv`)).body.toString('utf8');
    expect(csv.split('\r\n')[0]).toBe(
      '﻿Ordre;N° de police;Client;Prime;Effet;Échéance;Reste;Date encaissée;Annulé le;Opérateur',
    );
    expect(csv).toContain(';TOTAUX;;3703,50;;;1969,00;;;');
    expect(csv).toContain(';ENCAISSEMENT;;1734,50;;;;;;');
    const events = await ctx.prisma.auditLog.findMany({ where: { action: 'report.exported' } });
    expect(events.map((e) => [e.entityId, e.details.format, e.details.rows])).toEqual([
      ['etat-production', 'xlsx', 4],
      ['etat-production', 'csv', 4],
    ]);
  });
});
