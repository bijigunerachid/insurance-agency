import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const { signIn, prepareCatalogue, customerWithVehicles, contractBody, issue } =
  contractFixtures(ctx);

async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const { customer, car } = await customerWithVehicles(agent);
  const first = await issue(
    agent,
    (await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id]))).body,
    'POL-0001',
  );
  return { manager, agent, products, customer, car, first };
}
/**
 * A draft for the year after `previous` (linked to it when `linked`, under `policy`, the new
 * number the platform gave), then sent to RMA.
 */
async function nextYear({ agent, products, customer, car }, previous, linked = true, policy) {
  const body = contractBody(customer, products.RMA, [car.id], {
    startDate: '2027-11-01',
    endDate: '2028-10-31',
  });
  let draft;
  if (linked) {
    const row = await ctx.prisma.contract.findUniqueOrThrow({ where: { id: previous.id } });
    const renewal = await ctx.prisma.renewal.create({
      data: { contractId: row.id, dueDate: row.endDate, assignedUserId: row.createdById },
    });
    const res = await agent.post(`/api/renewals/${renewal.id}/renew`, {
      policyNumber: policy ?? `${previous.policyNumber}-R`,
      version: 1,
    });
    expect(res.status).toBe(201);
    draft = (await agent.get(`/api/contracts/${res.body.contractId}`)).body;
  } else {
    draft = (await agent.post('/api/contracts', body)).body;
  }
  const sent = await agent.post(`/api/contracts/${draft.id}/transition`, {
    to: 'AWAITING_INSURER',
    version: draft.version,
  });
  return sent.body;
}
const issueWith = (client, contract, policyNumber) =>
  client.post(`/api/contracts/${contract.id}/transition`, {
    to: 'ISSUED',
    policyNumber,
    insurerReference: 'Courriel de l’assureur',
    version: contract.version,
  });

describe('policy numbers along a renewal chain', () => {
  it('gives every year its own number: last year’s is refused to a renewal, as to any contract', async () => {
    const data = await setup();
    const renewal = await nextYear(data, data.first, true, 'POL-0002');
    // The insurer cannot be said to have issued it under last year's number…
    const kept = await issueWith(data.agent, renewal, 'POL-0001');
    expect(kept.status).toBe(400);
    expect(kept.body.error.details).toEqual([
      { path: 'policyNumber', rule: 'SAME_POLICY_AS_PREVIOUS' },
    ]);
    // …nor written so in the database, renewal chain or not (owner, 05/11/2026).
    await expect(
      ctx.owner.query(`UPDATE "contract" SET "policyNumber" = 'POL-0001' WHERE "id" = $1`, [
        renewal.id,
      ]),
    ).rejects.toThrow(/policy number already used/);
    expect((await issueWith(data.agent, renewal, 'POL-0002')).status).toBe(200);

    // A contract that renews nothing cannot take the number either.
    const other = await nextYear(data, data.first, false);
    const refused = await issueWith(data.agent, other, 'POL-0001');
    expect(refused.body.error.code).toBe('DUPLICATE_POLICY');
    await expect(
      ctx.owner.query(`UPDATE "contract" SET "policyNumber" = 'POL-0001' WHERE "id" = $1`, [
        other.id,
      ]),
    ).rejects.toThrow(/policy number already used/);
  });

  it('a third year has its own number too; two unrelated contracts at once: only one gets it', async () => {
    const data = await setup();
    const second = (
      await issueWith(data.agent, await nextYear(data, data.first, true, 'POL-0002'), 'POL-0002')
    ).body;
    // The first year's number is not the third's either.
    const third = await nextYear(data, second, true, 'POL-0003');
    expect((await issueWith(data.agent, third, 'POL-0001')).body.error.code).toBe(
      'DUPLICATE_POLICY',
    );
    expect((await issueWith(data.agent, third, 'POL-0003')).status).toBe(200);

    const a = await nextYear(data, data.first, false);
    const b = await nextYear(data, data.first, false);
    const results = await Promise.all([
      issueWith(data.agent, a, 'POL-0099'),
      issueWith(data.agent, b, 'POL-0099'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});

const READ = (policy, number, from, to) => `ATTESTATION D'ASSURANCE OBLIGATOIRE
USAGE : TOURISME
NUMERO D'ORDRE | 14 A ${number}
PROPRIETAIRE DU VEHICULE
Nom SARA TEST
Numéro de la police ${policy}
DU: ${from}
AU: ${to}`;

describe('a scanned renewal', () => {
  it('files the next year, found by its vehicle, as the renewal of the contract under its new number', async () => {
    const data = await setup();
    const { agent, first, car, customer } = data;
    const old = await ctx.prisma.contract.findUniqueOrThrow({ where: { id: first.id } });
    const open = await ctx.prisma.renewal.create({
      data: { contractId: old.id, dueDate: old.endDate, assignedUserId: old.createdById },
    });
    ctx.reading = {
      text: READ('POL-0002', '218000777', '01 11 2027', '31 10 2028'),
      confidence: 80,
    };
    const scan = (
      await agent.upload('/api/scans', Buffer.from('%PDF-1.7\n% renouvellement\n'), {
        name: 'renouvellement.pdf',
      })
    ).body;
    // The new number is no contract's yet: the vehicle's contract at RMA is the one it renews.
    const registration = encodeURIComponent(car.registration);
    const matches = (
      await agent.get(
        `/api/scans/${scan.id}/matches?policyNumber=POL-0002&registration=${registration}&seriesId=${scan.proposed.seriesId}&number=218000777`,
      )
    ).body;
    expect(matches.contract).toMatchObject({
      id: first.id,
      endDate: '2027-10-31',
      byVehicle: true,
      replacedPolicy: false,
    });

    const filing = {
      version: scan.version,
      seriesId: scan.proposed.seriesId,
      number: '218000777',
      validFrom: '2027-11-01',
      validTo: '2028-10-31',
      customer: { id: customer.id },
      vehicle: { id: car.id },
      contract: {
        renew: {
          id: first.id,
          startDate: '2027-11-01',
          endDate: '2028-10-31',
          premiumTotal: '1300',
        },
      },
      printed: { seriesCode: '14 A', number: '218000777' },
    };
    // Last year's number is refused, and no contract is recorded.
    const kept = await agent.post(`/api/scans/${scan.id}/file`, {
      ...filing,
      policyNumber: 'POL-0001',
    });
    expect(kept.body.error.details).toEqual([
      { path: 'policyNumber', rule: 'SAME_POLICY_AS_PREVIOUS' },
    ]);
    expect(await ctx.prisma.contract.count({ where: { previousContractId: first.id } })).toBe(0);

    // The customer and vehicle already chosen stay on the scan (its version moved on).
    const res = await agent.post(`/api/scans/${scan.id}/file`, {
      ...filing,
      version: (await agent.get(`/api/scans/${scan.id}`)).body.version,
      policyNumber: 'POL-0002',
    });
    expect(res.status).toBe(200);
    const next = (await agent.get(`/api/contracts/${res.body.contractId}`)).body;
    expect(next).toMatchObject({
      status: 'ISSUED',
      policyNumber: 'POL-0002',
      premiumTotal: '1300.00',
      startDate: '2027-11-01',
      previousContract: { id: first.id },
    });
    const closed = await ctx.prisma.renewal.findUniqueOrThrow({ where: { id: open.id } });
    expect(closed).toMatchObject({ status: 'RENEWED', renewedContractId: next.id });
    // Dated by the agency clock, like every follow-up entry.
    const renewedOn = await ctx.prisma.renewalEvent.findFirstOrThrow({
      where: { renewalId: open.id, toStatus: 'RENEWED' },
    });
    expect(renewedOn.at).toEqual(ctx.clock.now());

    // The same contract is not renewed twice.
    ctx.reading = {
      text: READ('POL-0003', '218000778', '01 11 2027', '31 10 2028'),
      confidence: 80,
    };
    const again = (
      await agent.upload('/api/scans', Buffer.from('%PDF-1.7\n% encore\n'), {
        name: 'encore.pdf',
      })
    ).body;
    const twice = await agent.post(`/api/scans/${again.id}/file`, {
      version: again.version,
      seriesId: again.proposed.seriesId,
      number: '218000778',
      validFrom: '2027-11-01',
      validTo: '2028-10-31',
      policyNumber: 'POL-0003',
      customer: { id: customer.id },
      vehicle: { id: car.id },
      contract: { renew: { id: first.id, startDate: '2027-11-01', endDate: '2028-10-31' } },
      printed: {},
    });
    expect(twice.body.error.code).toBe('ALREADY_RENEWED');
  });

  it('files a new policy that replaces one the agency follows as its next contract', async () => {
    // « REMPLACEMENT DE POLICE N POL-0001 » on a sheet of policy POL-0002, as RMA prints it.
    const { agent, first, car, customer } = await setup();
    ctx.reading = {
      text: READ('POL-0002', '218000779', '01 11 2027', '31 10 2028'),
      confidence: 80,
    };
    const scan = (
      await agent.upload('/api/scans', Buffer.from('%PDF-1.7\n% remplacement\n'), {
        name: 'remplacement.pdf',
      })
    ).body;
    const matches = (query) =>
      agent.get(`/api/scans/${scan.id}/matches?${query}&seriesId=${scan.proposed.seriesId}`);
    // Not followed under its new number: the contract of the replaced policy is proposed.
    const replaced = (await matches('policyNumber=POL-0002&replacesPolicy=POL-0001')).body;
    expect(replaced.contract).toMatchObject({
      id: first.id,
      policyNumber: 'POL-0001',
      replacedPolicy: true,
    });
    expect((await matches('policyNumber=POL-0001')).body.contract.replacedPolicy).toBe(false);
    expect((await matches('policyNumber=POL-0002')).body.contract).toBeNull();

    const res = await agent.post(`/api/scans/${scan.id}/file`, {
      version: scan.version,
      seriesId: scan.proposed.seriesId,
      number: '218000779',
      validFrom: '2027-11-01',
      validTo: '2028-10-31',
      policyNumber: 'POL-0002',
      customer: { id: customer.id },
      vehicle: { id: car.id },
      contract: { renew: { id: first.id, startDate: '2027-11-01', endDate: '2028-10-31' } },
      printed: { seriesCode: '14 A', number: '218000779' },
    });
    expect(res.status).toBe(200);
    const next = (await agent.get(`/api/contracts/${res.body.contractId}`)).body;
    expect(next).toMatchObject({
      status: 'ISSUED',
      policyNumber: 'POL-0002',
      previousContract: { id: first.id },
    });
  });
});
