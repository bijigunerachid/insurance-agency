import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  REFERENCE_DOCUMENT,
  REFERENCE_PRODUCTS,
  REFERENCE_PRODUCTS_DOCUMENT,
  REFERENCE_SERIES,
  confirmReferenceConfiguration,
} from '../../src/modules/catalogue/reference.js';
import { createAuditService } from '../../src/services/audit.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const run = (username) =>
  confirmReferenceConfiguration(
    { prisma: ctx.prisma, audit: createAuditService(ctx.prisma), clock: ctx.clock },
    { username },
  );

describe('confirming the reference catalogue configuration (command)', () => {
  it('confirms the 8 models, the 3 usages, the 16 RMA 14 / CAT 91 series and the 29 products sold in the administrator’s name', async () => {
    const admin = await ctx.createUser({ username: 'directeur', role: 'ADMIN' });

    const result = await run('Directeur');
    expect(result).toEqual({
      models: { confirmed: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'P'], already: [] },
      usages: {
        confirmed: ['Tourisme', 'Transport de marchandises', 'Véhicules à deux ou trois roues'],
        already: [],
      },
      series: {
        confirmed: REFERENCE_SERIES.map(([insurer, code]) => `${insurer} ${code}`),
        already: [],
      },
      products: {
        confirmed: REFERENCE_PRODUCTS.map(([insurer, name]) => `${insurer} ${name}`),
        already: [],
      },
      missing: [],
    });
    const models = await ctx.prisma.attestationModel.findMany();
    expect(models.every((m) => m.status === 'CONFIRMED' && m.confirmedById === admin.id)).toBe(
      true,
    );
    const series = await ctx.prisma.attestationSeries.findMany({ where: { active: true } });
    expect(series).toHaveLength(16);
    expect(series.every((s) => s.confirmationRef === REFERENCE_DOCUMENT)).toBe(true);
    const events = await ctx.prisma.auditLog.findMany({
      where: { action: { in: ['attestation_model.confirmed', 'attestation_series.confirmed'] } },
    });
    const usages = await ctx.prisma.vehicleUsage.findMany({ orderBy: { label: 'asc' } });
    // The three usages the owner confirmed; "Divers" (model D), "Transport public de voyageurs"
    // (model B, CAT 91 B form of 29/10/2026) and "Assurance aux frontières" (model F, 02/11/2026)
    // wait for a manager.
    expect(usages.map((u) => [u.label, u.status, u.confirmedById])).toEqual([
      ['Assurance aux frontières', 'TO_CONFIRM', null],
      ['Divers', 'TO_CONFIRM', null],
      ['Tourisme', 'CONFIRMED', admin.id],
      ['Transport de marchandises', 'CONFIRMED', admin.id],
      ['Transport public de voyageurs', 'TO_CONFIRM', null],
      ['Véhicules à deux ou trois roues', 'CONFIRMED', admin.id],
    ]);
    const usageEvents = await ctx.prisma.auditLog.count({
      where: { action: 'vehicle_usage.confirmed' },
    });
    expect(usageEvents).toBe(3);
    expect(events).toHaveLength(24);
    expect(events[0]).toMatchObject({ actorUserId: admin.id, details: { via: 'command' } });
    // 29: passenger transport, taxis, three-wheelers and border insurance are confirmed at CAT
    // only; the 8 RMA ones stay inactive (RMA has no border product).
    const products = await ctx.prisma.product.findMany({ where: { active: true } });
    expect(products).toHaveLength(29);
    expect(
      products.every(
        (p) => p.status === 'CONFIRMED' && p.confirmationRef === REFERENCE_PRODUCTS_DOCUMENT,
      ),
    ).toBe(true);
    const productEvents = await ctx.prisma.auditLog.findMany({
      where: { action: 'product.confirmed' },
    });
    expect(productEvents).toHaveLength(29);
    expect(productEvents[0].details).toEqual({
      reference: REFERENCE_PRODUCTS_DOCUMENT,
      via: 'command',
    });

    // A second run changes nothing.
    const again = await run('directeur');
    expect(again.models).toEqual({
      confirmed: [],
      already: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'P'],
    });
    expect(again.series.confirmed).toEqual([]);
    expect(again.usages.confirmed).toEqual([]);
    expect(again.products.confirmed).toEqual([]);
    // One event per model, usage, series and product (8 + 3 + 16 + 29), none more the second time.
    expect(await ctx.prisma.auditLog.count()).toBe(56);
  });

  it('refuses an agent or an unknown account, and leaves a series whose model is unconfirmed or a product of an inactive insurer', async () => {
    await ctx.createUser({ username: 'agent.a', role: 'AGENT' });
    await expect(run('agent.a')).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    await expect(run('personne')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });

    // The model of RMA 14 C was changed in the catalogue to a model the command does not confirm.
    await ctx.owner.query(`INSERT INTO "attestation_model" ("code", "label", "source", "updatedAt")
      VALUES ('H', 'Modèle local', 'Test', now())`);
    await ctx.owner.query(
      `UPDATE "attestation_series" SET "modelCode" = 'H' WHERE "code" = '14 C'`,
    );
    // A product renamed in the catalogue is not looked for under its old name.
    await ctx.owner.query(
      `UPDATE "product" SET "name" = 'Motos et cyclomoteurs' WHERE "name" = 'Motos' AND "insurerId" = (SELECT "id" FROM "insurer" WHERE "code" = 'RMA')`,
    );
    await ctx.owner.query(`UPDATE "insurer" SET "active" = false WHERE "code" = 'CAT'`);
    await ctx.createUser({ username: 'gerant', role: 'MANAGER' });
    const result = await run('gerant');
    expect(result.missing).toEqual([
      'série RMA 14 C (modèle H non confirmé)',
      'produit RMA Motos',
      ...REFERENCE_PRODUCTS.filter(([insurer]) => insurer === 'CAT').map(
        ([, name]) => `produit CAT ${name} (assureur désactivé)`,
      ),
    ]);
    expect(result.series.confirmed).toHaveLength(15);
    // The 10 RMA products sold there, less the renamed one.
    expect(result.products.confirmed).toHaveLength(9);
  });
});
