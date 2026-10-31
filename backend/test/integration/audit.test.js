import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateTotpSecret, timeStep, totpCode } from '../../src/modules/auth/totp.js';
import { createAuditService } from '../../src/services/audit.js';
import { todayIn } from '../../src/utils/time.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

async function signIn(username, secret) {
  const client = ctx.client();
  await client.login(username);
  if (secret) {
    await client.post('/api/auth/totp/verify', {
      code: totpCode(secret, timeStep(ctx.clock.now())),
    });
  }
  return client;
}

describe('audit log viewer', () => {
  it('is readable by administrators, managers and auditors, not by agents', async () => {
    const adminSecret = generateTotpSecret();
    const managerSecret = generateTotpSecret();
    await ctx.createUser({ username: 'admin.a', role: 'ADMIN', totpSecret: adminSecret });
    await ctx.createUser({ username: 'manager.m', role: 'MANAGER', totpSecret: managerSecret });
    await ctx.createUser({ username: 'auditeur.x', role: 'AUDITOR' });
    await ctx.createUser({ username: 'agent.a' });

    expect((await (await signIn('admin.a', adminSecret)).get('/api/audit')).status).toBe(200);
    expect((await (await signIn('manager.m', managerSecret)).get('/api/audit')).status).toBe(200);
    expect((await (await signIn('auditeur.x')).get('/api/audit')).status).toBe(200);
    expect((await (await signIn('agent.a')).get('/api/audit')).status).toBe(403);
  });

  it('cannot be changed through the API', async () => {
    await ctx.createUser({ username: 'auditeur.x', role: 'AUDITOR' });
    const client = await signIn('auditeur.x');
    for (const method of ['post', 'put', 'patch', 'delete']) {
      const res = await client.send(method, '/api/audit', {});
      expect(res.status).toBe(404);
    }
  });

  it('filters by action, user and day (agency time zone) and pages newest first', async () => {
    await ctx.createUser({ username: 'auditeur.x', role: 'AUDITOR' });
    const client = await signIn('auditeur.x'); // writes auth.login.succeeded
    // Audit times come from the database clock (real time), not from the test clock.
    const today = todayIn('Africa/Casablanca');
    const yesterday = todayIn('Africa/Casablanca', new Date(Date.now() - 86_400_000));
    const audit = createAuditService(ctx.prisma);
    for (let i = 0; i < 3; i += 1) await audit.record({ action: 'test.sample', details: { i } });

    const all = await client.get('/api/audit?pageSize=2');
    expect(all.body).toMatchObject({ total: 4, pageCount: 2 });
    expect(all.body.items[0].action).toBe('test.sample'); // newest first
    expect(typeof all.body.items[0].id).toBe('string'); // bigint serialised safely

    const logins = await client.get('/api/audit?action=auth.login');
    expect(logins.body.items.map((e) => e.action)).toEqual(['auth.login.succeeded']);
    expect(logins.body.items[0].actor).toEqual({
      username: 'auditeur.x',
      displayName: 'Utilisateur auditeur.x',
    });

    expect((await client.get('/api/audit?actor=AUDITEUR')).body.total).toBe(1);
    // The sign-in happened today (agency time); nothing yesterday.
    expect((await client.get(`/api/audit?from=${today}&to=${today}&action=auth`)).body.total).toBe(
      1,
    );
    expect((await client.get(`/api/audit?from=${yesterday}&to=${yesterday}`)).body.total).toBe(0);
  });

  it('validates filters', async () => {
    await ctx.createUser({ username: 'auditeur.x', role: 'AUDITOR' });
    const client = await signIn('auditeur.x');
    expect((await client.get('/api/audit?from=22/10/2026')).status).toBe(400);
    expect((await client.get('/api/audit?from=2026-10-23&to=2026-10-22')).status).toBe(400);
    expect((await client.get("/api/audit?action=x' OR 1=1")).status).toBe(400);
    expect((await client.get('/api/audit?unknown=1')).status).toBe(400);
  });

  it('lists the actions present, for the filter menu', async () => {
    await ctx.createUser({ username: 'auditeur.x', role: 'AUDITOR' });
    const client = await signIn('auditeur.x');
    const res = await client.get('/api/audit/actions');
    expect(res.body.items).toEqual(['auth.login.succeeded']);
  });
});
