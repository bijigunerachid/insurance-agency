import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateTotpSecret, timeStep, totpCode } from '../../src/modules/auth/totp.js';
import {
  REFERENCE_PRODUCT_NAMES,
  CAT_ONLY_PRODUCT_NAMES,
} from '../../src/modules/catalogue/reference.js';
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

const patch = (client, path, body) => client.send('patch', path, body);
const items = async (client, path) => (await client.get(path)).body.items;
const insurerId = async (code) =>
  (await ctx.prisma.insurer.findUniqueOrThrow({ where: { code } })).id;
const usageByLabel = (label) => ctx.prisma.vehicleUsage.findUniqueOrThrow({ where: { label } });
const modelByCode = (code) => ctx.prisma.attestationModel.findUniqueOrThrow({ where: { code } });
async function confirmModel(client, code) {
  const model = await modelByCode(code);
  const res = await client.post(`/api/attestation-models/${model.id}/confirm`, {
    reference: `Modèle ${code} vérifié sur le formulaire`,
    version: model.version,
  });
  expect(res.status).toBe(200);
}

describe('reference data', () => {
  it('seeds the insurers, the models, usages, the RMA 14 / CAT 91 series and the register', async () => {
    const agent = await signIn('agent.a', 'AGENT');

    expect((await items(agent, '/api/insurers')).map((i) => [i.code, i.active])).toEqual([
      ['CAT', true],
      ['RMA', true],
    ]);
    // One national list of models, shared by both insurers: number and colour from arrêté
    // 213-05 art. 2 (rule L24), letters from the forms and the agency's answers.
    const models = await items(agent, '/api/attestation-models');
    expect(
      models.map((m) => [m.code, m.label, m.provisional, m.officialNumber, m.colour, m.status]),
    ).toEqual([
      ['A', 'Tourisme', false, 1, 'jaune', 'TO_CONFIRM'],
      ['B', 'Transport public de voyageurs', false, 2, 'gris clair', 'TO_CONFIRM'],
      ['C', 'Transport de marchandises', false, 3, 'bleu clair', 'TO_CONFIRM'],
      ['D', 'Divers', false, 5, 'blanc', 'TO_CONFIRM'],
      ['E', 'Véhicules à deux ou trois roues', false, 4, 'vert clair', 'TO_CONFIRM'],
      ['F', 'Assurance aux frontières', false, 8, 'violet clair', 'TO_CONFIRM'],
      ['G', 'Garagistes', false, 6, 'marron clair', 'TO_CONFIRM'],
      ['P', 'Provisoire', true, 7, 'rose', 'TO_CONFIRM'],
    ]);
    expect(models[0].source).toMatch(/^Arrêté n° 213-05 .*art\. 2 \(modèle 1, jaune\)/);
    const usages = await items(agent, '/api/vehicle-usages');
    expect(usages.map((u) => [u.label, u.model.code, u.status])).toEqual([
      // Model D (arrêté 213-05): an RMA 14 D read on the platform's PDF (24/10/2026).
      ['Divers', 'D', 'TO_CONFIRM'],
      ['Tourisme', 'A', 'TO_CONFIRM'],
      ['Transport de marchandises', 'C', 'TO_CONFIRM'],
      // Model B: printed on CAT's blank 91 B form (29/10/2026).
      ['Transport public de voyageurs', 'B', 'TO_CONFIRM'],
      ['Véhicules à deux ou trois roues', 'E', 'TO_CONFIRM'],
    ]);
    expect(usages[1].source).toMatch(/14 A/);
    // The agency's rule (owner, 23/10/2026): RMA 14 and CAT 91, one series per national model.
    const series = await items(agent, '/api/attestation-series');
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'P'];
    expect(series.map((s) => `${s.insurer.code} ${s.code} ${s.model.code}`)).toEqual([
      ...letters.map((l) => `CAT 91 ${l} ${l}`),
      ...letters.map((l) => `RMA 14 ${l} ${l}`),
    ]);
    expect(series.find((s) => s.code === '91 E').source).toMatch(/formulaire fourni/);
    expect(series.find((s) => s.code === '91 A').source).toMatch(/^Règle de l’agence : 91 = CAT/);
    const rules = await items(agent, '/api/rules');
    expect(rules).toHaveLength(62);
    expect(rules.slice(0, 3).map((r) => r.code)).toEqual(['L1', 'L2', 'L3']);
    expect(rules.map((r) => r.code).indexOf('L10')).toBe(9);
    expect(rules.filter((r) => r.status === 'CONFIRMED')).toEqual([]);
    // Rules read in the official texts on 23/10/2026 are LAW, with their article.
    const byCode = Object.fromEntries(rules.map((r) => [r.code, r]));
    for (const [code, source] of [
      ['L5', /01\/AS\/19.*art\. 132/],
      ['L6', /01\/AS\/19.*art\. 130/],
      ['L23', /213-05.*art\. 2/],
      ['L24', /213-05.*art\. 2/],
      ['L29', /213-05.*art\. 4/],
      ['L30', /01\/AS\/19.*art\. 125 et 129/],
      ['L35', /01\/AS\/19.*art\. 135/],
    ]) {
      expect(byCode[code]).toMatchObject({ status: 'LAW', insurer: null });
      expect(byCode[code].source).toMatch(source);
    }
    expect(byCode.L5.statement).toMatch(/quinze \(15\) jours suivant le mois/);
    // L16: model D only for electric vehicles that fall under « Divers » (ACAPS, 19/02/2026).
    expect(rules.find((r) => r.code === 'L16').statement).toMatch(
      /électriques relevant de la catégorie « Divers ».*Tous les véhicules électriques ne relèvent pas du modèle D/,
    );
    // The products the agency sells (owner, 23/10/2026), at RMA and at CAT, « à confirmer ».
    const products = await items(agent, '/api/products?active=all');
    expect(products).toHaveLength(36);
    expect(products.every((p) => p.status === 'TO_CONFIRM' && !p.usable)).toBe(true);
    for (const code of ['CAT', 'RMA']) {
      expect(
        products
          .filter((p) => p.insurer.code === code)
          .map((p) => p.name)
          .sort(),
      ).toEqual([...REFERENCE_PRODUCT_NAMES].sort());
    }
    expect(products.find((p) => p.name === 'Grand taxi').line).toBe('TAXI');
    // Sold with CAT only, inactive at RMA: passenger transport (owner, 28/10/2026), taxis and
    // three-wheelers (owner, 29/10/2026).
    const inactive = products.filter((p) => !p.active);
    expect(inactive.map((p) => `${p.insurer.code} ${p.name}`).sort()).toEqual(
      CAT_ONLY_PRODUCT_NAMES.map((name) => `RMA ${name}`).sort(),
    );
    const active = (code, name) =>
      products.find((p) => p.insurer.code === code && p.name === name).active;
    for (const name of ['Petit taxi', 'Grand taxi', 'Trois-roues et triporteurs']) {
      expect([active('RMA', name), active('CAT', name)]).toEqual([false, true]);
    }
  });

  it('lets every role read the catalogue but only managers and administrators change it', async () => {
    const agent = await signIn('agent.a', 'AGENT');
    const auditor = await signIn('auditor.a', 'AUDITOR');
    expect((await auditor.get('/api/rules')).status).toBe(200);

    const usage = await usageByLabel('Tourisme');
    for (const [method, path, body] of [
      ['post', '/api/vehicle-usages', { label: 'Divers', source: 'Test' }],
      ['post', '/api/attestation-models', { code: 'H', label: 'Test', source: 'Test' }],
      ['post', `/api/vehicle-usages/${usage.id}/confirm`, { reference: 'Doc', version: 1 }],
      ['patch', `/api/insurers/${await insurerId('RMA')}`, { active: false, version: 1 }],
      ['post', '/api/rules', {}],
    ]) {
      expect((await agent.send(method, path, body)).status).toBe(403);
      expect((await auditor.send(method, path, body)).status).toBe(403);
    }
    expect((await agent.get('/api/vehicle-usages')).status).toBe(200);
  });
});

describe('insurers (rule L1)', () => {
  it('refuses a third active insurer unless the limit is explicitly confirmed', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const third = { code: 'axa', name: 'Assureur test' };

    const refused = await manager.post('/api/insurers', third);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({
      code: 'INSURER_LIMIT',
      details: { activeCount: 2, max: 2 },
    });

    const created = await manager.post('/api/insurers', { ...third, confirmLimit: true });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ code: 'AXA', active: true });
    const [event] = await ctx.prisma.auditLog.findMany({ where: { action: 'insurer.created' } });
    expect(event.details).toEqual({ code: 'AXA', limitOverridden: true });
  });

  it('applies the limit when an insurer is activated again', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const rma = await insurerId('RMA');
    const off = await patch(manager, `/api/insurers/${rma}`, { active: false, version: 1 });
    expect(off.body.active).toBe(false);
    await manager.post('/api/insurers', { code: 'AXA', name: 'Assureur test' });

    const back = await patch(manager, `/api/insurers/${rma}`, { active: true, version: 2 });
    expect(back.status).toBe(409);
    expect(back.body.error.code).toBe('INSURER_LIMIT');
    // Renaming does not count as activating.
    const renamed = await patch(manager, `/api/insurers/${rma}`, { name: 'RMA', version: 2 });
    expect(renamed.status).toBe(200);
  });

  it('refuses a duplicate code or name and stale versions', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const dup = await manager.post('/api/insurers', {
      code: 'rma',
      name: 'Autre',
      confirmLimit: true,
    });
    expect(dup.body.error.code).toBe('DUPLICATE_INSURER');
    const stale = await patch(manager, `/api/insurers/${await insurerId('CAT')}`, {
      name: 'CAT',
      version: 7,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });
});

describe('vehicle usages (rule L16)', () => {
  it('records who confirmed a usage, from which document, and audits it', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    await confirmModel(manager, 'A');
    const usage = await usageByLabel('Tourisme');
    const res = await manager.post(`/api/vehicle-usages/${usage.id}/confirm`, {
      reference: 'Attestation RMA 14 A, vérifiée par le gérant',
      version: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'CONFIRMED',
      confirmation: {
        reference: 'Attestation RMA 14 A, vérifiée par le gérant',
        by: { displayName: 'Utilisateur manager.a' },
      },
    });
    const again = await manager.post(`/api/vehicle-usages/${usage.id}/confirm`, {
      reference: 'Encore',
      version: 2,
    });
    expect(again.body.error.code).toBe('ALREADY_CONFIRMED');
    expect(await ctx.auditActions()).toContain('vehicle_usage.confirmed');
  });

  it('makes a confirmed usage "to confirm" again when its label changes, not its source', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    await confirmModel(manager, 'A');
    const usage = await usageByLabel('Tourisme');
    await manager.post(`/api/vehicle-usages/${usage.id}/confirm`, { reference: 'Doc', version: 1 });

    const source = await patch(manager, `/api/vehicle-usages/${usage.id}`, {
      source: 'Formulaire RMA 14 A, édition 08/2026',
      version: 2,
    });
    expect(source.body.status).toBe('CONFIRMED');

    const label = await patch(manager, `/api/vehicle-usages/${usage.id}`, {
      label: 'Tourisme (véhicules particuliers)',
      version: 3,
    });
    expect(label.body).toMatchObject({ status: 'TO_CONFIRM', confirmation: null });
    const event = await ctx.prisma.auditLog.findFirst({
      where: { action: 'vehicle_usage.updated' },
      orderBy: { id: 'desc' },
    });
    expect(event.details).toEqual({ fields: ['label'], confirmationCleared: true });
  });

  it('lets a vehicle use only a confirmed, active usage, and keeps it when deactivated', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const owner = (
      await manager.post('/api/customers', { type: 'BUSINESS', legalName: 'Transports Test' })
    ).body;
    const usage = await usageByLabel('Transport de marchandises');
    const vehicle = {
      ownerId: owner.id,
      registration: '54321-A-1',
      category: 'COMMERCIAL',
      make: 'Isuzu',
      model: 'NPR',
      usageId: usage.id,
    };

    const unconfirmed = await manager.post('/api/vehicles', vehicle);
    expect(unconfirmed.status).toBe(400);
    expect(unconfirmed.body.error.details).toEqual([{ path: 'usageId', rule: 'USAGE_NOT_USABLE' }]);

    await confirmModel(manager, 'C');
    await manager.post(`/api/vehicle-usages/${usage.id}/confirm`, { reference: 'Doc', version: 1 });
    const created = await manager.post('/api/vehicles', vehicle);
    expect(created.status).toBe(201);
    expect(created.body.usage).toEqual({ id: usage.id, label: 'Transport de marchandises' });

    await patch(manager, `/api/vehicle-usages/${usage.id}`, { active: false, version: 2 });
    const kept = await manager.get(`/api/vehicles/${created.body.id}`);
    expect(kept.body.usage.label).toBe('Transport de marchandises');
    const other = await manager.post('/api/vehicles', { ...vehicle, registration: '54321-A-2' });
    expect(other.status).toBe(400);
  });

  it('takes its attestation model: never the provisional one, and confirmed before the usage', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const noModel = await manager.post('/api/vehicle-usages', { label: 'Taxi', source: 'Test' });
    expect(noModel.body.model).toBeNull();
    const refused = await manager.post(`/api/vehicle-usages/${noModel.body.id}/confirm`, {
      reference: 'Doc',
      version: 1,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('MODEL_NOT_CONFIRMED');

    for (const [modelCode, rule] of [
      ['P', 'MODEL_PROVISIONAL'],
      ['Z', 'UNKNOWN_MODEL'],
    ]) {
      const res = await patch(manager, `/api/vehicle-usages/${noModel.body.id}`, {
        modelCode,
        version: 1,
      });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([{ path: 'modelCode', rule }]);
    }

    const tourisme = await usageByLabel('Tourisme');
    const early = await manager.post(`/api/vehicle-usages/${tourisme.id}/confirm`, {
      reference: 'Doc',
      version: 1,
    });
    expect(early.body.error.code).toBe('MODEL_NOT_CONFIRMED');
    await confirmModel(manager, 'A');
    await manager.post(`/api/vehicle-usages/${tourisme.id}/confirm`, {
      reference: 'Doc',
      version: 1,
    });
    // Another model is another usage: the confirmation is cleared.
    const moved = await patch(manager, `/api/vehicle-usages/${tourisme.id}`, {
      modelCode: 'b',
      version: 2,
    });
    expect(moved.body).toMatchObject({ model: { code: 'B' }, status: 'TO_CONFIRM' });
  });
});

describe('attestation models', () => {
  it('adds a model, keeps its letter fixed and clears the confirmation when renamed', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const created = await manager.post('/api/attestation-models', {
      code: 'h',
      label: 'Modèle test',
      source: 'Circulaire test',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ code: 'H', provisional: false, status: 'TO_CONFIRM' });
    expect(await ctx.auditActions()).toContain('attestation_model.created');

    for (const body of [
      { code: 'A', label: 'Autre', source: 'x' },
      { code: 'J', label: 'Tourisme', source: 'x' },
    ]) {
      expect((await manager.post('/api/attestation-models', body)).body.error.code).toBe(
        'DUPLICATE_MODEL',
      );
    }
    // The official number is unique too.
    const sameNumber = await manager.post('/api/attestation-models', {
      code: 'J',
      label: 'Autre modèle',
      officialNumber: 1,
      source: 'x',
    });
    expect(sameNumber.body.error.code).toBe('DUPLICATE_MODEL');
    const numbered = await patch(manager, `/api/attestation-models/${created.body.id}`, {
      officialNumber: 9,
      colour: 'orange',
      version: 1,
    });
    expect(numbered.body).toMatchObject({ officialNumber: 9, colour: 'orange', version: 2 });
    const letter = await patch(manager, `/api/attestation-models/${created.body.id}`, {
      code: 'J',
      version: 2,
    });
    expect(letter.status).toBe(400);

    await confirmModel(manager, 'H');
    const renamed = await patch(manager, `/api/attestation-models/${created.body.id}`, {
      label: 'Modèle test renommé',
      version: 3,
    });
    expect(renamed.body).toMatchObject({ status: 'TO_CONFIRM', confirmation: null });
  });
});

describe('attestation series', () => {
  it('writes codes as on the forms and refuses a series twice for one insurer', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const cat = await insurerId('CAT');
    const series = (code) =>
      manager.post('/api/attestation-series', { insurerId: cat, code, source: 'Test' });

    const created = await series('92a');
    expect(created.status).toBe(201);
    // The letter is the model, shared with RMA's 14 A.
    expect(created.body).toMatchObject({
      code: '92 A',
      model: { code: 'A', label: 'Tourisme', provisional: false },
      status: 'TO_CONFIRM',
    });

    expect((await series('92  A')).body.error.code).toBe('DUPLICATE_SERIES');
    const unknown = await series('91 X');
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.details).toEqual([{ path: 'code', rule: 'UNKNOWN_MODEL' }]);
    const twoLetters = await series('91 AB');
    expect(twoLetters.body.error.details).toEqual([{ path: 'code', rule: 'INVALID_SERIES_CODE' }]);

    const g = await modelByCode('G');
    await patch(manager, `/api/attestation-models/${g.id}`, { active: false, version: 1 });
    expect((await series('92 G')).body.error.details).toEqual([
      { path: 'code', rule: 'MODEL_INACTIVE' },
    ]);

    // The model is configuration (owner, 23/10/2026): a new code keeps the model…
    const renamed = await patch(manager, `/api/attestation-series/${created.body.id}`, {
      code: '92 C',
      version: 1,
    });
    expect(renamed.body).toMatchObject({ code: '92 C', model: { code: 'A' } });
    // …which changes only when it is chosen, and is audited.
    const moved = await patch(manager, `/api/attestation-series/${created.body.id}`, {
      modelCode: 'c',
      version: 2,
    });
    expect(moved.body.model.code).toBe('C');
    const provisional = await patch(manager, `/api/attestation-series/${created.body.id}`, {
      modelCode: 'Z',
      version: 3,
    });
    expect(provisional.body.error.details).toEqual([{ path: 'modelCode', rule: 'UNKNOWN_MODEL' }]);

    // A series may also be created with a model other than its letter.
    const other = await manager.post('/api/attestation-series', {
      insurerId: cat,
      code: '91 X',
      modelCode: 'D',
      source: 'Test',
    });
    expect(other.status).toBe(201);
    expect(other.body).toMatchObject({ code: '91 X', model: { code: 'D', label: 'Divers' } });
    const [event] = await ctx.prisma.auditLog.findMany({
      where: { action: 'attestation_series.created', entityId: other.body.id },
    });
    expect(event.details).toEqual({ code: '91 X', model: 'D' });
  });

  it('confirms a series, provisional ones included, only once its model is confirmed', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    for (const [code, model] of [
      ['14 A', 'A'],
      ['91 P', 'P'],
    ]) {
      const series = await ctx.prisma.attestationSeries.findFirstOrThrow({ where: { code } });
      const early = await manager.post(`/api/attestation-series/${series.id}/confirm`, {
        reference: 'Doc',
        version: 1,
      });
      expect(early.status).toBe(409);
      expect(early.body.error.code).toBe('MODEL_NOT_CONFIRMED');

      await confirmModel(manager, model);
      const ok = await manager.post(`/api/attestation-series/${series.id}/confirm`, {
        reference: 'Doc',
        version: 1,
      });
      expect(ok.body.status).toBe('CONFIRMED');
    }

    // Another model for a confirmed series asks for a new confirmation; its code does not.
    const series = await ctx.prisma.attestationSeries.findFirstOrThrow({ where: { code: '14 A' } });
    const sourceOnly = await patch(manager, `/api/attestation-series/${series.id}`, {
      source: 'Attestation RMA 14 A, édition 2026',
      version: 2,
    });
    expect(sourceOnly.body.status).toBe('CONFIRMED');
    const remodelled = await patch(manager, `/api/attestation-series/${series.id}`, {
      modelCode: 'P',
      version: 3,
    });
    expect(remodelled.body).toMatchObject({ model: { code: 'P' }, status: 'TO_CONFIRM' });
    const [event] = await ctx.prisma.auditLog.findMany({
      where: { action: 'attestation_series.updated', entityId: series.id },
      orderBy: { id: 'desc' },
    });
    expect(event.details).toEqual({ fields: ['modelCode'], confirmationCleared: true });
  });
});

describe('products', () => {
  const product = (insurer, overrides = {}) => ({
    insurerId: insurer,
    line: 'TAXI',
    name: 'RAHTI',
    description: 'Pack taxi',
    source: 'cat.co.ma/fr/nos-packs (règle C1)',
    ...overrides,
  });

  it('cannot be used until confirmed, and editing it requires a new confirmation', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const created = await manager.post('/api/products', product(await insurerId('CAT')));
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ status: 'TO_CONFIRM', usable: false });

    const { id } = created.body;
    const confirmed = await manager.post(`/api/products/${id}/confirm`, {
      reference: 'Liste des produits CAT remise à l’agence',
      version: 1,
    });
    expect(confirmed.body).toMatchObject({ status: 'CONFIRMED', usable: true });

    const off = await patch(manager, `/api/products/${id}`, { active: false, version: 2 });
    expect(off.body).toMatchObject({ status: 'CONFIRMED', usable: false });

    const edited = await patch(manager, `/api/products/${id}`, {
      description: 'Pack taxi, plafonds modifiés',
      version: 3,
    });
    expect(edited.body).toMatchObject({ status: 'TO_CONFIRM', usable: false, confirmation: null });
  });

  it('filters products and refuses duplicates and inactive insurers', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const cat = await insurerId('CAT');
    const rma = await insurerId('RMA');
    await manager.post('/api/products', product(cat));
    await manager.post('/api/products', product(rma, { line: 'CAR', name: 'Basic’OTO' }));

    // The agency's 18 products are at each insurer too.
    const atCat = await items(manager, `/api/products?insurerId=${cat}`);
    expect(atCat.every((p) => p.insurer.code === 'CAT')).toBe(true);
    expect(atCat.map((p) => p.name)).toContain('RAHTI');
    expect(atCat).toHaveLength(19);
    const cars = await items(manager, '/api/products?line=CAR');
    expect(cars.every((p) => p.line === 'CAR')).toBe(true);
    expect(cars.map((p) => p.name)).toContain('Basic’OTO');
    expect(cars.map((p) => p.name)).not.toContain('RAHTI');
    expect((await items(manager, '/api/products?q=rah')).map((p) => p.name)).toEqual(['RAHTI']);

    const dup = await manager.post('/api/products', product(cat));
    expect(dup.body.error.code).toBe('DUPLICATE_PRODUCT');
    // The same name at the other insurer is another product.
    expect((await manager.post('/api/products', product(rma))).status).toBe(201);

    await patch(manager, `/api/insurers/${cat}`, { active: false, version: 1 });
    const inactive = await manager.post('/api/products', product(cat, { name: 'MIHANI' }));
    expect(inactive.body.error.code).toBe('INSURER_INACTIVE');
  });

  it('validates the fields', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const res = await manager.post('/api/products', {
      insurerId: await insurerId('CAT'),
      line: 'BOAT',
      name: ' ',
      source: '',
      price: 325,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.path).sort()).toEqual([
      '',
      'line',
      'name',
      'source',
    ]);
  });
});

describe('rules register', () => {
  const rule = (code) => ctx.prisma.insurerRule.findUniqueOrThrow({ where: { code } });

  it('filters by insurer, status and text without accents', async () => {
    const agent = await signIn('agent.a', 'AGENT');
    const cat = await items(agent, '/api/rules?insurer=CAT&status=UNKNOWN');
    expect(cat.map((r) => r.code)).toEqual(['C8', 'C9']);
    const general = await items(agent, '/api/rules?insurer=GENERAL');
    expect(general.every((r) => r.code.startsWith('L'))).toBe(true);
    expect(general).toHaveLength(40);
    const text = await items(agent, '/api/rules?q=evenements%20catastrophiques');
    expect(text.map((r) => r.code)).toEqual(['L8', 'L37', 'L38', 'C12']);
  });

  it('records each review in an append-only history; CONFIRMED needs a document', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const l23 = await rule('L23');

    const noRef = await manager.post(`/api/rules/${l23.id}/review`, {
      status: 'CONFIRMED',
      note: 'Vu avec le gérant',
      version: 1,
    });
    expect(noRef.status).toBe(400);
    expect(noRef.body.error.details).toEqual([{ path: 'reference', rule: 'REQUIRED' }]);

    const ok = await manager.post(`/api/rules/${l23.id}/review`, {
      status: 'CONFIRMED',
      note: 'Mention présente sur les deux modèles',
      reference: 'Attestations provisoires RMA 14 P et CAT 91 P',
      version: 1,
    });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      status: 'CONFIRMED',
      reviewedBy: { displayName: 'Utilisateur manager.a' },
      reviews: [
        {
          fromStatus: 'LAW',
          toStatus: 'CONFIRMED',
          reference: 'Attestations provisoires RMA 14 P et CAT 91 P',
        },
      ],
    });
    const [event] = await ctx.prisma.auditLog.findMany({ where: { action: 'rule.reviewed' } });
    expect(event.details).toEqual({ code: 'L23', from: 'LAW', to: 'CONFIRMED' });

    // The confirmed text cannot be edited without a review first.
    const edit = await patch(manager, `/api/rules/${l23.id}`, { effect: 'Autre', version: 2 });
    expect(edit.body.error.code).toBe('RULE_CONFIRMED');

    await expect(runtime.query('UPDATE "rule_review" SET "note" = \'x\'')).rejects.toThrow(
      /permission denied/,
    );
    await expect(ctx.owner.query('DELETE FROM "rule_review"')).rejects.toThrow(/append-only/);
  });

  it('adds an agency rule and edits it while it is not confirmed', async () => {
    const manager = await signIn('manager.a', 'MANAGER');
    const created = await manager.post('/api/rules', {
      code: 'a1',
      statement: 'Les attestations vierges sont rangées dans l’armoire fermée.',
      effect: 'Rappel affiché lors de la réception d’un lot.',
      source: 'Procédure interne de l’agence',
      status: 'UNKNOWN',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ code: 'A1', insurer: null, reviews: [] });

    const confirmedAtOnce = await manager.post('/api/rules', {
      code: 'A2',
      statement: 'x',
      effect: 'x',
      source: 'x',
      status: 'CONFIRMED',
    });
    expect(confirmedAtOnce.status).toBe(400);

    const dup = await manager.post('/api/rules', {
      code: 'L1',
      statement: 'x',
      effect: 'x',
      source: 'x',
      status: 'LAW',
    });
    expect(dup.body.error.code).toBe('DUPLICATE_RULE');

    const edited = await patch(manager, `/api/rules/${created.body.id}`, {
      effect: 'Rappel lors de la réception d’un lot d’attestations.',
      version: 1,
    });
    expect(edited.body.effect).toBe('Rappel lors de la réception d’un lot d’attestations.');
  });
});

describe('catalogue database protections', () => {
  it('lets the runtime role read and write but never delete catalogue rows', async () => {
    for (const table of [
      'insurer',
      'attestation_model',
      'vehicle_usage',
      'attestation_series',
      'product',
      'insurer_rule',
    ]) {
      await expect(runtime.query(`DELETE FROM "${table}"`)).rejects.toThrow(/permission denied/);
    }
  });

  it('refuses a confirmed entry without document, and keeps a model letter fixed', async () => {
    await expect(
      ctx.owner.query(`UPDATE "vehicle_usage" SET "status" = 'CONFIRMED'`),
    ).rejects.toThrow(/vehicle_usage_confirmation/);
    await expect(
      ctx.owner.query(`UPDATE "attestation_model" SET "code" = 'Q' WHERE "code" = 'G'`),
    ).rejects.toThrow(/cannot change/);
    const reviewer = await ctx.createUser({ username: 'manager.db', role: 'MANAGER' });
    const rule = await ctx.prisma.insurerRule.findUniqueOrThrow({ where: { code: 'L1' } });
    await expect(
      runtime.query(
        `INSERT INTO "rule_review" ("ruleId", "fromStatus", "toStatus", "note", "reviewerId")
         VALUES ($1, 'LAW', 'CONFIRMED', 'Sans document', $2)`,
        [rule.id, reviewer.id],
      ),
    ).rejects.toThrow(/rule_review_confirmed_reference/);
  });
});
