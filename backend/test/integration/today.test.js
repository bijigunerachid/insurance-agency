import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTodayService } from '../../src/modules/today/service.js';
import { createAuditService } from '../../src/services/audit.js';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const { signIn, prepareCatalogue, customerWithVehicles, contractBody, issue, series } =
  contractFixtures(ctx);

/** Sara Test (CIN AB123456), her car, an issued RMA contract POL-0001 with attestation 14 A n° 123456789. */
async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const { customer, car } = await customerWithVehicles(agent);
  await agent.send('patch', `/api/customers/${customer.id}`, {
    identityType: 'CIN',
    identityNumber: 'AB123456',
    version: customer.version,
  });
  const draft = (await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id])))
    .body;
  const contract = await issue(agent, draft, 'POL-0001');
  await agent.post(`/api/contracts/${contract.id}/attestations`, {
    vehicleId: car.id,
    seriesId: (await series('RMA', '14 A')).id,
    number: '123456789',
    validFrom: '2026-11-01',
    validTo: '2027-10-31',
  });
  return { manager, agent, customer, car, contract };
}
const search = (client, q) => client.get(`/api/search?q=${encodeURIComponent(q)}`);

describe('one search box', () => {
  it('finds the customer, the vehicle and the contract by name, plate, CIN, policy or attestation', async () => {
    const { agent, customer, car, contract } = await setup();

    expect((await search(agent, 'sara')).body.customers.map((c) => c.id)).toEqual([customer.id]);
    expect((await search(agent, 'ab 123456')).body.customers.map((c) => c.id)).toEqual([
      customer.id,
    ]);
    // The plate however it is typed.
    const plate = car.registration.replace(/-/g, ' ');
    expect((await search(agent, plate)).body.vehicles).toEqual([
      expect.objectContaining({ id: car.id, owner: 'Sara Test' }),
    ]);
    for (const q of ['pol 0001', 'POL-0001', '123 456 789', contract.ref]) {
      expect((await search(agent, q)).body.contracts).toEqual([
        expect.objectContaining({ id: contract.id, customer: 'Sara Test', status: 'ISSUED' }),
      ]);
    }
    // A CIN is only found when typed in full.
    expect((await search(agent, 'AB1234')).body.customers).toEqual([]);
    expect((await search(agent, 'x')).status).toBe(400);
  });

  it('only searches what the person may see', async () => {
    const { customer } = await setup();
    const service = createTodayService({
      prisma: ctx.prisma,
      audit: createAuditService(ctx.prisma),
      clock: ctx.clock,
      config: ctx.config,
    });
    const as = (permissions) => ({ user: { id: randomUUID() }, permissions: new Set(permissions) });
    expect(await service.search(as([]), 'sara')).toEqual({
      customers: [],
      vehicles: [],
      contracts: [],
    });
    const customersOnly = await service.search(as(['customers.read']), 'sara');
    expect(customersOnly.customers.map((c) => c.id)).toEqual([customer.id]);
    expect(await service.todo(as([]))).toMatchObject({ items: [] });
    expect((await search(ctx.client(), 'sara')).status).toBe(401);
  });
});

describe('the to-do list', () => {
  it('lists the scans to check, the money still owed and the late remittances', async () => {
    const { agent, contract } = await setup();
    ctx.reading = null;
    await agent.upload('/api/scans', Buffer.from('%PDF-1.7\n% scan\n'), { name: 'scan.pdf' });
    await agent.post(`/api/contracts/${contract.id}/payments`, {
      amount: '1000',
      method: 'CASH',
      idempotencyKey: randomUUID(),
    });

    const agentTodo = (await agent.get('/api/today')).body;
    expect(agentTodo.items).toEqual(
      expect.arrayContaining([
        { kind: 'SCANS', count: 1, to: '/scans' },
        { kind: 'UNPAID', count: 1, amount: '234.50', old: 0, days: 15, to: '/contrats?unpaid=1' },
      ]),
    );
    // Remittances are for management only.
    expect(agentTodo.items.some((i) => i.kind === 'REMITTANCE_LATE')).toBe(false);

    ctx.clock.advance(30 * 86_400_000); // 21/11/2026: October was due on 15/11.
    const late = await signIn('manager.b', 'MANAGER');
    const managerTodo = (await late.get('/api/today')).body;
    expect(managerTodo.items).toEqual(
      expect.arrayContaining([
        { kind: 'REMITTANCE_LATE', insurer: 'RMA', amount: '1000.00', to: '/reversements' },
        // Twenty days after the start of the cover: a balance to chase.
        { kind: 'UNPAID', count: 1, amount: '234.50', old: 1, days: 15, to: '/contrats?unpaid=1' },
      ]),
    );
    // The unpaid list behind the line.
    const unpaid = (await late.get('/api/contracts?unpaid=1')).body;
    expect(unpaid.items.map((c) => c.id)).toEqual([contract.id]);
  });
});

describe('lists that answer the daily questions', () => {
  it('shows what is left to pay on each contract, and how many insurances a client has', async () => {
    const { agent, customer, contract } = await setup();
    await agent.post(`/api/contracts/${contract.id}/payments`, {
      amount: '1000',
      method: 'CASH',
      idempotencyKey: randomUUID(),
    });
    const list = (await agent.get(`/api/contracts?customerId=${customer.id}`)).body;
    expect(list.items).toEqual([
      expect.objectContaining({ id: contract.id, premiumTotal: '1234.50', balance: '234.50' }),
    ]);
    const clients = (await agent.get('/api/customers?q=sara')).body;
    expect(clients.items).toEqual([
      expect.objectContaining({ id: customer.id, activeContracts: 1 }),
    ]);
  });
});
