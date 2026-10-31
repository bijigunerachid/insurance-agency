import { HttpError } from '../../utils/httpError.js';
import { pageResult, toSkipTake } from '../../utils/pagination.js';
import { todayIn } from '../../utils/time.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { createContractsService } from '../contracts/service.js';
import { displayNameOf } from '../customers/service.js';
import { OPEN_STATUSES } from './schemas.js';

/** An issued contract is listed this many days before its end (agency answer, 23/10/2026). */
export const RENEWAL_WINDOW_DAYS = 30;

const DAY = 24 * 3600 * 1000;
const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);
export const addDays = (iso, days) => fromDate(new Date(toDate(iso).getTime() + days * DAY));
const daysBetween = (from, to) => Math.round((toDate(to) - toDate(from)) / DAY);

const notFound = () => new HttpError(404, 'NOT_FOUND', 'Renouvellement introuvable.');
const conflict = () =>
  new HttpError(
    409,
    'VERSION_CONFLICT',
    'Cet élément a été modifié entre-temps. Rechargez la page et recommencez.',
  );
const closed = () =>
  new HttpError(409, 'RENEWAL_CLOSED', 'Ce renouvellement est terminé (renouvelé ou non).');
const userName = { select: { id: true, displayName: true } };

const include = {
  assignedUser: userName,
  renewedContract: { select: { id: true, ref: true, status: true } },
  contract: {
    select: {
      id: true,
      ref: true,
      status: true,
      policyNumber: true,
      startDate: true,
      endDate: true,
      tacitRenewal: true,
      noticeDays: true,
      customer: {
        select: {
          id: true,
          ref: true,
          type: true,
          firstName: true,
          lastName: true,
          legalName: true,
          phone: true,
        },
      },
      insurer: { select: { id: true, code: true } },
      product: { select: { id: true, name: true } },
      vehicles: {
        where: { removedAt: null },
        select: { vehicle: { select: { id: true, registration: true } } },
      },
    },
  },
};

/** `withPhone`: the customer's phone, for an employee allowed to read customers (to call). */
function view(row, today, { withPhone = false } = {}) {
  const due = fromDate(row.dueDate);
  const contract = row.contract;
  return {
    id: row.id,
    status: row.status,
    open: OPEN_STATUSES.includes(row.status),
    dueDate: due,
    daysLeft: daysBetween(today, due),
    // Rule L11: with tacit renewal, notice must reach the insurer before this date.
    noticeDeadline:
      contract.tacitRenewal && contract.noticeDays ? addDays(due, -contract.noticeDays) : null,
    assignedUser: row.assignedUser,
    outcomeReason: row.outcomeReason,
    renewedContract: row.renewedContract,
    contract: {
      id: contract.id,
      ref: contract.ref,
      status: contract.status,
      policyNumber: contract.policyNumber,
      startDate: fromDate(contract.startDate),
      endDate: fromDate(contract.endDate),
      tacitRenewal: contract.tacitRenewal,
      customer: {
        id: contract.customer.id,
        ref: contract.customer.ref,
        displayName: displayNameOf(contract.customer),
        ...(withPhone ? { phone: contract.customer.phone } : {}),
      },
      insurer: contract.insurer,
      product: contract.product,
      vehicles: contract.vehicles.map((link) => link.vehicle),
    },
    version: row.version,
  };
}

export function createRenewalsService({ prisma, audit, clock, config }) {
  const contracts = createContractsService({ prisma, audit, clock, config });
  const today = () => todayIn(config.APP_TIMEZONE, clock.now());
  const record = (tx, auth, request, action, entityId, details) =>
    audit.record(
      { actorUserId: auth.user.id, action, entityType: 'renewal', entityId, request, details },
      tx,
    );

  /**
   * Opens a renewal for every issued contract that ends within the window and has none yet,
   * nor a following contract. Run before each read: no background job is needed offline.
   */
  async function openDue() {
    const limit = toDate(addDays(today(), RENEWAL_WINDOW_DAYS));
    const due = await prisma.contract.findMany({
      where: { status: 'ISSUED', endDate: { lte: limit }, renewal: null, nextContract: null },
      select: { id: true, endDate: true, createdById: true },
    });
    if (due.length === 0) return;
    await prisma.$transaction(async (tx) => {
      // skipDuplicates: two requests may open the same renewals at once.
      const created = await tx.renewal.createManyAndReturn({
        data: due.map((c) => ({
          contractId: c.id,
          dueDate: c.endDate,
          assignedUserId: c.createdById,
        })),
        skipDuplicates: true,
        select: { id: true, assignedUserId: true },
      });
      await tx.renewalEvent.createMany({
        data: created.map((r) => ({
          renewalId: r.id,
          toStatus: 'TO_PREPARE',
          toAssigneeId: r.assignedUserId,
        })),
      });
    });
  }

  async function load(client, id) {
    const row = await client.renewal.findUnique({ where: { id }, include });
    if (!row) throw notFound();
    return row;
  }

  async function bump(tx, id, version, data) {
    const { count } = await tx.renewal.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) throw conflict();
  }

  return {
    async list(auth, { status, mine, page, pageSize }) {
      await openDue();
      const where = {
        ...(status === 'open' ? { status: { in: OPEN_STATUSES } } : {}),
        ...(['RENEWED', 'NOT_RENEWED'].includes(status) ? { status } : {}),
        ...(mine === 'true' ? { assignedUserId: auth.user.id } : {}),
      };
      const [rows, total] = await prisma.$transaction([
        prisma.renewal.findMany({
          where,
          include,
          orderBy: [{ dueDate: 'asc' }],
          ...toSkipTake({ page, pageSize }),
        }),
        prisma.renewal.count({ where }),
      ]);
      const day = today();
      const withPhone = auth.permissions.has(PERMISSIONS.CUSTOMERS_READ);
      return pageResult(
        rows.map((row) => view(row, day, { withPhone })),
        total,
        { page, pageSize },
      );
    },

    /** For the home dashboard: what the signed-in employee must follow. */
    async summary(auth) {
      await openDue();
      const day = toDate(today());
      const open = { status: { in: OPEN_STATUSES } };
      const mine = { ...open, assignedUserId: auth.user.id };
      const [mineCount, mineOverdue, allOpen, next] = await prisma.$transaction([
        prisma.renewal.count({ where: mine }),
        prisma.renewal.count({ where: { ...mine, dueDate: { lt: day } } }),
        prisma.renewal.count({ where: open }),
        prisma.renewal.findMany({ where: mine, include, orderBy: { dueDate: 'asc' }, take: 10 }),
      ]);
      const iso = today();
      return {
        windowDays: RENEWAL_WINDOW_DAYS,
        mine: mineCount,
        mineOverdue,
        allOpen,
        next: next.map((row) =>
          view(row, iso, { withPhone: auth.permissions.has(PERMISSIONS.CUSTOMERS_READ) }),
        ),
      };
    },

    /** Active employees a renewal can be given to. */
    async assignees() {
      return prisma.user.findMany({
        where: { active: true },
        ...userName,
        orderBy: { displayName: 'asc' },
      });
    },

    async get(id) {
      const row = await load(prisma, id);
      const events = await prisma.renewalEvent.findMany({
        where: { renewalId: id },
        include: { user: userName, fromAssignee: userName, toAssignee: userName },
        orderBy: { id: 'desc' },
      });
      return {
        ...view(row, today()),
        events: events.map((e) => ({
          id: String(e.id),
          from: e.fromStatus,
          to: e.toStatus,
          fromAssignee: e.fromAssignee,
          toAssignee: e.toAssignee,
          note: e.note,
          by: e.user,
          at: e.at,
        })),
      };
    },

    /** A new status (or just a note) on an open renewal. */
    async update(auth, request, id, { status, outcomeReason, note, version }) {
      await prisma.$transaction(async (tx) => {
        const current = await load(tx, id);
        if (!OPEN_STATUSES.includes(current.status)) throw closed();
        const next = status ?? current.status;
        await bump(tx, id, version, {
          status: next,
          ...(next === 'NOT_RENEWED' ? { outcomeReason } : {}),
        });
        await tx.renewalEvent.create({
          data: {
            renewalId: id,
            fromStatus: current.status,
            toStatus: next,
            note: next === 'NOT_RENEWED' ? outcomeReason : (note ?? null),
            userId: auth.user.id,
          },
        });
        await record(tx, auth, request, 'renewal.updated', id, {
          from: current.status,
          to: next,
        });
      });
      return this.get(id);
    },

    async assign(auth, request, id, { assignedUserId, version }) {
      await prisma.$transaction(async (tx) => {
        const current = await load(tx, id);
        if (!OPEN_STATUSES.includes(current.status)) throw closed();
        const user = await tx.user.findUnique({ where: { id: assignedUserId } });
        if (!user || !user.active) {
          throw new HttpError(400, 'VALIDATION_ERROR', 'Données invalides.', [
            { path: 'assignedUserId', rule: 'USER_NOT_ACTIVE' },
          ]);
        }
        await bump(tx, id, version, { assignedUserId });
        await tx.renewalEvent.create({
          data: {
            renewalId: id,
            fromAssigneeId: current.assignedUserId,
            toAssigneeId: assignedUserId,
            userId: auth.user.id,
          },
        });
        await record(tx, auth, request, 'renewal.assigned', id, { to: assignedUserId });
      });
      return this.get(id);
    },

    /**
     * Prepares the next contract as a draft (same customer, vehicles and terms; dates that
     * follow on) and closes the renewal as renewed. The agency then completes it from the
     * insurer's platform like any contract.
     */
    async renew(auth, request, id, { productId, startDate, endDate, version }) {
      const contractId = await prisma.$transaction(async (tx) => {
        const current = await load(tx, id);
        if (!OPEN_STATUSES.includes(current.status)) throw closed();
        const old = await tx.contract.findUniqueOrThrow({
          where: { id: current.contractId },
          include: {
            vehicles: {
              where: { removedAt: null, vehicle: { archivedAt: null } },
              select: { vehicleId: true },
            },
          },
        });
        const oldStart = fromDate(old.startDate);
        const oldEnd = fromDate(old.endDate);
        const start = startDate ?? addDays(oldEnd, 1);
        const end = endDate ?? addDays(start, daysBetween(oldStart, oldEnd));
        const newId = await contracts.insertDraft(tx, auth, request, {
          customerId: old.customerId,
          productId: productId ?? old.productId,
          startDate: start,
          endDate: end,
          tacitRenewal: old.tacitRenewal,
          noticeDays: old.noticeDays,
          vehicleIds: old.vehicles.map((v) => v.vehicleId),
          previousContractId: old.id,
        });
        await bump(tx, id, version, { status: 'RENEWED', renewedContractId: newId });
        await tx.renewalEvent.create({
          data: {
            renewalId: id,
            fromStatus: current.status,
            toStatus: 'RENEWED',
            userId: auth.user.id,
          },
        });
        await record(tx, auth, request, 'renewal.renewed', id, { contractId: newId });
        return newId;
      });
      return { renewal: await this.get(id), contractId };
    },
  };
}
