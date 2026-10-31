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

const { signIn, series, prepareCatalogue, customerWithVehicles, contractBody, issue } =
  contractFixtures(ctx);

/** An issued RMA contract on the customer's car, with its 14 A attestation for the year. */
async function runningContract(overrides = {}) {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const { customer, car, noUsage } = await customerWithVehicles(agent);
  const tourisme = await ctx.prisma.vehicleUsage.findUniqueOrThrow({
    where: { label: 'Tourisme' },
  });
  const newCar = (
    await agent.post('/api/vehicles', {
      ownerId: customer.id,
      registration: '36974-A-57',
      category: 'CAR',
      make: 'Renault',
      model: 'Clio',
      usageId: tourisme.id,
    })
  ).body;
  const draft = (
    await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id], overrides))
  ).body;
  await issue(agent, draft);
  const seriesA = await series('RMA', '14 A');
  const withAttestation = await agent.post(`/api/contracts/${draft.id}/attestations`, {
    vehicleId: car.id,
    seriesId: seriesA.id,
    number: '100000001',
    validFrom: '2026-11-01',
    validTo: '2027-10-31',
  });
  expect(withAttestation.status).toBe(201);
  return {
    manager,
    agent,
    customer,
    car,
    noUsage,
    newCar,
    seriesA,
    contract: withAttestation.body,
  };
}

const newAttestation = (seriesRow, overrides = {}) => ({
  seriesId: seriesRow.id,
  number: '100000002',
  validFrom: '2027-03-01',
  validTo: '2027-10-31',
  ...overrides,
});

describe('avenants on a running contract', () => {
  it('changes the vehicle: the old one leaves and is archived with its history, the avenant is owed', async () => {
    const { agent, car, newCar, seriesA, contract } = await runningContract();
    const path = `/api/contracts/${contract.id}/amendments`;
    const res = await agent.post(path, {
      kind: 'VEHICLE_CHANGE',
      number: '2600012345',
      effectiveDate: '2027-03-01',
      amount: '512,64',
      insurerReference: 'Quittance n° 00999901202600000001',
      previousVehicleId: car.id,
      vehicleId: newCar.id,
      attestation: newAttestation(seriesA),
      version: contract.version,
    });
    expect(res.status).toBe(201);
    expect(res.body.vehicles.map((v) => v.id)).toEqual([newCar.id]);
    expect(res.body).toMatchObject({
      premiumTotal: '1234.50',
      amendmentsTotal: '512.64',
      amountDue: '1747.14',
      amendments: [
        {
          kind: 'VEHICLE_CHANGE',
          number: '2600012345',
          effectiveDate: '2027-03-01',
          amount: '512.64',
          previousVehicle: { id: car.id },
          vehicle: { id: newCar.id },
          attestation: { number: '100000002', series: '14 A' },
        },
      ],
    });
    const byNumber = (n) => res.body.attestations.find((a) => a.number === n);
    expect(byNumber('100000001').replaced).toMatchObject({
      number: '2600012345',
      effectiveDate: '2027-03-01',
      returned: null,
    });
    expect(byNumber('100000002')).toMatchObject({ vehicle: { id: newCar.id }, replaced: null });

    // The old vehicle is archived; both vehicles show the change in their history.
    const old = (await agent.get(`/api/vehicles/${car.id}`)).body;
    expect(old.archivedAt).not.toBeNull();
    expect(old.archiveReason).toBe(`Remplacé par avenant n° 2600012345 sur ${contract.ref}`);
    expect(old.amendments).toMatchObject([
      { kind: 'VEHICLE_CHANGE', replacedBy: { id: newCar.id }, contract: { ref: contract.ref } },
    ]);
    const current = (await agent.get(`/api/vehicles/${newCar.id}`)).body;
    expect(current.amendments).toMatchObject([{ replaced: { id: car.id }, replacedBy: null }]);

    // The avenant is owed and paid like the premium (rule L4 still holds).
    const payments = (await agent.get(`/api/contracts/${contract.id}/payments`)).body;
    expect(payments).toMatchObject({ amountDue: '1747.14', balance: '1747.14' });
    const tooMuch = await agent.post(`/api/contracts/${contract.id}/payments`, {
      amount: '1747.15',
      method: 'CASH',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(tooMuch.body.error.details).toEqual([{ path: 'amount', rule: 'AMOUNT_ABOVE_BALANCE' }]);

    // The same avenant twice is refused.
    const twice = await agent.post(path, {
      kind: 'VEHICLE_CHANGE',
      number: '2600012345',
      effectiveDate: '2027-03-01',
      previousVehicleId: newCar.id,
      vehicleId: car.id,
      attestation: newAttestation(seriesA, { number: '100000003' }),
      version: res.body.version,
    });
    expect(twice.body.error.code).toBe('DUPLICATE_AMENDMENT');
    expect(await ctx.auditActions()).toEqual(
      expect.arrayContaining(['contract.amended', 'vehicle.archived', 'attestation.recorded']),
    );
  });

  it('records the replaced paper attestation back at the agency', async () => {
    const { agent, car, newCar, seriesA, contract } = await runningContract();
    const amended = (
      await agent.post(`/api/contracts/${contract.id}/amendments`, {
        kind: 'VEHICLE_CHANGE',
        effectiveDate: '2027-03-01',
        previousVehicleId: car.id,
        vehicleId: newCar.id,
        attestation: newAttestation(seriesA),
        version: contract.version,
      })
    ).body;
    const old = amended.attestations.find((a) => a.number === '100000001');
    const current = amended.attestations.find((a) => a.number === '100000002');

    const back = await agent.post(`/api/attestations/${old.id}/returned`, {
      version: old.version,
    });
    expect(back.status).toBe(200);
    expect(back.body.attestations.find((a) => a.id === old.id).replaced.returned).toMatchObject({
      by: { displayName: expect.any(String) },
    });
    const again = await agent.post(`/api/attestations/${old.id}/returned`, {
      version: old.version + 1,
    });
    expect(again.body.error.code).toBe('ALREADY_RETURNED');
    const notReplaced = await agent.post(`/api/attestations/${current.id}/returned`, {
      version: current.version,
    });
    expect(notReplaced.body.error.code).toBe('NOT_REPLACED');
    // No amount on the avenant: nothing more is owed.
    expect(amended.amountDue).toBe('1234.50');
  });

  it('changes the registration: same vehicle, new plate, the old plate still finds it', async () => {
    const { agent, car, noUsage, seriesA, contract } = await runningContract();
    const path = `/api/contracts/${contract.id}/amendments`;
    const body = (overrides) => ({
      kind: 'REGISTRATION_CHANGE',
      effectiveDate: '2027-03-01',
      previousVehicleId: car.id,
      registration: '99999-B-6',
      attestation: newAttestation(seriesA),
      version: contract.version,
      ...overrides,
    });

    const same = await agent.post(path, body({ registration: car.registration }));
    expect(same.body.error.details).toEqual([{ path: 'registration', rule: 'SAME_REGISTRATION' }]);
    const taken = await agent.post(path, body({ registration: noUsage.registration }));
    expect(taken.body.error.code).toBe('DUPLICATE_REGISTRATION');
    const missing = await agent.post(path, body({ registration: null }));
    expect(missing.body.error.details).toEqual([{ path: 'registration', rule: 'REQUIRED' }]);

    const res = await agent.post(path, body());
    expect(res.status).toBe(201);
    expect(res.body.vehicles).toMatchObject([{ id: car.id, registration: '99999-B-6' }]);
    expect(res.body.amendments).toMatchObject([
      {
        kind: 'REGISTRATION_CHANGE',
        previousRegistration: car.registration,
        registration: '99999-B-6',
        previousVehicle: { id: car.id },
        vehicle: { id: car.id },
      },
    ]);
    expect(res.body.attestations.find((a) => a.number === '100000001').replaced).not.toBeNull();
    const vehicle = (await agent.get(`/api/vehicles/${car.id}`)).body;
    expect(vehicle).toMatchObject({
      registration: '99999-B-6',
      archivedAt: null,
      amendments: [{ previousRegistration: car.registration, registration: '99999-B-6' }],
    });
    const found = (await agent.get(`/api/search?q=${encodeURIComponent(car.registration)}`)).body;
    expect(found.vehicles.map((v) => v.id)).toEqual([car.id]);
  });

  it('records the avenant of a contract made before the app: its amount is all that is owed', async () => {
    const { agent, newCar, seriesA, customer } = await runningContract();
    const product = await ctx.prisma.product.findFirstOrThrow({
      where: { name: 'Produit synthétique RMA' },
    });
    // The contract started from the avenant's scan: the new vehicle only, no premium known.
    const draft = (
      await agent.post(
        '/api/contracts',
        contractBody(customer, product.id, [newCar.id], {
          premiumTotal: null,
          startDate: '2026-06-27',
          endDate: '2027-03-21',
        }),
      )
    ).body;
    const issued = await issue(agent, draft, 'POL-0002');
    expect(issued.amountDue).toBeNull();
    const res = await agent.post(`/api/contracts/${draft.id}/amendments`, {
      kind: 'VEHICLE_CHANGE',
      number: '2600012345',
      effectiveDate: '2026-06-27',
      amount: '512.64',
      vehicleId: newCar.id,
      attestation: newAttestation(seriesA, { validFrom: '2026-06-27', validTo: '2027-03-21' }),
      version: issued.version,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      premiumTotal: null,
      amountDue: '512.64',
      amendments: [{ previousVehicle: null, vehicle: { id: newCar.id } }],
    });
    const paid = await agent.post(`/api/contracts/${draft.id}/payments`, {
      amount: '512.64',
      method: 'CASH',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(paid.status).toBe(201);
    const unpaid = (await agent.get('/api/contracts?unpaid=1')).body.items.map((c) => c.id);
    expect(unpaid).not.toContain(draft.id);
  });

  it('refuses an avenant the contract or the vehicles do not allow', async () => {
    const { manager, agent, car, newCar, seriesA, contract } = await runningContract();
    const path = `/api/contracts/${contract.id}/amendments`;
    const body = (overrides) => ({
      kind: 'VEHICLE_CHANGE',
      effectiveDate: '2027-03-01',
      previousVehicleId: car.id,
      vehicleId: newCar.id,
      attestation: newAttestation(seriesA),
      version: contract.version,
      ...overrides,
    });

    const outside = await agent.post(path, body({ effectiveDate: '2027-11-15' }));
    expect(outside.body.error.details).toEqual([
      { path: 'effectiveDate', rule: 'OUTSIDE_CONTRACT' },
    ]);
    const notOnContract = await agent.post(path, body({ previousVehicleId: newCar.id }));
    expect(notOnContract.body.error.details).toEqual([
      { path: 'previousVehicleId', rule: 'VEHICLE_NOT_ON_CONTRACT' },
    ]);
    const same = await agent.post(path, body({ vehicleId: car.id }));
    expect(same.body.error.details).toEqual([{ path: 'vehicleId', rule: 'SAME_VEHICLE' }]);
    const other = await customerWithVehicles(agent, 'Karim');
    const notTheirs = await agent.post(path, body({ vehicleId: other.car.id }));
    expect(notTheirs.body.error.details).toEqual([
      { path: 'vehicleIds', rule: 'VEHICLE_NOT_OF_CUSTOMER' },
    ]);
    // The new attestation follows the usual rules (rule L16): nothing is kept when it fails.
    const goods = await agent.post(
      path,
      body({ attestation: newAttestation(await series('RMA', '14 C')) }),
    );
    expect(goods.body.error.details).toEqual([{ path: 'seriesId', rule: 'MODEL_MISMATCH' }]);
    const after = (await agent.get(`/api/contracts/${contract.id}`)).body;
    expect(after.vehicles.map((v) => v.id)).toEqual([car.id]);
    expect(after.amendments).toEqual([]);
    expect((await agent.get(`/api/vehicles/${car.id}`)).body.archivedAt).toBeNull();

    const auditor = await signIn('auditor.a', 'AUDITOR');
    expect((await auditor.post(path, body())).status).toBe(403);
    const draft = (
      await manager.post(
        '/api/contracts',
        contractBody({ id: contract.customer.id }, contract.product.id, [newCar.id]),
      )
    ).body;
    const early = await agent.post(`/api/contracts/${draft.id}/amendments`, {
      ...body({ previousVehicleId: newCar.id, vehicleId: car.id }),
      version: draft.version,
    });
    expect(early.body.error.code).toBe('CONTRACT_NOT_ISSUED');
  });

  it('keeps avenants append-only and their fields consistent in the database', async () => {
    const { agent, car, newCar, seriesA, contract } = await runningContract();
    await agent.post(`/api/contracts/${contract.id}/amendments`, {
      kind: 'VEHICLE_CHANGE',
      effectiveDate: '2027-03-01',
      previousVehicleId: car.id,
      vehicleId: newCar.id,
      attestation: newAttestation(seriesA),
      version: contract.version,
    });
    await expect(runtime.query('UPDATE "amendment" SET "amount" = 1')).rejects.toThrow(
      /permission denied/,
    );
    await expect(runtime.query('DELETE FROM "amendment"')).rejects.toThrow(/permission denied/);
    await expect(ctx.owner.query('DELETE FROM "amendment"')).rejects.toThrow(/append-only/);
    await expect(
      runtime.query(
        `INSERT INTO "amendment" ("contractId", "kind", "effectiveDate", "previousVehicleId",
           "vehicleId", "attestationId", "createdById")
         SELECT "contractId", 'VEHICLE_CHANGE', '2027-03-02', "vehicleId", "vehicleId", "id",
           "createdById" FROM "attestation" WHERE "number" = '100000001'`,
      ),
    ).rejects.toThrow(/amendment_kind_fields/);
    await expect(
      runtime.query(
        `UPDATE "attestation" SET "returnedAt" = now(), "returnedById" = "createdById"
         WHERE "number" = '100000002'`,
      ),
    ).rejects.toThrow(/attestation_returned_when_replaced/);
  });
});
