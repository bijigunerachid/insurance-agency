import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addMonths } from '../../src/modules/contracts/service.js';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const { signIn, patch, series, confirm, prepareCatalogue, contractBody, issue } =
  contractFixtures(ctx);

/**
 * Today is 22/10/2026 (test clock). The agency sells CAT border insurance (owner, 02/11/2026):
 * model F, its usage, the 91 F series and the product confirmed by a manager; a visitor with a
 * passport and a car registered abroad.
 */
async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  await confirm(
    manager,
    '/api/attestation-models',
    await ctx.prisma.attestationModel.findUniqueOrThrow({ where: { code: 'F' } }),
  );
  const usage = await ctx.prisma.vehicleUsage.findUniqueOrThrow({
    where: { label: 'Assurance aux frontières' },
  });
  await confirm(manager, '/api/vehicle-usages', usage);
  await confirm(manager, '/api/attestation-series', await series('CAT', '91 F'));
  const border = await ctx.prisma.product.findFirstOrThrow({
    where: { line: 'BORDER', insurer: { code: 'CAT' } },
  });
  await confirm(manager, '/api/products', border);

  const visitor = (
    await agent.post('/api/customers', {
      type: 'INDIVIDUAL',
      firstName: 'Lena',
      lastName: 'Essai',
      identityType: 'PASSPORT',
      identityNumber: 'X1234567',
    })
  ).body;
  const car = (
    await agent.post('/api/vehicles', {
      ownerId: visitor.id,
      registration: 'AB-123-CD',
      category: 'CAR',
      make: 'Renault',
      model: 'Clio',
      usageId: usage.id,
    })
  ).body;
  expect(car.registration).toBeTruthy();
  const borderBody = (overrides = {}) =>
    contractBody(visitor, border.id, [car.id], {
      startDate: '2026-10-22',
      endDate: '2026-11-01',
      premiumTotal: '350',
      tacitRenewal: false,
      noticeDays: null,
      ...overrides,
    });
  return { manager, agent, products, border, visitor, car, borderBody };
}

describe('CAT border insurance (rule C5)', () => {
  it('lasts 6 months at most and never renews by itself', async () => {
    const { agent, products, visitor, car, borderBody } = await setup();

    // 5 days, 10 days, 1, 3 and 6 months, counted like the platform: the same day later.
    expect(addMonths('2026-10-22', 6)).toBe('2027-04-22');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
    const six = await agent.post(
      '/api/contracts',
      borderBody({ startDate: '2026-10-22', endDate: '2027-04-22' }),
    );
    expect(six.status).toBe(201);
    expect(six.body).toMatchObject({ tacitRenewal: false, product: { line: 'BORDER' } });

    const tooLong = await agent.post('/api/contracts', borderBody({ endDate: '2027-04-23' }));
    expect(tooLong.body.error.details).toEqual([{ path: 'endDate', rule: 'BORDER_TOO_LONG' }]);
    const renewing = await agent.post('/api/contracts', borderBody({ tacitRenewal: true }));
    expect(renewing.body.error.details).toEqual([
      { path: 'tacitRenewal', rule: 'BORDER_NO_TACIT_RENEWAL' },
    ]);

    // A draft keeps the same limits when it is changed.
    const draft = six.body;
    const longer = await patch(agent, `/api/contracts/${draft.id}`, {
      endDate: '2027-05-01',
      version: draft.version,
    });
    expect(longer.body.error.details).toEqual([{ path: 'endDate', rule: 'BORDER_TOO_LONG' }]);
    const tacit = await patch(agent, `/api/contracts/${draft.id}`, {
      tacitRenewal: true,
      version: draft.version,
    });
    expect(tacit.body.error.details).toEqual([
      { path: 'tacitRenewal', rule: 'BORDER_NO_TACIT_RENEWAL' },
    ]);
    // An ordinary year-long contract with tacit renewal cannot become border insurance as is.
    const yearly = (
      await agent.post('/api/contracts', contractBody(visitor, products.CAT, [car.id]))
    ).body;
    const switched = await patch(agent, `/api/contracts/${yearly.id}`, {
      productId: draft.product.id,
      version: yearly.version,
    });
    expect(switched.body.error.details).toEqual([{ path: 'endDate', rule: 'BORDER_TOO_LONG' }]);
  });

  it('records its 91 F attestation on the car registered abroad and opens no renewal', async () => {
    const { agent, visitor, car, products, borderBody } = await setup();
    const contract = await issue(
      agent,
      (await agent.post('/api/contracts', borderBody())).body,
      'FRT-0001',
    );
    const recorded = await agent.post(`/api/contracts/${contract.id}/attestations`, {
      vehicleId: car.id,
      seriesId: (await series('CAT', '91 F')).id,
      number: '214 000 001',
      validFrom: '2026-10-22',
      validTo: '2026-11-01',
    });
    expect(recorded.status).toBe(201);
    expect(recorded.body.attestations[0]).toMatchObject({ series: { code: '91 F' } });

    // A year-long CAT contract ending within 30 days is followed; the border one never is.
    const yearly = await issue(
      agent,
      (
        await agent.post(
          '/api/contracts',
          contractBody(visitor, products.CAT, [car.id], {
            startDate: '2025-11-20',
            endDate: '2026-11-15',
          }),
        )
      ).body,
      'POL-0002',
    );
    const renewals = (await agent.get('/api/renewals')).body;
    expect(renewals.items.map((r) => r.contract.id)).toEqual([yearly.id]);
    expect(await ctx.prisma.renewal.count({ where: { contractId: contract.id } })).toBe(0);
  });

  it('records the agency’s answer in the rules register', async () => {
    const { agent } = await setup();
    const rules = (await agent.get('/api/rules')).body.items;
    const c5 = rules.find((r) => r.code === 'C5');
    expect(c5).toMatchObject({ status: 'DOCUMENT' });
    expect(c5.statement).toMatch(/L’agence la vend, rarement, sur la plateforme CAT/);
    expect(rules.find((r) => r.code === 'C11').statement).toMatch(
      /91 F \(assurance aux frontières\)/,
    );
  });
});
