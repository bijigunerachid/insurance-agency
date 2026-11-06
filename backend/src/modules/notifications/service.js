import { Prisma } from '../../generated/prisma/client.ts';
import { pageResult, toSkipTake } from '../../utils/pagination.js';
import { todayIn } from '../../utils/time.js';
import { DUE_KNOWN_SQL, DUE_SQL, LONG_UNPAID_DAYS } from '../contracts/service.js';
import { displayNameOf } from '../customers/service.js';
import { createRemittancesService } from '../remittances/service.js';
import { OPEN_STATUSES } from '../renewals/schemas.js';
import { RENEWAL_WINDOW_DAYS, createRenewalsService } from '../renewals/service.js';

/** Renewals are announced at these days before the contract ends (owner, 05/11/2026). */
export const RENEWAL_STEPS = [30, 15, 7];
/** The alerts of the day are looked for at most this often (each poll asks). */
const SWEEP_EVERY_MS = 60_000;
/** The newest alerts the bell's pop-up may show at once. */
const RECENT = 5;

const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);
const money = (value) => new Prisma.Decimal(value ?? 0).toFixed(2);
/** The step of an alert: the nearest of 30, 15 and 7 days the contract has reached. */
const stepOf = (daysLeft) => RENEWAL_STEPS.filter((step) => daysLeft <= step).at(-1);

/**
 * In-app alerts (owner, 05/11/2026): the bell's count, the pop-ups and the history. The alerts
 * of the day are written when the application checks (no background job, as for renewals): once
 * each, thanks to their key. Everyone sees the alerts of the permissions they hold; their own
 * actions are in the history but never counted as new.
 */
export function createNotificationsService({ prisma, audit, clock, config }) {
  const today = () => todayIn(config.APP_TIMEZONE, clock.now());
  const renewals = createRenewalsService({ prisma, audit, clock, config });
  const remittances = createRemittancesService({ prisma, audit, clock, config });
  let lastSweep = null;

  const write = (rows) =>
    rows.length
      ? prisma.notification.createMany({
          data: rows.map((row) => ({ ...row, createdAt: clock.now() })),
          skipDuplicates: true,
        })
      : null;

  /** Open renewals at 30, 15 or 7 days: who follows each one, and the last step taken. */
  async function renewalAlerts(day) {
    const rows = await prisma.$queryRaw`
      SELECT r."id", r."dueDate", (r."dueDate" - ${day}::date) AS "daysLeft",
             c."policyNumber", cu."type", cu."firstName", cu."lastName", cu."legalName",
             u."displayName" AS "follower",
             e."toStatus" AS "lastStatus", e."note" AS "lastNote", e."at" AS "lastAt",
             eu."displayName" AS "lastBy"
      FROM "renewal" r
      JOIN "contract" c ON c."id" = r."contractId"
      JOIN "customer" cu ON cu."id" = c."customerId"
      JOIN "app_user" u ON u."id" = r."assignedUserId"
      LEFT JOIN LATERAL (
        SELECT "toStatus", "note", "at", "userId" FROM "renewal_event"
        WHERE "renewalId" = r."id" ORDER BY "at" DESC, "id" DESC LIMIT 1
      ) e ON true
      LEFT JOIN "app_user" eu ON eu."id" = e."userId"
      WHERE r."status"::text IN (${Prisma.join(OPEN_STATUSES)})
        AND r."dueDate" >= ${day}::date
        AND r."dueDate" <= ${day}::date + ${RENEWAL_WINDOW_DAYS}::int`;
    return rows.map((row) => {
      const daysLeft = Number(row.daysLeft);
      const step = stepOf(daysLeft);
      return {
        kind: 'RENEWAL_DUE',
        permission: 'renewals.read',
        dedupeKey: `renewal:${row.id}:${step}`,
        entityType: 'renewal',
        entityId: row.id,
        link: `/renouvellements/${row.id}`,
        data: {
          policyNumber: row.policyNumber,
          customer: displayNameOf(row),
          dueDate: fromDate(row.dueDate),
          daysLeft,
          step,
          follower: row.follower,
          lastAction: row.lastAt
            ? {
                status: row.lastStatus,
                note: row.lastNote,
                by: row.lastBy,
                at: row.lastAt.toISOString(),
              }
            : null,
        },
      };
    });
  }

  /** Issued contracts still owed more than 15 days after their start: once each. */
  async function unpaidAlerts(day) {
    const rows = await prisma.$queryRaw`
      SELECT c."id", c."policyNumber", c."startDate",
             (${day}::date - c."startDate") AS "days",
             ${DUE_SQL} - coalesce(p."paid", 0) AS "balance",
             cu."type", cu."firstName", cu."lastName", cu."legalName",
             u."displayName" AS "recordedBy"
      FROM "contract" c
      JOIN "customer" cu ON cu."id" = c."customerId"
      JOIN "app_user" u ON u."id" = c."createdById"
      LEFT JOIN (SELECT "contractId", sum("amount") AS "paid" FROM "payment" GROUP BY 1) p
        ON p."contractId" = c."id"
      WHERE c."status" = 'ISSUED' AND ${DUE_KNOWN_SQL}
        AND ${DUE_SQL} > coalesce(p."paid", 0)
        AND c."startDate" < ${day}::date - ${LONG_UNPAID_DAYS}::int`;
    return rows.map((row) => ({
      kind: 'UNPAID',
      permission: 'payments.read',
      dedupeKey: `unpaid:${row.id}`,
      entityType: 'contract',
      entityId: row.id,
      link: `/contrats/${row.id}`,
      data: {
        policyNumber: row.policyNumber,
        customer: displayNameOf(row),
        balance: money(row.balance),
        days: Number(row.days),
        recordedBy: row.recordedBy,
      },
    }));
  }

  /** Management: an insurer's money not remitted in time, once a day while it lasts. */
  async function remittanceAlerts(day) {
    const summary = await remittances.summary();
    return summary.insurers
      .filter((insurer) => Number(insurer.overdueAmount) > 0)
      .map((insurer) => ({
        kind: 'REMITTANCE_LATE',
        permission: 'remittances.manage',
        dedupeKey: `remittance:${insurer.id}:${day}`,
        entityType: 'insurer',
        entityId: insurer.id,
        link: '/reversements',
        data: { insurer: insurer.code, amount: insurer.overdueAmount },
      }));
  }

  /** Management: an active series with few blank forms left, once a day while it lasts. */
  async function stockAlerts(day) {
    const threshold = config.LOW_STOCK_THRESHOLD ?? 20;
    if (threshold === 0) return [];
    const rows = await prisma.$queryRaw`
      SELECT s."id", s."code", i."code" AS "insurer",
             count(*) FILTER (WHERE f."status" = 'AVAILABLE')::int AS "available"
      FROM "attestation_series" s
      JOIN "insurer" i ON i."id" = s."insurerId"
      JOIN "attestation_form" f ON f."seriesId" = s."id"
      WHERE s."active"
      GROUP BY s."id", s."code", i."code"
      HAVING count(*) FILTER (WHERE f."status" = 'AVAILABLE') < ${threshold}`;
    return rows.map((row) => ({
      kind: 'STOCK_LOW',
      permission: 'stock.manage',
      dedupeKey: `stock:${row.id}:${day}`,
      entityType: 'series',
      entityId: row.id,
      link: '/stock',
      data: { series: row.code, insurer: row.insurer, available: row.available, threshold },
    }));
  }

  /** Writes the alerts of the day that are not written yet. */
  async function sweep() {
    const now = clock.now().getTime();
    if (lastSweep !== null && now - lastSweep < SWEEP_EVERY_MS) return;
    lastSweep = now;
    await renewals.openDue();
    const day = today();
    const rows = (
      await Promise.all([
        renewalAlerts(day),
        unpaidAlerts(day),
        remittanceAlerts(day),
        stockAlerts(day),
      ])
    ).flat();
    await write(rows);
  }

  /** What the user may see: the alerts of the permissions they hold. */
  const visible = (auth) => ({ permission: { in: [...auth.permissions] } });
  /** New for the user: after they last opened the bell, and not their own action. */
  async function unreadWhere(auth) {
    const seen = await prisma.notificationSeen.findUnique({ where: { userId: auth.user.id } });
    return {
      ...visible(auth),
      createdAt: { gt: seen?.seenAt ?? auth.user.createdAt },
      OR: [{ actorUserId: null }, { actorUserId: { not: auth.user.id } }],
    };
  }

  const include = { actor: { select: { displayName: true } } };
  const view = (row, auth, seenAt) => ({
    id: String(row.id),
    kind: row.kind,
    action: row.action,
    data: row.data,
    link: row.link,
    createdAt: row.createdAt.toISOString(),
    actor: row.actor ? { displayName: row.actor.displayName } : null,
    mine: row.actorUserId === auth.user.id,
    unread: row.actorUserId !== auth.user.id && row.createdAt > seenAt,
  });

  return {
    sweep,

    /** For the bell, asked every 30 seconds: how many are new, and the newest of them. */
    async summary(auth) {
      await sweep();
      const where = await unreadWhere(auth);
      const [unread, recent, latest] = await Promise.all([
        prisma.notification.count({ where }),
        prisma.notification.findMany({
          where,
          include,
          orderBy: { id: 'desc' },
          take: RECENT,
        }),
        prisma.notification.findFirst({
          where: visible(auth),
          orderBy: { id: 'desc' },
          select: { id: true },
        }),
      ]);
      const seenAt = where.createdAt.gt;
      return {
        unread,
        latestId: latest ? String(latest.id) : null,
        recent: recent.map((row) => view(row, auth, seenAt)),
      };
    },

    /** The history: who did what and the alerts, newest first. */
    async list(auth, { kind, page, pageSize }) {
      const where = { ...visible(auth), ...(kind ? { kind: { in: kind } } : {}) };
      const seen = await prisma.notificationSeen.findUnique({ where: { userId: auth.user.id } });
      const seenAt = seen?.seenAt ?? auth.user.createdAt;
      const [rows, total] = await prisma.$transaction([
        prisma.notification.findMany({
          where,
          include,
          orderBy: { id: 'desc' },
          ...toSkipTake({ page, pageSize }),
        }),
        prisma.notification.count({ where }),
      ]);
      return pageResult(
        rows.map((row) => view(row, auth, seenAt)),
        total,
        { page, pageSize },
      );
    },

    /** Opening the bell: everything shown until now is seen. */
    async markSeen(auth) {
      const seenAt = clock.now();
      await prisma.notificationSeen.upsert({
        where: { userId: auth.user.id },
        create: { userId: auth.user.id, seenAt },
        update: { seenAt },
      });
      return { seenAt: seenAt.toISOString() };
    },
  };
}
