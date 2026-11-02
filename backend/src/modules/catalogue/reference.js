import { normalizeUsername } from '../auth/usernames.js';

/**
 * The reference configuration the owner confirmed on 23/10/2026: the eight national models of
 * arrêté 213-05, the vehicle usages, the RMA 14 / CAT 91 series (one per model) and the products the
 * agency sells. Which model each usage and series has, and every product, stay editable in the
 * catalogue; this only confirms what is there now.
 */
export const REFERENCE_MODELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'P'];
export const REFERENCE_USAGES = [
  'Tourisme',
  'Transport de marchandises',
  'Véhicules à deux ou trois roues',
];
// The agency's rule (owner, 23/10/2026): RMA series are numbered 14 and CAT series 91, the letter
// being the model. The numbers may change later; they stay editable in the catalogue.
export const REFERENCE_SERIES = [
  ...REFERENCE_MODELS.map((letter) => ['RMA', `14 ${letter}`]),
  ...REFERENCE_MODELS.map((letter) => ['CAT', `91 ${letter}`]),
];
// The products the agency sells, at RMA and at CAT (owner, 23/10/2026; Auto-écoles 29/10/2026;
// border insurance 02/11/2026).
export const REFERENCE_PRODUCT_NAMES = [
  'Véhicules de tourisme',
  'Petit taxi',
  'Grand taxi',
  'Véhicules utilitaires',
  'Camions et poids lourds',
  'Flottes automobiles',
  'Assurance provisoire',
  'Motos',
  'Scooters',
  'Autres deux-roues',
  'Trois-roues et triporteurs',
  'Transport de marchandises',
  'Transport de voyageurs',
  'Transport touristique',
  'Transport du personnel',
  'Transport scolaire',
  'Autocars et autobus',
  'Auto-écoles',
  'Assurance aux frontières',
];
// Sold with CAT only: passenger transport (owner, 28/10/2026), taxis and three-wheelers (owner,
// 29/10/2026), border insurance (owner, 02/11/2026). The RMA ones stay inactive; RMA has no border
// product at all.
export const CAT_ONLY_PRODUCT_NAMES = [
  'Petit taxi',
  'Grand taxi',
  'Trois-roues et triporteurs',
  'Transport de voyageurs',
  'Transport touristique',
  'Transport du personnel',
  'Transport scolaire',
  'Autocars et autobus',
  'Assurance aux frontières',
];
export const REFERENCE_PRODUCTS = ['RMA', 'CAT'].flatMap((insurer) =>
  REFERENCE_PRODUCT_NAMES.filter(
    (name) => insurer === 'CAT' || !CAT_ONLY_PRODUCT_NAMES.includes(name),
  ).map((name) => [insurer, name]),
);
export const REFERENCE_PRODUCTS_DOCUMENT =
  'Liste des produits de l’agence, RMA et CAT (décision du gérant du 23/10/2026)';
export const REFERENCE_DOCUMENT =
  'Arrêté n° 213-05, art. 2, formulaires vierges de l’agence et règle 14 = RMA, 91 = CAT (décision du gérant du 23/10/2026)';

export class ReferenceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Confirms, in the name of `username` (an active administrator or manager), the models, usages,
 * series and products above that are still to confirm. Already confirmed entries are left as they are, so
 * the command can run again (e.g. on the production server at installation). Every
 * confirmation is audited like one made in the app.
 */
export async function confirmReferenceConfiguration({ prisma, audit, clock }, { username }) {
  const user = await prisma.user.findUnique({
    where: { username: normalizeUsername(username) },
    include: { role: { include: { permissions: true } } },
  });
  if (!user || !user.active) throw new ReferenceError('USER_NOT_FOUND');
  if (!user.role.permissions.some((p) => p.permission === 'catalogue.manage')) {
    throw new ReferenceError('NOT_ALLOWED');
  }

  return prisma.$transaction(async (tx) => {
    const confirmationBy = (reference) => ({
      status: 'CONFIRMED',
      confirmedAt: clock.now(),
      confirmedById: user.id,
      confirmationRef: reference,
      version: { increment: 1 },
    });
    const confirmation = confirmationBy(REFERENCE_DOCUMENT);
    const result = {
      models: { confirmed: [], already: [] },
      usages: { confirmed: [], already: [] },
      series: { confirmed: [], already: [] },
      products: { confirmed: [], already: [] },
      missing: [],
    };
    const recordConfirmation = (entityType, entityId, reference = REFERENCE_DOCUMENT) =>
      audit.record(
        {
          actorUserId: user.id,
          action: `${entityType}.confirmed`,
          entityType,
          entityId,
          details: { reference, via: 'command' },
        },
        tx,
      );

    // Models first: a usage or a series is confirmed only once its model is.
    for (const code of REFERENCE_MODELS) {
      const model = await tx.attestationModel.findUnique({ where: { code } });
      if (!model) {
        result.missing.push(`modèle ${code}`);
      } else if (model.status === 'CONFIRMED') {
        result.models.already.push(code);
      } else {
        await tx.attestationModel.update({ where: { id: model.id }, data: confirmation });
        await recordConfirmation('attestation_model', model.id);
        result.models.confirmed.push(code);
      }
    }
    for (const label of REFERENCE_USAGES) {
      const usage = await tx.vehicleUsage.findUnique({
        where: { label },
        include: { model: true },
      });
      if (!usage) {
        result.missing.push(`usage ${label}`);
      } else if (usage.status === 'CONFIRMED') {
        result.usages.already.push(label);
      } else if (usage.model?.status !== 'CONFIRMED') {
        result.missing.push(
          `usage ${label} (modèle ${usage.modelCode ?? 'non indiqué'} non confirmé)`,
        );
      } else {
        await tx.vehicleUsage.update({ where: { id: usage.id }, data: confirmation });
        await recordConfirmation('vehicle_usage', usage.id);
        result.usages.confirmed.push(label);
      }
    }
    for (const [insurerCode, code] of REFERENCE_SERIES) {
      const label = `${insurerCode} ${code}`;
      const series = await tx.attestationSeries.findFirst({
        where: { code, insurer: { code: insurerCode } },
        include: { model: true },
      });
      if (!series) {
        result.missing.push(`série ${label}`);
      } else if (series.status === 'CONFIRMED') {
        result.series.already.push(label);
      } else if (series.model.status !== 'CONFIRMED') {
        // Its model was changed in the catalogue to one not confirmed yet.
        result.missing.push(`série ${label} (modèle ${series.modelCode} non confirmé)`);
      } else {
        await tx.attestationSeries.update({ where: { id: series.id }, data: confirmation });
        await recordConfirmation('attestation_series', series.id);
        result.series.confirmed.push(label);
      }
    }
    for (const [insurerCode, name] of REFERENCE_PRODUCTS) {
      const label = `${insurerCode} ${name}`;
      const product = await tx.product.findFirst({
        where: { name, insurer: { code: insurerCode } },
        include: { insurer: true },
      });
      if (!product) {
        result.missing.push(`produit ${label}`);
      } else if (product.status === 'CONFIRMED') {
        result.products.already.push(label);
      } else if (!product.insurer.active) {
        result.missing.push(`produit ${label} (assureur désactivé)`);
      } else {
        await tx.product.update({
          where: { id: product.id },
          data: confirmationBy(REFERENCE_PRODUCTS_DOCUMENT),
        });
        await recordConfirmation('product', product.id, REFERENCE_PRODUCTS_DOCUMENT);
        result.products.confirmed.push(label);
      }
    }
    return result;
  });
}
