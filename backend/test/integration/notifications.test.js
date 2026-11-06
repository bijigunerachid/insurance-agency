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

const { signIn, prepareCatalogue, customerWithVehicles, contractBody, issue, series } =
  contractFixtures(ctx);

const DAY = 24 * 3600 * 1000;
const MINUTE = 60 * 1000;
const summary = async (client) => (await client.get('/api/notifications/summary')).body;
const history = async (client, query = '') => (await client.get(`/api/notifications${query}`)).body;
/** A day later the sessions have ended: the agents sign in again. */
async function again(username) {
  const client = ctx.client();
  await client.login(username);
  return client;
}

/** The agency clock starts on 22/10/2026 at 10:00 in Casablanca. */
async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const a = await signIn('agent.a', 'AGENT');
  const b = await signIn('agent.b', 'AGENT');
  const sara = await customerWithVehicles(a, 'Sara');
  const record = async (overrides) =>
    (
      await a.post(
        '/api/contracts',
        contractBody(sara.customer, products.RMA, [sara.car.id], overrides),
      )
    ).body;
  const issued = async (overrides) => {
    const draft = await record(overrides);
    return issue(a, draft, draft.policyNumber);
  };
  // What follows happens after the accounts were created.
  ctx.clock.advance(MINUTE);
  return { manager, a, b, products, sara, record, issued };
}

describe('team activity', () => {
  it('tells the team what a colleague recorded, never counting one’s own actions', async () => {
    const { a, b, issued } = await setup();
    const contract = await issued();
    const payment = await a.post(`/api/contracts/${contract.id}/payments`, {
      method: 'CASH',
      amount: '500',
      idempotencyKey: randomUUID(),
    });
    expect(payment.status).toBe(201);

    const forB = await summary(b);
    // Recorded, issued by the insurer, paid: newest first.
    expect(forB.unread).toBe(3);
    expect(forB.recent.map((n) => [n.kind, n.action])).toEqual([
      ['ACTIVITY', 'payment.recorded'],
      ['ACTIVITY', 'contract.status_changed'],
      ['ACTIVITY', 'contract.created'],
    ]);
    expect(forB.recent[0]).toMatchObject({
      actor: { displayName: 'Utilisateur agent.a' },
      data: { policyNumber: contract.policyNumber, customer: 'Sara Test', amount: '500.00' },
      link: `/recus/${payment.body.id}`,
      unread: true,
      mine: false,
    });
    expect(forB.recent[1].data).toMatchObject({ to: 'ISSUED' });
    expect(forB.recent[2].link).toBe(`/contrats/${contract.id}`);
    // The steps inside the agency (sent to the insurer) are not announced.
    expect((await history(b)).total).toBe(3);

    // agent.a sees the same history, but nothing of theirs is new.
    const forA = await summary(a);
    expect(forA.unread).toBe(0);
    expect((await history(a)).items.every((n) => n.mine && !n.unread)).toBe(true);

    // Opening the bell: seen. The next action is new again.
    expect((await b.post('/api/notifications/seen', {})).status).toBe(200);
    expect((await summary(b)).unread).toBe(0);
    ctx.clock.advance(MINUTE);
    await a.post(`/api/contracts/${contract.id}/payments`, {
      method: 'CASH',
      amount: '100',
      idempotencyKey: randomUUID(),
    });
    const later = await summary(b);
    expect(later.unread).toBe(1);
    expect((await history(b)).items.map((n) => n.unread)).toEqual([true, false, false, false]);
  });

  it('follows the renewal steps: a step, a new follower, the new contract', async () => {
    const { manager, a, b, issued } = await setup();
    // Ends in 20 days: its renewal opens at once.
    await issued({ startDate: '2025-11-11', endDate: '2026-11-11' });
    const [renewal] = (await a.get('/api/renewals')).body.items;
    await a.send('patch', `/api/renewals/${renewal.id}`, {
      status: 'CUSTOMER_CONTACTED',
      note: 'Appelée',
      version: renewal.version,
    });
    const agentB = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'agent.b' } });
    await manager.post(`/api/renewals/${renewal.id}/assign`, {
      assignedUserId: agentB.id,
      version: renewal.version + 1,
    });
    const actions = (await history(b, '?kind=ACTIVITY')).items.map((n) => [n.action, n.data]);
    expect(actions.slice(0, 2)).toEqual([
      [
        'renewal.assigned',
        expect.objectContaining({ assignee: 'Utilisateur agent.b', customer: 'Sara Test' }),
      ],
      ['renewal.updated', expect.objectContaining({ to: 'CUSTOMER_CONTACTED' })],
    ]);
  });

  it('writes nothing when the action is refused, and keeps the history as it was', async () => {
    const { a, b, record } = await setup();
    const draft = await record();
    // Issued without the insurer's proof: refused, rolled back, not announced.
    const refused = await a.post(`/api/contracts/${draft.id}/transition`, {
      to: 'ISSUED',
      version: draft.version,
    });
    expect(refused.status).toBe(409);
    expect((await history(b)).items.map((n) => n.action)).toEqual(['contract.created']);

    await expect(runtime.query('DELETE FROM "notification"')).rejects.toThrow(/permission denied/);
    await expect(runtime.query('UPDATE "notification" SET "link" = \'/x\'')).rejects.toThrow(
      /permission denied/,
    );
    await expect(ctx.owner.query('DELETE FROM "notification"')).rejects.toThrow(/append-only/);
    await expect(
      ctx.owner.query(
        `INSERT INTO "notification" ("kind", "permission", "dedupeKey", "data", "link")
         VALUES ('UNPAID', 'payments.read', 'x', '{}', 'https://example.com')`,
      ),
    ).rejects.toThrow(/notification_link/);
  });
});

describe('alerts of the day', () => {
  it('announces a renewal at 30, 15 and 7 days, once each, with who follows it and the last step', async () => {
    const { a, issued } = await setup();
    // Ends on 11/11/2026: 20 days from the 22nd of October.
    const contract = await issued({ startDate: '2025-11-12', endDate: '2026-11-11' });
    const renewals = async (client) =>
      (await history(client, '?kind=RENEWAL_DUE')).items.map((n) => n.data);

    await summary(a);
    // Checked again a minute later (the alerts are looked for at most once a minute): still one.
    ctx.clock.advance(2 * MINUTE);
    await summary(a);
    expect(await renewals(a)).toEqual([
      {
        policyNumber: contract.policyNumber,
        customer: 'Sara Test',
        dueDate: '2026-11-11',
        daysLeft: 20,
        step: 30,
        follower: 'Utilisateur agent.a',
        lastAction: expect.objectContaining({ status: 'TO_PREPARE', by: null }),
      },
    ]);

    // Six days later: 14 days left, the 15-day alert; then 6 days left, the 7-day one.
    ctx.clock.advance(6 * DAY);
    let agent = await again('agent.a');
    const [renewal] = (await agent.get('/api/renewals')).body.items;
    await agent.send('patch', `/api/renewals/${renewal.id}`, {
      status: 'CUSTOMER_CONTACTED',
      note: 'Rappeler lundi',
      version: renewal.version,
    });
    await summary(agent);
    ctx.clock.advance(8 * DAY);
    agent = await again('agent.a');
    await summary(agent);
    ctx.clock.advance(2 * MINUTE);
    await summary(agent);
    const steps = await renewals(agent);
    expect(steps.map((s) => [s.step, s.daysLeft])).toEqual([
      [7, 6],
      [15, 14],
      [30, 20],
    ]);
    expect(steps[1].lastAction).toMatchObject({
      status: 'CUSTOMER_CONTACTED',
      note: 'Rappeler lundi',
      by: 'Utilisateur agent.a',
    });
    // Every agent is told, not only the one who follows it.
    const b = await again('agent.b');
    await summary(b);
    const forB = (await history(b, '?kind=RENEWAL_DUE')).items;
    expect(forB.map((n) => [n.data.step, n.unread])).toEqual([
      [7, true],
      [15, true],
      [30, true],
    ]);
  });

  it('announces a balance still owed more than 15 days after the start, once', async () => {
    const { b, issued } = await setup();
    const late = await issued({ startDate: '2026-10-01', endDate: '2027-09-30' });
    // Started 10 days ago: not yet.
    await issued({ startDate: '2026-10-12', endDate: '2027-10-11' });
    await summary(b);
    ctx.clock.advance(2 * MINUTE);
    await summary(b);
    const unpaid = (await history(b, '?kind=UNPAID')).items;
    expect(unpaid).toHaveLength(1);
    expect(unpaid[0]).toMatchObject({
      link: `/contrats/${late.id}`,
      data: {
        policyNumber: late.policyNumber,
        customer: 'Sara Test',
        balance: '1234.50',
        days: 21,
        recordedBy: 'Utilisateur agent.a',
      },
    });
  });

  it('tells management of a late remittance and of low stock, not the agents', async () => {
    const { manager, a, issued } = await setup();
    const contract = await issued();
    await a.post(`/api/contracts/${contract.id}/payments`, {
      method: 'CASH',
      amount: '1234.50',
      idempotencyKey: randomUUID(),
    });
    const holder = await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'manager.a' } });
    await manager.post('/api/attestation-batches', {
      seriesId: (await series('RMA', '14 A')).id,
      firstNumber: '000000101',
      lastNumber: '000000110',
      receivedOn: '2026-10-20',
      location: 'Armoire fermée',
      holderId: holder.id,
    });
    // Ten forms: fewer than 20.
    const management = async (client) =>
      (await history(client, '?kind=MANAGEMENT')).items.map((n) => [n.kind, n.data]);
    await summary(manager);
    expect(await management(manager)).toEqual([
      ['STOCK_LOW', { series: '14 A', insurer: 'RMA', available: 10, threshold: 20 }],
    ]);

    // Collected in October, due by 15/11: late on the 16th.
    ctx.clock.advance(25 * DAY);
    const later = await signIn('manager.b', 'MANAGER');
    await summary(later);
    const alerts = await management(later);
    expect(alerts.map(([kind]) => kind).sort()).toEqual([
      'REMITTANCE_LATE',
      'STOCK_LOW',
      'STOCK_LOW',
    ]);
    expect(alerts.find(([kind]) => kind === 'REMITTANCE_LATE')[1]).toEqual({
      insurer: 'RMA',
      amount: '1234.50',
    });
    const agent = await again('agent.a');
    expect(await management(agent)).toEqual([]);
    expect((await summary(agent)).recent.some((n) => n.kind === 'STOCK_LOW')).toBe(false);
  });

  it('is for signed-in employees only, with a strict query', async () => {
    const { a } = await setup();
    expect((await ctx.client().get('/api/notifications/summary')).status).toBe(401);
    expect((await a.get('/api/notifications?kind=OTHER')).status).toBe(400);
    expect((await a.get('/api/notifications/summary?x=1')).status).toBe(400);
  });
});
