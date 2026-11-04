import { Prisma } from '../../generated/prisma/client.ts';
import { nextCounterValue } from '../../services/counter.js';
import { HttpError } from '../../utils/httpError.js';
import { pageResult, toSkipTake } from '../../utils/pagination.js';
import { startOfNextZonedDay, startOfZonedDay, todayIn } from '../../utils/time.js';
import { agencyDetails } from '../agency/details.js';
import { dueOf } from '../contracts/service.js';
import { displayNameOf } from '../customers/service.js';

const money = (decimal) => (decimal === null || decimal === undefined ? null : decimal.toFixed(2));
const userName = { select: { id: true, displayName: true } };
const notFound = (what) => new HttpError(404, 'NOT_FOUND', `${what} introuvable.`);

const include = {
  receivedBy: userName,
  reverses: { select: { id: true, receiptNumber: true } },
  reversedBy: { select: { id: true, receiptNumber: true, reason: true, receivedAt: true } },
};

function view(row) {
  return {
    id: row.id,
    receiptNumber: row.receiptNumber,
    kind: row.kind,
    amount: money(row.amount),
    method: row.method,
    reference: row.reference,
    payerName: row.payerName,
    // The agency's rounding: what the customer gave, and the gap the agency kept or covered.
    clientPaid: money(row.clientPaid),
    roundingGap: row.clientPaid ? money(row.clientPaid.minus(row.amount)) : null,
    // The cash handed over and the change given back (printed on the receipt).
    cashTendered: money(row.cashTendered),
    change: row.cashTendered ? money(row.cashTendered.minus(row.clientPaid ?? row.amount)) : null,
    receivedAt: row.receivedAt,
    receivedBy: row.receivedBy,
    reverses: row.reverses ?? null,
    reversedBy: row.reversedBy ?? null,
    reason: row.reason,
  };
}

export function createPaymentsService({ prisma, audit, clock, config }) {
  const today = () => todayIn(config.APP_TIMEZONE, clock.now());
  const record = (tx, auth, request, action, entityId, details) =>
    audit.record(
      { actorUserId: auth.user.id, action, entityType: 'payment', entityId, request, details },
      tx,
    );

  /**
   * Locks the contract row until commit: two payments recorded at the same moment are added up
   * one after the other, so together they never exceed the premium (rule L4).
   */
  async function lockContract(tx, contractId) {
    const rows = await tx.$queryRaw`
      SELECT "id", "status", "premiumTotal", "amendmentsTotal" FROM "contract"
      WHERE "id" = ${contractId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw notFound('Contrat');
    return rows[0];
  }

  async function paidOn(tx, contractId) {
    const { _sum } = await tx.payment.aggregate({ where: { contractId }, _sum: { amount: true } });
    return _sum.amount ?? new Prisma.Decimal(0);
  }

  async function nextReceiptNumber(tx) {
    const year = Number(today().slice(0, 4));
    const number = await nextCounterValue(tx, 'receipt', year);
    return `REC-${year}-${String(number).padStart(5, '0')}`;
  }

  /** The same request sent twice (double click, network retry) records one payment. */
  async function alreadyRecorded(tx, idempotencyKey) {
    return tx.payment.findUnique({ where: { idempotencyKey }, select: { id: true } });
  }

  return {
    async forContract(contractId) {
      const contract = await prisma.contract.findUnique({
        where: { id: contractId },
        select: { id: true, premiumTotal: true, amendmentsTotal: true },
      });
      if (!contract) throw notFound('Contrat');
      const rows = await prisma.payment.findMany({
        where: { contractId },
        include,
        orderBy: { receivedAt: 'desc' },
      });
      const paid = rows.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
      const due = dueOf(contract);
      return {
        premiumTotal: money(contract.premiumTotal),
        amendmentsTotal: money(contract.amendmentsTotal),
        amountDue: money(due),
        paid: money(paid),
        // Calculated, never stored (docs/data-model.md §2).
        balance: due ? money(due.minus(paid)) : null,
        items: rows.map(view),
      };
    },

    async record(auth, request, contractId, body) {
      const id = await prisma.$transaction(async (tx) => {
        const existing = await alreadyRecorded(tx, body.idempotencyKey);
        if (existing) return existing.id;
        const contract = await lockContract(tx, contractId);
        if (contract.status === 'CANCELLED') {
          throw new HttpError(409, 'CONTRACT_CANCELLED', 'Ce contrat est annulé.');
        }
        // Raw rows carry plain values: back to decimals for the shared calculation.
        const due = dueOf({
          premiumTotal:
            contract.premiumTotal === null ? null : new Prisma.Decimal(contract.premiumTotal),
          amendmentsTotal: contract.amendmentsTotal,
        });
        if (due === null) {
          throw new HttpError(
            409,
            'PREMIUM_REQUIRED',
            'Saisissez d’abord la prime confirmée par l’assureur sur le contrat.',
          );
        }
        const balance = due.minus(await paidOn(tx, contractId));
        // Rule L4: never more than the premium (and avenants) set by the insurer.
        if (new Prisma.Decimal(body.amount).greaterThan(balance)) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'Données invalides.', [
            { path: 'amount', rule: 'AMOUNT_ABOVE_BALANCE' },
          ]);
        }
        // The agency rounds what the customer gives for the whole balance only: the payment is
        // the exact balance owed to the insurer, the gap stays with the agency.
        if (body.clientPaid && !new Prisma.Decimal(body.amount).equals(balance)) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'Données invalides.', [
            { path: 'clientPaid', rule: 'ROUNDING_WHOLE_BALANCE' },
          ]);
        }
        const payment = await tx.payment.create({
          data: {
            receiptNumber: await nextReceiptNumber(tx),
            contractId,
            kind: 'PAYMENT',
            amount: body.amount,
            method: body.method,
            reference: body.reference ?? null,
            payerName: body.payerName ?? null,
            clientPaid: body.clientPaid ?? null,
            cashTendered: body.cashTendered ?? null,
            receivedAt: clock.now(),
            receivedById: auth.user.id,
            idempotencyKey: body.idempotencyKey,
          },
        });
        await record(tx, auth, request, 'payment.recorded', payment.id, {
          receipt: payment.receiptNumber,
          contractId,
          amount: body.amount,
          method: body.method,
          ...(body.clientPaid ? { clientPaid: body.clientPaid } : {}),
          ...(body.cashTendered ? { cashTendered: body.cashTendered } : {}),
        });
        return payment.id;
      });
      return this.receipt(id);
    },

    /** A reversal is a new receipt with the opposite amount; the payment itself never changes. */
    async reverse(auth, request, paymentId, { reason, idempotencyKey }) {
      const id = await prisma.$transaction(async (tx) => {
        const existing = await alreadyRecorded(tx, idempotencyKey);
        if (existing) return existing.id;
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: { reversedBy: { select: { id: true } } },
        });
        if (!payment) throw notFound('Paiement');
        if (payment.kind !== 'PAYMENT') {
          throw new HttpError(409, 'NOT_A_PAYMENT', 'Seul un paiement peut être annulé.');
        }
        if (payment.reversedBy) {
          throw new HttpError(409, 'ALREADY_REVERSED', 'Ce paiement est déjà annulé.');
        }
        await lockContract(tx, payment.contractId);
        const reversal = await tx.payment.create({
          data: {
            receiptNumber: await nextReceiptNumber(tx),
            contractId: payment.contractId,
            kind: 'REVERSAL',
            amount: payment.amount.negated(),
            method: payment.method,
            receivedAt: clock.now(),
            receivedById: auth.user.id,
            reversesId: payment.id,
            reason,
            idempotencyKey,
          },
        });
        await record(tx, auth, request, 'payment.reversed', reversal.id, {
          receipt: reversal.receiptNumber,
          reverses: payment.receiptNumber,
        });
        return reversal.id;
      });
      return this.receipt(id);
    },

    /** Payments of a period, with their totals per method (the cash list of the day). */
    async list({ from, to, method, receivedById, insurerId, page, pageSize }) {
      const receivedAt = {
        ...(from ? { gte: startOfZonedDay(from, config.APP_TIMEZONE) } : {}),
        ...(to ? { lt: startOfNextZonedDay(to, config.APP_TIMEZONE) } : {}),
      };
      const where = {
        ...(from || to ? { receivedAt } : {}),
        ...(method ? { method } : {}),
        ...(receivedById ? { receivedById } : {}),
        ...(insurerId ? { contract: { insurerId } } : {}),
      };
      const [rows, total, byMethod, rounded] = await prisma.$transaction([
        prisma.payment.findMany({
          where,
          include: {
            ...include,
            contract: {
              select: {
                id: true,
                ref: true,
                customer: {
                  select: { type: true, firstName: true, lastName: true, legalName: true },
                },
                insurer: { select: { code: true } },
              },
            },
          },
          orderBy: { receivedAt: 'desc' },
          ...toSkipTake({ page, pageSize }),
        }),
        prisma.payment.count({ where }),
        prisma.payment.groupBy({
          by: ['method'],
          where,
          _sum: { amount: true },
          orderBy: { method: 'asc' },
        }),
        // Roundings of payments still standing: what the cash drawer holds on top of the amounts.
        prisma.payment.findMany({
          where: { ...where, clientPaid: { not: null }, reversedBy: { is: null } },
          select: { amount: true, clientPaid: true },
        }),
      ]);
      const sum = byMethod.reduce((acc, g) => acc.plus(g._sum.amount), new Prisma.Decimal(0));
      const gap = rounded.reduce(
        (acc, r) => acc.plus(r.clientPaid.minus(r.amount)),
        new Prisma.Decimal(0),
      );
      return {
        ...pageResult(
          rows.map((row) => ({
            ...view(row),
            contract: {
              id: row.contract.id,
              ref: row.contract.ref,
              customer: displayNameOf(row.contract.customer),
              insurer: row.contract.insurer.code,
            },
          })),
          total,
          { page, pageSize },
        ),
        totals: {
          amount: money(sum),
          byMethod: byMethod.map((g) => ({ method: g.method, amount: money(g._sum.amount) })),
          roundingGap: money(gap),
          roundings: rounded.length,
        },
      };
    },

    /** Everything the printed receipt shows. */
    async receipt(id) {
      const row = await prisma.payment.findUnique({
        where: { id },
        include: {
          ...include,
          contract: {
            select: {
              id: true,
              ref: true,
              policyNumber: true,
              premiumTotal: true,
              customer: {
                select: {
                  ref: true,
                  type: true,
                  firstName: true,
                  lastName: true,
                  legalName: true,
                },
              },
              insurer: { select: { code: true, name: true } },
              product: { select: { name: true } },
            },
          },
        },
      });
      if (!row) throw notFound('Paiement');
      const contract = row.contract;
      return {
        ...view(row),
        contract: {
          id: contract.id,
          ref: contract.ref,
          policyNumber: contract.policyNumber,
          insurer: contract.insurer,
          product: contract.product,
          customer: { ref: contract.customer.ref, displayName: displayNameOf(contract.customer) },
        },
        agency: this.agency(),
      };
    },

    /** Agency details for the receipt, from the server settings (null when unset). */
    agency() {
      return agencyDetails(config);
    },
  };
}
