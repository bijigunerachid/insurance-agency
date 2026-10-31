import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const backendDir = fileURLToPath(new URL('../../', import.meta.url));
const prismaCli = join(dirname(require.resolve('prisma/package.json')), 'build', 'index.js');

/**
 * Applies pending migrations as the database owner (`prisma migrate deploy`), reading the
 * given env file. Runs the CLI with Node directly: no shell, no argument concatenation.
 */
export function deployMigrations(envFile) {
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendDir,
    env: { ...process.env, PRISMA_ENV_FILE: envFile },
    stdio: 'pipe',
  });
}
