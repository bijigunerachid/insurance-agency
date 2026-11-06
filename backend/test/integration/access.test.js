import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
beforeEach(() => ctx.reset());
afterAll(() => ctx.close());
const { signIn } = contractFixtures(ctx);

/** Open before sign-in, on purpose (health checks, the sign-in itself, the agency's brand). */
const PUBLIC = new Set([
  'GET /api/health',
  'GET /api/ready',
  'GET /api/agency/brand',
  'GET /api/agency/logo',
  'GET /api/agency/icon',
  'GET /api/auth/me',
  'POST /api/auth/login',
]);

/**
 * Every route the application answers, read from the app itself: a route added later is in
 * this test without anyone having to list it. The authentication routes are under /api/auth.
 */
function allRoutes(app) {
  const routes = [];
  for (const layer of app.router.stack) {
    const inner = layer.handle?.stack;
    if (!inner) continue;
    const paths = inner.filter((l) => l.route).map((l) => l.route);
    const prefix = paths.some((r) => r.path === '/login') ? '/api/auth' : '/api';
    for (const route of paths) {
      for (const method of Object.keys(route.methods)) {
        const path = `${prefix}${route.path}`
          .replace(':name', 'contrats-echeances')
          .replace(/:[A-Za-z]+/g, randomUUID());
        routes.push({
          method: method.toUpperCase(),
          path,
          key: `${method.toUpperCase()} ${prefix}${route.path}`,
        });
      }
    }
  }
  return routes;
}
const call = (client, { method, path }) =>
  client.send(method.toLowerCase(), path, method === 'GET' ? undefined : {});

describe('access to every route', () => {
  it('finds the routes of every module', () => {
    const keys = allRoutes(ctx.app).map((r) => r.key);
    expect(keys.length).toBeGreaterThan(100);
    for (const key of [
      'POST /api/contracts/:id/payments',
      'GET /api/documents/:id/file',
      'POST /api/users',
    ]) {
      expect(keys).toContain(key);
    }
  });

  it('refuses every route but the public ones before sign-in', async () => {
    const anonymous = ctx.client();
    const open = [];
    for (const route of allRoutes(ctx.app)) {
      if (PUBLIC.has(route.key)) continue;
      const res = await call(anonymous, route);
      if (res.status !== 401) open.push(`${route.key} → ${res.status}`);
    }
    expect(open).toEqual([]);
  });

  it('gives the server clock on the signed-in status page only', async () => {
    const admin = await signIn('admin.a', 'ADMIN');
    const status = await admin.get('/api/system/status');
    expect(status.status).toBe(200);
    expect(status.body).toMatchObject({
      status: 'ready',
      serverTime: ctx.clock.now().toISOString(),
    });
    // The public checks say up or down, nothing more.
    expect((await ctx.client().get('/api/ready')).body).not.toHaveProperty('serverTime');
  });

  it('lets the read-only auditor change nothing, nor read what is not theirs', async () => {
    const auditor = await signIn('auditor.a', 'AUDITOR');
    const allowed = [];
    for (const route of allRoutes(ctx.app)) {
      // Their own session: sign out, change their password, confirm their identity… and their
      // own alerts marked seen.
      if (route.key.startsWith('POST /api/auth/') || PUBLIC.has(route.key)) continue;
      if (route.key === 'POST /api/notifications/seen') continue;
      if (route.method === 'GET') continue;
      const res = await call(auditor, route);
      if (res.status !== 403 || res.body.error.code !== 'FORBIDDEN') {
        allowed.push(`${route.key} → ${res.status}`);
      }
    }
    expect(allowed).toEqual([]);

    const id = randomUUID();
    for (const path of [
      '/api/users',
      '/api/scans',
      '/api/system/status',
      '/api/attestation-stock/holders',
      '/api/customers/assignees',
      '/api/renewals/assignees',
      '/api/reports/contrats-echeances/export?from=2026-10-01&to=2026-10-31&format=csv',
      '/api/production/export?from=2026-10-01&to=2026-10-31',
      `/api/documents/${id}/file`,
      `/api/documents/${id}/capture`,
      `/api/scans/${id}/file`,
    ]) {
      const res = await auditor.get(path);
      expect(res.status, path).toBe(403);
    }
    // Each refusal is in the audit log, with the permission that was missing.
    const denied = await ctx.prisma.auditLog.count({ where: { action: 'security.access_denied' } });
    expect(denied).toBeGreaterThan(40);
  });
});
