import { ensureRuntimeRole } from '../../src/services/dbRoles.js';
import { deployMigrations } from '../../src/services/migrations.js';

// Runs once before the integration tests: prepares the test database exactly like a
// deployment would (runtime role, then migrations as the owner).
export default async function setup() {
  try {
    process.loadEnvFile('.env.test');
  } catch {
    // Variables may come from the environment instead.
  }
  if (!/\/agency_test(\?|$)/.test(process.env.MIGRATION_DATABASE_URL ?? '')) {
    throw new Error('MIGRATION_DATABASE_URL must point at the agency_test database');
  }
  await ensureRuntimeRole({
    migrationUrl: process.env.MIGRATION_DATABASE_URL,
    runtimeUrl: process.env.DATABASE_URL,
  });
  deployMigrations('.env.test');
}
