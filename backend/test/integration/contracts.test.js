import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { addOneMonth } from '../../src/modules/contracts/service.js';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
const runtime = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

beforeEach(() => ctx.reset());
afterAll(async () => {
  await runtime.end();
  await ctx.close();
});

const { signIn, patch, series, prepareCatalogue, customerWithVehicles, contractBody, issue } =
  contractFixtures(ctx);

describe('contracts', () => {
  it('creates a numbered draft for a customer’s vehicles with a confirmed product only', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const products = await prepareCatalogue(manager);
    const agent = await signIn('agent.a', 'AGENT');
    const { customer, car } = await customerWithVehicles(agent);

    const unconfirmed = await agent.post(
      '/api/contracts',
      contractBody(customer, products.unconfirmed, [car.id]),
    );
    expect(unconfirmed.status).toBe(400);
    expect(unconfirmed.body.error.details).toEqual([
      { path: 'productId', rule: 'PRODUCT_NOT_USABLE' },
    ]);
    const backwards = await agent.post(
      '/api/contracts',
      contractBody(customer, products.RMA, [car.id], { endDate: '2026-10-31' }),
    );
    expect(backwards.body.error.details).toEqual([{ path: 'endDate', rule: 'END_BEFORE_START' }]);
    // The insurer's policy number is the contract's number: recorded with it, as printed.
    const withoutNumber = contractBody(customer, products.RMA, [car.id]);
    delete withoutNumber.policyNumber;
    const unnumbered = await agent.post('/api/contracts', withoutNumber);
    expect(unnumbered.status).toBe(400);
    expect(unnumbered.body.error.details).toEqual([
      expect.objectContaining({ path: 'policyNumber' }),
    ]);
    const garbled = await agent.post(
      '/api/contracts',
      contractBody(customer, products.RMA, [car.id], { policyNumber: 'n° ?' }),
    );
    expect(garbled.body.error.details).toEqual([
      { path: 'policyNumber', rule: 'INVALID_POLICY_NUMBER' },
    ]);

    const created = await agent.post(
      '/api/contracts',
      contractBody(customer, products.RMA, [car.id], { policyNumber: ' 6630 7052 6001 509 ' }),
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      ref: 'CTR-2026-00001',
      status: 'DRAFT',
      period: null,
      insurer: { code: 'RMA' },
      premiumTotal: '1234.50',
      tacitRenewal: true,
      noticeDays: 30,
      // Spaces dropped, as the platform prints it.
      policyNumber: '663070526001509',
      vehicles: [{ id: car.id, registration: car.registration }],
      history: [{ from: null, to: 'DRAFT' }],
    });
    const second = await agent.post(
      '/api/contracts',
      contractBody(customer, products.CAT, [car.id]),
    );
    expect(second.body.ref).toBe('CTR-2026-00002');
    // The same number at the same insurer is another contract's; at the other insurer it is free.
    const twin = await agent.post(
      '/api/contracts',
      contractBody(customer, products.RMA, [car.id], { policyNumber: '663070526001509' }),
    );
    expect(twin.status).toBe(409);
    expect(twin.body.error.code).toBe('DUPLICATE_POLICY');
    const elsewhere = await agent.post(
      '/api/contracts',
      contractBody(customer, products.CAT, [car.id], { policyNumber: '663070526001509' }),
    );
    expect(elsewhere.status).toBe(201);
    expect(await ctx.auditActions()).toContain('contract.created');

    // Another customer's vehicle cannot be covered.
    const other = await customerWithVehicles(agent, 'Karim');
    const foreign = await agent.post(
      '/api/contracts',
      contractBody(customer, products.RMA, [other.car.id]),
    );
    expect(foreign.body.error.details).toEqual([
      { path: 'vehicleIds', rule: 'VEHICLE_NOT_OF_CUSTOMER' },
    ]);
  });

  it('follows the status machine: issue needs the insurer’s proof and may correct the policy number', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const products = await prepareCatalogue(manager);
    const agent = await signIn('agent.a', 'AGENT');
    const { customer, car } = await customerWithVehicles(agent);
    const contract = (
      await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id]))
    ).body;

    const skip = await agent.post(`/api/contracts/${contract.id}/transition`, {
      to: 'ISSUED',
      version: 1,
    });
    expect(skip.status).toBe(409);
    expect(skip.body.error).toMatchObject({
      code: 'INVALID_TRANSITION',
      details: { from: 'DRAFT', to: 'ISSUED' },
    });

    const sent = await agent.post(`/api/contracts/${contract.id}/transition`, {
      to: 'AWAITING_INSURER',
      version: 1,
    });
    expect(sent.body.status).toBe('AWAITING_INSURER');
    // Only a draft is edited.
    const edit = await patch(agent, `/api/contracts/${contract.id}`, {
      noticeDays: 60,
      version: 2,
    });
    expect(edit.body.error.code).toBe('NOT_EDITABLE');

    const bare = await agent.post(`/api/contracts/${contract.id}/transition`, {
      to: 'ISSUED',
      version: 2,
    });
    // The policy number was recorded with the contract: only the insurer's proof is missing.
    expect(bare.body.error.details).toEqual([{ path: 'insurerReference', rule: 'REQUIRED' }]);
    const issued = await agent.post(`/api/contracts/${contract.id}/transition`, {
      to: 'ISSUED',
      policyNumber: 'POL-0001',
      insurerReference: 'Courriel de l’assureur',
      version: 2,
    });
    expect(issued.body).toMatchObject({
      status: 'ISSUED',
      policyNumber: 'POL-0001',
      // Today is 22/10/2026 (test clock); cover starts on 01/11/2026.
      period: 'UPCOMING',
    });
    expect(issued.body.history.map((h) => h.to)).toEqual(['ISSUED', 'AWAITING_INSURER', 'DRAFT']);

    // 15 days later the cover has started (sessions expire meanwhile: sign in again).
    ctx.clock.advance(15 * 24 * 3600 * 1000);
    const later = await signIn('agent.b', 'AGENT');
    expect((await later.get(`/api/contracts/${contract.id}`)).body.period).toBe('ACTIVE');

    // The same policy number at the same insurer is another contract's.
    const twin = (
      await later.post('/api/contracts', contractBody(customer, products.RMA, [car.id]))
    ).body;
    await later.post(`/api/contracts/${twin.id}/transition`, {
      to: 'AWAITING_INSURER',
      version: 1,
    });
    const dup = await later.post(`/api/contracts/${twin.id}/transition`, {
      to: 'ISSUED',
      policyNumber: 'POL-0001',
      insurerReference: 'x',
      version: 2,
    });
    expect(dup.body.error.code).toBe('DUPLICATE_POLICY');
  });

  it('frees a policy number typed wrong: corrected on the draft, or the draft cancelled before the issue', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const products = await prepareCatalogue(manager);
    const agent = await signIn('agent.a', 'AGENT');
    const { customer, car } = await customerWithVehicles(agent);
    const create = (policyNumber) =>
      agent.post(
        '/api/contracts',
        contractBody(customer, products.RMA, [car.id], { policyNumber }),
      );

    const first = (await create('POL-0100')).body;
    const corrected = await patch(agent, `/api/contracts/${first.id}`, {
      policyNumber: 'pol-0101',
      version: first.version,
    });
    expect(corrected.body.policyNumber).toBe('POL-0101');
    // The draft no longer holds POL-0100, but still holds its new number.
    expect((await create('POL-0101')).body.error.code).toBe('DUPLICATE_POLICY');
    const second = (await create('POL-0100')).body;
    expect(second.policyNumber).toBe('POL-0100');
    const taken = await patch(agent, `/api/contracts/${second.id}`, {
      policyNumber: 'POL-0101',
      version: second.version,
    });
    expect(taken.body.error.code).toBe('DUPLICATE_POLICY');

    // Cancelled before the insurer issued it: the number is free again.
    await agent.post(`/api/contracts/${second.id}/transition`, {
      to: 'CANCELLED',
      reason: 'Mauvais client',
      version: second.version,
    });
    const third = (await create('POL-0100')).body;
    expect(third.policyNumber).toBe('POL-0100');

    // Issued then cancelled by the insurer: the number stays that contract's.
    const issued = await issue(agent, third, 'POL-0100');
    const ended = await manager.post(`/api/contracts/${third.id}/transition`, {
      to: 'CANCELLED',
      reason: 'Résiliation',
      insurerReference: 'Lettre de l’assureur',
      effectiveDate: '2026-12-01',
      version: issued.version,
    });
    expect(ended.body.status).toBe('CANCELLED');
    expect((await create('POL-0100')).body.error.code).toBe('DUPLICATE_POLICY');
  });

  it('lets only a manager suspend, reinstate or terminate an issued contract, with the insurer’s reference', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const products = await prepareCatalogue(manager);
    const agent = await signIn('agent.a', 'AGENT');
    const { customer, car } = await customerWithVehicles(agent);
    const draft = (
      await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id]))
    ).body;
    const contract = await issue(agent, draft);

    const byAgent = await agent.post(`/api/contracts/${contract.id}/transition`, {
      to: 'SUSPENDED',
      insurerReference: 'Lettre de suspension',
      effectiveDate: '2026-12-01',
      version: contract.version,
    });
    expect(byAgent.status).toBe(403);
    const [denied] = await ctx.prisma.auditLog.findMany({
      where: { action: 'security.access_denied' },
    });
    expect(denied.details).toMatchObject({ permission: 'contracts.terminate', to: 'SUSPENDED' });

    const noRef = await manager.post(`/api/contracts/${contract.id}/transition`, {
      to: 'SUSPENDED',
      version: contract.version,
    });
    expect(noRef.body.error.details).toEqual([
      { path: 'insurerReference', rule: 'REQUIRED' },
      { path: 'effectiveDate', rule: 'REQUIRED' },
    ]);
    const suspended = await manager.post(`/api/contracts/${contract.id}/transition`, {
      to: 'SUSPENDED',
      insurerReference: 'Lettre de suspension',
      effectiveDate: '2026-12-01',
      version: contract.version,
    });
    expect(suspended.body).toMatchObject({ status: 'SUSPENDED', period: null });
    const terminated = await manager.post(`/api/contracts/${contract.id}/transition`, {
      to: 'CANCELLED',
      insurerReference: 'Avenant de résiliation',
      effectiveDate: '2027-01-01',
      reason: 'Vente du véhicule',
      version: suspended.body.version,
    });
    expect(terminated.body.status).toBe('CANCELLED');
    expect(terminated.body.history[0]).toMatchObject({
      from: 'SUSPENDED',
      to: 'CANCELLED',
      reason: 'Vente du véhicule',
      insurerReference: 'Avenant de résiliation',
      effectiveDate: '2027-01-01',
    });

    // An agent cancels a draft, always with a reason.
    const other = (
      await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id]))
    ).body;
    const noReason = await agent.post(`/api/contracts/${other.id}/transition`, {
      to: 'CANCELLED',
      version: 1,
    });
    expect(noReason.body.error.details).toEqual([{ path: 'reason', rule: 'REQUIRED' }]);
    const cancelled = await agent.post(`/api/contracts/${other.id}/transition`, {
      to: 'CANCELLED',
      reason: 'Le client a renoncé',
      version: 1,
    });
    expect(cancelled.body.status).toBe('CANCELLED');
  });

  it('changes the vehicles of a draft and keeps the history of removed ones', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const products = await prepareCatalogue(manager);
    const agent = await signIn('agent.a', 'AGENT');
    const { customer, car, noUsage } = await customerWithVehicles(agent);
    const contract = (
      await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id]))
    ).body;

    const added = await agent.post(`/api/contracts/${contract.id}/vehicles`, {
      vehicleId: noUsage.id,
      version: 1,
    });
    expect(added.body.vehicles.map((v) => v.id)).toEqual([car.id, noUsage.id]);
    const again = await agent.post(`/api/contracts/${contract.id}/vehicles`, {
      vehicleId: noUsage.id,
      version: 2,
    });
    expect(again.body.error.code).toBe('VEHICLE_ALREADY_ON_CONTRACT');

    let version = 2;
    for (const vehicle of [car, noUsage]) {
      const removed = await agent.post(
        `/api/contracts/${contract.id}/vehicles/${vehicle.id}/remove`,
        { version },
      );
      version = removed.body.version;
    }
    const empty = await agent.post(`/api/contracts/${contract.id}/transition`, {
      to: 'AWAITING_INSURER',
      version,
    });
    expect(empty.body.error.details).toEqual([{ path: 'vehicleIds', rule: 'REQUIRED' }]);
    const rows = await ctx.prisma.contractVehicle.findMany({ where: { contractId: contract.id } });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.removedAt && row.removedById)).toBe(true);
  });
});

describe('attestations', () => {
  async function issuedContract() {
    const manager = await signIn('manager.a', 'MANAGER');
    const products = await prepareCatalogue(manager);
    const agent = await signIn('agent.a', 'AGENT');
    const { customer, car, noUsage } = await customerWithVehicles(agent);
    const draft = (
      await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id, noUsage.id]))
    ).body;
    return { manager, agent, products, customer, car, noUsage, draft };
  }
  const attestation = (vehicle, seriesRow, overrides = {}) => ({
    vehicleId: vehicle.id,
    seriesId: seriesRow.id,
    number: '123 456 789',
    validFrom: '2026-11-01',
    validTo: '2027-10-31',
    ...overrides,
  });

  it('records a provisional attestation of one month at most before the issue (rule L23)', async () => {
    const { agent, car, draft } = await issuedContract();
    const provisional = await series('RMA', '14 P');
    const path = `/api/contracts/${draft.id}/attestations`;

    // One day more than a month is refused; exactly one month is what the platform prints.
    const tooLong = await agent.post(
      path,
      attestation(car, provisional, { validFrom: '2026-10-23', validTo: '2026-11-24' }),
    );
    expect(tooLong.body.error.details).toEqual([{ path: 'validTo', rule: 'PROVISIONAL_TOO_LONG' }]);
    const ok = await agent.post(
      path,
      attestation(car, provisional, {
        validFrom: '2026-10-23',
        validTo: '2026-11-23',
        coverNoteRef: 'NC-1',
      }),
    );
    expect(ok.status).toBe(201);
    expect(ok.body.attestations[0]).toMatchObject({
      number: '123456789',
      provisional: true,
      series: { code: '14 P', model: { code: 'P', officialNumber: 7, colour: 'rose' } },
      coverNoteRef: 'NC-1',
      medium: 'PAPER',
    });
    // The other insurer's provisional series is refused.
    const cat = await agent.post(
      path,
      attestation(car, await series('CAT', '91 P'), { number: '1' }),
    );
    expect(cat.body.error.details).toEqual([{ path: 'seriesId', rule: 'SERIES_OTHER_INSURER' }]);
    // The month is counted like the database does: 31/01 + 1 month = 28/02.
    expect(addOneMonth('2027-01-31')).toBe('2027-02-28');
  });

  it('records the definitive attestation of the vehicle’s model once the contract is issued (rule L16)', async () => {
    const { agent, car, noUsage, draft } = await issuedContract();
    const tourisme = await series('RMA', '14 A');
    const path = `/api/contracts/${draft.id}/attestations`;

    const early = await agent.post(path, attestation(car, tourisme));
    expect(early.body.error.code).toBe('CONTRACT_NOT_ISSUED');
    await issue(agent, draft);

    const goods = await agent.post(path, attestation(car, await series('RMA', '14 C')));
    expect(goods.body.error.details).toEqual([{ path: 'seriesId', rule: 'MODEL_MISMATCH' }]);
    const unknownUsage = await agent.post(path, attestation(noUsage, tourisme));
    expect(unknownUsage.body.error.details).toEqual([
      { path: 'vehicleId', rule: 'VEHICLE_USAGE_REQUIRED' },
    ]);
    const outside = await agent.post(path, attestation(car, tourisme, { validTo: '2027-11-30' }));
    expect(outside.body.error.details).toEqual([{ path: 'validTo', rule: 'OUTSIDE_CONTRACT' }]);
    const unconfirmed = await agent.post(path, attestation(car, await series('RMA', '14 E')));
    expect(unconfirmed.body.error.details).toEqual([
      { path: 'seriesId', rule: 'SERIES_NOT_USABLE' },
    ]);

    const ok = await agent.post(path, attestation(car, tourisme, { medium: 'ELECTRONIC' }));
    expect(ok.status).toBe(201);
    expect(ok.body.attestations[0]).toMatchObject({
      provisional: false,
      medium: 'ELECTRONIC',
      series: { model: { code: 'A', officialNumber: 1, colour: 'jaune' } },
    });
    expect(await ctx.auditActions()).toContain('attestation.recorded');
  });

  it('refuses a serial number twice, but records a duplicate after loss with the same number (rule L26)', async () => {
    const { agent, car, draft } = await issuedContract();
    await issue(agent, draft);
    const tourisme = await series('RMA', '14 A');
    const path = `/api/contracts/${draft.id}/attestations`;
    const original = (await agent.post(path, attestation(car, tourisme))).body.attestations[0];

    const twice = await agent.post(path, attestation(car, tourisme));
    expect(twice.body.error.code).toBe('DUPLICATE_ATTESTATION');
    const wrong = await agent.post(
      path,
      attestation(car, tourisme, { number: '999', duplicateOfId: original.id }),
    );
    expect(wrong.body.error.details).toEqual([
      { path: 'duplicateOfId', rule: 'DUPLICATE_MISMATCH' },
    ]);
    // The original is lost later: the duplicate is the newest attestation.
    ctx.clock.advance(60_000);
    const duplicate = await agent.post(
      path,
      attestation(car, tourisme, { duplicateOfId: original.id }),
    );
    expect(duplicate.status).toBe(201);
    expect(duplicate.body.attestations[0]).toMatchObject({
      number: '123456789',
      duplicateOf: { id: original.id, number: '123456789' },
    });

    const cancelled = await agent.post(`/api/attestations/${original.id}/cancel`, {
      reason: 'Perdue par l’assuré',
      version: 1,
    });
    const view = cancelled.body.attestations.find((a) => a.id === original.id);
    expect(view.cancelled).toMatchObject({ reason: 'Perdue par l’assuré' });
    const again = await agent.post(`/api/attestations/${original.id}/cancel`, {
      reason: 'Encore',
      version: 2,
    });
    expect(again.body.error.code).toBe('ALREADY_CANCELLED');
  });
});

describe('contract permissions and database protections', () => {
  it('lets an auditor read contracts but change nothing', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const products = await prepareCatalogue(manager);
    const { customer, car } = await customerWithVehicles(manager);
    await manager.post('/api/contracts', contractBody(customer, products.RMA, [car.id]));
    const auditor = await signIn('auditor.a', 'AUDITOR');
    const list = await auditor.get('/api/contracts?q=sara');
    expect(list.body).toMatchObject({ total: 1, items: [{ ref: 'CTR-2026-00001' }] });
    const refused = await auditor.post(
      '/api/contracts',
      contractBody(customer, products.RMA, [car.id]),
    );
    expect(refused.status).toBe(403);
  });

  it('lists the newest contracts first, by number when recorded at the same moment', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const products = await prepareCatalogue(manager);
    const { customer, car } = await customerWithVehicles(manager);
    for (let i = 0; i < 3; i += 1) {
      await manager.post('/api/contracts', contractBody(customer, products.RMA, [car.id]));
    }
    const list = (await manager.get('/api/contracts')).body;
    expect(list.items.map((c) => c.ref)).toEqual([
      'CTR-2026-00003',
      'CTR-2026-00002',
      'CTR-2026-00001',
    ]);
  });

  it('never deletes contracts, keeps the status history append-only and enforces the rules', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const products = await prepareCatalogue(manager);
    const { customer, car } = await customerWithVehicles(manager);
    const contract = (
      await manager.post('/api/contracts', contractBody(customer, products.RMA, [car.id]))
    ).body;

    for (const table of ['contract', 'contract_vehicle', 'attestation', 'contract_status_change']) {
      await expect(runtime.query(`DELETE FROM "${table}"`)).rejects.toThrow(/permission denied/);
    }
    await expect(
      runtime.query('UPDATE "contract_status_change" SET "reason" = \'x\''),
    ).rejects.toThrow(/permission denied/);
    await expect(ctx.owner.query('DELETE FROM "contract_status_change"')).rejects.toThrow(
      /append-only/,
    );
    await expect(
      ctx.owner.query(`UPDATE "contract" SET "status" = 'ISSUED' WHERE "id" = $1`, [contract.id]),
    ).rejects.toThrow(/contract_issued_has_policy/);
    await expect(
      runtime.query(
        `INSERT INTO "contract_status_change" ("contractId", "fromStatus", "toStatus", "userId")
         SELECT $1, 'DRAFT', 'CANCELLED', "createdById" FROM "contract" WHERE "id" = $1`,
        [contract.id],
      ),
    ).rejects.toThrow(/contract_status_change_cancel_reason/);
    const provisional = await series('RMA', '14 P');
    await expect(
      runtime.query(
        `INSERT INTO "attestation" ("contractId", "vehicleId", "seriesId", "number", "provisional",
           "validFrom", "validTo", "createdById", "updatedAt")
         SELECT $1, $2, $3, '42', true, '2026-10-23', '2026-11-24', "createdById", now()
         FROM "contract" WHERE "id" = $1`,
        [contract.id, car.id, provisional.id],
      ),
    ).rejects.toThrow(/attestation_provisional_one_month/);
  });
});
