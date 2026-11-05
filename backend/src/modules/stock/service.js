import { HttpError } from '../../utils/httpError.js';
import { pageResult, toSkipTake } from '../../utils/pagination.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { STOCK_STATUSES } from './schemas.js';

const invalid = (path, rule) =>
  new HttpError(400, 'VALIDATION_ERROR', 'Données invalides.', [{ path, rule }]);
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);
const userName = { select: { id: true, displayName: true } };
const seriesSelect = {
  select: {
    id: true,
    code: true,
    insurer: { select: { id: true, code: true } },
    model: { select: { code: true, label: true, officialNumber: true, colour: true } },
  },
};
/** Long ranges take longer than Prisma's default 5 s transaction. */
const LONG_TRANSACTION = { timeout: 30_000 };

/** Every serial number from first to last, with the printed width (leading zeros kept). */
export function numbersOf(first, last) {
  const width = first.length;
  const numbers = [];
  for (let n = BigInt(first); n <= BigInt(last); n += 1n) {
    numbers.push(n.toString().padStart(width, '0'));
  }
  return numbers;
}

/** Which statuses a form may leave for each status an employee records. */
const FROM = {
  ASSIGNED: ['AVAILABLE', 'ASSIGNED'],
  AVAILABLE: ['ASSIGNED'],
  DAMAGED: ['AVAILABLE', 'ASSIGNED'],
  LOST: ['AVAILABLE', 'ASSIGNED'],
  RETURNED: ['AVAILABLE', 'ASSIGNED', 'DAMAGED'],
};

/** Shows a few of the numbers that block a range, not thousands. */
const sample = (forms) =>
  forms.slice(0, 10).map((form) => ({ number: form.number, status: form.status }));

async function activeUser(tx, id, path) {
  const user = await tx.user.findUnique({ where: { id }, select: { id: true, active: true } });
  if (!user || !user.active) throw invalid(path, 'USER_NOT_ACTIVE');
  return user;
}

/**
 * A paper attestation recorded on a contract uses its form from the stock. A series is
 * "tracked" once a batch of it was received: its numbers must then come from the stock.
 * Electronic attestations and duplicates (issued by the insurer) use no form.
 */
export async function useStockForm(tx, auth, attestation) {
  if (attestation.medium !== 'PAPER' || attestation.duplicateOfId) return;
  const form = await tx.attestationForm.findUnique({
    where: { seriesId_number: { seriesId: attestation.seriesId, number: attestation.number } },
  });
  if (!form) {
    const tracked = await tx.attestationBatch.findFirst({
      where: { seriesId: attestation.seriesId },
      select: { id: true },
    });
    if (tracked) throw invalid('number', 'NUMBER_NOT_IN_STOCK');
    return;
  }
  if (!['AVAILABLE', 'ASSIGNED'].includes(form.status)) {
    throw invalid('number', 'FORM_NOT_AVAILABLE');
  }
  // A form given to one employee is used by that employee, unless a manager records it.
  if (
    form.status === 'ASSIGNED' &&
    form.holderId !== auth.user.id &&
    !auth.permissions.has(PERMISSIONS.STOCK_MANAGE)
  ) {
    throw invalid('number', 'FORM_HELD_BY_OTHER');
  }
  const { count } = await tx.attestationForm.updateMany({
    where: { id: form.id, version: form.version },
    data: { status: 'USED', attestationId: attestation.id, version: { increment: 1 } },
  });
  if (count === 0) throw invalid('number', 'FORM_NOT_AVAILABLE');
  await tx.attestationFormMovement.create({
    data: {
      formId: form.id,
      fromStatus: form.status,
      toStatus: 'USED',
      fromHolderId: form.holderId,
      toHolderId: form.holderId,
      attestationId: attestation.id,
      userId: auth.user.id,
      at: attestation.createdAt,
    },
  });
}

/** Cancelling an attestation cancels the form it was printed on. */
export async function cancelStockForm(tx, auth, attestationId, reason, at) {
  const form = await tx.attestationForm.findUnique({ where: { attestationId } });
  if (!form) return;
  await tx.attestationForm.update({
    where: { id: form.id },
    data: { status: 'CANCELLED', version: { increment: 1 } },
  });
  await tx.attestationFormMovement.create({
    data: {
      formId: form.id,
      fromStatus: form.status,
      toStatus: 'CANCELLED',
      fromHolderId: form.holderId,
      toHolderId: form.holderId,
      reason,
      attestationId,
      userId: auth.user.id,
      at,
    },
  });
}

export function createStockService({ prisma, audit, clock }) {
  const record = (tx, auth, request, action, entityType, entityId, details) =>
    audit.record({ actorUserId: auth.user.id, action, entityType, entityId, request, details }, tx);

  async function seriesInStock(tx, seriesId) {
    const series = await tx.attestationSeries.findUnique({ where: { id: seriesId } });
    if (!series) throw new HttpError(404, 'NOT_FOUND', 'Série introuvable.');
    if (series.status !== 'CONFIRMED' || !series.active) {
      throw invalid('seriesId', 'SERIES_NOT_USABLE');
    }
    return series;
  }

  return {
    /** Counts per series and status, and the forms each employee holds. */
    async summary() {
      const [groups, series, holders] = await Promise.all([
        prisma.attestationForm.groupBy({ by: ['seriesId', 'status'], _count: { _all: true } }),
        prisma.attestationSeries.findMany({
          where: { stockForms: { some: {} } },
          ...seriesSelect,
          orderBy: [{ insurer: { code: 'asc' } }, { code: 'asc' }],
        }),
        prisma.attestationForm.groupBy({
          by: ['holderId', 'seriesId'],
          where: { status: 'ASSIGNED' },
          _count: { _all: true },
        }),
      ]);
      const users = await prisma.user.findMany({
        where: { id: { in: holders.map((h) => h.holderId) } },
        ...userName,
      });
      return {
        series: series.map((s) => {
          const counts = Object.fromEntries(STOCK_STATUSES.map((status) => [status, 0]));
          for (const g of groups.filter((g) => g.seriesId === s.id))
            counts[g.status] = g._count._all;
          return { series: s, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
        }),
        assigned: holders.map((h) => ({
          holder: users.find((u) => u.id === h.holderId),
          series: series.find((s) => s.id === h.seriesId),
          count: h._count._all,
        })),
      };
    },

    /** Employees who can hold forms (active accounts). */
    async holders() {
      return prisma.user.findMany({
        where: { active: true },
        ...userName,
        orderBy: { displayName: 'asc' },
      });
    },

    async listBatches() {
      const batches = await prisma.attestationBatch.findMany({
        include: { series: seriesSelect, holder: userName, receivedBy: userName },
        orderBy: { createdAt: 'desc' },
        take: 200,
      });
      return batches.map((batch) => ({
        id: batch.id,
        series: batch.series,
        firstNumber: batch.firstNumber,
        lastNumber: batch.lastNumber,
        quantity: batch.quantity,
        receivedOn: fromDate(batch.receivedOn),
        insurerReference: batch.insurerReference,
        location: batch.location,
        holder: batch.holder,
        receivedBy: batch.receivedBy,
        createdAt: batch.createdAt,
      }));
    },

    async receiveBatch(auth, request, body) {
      const numbers = numbersOf(body.firstNumber, body.lastNumber);
      const id = await prisma.$transaction(async (tx) => {
        await seriesInStock(tx, body.seriesId);
        await activeUser(tx, body.holderId, 'holderId');
        // A serial number is received once: refuse a range that overlaps the stock.
        const existing = await tx.attestationForm.findMany({
          where: { seriesId: body.seriesId, number: { in: numbers } },
          select: { number: true, status: true },
          orderBy: { number: 'asc' },
        });
        if (existing.length) {
          throw new HttpError(409, 'FORMS_ALREADY_IN_STOCK', 'Ces numéros sont déjà en stock.', {
            count: existing.length,
            numbers: sample(existing),
          });
        }
        const batch = await tx.attestationBatch.create({
          data: {
            seriesId: body.seriesId,
            firstNumber: body.firstNumber,
            lastNumber: body.lastNumber,
            quantity: numbers.length,
            receivedOn: toDate(body.receivedOn),
            insurerReference: body.insurerReference ?? null,
            location: body.location,
            holderId: body.holderId,
            receivedById: auth.user.id,
          },
        });
        const forms = await tx.attestationForm.createManyAndReturn({
          data: numbers.map((number) => ({
            batchId: batch.id,
            seriesId: body.seriesId,
            number,
            holderId: body.holderId,
          })),
          select: { id: true },
        });
        await tx.attestationFormMovement.createMany({
          data: forms.map((form) => ({
            formId: form.id,
            toStatus: 'AVAILABLE',
            toHolderId: body.holderId,
            userId: auth.user.id,
            at: clock.now(),
          })),
        });
        await record(tx, auth, request, 'stock.batch_received', 'attestation_batch', batch.id, {
          first: body.firstNumber,
          last: body.lastNumber,
          quantity: numbers.length,
        });
        return batch.id;
      }, LONG_TRANSACTION);
      return (await this.listBatches()).find((batch) => batch.id === id);
    },

    async listForms({ seriesId, status, holderId, insurerId, q, page, pageSize }) {
      const where = {
        ...(insurerId ? { series: { insurerId } } : {}),
        ...(seriesId ? { seriesId } : {}),
        ...(status ? { status } : {}),
        ...(holderId ? { holderId } : {}),
        ...(q ? { number: { contains: q } } : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.attestationForm.findMany({
          where,
          include: {
            series: seriesSelect,
            holder: userName,
            attestation: {
              select: {
                id: true,
                contract: { select: { id: true, ref: true, policyNumber: true } },
              },
            },
          },
          orderBy: [{ seriesId: 'asc' }, { number: 'asc' }],
          ...toSkipTake({ page, pageSize }),
        }),
        prisma.attestationForm.count({ where }),
      ]);
      return pageResult(
        rows.map((row) => ({
          id: row.id,
          series: row.series,
          number: row.number,
          status: row.status,
          holder: row.holder,
          contract: row.attestation?.contract ?? null,
          version: row.version,
        })),
        total,
        { page, pageSize },
      );
    },

    async getForm(id) {
      const form = await prisma.attestationForm.findUnique({
        where: { id },
        include: {
          series: seriesSelect,
          holder: userName,
          batch: { select: { id: true, receivedOn: true, location: true, insurerReference: true } },
          attestation: {
            select: { id: true, contract: { select: { id: true, ref: true, policyNumber: true } } },
          },
          movements: {
            orderBy: { id: 'desc' },
            include: { user: userName, fromHolder: userName, toHolder: userName },
          },
        },
      });
      if (!form) throw new HttpError(404, 'NOT_FOUND', 'Formulaire introuvable.');
      return {
        id: form.id,
        series: form.series,
        number: form.number,
        status: form.status,
        holder: form.holder,
        batch: { ...form.batch, receivedOn: fromDate(form.batch.receivedOn) },
        contract: form.attestation?.contract ?? null,
        movements: form.movements.map((m) => ({
          id: String(m.id),
          from: m.fromStatus,
          to: m.toStatus,
          fromHolder: m.fromHolder,
          toHolder: m.toHolder,
          reason: m.reason,
          by: m.user,
          at: m.at,
        })),
        version: form.version,
      };
    },

    /** One status change for a whole range of serial numbers (or a single form). */
    async move(auth, request, body) {
      const numbers = numbersOf(body.firstNumber, body.lastNumber);
      const allowed = FROM[body.to];
      const count = await prisma.$transaction(async (tx) => {
        if (body.holderId) await activeUser(tx, body.holderId, 'holderId');
        const forms = await tx.attestationForm.findMany({
          where: { seriesId: body.seriesId, number: { in: numbers } },
          select: { id: true, number: true, status: true, holderId: true },
          orderBy: { number: 'asc' },
        });
        if (forms.length !== numbers.length) {
          throw new HttpError(409, 'FORMS_NOT_IN_STOCK', 'Certains numéros ne sont pas en stock.', {
            missing: numbers.length - forms.length,
          });
        }
        const blocked = forms.filter((form) => !allowed.includes(form.status));
        if (blocked.length) {
          throw new HttpError(
            409,
            'FORM_STATUS_CONFLICT',
            'Certains formulaires ne peuvent pas recevoir ce statut.',
            { count: blocked.length, numbers: sample(blocked) },
          );
        }
        const holderId = ['ASSIGNED', 'AVAILABLE'].includes(body.to) ? body.holderId : undefined;
        const { count: updated } = await tx.attestationForm.updateMany({
          where: { id: { in: forms.map((form) => form.id) }, status: { in: allowed } },
          data: {
            status: body.to,
            ...(holderId ? { holderId } : {}),
            version: { increment: 1 },
          },
        });
        // Another movement changed one of them meanwhile.
        if (updated !== forms.length) {
          throw new HttpError(
            409,
            'VERSION_CONFLICT',
            'Le stock a été modifié entre-temps. Rechargez la page et recommencez.',
          );
        }
        await tx.attestationFormMovement.createMany({
          data: forms.map((form) => ({
            formId: form.id,
            fromStatus: form.status,
            toStatus: body.to,
            fromHolderId: form.holderId,
            toHolderId: holderId ?? form.holderId,
            reason: body.reason ?? null,
            userId: auth.user.id,
            at: clock.now(),
          })),
        });
        await record(tx, auth, request, 'stock.moved', 'attestation_series', body.seriesId, {
          first: body.firstNumber,
          last: body.lastNumber,
          count: forms.length,
          to: body.to,
        });
        return forms.length;
      }, LONG_TRANSACTION);
      return { count };
    },
  };
}
