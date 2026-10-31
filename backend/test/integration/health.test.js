import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { createPrisma } from '../../src/services/prisma.js';
import { memoryLogger } from '../helpers.js';

const config = loadConfig({ ...process.env, LOG_LEVEL: 'silent' });
const prisma = createPrisma(config.DATABASE_URL);
const unreachable = createPrisma('postgresql://nobody:wrong@127.0.0.1:1/agency_test');

afterAll(async () => {
  await prisma.$disconnect();
  await unreachable.$disconnect();
});

describe('readiness with a real PostgreSQL database', () => {
  it('is ready when the database answers', async () => {
    const app = createApp({ config, logger: memoryLogger().logger, prisma });
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', checks: { database: 'ok' } });
  });

  it('is not ready when the database cannot be reached', async () => {
    const app = createApp({ config, logger: memoryLogger().logger, prisma: unreachable });
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.checks.database).toBe('unavailable');
  });
});

describe('connections to the database', () => {
  it('gives up waiting for a free connection instead of hanging', async () => {
    // One connection, held by a transaction: the next query waits half a second at most.
    const small = createPrisma(config.DATABASE_URL, { max: 1, connectionTimeoutMillis: 500 });
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    const busy = small.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`;
      await held;
    });
    // Let the transaction take the only connection.
    await new Promise((resolve) => setTimeout(resolve, 200));
    const started = Date.now();
    await expect(small.$queryRaw`SELECT 1`).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
    release();
    await busy;
    await small.$disconnect();
  });
});
