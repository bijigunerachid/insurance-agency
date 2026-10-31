import { DOCUMENT_TYPES, matchesSignature } from '../../services/documentStore.js';
import { HttpError } from '../../utils/httpError.js';

const userName = { select: { id: true, displayName: true } };
const notFound = (what) => new HttpError(404, 'NOT_FOUND', `${what} introuvable.`);

const include = {
  uploadedBy: userName,
  removedBy: userName,
  replaces: { select: { id: true, originalName: true } },
  replacedBy: { select: { id: true, originalName: true } },
};

function view(row) {
  return {
    id: row.id,
    contractId: row.contractId,
    type: row.type,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedAt: row.uploadedAt,
    uploadedBy: row.uploadedBy,
    replaces: row.replaces ?? null,
    replacedBy: row.replacedBy ?? null,
    removal: row.removedAt
      ? { at: row.removedAt, by: row.removedBy, reason: row.removeReason }
      : null,
  };
}

export function createDocumentsService({ prisma, audit, clock, store }) {
  const record = (tx, auth, request, action, entityId, details) =>
    audit.record(
      { actorUserId: auth.user.id, action, entityType: 'document', entityId, request, details },
      tx,
    );

  /** Locks the contract row: two uploads to one contract are checked one after the other. */
  async function lockContract(tx, contractId) {
    const rows = await tx.$queryRaw`
      SELECT "id" FROM "contract" WHERE "id" = ${contractId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw notFound('Contrat');
  }

  async function checkReplacement(tx, contractId, type, replacesId) {
    const old = await tx.document.findUnique({
      where: { id: replacesId },
      include: { replacedBy: { select: { id: true } } },
    });
    if (!old || old.contractId !== contractId) throw notFound('Document');
    if (old.type !== type || old.removedAt || old.replacedBy) {
      throw new HttpError(
        409,
        'CANNOT_REPLACE',
        'Ce document ne peut être remplacé que par un document du même type, une seule fois.',
      );
    }
  }

  return {
    async forContract(contractId) {
      const contract = await prisma.contract.findUnique({
        where: { id: contractId },
        select: { id: true },
      });
      if (!contract) throw notFound('Contrat');
      const rows = await prisma.document.findMany({
        where: { contractId },
        include,
        orderBy: { uploadedAt: 'desc' },
      });
      return { items: rows.map(view) };
    },

    /**
     * Keeps a scan: its type is recognised from its first bytes (never from its name), the file is
     * written first, and removed again if the database row cannot be written.
     */
    async upload(auth, request, contractId, { type, replacesId }, { buffer, mimeType, name }) {
      if (!Object.hasOwn(DOCUMENT_TYPES, mimeType)) {
        throw new HttpError(
          400,
          'UNSUPPORTED_FILE',
          'Seuls les fichiers PDF, JPEG et PNG sont acceptés.',
        );
      }
      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new HttpError(400, 'EMPTY_FILE', 'Le fichier est vide.');
      }
      if (!matchesSignature(buffer, mimeType)) {
        throw new HttpError(
          400,
          'UNSUPPORTED_FILE',
          'Le contenu du fichier ne correspond pas à son type.',
        );
      }
      const saved = await store.save(buffer, clock.now());
      try {
        const id = await prisma.$transaction(async (tx) => {
          await lockContract(tx, contractId);
          const same = await tx.document.findFirst({
            where: { contractId, sha256: saved.sha256, removedAt: null },
            select: { id: true },
          });
          if (same) {
            throw new HttpError(
              409,
              'DUPLICATE_DOCUMENT',
              'Ce fichier est déjà joint au contrat.',
              {
                documentId: same.id,
              },
            );
          }
          if (replacesId) await checkReplacement(tx, contractId, type, replacesId);
          const document = await tx.document.create({
            data: {
              contractId,
              type,
              originalName: name,
              mimeType,
              size: buffer.length,
              sha256: saved.sha256,
              storageKey: saved.storageKey,
              uploadedAt: clock.now(),
              uploadedById: auth.user.id,
              replacesId: replacesId ?? null,
            },
          });
          await record(tx, auth, request, 'document.uploaded', document.id, {
            contractId,
            type,
            size: buffer.length,
            ...(replacesId ? { replaces: replacesId } : {}),
          });
          return document.id;
        });
        return view(await prisma.document.findUnique({ where: { id }, include }));
      } catch (err) {
        await store.discard(saved.storageKey);
        throw err;
      }
    },

    /** The file to send. Every opening is audited: scans carry personal data. */
    async open(auth, request, id) {
      const row = await prisma.document.findUnique({ where: { id } });
      if (!row) throw notFound('Document');
      if (row.removedAt) {
        throw new HttpError(410, 'DOCUMENT_REMOVED', 'Ce document a été retiré.');
      }
      const stream = await store.open(row.storageKey);
      await record(prisma, auth, request, 'document.opened', id, { contractId: row.contractId });
      return { row, stream };
    },

    /** A document attached by mistake is removed with a reason; the row and the file are kept. */
    async remove(auth, request, id, { reason }) {
      await prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw`
          SELECT "removedAt" FROM "document" WHERE "id" = ${id}::uuid FOR UPDATE`;
        if (!row) throw notFound('Document');
        if (row.removedAt) {
          throw new HttpError(409, 'ALREADY_REMOVED', 'Ce document est déjà retiré.');
        }
        await tx.document.update({
          where: { id },
          data: { removedAt: clock.now(), removedById: auth.user.id, removeReason: reason },
        });
        await record(tx, auth, request, 'document.removed', id, {});
      });
      return view(await prisma.document.findUnique({ where: { id }, include }));
    },
  };
}
