import { expect } from 'vitest';
import { generateTotpSecret, timeStep, totpCode } from '../../src/modules/auth/totp.js';

/**
 * Shared setup of the contract and stock tests: users, a confirmed catalogue (models A, C, P,
 * usages, RMA 14 A / 14 C / 14 P and CAT 91 P, one confirmed product per insurer), a customer
 * with vehicles, and contracts issued through the API.
 */
export function contractFixtures(ctx) {
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

  const patch = (client, path, body) => client.send('patch', path, body);
  const insurer = (code) => ctx.prisma.insurer.findUniqueOrThrow({ where: { code } });
  const series = async (insurerCode, code) =>
    ctx.prisma.attestationSeries.findFirstOrThrow({
      where: { code, insurer: { code: insurerCode } },
    });

  /** Confirms what a contract needs in the catalogue, as a manager would from the forms. */
  async function confirm(manager, path, row) {
    const res = await manager.post(`${path}/${row.id}/confirm`, {
      reference: 'Formulaire synthétique',
      version: row.version,
    });
    expect(res.status).toBe(200);
  }

  async function prepareCatalogue(manager) {
    for (const code of ['A', 'C', 'P']) {
      await confirm(
        manager,
        '/api/attestation-models',
        await ctx.prisma.attestationModel.findUniqueOrThrow({ where: { code } }),
      );
    }
    for (const label of ['Tourisme', 'Transport de marchandises']) {
      await confirm(
        manager,
        '/api/vehicle-usages',
        await ctx.prisma.vehicleUsage.findUniqueOrThrow({ where: { label } }),
      );
    }
    for (const [ins, code] of [
      ['RMA', '14 A'],
      ['RMA', '14 C'],
      ['RMA', '14 P'],
      ['CAT', '91 P'],
    ]) {
      await confirm(manager, '/api/attestation-series', await series(ins, code));
    }
    const products = {};
    for (const code of ['RMA', 'CAT']) {
      const created = await manager.post('/api/products', {
        insurerId: (await insurer(code)).id,
        line: 'CAR',
        name: `Produit synthétique ${code}`,
        source: 'Liste synthétique',
      });
      await confirm(manager, '/api/products', created.body);
      products[code] = created.body.id;
    }
    const draft = await manager.post('/api/products', {
      insurerId: (await insurer('RMA')).id,
      line: 'CAR',
      name: 'Produit non confirmé',
      source: 'Liste synthétique',
    });
    products.unconfirmed = draft.body.id;
    return products;
  }

  async function customerWithVehicles(client, name = 'Sara') {
    const customer = (
      await client.post('/api/customers', { type: 'INDIVIDUAL', firstName: name, lastName: 'Test' })
    ).body;
    const tourisme = await ctx.prisma.vehicleUsage.findUniqueOrThrow({
      where: { label: 'Tourisme' },
    });
    const vehicle = async (registration, usageId) =>
      (
        await client.post('/api/vehicles', {
          ownerId: customer.id,
          registration,
          category: 'CAR',
          make: 'Dacia',
          model: 'Logan',
          ...(usageId ? { usageId } : {}),
        })
      ).body;
    return {
      customer,
      car: await vehicle(`${name.length}1111-A-6`, tourisme.id),
      noUsage: await vehicle(`${name.length}2222-A-6`),
    };
  }

  const contractBody = (customer, productId, vehicleIds, overrides = {}) => ({
    customerId: customer.id,
    productId,
    startDate: '2026-11-01',
    endDate: '2027-10-31',
    premiumTotal: '1 234,50',
    tacitRenewal: true,
    noticeDays: 30,
    vehicleIds,
    ...overrides,
  });

  /** Draft → sent to the insurer → issued with the insurer's policy number. */
  async function issue(client, contract, policyNumber = 'POL-0001') {
    const sent = await client.post(`/api/contracts/${contract.id}/transition`, {
      to: 'AWAITING_INSURER',
      version: contract.version,
    });
    expect(sent.status).toBe(200);
    const issued = await client.post(`/api/contracts/${contract.id}/transition`, {
      to: 'ISSUED',
      policyNumber,
      insurerReference: 'Courriel de l’assureur du 23/10/2026',
      version: sent.body.version,
    });
    expect(issued.status).toBe(200);
    return issued.body;
  }

  return {
    signIn,
    patch,
    insurer,
    series,
    confirm,
    prepareCatalogue,
    customerWithVehicles,
    contractBody,
    issue,
  };
}
