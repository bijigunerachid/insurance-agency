import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ensureRuntimeRole } from '../backend/src/services/dbRoles.js';
import { deployMigrations } from '../backend/src/services/migrations.js';
import { resetSql } from '../backend/test/referenceData.js';
import { E2E_DOCUMENTS_DIR } from './paths.js';

// Prepares the test database like a deployment (runtime role, migrations), then empties the
// tables and restores the catalogue reference rows, so every run starts from a known state.
// Only ever touches agency_test.
export default async function globalSetup() {
  process.loadEnvFile(fileURLToPath(new URL('../backend/.env.test', import.meta.url)));
  if (!/\/agency_test(\?|$)/.test(process.env.MIGRATION_DATABASE_URL ?? '')) {
    throw new Error('E2E tests must use the agency_test database');
  }
  await ensureRuntimeRole({
    migrationUrl: process.env.MIGRATION_DATABASE_URL,
    runtimeUrl: process.env.DATABASE_URL,
  });
  deployMigrations('.env.test');
  const owner = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await owner.connect();
  await owner.query(resetSql());
  await owner.end();
  rmSync(E2E_DOCUMENTS_DIR, { recursive: true, force: true });
}
