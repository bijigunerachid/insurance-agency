import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, constants, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Storage keys are made here only: "YYYY/MM/<uuid>". Anything else is refused. */
const KEY_PATTERN = /^\d{4}\/\d{2}\/[0-9a-f-]{36}$/;

/**
 * Files attached to records, on the server's disk under `dir` (outside the web root). Names on
 * disk are random: the original name is only kept in the database. A file is never overwritten.
 */
export function createDocumentStore(dir) {
  const pathOf = (key) => {
    if (!KEY_PATTERN.test(key)) throw new Error('invalid storage key');
    return join(dir, ...key.split('/'));
  };

  return {
    dir,

    /** Creates the folder if needed and checks the server can write to it (startup check). */
    async ensureReady() {
      await mkdir(dir, { recursive: true });
      await access(dir, constants.R_OK | constants.W_OK);
    },

    async save(buffer, now = new Date()) {
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const storageKey = `${now.getUTCFullYear()}/${month}/${randomUUID()}`;
      const path = pathOf(storageKey);
      await mkdir(join(path, '..'), { recursive: true });
      await writeFile(path, buffer, { flag: 'wx' });
      return { storageKey, sha256: createHash('sha256').update(buffer).digest('hex') };
    },

    /** A readable stream of the file; fails before anything is sent when the file is missing. */
    async open(storageKey) {
      const path = pathOf(storageKey);
      await access(path, constants.R_OK);
      return createReadStream(path);
    },

    /** Only to undo a save whose database row could not be written. */
    async discard(storageKey) {
      await rm(pathOf(storageKey), { force: true });
    },
  };
}

/** The file types accepted, recognised by their first bytes, not by their name. */
export const DOCUMENT_TYPES = Object.freeze({
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d], // %PDF-
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
});

/** True when the content starts with the signature of `mimeType`. */
export function matchesSignature(buffer, mimeType) {
  const signature = Object.hasOwn(DOCUMENT_TYPES, mimeType) ? DOCUMENT_TYPES[mimeType] : null;
  return Boolean(signature) && signature.every((byte, i) => buffer[i] === byte);
}
