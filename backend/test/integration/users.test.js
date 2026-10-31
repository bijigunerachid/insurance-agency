import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateTotpSecret, timeStep, totpCode } from '../../src/modules/auth/totp.js';
import { createUsersService } from '../../src/modules/users/service.js';
import { createAuditService } from '../../src/services/audit.js';
import { createTestContext, PASSWORD } from './support.js';

const ctx = createTestContext();
const MINUTE = 60 * 1000;

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const code = (secret) => totpCode(secret, timeStep(ctx.clock.now()));

/** Signs in a user with a second factor and returns the client. */
async function signIn(username, secret) {
  const client = ctx.client();
  await client.login(username);
  if (secret) await client.post('/api/auth/totp/verify', { code: code(secret) });
  return client;
}

async function adminClient({ reauth = true } = {}) {
  const secret = generateTotpSecret();
  const admin = await ctx.createUser({ username: 'admin.chef', role: 'ADMIN', totpSecret: secret });
  const client = await signIn('admin.chef', secret);
  if (reauth) {
    ctx.clock.advance(31 * 1000); // new TOTP step: the sign-in code cannot be reused
    await client.post('/api/auth/reauth', { password: PASSWORD, code: code(secret) });
  }
  return { client, admin, secret };
}

const versionOf = async (id) =>
  (await ctx.prisma.user.findUnique({ where: { id }, select: { version: true } })).version;

describe('access to user administration', () => {
  it('is refused to agents, managers and auditors', async () => {
    const secret = generateTotpSecret();
    await ctx.createUser({ username: 'agent.a' });
    await ctx.createUser({ username: 'manager.m', role: 'MANAGER', totpSecret: secret });
    await ctx.createUser({ username: 'auditeur.x', role: 'AUDITOR' });

    for (const client of [
      await signIn('agent.a'),
      await signIn('manager.m', secret),
      await signIn('auditeur.x'),
    ]) {
      expect((await client.get('/api/users')).status).toBe(403);
      expect(
        (await client.post('/api/users', { username: 'x.y', displayName: 'X', roleCode: 'ADMIN' }))
          .status,
      ).toBe(403);
    }
  });

  it('lists, searches and pages users for an administrator', async () => {
    const { client } = await adminClient({ reauth: false });
    for (let i = 0; i < 5; i += 1) await ctx.createUser({ username: `agent.${i}` });
    await ctx.createUser({ username: 'ancien', active: false });

    const page = await client.get('/api/users?pageSize=2&page=2');
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ total: 6, page: 2, pageSize: 2, pageCount: 3 });
    expect(page.body.items).toHaveLength(2);
    expect(page.body.items[0]).not.toHaveProperty('passwordHash');
    expect(page.body.items[0]).not.toHaveProperty('totpSecret');

    expect((await client.get('/api/users?q=AGENT.3')).body.items.map((u) => u.username)).toEqual([
      'agent.3',
    ]);
    expect((await client.get('/api/users?status=disabled')).body.total).toBe(1);
    expect((await client.get('/api/users?pageSize=1000')).status).toBe(400);
  });

  it('answers 404 for an unknown id and 400 for a malformed one', async () => {
    const { client } = await adminClient({ reauth: false });
    expect((await client.get('/api/users/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await client.get('/api/users/not-a-uuid')).status).toBe(400);
  });
});

describe('creating a user', () => {
  it('requires a recent re-authentication', async () => {
    const { client } = await adminClient({ reauth: false });
    const res = await client.post('/api/users', {
      username: 'nouvel.agent',
      displayName: 'Nouvel agent',
      roleCode: 'AGENT',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('REAUTH_REQUIRED');
  });

  it('expires the re-authentication after five minutes', async () => {
    const { client } = await adminClient();
    ctx.clock.advance(5 * MINUTE + 1000);
    const res = await client.post('/api/users', {
      username: 'nouvel.agent',
      displayName: 'Nouvel agent',
      roleCode: 'AGENT',
    });
    expect(res.body.error.code).toBe('REAUTH_REQUIRED');
  });

  it('creates the account with a one-time temporary password that must be changed', async () => {
    const { client } = await adminClient();
    const res = await client.post('/api/users', {
      username: 'Nouvel.Agent',
      displayName: 'Nouvel agent',
      roleCode: 'AGENT',
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'nouvel.agent', mustChangePassword: true });
    const { temporaryPassword } = res.body;
    expect(temporaryPassword).toMatch(/^[A-Za-z2-9]{4}(-[A-Za-z2-9]{4}){3}$/);

    const newcomer = ctx.client();
    expect((await newcomer.login('nouvel.agent', temporaryPassword)).body.stage).toBe(
      'PASSWORD_CHANGE',
    );

    const event = await ctx.prisma.auditLog.findFirst({ where: { action: 'user.created' } });
    expect(event.details).toEqual({ via: 'administration', role: 'AGENT' });
    const everything = JSON.stringify(await ctx.prisma.auditLog.findMany(), (k, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    expect(everything).not.toContain(temporaryPassword);
    expect(ctx.logLines.join('')).not.toContain(temporaryPassword);
  });

  it('refuses duplicates, bad usernames, unknown roles and extra fields', async () => {
    const { client } = await adminClient();
    await ctx.createUser({ username: 'deja.la' });
    const base = { username: 'nouveau', displayName: 'Nouveau', roleCode: 'AGENT' };

    expect((await client.post('/api/users', { ...base, username: 'deja.la' })).status).toBe(409);
    expect((await client.post('/api/users', { ...base, username: 'a b' })).status).toBe(400);
    expect((await client.post('/api/users', { ...base, roleCode: 'SUPERADMIN' })).status).toBe(400);
    // Mass assignment: fields the form does not own are rejected, not ignored.
    for (const extra of [{ active: false }, { passwordHash: 'x' }, { mustChangePassword: false }]) {
      expect((await client.post('/api/users', { ...base, ...extra })).status).toBe(400);
    }
  });
});

describe('changing an account', () => {
  it('changes the role, ends the user’s sessions and audits from/to', async () => {
    const { client } = await adminClient();
    const agent = await ctx.createUser({ username: 'agent.a' });
    const agentClient = await signIn('agent.a');

    const res = await client.send('patch', `/api/users/${agent.id}`, {
      roleCode: 'AUDITOR',
      version: agent.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.role.code).toBe('AUDITOR');
    expect((await agentClient.get('/api/auth/me')).body.authenticated).toBe(false);

    const event = await ctx.prisma.auditLog.findFirst({ where: { action: 'user.updated' } });
    expect(event.details).toEqual({
      changes: { role: { from: 'AGENT', to: 'AUDITOR' } },
      sessionsEnded: 1,
    });
  });

  it('refuses an update based on an outdated version', async () => {
    const { client } = await adminClient();
    const agent = await ctx.createUser({ username: 'agent.a' });
    const first = await client.send('patch', `/api/users/${agent.id}`, {
      displayName: 'Premier',
      version: agent.version,
    });
    expect(first.status).toBe(200);
    const stale = await client.send('patch', `/api/users/${agent.id}`, {
      displayName: 'Second',
      version: agent.version,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    const stored = await ctx.prisma.user.findUnique({ where: { id: agent.id } });
    expect(stored.displayName).toBe('Premier');
  });

  it('disables an account and cuts its open session at once', async () => {
    const { client } = await adminClient();
    const agent = await ctx.createUser({ username: 'agent.a' });
    const agentClient = await signIn('agent.a');

    const res = await client.post(`/api/users/${agent.id}/disable`, { version: agent.version });
    expect(res.body.active).toBe(false);
    expect((await agentClient.get('/api/auth/me')).body.authenticated).toBe(false);
    expect((await ctx.client().login('agent.a')).status).toBe(401);

    await client.post(`/api/users/${agent.id}/enable`, { version: await versionOf(agent.id) });
    expect((await ctx.client().login('agent.a')).status).toBe(200);
  });

  it('protects the administrator from locking themselves out', async () => {
    const { client, admin } = await adminClient();
    const self = (path, body) => client.post(`/api/users/${admin.id}/${path}`, body);
    const version = admin.version;

    expect((await self('disable', { version })).body.error.code).toBe('SELF_ACTION');
    expect((await self('reset-password', { version })).body.error.code).toBe('SELF_ACTION');
    expect((await self('reset-two-factor', { version })).body.error.code).toBe('SELF_ACTION');
    const role = await client.send('patch', `/api/users/${admin.id}`, {
      roleCode: 'AGENT',
      version,
    });
    expect(role.body.error.code).toBe('SELF_ACTION');
  });

  it('never leaves the agency without an active administrator, even under a race', async () => {
    // Two administrators try to disable each other at the same moment.
    const { client: first, admin: firstAdmin } = await adminClient();
    const secret = generateTotpSecret();
    const secondAdmin = await ctx.createUser({
      username: 'admin.deux',
      role: 'ADMIN',
      totpSecret: secret,
    });
    const second = await signIn('admin.deux', secret);
    ctx.clock.advance(31 * 1000);
    await second.post('/api/auth/reauth', { password: PASSWORD, code: code(secret) });

    const results = await Promise.all([
      first.post(`/api/users/${secondAdmin.id}/disable`, { version: secondAdmin.version }),
      second.post(`/api/users/${firstAdmin.id}/disable`, { version: firstAdmin.version }),
    ]);
    // One wins. The other is refused: either by the last-administrator rule (409), or because
    // the winner already disabled and signed out its author before it was processed (401).
    const statuses = results.map((r) => r.status).sort();
    expect(statuses[0]).toBe(200);
    expect([401, 409]).toContain(statuses[1]);

    const activeAdmins = await ctx.prisma.user.count({
      where: { active: true, role: { code: 'ADMIN' } },
    });
    expect(activeAdmins).toBe(1);
  });

  it('locks the administrators while checking, so simultaneous disables cannot both pass', async () => {
    // Deterministic version of the race: both actions start before either commits.
    const first = await ctx.createUser({ username: 'admin.un', role: 'ADMIN' });
    const second = await ctx.createUser({ username: 'admin.deux', role: 'ADMIN' });
    const service = createUsersService({
      prisma: ctx.prisma,
      audit: createAuditService(ctx.prisma),
      clock: ctx.clock,
    });
    const results = await Promise.allSettled([
      service.disable({ actor: first, request: {} }, second.id, { version: second.version }),
      service.disable({ actor: second, request: {} }, first.id, { version: first.version }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((r) => r.status === 'rejected').reason.code).toBe('LAST_ADMIN');
  });
});

describe('resets', () => {
  it('resets a password: old one stops working, sessions end, lock is cleared', async () => {
    const { client } = await adminClient();
    const agent = await ctx.createUser({ username: 'agent.a' });
    const agentClient = await signIn('agent.a');
    await ctx.prisma.user.update({
      where: { id: agent.id },
      data: { failedLogins: 12, lockedUntil: new Date(ctx.clock.now().getTime() + 10 * MINUTE) },
    });

    const res = await client.post(`/api/users/${agent.id}/reset-password`, {
      version: agent.version,
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ mustChangePassword: true, locked: false });
    expect((await agentClient.get('/api/auth/me')).body.authenticated).toBe(false);
    expect((await ctx.client().login('agent.a', PASSWORD)).status).toBe(401);
    expect((await ctx.client().login('agent.a', res.body.temporaryPassword)).body.stage).toBe(
      'PASSWORD_CHANGE',
    );
  });

  it('resets the second factor so the user must enrol again', async () => {
    const { client } = await adminClient();
    const managerSecret = generateTotpSecret();
    const manager = await ctx.createUser({
      username: 'manager.m',
      role: 'MANAGER',
      totpSecret: managerSecret,
    });

    const res = await client.post(`/api/users/${manager.id}/reset-two-factor`, {
      version: manager.version,
    });
    expect(res.body.twoFactorEnabled).toBe(false);
    expect((await ctx.client().login('manager.m')).body.stage).toBe('TOTP_ENROLL');
  });

  it('unlocks an account and ends sessions on request', async () => {
    const { client } = await adminClient();
    const agent = await ctx.createUser({ username: 'agent.a' });
    const agentClient = await signIn('agent.a');
    await ctx.prisma.user.update({
      where: { id: agent.id },
      data: { failedLogins: 10, lockedUntil: new Date(ctx.clock.now().getTime() + 10 * MINUTE) },
    });

    const unlocked = await client.post(`/api/users/${agent.id}/unlock`, { version: agent.version });
    expect(unlocked.body.locked).toBe(false);

    const ended = await client.post(`/api/users/${agent.id}/end-sessions`);
    expect(ended.body.activeSessions).toBe(0);
    expect((await agentClient.get('/api/auth/me')).body.authenticated).toBe(false);
    expect(await ctx.auditActions()).toEqual(
      expect.arrayContaining(['user.unlocked', 'user.sessions_ended']),
    );
  });
});
