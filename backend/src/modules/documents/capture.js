import { Prisma } from '../../generated/prisma/client.ts';
import { HttpError } from '../../utils/httpError.js';
import { policyTaken } from '../contracts/service.js';
import { compareCapture } from './compare.js';
import { captureFieldsSchema } from './fields.js';

const userName = { select: { id: true, displayName: true } };
const notFound = (what) => new HttpError(404, 'NOT_FOUND', `${what} introuvable.`);
const conflict = () =>
  new HttpError(
    409,
    'VERSION_CONFLICT',
    'Cet élément a été modifié entre-temps. Rechargez la page et recommencez.',
  );
const invalid = (path, rule) =>
  new HttpError(400, 'VALIDATION_ERROR', 'Données invalides.', [{ path, rule }]);
const fromDate = (date) => (date ? date.toISOString().slice(0, 10) : null);
const money = (decimal) => (decimal === null || decimal === undefined ? null : decimal.toFixed(2));

/** Only an issued (or suspended) contract is corrected from a document; a draft is edited. */
const CORRECTABLE_STATUSES = ['ISSUED', 'SUSPENDED'];

const contractInclude = {
  customer: true,
  vehicles: { where: { removedAt: null }, include: { vehicle: { include: { usage: true } } } },
  attestations: { include: { series: { select: { code: true } } } },
};

/**
 * Typing what an insurer document prints, comparing it with the records, and correcting the
 * contract's policy number, dates or premium from it (owner, 24/10/2026).
 */
export function createCaptureService({ prisma, audit, clock }) {
  const record = (tx, auth, request, action, entityType, entityId, details) =>
    audit.record({ actorUserId: auth.user.id, action, entityType, entityId, request, details }, tx);

  async function loadDocument(client, id) {
    const document = await client.document.findUnique({
      where: { id },
      include: { capture: { include: { capturedBy: userName } } },
    });
    if (!document) throw notFound('Document');
    if (document.removedAt) {
      throw new HttpError(410, 'DOCUMENT_REMOVED', 'Ce document a été retiré.');
    }
    return document;
  }

  async function view(client, auth, document) {
    const contract = await client.contract.findUnique({
      where: { id: document.contractId },
      include: contractInclude,
    });
    const capture = document.capture;
    return {
      document: {
        id: document.id,
        type: document.type,
        originalName: document.originalName,
        mimeType: document.mimeType,
      },
      contract: {
        id: contract.id,
        ref: contract.ref,
        status: contract.status,
        version: contract.version,
        correctable: CORRECTABLE_STATUSES.includes(contract.status),
      },
      capture: capture
        ? {
            fields: capture.fields,
            capturedAt: capture.capturedAt,
            capturedBy: capture.capturedBy,
            version: capture.version,
          }
        : null,
      checks: capture
        ? compareCapture({ type: document.type, fields: capture.fields, contract, auth })
        : [],
    };
  }

  return {
    async get(auth, id) {
      return view(prisma, auth, await loadDocument(prisma, id));
    },

    /** Creates the capture, or corrects it (with the version read). Values are not audited. */
    async save(auth, request, id, { fields, version }) {
      const document = await loadDocument(prisma, id);
      const parsed = captureFieldsSchema(document.type).parse(fields);
      await prisma.$transaction(async (tx) => {
        const current = await tx.documentCapture.findUnique({ where: { documentId: id } });
        const data = { fields: parsed, capturedAt: clock.now(), capturedById: auth.user.id };
        if (!current) {
          if (version !== undefined) throw conflict();
          try {
            await tx.documentCapture.create({ data: { documentId: id, ...data } });
          } catch (err) {
            // Saved at the same moment from another screen.
            if (err?.code === 'P2002') throw conflict();
            throw err;
          }
        } else {
          if (version !== current.version) throw conflict();
          const { count } = await tx.documentCapture.updateMany({
            where: { id: current.id, version },
            data: { ...data, version: { increment: 1 } },
          });
          if (count === 0) throw conflict();
        }
        const keys = new Set([...Object.keys(current?.fields ?? {}), ...Object.keys(parsed)]);
        const changed = [...keys].filter(
          (key) => JSON.stringify(current?.fields?.[key]) !== JSON.stringify(parsed[key]),
        );
        await record(tx, auth, request, 'document.captured', 'document', id, { fields: changed });
      });
      return this.get(auth, id);
    },

    /**
     * Copies one value of the capture onto the issued contract. Same rules as everywhere: one
     * policy number per insurer, the end after the start, never a premium below what was paid (L4).
     */
    async apply(auth, request, id, { field, version }) {
      await prisma.$transaction(async (tx) => {
        const document = await loadDocument(tx, id);
        const contractId = document.contractId;
        // Locked like payments do: a payment and a premium correction never cross.
        const [locked] = await tx.$queryRaw`
          SELECT "id" FROM "contract" WHERE "id" = ${contractId}::uuid FOR UPDATE`;
        if (!locked) throw notFound('Contrat');
        const contract = await tx.contract.findUnique({
          where: { id: contractId },
          include: contractInclude,
        });
        if (!CORRECTABLE_STATUSES.includes(contract.status)) {
          throw new HttpError(
            409,
            'NOT_CORRECTABLE',
            'Seul un contrat émis est corrigé depuis un document ; un contrat en préparation se modifie depuis sa fiche.',
          );
        }
        const check = document.capture
          ? compareCapture({
              type: document.type,
              fields: document.capture.fields,
              contract,
              auth,
            }).find((c) => c.apply === field)
          : null;
        if (!check || check.status === 'MATCH') {
          throw new HttpError(409, 'NOTHING_TO_APPLY', 'Le document ne donne pas d’autre valeur.');
        }
        const value = check.captured;
        const data = {};
        if (field === 'policyNumber') {
          const clash = await policyTaken(
            tx,
            contract.insurerId,
            value,
            contractId,
            contract.previousContractId,
          );
          if (clash) {
            throw new HttpError(
              409,
              'DUPLICATE_POLICY',
              'Cet assureur a déjà un contrat avec ce numéro de police.',
            );
          }
          data.policyNumber = value;
        } else if (field === 'startDate' || field === 'endDate') {
          const start = field === 'startDate' ? value : fromDate(contract.startDate);
          const end = field === 'endDate' ? value : fromDate(contract.endDate);
          if (end <= start) throw invalid(field, 'END_BEFORE_START');
          data[field] = new Date(value);
        } else {
          const { _sum } = await tx.payment.aggregate({
            where: { contractId },
            _sum: { amount: true },
          });
          // What is paid may include its avenants' amounts, which stay owed on top.
          if (new Prisma.Decimal(value).plus(contract.amendmentsTotal).lessThan(_sum.amount ?? 0)) {
            throw invalid('premiumTotal', 'PREMIUM_BELOW_PAID');
          }
          data.premiumTotal = value;
        }
        const { count } = await tx.contract.updateMany({
          where: { id: contractId, version },
          data: { ...data, version: { increment: 1 } },
        });
        if (count === 0) throw conflict();
        const before = {
          policyNumber: contract.policyNumber,
          startDate: fromDate(contract.startDate),
          endDate: fromDate(contract.endDate),
          premiumTotal: money(contract.premiumTotal),
        }[field];
        await record(tx, auth, request, 'contract.corrected', 'contract', contractId, {
          field,
          from: before,
          to: value,
          documentId: id,
        });
      });
      return this.get(auth, id);
    },
  };
}
