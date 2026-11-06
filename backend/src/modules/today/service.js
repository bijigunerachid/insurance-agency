import { Prisma } from '../../generated/prisma/client.ts';
import { PERMISSIONS } from '../auth/permissions.js';
import { DUE_KNOWN_SQL, DUE_SQL, LONG_UNPAID_DAYS } from '../contracts/service.js';
import { displayNameOf } from '../customers/service.js';
import { createRemittancesService } from '../remittances/service.js';
import { createRenewalsService } from '../renewals/service.js';
import { customerInWorkspace, vehicleInWorkspace } from '../workspaces/filters.js';
import {
  normalizeIdentityNumber,
  normalizePhone,
  normalizeRegistration,
  normalizeVin,
  searchable,
} from '../../utils/identifiers.js';
import { todayIn } from '../../utils/time.js';

const LIMIT = 6;
const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);
/** Letters and digits only: "POL 0001", "POL-0001" and "pol0001" are the same number. */
const compact = (value) =>
  String(value ?? '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toUpperCase();

/**
 * The "Aujourd'hui" page (owner, 24/10/2026: an easy app for daily work): one search over
 * customers, vehicles, contracts and attestations, and the list of what is waiting. Each part
 * only uses what the person may already see elsewhere.
 */
export function createTodayService({ prisma, audit, clock, config }) {
  const today = () => todayIn(config.APP_TIMEZONE, clock.now());
  const renewals = createRenewalsService({ prisma, audit, clock, config });
  const remittances = createRemittancesService({ prisma, audit, clock, config });

  return {
    async search(auth, q, { insurerId } = {}) {
      const can = (permission) => auth.permissions.has(permission);
      const text = searchable(q);
      const number = compact(q);
      const result = { customers: [], vehicles: [], contracts: [] };

      if (can(PERMISSIONS.CUSTOMERS_READ)) {
        const or = [{ searchText: { contains: text } }];
        const phone = normalizePhone(q);
        if (phone) or.push({ phone });
        const identity = normalizeIdentityNumber(q);
        // Exact match only, as on the customers page: a number must already be known.
        if (/^[A-Z0-9]{5,20}$/.test(identity))
          or.push({ identityNumber: identity }, { ice: identity });
        const rows = await prisma.customer.findMany({
          where: {
            OR: or,
            archivedAt: null,
            ...(insurerId ? { AND: [customerInWorkspace(insurerId)] } : {}),
          },
          orderBy: { ref: 'desc' },
          take: LIMIT,
        });
        result.customers = rows.map((c) => ({
          id: c.id,
          ref: c.ref,
          displayName: displayNameOf(c),
          city: c.city,
        }));
      }

      if (can(PERMISSIONS.VEHICLES_READ)) {
        const { key } = normalizeRegistration(q);
        const vin = normalizeVin(q);
        const or = [];
        if (key.length >= 3) {
          or.push({ registrationKey: { contains: key } });
          // A plate the vehicle had before a registration-change avenant still finds it.
          const renamed = await prisma.$queryRaw`
            SELECT DISTINCT "vehicleId" FROM "amendment"
            WHERE "kind" = 'REGISTRATION_CHANGE'
              AND upper(regexp_replace("previousRegistration", '[^[:alnum:]]', '', 'g')) LIKE ${`%${key}%`}`;
          if (renamed.length) or.push({ id: { in: renamed.map((r) => r.vehicleId) } });
        }
        if (vin.length >= 5) or.push({ vin: { contains: vin } });
        if (or.length) {
          const rows = await prisma.vehicle.findMany({
            where: {
              OR: or,
              archivedAt: null,
              ...(insurerId ? { AND: [vehicleInWorkspace(insurerId)] } : {}),
            },
            include: { owner: true },
            orderBy: { registrationKey: 'asc' },
            take: LIMIT,
          });
          result.vehicles = rows.map((v) => ({
            id: v.id,
            registration: v.registration,
            makeAndModel: [v.make, v.model].filter(Boolean).join(' '),
            owner: displayNameOf(v.owner),
          }));
        }
      }

      if (can(PERMISSIONS.CONTRACTS_READ) && number.length >= 3) {
        // Agency reference, policy number, or the number of one of its attestations.
        const ids = await prisma.$queryRaw`
          SELECT DISTINCT c."id", c."endDate" FROM "contract" c
          LEFT JOIN "attestation" a ON a."contractId" = c."id"
          WHERE (upper(regexp_replace(c."ref", '[^[:alnum:]]', '', 'g')) LIKE ${`%${number}%`}
             OR upper(regexp_replace(coalesce(c."policyNumber", ''), '[^[:alnum:]]', '', 'g')) = ${number}
             OR a."number" = ${number})
          ${insurerId ? Prisma.sql`AND c."insurerId" = ${insurerId}::uuid` : Prisma.empty}
          ORDER BY c."endDate" DESC
          LIMIT ${LIMIT}`;
        const rows = await prisma.contract.findMany({
          where: { id: { in: ids.map((r) => r.id) } },
          include: { customer: true, insurer: { select: { code: true } } },
          orderBy: { endDate: 'desc' },
        });
        result.contracts = rows.map((c) => ({
          id: c.id,
          ref: c.ref,
          policyNumber: c.policyNumber,
          status: c.status,
          insurer: c.insurer.code,
          customer: displayNameOf(c.customer),
          endDate: fromDate(c.endDate),
        }));
      }
      return result;
    },

    /**
     * What is waiting today, as lines that each open the right page. With an insurer (the
     * workspace chosen after sign-in), only that insurer's contracts count; scans are counted
     * for every insurer, as the insurer is only known once a scan is read.
     */
    async todo(auth, { insurerId } = {}) {
      const can = (permission) => auth.permissions.has(permission);
      const day = today();
      const items = [];

      if (can(PERMISSIONS.SCANS_MANAGE)) {
        const pending = await prisma.attestationScan.count({ where: { status: 'PENDING' } });
        if (pending) items.push({ kind: 'SCANS', count: pending, to: '/scans' });
      }
      if (can(PERMISSIONS.RENEWALS_READ)) {
        // The agency's renewals, whoever follows them (owner, 06/11/2026).
        const summary = await renewals.summary(auth, { insurerId });
        if (summary.allOverdue) {
          items.push({ kind: 'RENEWALS_LATE', count: summary.allOverdue, to: '/renouvellements' });
        }
        const coming = summary.allOpen - summary.allOverdue;
        if (coming > 0) {
          items.push({
            kind: 'RENEWALS',
            count: coming,
            soon: summary.allSoon,
            to: '/renouvellements',
          });
        }
      }
      if (can(PERMISSIONS.PAYMENTS_READ)) {
        // Issued contracts with an insurer premium (or avenant) and something left to pay.
        const [owed] = await prisma.$queryRaw`
          SELECT count(*)::int AS "count", coalesce(sum(${DUE_SQL} - coalesce(p."paid", 0)), 0) AS "amount",
            count(*) FILTER (WHERE c."startDate" < ${day}::date - ${LONG_UNPAID_DAYS}::int)::int AS "old"
          FROM "contract" c
          LEFT JOIN (SELECT "contractId", sum("amount") AS "paid" FROM "payment" GROUP BY 1) p
            ON p."contractId" = c."id"
          WHERE c."status" = 'ISSUED' AND ${DUE_KNOWN_SQL}
            AND ${DUE_SQL} > coalesce(p."paid", 0)
            ${insurerId ? Prisma.sql`AND c."insurerId" = ${insurerId}::uuid` : Prisma.empty}`;
        if (owed.count) {
          items.push({
            kind: 'UNPAID',
            count: owed.count,
            amount: Number(owed.amount).toFixed(2),
            old: owed.old,
            days: LONG_UNPAID_DAYS,
            to: '/contrats?unpaid=1',
          });
        }
      }
      if (can(PERMISSIONS.REMITTANCES_READ)) {
        const summary = await remittances.summary();
        const late = summary.insurers.filter(
          (i) => Number(i.overdueAmount) > 0 && (!insurerId || i.id === insurerId),
        );
        for (const insurer of late) {
          items.push({
            kind: 'REMITTANCE_LATE',
            insurer: insurer.code,
            amount: insurer.overdueAmount,
            to: '/reversements',
          });
        }
      }
      if (can(PERMISSIONS.CONTRACTS_READ)) {
        // Provisional attestations ending in the next 7 days: the definitive one is awaited.
        const limit = new Date(Date.parse(day) + 7 * 86_400_000);
        const provisional = await prisma.attestation.count({
          where: {
            provisional: true,
            cancelledAt: null,
            validTo: { gte: new Date(day), lte: limit },
            ...(insurerId ? { contract: { insurerId } } : {}),
          },
        });
        if (provisional) {
          items.push({ kind: 'PROVISIONAL_ENDING', count: provisional, to: '/contrats' });
        }
      }
      return { today: day, items };
    },
  };
}
