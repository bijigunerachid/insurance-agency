import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const { signIn, prepareCatalogue, contractBody, issue, confirm } = contractFixtures(ctx);
const patch = (client, path, body) => client.send('patch', path, body);

async function rmaUsage(label) {
  return ctx.prisma.insurerUsage.findFirstOrThrow({ where: { label, insurer: { code: 'RMA' } } });
}
const legal = (label) => ctx.prisma.vehicleUsage.findUniqueOrThrow({ where: { label } });

/** A manager who confirmed the catalogue, an agent, and a customer of the agent. */
async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const customer = (
    await agent.post('/api/customers', { type: 'INDIVIDUAL', firstName: 'Sara', lastName: 'Test' })
  ).body;
  const van = (overrides = {}) => ({
    ownerId: customer.id,
    registration: '99999-A-13',
    category: 'COMMERCIAL',
    make: 'TATA',
    model: 'Xenon',
    ...overrides,
  });
  return { manager, agent, customer, products, van };
}

describe('the RMA GAMA usages (owner’s photos of 28/10/2026)', () => {
  it('are listed in the platform’s order, each under the legal usage of its attestation', async () => {
    const { agent } = await setup();
    const res = await agent.get('/api/insurer-usages');
    expect(res.status).toBe(200);
    const items = res.body.items;
    expect(items).toHaveLength(42);
    expect(items.every((u) => u.insurer.code === 'RMA' && u.active)).toBe(true);
    const of = (label) => items.find((u) => u.label === label);
    expect(items[0]).toMatchObject({ group: 'LOCATION', label: 'LOCATION C.I.' });
    expect(items.at(-1)).toMatchObject({ group: 'C2', label: 'C2 (COMMERCE +3,5T)' });
    // Rental and every DIVERS usage are « usage divers » in law (model D); garages are left out.
    expect(of('LOCATION C.I.').usage).toMatchObject({ label: 'Divers', modelCode: 'D' });
    expect(of('AUTO-ECOLE TOURISME').usage.modelCode).toBe('D');
    expect(items.filter((u) => u.group === 'DIVERS').map((u) => u.usage.modelCode)).toEqual(
      Array(34).fill('D'),
    );
    expect(of('TOURISME').usage.modelCode).toBe('A');
    expect(of('C1 (COMMERCE <= 3,5T)').usage.modelCode).toBe('C');
    expect(of('CYLINDRÉE < 50 CM3 VITESSE < 60 KM/H').usage.modelCode).toBe('E');
    expect(items.some((u) => /GARAGISTE/.test(u.label))).toBe(false);
  });

  it('are written by migrations only: the application can read them, never change them', async () => {
    const row = await rmaUsage('TOURISME');
    await expect(
      ctx.prisma.insurerUsage.update({ where: { id: row.id }, data: { label: 'X' } }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.insurerUsage.create({
        data: {
          insurerId: row.insurerId,
          groupLabel: 'X',
          label: 'X',
          usageId: row.usageId,
          sortOrder: 1,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('the RMA usage of a vehicle', () => {
  it('sets the legal usage, so the attestation model stays the legal one', async () => {
    const { agent, van } = await setup();
    const c1 = await rmaUsage('C1 (COMMERCE <= 3,5T)');
    const res = await agent.post('/api/vehicles', van({ insurerUsageId: c1.id }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      usage: { label: 'Transport de marchandises' },
      insurerUsage: { id: c1.id, label: 'C1 (COMMERCE <= 3,5T)', group: 'C1' },
    });

    // Both given and not fitting: refused, on the field.
    const tourisme = await legal('Tourisme');
    const other = await agent.post(
      '/api/vehicles',
      van({ registration: '88888-A-13', insurerUsageId: c1.id, usageId: tourisme.id }),
    );
    expect(other.status).toBe(400);
    expect(other.body.error.details).toEqual([
      { path: 'insurerUsageId', rule: 'INSURER_USAGE_OTHER_USAGE' },
    ]);
    const unknown = await agent.post(
      '/api/vehicles',
      van({ registration: '77777-A-13', insurerUsageId: '00000000-0000-4000-8000-000000000000' }),
    );
    expect(unknown.body.error.details).toEqual([
      { path: 'insurerUsageId', rule: 'INSURER_USAGE_NOT_USABLE' },
    ]);
  });

  it('is changed with the vehicle, and dropped when another legal usage is chosen', async () => {
    const { agent, van } = await setup();
    const c1 = await rmaUsage('C1 (COMMERCE <= 3,5T)');
    const c2 = await rmaUsage('C2 (COMMERCE +3,5T)');
    const created = (await agent.post('/api/vehicles', van({ insurerUsageId: c1.id }))).body;

    const changed = await patch(agent, `/api/vehicles/${created.id}`, {
      insurerUsageId: c2.id,
      version: created.version,
    });
    expect(changed.status).toBe(200);
    expect(changed.body.insurerUsage.label).toBe('C2 (COMMERCE +3,5T)');
    expect(changed.body.usage.label).toBe('Transport de marchandises');

    const tourisme = await legal('Tourisme');
    const moved = await patch(agent, `/api/vehicles/${created.id}`, {
      usageId: tourisme.id,
      version: changed.body.version,
    });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ usage: { label: 'Tourisme' }, insurerUsage: null });
    const audit = await ctx.prisma.auditLog.findFirst({
      where: { action: 'vehicle.updated', entityId: created.id },
      orderBy: { id: 'desc' },
    });
    expect(audit.details.fields).toEqual(expect.arrayContaining(['usageId', 'insurerUsageId']));
  });

  it('is kept consistent by the database too', async () => {
    const { agent, van } = await setup();
    const c1 = await rmaUsage('C1 (COMMERCE <= 3,5T)');
    const created = (await agent.post('/api/vehicles', van({ insurerUsageId: c1.id }))).body;
    const tourisme = await legal('Tourisme');
    await expect(
      ctx.prisma.vehicle.update({ where: { id: created.id }, data: { usageId: tourisme.id } }),
    ).rejects.toThrow(/vehicle_insurer_usage_fits|insurer usage/);
  });

  it('stays a moped usage on an electric two-wheeler kept on Divers (white D sheet)', async () => {
    // An electric moped on RMA's white 14 D, usage « CYLINDRÉE < 50 CM3 VITESSE … ».
    const { manager, agent, van } = await setup();
    const moped = await rmaUsage('CYLINDRÉE < 50 CM3 VITESSE > 60 KM/H');
    const model = await ctx.prisma.attestationModel.findUniqueOrThrow({ where: { code: 'D' } });
    await confirm(manager, '/api/attestation-models', model);
    const divers = await legal('Divers');
    await confirm(manager, '/api/vehicle-usages', divers);
    const scooter = (overrides) =>
      van({ category: 'MOTORCYCLE', make: 'VOLTA', model: 'D90', engineCc: 3, ...overrides });
    const res = await agent.post(
      '/api/vehicles',
      scooter({ fuel: 'ELECTRIC', usageId: divers.id, insurerUsageId: moped.id }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      usage: { label: 'Divers' },
      insurerUsage: { id: moped.id },
    });
    // Chosen later, without the legal usage: Divers is kept.
    const slower = await rmaUsage('CYLINDRÉE < 50 CM3 VITESSE < 60 KM/H');
    const changed = await patch(agent, `/api/vehicles/${res.body.id}`, {
      insurerUsageId: slower.id,
      version: res.body.version,
    });
    expect(changed.body).toMatchObject({
      usage: { label: 'Divers' },
      insurerUsage: { id: slower.id },
    });

    // A petrol moped on Divers: refused, by the app and by the database.
    const petrol = await agent.post(
      '/api/vehicles',
      scooter({
        registration: '88888-A-13',
        fuel: 'PETROL',
        usageId: divers.id,
        insurerUsageId: moped.id,
      }),
    );
    expect(petrol.body.error.details).toEqual([
      { path: 'insurerUsageId', rule: 'INSURER_USAGE_OTHER_USAGE' },
    ]);
    await expect(
      ctx.prisma.vehicle.update({ where: { id: res.body.id }, data: { fuel: 'PETROL' } }),
    ).rejects.toThrow(/vehicle_insurer_usage_fits|insurer usage/);
    // Only a moped usage: a car's usage still needs its own legal usage.
    const tourisme = await rmaUsage('TOURISME');
    const car = await agent.post(
      '/api/vehicles',
      van({
        registration: '77777-A-13',
        category: 'CAR',
        fuel: 'ELECTRIC',
        usageId: divers.id,
        insurerUsageId: tourisme.id,
      }),
    );
    expect(car.body.error.details).toEqual([
      { path: 'insurerUsageId', rule: 'INSURER_USAGE_OTHER_USAGE' },
    ]);

    // Changed to petrol in the app: the moped usage no longer fits and is dropped.
    const refuelled = await patch(agent, `/api/vehicles/${res.body.id}`, {
      fuel: 'PETROL',
      version: changed.body.version,
    });
    expect(refuelled.status).toBe(200);
    expect(refuelled.body).toMatchObject({ usage: { label: 'Divers' }, insurerUsage: null });
  });

  it('shows on the contract and in the report of contracts ending', async () => {
    const { manager, agent, customer, products, van } = await setup();
    const c1 = await rmaUsage('C1 (COMMERCE <= 3,5T)');
    const vehicle = (await agent.post('/api/vehicles', van({ insurerUsageId: c1.id }))).body;
    const draft = (
      await agent.post('/api/contracts', contractBody(customer, products.RMA, [vehicle.id]))
    ).body;
    const contract = await issue(agent, draft);
    // As kept from a platform sheet (« DC »: dommages collision).
    await ctx.prisma.contract.update({ where: { id: contract.id }, data: { formula: 'DC' } });
    const detail = (await agent.get(`/api/contracts/${contract.id}`)).body;
    expect(detail.vehicles[0].insurerUsage).toEqual({ id: c1.id, label: 'C1 (COMMERCE <= 3,5T)' });

    const report = await manager.get(
      '/api/reports/contrats-echeances?from=2027-10-01&to=2027-10-31',
    );
    expect(report.body.columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(['insurerUsage', 'formula']),
    );
    expect(report.body.rows).toEqual([
      expect.objectContaining({
        policyNumber: contract.policyNumber,
        insurerUsage: 'C1 (COMMERCE <= 3,5T)',
        formula: 'DC',
      }),
    ]);
  });
});
