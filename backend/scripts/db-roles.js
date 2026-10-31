// Usage: npm run db:roles  (reads backend/.env)
import { ensureRuntimeRole } from '../src/services/dbRoles.js';

const { MIGRATION_DATABASE_URL, DATABASE_URL } = process.env;
if (!MIGRATION_DATABASE_URL || !DATABASE_URL) {
  console.error('MIGRATION_DATABASE_URL and DATABASE_URL must be set.');
  process.exit(1);
}

try {
  await ensureRuntimeRole({ migrationUrl: MIGRATION_DATABASE_URL, runtimeUrl: DATABASE_URL });
  console.log('Runtime database role is ready.');
} catch (err) {
  // The message never contains credentials; the stack is not useful to an operator.
  console.error(`Could not set up the runtime role: ${err.message}`);
  process.exit(1);
}
