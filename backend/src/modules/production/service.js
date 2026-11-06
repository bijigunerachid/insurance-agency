import { Prisma } from '../../generated/prisma/client.ts';
import { HttpError } from '../../utils/httpError.js';
import { startOfNextZonedDay, startOfZonedDay } from '../../utils/time.js';
import { agencyDetails } from '../agency/details.js';
import { PERMISSIONS } from '../auth/permissions.js';
import { DUE_KNOWN_SQL, DUE_SQL } from '../contracts/service.js';
import { displayNameOf } from '../customers/service.js';

const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);
const money = (value) =>
  value === null || value === undefined ? null : new Prisma.Decimal(value).toFixed(2);

/** The columns of the printed sheet and of its Excel file (owner, 05/11/2026). */
export const PRODUCTION_COLUMNS = [
  { key: 'order', label: 'Ordre', type: 'int' },
  { key: 'policyNumber', label: 'N° de police', type: 'text' },
  { key: 'customer', label: 'Client', type: 'text' },
  { key: 'premium', label: 'Prime', type: 'money' },
  { key: 'startDate', label: 'Effet', type: 'date' },
  { key: 'endDate', label: 'Échéance', type: 'date' },
  { key: 'balance', label: 'Reste', type: 'money' },
  { key: 'collectedOn', label: 'Date encaissée', type: 'date' },
  { key: 'cancelledOn', label: 'Annulé le', type: 'date' },
  { key: 'operator', label: 'Opérateur', type: 'text' },
];

const forbidden = () => new HttpError(403, 'FORBIDDEN', 'Accès refusé.');

/**
 * The état de production: every contract the insurer issued (cancelled since or not), dated by
 * its first issue or by its effect, with what is left to pay and the last payment. An employee
 * without `production.all` only ever sees the contracts they recorded.
 */
export function createProductionService({ prisma, audit, config }) {
  const tz = config.APP_TIMEZONE;

  /** Whose production is asked: an agent's own only; management, one employee or everyone. */
  async function scope(auth, request, operatorId) {
    if (auth.permissions.has(PERMISSIONS.PRODUCTION_ALL)) return operatorId ?? null;
    if (operatorId && operatorId !== auth.user.id) {
      await audit.record({
        actorUserId: auth.user.id,
        action: 'security.access_denied',
        request,
        details: { permission: PERMISSIONS.PRODUCTION_ALL, operatorId },
      });
      throw forbidden();
    }
    return auth.user.id;
  }

  async function build(auth, request, { basis, from, to, insurerId, operatorId, payment }) {
    const operator = await scope(auth, request, operatorId);
    const paid = Prisma.sql`coalesce(p."paid", 0)`;
    const conditions = [
      basis === 'ISSUE'
        ? Prisma.sql`i."at" >= ${startOfZonedDay(from, tz)} AND i."at" < ${startOfNextZonedDay(to, tz)}`
        : Prisma.sql`c."startDate" >= ${from}::date AND c."startDate" <= ${to}::date`,
    ];
    if (insurerId) conditions.push(Prisma.sql`c."insurerId" = ${insurerId}::uuid`);
    if (operator) conditions.push(Prisma.sql`c."createdById" = ${operator}::uuid`);
    if (payment) {
      conditions.push(DUE_KNOWN_SQL);
      conditions.push(
        {
          NONE: Prisma.sql`${paid} <= 0`,
          PARTIAL: Prisma.sql`${paid} > 0 AND ${paid} < ${DUE_SQL}`,
          PAID: Prisma.sql`${paid} >= ${DUE_SQL}`,
        }[payment],
      );
    }
    const rows = await prisma.$queryRaw`
      WITH issued AS (
        SELECT DISTINCT ON ("contractId") "contractId", "at"
        FROM "contract_status_change" WHERE "toStatus" = 'ISSUED'
        ORDER BY "contractId", "at"
      ), cancelled AS (
        SELECT DISTINCT ON ("contractId") "contractId",
               coalesce("effectiveDate", ("at" AT TIME ZONE ${tz})::date) AS "on"
        FROM "contract_status_change" WHERE "toStatus" = 'CANCELLED'
        ORDER BY "contractId", "at" DESC
      ), paid AS (
        SELECT "contractId", sum("amount") AS "paid",
               max("receivedAt") FILTER (WHERE "kind" = 'PAYMENT') AS "lastAt"
        FROM "payment" GROUP BY 1
      )
      SELECT c."id", c."policyNumber", c."startDate", c."endDate", c."status",
             CASE WHEN ${DUE_KNOWN_SQL} THEN ${DUE_SQL} END AS "due",
             ${paid} AS "paid",
             to_char(p."lastAt" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS "collectedOn",
             CASE WHEN c."status" = 'CANCELLED' THEN ca."on" END AS "cancelledOn",
             cu."type", cu."firstName", cu."lastName", cu."legalName",
             u."displayName" AS "operator"
      FROM "contract" c
      JOIN issued i ON i."contractId" = c."id"
      JOIN "customer" cu ON cu."id" = c."customerId"
      JOIN "app_user" u ON u."id" = c."createdById"
      LEFT JOIN cancelled ca ON ca."contractId" = c."id"
      LEFT JOIN paid p ON p."contractId" = c."id"
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${basis === 'ISSUE' ? Prisma.sql`i."at"` : Prisma.sql`c."startDate"`}, c."policyNumber"`;

    let premiums = new Prisma.Decimal(0);
    let balances = new Prisma.Decimal(0);
    let collected = new Prisma.Decimal(0);
    const items = rows.map((row, index) => {
      const due = row.due === null ? null : new Prisma.Decimal(row.due);
      const paidSoFar = new Prisma.Decimal(row.paid);
      // A contract cancelled since stays listed, but nothing is left to collect on it: its premium
      // and balance are left out of the totals; money already received is still counted.
      const cancelled = row.status === 'CANCELLED';
      const balance =
        due === null || cancelled ? null : Prisma.Decimal.max(due.minus(paidSoFar), 0);
      if (due && !cancelled) premiums = premiums.plus(due);
      if (balance) balances = balances.plus(balance);
      collected = collected.plus(paidSoFar);
      return {
        order: index + 1,
        id: row.id,
        policyNumber: row.policyNumber,
        customer: displayNameOf(row),
        premium: money(due),
        startDate: fromDate(row.startDate),
        endDate: fromDate(row.endDate),
        balance: money(balance),
        collectedOn: row.collectedOn,
        cancelledOn: fromDate(row.cancelledOn),
        operator: row.operator,
        status: row.status,
      };
    });

    const [insurer, operatorUser] = await Promise.all([
      insurerId
        ? prisma.insurer.findUnique({ where: { id: insurerId }, select: { id: true, name: true } })
        : null,
      operator
        ? prisma.user.findUnique({
            where: { id: operator },
            select: { id: true, displayName: true },
          })
        : null,
    ]);
    return {
      agency: agencyDetails(config),
      basis,
      from,
      to,
      insurer,
      operator: operatorUser,
      payment: payment ?? null,
      columns: PRODUCTION_COLUMNS,
      rows: items,
      totals: {
        count: items.length,
        premium: money(premiums),
        balance: money(balances),
        collected: money(collected),
      },
    };
  }

  return {
    build,

    /** The employees management may choose: those who recorded a contract. */
    async operators(auth) {
      if (!auth.permissions.has(PERMISSIONS.PRODUCTION_ALL)) {
        return { items: [{ id: auth.user.id, displayName: auth.user.displayName }] };
      }
      const items = await prisma.$queryRaw`
        SELECT DISTINCT u."id", u."displayName" FROM "app_user" u
        JOIN "contract" c ON c."createdById" = u."id"
        ORDER BY u."displayName"`;
      return { items };
    },

    async recordExport(auth, request, query, rows) {
      await audit.record({
        actorUserId: auth.user.id,
        action: 'report.exported',
        entityType: 'report',
        entityId: 'etat-production',
        request,
        details: { ...query, rows },
      });
    },
  };
}
