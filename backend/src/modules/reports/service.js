import { Prisma } from '../../generated/prisma/client.ts';
import { startOfNextZonedDay, startOfZonedDay, todayIn } from '../../utils/time.js';
import { DUE_KNOWN_SQL, DUE_SQL, LONG_UNPAID_DAYS } from '../contracts/service.js';
import { displayNameOf } from '../customers/service.js';
import { createRemittancesService } from '../remittances/service.js';

/**
 * The six reports the agency asked for (answers of 23/10/2026): contracts expiring by month,
 * payments per day, payments per insurer, amounts owed to each insurer, attestation stock and
 * movements, activity per employee; the balances customers still owe and the agency's cash
 * roundings (owner, 29/10/2026).
 * Each returns columns (French labels, also used by the exports), rows and totals.
 */
const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);
const money = (value) => new Prisma.Decimal(value ?? 0).toFixed(2);

const CONTRACT_STATUS = {
  DRAFT: 'En préparation',
  AWAITING_INSURER: 'Envoyé à l’assureur',
  ISSUED: 'Émis',
  SUSPENDED: 'Suspendu',
  CANCELLED: 'Annulé',
};
const RENEWAL_STATUS = {
  TO_PREPARE: 'À préparer',
  CUSTOMER_CONTACTED: 'Client contacté',
  DOCUMENTS_COMPLETE: 'Dossier complet',
  RENEWED: 'Renouvelé',
  NOT_RENEWED: 'Non renouvelé',
};
const METHODS = ['CASH', 'CHEQUE', 'TRANSFER', 'CARD', 'OTHER'];
const METHOD_LABEL = {
  CASH: 'Espèces',
  CHEQUE: 'Chèque',
  TRANSFER: 'Virement',
  CARD: 'Carte bancaire',
  OTHER: 'Autre',
};
const STOCK = ['AVAILABLE', 'ASSIGNED', 'USED', 'RETURNED', 'DAMAGED', 'LOST', 'CANCELLED'];
const STOCK_LABEL = {
  AVAILABLE: 'Disponibles',
  ASSIGNED: 'Remises',
  USED: 'Utilisées',
  RETURNED: 'Rendues',
  DAMAGED: 'Abîmées',
  LOST: 'Perdues',
  CANCELLED: 'Annulées',
};

export const REPORTS = {
  'contrats-echeances': 'Contrats arrivant à échéance',
  'paiements-jour': 'Paiements par jour',
  'paiements-assureur': 'Paiements par assureur',
  'reversements-dus': 'Montants dus aux assureurs',
  'soldes-clients': 'Soldes clients à recouvrer',
  'ecarts-caisse': 'Écarts de caisse (arrondis)',
  'stock-attestations': 'Stock d’attestations et mouvements',
  'activite-employes': 'Activité par employé',
};

export function createReportsService({ prisma, audit, clock, config }) {
  const tz = config.APP_TIMEZONE;
  const period = ({ from, to }) => ({
    gte: startOfZonedDay(from, tz),
    lt: startOfNextZonedDay(to, tz),
  });
  const sumColumns = (rows, keys) =>
    Object.fromEntries(
      keys.map((key) => [
        key,
        money(rows.reduce((acc, row) => acc.plus(row[key] ?? 0), new Prisma.Decimal(0))),
      ]),
    );

  const builders = {
    /** Contracts whose end date falls in the period, with their renewal follow-up. */
    async 'contrats-echeances'({ from, to }) {
      const rows = await prisma.contract.findMany({
        where: {
          endDate: { gte: new Date(from), lte: new Date(to) },
          status: { notIn: ['DRAFT', 'CANCELLED'] },
        },
        include: {
          customer: { select: { type: true, firstName: true, lastName: true, legalName: true } },
          insurer: { select: { code: true } },
          product: { select: { name: true } },
          renewal: { select: { status: true, assignedUser: { select: { displayName: true } } } },
          vehicles: {
            where: { removedAt: null },
            select: { vehicle: { select: { insurerUsage: { select: { label: true } } } } },
          },
        },
        orderBy: [{ endDate: 'asc' }, { ref: 'asc' }],
      });
      return {
        columns: [
          { key: 'month', label: 'Mois', type: 'text' },
          { key: 'endDate', label: 'Échéance', type: 'date' },
          // The contract's number in the agency is the insurer's policy number (05/11/2026).
          { key: 'policyNumber', label: 'N° de police', type: 'text' },
          { key: 'customer', label: 'Client', type: 'text' },
          { key: 'insurer', label: 'Assureur', type: 'text' },
          { key: 'product', label: 'Produit', type: 'text' },
          { key: 'formula', label: 'Formule', type: 'text' },
          { key: 'insurerUsage', label: 'Usage assureur', type: 'text' },
          { key: 'status', label: 'État', type: 'text' },
          { key: 'renewal', label: 'Renouvellement', type: 'text' },
          { key: 'followedBy', label: 'Suivi par', type: 'text' },
        ],
        rows: rows.map((c) => ({
          month: fromDate(c.endDate).slice(0, 7),
          endDate: fromDate(c.endDate),
          customer: displayNameOf(c.customer),
          insurer: c.insurer.code,
          product: c.product.name,
          // The formula printed on the insurer's sheet (« RC », « DC »): who could take more cover.
          formula: c.formula,
          // The usage chosen on the insurer's platform for the vehicles covered, to sort by it.
          insurerUsage:
            [...new Set(c.vehicles.map((v) => v.vehicle.insurerUsage?.label).filter(Boolean))].join(
              ', ',
            ) || null,
          policyNumber: c.policyNumber,
          status: CONTRACT_STATUS[c.status],
          renewal: c.renewal ? RENEWAL_STATUS[c.renewal.status] : 'Pas encore ouvert',
          followedBy: c.renewal?.assignedUser.displayName ?? null,
        })),
        totals: { count: rows.length },
      };
    },

    /** Money received each agency day, per method; reversals are deducted. */
    async 'paiements-jour'({ from, to }) {
      const { gte, lt } = period({ from, to });
      const groups = await prisma.$queryRaw`
        SELECT to_char("receivedAt" AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS "day", "method",
               sum("amount") AS "amount", count(*)::int AS "count"
        FROM "payment" WHERE "receivedAt" >= ${gte} AND "receivedAt" < ${lt}
        GROUP BY 1, 2 ORDER BY 1`;
      const days = new Map();
      for (const g of groups) {
        const row = days.get(g.day) ?? {
          day: g.day,
          ...Object.fromEntries(METHODS.map((m) => [m, '0.00'])),
          count: 0,
          total: '0.00',
        };
        row[g.method] = money(g.amount);
        row.count += g.count;
        row.total = money(new Prisma.Decimal(row.total).plus(g.amount));
        days.set(g.day, row);
      }
      const rows = [...days.values()];
      const moneyKeys = [...METHODS, 'total'];
      return {
        columns: [
          { key: 'day', label: 'Jour', type: 'date' },
          ...METHODS.map((m) => ({ key: m, label: METHOD_LABEL[m], type: 'money' })),
          { key: 'count', label: 'Reçus', type: 'int' },
          { key: 'total', label: 'Total (MAD)', type: 'money' },
        ],
        rows,
        totals: sumColumns(rows, moneyKeys),
      };
    },

    /** Payments and reversals per insurer over the period. */
    async 'paiements-assureur'({ from, to }) {
      const { gte, lt } = period({ from, to });
      const [insurers, groups] = await Promise.all([
        prisma.insurer.findMany({ orderBy: { code: 'asc' } }),
        prisma.$queryRaw`
          SELECT c."insurerId", p."kind", sum(p."amount") AS "amount", count(*)::int AS "count"
          FROM "payment" p JOIN "contract" c ON c."id" = p."contractId"
          WHERE p."receivedAt" >= ${gte} AND p."receivedAt" < ${lt}
          GROUP BY 1, 2`,
      ]);
      const find = (insurerId, kind) =>
        groups.find((g) => g.insurerId === insurerId && g.kind === kind);
      const rows = insurers
        .map((insurer) => {
          const paid = find(insurer.id, 'PAYMENT');
          const reversed = find(insurer.id, 'REVERSAL');
          return {
            insurer: insurer.name,
            payments: paid?.count ?? 0,
            collected: money(paid?.amount),
            reversals: reversed?.count ?? 0,
            reversed: money(reversed?.amount),
            net: money(new Prisma.Decimal(paid?.amount ?? 0).plus(reversed?.amount ?? 0)),
          };
        })
        .filter((row) => row.payments > 0 || row.reversals > 0);
      return {
        columns: [
          { key: 'insurer', label: 'Assureur', type: 'text' },
          { key: 'payments', label: 'Paiements', type: 'int' },
          { key: 'collected', label: 'Encaissé (MAD)', type: 'money' },
          { key: 'reversals', label: 'Annulations', type: 'int' },
          { key: 'reversed', label: 'Annulé (MAD)', type: 'money' },
          { key: 'net', label: 'Net (MAD)', type: 'money' },
        ],
        rows,
        totals: sumColumns(rows, ['collected', 'reversed', 'net']),
      };
    },

    /** What is still to remit today, per insurer and month of collection (rule L5). */
    async 'reversements-dus'() {
      const summary = await createRemittancesService({ prisma, audit, clock, config }).summary();
      const rows = summary.insurers.flatMap((insurer) =>
        insurer.months.map((m) => ({
          insurer: insurer.name,
          month: m.month,
          count: m.count,
          amount: m.amount,
          dueOn: m.dueOn,
          late: m.overdue ? 'En retard' : 'Dans le délai',
        })),
      );
      return {
        columns: [
          { key: 'insurer', label: 'Assureur', type: 'text' },
          { key: 'month', label: 'Mois d’encaissement', type: 'text' },
          { key: 'count', label: 'Reçus', type: 'int' },
          { key: 'amount', label: 'À reverser (MAD)', type: 'money' },
          { key: 'dueOn', label: 'À reverser au plus tard le', type: 'date' },
          { key: 'late', label: 'Délai', type: 'text' },
        ],
        rows,
        totals: sumColumns(rows, ['amount']),
      };
    },

    /**
     * Issued contracts whose customer still owes part of the premium today, oldest first: the
     * attestation is out, so the agency owes the insurer the whole premium (rule L6).
     */
    async 'soldes-clients'() {
      const day = todayIn(tz, clock.now());
      const owed = await prisma.$queryRaw`
        SELECT c."id", ${DUE_SQL} AS "due", coalesce(p."paid", 0) AS "paid", p."lastAt"
        FROM "contract" c
        LEFT JOIN (
          SELECT "contractId", sum("amount") AS "paid", max("receivedAt") AS "lastAt"
          FROM "payment" GROUP BY 1
        ) p ON p."contractId" = c."id"
        WHERE c."status" = 'ISSUED' AND ${DUE_KNOWN_SQL} AND ${DUE_SQL} > coalesce(p."paid", 0)`;
      const contracts = await prisma.contract.findMany({
        where: { id: { in: owed.map((o) => o.id) } },
        include: {
          customer: {
            select: { type: true, firstName: true, lastName: true, legalName: true, phone: true },
          },
          insurer: { select: { code: true } },
        },
        orderBy: [{ startDate: 'asc' }, { ref: 'asc' }],
      });
      const rows = contracts.map((c) => {
        const o = owed.find((row) => row.id === c.id);
        const days = Math.max(
          0,
          Math.round((Date.parse(day) - c.startDate.getTime()) / 86_400_000),
        );
        return {
          customer: displayNameOf(c.customer),
          phone: c.customer.phone,
          insurer: c.insurer.code,
          policyNumber: c.policyNumber,
          startDate: fromDate(c.startDate),
          due: money(o.due),
          paid: money(o.paid),
          balance: money(new Prisma.Decimal(o.due).minus(o.paid)),
          lastPayment: o.lastAt ? todayIn(tz, o.lastAt) : null,
          days,
          late: days > LONG_UNPAID_DAYS ? `Plus de ${LONG_UNPAID_DAYS} jours` : 'Récent',
        };
      });
      return {
        columns: [
          // What the employee needs to call first, then the details.
          { key: 'customer', label: 'Client', type: 'text' },
          { key: 'phone', label: 'Téléphone', type: 'text' },
          { key: 'balance', label: 'Reste à payer (MAD)', type: 'money' },
          { key: 'late', label: 'Relance', type: 'text' },
          { key: 'days', label: 'Jours depuis le début', type: 'int' },
          { key: 'policyNumber', label: 'N° de police', type: 'text' },
          { key: 'insurer', label: 'Assureur', type: 'text' },
          { key: 'startDate', label: 'Début', type: 'date' },
          { key: 'due', label: 'Dû (MAD)', type: 'money' },
          { key: 'paid', label: 'Payé (MAD)', type: 'money' },
          { key: 'lastPayment', label: 'Dernier paiement', type: 'date' },
        ],
        rows,
        totals: sumColumns(rows, ['due', 'paid', 'balance']),
      };
    },

    /**
     * Cash payments the agency rounded over the period: the insurer is owed the exact amount, the
     * customer gave a little more or less, and the gap is the agency's gain or loss (owner,
     * 29/10/2026). A payment cancelled since is left out: its rounding no longer holds.
     */
    async 'ecarts-caisse'({ from, to }) {
      const payments = await prisma.payment.findMany({
        where: {
          receivedAt: period({ from, to }),
          clientPaid: { not: null },
          reversedBy: { is: null },
        },
        include: {
          receivedBy: { select: { displayName: true } },
          contract: {
            select: {
              policyNumber: true,
              customer: {
                select: { type: true, firstName: true, lastName: true, legalName: true },
              },
              insurer: { select: { code: true } },
            },
          },
        },
        orderBy: { receivedAt: 'asc' },
      });
      const rows = payments.map((p) => ({
        day: todayIn(tz, p.receivedAt),
        receipt: p.receiptNumber,
        customer: displayNameOf(p.contract.customer),
        policyNumber: p.contract.policyNumber,
        insurer: p.contract.insurer.code,
        owed: money(p.amount),
        clientPaid: money(p.clientPaid),
        gap: money(p.clientPaid.minus(p.amount)),
        by: p.receivedBy.displayName,
      }));
      return {
        columns: [
          { key: 'day', label: 'Jour', type: 'date' },
          { key: 'receipt', label: 'Reçu', type: 'text' },
          { key: 'customer', label: 'Client', type: 'text' },
          { key: 'owed', label: 'Dû à l’assureur (MAD)', type: 'money' },
          { key: 'clientPaid', label: 'Donné par le client (MAD)', type: 'money' },
          { key: 'gap', label: 'Écart agence (MAD)', type: 'money' },
          { key: 'by', label: 'Accepté par', type: 'text' },
          { key: 'policyNumber', label: 'N° de police', type: 'text' },
          { key: 'insurer', label: 'Assureur', type: 'text' },
        ],
        rows,
        totals: sumColumns(rows, ['owed', 'clientPaid', 'gap']),
      };
    },

    /** Forms of each series by status today, and the movements of the period. */
    async 'stock-attestations'({ from, to }) {
      const [series, counts, movements] = await Promise.all([
        prisma.attestationSeries.findMany({
          include: { insurer: { select: { code: true } } },
          orderBy: [{ insurer: { code: 'asc' } }, { code: 'asc' }],
        }),
        prisma.attestationForm.groupBy({ by: ['seriesId', 'status'], _count: { _all: true } }),
        prisma.$queryRaw`
          SELECT f."seriesId", count(*)::int AS "count"
          FROM "attestation_form_movement" m JOIN "attestation_form" f ON f."id" = m."formId"
          WHERE m."at" >= ${period({ from, to }).gte} AND m."at" < ${period({ from, to }).lt}
          GROUP BY 1`,
      ]);
      const rows = series
        .map((s) => {
          const row = { series: `${s.insurer.code} ${s.code}`, total: 0 };
          for (const status of STOCK) {
            const found = counts.find((c) => c.seriesId === s.id && c.status === status);
            row[status] = found?._count._all ?? 0;
            row.total += row[status];
          }
          row.movements = movements.find((m) => m.seriesId === s.id)?.count ?? 0;
          return row;
        })
        .filter((row) => row.total > 0 || row.movements > 0);
      return {
        columns: [
          { key: 'series', label: 'Série', type: 'text' },
          ...STOCK.map((status) => ({ key: status, label: STOCK_LABEL[status], type: 'int' })),
          { key: 'total', label: 'Total', type: 'int' },
          { key: 'movements', label: 'Mouvements sur la période', type: 'int' },
        ],
        rows,
        totals: { count: rows.length },
      };
    },

    /** What each employee recorded over the period. */
    async 'activite-employes'({ from, to }) {
      const { gte, lt } = period({ from, to });
      const at = { gte, lt };
      const [users, contracts, issued, attestations, payments, documents, renewals] =
        await Promise.all([
          prisma.user.findMany({
            include: { role: { select: { name: true } } },
            orderBy: { displayName: 'asc' },
          }),
          prisma.contract.groupBy({
            by: ['createdById'],
            where: { createdAt: at },
            _count: { _all: true },
          }),
          prisma.contractStatusChange.groupBy({
            by: ['userId'],
            where: { at, toStatus: 'ISSUED' },
            _count: { _all: true },
          }),
          prisma.attestation.groupBy({
            by: ['createdById'],
            where: { createdAt: at },
            _count: { _all: true },
          }),
          prisma.payment.groupBy({
            by: ['receivedById'],
            where: { receivedAt: at, kind: 'PAYMENT' },
            _count: { _all: true },
            _sum: { amount: true },
          }),
          prisma.document.groupBy({
            by: ['uploadedById'],
            where: { uploadedAt: at },
            _count: { _all: true },
          }),
          prisma.renewalEvent.groupBy({
            by: ['userId'],
            where: { at },
            _count: { _all: true },
          }),
        ]);
      const count = (groups, key, id) => groups.find((g) => g[key] === id)?._count._all ?? 0;
      const rows = users
        .map((user) => {
          const paid = payments.find((p) => p.receivedById === user.id);
          return {
            name: user.displayName,
            role: user.role.name,
            contracts: count(contracts, 'createdById', user.id),
            issued: count(issued, 'userId', user.id),
            attestations: count(attestations, 'createdById', user.id),
            payments: paid?._count._all ?? 0,
            collected: money(paid?._sum.amount),
            documents: count(documents, 'uploadedById', user.id),
            renewals: count(renewals, 'userId', user.id),
          };
        })
        .filter(
          (row) =>
            row.contracts +
              row.issued +
              row.attestations +
              row.payments +
              row.documents +
              row.renewals >
            0,
        );
      return {
        columns: [
          { key: 'name', label: 'Employé', type: 'text' },
          { key: 'role', label: 'Rôle', type: 'text' },
          { key: 'contracts', label: 'Contrats créés', type: 'int' },
          { key: 'issued', label: 'Contrats émis', type: 'int' },
          { key: 'attestations', label: 'Attestations', type: 'int' },
          { key: 'payments', label: 'Paiements', type: 'int' },
          { key: 'collected', label: 'Encaissé (MAD)', type: 'money' },
          { key: 'documents', label: 'Documents joints', type: 'int' },
          { key: 'renewals', label: 'Suivis de renouvellement', type: 'int' },
        ],
        rows,
        totals: sumColumns(rows, ['collected']),
      };
    },
  };

  return {
    async build(name, query) {
      const report = await builders[name](query);
      return { name, title: REPORTS[name], ...query, ...report };
    },

    /** Every export is audited: it takes personal data out of the application. */
    async recordExport(auth, request, name, { from, to, format, rows }) {
      await audit.record({
        actorUserId: auth.user.id,
        action: 'report.exported',
        entityType: 'report',
        entityId: name,
        request,
        details: { from, to, format, rows },
      });
    },
  };
}
