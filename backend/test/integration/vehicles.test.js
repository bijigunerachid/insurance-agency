import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateTotpSecret, timeStep, totpCode } from '../../src/modules/auth/totp.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
const runtime = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

beforeEach(() => ctx.reset());
afterAll(async () => {
  await runtime.end();
  await ctx.close();
});

async function signIn(username, role) {
  const secret = ['ADMIN', 'MANAGER'].includes(role) ? generateTotpSecret() : null;
  await ctx.createUser({ username, role, totpSecret: secret });
  const client = ctx.client();
  await client.login(username);
  if (secret) {
    await client.post('/api/auth/totp/verify', {
      code: totpCode(secret, timeStep(ctx.clock.now())),
    });
  }
  return client;
}

async function customer(client, overrides = {}) {
  const res = await client.post('/api/customers', {
    type: 'BUSINESS',
    legalName: `Transports ${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  });
  return res.body;
}

const car = (ownerId, overrides = {}) => ({
  ownerId,
  registration: '12345-B-6',
  category: 'CAR',
  make: 'Dacia',
  model: 'Logan',
  ...overrides,
});

describe('registering vehicles', () => {
  it('creates a car, tidies the plate and the chassis number, and audits it', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client);
    const res = await client.post(
      '/api/vehicles',
      car(owner.id, {
        registration: ' 12345 | b | 6 ',
        vin: 'vf1-ab000 123456789',
        firstRegistrationDate: '2019-05-14',
        fuel: 'DIESEL',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      registration: '12345 - B - 6',
      vin: 'VF1AB000123456789',
      firstRegistrationDate: '2019-05-14',
      owner: { id: owner.id, ref: owner.ref },
    });
    const [event] = await ctx.prisma.auditLog.findMany({ where: { action: 'vehicle.created' } });
    expect(event.details).toEqual({ category: 'CAR', ownerRef: owner.ref });
  });

  it('records a vehicle without its model, as the RMA platform sheet prints only the make', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client);
    const renault = car(owner.id, { make: 'RENAULT', model: undefined });
    const res = await client.post('/api/vehicles', renault);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ make: 'RENAULT', model: null });
    // Added later, then emptied again: a blank model is no model.
    const named = await client.send('patch', `/api/vehicles/${res.body.id}`, {
      version: res.body.version,
      model: 'Clio',
    });
    expect(named.body.model).toBe('Clio');
    const blank = await client.send('patch', `/api/vehicles/${res.body.id}`, {
      version: named.body.version,
      model: '  ',
    });
    expect(blank.body.model).toBeNull();
    // The database refuses a blank model.
    await expect(
      ctx.prisma.vehicle.update({ where: { id: res.body.id }, data: { model: ' ' } }),
    ).rejects.toThrow(/vehicle_model_not_blank/);
  });

  it('accepts a plate written with an Arabic letter', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client);
    const res = await client.post('/api/vehicles', car(owner.id, { registration: '12345-ب-6' }));
    expect(res.status).toBe(201);
    expect(res.body.registration).toBe('12345-ب-6');
  });

  it('applies the legal requirements per category (rule L14)', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client);
    const taxi = await client.post('/api/vehicles', car(owner.id, { category: 'TAXI' }));
    expect(taxi.status).toBe(400);
    expect(taxi.body.error.details).toContainEqual({ path: 'seats', rule: 'REQUIRED' });

    const moto = await client.post('/api/vehicles', car(owner.id, { category: 'MOTORCYCLE' }));
    expect(moto.body.error.details).toContainEqual({ path: 'fiscalPowerCv', rule: 'REQUIRED' });
    expect(moto.body.error.details).toContainEqual({ path: 'engineCc', rule: 'REQUIRED' });
    // The fiscal power or the cylindrée is enough: a moped's RMA sheet prints only the cylindrée.
    const moped = await client.post(
      '/api/vehicles',
      car(owner.id, { category: 'MOTORCYCLE', registration: 'CYCLO-49', engineCc: '49' }),
    );
    expect(moped.status).toBe(201);
    expect(moped.body).toMatchObject({ engineCc: 49, fiscalPowerCv: null });
    // Removing it later is refused too.
    const cleared = await client.send('patch', `/api/vehicles/${moped.body.id}`, {
      version: moped.body.version,
      engineCc: null,
    });
    expect(cleared.status).toBe(400);
    expect(cleared.body.error.details).toContainEqual({ path: 'engineCc', rule: 'REQUIRED' });
    // The database holds the same rule.
    await expect(
      ctx.prisma.vehicle.update({
        where: { id: moped.body.id },
        data: { engineCc: null, fiscalPowerCv: null },
      }),
    ).rejects.toThrow(/vehicle_category_required/);

    const okTaxi = await client.post(
      '/api/vehicles',
      car(owner.id, { category: 'TAXI', seats: '6', taxiType: 'GRAND', fuel: 'DIESEL' }),
    );
    expect(okTaxi.status).toBe(201);
    expect(okTaxi.body.seats).toBe(6);
  });

  it('refuses fields that do not fit, impossible dates and unknown fields', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client);
    const cases = [
      [{ taxiType: 'PETIT' }, 'taxiType', 'NOT_FOR_CATEGORY'],
      [{ firstRegistrationDate: '2999-01-01' }, 'firstRegistrationDate', 'INVALID_DATE'],
      [{ registration: '1-' }, 'registration', 'INVALID_REGISTRATION'],
      [{ vin: '?!' }, 'vin', 'INVALID_VIN'],
    ];
    for (const [change, path, rule] of cases) {
      const res = await client.post('/api/vehicles', car(owner.id, change));
      expect(res.status, JSON.stringify(change)).toBe(400);
      expect(res.body.error.details).toContainEqual({ path, rule });
    }
    for (const extra of [
      { registrationKey: 'X' },
      { createdById: crypto.randomUUID() },
      { archivedAt: null },
    ]) {
      expect((await client.post('/api/vehicles', car(owner.id, extra))).status).toBe(400);
    }
  });

  it('refuses the same plate written differently, and the same chassis number', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client);
    const other = await customer(client);
    await client.post('/api/vehicles', car(owner.id, { vin: 'VF1AB000123456789' }));

    const plate = await client.post('/api/vehicles', car(other.id, { registration: '12345 b 6' }));
    expect(plate.status).toBe(409);
    expect(plate.body.error.code).toBe('DUPLICATE_REGISTRATION');
    expect(plate.body.error.details.candidates[0].owner.id).toBe(owner.id);

    const vin = await client.post(
      '/api/vehicles',
      car(other.id, { registration: '99999-A-1', vin: 'vf1ab000123456789' }),
    );
    expect(vin.body.error.code).toBe('DUPLICATE_VIN');
  });

  it('refuses a vehicle for an archived or unknown customer', async () => {
    const agent = await signIn('agent.a', 'AGENT');
    const manager = await signIn('manager.m', 'MANAGER');
    const owner = await customer(agent);
    await manager.post(`/api/customers/${owner.id}/archive`, {
      reason: 'Client parti',
      version: 1,
    });

    expect((await agent.post('/api/vehicles', car(owner.id))).body.error.code).toBe(
      'OWNER_ARCHIVED',
    );
    expect((await agent.post('/api/vehicles', car(crypto.randomUUID()))).status).toBe(404);
  });
});

describe('fleets', () => {
  it('groups a customer’s vehicles and counts active ones', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client);
    const fleet = (
      await client.post('/api/fleets', { customerId: owner.id, name: 'Taxis Casablanca' })
    ).body;
    expect(
      (await client.post('/api/fleets', { customerId: owner.id, name: 'Taxis Casablanca' })).body
        .error.code,
    ).toBe('DUPLICATE_FLEET');

    await client.post('/api/vehicles', car(owner.id, { fleetId: fleet.id }));
    await client.post(
      '/api/vehicles',
      car(owner.id, { registration: '22222-A-6', fleetId: fleet.id }),
    );
    const list = await client.get(`/api/fleets?customerId=${owner.id}`);
    expect(list.body.items).toEqual([
      expect.objectContaining({ name: 'Taxis Casablanca', vehicleCount: 2 }),
    ]);
    expect((await client.get(`/api/vehicles?fleetId=${fleet.id}`)).body.total).toBe(2);
  });

  it('never puts a vehicle in another customer’s fleet, even by editing', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client);
    const other = await customer(client);
    const otherFleet = (
      await client.post('/api/fleets', { customerId: other.id, name: 'Flotte B' })
    ).body;

    const res = await client.post('/api/vehicles', car(owner.id, { fleetId: otherFleet.id }));
    expect(res.body.error.code).toBe('INVALID_FLEET');

    const vehicle = (await client.post('/api/vehicles', car(owner.id))).body;
    const edit = await client.send('patch', `/api/vehicles/${vehicle.id}`, {
      fleetId: otherFleet.id,
      version: vehicle.version,
    });
    expect(edit.body.error.code).toBe('INVALID_FLEET');
  });

  it('is enforced by the database too (composite foreign key)', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client);
    const other = await customer(client);
    const otherFleet = (
      await client.post('/api/fleets', { customerId: other.id, name: 'Flotte B' })
    ).body;
    const vehicle = (await client.post('/api/vehicles', car(owner.id))).body;
    await expect(
      ctx.owner.query('UPDATE vehicle SET "fleetId" = $1 WHERE id = $2', [
        otherFleet.id,
        vehicle.id,
      ]),
    ).rejects.toThrow(/vehicle_fleetId_ownerId_fkey/);
  });
});

describe('changing, searching and archiving', () => {
  it('updates with a version check and audits field names only', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client);
    const vehicle = (await client.post('/api/vehicles', car(owner.id))).body;

    const ok = await client.send('patch', `/api/vehicles/${vehicle.id}`, {
      model: 'Sandero',
      registration: '12345-B-7',
      version: 1,
    });
    expect(ok.body).toMatchObject({ model: 'Sandero', registration: '12345-B-7', version: 2 });
    const stale = await client.send('patch', `/api/vehicles/${vehicle.id}`, {
      model: 'X',
      version: 1,
    });
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');

    const [event] = await ctx.prisma.auditLog.findMany({ where: { action: 'vehicle.updated' } });
    expect(event.details.fields.sort()).toEqual(['model', 'registration']);
  });

  it('keeps category rules when the category changes', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client);
    const vehicle = (await client.post('/api/vehicles', car(owner.id))).body;
    const res = await client.send('patch', `/api/vehicles/${vehicle.id}`, {
      category: 'TAXI',
      version: 1,
    });
    expect(res.body.error.details).toContainEqual({ path: 'seats', rule: 'REQUIRED' });
  });

  it('finds vehicles by plate in any spelling, by make and by owner name', async () => {
    const client = await signIn('agent.a', 'AGENT');
    const owner = await customer(client, { legalName: 'Société Atlas Hôtels' });
    await client.post('/api/vehicles', car(owner.id));
    const found = async (q) =>
      (await client.get(`/api/vehicles?q=${encodeURIComponent(q)}`)).body.total;
    expect(await found('12345b6')).toBe(1);
    expect(await found('dacia')).toBe(1);
    expect(await found('atlas hotels')).toBe(1);
    expect(await found('peugeot')).toBe(0);
  });

  it('archives (managers only), blocks edits and restores; reading stays open to auditors', async () => {
    const agent = await signIn('agent.a', 'AGENT');
    const manager = await signIn('manager.m', 'MANAGER');
    const auditor = await signIn('auditeur.x', 'AUDITOR');
    const owner = await customer(agent);
    const vehicle = (await agent.post('/api/vehicles', car(owner.id))).body;

    expect(
      (await agent.post(`/api/vehicles/${vehicle.id}/archive`, { reason: 'Vendu', version: 1 }))
        .status,
    ).toBe(403);
    const archived = await manager.post(`/api/vehicles/${vehicle.id}/archive`, {
      reason: 'Véhicule vendu',
      version: 1,
    });
    expect(archived.body.archiveReason).toBe('Véhicule vendu');
    expect(
      (await agent.send('patch', `/api/vehicles/${vehicle.id}`, { model: 'X', version: 2 })).body
        .error.code,
    ).toBe('ARCHIVED');
    expect(
      (await manager.post(`/api/vehicles/${vehicle.id}/restore`, { version: 2 })).body.archivedAt,
    ).toBeNull();

    expect((await auditor.get(`/api/vehicles/${vehicle.id}`)).status).toBe(200);
    expect(
      (await auditor.post('/api/vehicles', car(owner.id, { registration: '777-A-1' }))).status,
    ).toBe(403);
  });

  it('the application cannot delete vehicles or fleets', async () => {
    await expect(runtime.query('DELETE FROM vehicle')).rejects.toThrow(/permission denied/);
    await expect(runtime.query('DELETE FROM fleet')).rejects.toThrow(/permission denied/);
  });
});
