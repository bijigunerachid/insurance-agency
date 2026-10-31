import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createHealthService } from '../../src/modules/health/service.js';

const log = { warn: () => {} };
const dir = mkdtempSync(join(tmpdir(), 'agency-backup-status-'));

describe('backup status on the status page', () => {
  it('says nothing on an installation without backups (development)', async () => {
    expect(await createHealthService({ prisma: {} }).backup(log)).toBeNull();
  });

  it('gives the known fields of the backup job file, nothing else', async () => {
    const file = join(dir, 'backup.json');
    writeFileSync(
      file,
      JSON.stringify({
        state: 'ok',
        message: 'Sauvegarde à jour',
        checkedAt: '2026-10-30T19:05:00Z',
        disk: 'A',
        lastBase: '2026-10-30T060000Z',
        lastWalAt: '2026-10-30T19:00:00Z',
        diskFreeKb: '900000000',
        secret: 'never shown',
      }),
    );
    expect(await createHealthService({ prisma: {}, backupStatusFile: file }).backup(log)).toEqual({
      state: 'ok',
      message: 'Sauvegarde à jour',
      checkedAt: '2026-10-30T19:05:00Z',
      disk: 'A',
      lastBase: '2026-10-30T060000Z',
      lastWalAt: '2026-10-30T19:00:00Z',
      diskFreeKb: '900000000',
    });
  });

  it('says "unknown" when no backup ever ran or the file is damaged', async () => {
    const missing = createHealthService({ prisma: {}, backupStatusFile: join(dir, 'none.json') });
    expect(await missing.backup(log)).toEqual({ state: 'unknown' });
    const damaged = join(dir, 'damaged.json');
    writeFileSync(damaged, '{"state":');
    expect(
      await createHealthService({ prisma: {}, backupStatusFile: damaged }).backup(log),
    ).toEqual({ state: 'unknown' });
  });
});
