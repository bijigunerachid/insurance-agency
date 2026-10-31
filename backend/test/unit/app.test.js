import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { memoryLogger, testConfig } from '../helpers.js';

const healthyPrisma = { $queryRaw: async () => [{ '?column?': 1 }] };

function app(prisma = healthyPrisma) {
  return createApp({ config: testConfig(), logger: memoryLogger().logger, prisma });
}

describe('app', () => {
  it('answers the liveness check with security headers and a request id', async () => {
    const res = await request(app()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sends no CORS header to other origins', async () => {
    const res = await request(app()).get('/api/health').set('Origin', 'http://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app()).get('/api/nothing-here');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('rejects bodies over the size limit', async () => {
    const res = await request(app())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(200 * 1024) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects malformed JSON without echoing it', async () => {
    const res = await request(app())
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken": secret-value');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
    expect(JSON.stringify(res.body)).not.toContain('secret-value');
  });

  it('reports not ready when the database fails, without details', async () => {
    const failing = {
      $queryRaw: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:5432 password=leak');
      },
    };
    const res = await request(app(failing)).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'not_ready', checks: { database: 'unavailable' } });
  });
});

describe('errorHandler', () => {
  it('hides internal error details from the response but logs them', () => {
    const { logger, lines } = memoryLogger();
    const req = { id: 'req-1', log: logger };
    const res = {
      statusCode: 0,
      body: undefined,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    errorHandler(new Error('SELECT * FROM secret_table failed'), req, res, () => {});
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur.', requestId: 'req-1' },
    });
    expect(lines.join('')).toContain('secret_table');
  });

  it('answers "server busy" when no database transaction could run in time', () => {
    const { logger, lines } = memoryLogger();
    const req = { id: 'req-2', log: logger };
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    const err = Object.assign(new Error('Transaction API error: Unable to start a transaction'), {
      code: 'P2028',
    });
    errorHandler(err, req, res, () => {});
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'SERVER_BUSY', requestId: 'req-2' });
    // Still logged with its details, as an error.
    expect(lines.join('')).toContain('Unable to start a transaction');

    // Every connection of the pool busy past its limit: busy too, not an internal error.
    errorHandler(new Error('timeout exceeded when trying to connect'), req, res, () => {});
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatchObject({ code: 'SERVER_BUSY' });
  });
});
