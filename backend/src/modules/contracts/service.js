import { Prisma } from '../../generated/prisma/client.ts';
import { nextCounterValue } from '../../services/counter.js';
import { HttpError } from '../../utils/httpError.js';
import { normalizeRegistration } from '../../utils/identifiers.js';
import { pageResult, toSkipTake } from '../../utils/pagination.js';
import { todayIn } from '../../utils/time.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { displayNameOf } from '../customers/service.js';
import { cancelStockForm, useStockForm } from '../stock/service.js';

const notFound = (what = 'Contrat') => new HttpError(404, 'NOT_FOUND', `${what} introuvable.`);
const conflict = () =>
  new HttpError(
    409,
    'VERSION_CONFLICT',
    'Cet élément a été modifié entre-temps. Rechargez la page et recommencez.',
  );
const invalid = (path, rule) =>
  new HttpError(400, 'VALIDATION_ERROR', 'Données invalides.', [{ path, rule }]);
const notEditable = () =>
  new HttpError(409, 'NOT_EDITABLE', 'Seul un contrat en préparation peut être modifié.');

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);
const money = (decimal) => (decimal === null || decimal === undefined ? null : decimal.toFixed(2));

/**
 * What the contract owes: the insurer premium plus its avenants' amounts. Null when neither is
 * known (an avenant may be the only amount known for a contract made before the app).
 */
export function dueOf({ premiumTotal, amendmentsTotal }) {
  const amendments = amendmentsTotal ?? 0;
  if (premiumTotal === null && Number(amendments) === 0) return null;
  return premiumTotal === null ? new Prisma.Decimal(amendments) : premiumTotal.plus(amendments);
}
/** The same in SQL, for a contract aliased "c". */
export const DUE_SQL = Prisma.sql`(coalesce(c."premiumTotal", 0) + c."amendmentsTotal")`;
export const DUE_KNOWN_SQL = Prisma.sql`(c."premiumTotal" IS NOT NULL OR c."amendmentsTotal" > 0)`;
/**
 * A balance still owed this many days after the contract's start is one to chase (owner,
 * 29/10/2026: the agency had not fixed the delay; 15 days proposed).
 */
export const LONG_UNPAID_DAYS = 15;

/** Same day next month, or the month's last day (as PostgreSQL adds "1 month"). */
export function addOneMonth(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

/**
 * Allowed status changes (docs/data-model.md §3.2) and what each one needs. `manager`:
 * the change records an insurer decision on an issued contract (contracts.terminate).
 */
const TRANSITIONS = {
  'DRAFT>AWAITING_INSURER': { needs: [] },
  'AWAITING_INSURER>DRAFT': { needs: ['reason'] },
  'AWAITING_INSURER>ISSUED': { needs: ['policyNumber', 'insurerReference'] },
  'ISSUED>SUSPENDED': { needs: ['insurerReference', 'effectiveDate'], manager: true },
  'SUSPENDED>ISSUED': { needs: ['insurerReference', 'effectiveDate'], manager: true },
  'DRAFT>CANCELLED': { needs: ['reason'] },
  'AWAITING_INSURER>CANCELLED': { needs: ['reason'] },
  'ISSUED>CANCELLED': { needs: ['reason', 'insurerReference', 'effectiveDate'], manager: true },
  'SUSPENDED>CANCELLED': { needs: ['reason', 'insurerReference', 'effectiveDate'], manager: true },
};

const customerSelect = {
  select: { id: true, ref: true, type: true, firstName: true, lastName: true, legalName: true },
};
const userName = { select: { id: true, displayName: true } };
const modelSelect = {
  select: { code: true, label: true, provisional: true, officialNumber: true, colour: true },
};
const detailInclude = {
  customer: customerSelect,
  product: { select: { id: true, name: true, line: true, insurerCode: true } },
  insurer: { select: { id: true, code: true, name: true } },
  vehicles: {
    where: { removedAt: null },
    orderBy: { addedAt: 'asc' },
    include: {
      vehicle: {
        select: {
          id: true,
          registration: true,
          make: true,
          model: true,
          category: true,
          usage: { select: { id: true, label: true, modelCode: true } },
          insurerUsage: { select: { id: true, label: true } },
        },
      },
    },
  },
  statusChanges: { orderBy: { id: 'desc' }, include: { user: userName } },
  previousContract: { select: { id: true, ref: true } },
  nextContract: { select: { id: true, ref: true } },
  attestations: {
    orderBy: [{ createdAt: 'desc' }],
    include: {
      series: { select: { id: true, code: true, model: modelSelect } },
      vehicle: { select: { id: true, registration: true } },
      duplicateOf: { select: { id: true, number: true } },
      cancelledBy: userName,
      createdBy: userName,
      replacedBy: { select: { id: true, number: true, effectiveDate: true } },
      returnedBy: userName,
    },
  },
  amendments: {
    orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
    include: {
      previousVehicle: { select: { id: true, registration: true, make: true, model: true } },
      vehicle: { select: { id: true, registration: true, make: true, model: true } },
      attestation: { select: { id: true, number: true, series: { select: { code: true } } } },
      createdBy: userName,
    },
  },
};
const listInclude = {
  customer: customerSelect,
  product: { select: { id: true, name: true } },
  insurer: { select: { id: true, code: true, name: true } },
  vehicles: {
    where: { removedAt: null },
    select: { vehicle: { select: { id: true, registration: true } } },
  },
};

function customerView(row) {
  return { id: row.id, ref: row.ref, displayName: displayNameOf(row) };
}

/** Calculated, never stored: where today falls in the cover period of an issued contract. */
function periodOf(row, today) {
  if (row.status !== 'ISSUED') return null;
  const start = fromDate(row.startDate);
  const end = fromDate(row.endDate);
  if (today < start) return 'UPCOMING';
  return today > end ? 'EXPIRED' : 'ACTIVE';
}

function summaryView(row, today) {
  return {
    id: row.id,
    ref: row.ref,
    status: row.status,
    period: periodOf(row, today),
    customer: customerView(row.customer),
    product: row.product,
    insurer: row.insurer,
    policyNumber: row.policyNumber,
    startDate: fromDate(row.startDate),
    endDate: fromDate(row.endDate),
    vehicles: row.vehicles.map((link) => link.vehicle),
  };
}

function attestationView(row) {
  return {
    id: row.id,
    number: row.number,
    series: { id: row.series.id, code: row.series.code, model: row.series.model },
    vehicle: row.vehicle,
    provisional: row.provisional,
    validFrom: fromDate(row.validFrom),
    validTo: fromDate(row.validTo),
    medium: row.medium,
    coverNoteRef: row.coverNoteRef,
    duplicateOf: row.duplicateOf ?? null,
    cancelled: row.cancelledAt
      ? { at: row.cancelledAt, by: row.cancelledBy, reason: row.cancelReason }
      : null,
    // Replaced by an avenant's attestation; the paper is expected back at the agency.
    replaced: row.replacedBy
      ? {
          amendmentId: row.replacedBy.id,
          number: row.replacedBy.number,
          effectiveDate: fromDate(row.replacedBy.effectiveDate),
          returned: row.returnedAt ? { at: row.returnedAt, by: row.returnedBy } : null,
        }
      : null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    version: row.version,
  };
}

function detailView(row, today) {
  return {
    ...summaryView(row, today),
    vehicles: row.vehicles.map((link) => ({ ...link.vehicle, addedAt: link.addedAt })),
    insurerReference: row.insurerReference,
    premiumTotal: money(row.premiumTotal),
    amendmentsTotal: money(row.amendmentsTotal),
    amountDue: money(dueOf(row)),
    // As printed on the insurer's sheet (read-only), or an empty list.
    guarantees: row.guarantees ?? [],
    formula: row.formula,
    tacitRenewal: row.tacitRenewal,
    noticeDays: row.noticeDays,
    attestations: row.attestations.map(attestationView),
    amendments: row.amendments.map((a) => ({
      id: a.id,
      kind: a.kind,
      number: a.number,
      effectiveDate: fromDate(a.effectiveDate),
      amount: money(a.amount),
      insurerReference: a.insurerReference,
      previousVehicle: a.previousVehicle,
      vehicle: a.vehicle,
      previousRegistration: a.previousRegistration,
      registration: a.registration,
      attestation: {
        id: a.attestation.id,
        number: a.attestation.number,
        series: a.attestation.series.code,
      },
      createdBy: a.createdBy,
      createdAt: a.createdAt,
    })),
    history: row.statusChanges.map((change) => ({
      id: String(change.id),
      from: change.fromStatus,
      to: change.toStatus,
      reason: change.reason,
      insurerReference: change.insurerReference,
      effectiveDate: fromDate(change.effectiveDate),
      by: change.user,
      at: change.at,
    })),
    // Renewal chain: the contract this one renews and the one that renews it.
    previousContract: row.previousContract ?? null,
    nextContract: row.nextContract ?? null,
    createdAt: row.createdAt,
    version: row.version,
  };
}

/**
 * Is the policy number used by another contract of the insurer, outside the renewal chain of
 * `contractId` (or of `previousContractId` for a contract not saved yet)? A renewal may keep its
 * number (owner, 24/10/2026). The database function is the one its trigger uses.
 */
export async function policyTaken(client, insurerId, policyNumber, contractId, previousContractId) {
  const [row] = await client.$queryRaw`
    SELECT "contract_policy_taken"(${insurerId}::uuid, ${policyNumber}, ${contractId ?? null}::uuid,
      ${previousContractId ?? null}::uuid) AS "taken"`;
  return row.taken;
}

export function createContractsService({ prisma, audit, clock, config }) {
  const today = () => todayIn(config.APP_TIMEZONE, clock.now());
  const record = (tx, auth, request, action, entityId, details) =>
    audit.record(
      { actorUserId: auth.user.id, action, entityType: 'contract', entityId, request, details },
      tx,
    );

  async function load(client, id) {
    const row = await client.contract.findUnique({ where: { id }, include: detailInclude });
    if (!row) throw notFound();
    return row;
  }

  async function bumpVersion(tx, id, version, data = {}) {
    const { count } = await tx.contract.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) throw conflict();
  }

  /** A contract only uses an active, confirmed product of an active insurer (catalogue rule). */
  async function usableProduct(tx, productId) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      include: { insurer: { select: { active: true } } },
    });
    if (!product || !product.active || product.status !== 'CONFIRMED' || !product.insurer.active) {
      throw invalid('productId', 'PRODUCT_NOT_USABLE');
    }
    return product;
  }

  /** Every vehicle belongs to the contract's customer and is not archived. */
  async function assertVehiclesOf(tx, vehicleIds, customerId) {
    const vehicles = await tx.vehicle.findMany({
      where: { id: { in: vehicleIds } },
      select: { id: true, ownerId: true, archivedAt: true },
    });
    for (const id of vehicleIds) {
      const vehicle = vehicles.find((v) => v.id === id);
      if (!vehicle || vehicle.ownerId !== customerId) {
        throw invalid('vehicleIds', 'VEHICLE_NOT_OF_CUSTOMER');
      }
      if (vehicle.archivedAt) throw invalid('vehicleIds', 'VEHICLE_ARCHIVED');
    }
  }

  function assertDates(startDate, endDate) {
    if (endDate <= startDate) throw invalid('endDate', 'END_BEFORE_START');
  }

  const duplicatePolicy = () =>
    new HttpError(
      409,
      'DUPLICATE_POLICY',
      'Cet assureur a déjà un contrat avec ce numéro de police.',
    );
  const duplicateAttestation = () =>
    new HttpError(409, 'DUPLICATE_ATTESTATION', 'Cette attestation est déjà enregistrée.');
  const duplicateAmendment = () =>
    new HttpError(409, 'DUPLICATE_AMENDMENT', 'Cet avenant est déjà enregistré.');

  /** A unique index refused the row: a concurrent request did the same thing first. */
  const mapUnique = (err, error) => (err?.code === 'P2002' ? error() : err);

  /**
   * Creates a draft contract inside the caller's transaction: checks, gapless reference,
   * vehicles, first history row and audit. Used by "Nouveau contrat" and by renewals.
   */
  async function insertDraft(tx, auth, request, body) {
    assertDates(body.startDate, body.endDate);
    const vehicleIds = [...new Set(body.vehicleIds)];
    const customer = await tx.customer.findUnique({
      where: { id: body.customerId },
      select: { id: true, ref: true, archivedAt: true },
    });
    if (!customer) throw notFound('Client');
    if (customer.archivedAt) {
      throw new HttpError(409, 'OWNER_ARCHIVED', 'Ce client est archivé : restaurez-le d’abord.');
    }
    const product = await usableProduct(tx, body.productId);
    await assertVehiclesOf(tx, vehicleIds, customer.id);

    const year = Number(today().slice(0, 4));
    const number = await nextCounterValue(tx, 'contract', year);
    const contract = await tx.contract.create({
      data: {
        ref: `CTR-${year}-${String(number).padStart(5, '0')}`,
        customerId: customer.id,
        productId: product.id,
        insurerId: product.insurerId,
        startDate: toDate(body.startDate),
        endDate: toDate(body.endDate),
        premiumTotal: body.premiumTotal ?? null,
        tacitRenewal: body.tacitRenewal,
        noticeDays: body.noticeDays ?? null,
        previousContractId: body.previousContractId ?? null,
        createdAt: clock.now(),
        createdById: auth.user.id,
      },
    });
    await tx.contractVehicle.createMany({
      data: vehicleIds.map((vehicleId) => ({
        contractId: contract.id,
        vehicleId,
        addedById: auth.user.id,
      })),
    });
    await tx.contractStatusChange.create({
      data: {
        contractId: contract.id,
        toStatus: 'DRAFT',
        userId: auth.user.id,
        at: clock.now(),
      },
    });
    await record(tx, auth, request, 'contract.created', contract.id, {
      ref: contract.ref,
      customerRef: customer.ref,
      vehicles: vehicleIds.length,
    });
    return contract.id;
  }

  /**
   * Records an attestation of `contract` (loaded with detailInclude) inside the caller's
   * transaction: series, model of the vehicle's usage (L16), period, provisional month (L23),
   * duplicate (L26), the blank form of the stock and the audit. Used by "Ajouter une
   * attestation" and by avenants.
   */
  async function insertAttestation(tx, auth, request, contract, body) {
    if (contract.status === 'CANCELLED') {
      throw new HttpError(409, 'CONTRACT_CANCELLED', 'Ce contrat est annulé.');
    }
    const series = await tx.attestationSeries.findUnique({
      where: { id: body.seriesId },
      include: { model: true },
    });
    if (!series) throw notFound('Série');
    if (series.insurerId !== contract.insurerId) throw invalid('seriesId', 'SERIES_OTHER_INSURER');
    if (series.status !== 'CONFIRMED' || !series.active) {
      throw invalid('seriesId', 'SERIES_NOT_USABLE');
    }
    const provisional = series.model.provisional;
    // A definitive attestation follows the issue of the contract; a provisional one may
    // come before, while the contract is being established (rule L23).
    if (!provisional && contract.status !== 'ISSUED') {
      throw new HttpError(
        409,
        'CONTRACT_NOT_ISSUED',
        'Le contrat doit d’abord être émis par l’assureur.',
      );
    }
    const link = contract.vehicles.find((l) => l.vehicleId === body.vehicleId);
    if (!link) throw invalid('vehicleId', 'VEHICLE_NOT_ON_CONTRACT');
    if (!provisional) {
      // Rule L16: the attestation model is the one of the vehicle's usage.
      const usage = link.vehicle.usage;
      if (!usage) throw invalid('vehicleId', 'VEHICLE_USAGE_REQUIRED');
      if (usage.modelCode !== series.modelCode) throw invalid('seriesId', 'MODEL_MISMATCH');
    }
    if (body.validTo <= body.validFrom) throw invalid('validTo', 'INVALID_PERIOD');
    // Exactly one month is allowed: the platform prints 18H to 18H the same day a month later.
    if (provisional && body.validTo > addOneMonth(body.validFrom)) {
      throw invalid('validTo', 'PROVISIONAL_TOO_LONG');
    }
    if (
      !provisional &&
      (body.validFrom < fromDate(contract.startDate) || body.validTo > fromDate(contract.endDate))
    ) {
      throw invalid('validTo', 'OUTSIDE_CONTRACT');
    }

    if (body.duplicateOfId) {
      // Rule L26: a duplicate repeats the original's series and number.
      const original = contract.attestations.find((a) => a.id === body.duplicateOfId);
      if (
        !original ||
        original.series.id !== body.seriesId ||
        original.number !== body.number ||
        original.vehicle.id !== body.vehicleId
      ) {
        throw invalid('duplicateOfId', 'DUPLICATE_MISMATCH');
      }
    } else {
      const existing = await tx.attestation.findFirst({
        where: { seriesId: body.seriesId, number: body.number, duplicateOfId: null },
      });
      if (existing) throw duplicateAttestation();
    }

    const attestation = await tx.attestation.create({
      data: {
        contractId: contract.id,
        vehicleId: body.vehicleId,
        seriesId: body.seriesId,
        number: body.number,
        provisional,
        validFrom: toDate(body.validFrom),
        validTo: toDate(body.validTo),
        medium: body.medium,
        coverNoteRef: body.coverNoteRef ?? null,
        duplicateOfId: body.duplicateOfId ?? null,
        createdAt: clock.now(),
        createdById: auth.user.id,
      },
    });
    // A paper attestation uses its blank form from the agency's stock.
    await useStockForm(tx, auth, attestation);
    await record(tx, auth, request, 'attestation.recorded', contract.id, {
      attestationId: attestation.id,
      series: series.code,
      provisional,
      duplicate: Boolean(body.duplicateOfId),
    });
    return attestation;
  }

  return {
    async list({ q, status, customerId, insurerId, unpaid, page, pageSize }) {
      // Issued contracts whose insurer premium is not fully paid (the "Aujourd'hui" to-do list).
      const unpaidIds = unpaid
        ? (
            await prisma.$queryRaw`
              SELECT c."id" FROM "contract" c
              LEFT JOIN (SELECT "contractId", sum("amount") AS "paid" FROM "payment" GROUP BY 1) p
                ON p."contractId" = c."id"
              WHERE c."status" = 'ISSUED' AND ${DUE_KNOWN_SQL}
                AND ${DUE_SQL} > coalesce(p."paid", 0)`
          ).map((row) => row.id)
        : null;
      const where = {
        ...(unpaidIds ? { id: { in: unpaidIds } } : {}),
        ...(status ? { status } : {}),
        ...(customerId ? { customerId } : {}),
        ...(insurerId ? { insurerId } : {}),
        ...(q
          ? {
              OR: [
                { ref: { contains: q, mode: 'insensitive' } },
                { policyNumber: { contains: q, mode: 'insensitive' } },
                { customer: { searchText: { contains: q.toLowerCase() } } },
              ],
            }
          : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.contract.findMany({
          where,
          include: listInclude,
          // Same time: the higher number was created last.
          orderBy: [{ createdAt: 'desc' }, { ref: 'desc' }],
          ...toSkipTake({ page, pageSize }),
        }),
        prisma.contract.count({ where }),
      ]);
      const day = today();
      // What is left of the insurer premium, for every contract of the page in one query.
      const paid = await prisma.payment.groupBy({
        by: ['contractId'],
        where: { contractId: { in: rows.map((row) => row.id) } },
        _sum: { amount: true },
      });
      const paidOf = new Map(paid.map((p) => [p.contractId, p._sum.amount]));
      return pageResult(
        rows.map((row) => ({
          ...summaryView(row, day),
          premiumTotal: money(row.premiumTotal),
          amountDue: money(dueOf(row)),
          balance: dueOf(row) ? money(dueOf(row).minus(paidOf.get(row.id) ?? 0)) : null,
        })),
        total,
        { page, pageSize },
      );
    },

    async get(id) {
      return detailView(await load(prisma, id), today());
    },

    async create(auth, request, body) {
      const id = await prisma.$transaction((tx) => insertDraft(tx, auth, request, body));
      return this.get(id);
    },

    insertDraft,

    async update(auth, request, id, { version, ...changes }) {
      await prisma.$transaction(async (tx) => {
        const current = await load(tx, id);
        if (current.status !== 'DRAFT') throw notEditable();
        const data = {};
        const changed = [];
        if (changes.productId && changes.productId !== current.productId) {
          const product = await usableProduct(tx, changes.productId);
          Object.assign(data, { productId: product.id, insurerId: product.insurerId });
          changed.push('productId');
        }
        for (const field of ['startDate', 'endDate']) {
          if (changes[field] && changes[field] !== fromDate(current[field])) {
            data[field] = toDate(changes[field]);
            changed.push(field);
          }
        }
        assertDates(
          changes.startDate ?? fromDate(current.startDate),
          changes.endDate ?? fromDate(current.endDate),
        );
        if (
          changes.premiumTotal !== undefined &&
          changes.premiumTotal !== money(current.premiumTotal)
        ) {
          data.premiumTotal = changes.premiumTotal;
          changed.push('premiumTotal');
        }
        for (const field of ['tacitRenewal', 'noticeDays']) {
          if (changes[field] !== undefined && changes[field] !== current[field]) {
            data[field] = changes[field];
            changed.push(field);
          }
        }
        await bumpVersion(tx, id, version, data);
        await record(tx, auth, request, 'contract.updated', id, { fields: changed });
      });
      return this.get(id);
    },

    async addVehicle(auth, request, id, { vehicleId, version }) {
      await prisma.$transaction(async (tx) => {
        const current = await load(tx, id);
        if (current.status !== 'DRAFT') throw notEditable();
        if (current.vehicles.some((link) => link.vehicleId === vehicleId)) {
          throw new HttpError(
            409,
            'VEHICLE_ALREADY_ON_CONTRACT',
            'Ce véhicule est déjà sur le contrat.',
          );
        }
        await assertVehiclesOf(tx, [vehicleId], current.customerId);
        await bumpVersion(tx, id, version);
        await tx.contractVehicle.create({
          data: { contractId: id, vehicleId, addedById: auth.user.id },
        });
        await record(tx, auth, request, 'contract.vehicle_added', id, { vehicleId });
      });
      return this.get(id);
    },

    async removeVehicle(auth, request, id, vehicleId, { version }) {
      await prisma.$transaction(async (tx) => {
        const current = await load(tx, id);
        if (current.status !== 'DRAFT') throw notEditable();
        const link = current.vehicles.find((l) => l.vehicleId === vehicleId);
        if (!link) throw notFound('Véhicule du contrat');
        await bumpVersion(tx, id, version);
        // Kept as history: the row is closed, not deleted.
        await tx.contractVehicle.update({
          where: { id: link.id },
          data: { removedAt: clock.now(), removedById: auth.user.id },
        });
        await record(tx, auth, request, 'contract.vehicle_removed', id, { vehicleId });
      });
      return this.get(id);
    },

    async transition(auth, request, id, body) {
      const current = await load(prisma, id);
      const rule = TRANSITIONS[`${current.status}>${body.to}`];
      if (!rule) {
        throw new HttpError(
          409,
          'INVALID_TRANSITION',
          'Ce changement de statut n’est pas possible.',
          {
            from: current.status,
            to: body.to,
          },
        );
      }
      if (rule.manager && !auth.permissions.has(PERMISSIONS.CONTRACTS_TERMINATE)) {
        await audit.record({
          actorUserId: auth.user.id,
          action: 'security.access_denied',
          request,
          details: {
            permission: PERMISSIONS.CONTRACTS_TERMINATE,
            from: current.status,
            to: body.to,
          },
        });
        throw new HttpError(403, 'FORBIDDEN', 'Accès refusé.');
      }
      const missing = rule.needs.filter((field) => !body[field]);
      if (missing.length) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'Données invalides.',
          missing.map((path) => ({ path, rule: 'REQUIRED' })),
        );
      }

      try {
        await prisma.$transaction(async (tx) => {
          const data = { status: body.to };
          if (body.to === 'AWAITING_INSURER') {
            const fresh = await load(tx, id);
            if (fresh.vehicles.length === 0) throw invalid('vehicleIds', 'REQUIRED');
            await usableProduct(tx, fresh.productId);
          }
          if (current.status === 'AWAITING_INSURER' && body.to === 'ISSUED') {
            // Unique per insurer, except along this contract's renewal chain (same rule as the
            // database trigger, which also holds against two issues at the same moment).
            if (
              await policyTaken(
                tx,
                current.insurerId,
                body.policyNumber,
                id,
                current.previousContractId,
              )
            ) {
              throw duplicatePolicy();
            }
            data.policyNumber = body.policyNumber;
            data.insurerReference = body.insurerReference;
          }
          await bumpVersion(tx, id, body.version, data);
          await tx.contractStatusChange.create({
            data: {
              contractId: id,
              fromStatus: current.status,
              toStatus: body.to,
              reason: body.reason ?? null,
              insurerReference: body.insurerReference ?? null,
              effectiveDate: body.effectiveDate ? toDate(body.effectiveDate) : null,
              userId: auth.user.id,
              at: clock.now(),
            },
          });
          await record(tx, auth, request, 'contract.status_changed', id, {
            from: current.status,
            to: body.to,
          });
        });
      } catch (err) {
        throw mapUnique(err, duplicatePolicy);
      }
      return this.get(id);
    },

    async addAttestation(auth, request, contractId, body) {
      try {
        await prisma.$transaction(async (tx) =>
          insertAttestation(tx, auth, request, await load(tx, contractId), body),
        );
      } catch (err) {
        throw mapUnique(err, duplicateAttestation);
      }
      return this.get(contractId);
    },

    /**
     * Records an avenant the insurer issued on an issued contract, with its new attestation
     * (rule L28), in one transaction. Vehicle change: the vehicle replaced leaves the contract
     * and is archived when no other contract covers it (owner, 28/10/2026: archived, its history
     * kept); the new one joins. Registration change: the vehicle takes its new plate. Either way
     * the vehicle's earlier attestations are marked replaced, and the avenant's amount is added
     * to what the contract owes.
     */
    async amend(auth, request, contractId, body) {
      try {
        await prisma.$transaction(async (tx) => {
          const contract = await load(tx, contractId);
          if (contract.status !== 'ISSUED') {
            throw new HttpError(
              409,
              'CONTRACT_NOT_ISSUED',
              'Un avenant ne s’enregistre que sur un contrat émis.',
            );
          }
          const start = fromDate(contract.startDate);
          const end = fromDate(contract.endDate);
          if (body.effectiveDate < start || body.effectiveDate > end) {
            throw invalid('effectiveDate', 'OUTSIDE_CONTRACT');
          }
          if (
            body.number &&
            (await tx.amendment.findFirst({ where: { contractId, number: body.number } }))
          ) {
            throw duplicateAmendment();
          }
          const onContract = (vehicleId) =>
            contract.vehicles.find((l) => l.vehicleId === vehicleId);
          const previous = body.previousVehicleId ? onContract(body.previousVehicleId) : null;
          if (body.previousVehicleId && !previous) {
            throw invalid('previousVehicleId', 'VEHICLE_NOT_ON_CONTRACT');
          }

          let vehicleId;
          let registrations = { previousRegistration: null, registration: null };
          if (body.kind === 'REGISTRATION_CHANGE') {
            if (!previous) throw invalid('previousVehicleId', 'REQUIRED');
            if (!body.registration) throw invalid('registration', 'REQUIRED');
            const { display, key } = normalizeRegistration(body.registration);
            const vehicle = await tx.vehicle.findUnique({ where: { id: previous.vehicleId } });
            if (key === vehicle.registrationKey) throw invalid('registration', 'SAME_REGISTRATION');
            const other = await tx.vehicle.findFirst({ where: { registrationKey: key } });
            if (other) {
              throw new HttpError(
                409,
                'DUPLICATE_REGISTRATION',
                'Ce véhicule est déjà enregistré.',
                { candidates: [{ id: other.id, registration: other.registration }] },
              );
            }
            vehicleId = vehicle.id;
            registrations = { previousRegistration: vehicle.registration, registration: display };
            const { count } = await tx.vehicle.updateMany({
              where: { id: vehicle.id, version: vehicle.version },
              data: { registration: display, registrationKey: key, version: { increment: 1 } },
            });
            if (count === 0) throw conflict();
            await audit.record(
              {
                actorUserId: auth.user.id,
                action: 'vehicle.updated',
                entityType: 'vehicle',
                entityId: vehicle.id,
                request,
                details: { fields: ['registration'], ...registrations, contractId },
              },
              tx,
            );
          } else {
            if (!body.vehicleId) throw invalid('vehicleId', 'REQUIRED');
            if (body.vehicleId === body.previousVehicleId) {
              throw invalid('vehicleId', 'SAME_VEHICLE');
            }
            vehicleId = body.vehicleId;
            // Already on the contract only when the vehicle replaced was never recorded (the
            // contract was just made from the avenant's own scan).
            if (onContract(vehicleId)) {
              if (previous) throw invalid('vehicleId', 'VEHICLE_ALREADY_ON_CONTRACT');
            } else {
              await assertVehiclesOf(tx, [vehicleId], contract.customerId);
              await tx.contractVehicle.create({
                data: { contractId, vehicleId, addedById: auth.user.id },
              });
            }
            if (previous) {
              await tx.contractVehicle.update({
                where: { id: previous.id },
                data: { removedAt: clock.now(), removedById: auth.user.id },
              });
              const elsewhere = await tx.contractVehicle.count({
                where: {
                  vehicleId: previous.vehicleId,
                  removedAt: null,
                  contract: {
                    status: { in: ['DRAFT', 'AWAITING_INSURER', 'ISSUED', 'SUSPENDED'] },
                  },
                },
              });
              if (elsewhere === 0) {
                await tx.vehicle.update({
                  where: { id: previous.vehicleId },
                  data: {
                    archivedAt: clock.now(),
                    archivedById: auth.user.id,
                    archiveReason: `Remplacé par avenant${body.number ? ` n° ${body.number}` : ''} sur ${contract.ref}`,
                    version: { increment: 1 },
                  },
                });
                await audit.record(
                  {
                    actorUserId: auth.user.id,
                    action: 'vehicle.archived',
                    entityType: 'vehicle',
                    entityId: previous.vehicleId,
                    request,
                    details: { contractId, via: 'amendment' },
                  },
                  tx,
                );
              }
            }
          }

          // The new attestation, checked like any other, for the vehicle now covered.
          const attestation = await insertAttestation(
            tx,
            auth,
            request,
            await load(tx, contractId),
            {
              ...body.attestation,
              vehicleId,
            },
          );
          const amendment = await tx.amendment.create({
            data: {
              contractId,
              kind: body.kind,
              number: body.number ?? null,
              effectiveDate: toDate(body.effectiveDate),
              amount: body.amount ?? null,
              insurerReference: body.insurerReference ?? null,
              previousVehicleId: previous?.vehicleId ?? null,
              vehicleId,
              ...registrations,
              attestationId: attestation.id,
              createdById: auth.user.id,
            },
          });
          // The attestations of the vehicle replaced or renumbered that still run.
          if (previous) {
            await tx.attestation.updateMany({
              where: {
                contractId,
                vehicleId: previous.vehicleId,
                id: { not: attestation.id },
                cancelledAt: null,
                replacedById: null,
                validTo: { gte: toDate(body.effectiveDate) },
              },
              data: { replacedById: amendment.id, version: { increment: 1 } },
            });
          }
          await bumpVersion(tx, contractId, body.version, {
            ...(body.amount ? { amendmentsTotal: { increment: body.amount } } : {}),
          });
          await record(tx, auth, request, 'contract.amended', contractId, {
            amendmentId: amendment.id,
            kind: body.kind,
            number: body.number ?? null,
            amount: body.amount ?? null,
            previousVehicleId: previous?.vehicleId ?? null,
            vehicleId,
          });
        });
      } catch (err) {
        // A unique index refused a row a concurrent request recorded first.
        throw mapUnique(err, duplicateAmendment);
      }
      return this.get(contractId);
    },

    /** The replaced paper attestation is back at the agency (owner, 28/10/2026). */
    async returnAttestation(auth, request, id, { version }) {
      const contractId = await prisma.$transaction(async (tx) => {
        const attestation = await tx.attestation.findUnique({ where: { id } });
        if (!attestation) throw notFound('Attestation');
        if (!attestation.replacedById) {
          throw new HttpError(409, 'NOT_REPLACED', 'Cette attestation n’a pas été remplacée.');
        }
        if (attestation.returnedAt) {
          throw new HttpError(409, 'ALREADY_RETURNED', 'Cette attestation est déjà rendue.');
        }
        const { count } = await tx.attestation.updateMany({
          where: { id, version },
          data: { returnedAt: clock.now(), returnedById: auth.user.id, version: { increment: 1 } },
        });
        if (count === 0) throw conflict();
        await record(tx, auth, request, 'attestation.returned', attestation.contractId, {
          attestationId: id,
        });
        return attestation.contractId;
      });
      return this.get(contractId);
    },

    async cancelAttestation(auth, request, id, { reason, version }) {
      const contractId = await prisma.$transaction(async (tx) => {
        const attestation = await tx.attestation.findUnique({ where: { id } });
        if (!attestation) throw notFound('Attestation');
        if (attestation.cancelledAt) {
          throw new HttpError(409, 'ALREADY_CANCELLED', 'Cette attestation est déjà annulée.');
        }
        const { count } = await tx.attestation.updateMany({
          where: { id, version },
          data: {
            cancelledAt: clock.now(),
            cancelledById: auth.user.id,
            cancelReason: reason,
            version: { increment: 1 },
          },
        });
        if (count === 0) throw conflict();
        await cancelStockForm(tx, auth, id, reason, clock.now());
        await record(tx, auth, request, 'attestation.cancelled', attestation.contractId, {
          attestationId: id,
        });
        return attestation.contractId;
      });
      return this.get(contractId);
    },
  };
}
