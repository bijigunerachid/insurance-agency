import { readFile } from 'node:fs/promises';

const DATABASE_TIMEOUT_MS = 2000;
/** What the status page may show of the backup job's file: no path, no secret. */
const BACKUP_FIELDS = [
  'state',
  'message',
  'checkedAt',
  'disk',
  'lastBase',
  'lastWalAt',
  'diskFreeKb',
];

export function createHealthService({ prisma, backupStatusFile = null }) {
  return {
    /** The last backup run, as written by backup.sh; null when this installation has none. */
    async backup(log) {
      if (!backupStatusFile) return null;
      try {
        const data = JSON.parse(await readFile(backupStatusFile, 'utf8'));
        return Object.fromEntries(
          BACKUP_FIELDS.map((key) => [key, typeof data[key] === 'string' ? data[key] : '']),
        );
      } catch (err) {
        // Not written yet (no backup ever ran) or unreadable: the page says so.
        log.warn({ err: { code: err.code, message: err.message } }, 'backup status unreadable');
        return { state: 'unknown' };
      }
    },

    /** Readiness: can we serve real requests? Details of failures are logged, not returned. */
    async readiness(log) {
      const database = await checkDatabase(prisma, log);
      return { ready: database === 'ok', checks: { database } };
    },
  };
}

async function checkDatabase(prisma, log) {
  let timer;
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('database check timed out')),
          DATABASE_TIMEOUT_MS,
        );
      }),
    ]);
    return 'ok';
  } catch (err) {
    log.warn({ err: { message: err.message } }, 'database readiness check failed');
    return 'unavailable';
  } finally {
    clearTimeout(timer);
  }
}
