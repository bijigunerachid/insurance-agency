import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/env.js';
import { hashPassword } from '../../src/modules/auth/passwords.js';
import { SESSION_COOKIE } from '../../src/modules/auth/tokens.js';
import { createPrisma } from '../../src/services/prisma.js';
import { createSecretBox } from '../../src/services/secretBox.js';
import { memoryLogger } from '../helpers.js';
import { resetSql } from '../referenceData.js';

export const PASSWORD = 'Synthétique-Test-2026!';

/** A clock the test can move forward. */
export function testClock(start = '2026-10-22T09:00:00Z') {
  let current = new Date(start).getTime();
  return {
    now: () => new Date(current),
    advance(ms) {
      current += ms;
    },
  };
}

export function createTestContext() {
  // Production login limit, whatever the environment says, so its test checks the real value.
  // Documents go to a temporary folder of this test file, removed when it closes.
  const config = loadConfig({
    ...process.env,
    LOG_LEVEL: 'silent',
    LOGIN_MAX_PER_IP: '20',
    DOCUMENTS_DIR: mkdtempSync(join(tmpdir(), 'agency-documents-')),
  });
  const prisma = createPrisma(config.DATABASE_URL);
  const owner = new pg.Pool({ connectionString: process.env.MIGRATION_DATABASE_URL, max: 2 });
  const secretBox = createSecretBox(config.TOTP_ENCRYPTION_KEY);

  const ctx = {
    config,
    prisma,
    owner,

    /**
     * Empties the tables as the database owner (TRUNCATE is not blocked by the audit trigger)
     * and builds a fresh app, clock and logger so in-memory rate limits do not leak between tests.
     */
    async reset() {
      rmSync(config.DOCUMENTS_DIR, { recursive: true, force: true });
      mkdirSync(config.DOCUMENTS_DIR);
      // Catalogue reference rows are restored exactly as the migration seeds them.
      await owner.query(resetSql());
      const log = memoryLogger();
      ctx.clock = testClock();
      ctx.logLines = log.lines;
      // The scan reader returns what the test sets in ctx.reading (the real one has its own test).
      ctx.reading = null;
      const ocr = { recognize: async () => ctx.reading, close: async () => {} };
      ctx.app = createApp({ config, logger: log.logger, prisma, clock: ctx.clock, ocr });
    },

    async createUser({
      username = 'agent.test',
      role = 'AGENT',
      password = PASSWORD,
      active = true,
      mustChangePassword = false,
      totpSecret = null,
    } = {}) {
      const roleRow = await prisma.role.findUniqueOrThrow({ where: { code: role } });
      return prisma.user.create({
        data: {
          username,
          displayName: `Utilisateur ${username}`,
          passwordHash: await hashPassword(password),
          roleId: roleRow.id,
          active,
          mustChangePassword,
          totpSecret: totpSecret ? secretBox.encrypt(totpSecret) : null,
          totpEnabledAt: totpSecret ? ctx.clock.now() : null,
          // On the test clock, like everything the application dates.
          createdAt: ctx.clock.now(),
        },
      });
    },

    client() {
      return new ApiClient(ctx.app, config.APP_ORIGIN);
    },

    async auditActions() {
      const rows = await prisma.auditLog.findMany({ orderBy: { id: 'asc' } });
      return rows.map((row) => row.action);
    },

    async close() {
      await prisma.$disconnect();
      await owner.end();
      rmSync(config.DOCUMENTS_DIR, { recursive: true, force: true });
    },
  };
  return ctx;
}

function collectBytes(res, done) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
}

/**
 * Browser-like client: keeps the session cookie (supertest's cookie jar ignores Secure
 * cookies over http), sends the Origin header and the CSRF token like the frontend does.
 */
export class ApiClient {
  constructor(app, origin) {
    this.app = app;
    this.origin = origin;
    this.cookie = null;
    this.csrfToken = null;
  }

  async send(
    method,
    path,
    body,
    { origin = this.origin, csrf = true, headers = {}, binary = false } = {},
  ) {
    let req = request(this.app)[method](path).set(headers);
    // A file in the answer: keep its bytes in res.body.
    if (binary) req = req.buffer(true).parse(collectBytes);
    if (origin) req = req.set('Origin', origin);
    if (this.cookie) req = req.set('Cookie', `${SESSION_COOKIE}=${this.cookie}`);
    if (csrf && this.csrfToken) req = req.set('X-CSRF-Token', this.csrfToken);
    const res = body === undefined ? await req : await req.send(body);

    const setCookie = (res.headers['set-cookie'] ?? []).find((c) =>
      c.startsWith(`${SESSION_COOKIE}=`),
    );
    if (setCookie) {
      const value = setCookie.slice(SESSION_COOKIE.length + 1).split(';')[0];
      this.cookie = value || null;
      this.lastSetCookie = setCookie;
    }
    if (res.body?.csrfToken) this.csrfToken = res.body.csrfToken;
    return res;
  }

  /** A file sent by the API, its bytes in res.body. */
  getFile(path, options) {
    return this.send('get', path, undefined, { ...options, binary: true });
  }

  get(path, options) {
    return this.send('get', path, undefined, options);
  }

  post(path, body = {}, options) {
    return this.send('post', path, body, options);
  }

  put(path, body = {}, options) {
    return this.send('put', path, body, options);
  }

  /** Sends a file as the request body, like the browser's upload does. */
  upload(
    path,
    buffer,
    { type = 'application/pdf', name = 'scan.pdf', encodedName, ...options } = {},
  ) {
    const headers = {
      'Content-Type': type,
      'X-File-Name': encodedName ?? encodeURIComponent(name),
    };
    return this.send('post', path, buffer, { ...options, headers });
  }

  login(username, password = PASSWORD) {
    return this.post('/api/auth/login', { username, password });
  }
}
