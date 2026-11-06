import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createAuthService } from '../../src/modules/auth/service.js';
import { generateTotpSecret, timeStep, totpCode } from '../../src/modules/auth/totp.js';
import { createAuditService } from '../../src/services/audit.js';
import { createSecretBox } from '../../src/services/secretBox.js';
import { createTestContext, PASSWORD } from './support.js';

const ctx = createTestContext();
const MINUTE = 60 * 1000;
const NEW_PASSWORD = 'Nouveau-Mot-De-Passe-Sûr-42';

beforeEach(() => ctx.reset());
afterAll(() => ctx.close());

const codeNow = (secret) => totpCode(secret, timeStep(ctx.clock.now()));

describe('login', () => {
  it('signs an agent in with a hardened session cookie', async () => {
    await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();

    const res = await client.login('Agent.Test');
    expect(res.status).toBe(200);
    expect(res.body.stage).toBe('ACTIVE');
    expect(client.lastSetCookie).toMatch(/^__Host-session=[A-Za-z0-9_-]{43};/);
    expect(client.lastSetCookie).toMatch(/HttpOnly/);
    expect(client.lastSetCookie).toMatch(/Secure/);
    expect(client.lastSetCookie).toMatch(/SameSite=Strict/);
    expect(client.lastSetCookie).toMatch(/Path=\//);
    expect(client.lastSetCookie).not.toMatch(/Domain=/);

    const me = await client.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ username: 'agent.test', role: { code: 'AGENT' } });
    expect(me.body.user.permissions).toEqual([
      'catalogue.read',
      'contracts.read',
      'contracts.write',
      'customers.read',
      'customers.reveal',
      'customers.write',
      'documents.capture',
      'documents.download',
      'documents.read',
      'documents.upload',
      'payments.read',
      'payments.record',
      'production.read',
      'renewals.read',
      'renewals.write',
      'scans.manage',
      'stock.read',
      'vehicles.read',
      'vehicles.write',
    ]);
    expect(me.body.user).not.toHaveProperty('passwordHash');
    expect(await ctx.auditActions()).toEqual(['auth.login.succeeded']);
  });

  it('gives the same answer for a wrong password, an unknown user and a disabled account', async () => {
    await ctx.createUser({ username: 'agent.test' });
    await ctx.createUser({ username: 'ancien.agent', active: false });
    const client = ctx.client();

    const answers = await Promise.all([
      client.login('agent.test', 'Mauvais-Mot-De-Passe-1'),
      client.login('personne', PASSWORD),
      client.login('ancien.agent', PASSWORD),
    ]);
    for (const res of answers) {
      expect(res.status).toBe(401);
      expect(res.body.error).toMatchObject({
        code: 'INVALID_CREDENTIALS',
        message: 'Identifiant ou mot de passe incorrect.',
      });
    }
    expect(client.cookie).toBeNull();
    const failures = await ctx.prisma.auditLog.findMany({ where: { action: 'auth.login.failed' } });
    expect(failures.map((f) => f.details.reason).sort()).toEqual([
      'disabled',
      'unknown_user',
      'wrong_password',
    ]);
  });

  it('never writes the password to logs or the audit trail', async () => {
    await ctx.createUser({ username: 'agent.test' });
    await ctx.client().login('agent.test', 'Mot-De-Passe-Errone-123');
    await ctx.client().login('agent.test');
    const audit = JSON.stringify(await ctx.prisma.auditLog.findMany(), (key, value) =>
      typeof value === 'bigint' ? value.toString() : value,
    );
    for (const secret of [PASSWORD, 'Mot-De-Passe-Errone-123']) {
      expect(ctx.logLines.join('')).not.toContain(secret);
      expect(audit).not.toContain(secret);
    }
  });

  it('slows down repeated failures, then lets the right password in after the delay', async () => {
    await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();
    for (let i = 0; i < 3; i += 1) {
      expect((await client.login('agent.test', 'Mauvais-Mot-De-Passe-1')).status).toBe(401);
    }
    // Even the right password is refused during the delay.
    expect((await client.login('agent.test')).status).toBe(429);
    ctx.clock.advance(1500);
    expect((await client.login('agent.test')).status).toBe(200);

    const user = await ctx.prisma.user.findUnique({ where: { username: 'agent.test' } });
    expect(user.failedLogins).toBe(0);
  });

  it('locks the account for 15 minutes after 10 failures', async () => {
    await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();
    for (let i = 0; i < 10; i += 1) {
      ctx.clock.advance(61 * 1000); // wait out the progressive delay each time
      expect((await client.login('agent.test', 'Mauvais-Mot-De-Passe-1')).status).toBe(401);
    }
    const user = await ctx.prisma.user.findUnique({ where: { username: 'agent.test' } });
    expect(user.lockedUntil).not.toBeNull();

    ctx.clock.advance(14 * MINUTE);
    expect((await client.login('agent.test')).status).toBe(429);
    ctx.clock.advance(2 * MINUTE);
    expect((await client.login('agent.test')).status).toBe(200);

    const locked = await ctx.prisma.auditLog.findMany({ where: { action: 'auth.login.failed' } });
    expect(locked.at(-1).details).toMatchObject({ failedLogins: 10, locked: true });
  });

  it('limits login attempts per address to 20 per 15 minutes', async () => {
    const client = ctx.client();
    for (let i = 0; i < 20; i += 1) {
      expect((await client.login(`inconnu${i}`, 'Mauvais-Mot-De-Passe-1')).status).toBe(401);
    }
    expect((await client.login('inconnu', 'Mauvais-Mot-De-Passe-1')).status).toBe(429);
    ctx.clock.advance(15 * MINUTE + 1000);
    expect((await client.login('inconnu', 'Mauvais-Mot-De-Passe-1')).status).toBe(401);
  });

  it('refuses a login request from another origin', async () => {
    await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();
    expect(
      (
        await client.post(
          '/api/auth/login',
          { username: 'agent.test', password: PASSWORD },
          { origin: 'http://evil.example' },
        )
      ).body.error.code,
    ).toBe('ORIGIN_REJECTED');
    expect(
      (
        await client.post(
          '/api/auth/login',
          { username: 'agent.test', password: PASSWORD },
          { origin: null },
        )
      ).status,
    ).toBe(403);
  });

  it('rejects unexpected fields and oversized passwords', async () => {
    const client = ctx.client();
    const extra = await client.post('/api/auth/login', {
      username: 'a',
      password: 'b',
      role: 'ADMIN',
    });
    expect(extra.status).toBe(400);
    const huge = await client.post('/api/auth/login', {
      username: 'a',
      password: 'x'.repeat(5000),
    });
    expect(huge.status).toBe(400);
  });
});

describe('security review fixes (October 2026)', () => {
  it('throttles unknown usernames exactly like real ones, so 429 reveals nothing', async () => {
    await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();
    const answers = async (name) => {
      const statuses = [];
      for (let i = 0; i < 4; i += 1) {
        statuses.push((await client.login(name, 'Mauvais-Mot-De-Passe-1')).status);
      }
      return statuses;
    };
    expect(await answers('agent.test')).toEqual([401, 401, 401, 429]);
    expect(await answers('personne.inconnue')).toEqual([401, 401, 401, 429]);
  });

  it('does not record a password typed by mistake in the username field', async () => {
    await ctx.client().login('Mon Mot De Passe Secret!', 'x');
    const event = await ctx.prisma.auditLog.findFirst({ where: { action: 'auth.login.failed' } });
    expect(event.details).toEqual({ reason: 'unknown_user', username: '[format invalide]' });
  });

  it('issues a new session token on re-authentication', async () => {
    await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();
    await client.login('agent.test');
    const before = client.cookie;
    const res = await client.post('/api/auth/reauth', { password: PASSWORD });
    expect(res.status).toBe(200);
    expect(client.cookie).not.toBe(before);

    const stale = ctx.client();
    stale.cookie = before;
    expect((await stale.get('/api/auth/me')).body.authenticated).toBe(false);
    // The new CSRF token from the response works.
    expect((await client.post('/api/auth/logout')).status).toBe(204);
  });

  it('asks for re-authentication before adding a second factor from a signed-in session', async () => {
    await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();
    await client.login('agent.test');

    const refused = await client.post('/api/auth/totp/enroll/start');
    expect(refused.body.error.code).toBe('REAUTH_REQUIRED');

    await client.post('/api/auth/reauth', { password: PASSWORD });
    const start = await client.post('/api/auth/totp/enroll/start');
    expect(start.status).toBe(200);
    const confirm = await client.post('/api/auth/totp/enroll/confirm', {
      code: codeNow(start.body.secret),
    });
    expect(confirm.body.stage).toBe('ACTIVE');
  });

  it('accepts a code only once even when two requests race with it', async () => {
    const secret = generateTotpSecret();
    await ctx.createUser({ username: 'manager.test', role: 'MANAGER', totpSecret: secret });
    const first = ctx.client();
    const second = ctx.client();
    await first.login('manager.test');
    await second.login('manager.test');

    // Load both sessions before either verifies, as two simultaneous requests would: both see
    // "no code used yet", so only the database-level check can stop the second one.
    const service = createAuthService({
      prisma: ctx.prisma,
      audit: createAuditService(ctx.prisma),
      clock: ctx.clock,
      secretBox: createSecretBox(ctx.config.TOTP_ENCRYPTION_KEY),
      config: ctx.config,
    });
    const sessions = await Promise.all(
      [first, second].map((client) => service.resolveSession(client.cookie)),
    );
    const code = codeNow(secret);
    const results = await Promise.allSettled(
      sessions.map((session) => service.verifySecondFactor(session, code, { id: null })),
    );
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(results.find((r) => r.status === 'rejected').reason.code).toBe('INVALID_CODE');
  });
});

describe('session protection', () => {
  it('requires the CSRF token for state-changing requests', async () => {
    await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();
    await client.login('agent.test');

    const withoutToken = await client.post('/api/auth/logout', {}, { csrf: false });
    expect(withoutToken.status).toBe(403);
    expect(withoutToken.body.error.code).toBe('CSRF_REJECTED');

    expect((await client.post('/api/auth/logout')).status).toBe(204);
    expect((await client.get('/api/auth/me')).body.authenticated).toBe(false);
    expect(await ctx.auditActions()).toContain('auth.logout');
  });

  it('ends a session after 30 minutes without activity', async () => {
    await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();
    await client.login('agent.test');

    ctx.clock.advance(29 * MINUTE);
    expect((await client.get('/api/auth/me')).body.authenticated).toBe(true);
    ctx.clock.advance(31 * MINUTE);
    expect((await client.get('/api/auth/me')).body.authenticated).toBe(false);

    const [session] = await ctx.prisma.session.findMany();
    expect(session.revokedReason).toBe('idle');
  });

  it('ends a session after 10 hours even with activity', async () => {
    await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();
    await client.login('agent.test');
    for (let i = 0; i < 29; i += 1) {
      ctx.clock.advance(20 * MINUTE);
      expect((await client.get('/api/auth/me')).body.authenticated).toBe(true);
    }
    ctx.clock.advance(21 * MINUTE);
    expect((await client.get('/api/auth/me')).body.authenticated).toBe(false);
  });

  it('cuts off a disabled user immediately', async () => {
    const user = await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();
    await client.login('agent.test');
    await ctx.prisma.user.update({ where: { id: user.id }, data: { active: false } });
    expect((await client.get('/api/auth/me')).body.authenticated).toBe(false);
  });

  it('ignores a forged or unknown session cookie', async () => {
    const client = ctx.client();
    client.cookie = 'A'.repeat(43);
    expect((await client.get('/api/auth/me')).body.authenticated).toBe(false);
  });
});

describe('authorisation', () => {
  it('denies a permission the role does not have, and audits it', async () => {
    await ctx.createUser({ username: 'agent.test' });
    const client = ctx.client();
    await client.login('agent.test');

    const res = await client.get('/api/system/status');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    const denied = await ctx.prisma.auditLog.findFirst({
      where: { action: 'security.access_denied' },
    });
    expect(denied.details).toMatchObject({ permission: 'system.health' });
  });

  it('requires a signed-in session', async () => {
    const res = await ctx.client().get('/api/system/status');
    expect(res.status).toBe(401);
  });
});

describe('two-factor authentication', () => {
  it('makes an administrator enrol before using the application', async () => {
    await ctx.createUser({ username: 'admin.test', role: 'ADMIN' });
    const client = ctx.client();

    const login = await client.login('admin.test');
    expect(login.body.stage).toBe('TOTP_ENROLL');
    expect((await client.get('/api/auth/me')).body.user.permissions).toEqual([]);
    expect((await client.get('/api/system/status')).body.error.code).toBe('STAGE_INCOMPLETE');

    const start = await client.post('/api/auth/totp/enroll/start');
    expect(start.status).toBe(200);
    expect(start.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    // The secret is stored encrypted, never in clear.
    const pending = await ctx.prisma.session.findFirst();
    expect(pending.pendingTotpSecret).not.toContain(start.body.secret);

    expect((await client.post('/api/auth/totp/enroll/confirm', { code: '000000' })).status).toBe(
      401,
    );
    const cookieBefore = client.cookie;
    const confirm = await client.post('/api/auth/totp/enroll/confirm', {
      code: codeNow(start.body.secret),
    });
    expect(confirm.body.stage).toBe('ACTIVE');
    expect(client.cookie).not.toBe(cookieBefore);

    const status = await client.get('/api/system/status');
    expect(status.status).toBe(200);
    expect(status.body.checks.database).toBe('ok');
    expect(await ctx.auditActions()).toContain('auth.totp.enrolled');
  });

  it('asks an enrolled user for a code, refuses wrong and replayed codes', async () => {
    const secret = generateTotpSecret();
    await ctx.createUser({ username: 'manager.test', role: 'MANAGER', totpSecret: secret });
    const client = ctx.client();

    expect((await client.login('manager.test')).body.stage).toBe('TOTP_VERIFY');
    expect((await client.post('/api/auth/totp/verify', { code: '123456' })).status).toBe(401);

    const code = codeNow(secret);
    expect((await client.post('/api/auth/totp/verify', { code })).body.stage).toBe('ACTIVE');
    expect((await client.get('/api/system/status')).status).toBe(200);

    // Same code again, in a second sign-in within the same 30 seconds: refused.
    const other = ctx.client();
    await other.login('manager.test');
    expect((await other.post('/api/auth/totp/verify', { code })).status).toBe(401);
  });

  it('rotates the session token when the second factor is passed', async () => {
    const secret = generateTotpSecret();
    await ctx.createUser({ username: 'manager.test', role: 'MANAGER', totpSecret: secret });
    const client = ctx.client();
    await client.login('manager.test');
    const pendingCookie = client.cookie;
    await client.post('/api/auth/totp/verify', { code: codeNow(secret) });

    const stale = ctx.client();
    stale.cookie = pendingCookie;
    expect((await stale.get('/api/auth/me')).body.authenticated).toBe(false);
  });
});

describe('password change', () => {
  it('forces a new password, checks the policy and signs out other sessions', async () => {
    await ctx.createUser({ username: 'agent.test', mustChangePassword: true });
    const first = ctx.client();
    const second = ctx.client();
    await second.login('agent.test');
    expect((await first.login('agent.test')).body.stage).toBe('PASSWORD_CHANGE');

    const weak = await first.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: 'azerty123456',
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error.details.problems).toContain('TOO_COMMON');

    const wrongCurrent = await first.post('/api/auth/password', {
      currentPassword: 'Pas-Le-Bon-Mot-De-Passe',
      newPassword: NEW_PASSWORD,
    });
    expect(wrongCurrent.status).toBe(401);

    const ok = await first.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(ok.body.stage).toBe('ACTIVE');
    expect((await second.get('/api/auth/me')).body.authenticated).toBe(false);
    expect((await ctx.client().login('agent.test', NEW_PASSWORD)).status).toBe(200);
  });

  it('checks the second factor before allowing a forced password change', async () => {
    const secret = generateTotpSecret();
    await ctx.createUser({
      username: 'admin.test',
      role: 'ADMIN',
      totpSecret: secret,
      mustChangePassword: true,
    });
    const client = ctx.client();
    expect((await client.login('admin.test')).body.stage).toBe('TOTP_VERIFY');
    const early = await client.post('/api/auth/password', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(early.body.error.code).toBe('STAGE_INCOMPLETE');

    const verified = await client.post('/api/auth/totp/verify', { code: codeNow(secret) });
    expect(verified.body.stage).toBe('PASSWORD_CHANGE');
  });
});

describe('re-authentication', () => {
  it('confirms identity with password and code, and refuses wrong credentials', async () => {
    const secret = generateTotpSecret();
    await ctx.createUser({ username: 'admin.test', role: 'ADMIN', totpSecret: secret });
    const client = ctx.client();
    await client.login('admin.test');
    await client.post('/api/auth/totp/verify', { code: codeNow(secret) });

    const bad = await client.post('/api/auth/reauth', { password: 'Faux-Mot-De-Passe-99' });
    expect(bad.status).toBe(401);

    ctx.clock.advance(31 * 1000); // next TOTP step: the previous code cannot be reused
    const ok = await client.post('/api/auth/reauth', { password: PASSWORD, code: codeNow(secret) });
    expect(ok.status).toBe(200);
    const session = await ctx.prisma.session.findFirst({ where: { revokedAt: null } });
    expect(session.reauthAt).not.toBeNull();
  });
});
