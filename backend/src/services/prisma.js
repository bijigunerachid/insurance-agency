import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.ts';

/**
 * Prisma's defaults (2 s to get a connection, 5 s per transaction) failed under load in the
 * e2e runs (four browsers and password hashing on one laptop): a modest office server can be
 * that busy too. Transactions stay short; these limits only stop one that is stuck.
 */
export const TRANSACTION_OPTIONS = Object.freeze({ maxWait: 10_000, timeout: 15_000 });

/**
 * The pool of connections. pg waits for a free connection forever by default: a request then
 * hangs instead of failing (seen once in an e2e run, a page left waiting a full minute). It now
 * gives up after as long as a transaction may wait, and the request answers with an error.
 */
export const POOL_OPTIONS = Object.freeze({ max: 10, connectionTimeoutMillis: 10_000 });

export function createPrisma(databaseUrl, pool = POOL_OPTIONS) {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl, ...pool }),
    transactionOptions: TRANSACTION_OPTIONS,
  });
}
