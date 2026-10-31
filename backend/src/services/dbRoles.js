import pg from 'pg';

export const RUNTIME_ROLE = 'app_runtime';

/**
 * Creates or updates the limited runtime role from the credentials in DATABASE_URL, connecting
 * as the database owner (MIGRATION_DATABASE_URL). Table privileges are granted by the migrations.
 * Idempotent: safe to run on every deployment.
 */
export async function ensureRuntimeRole({ migrationUrl, runtimeUrl }) {
  const runtime = new URL(runtimeUrl);
  const username = decodeURIComponent(runtime.username);
  const password = decodeURIComponent(runtime.password);
  const database = decodeURIComponent(runtime.pathname.slice(1));
  if (username !== RUNTIME_ROLE) {
    throw new Error(`DATABASE_URL must use the ${RUNTIME_ROLE} role`);
  }
  if (password.length < 16) {
    throw new Error('The runtime role password must be at least 16 characters');
  }

  const client = new pg.Client({ connectionString: migrationUrl });
  await client.connect();
  try {
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [RUNTIME_ROLE]);
    if (exists.rowCount === 0) {
      await client.query(`CREATE ROLE ${RUNTIME_ROLE}`);
    }
    // ALTER ROLE cannot take bind parameters; the literal is escaped by the driver.
    await client.query(
      `ALTER ROLE ${RUNTIME_ROLE} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION ` +
        `NOBYPASSRLS PASSWORD ${client.escapeLiteral(password)}`,
    );
    await client.query(
      `GRANT CONNECT ON DATABASE ${client.escapeIdentifier(database)} TO ${RUNTIME_ROLE}`,
    );
    await client.query(`GRANT USAGE ON SCHEMA public TO ${RUNTIME_ROLE}`);
    await client.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
  } finally {
    await client.end();
  }
}
