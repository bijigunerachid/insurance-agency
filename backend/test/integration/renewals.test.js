import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuditService } from '../../src/services/audit.js';
import { addDays, createRenewalsService } from '../../src/modules/renewals/service.js';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
const runtime = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

beforeEach(() => ctx.reset());
afterAll(async () => {
  await runtime.end();
  await ctx.close();
});

const { signIn, patch, prepareCatalogue, customerWithVehicles, contractBody, issue } =
  contractFixtures(ctx);

const userId = async (username) =>
  (await ctx.prisma.user.findUniqueOrThrow({ where: { username } })).id;

/**
 * Today is 22/10/2026 (test clock). One contract ends on 15/11/2026 (24 days: listed), one
 * on 31/10/2027 (not yet), one is still a draft (never listed).
 */
async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const { customer, car } = await customerWithVehicles(agent);
  const create = async (overrides) =>
    (await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id], overrides)))
      .body;
  const ending = await issue(
    agent,
    await create({ startDate: '2025-11-20', endDate: '2026-11-15' }),
    'POL-1',
  );
  await issue(agent, await create({}), 'POL-2');
  await create({ startDate: '2025-11-20', endDate: '2026-11-10' });
  return { manager, agent, products, customer, car, ending };
}

describe('renewals', () => {
  it('lists an issued contract 30 days before its end, followed by its creator', async () => {
    const { agent, ending } = await setup();

    const list = await agent.get('/api/renewals');
    expect(list.body.total).toBe(1);
    expect(list.body.items[0]).toMatchObject({
      status: 'TO_PREPARE',
      open: true,
      dueDate: '2026-11-15',
      daysLeft: 24,
      // Rule L11: tacit renewal with 30 days' notice.
      noticeDeadline: '2026-10-16',
      assignedUser: { displayName: 'Utilisateur agent.a' },
      contract: { id: ending.id, policyNumber: 'POL-1', customer: { displayName: 'Sara Test' } },
    });
    // Reading again opens nothing twice.
    expect((await agent.get('/api/renewals')).body.total).toBe(1);
    expect(await ctx.prisma.renewalEvent.count()).toBe(1);

    const summary = (await agent.get('/api/renewals/summary')).body;
    expect(summary).toMatchObject({ windowDays: 30, mine: 1, mineOverdue: 0, allOpen: 1 });
    expect(summary.next.map((r) => r.contract.ref)).toEqual([ending.ref]);
  });

  it('gives the customer phone, to call, only to an employee allowed to read customers', async () => {
    const { agent, customer } = await setup();
    const phoned = await patch(agent, `/api/customers/${customer.id}`, {
      phone: '0612345678',
      version: customer.version,
    });
    expect(phoned.status).toBe(200);
    const list = (await agent.get('/api/renewals')).body;
    expect(list.items[0].contract.customer).toMatchObject({ phone: '+212612345678' });
    const summary = (await agent.get('/api/renewals/summary')).body;
    expect(summary.next[0].contract.customer).toMatchObject({ phone: '+212612345678' });

    const service = createRenewalsService({
      prisma: ctx.prisma,
      audit: createAuditService(ctx.prisma),
      clock: ctx.clock,
      config: ctx.config,
    });
    const withoutCustomers = await service.list(
      { user: { id: randomUUID() }, permissions: new Set(['renewals.read']) },
      { status: 'open', page: 1, pageSize: 25 },
    );
    expect(withoutCustomers.items).toHaveLength(1);
    expect(withoutCustomers.items[0].contract.customer).not.toHaveProperty('phone');
    const summaryWithout = await service.summary({
      user: {
        id: (await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'agent.a' } })).id,
      },
      permissions: new Set(['renewals.read']),
    });
    expect(summaryWithout.next).toHaveLength(1);
    expect(summaryWithout.next[0].contract.customer).not.toHaveProperty('phone');
  });

  it('records the follow-up; "not renewed" needs a reason and closes the renewal', async () => {
    const { agent } = await setup();
    const [renewal] = (await agent.get('/api/renewals')).body.items;

    const contacted = await patch(agent, `/api/renewals/${renewal.id}`, {
      status: 'CUSTOMER_CONTACTED',
      note: 'Appelé, attend son attestation de travail',
      version: 1,
    });
    expect(contacted.body.status).toBe('CUSTOMER_CONTACTED');
    const noReason = await patch(agent, `/api/renewals/${renewal.id}`, {
      status: 'NOT_RENEWED',
      version: 2,
    });
    expect(noReason.body.error.details).toEqual([{ path: 'outcomeReason', rule: 'REQUIRED' }]);
    const refused = await patch(agent, `/api/renewals/${renewal.id}`, {
      status: 'NOT_RENEWED',
      outcomeReason: 'Véhicule vendu',
      version: 2,
    });
    expect(refused.body).toMatchObject({
      status: 'NOT_RENEWED',
      open: false,
      outcomeReason: 'Véhicule vendu',
    });
    expect(refused.body.events.map((e) => [e.from, e.to, e.note])).toEqual([
      ['CUSTOMER_CONTACTED', 'NOT_RENEWED', 'Véhicule vendu'],
      ['TO_PREPARE', 'CUSTOMER_CONTACTED', 'Appelé, attend son attestation de travail'],
      [null, 'TO_PREPARE', null],
    ]);
    const again = await patch(agent, `/api/renewals/${renewal.id}`, { note: 'x', version: 3 });
    expect(again.body.error.code).toBe('RENEWAL_CLOSED');
    expect((await agent.get('/api/renewals')).body.total).toBe(0);
    expect((await agent.get('/api/renewals?status=NOT_RENEWED')).body.total).toBe(1);
  });

  it('lets only managers and the administrator give a renewal to another employee', async () => {
    const { manager, agent } = await setup();
    await signIn('agent.b', 'AGENT');
    const [renewal] = (await agent.get('/api/renewals')).body.items;
    const body = { assignedUserId: await userId('agent.b'), version: 1 };

    expect((await agent.post(`/api/renewals/${renewal.id}/assign`, body)).status).toBe(403);
    const moved = await manager.post(`/api/renewals/${renewal.id}/assign`, body);
    expect(moved.body.assignedUser.displayName).toBe('Utilisateur agent.b');
    expect(moved.body.events[0]).toMatchObject({
      fromAssignee: { displayName: 'Utilisateur agent.a' },
      toAssignee: { displayName: 'Utilisateur agent.b' },
    });
    expect((await agent.get('/api/renewals?mine=true')).body.total).toBe(0);
  });

  it('prepares the next contract as a draft linked to the old one', async () => {
    const { agent, ending, car } = await setup();
    const [renewal] = (await agent.get('/api/renewals')).body.items;

    const res = await agent.post(`/api/renewals/${renewal.id}/renew`, { version: 1 });
    expect(res.status).toBe(201);
    expect(res.body.renewal).toMatchObject({
      status: 'RENEWED',
      renewedContract: { id: res.body.contractId, status: 'DRAFT' },
    });
    const next = (await agent.get(`/api/contracts/${res.body.contractId}`)).body;
    expect(next).toMatchObject({
      status: 'DRAFT',
      // Same length of cover (360 days), starting the day after.
      startDate: '2026-11-16',
      endDate: addDays('2026-11-16', 360),
      tacitRenewal: true,
      noticeDays: 30,
      policyNumber: null,
      premiumTotal: null,
      vehicles: [expect.objectContaining({ id: car.id })],
      previousContract: { id: ending.id, ref: ending.ref },
    });
    const old = (await agent.get(`/api/contracts/${ending.id}`)).body;
    expect(old.nextContract).toEqual({ id: next.id, ref: next.ref });
    expect(await ctx.auditActions()).toContain('renewal.renewed');

    const twice = await agent.post(`/api/renewals/${renewal.id}/renew`, { version: 2 });
    expect(twice.body.error.code).toBe('RENEWAL_CLOSED');
    // The renewed contract is not listed again.
    expect((await agent.get('/api/renewals')).body.total).toBe(0);
  });

  it('counts overdue renewals once their date has passed', async () => {
    await setup();
    ctx.clock.advance(30 * 24 * 3600 * 1000);
    const later = await signIn('agent.c', 'AGENT');
    const [renewal] = (await later.get('/api/renewals')).body.items;
    expect(renewal).toMatchObject({ daysLeft: -6, open: true });
    const summary = (await (await signIn('agent.d', 'AGENT')).get('/api/renewals/summary')).body;
    expect(summary).toMatchObject({ mine: 0, allOpen: 1 });
    // agent.a created the contract: the renewal is theirs, and overdue.
    expect(
      await ctx.prisma.renewal.count({
        where: { assignedUserId: await userId('agent.a'), dueDate: { lt: new Date('2026-11-21') } },
      }),
    ).toBe(1);
  });
});

describe('renewal database protections', () => {
  it('keeps the follow-up append-only and a renewed renewal names its contract', async () => {
    const { agent } = await setup();
    const [renewal] = (await agent.get('/api/renewals')).body.items;

    for (const table of ['renewal', 'renewal_event']) {
      await expect(runtime.query(`DELETE FROM "${table}"`)).rejects.toThrow(/permission denied/);
    }
    await expect(runtime.query('UPDATE "renewal_event" SET "note" = \'x\'')).rejects.toThrow(
      /permission denied/,
    );
    await expect(ctx.owner.query('DELETE FROM "renewal_event"')).rejects.toThrow(/append-only/);
    await expect(
      runtime.query(`UPDATE "renewal" SET "status" = 'RENEWED' WHERE "id" = $1`, [renewal.id]),
    ).rejects.toThrow(/renewal_renewed_contract/);
    await expect(
      runtime.query(`UPDATE "renewal" SET "status" = 'NOT_RENEWED' WHERE "id" = $1`, [renewal.id]),
    ).rejects.toThrow(/renewal_not_renewed_reason/);
  });
});
