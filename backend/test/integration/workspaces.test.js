import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const { signIn, insurer, series, prepareCatalogue, customerWithVehicles, contractBody, issue } =
  contractFixtures(ctx);

/**
 * Today is 22/10/2026 (test clock). One RMA and one CAT contract, both issued, both ending on
 * 15/11/2026 (in the renewal window), each partly paid; one batch of blank forms per insurer.
 */
async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const { customer, car } = await customerWithVehicles(agent);
  const contracts = {};
  for (const [code, policy] of [
    ['RMA', 'POL-RMA'],
    ['CAT', 'POL-CAT'],
  ]) {
    const draft = (
      await agent.post(
        '/api/contracts',
        contractBody(customer, products[code], [car.id], {
          startDate: '2025-11-20',
          endDate: '2026-11-15',
        }),
      )
    ).body;
    contracts[code] = await issue(agent, draft, policy);
    const paid = await agent.post(`/api/contracts/${contracts[code].id}/payments`, {
      amount: code === 'RMA' ? '1000' : '200',
      method: 'CASH',
      idempotencyKey: randomUUID(),
    });
    expect(paid.status).toBe(201);
  }
  const holderId = (await ctx.prisma.user.findUniqueOrThrow({ where: { username: 'manager.a' } }))
    .id;
  for (const [code, seriesCode, first, last] of [
    ['RMA', '14 A', '000000101', '000000103'],
    ['CAT', '91 P', '000000201', '000000202'],
  ]) {
    const received = await manager.post('/api/attestation-batches', {
      seriesId: (await series(code, seriesCode)).id,
      firstNumber: first,
      lastNumber: last,
      receivedOn: '2026-10-20',
      location: 'Armoire synthétique',
      holderId,
    });
    expect(received.status).toBe(201);
  }
  return {
    manager,
    agent,
    contracts,
    rma: (await insurer('RMA')).id,
    cat: (await insurer('CAT')).id,
  };
}

describe('workspaces after sign-in', () => {
  it('offers one card per active insurer, without branding until it is set', async () => {
    const agent = await signIn('agent.a', 'AGENT');
    const res = await agent.get('/api/workspaces');
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      {
        id: (await insurer('CAT')).id,
        code: 'CAT',
        name: 'CAT Assurance & Réassurance',
        title: 'CAT Assurance & Réassurance',
        tagline: null,
        colour: null,
        photoCredit: null,
        logo: false,
        photo: false,
      },
      expect.objectContaining({ code: 'RMA', logo: false, photo: false }),
    ]);
    expect((await agent.get('/api/workspaces/RMA/logo')).status).toBe(404);

    // A deactivated insurer has no card.
    await ctx.prisma.insurer.update({ where: { code: 'CAT' }, data: { active: false } });
    expect((await agent.get('/api/workspaces')).body.items.map((i) => i.code)).toEqual(['RMA']);
  });

  it('is for signed-in users only', async () => {
    expect((await ctx.client().get('/api/workspaces')).status).toBe(401);
    expect((await ctx.client().get('/api/workspaces/RMA/logo')).status).toBe(401);
  });
});

describe('the lists of one workspace', () => {
  it('show one insurer only, and both without a workspace', async () => {
    const { agent, manager, contracts, rma, cat } = await setup();
    const refs = (res) => res.body.items.map((item) => item.contract.ref);

    // Payments of the day.
    const day = 'from=2026-10-22&to=2026-10-22';
    expect((await agent.get(`/api/payments?${day}`)).body.total).toBe(2);
    const catPayments = (await agent.get(`/api/payments?${day}&insurerId=${cat}`)).body;
    expect(catPayments.items.map((p) => p.contract.ref)).toEqual([contracts.CAT.ref]);
    expect(catPayments.totals).toMatchObject({ amount: '200.00' });

    // Renewals and their summary on the home page.
    expect((await agent.get('/api/renewals')).body.total).toBe(2);
    expect(refs(await agent.get(`/api/renewals?insurerId=${rma}`))).toEqual([contracts.RMA.ref]);
    const summary = (await agent.get(`/api/renewals/summary?insurerId=${cat}`)).body;
    expect(summary).toMatchObject({ mine: 1, allOpen: 1 });
    expect(summary.next.map((r) => r.contract.ref)).toEqual([contracts.CAT.ref]);

    // The to-do list: money still owed on that insurer's contracts only.
    const unpaid = (todo) => todo.items.find((item) => item.kind === 'UNPAID');
    expect(unpaid((await agent.get('/api/today')).body)).toMatchObject({ count: 2 });
    expect(unpaid((await agent.get(`/api/today?insurerId=${rma}`)).body)).toMatchObject({
      count: 1,
      amount: '234.50',
    });
    expect(unpaid((await agent.get(`/api/today?insurerId=${cat}`)).body)).toMatchObject({
      count: 1,
      amount: '1034.50',
    });
    const renewalsLine = (todo) => todo.items.find((item) => item.kind === 'RENEWALS');
    expect(renewalsLine((await agent.get(`/api/today?insurerId=${rma}`)).body)).toMatchObject({
      count: 1,
    });

    // Blank forms of that insurer's series.
    const forms = (await manager.get(`/api/attestation-forms?insurerId=${cat}`)).body;
    expect(forms.items.map((f) => f.number)).toEqual(['000000201', '000000202']);
    expect((await manager.get('/api/attestation-forms')).body.total).toBe(5);
  });

  it('refuses an insurer that is not an id', async () => {
    const agent = await signIn('agent.a', 'AGENT');
    for (const path of [
      '/api/today',
      '/api/payments',
      '/api/renewals',
      '/api/renewals/summary',
      '/api/attestation-forms',
    ]) {
      expect((await agent.get(`${path}?insurerId=RMA`)).status, path).toBe(400);
    }
  });
});

describe('the clients and vehicles of one workspace', () => {
  /**
   * Amina has an RMA draft, Badr a CAT draft, Chaimae one of each, Dahbia none. Each also has a
   * vehicle that no contract covers.
   */
  async function clients() {
    const manager = await signIn('manager.a', 'MANAGER');
    const products = await prepareCatalogue(manager);
    const agent = await signIn('agent.a', 'AGENT');
    const people = {};
    for (const name of ['Amina', 'Badr', 'Chaimae', 'Dahbia']) {
      people[name] = await customerWithVehicles(agent, name);
    }
    const draft = async (name, code, overrides) => {
      const { customer, car } = people[name];
      const res = await agent.post(
        '/api/contracts',
        contractBody(customer, products[code], [car.id], overrides),
      );
      expect(res.status).toBe(201);
    };
    await draft('Amina', 'RMA');
    await draft('Badr', 'CAT');
    await draft('Chaimae', 'RMA');
    await draft('Chaimae', 'CAT', { startDate: '2027-11-01', endDate: '2028-10-31' });
    return {
      agent,
      people,
      rma: (await insurer('RMA')).id,
      cat: (await insurer('CAT')).id,
    };
  }
  const names = (res) => res.body.items.map((item) => item.displayName).sort();

  it('lists the clients with a contract there, those with both, and those with none', async () => {
    const { agent, rma, cat } = await clients();
    expect(names(await agent.get(`/api/customers?insurerId=${rma}`))).toEqual([
      'Amina Test',
      'Chaimae Test',
      'Dahbia Test',
    ]);
    expect(names(await agent.get(`/api/customers?insurerId=${cat}`))).toEqual([
      'Badr Test',
      'Chaimae Test',
      'Dahbia Test',
    ]);
    const all = (await agent.get('/api/customers')).body.items;
    expect(all).toHaveLength(4);
    // « Sans contrat »: no contract at all, whatever its status.
    expect(Object.fromEntries(all.map((c) => [c.displayName, c.hasContract]))).toEqual({
      'Amina Test': true,
      'Badr Test': true,
      'Chaimae Test': true,
      'Dahbia Test': false,
    });
    // With a search: both conditions hold.
    expect(names(await agent.get(`/api/customers?q=badr&insurerId=${rma}`))).toEqual([]);
    expect((await agent.get('/api/customers?insurerId=RMA')).status).toBe(400);
  });

  it('lists the vehicles the same way, and the search box too', async () => {
    const { agent, people, rma, cat } = await clients();
    const ids = (res) => res.body.items.map((item) => item.id);
    const rmaVehicles = ids(await agent.get(`/api/vehicles?insurerId=${rma}`));
    expect(rmaVehicles).toEqual(
      expect.arrayContaining([
        people.Amina.car.id,
        people.Chaimae.car.id,
        people.Dahbia.car.id,
        people.Badr.noUsage.id,
      ]),
    );
    expect(rmaVehicles).not.toContain(people.Badr.car.id);
    expect(ids(await agent.get(`/api/vehicles?insurerId=${cat}`))).not.toContain(
      people.Amina.car.id,
    );

    const search = async (q, insurerId) =>
      (await agent.get(`/api/search?q=${q}${insurerId ? `&insurerId=${insurerId}` : ''}`)).body;
    expect((await search('test')).customers).toHaveLength(4);
    expect((await search('test', cat)).customers.map((c) => c.displayName).sort()).toEqual([
      'Badr Test',
      'Chaimae Test',
      'Dahbia Test',
    ]);
    const plate = people.Amina.car.registration.replace(/-/g, '');
    expect((await search(plate, rma)).vehicles.map((v) => v.id)).toEqual([people.Amina.car.id]);
    expect((await search(plate, cat)).vehicles).toEqual([]);
    // Contracts by reference: the CAT one only, in CAT's workspace.
    const contracts = await search('CTR', cat);
    expect(contracts.contracts.map((c) => c.insurer)).toEqual(['CAT', 'CAT']);
    expect((await search('CTR')).contracts).toHaveLength(4);
    expect((await agent.get('/api/search?q=test&insurerId=RMA')).status).toBe(400);
  });
});
