import { Prisma } from '../../generated/prisma/client.ts';
import { nextCounterValue } from '../../services/counter.js';
import { HttpError } from '../../utils/httpError.js';
import { pageResult, toSkipTake } from '../../utils/pagination.js';
import { startOfNextZonedDay, todayIn } from '../../utils/time.js';
import { displayNameOf } from '../customers/service.js';

/** Rule L5: premiums are paid over within 15 days after the month of collection. */
export const REMITTANCE_DAYS = 15;

const money = (decimal) =>
  decimal === null || decimal === undefined ? null : new Prisma.Decimal(decimal).toFixed(2);
const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);
const userName = { select: { id: true, displayName: true } };
const notFound = (what) => new HttpError(404, 'NOT_FOUND', `${what} introuvable.`);
const DAY_MS = 86_400_000;

/** Due date of the premiums collected in `YYYY-MM`: the 15th of the next month (rule L5). */
export function remittanceDueOn(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  // Date.UTC takes a 0-based month: the 1-based number of this month is the next one.
  return fromDate(new Date(Date.UTC(year, monthNumber, REMITTANCE_DAYS)));
}

/**
 * Payments and reversals still to remit: in no remittance that is not cancelled. A payment and
 * its reversal that are both still to remit cancel out, so neither is owed.
 */
const OUTSTANDING = Prisma.sql`
  FROM "payment" p
  JOIN "contract" c ON c."id" = p."contractId"
  JOIN "customer" cu ON cu."id" = c."customerId"
  WHERE NOT EXISTS (
      SELECT 1 FROM "remittance_item" ri WHERE ri."paymentId" = p."id" AND NOT ri."released")
    AND NOT EXISTS (
      SELECT 1 FROM "payment" o
      WHERE ((p."kind" = 'PAYMENT' AND o."reversesId" = p."id")
          OR (p."kind" = 'REVERSAL' AND o."id" = p."reversesId"))
        AND NOT EXISTS (
          SELECT 1 FROM "remittance_item" ri2 WHERE ri2."paymentId" = o."id" AND NOT ri2."released"))`;

const include = {
  insurer: { select: { id: true, code: true, name: true } },
  recordedBy: userName,
  cancelledBy: userName,
  _count: { select: { items: true } },
};

function view(row) {
  return {
    id: row.id,
    number: row.number,
    insurer: row.insurer,
    collectedUntil: fromDate(row.collectedUntil),
    amount: money(row.amount),
    method: row.method,
    reference: row.reference,
    remittedOn: fromDate(row.remittedOn),
    note: row.note,
    recordedAt: row.recordedAt,
    recordedBy: row.recordedBy,
    itemCount: row._count.items,
    status: row.cancelledAt ? 'CANCELLED' : 'ACTIVE',
    cancellation: row.cancelledAt
      ? { at: row.cancelledAt, by: row.cancelledBy, reason: row.cancelReason }
      : null,
  };
}

const itemView = (row) => ({
  paymentId: row.id,
  receiptNumber: row.receiptNumber,
  kind: row.kind,
  amount: money(row.amount),
  receivedAt: row.receivedAt,
  contract: { id: row.contractId, ref: row.contractRef },
  customer: displayNameOf(row),
});

export function createRemittancesService({ prisma, audit, clock, config }) {
  const today = () => todayIn(config.APP_TIMEZONE, clock.now());
  const record = (tx, auth, request, action, entityId, details) =>
    audit.record(
      { actorUserId: auth.user.id, action, entityType: 'remittance', entityId, request, details },
      tx,
    );

  /** The payments of `insurerId` still to remit, received up to the end of `collectedUntil`. */
  async function outstandingItems(client, insurerId, collectedUntil) {
    const before = startOfNextZonedDay(collectedUntil, config.APP_TIMEZONE);
    return client.$queryRaw`
      SELECT p."id", p."receiptNumber", p."kind", p."amount", p."receivedAt",
             c."id" AS "contractId", c."ref" AS "contractRef",
             cu."type", cu."firstName", cu."lastName", cu."legalName"
      ${OUTSTANDING}
        AND c."insurerId" = ${insurerId}::uuid
        AND p."receivedAt" < ${before}
      ORDER BY p."receivedAt", p."receiptNumber"`;
  }

  function dateNotInFuture(fields) {
    const details = Object.entries(fields)
      .filter(([, value]) => value > today())
      .map(([path]) => ({ path, rule: 'DATE_IN_FUTURE' }));
    if (details.length) throw new HttpError(400, 'VALIDATION_ERROR', 'Données invalides.', details);
  }

  async function insurerOrFail(client, insurerId) {
    const insurer = await client.insurer.findUnique({
      where: { id: insurerId },
      select: { id: true, code: true, name: true },
    });
    if (!insurer) throw notFound('Assureur');
    return insurer;
  }

  async function loadDetail(id) {
    const row = await prisma.remittance.findUnique({ where: { id }, include });
    if (!row) throw notFound('Reversement');
    return row;
  }

  return {
    /**
     * What is still to remit to each insurer, per month of collection, with the legal due date.
     * Active insurers are listed even when nothing is owed.
     */
    async summary() {
      const now = today();
      const [insurers, groups] = await Promise.all([
        prisma.insurer.findMany({
          select: { id: true, code: true, name: true, active: true },
          orderBy: { code: 'asc' },
        }),
        prisma.$queryRaw`
          SELECT c."insurerId" AS "insurerId",
                 to_char(p."receivedAt" AT TIME ZONE ${config.APP_TIMEZONE}, 'YYYY-MM') AS "month",
                 sum(p."amount") AS "amount", count(*)::int AS "count"
          ${OUTSTANDING}
          GROUP BY 1, 2
          ORDER BY 2`,
      ]);
      return {
        today: now,
        insurers: insurers
          .filter((insurer) => insurer.active || groups.some((g) => g.insurerId === insurer.id))
          .map((insurer) => {
            const months = groups
              .filter((g) => g.insurerId === insurer.id)
              .map((g) => {
                const dueOn = remittanceDueOn(g.month);
                const daysLeft = Math.round((Date.parse(dueOn) - Date.parse(now)) / DAY_MS);
                return {
                  month: g.month,
                  amount: money(g.amount),
                  count: g.count,
                  dueOn,
                  daysLeft,
                  overdue: daysLeft < 0,
                };
              });
            const sum = (list) =>
              money(list.reduce((acc, m) => acc.plus(m.amount), new Prisma.Decimal(0)));
            return {
              id: insurer.id,
              code: insurer.code,
              name: insurer.name,
              total: sum(months),
              overdueAmount: sum(months.filter((m) => m.overdue)),
              months,
            };
          }),
      };
    },

    /** What a remittance up to `collectedUntil` would include, shown before recording it. */
    async outstanding({ insurerId, collectedUntil }) {
      const insurer = await insurerOrFail(prisma, insurerId);
      const rows = await outstandingItems(prisma, insurerId, collectedUntil);
      const amount = rows.reduce((acc, r) => acc.plus(r.amount), new Prisma.Decimal(0));
      return { insurer, collectedUntil, amount: money(amount), items: rows.map(itemView) };
    },

    async record(auth, request, body) {
      dateNotInFuture({ collectedUntil: body.collectedUntil, remittedOn: body.remittedOn });
      const id = await prisma.$transaction(async (tx) => {
        const existing = await tx.remittance.findUnique({
          where: { idempotencyKey: body.idempotencyKey },
          select: { id: true },
        });
        if (existing) return existing.id;
        await insurerOrFail(tx, body.insurerId);
        // One remittance at a time per insurer: the same payment is never included twice.
        await tx.$queryRaw`SELECT "id" FROM "insurer" WHERE "id" = ${body.insurerId}::uuid FOR UPDATE`;
        const rows = await outstandingItems(tx, body.insurerId, body.collectedUntil);
        const amount = rows.reduce((acc, r) => acc.plus(r.amount), new Prisma.Decimal(0));
        if (rows.length === 0 || amount.lessThanOrEqualTo(0)) {
          throw new HttpError(409, 'NOTHING_TO_REMIT', 'Aucun montant à reverser pour ce choix.');
        }
        if (!amount.equals(new Prisma.Decimal(body.expectedAmount))) {
          throw new HttpError(
            409,
            'AMOUNT_CHANGED',
            'Des paiements ont changé entre-temps : vérifiez le nouveau montant.',
            { amount: money(amount) },
          );
        }
        const year = Number(today().slice(0, 4));
        const number = `VER-${year}-${String(await nextCounterValue(tx, 'remittance', year)).padStart(5, '0')}`;
        const remittance = await tx.remittance.create({
          data: {
            number,
            insurerId: body.insurerId,
            collectedUntil: new Date(body.collectedUntil),
            amount,
            method: body.method,
            reference: body.reference ?? null,
            remittedOn: new Date(body.remittedOn),
            note: body.note ?? null,
            recordedAt: clock.now(),
            recordedById: auth.user.id,
            idempotencyKey: body.idempotencyKey,
          },
        });
        await tx.remittanceItem.createMany({
          data: rows.map((r) => ({
            remittanceId: remittance.id,
            paymentId: r.id,
            amount: r.amount,
          })),
        });
        await record(tx, auth, request, 'remittance.recorded', remittance.id, {
          number,
          insurerId: body.insurerId,
          amount: money(amount),
          items: rows.length,
          method: body.method,
        });
        return remittance.id;
      });
      return this.get(id);
    },

    /** A mistaken remittance is cancelled, never edited: its payments are to remit again. */
    async cancel(auth, request, id, { reason }) {
      await prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw`
          SELECT "number", "cancelledAt" FROM "remittance" WHERE "id" = ${id}::uuid FOR UPDATE`;
        if (!row) throw notFound('Reversement');
        if (row.cancelledAt) {
          throw new HttpError(
            409,
            'REMITTANCE_ALREADY_CANCELLED',
            'Ce reversement est déjà annulé.',
          );
        }
        await tx.remittance.update({
          where: { id },
          data: { cancelledAt: clock.now(), cancelledById: auth.user.id, cancelReason: reason },
        });
        const released = await tx.remittanceItem.updateMany({
          where: { remittanceId: id },
          data: { released: true },
        });
        await record(tx, auth, request, 'remittance.cancelled', id, {
          number: row.number,
          released: released.count,
        });
      });
      return this.get(id);
    },

    async list({ insurerId, status, page, pageSize }) {
      const where = {
        ...(insurerId ? { insurerId } : {}),
        ...(status ? { cancelledAt: status === 'CANCELLED' ? { not: null } : null } : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.remittance.findMany({
          where,
          include,
          orderBy: { recordedAt: 'desc' },
          ...toSkipTake({ page, pageSize }),
        }),
        prisma.remittance.count({ where }),
      ]);
      return pageResult(rows.map(view), total, { page, pageSize });
    },

    /** Everything the printed bordereau shows: the remittance and each payment in it. */
    async get(id) {
      const row = await loadDetail(id);
      const items = await prisma.$queryRaw`
        SELECT p."id", p."receiptNumber", p."kind", ri."amount", p."receivedAt",
               c."id" AS "contractId", c."ref" AS "contractRef",
               cu."type", cu."firstName", cu."lastName", cu."legalName"
        FROM "remittance_item" ri
        JOIN "payment" p ON p."id" = ri."paymentId"
        JOIN "contract" c ON c."id" = p."contractId"
        JOIN "customer" cu ON cu."id" = c."customerId"
        WHERE ri."remittanceId" = ${id}::uuid
        ORDER BY p."receivedAt", p."receiptNumber"`;
      return {
        ...view(row),
        items: items.map(itemView),
        agency: {
          name: config.AGENCY_NAME ?? null,
          address: config.AGENCY_ADDRESS ?? null,
          phone: config.AGENCY_PHONE ?? null,
          ice: config.AGENCY_ICE ?? null,
          acapsNumber: config.AGENCY_ACAPS_NUMBER ?? null,
        },
      };
    },
  };
}
