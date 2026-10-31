import { defineConfig } from 'prisma/config';

// Prisma CLI does not read .env files itself; load one when present.
// PRISMA_ENV_FILE lets tooling point at another file (the tests use .env.test).
const envFile = process.env.PRISMA_ENV_FILE ?? '.env';
try {
  process.loadEnvFile(envFile);
} catch {
  // File absent: rely on the environment.
}

// Migrations run as the database owner, never as the runtime role.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.MIGRATION_DATABASE_URL ?? '' },
});
