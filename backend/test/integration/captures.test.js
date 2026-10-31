import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const { signIn, prepareCatalogue, customerWithVehicles, contractBody, issue, series } =
  contractFixtures(ctx);
const pdf = (text) => Buffer.from(`%PDF-1.7\n% ${text}\n%%EOF\n`);

/**
 * An issued RMA contract (POL-0001, 01/11/2026–31/10/2027, premium 1 234,50 MAD) of Sara Test,
 * covering one car with an attestation 14 A n° 123456789, and a scan of each document type.
 */
async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const { customer, car } = await customerWithVehicles(agent);
  const draft = (await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id])))
    .body;
  const contract = await issue(agent, draft);
  const recorded = await agent.post(`/api/contracts/${contract.id}/attestations`, {
    vehicleId: car.id,
    seriesId: (await series('RMA', '14 A')).id,
    number: '123456789',
    validFrom: '2026-11-01',
    validTo: '2027-10-31',
  });
  expect(recorded.status).toBe(201);
  const attach = async (type) =>
    (await agent.upload(`/api/contracts/${contract.id}/documents?type=${type}`, pdf(type))).body;
  return { manager, agent, customer, car, contract, attach };
}
const save = (client, document, fields, version) =>
  client.put(`/api/documents/${document.id}/capture`, {
    fields,
    ...(version ? { version } : {}),
  });
const statuses = (body) => Object.fromEntries(body.checks.map((c) => [c.field, c.status]));

describe('typing what an insurer document prints', () => {
  it('compares an attestation with the customer, the vehicle and the attestation recorded', async () => {
    const { agent, car, attach } = await setup();
    const document = await attach('ATTESTATION');
    expect((await agent.get(`/api/documents/${document.id}/capture`)).body).toMatchObject({
      document: { id: document.id, type: 'ATTESTATION' },
      contract: { status: 'ISSUED', correctable: true },
      capture: null,
      checks: [],
    });

    const saved = await save(agent, document, {
      seriesCode: '14a',
      number: '123 456 789',
      usage: 'tourisme',
      holderName: 'TEST Sara',
      policyNumber: 'POL 0001',
      registration: car.registration.replace(/-/g, ' '),
      vin: 'VF1ABC12345678901',
      validFrom: '2026-11-01',
      validTo: '2027-10-31',
      intermediary: 'Agence synthétique',
    });
    expect(saved.status).toBe(200);
    // Kept as printed, tidied: series "14 A", digits only.
    expect(saved.body.capture).toMatchObject({
      fields: { seriesCode: '14 A', number: '123456789' },
      capturedBy: { displayName: 'Utilisateur agent.a' },
      version: 1,
    });
    expect(statuses(saved.body)).toEqual({
      policyNumber: 'MATCH',
      holderName: 'MATCH',
      registration: 'MATCH',
      vin: 'MISSING_IN_APP',
      usage: 'MATCH',
      attestation: 'MATCH',
      validFrom: 'MATCH',
      validTo: 'MATCH',
    });
    expect(saved.body.checks.find((c) => c.field === 'vin').link).toEqual({
      kind: 'vehicle',
      id: car.id,
    });

    // Another attestation number and another plate: not on this contract.
    const other = await save(
      agent,
      document,
      { ...saved.body.capture.fields, number: '999999999', registration: '99999-B-1' },
      1,
    );
    expect(statuses(other.body)).toMatchObject({
      attestation: 'NOT_ON_CONTRACT',
      registration: 'NOT_ON_CONTRACT',
    });
    // Saving with an old version is refused, and the values themselves are not audited.
    expect((await save(agent, document, {}, 1)).body.error.code).toBe('VERSION_CONFLICT');
    const [event] = await ctx.prisma.auditLog.findMany({
      where: { action: 'document.captured' },
      orderBy: { id: 'desc' },
      take: 1,
    });
    expect(event.details).toEqual({ fields: ['number', 'registration'] });
  });

  it('refuses fields that do not belong to the document or are not valid', async () => {
    const { agent, attach } = await setup();
    const quittance = await attach('QUITTANCE');
    const res = await save(agent, quittance, {
      seriesCode: '14 A',
      premiumTotal: '12,345',
      periodFrom: '2026-11-01',
      periodTo: '2026-10-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.rule).sort()).toEqual(
      ['END_BEFORE_START', 'INVALID_AMOUNT', 'unrecognized_keys'].sort(),
    );
    const auditor = await signIn('auditeur', 'AUDITOR');
    expect((await auditor.get(`/api/documents/${quittance.id}/capture`)).status).toBe(403);
    expect((await save(auditor, quittance, {})).status).toBe(403);
  });

  it('corrects the issued contract from the conditions particulières, one value at a time', async () => {
    const { agent, contract, attach } = await setup();
    const document = await attach('CONDITIONS_PARTICULIERES');
    const saved = (
      await save(agent, document, {
        policyNumber: 'POL-0001-B',
        effectDate: '2026-11-02',
        endDate: '2027-11-01',
        premiumTotal: '1 300,00',
        premiumNet: '1 100,00',
        taxes: '200',
      })
    ).body;
    expect(statuses(saved)).toEqual({
      policyNumber: 'DIFFERENT',
      effectDate: 'DIFFERENT',
      endDate: 'DIFFERENT',
      premiumTotal: 'DIFFERENT',
    });
    expect(saved.checks.find((c) => c.field === 'premiumTotal')).toMatchObject({
      captured: '1300.00',
      recorded: '1234.50',
      apply: 'premiumTotal',
    });

    const apply = (field, version) =>
      agent.post(`/api/documents/${document.id}/capture/apply`, { field, version });
    let version = saved.contract.version;
    for (const field of ['policyNumber', 'startDate', 'endDate', 'premiumTotal']) {
      const res = await apply(field, version);
      expect(res.status).toBe(200);
      version = res.body.contract.version;
    }
    const after = (await agent.get(`/api/contracts/${contract.id}`)).body;
    expect(after).toMatchObject({
      policyNumber: 'POL-0001-B',
      startDate: '2026-11-02',
      endDate: '2027-11-01',
      premiumTotal: '1300.00',
    });
    expect((await apply('premiumTotal', version)).body.error.code).toBe('NOTHING_TO_APPLY');
    expect((await apply('policyNumber', 1)).body.error.code).toBe('NOTHING_TO_APPLY');
    const events = await ctx.prisma.auditLog.findMany({ where: { action: 'contract.corrected' } });
    expect(events.map((e) => e.details)).toContainEqual({
      field: 'premiumTotal',
      from: '1234.50',
      to: '1300.00',
      documentId: document.id,
    });
  });

  it('keeps the rules of the contract: premium never below what was paid, one policy per insurer', async () => {
    const { agent, customer, car, contract, attach } = await setup();
    await agent.post(`/api/contracts/${contract.id}/payments`, {
      amount: '1000',
      method: 'CASH',
      idempotencyKey: randomUUID(),
    });
    const document = await attach('QUITTANCE');
    const saved = (await save(agent, document, { premiumTotal: '900', policyNumber: 'POL-0002' }))
      .body;
    const apply = (field) =>
      agent.post(`/api/documents/${document.id}/capture/apply`, {
        field,
        version: saved.contract.version,
      });
    expect((await apply('premiumTotal')).body.error.details).toEqual([
      { path: 'premiumTotal', rule: 'PREMIUM_BELOW_PAID' },
    ]);

    // POL-0002 already belongs to another RMA contract.
    const products = await ctx.prisma.product.findFirstOrThrow({
      where: { name: 'Produit synthétique RMA' },
    });
    const otherDraft = (
      await agent.post(
        '/api/contracts',
        contractBody(customer, products.id, [car.id], {
          startDate: '2028-01-01',
          endDate: '2028-12-31',
        }),
      )
    ).body;
    await issue(agent, otherDraft, 'POL-0002');
    expect((await apply('policyNumber')).body.error.code).toBe('DUPLICATE_POLICY');

    // An auditor cannot correct; an agent cannot correct a contract that is not issued.
    const auditor = await signIn('auditeur', 'AUDITOR');
    expect(
      (
        await auditor.post(`/api/documents/${document.id}/capture/apply`, {
          field: 'premiumTotal',
          version: 1,
        })
      ).status,
    ).toBe(403);
    const draft = (
      await agent.post(
        '/api/contracts',
        contractBody(customer, products.id, [car.id], {
          startDate: '2029-01-01',
          endDate: '2029-12-31',
        }),
      )
    ).body;
    const onDraft = (
      await agent.upload(`/api/contracts/${draft.id}/documents?type=QUITTANCE`, pdf('brouillon'))
    ).body;
    await save(agent, onDraft, { premiumTotal: '2000' });
    const refused = await agent.post(`/api/documents/${onDraft.id}/capture/apply`, {
      field: 'premiumTotal',
      version: draft.version,
    });
    expect(refused.body.error.code).toBe('NOT_CORRECTABLE');
  });
});
