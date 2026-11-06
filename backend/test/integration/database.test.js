import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { SetupError, createAdministrator } from '../../src/modules/auth/setup.js';
import { createAuditService } from '../../src/services/audit.js';
import { createTestContext, PASSWORD } from './support.js';

const ctx = createTestContext();
const runtime = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

beforeEach(() => ctx.reset());
afterAll(async () => {
  await runtime.end();
  await ctx.close();
});

describe('runtime database role (least privilege)', () => {
  it('cannot change or delete audit records', async () => {
    await createAuditService(ctx.prisma).record({ action: 'test.event' });
    await expect(runtime.query(`UPDATE audit_log SET action = 'x'`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(runtime.query('DELETE FROM audit_log')).rejects.toThrow(/permission denied/);
  });

  it('cannot delete users, change roles or create tables', async () => {
    await expect(runtime.query('DELETE FROM app_user')).rejects.toThrow(/permission denied/);
    await expect(runtime.query(`UPDATE role SET "requiresTwoFactor" = false`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      runtime.query(`INSERT INTO role_permission VALUES (1, 'users.manage')`),
    ).rejects.toThrow(/permission denied/);
    await expect(runtime.query('CREATE TABLE intruder (id int)')).rejects.toThrow(
      /permission denied/,
    );
  });

  it('keeps the audit log append-only even for the table owner', async () => {
    await createAuditService(ctx.prisma).record({ action: 'test.event' });
    await expect(ctx.owner.query(`UPDATE audit_log SET action = 'x'`)).rejects.toThrow(
      /append-only/,
    );
    await expect(ctx.owner.query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
  });

  it('enforces username format and role permission codes in the database', async () => {
    await expect(
      ctx.owner.query(
        `INSERT INTO app_user (id, username, "displayName", "passwordHash", "roleId", "updatedAt")
         VALUES (gen_random_uuid(), 'Bad Name', 'x', 'x', 1, now())`,
      ),
    ).rejects.toThrow(/app_user_username_format/);
  });

  it('seeds the four roles with the approved permissions', async () => {
    const roles = await ctx.prisma.role.findMany({
      include: { permissions: true },
      orderBy: { code: 'asc' },
    });
    const summary = Object.fromEntries(
      roles.map((r) => [
        r.code,
        {
          twoFactor: r.requiresTwoFactor,
          permissions: r.permissions.map((p) => p.permission).sort(),
        },
      ]),
    );
    expect(summary).toEqual({
      ADMIN: {
        twoFactor: true,
        permissions: [
          'audit.read',
          'catalogue.manage',
          'catalogue.read',
          'contracts.read',
          'contracts.terminate',
          'contracts.write',
          'customers.archive',
          'customers.assign',
          'customers.identity',
          'customers.read',
          'customers.write',
          'documents.capture',
          'documents.download',
          'documents.read',
          'documents.remove',
          'documents.upload',
          'payments.read',
          'payments.record',
          'payments.reverse',
          'production.all',
          'production.read',
          'remittances.manage',
          'remittances.read',
          'renewals.assign',
          'renewals.read',
          'renewals.write',
          'reports.export',
          'reports.read',
          'scans.manage',
          'stock.manage',
          'stock.read',
          'system.health',
          'users.manage',
          'users.read',
          'vehicles.archive',
          'vehicles.read',
          'vehicles.write',
        ],
      },
      AGENT: {
        twoFactor: false,
        permissions: [
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
        ],
      },
      AUDITOR: {
        twoFactor: false,
        permissions: [
          'audit.read',
          'catalogue.read',
          'contracts.read',
          'customers.read',
          'documents.read',
          'payments.read',
          'production.all',
          'production.read',
          'remittances.read',
          'renewals.read',
          'reports.read',
          'stock.read',
          'vehicles.read',
        ],
      },
      MANAGER: {
        twoFactor: true,
        permissions: [
          'audit.read',
          'catalogue.manage',
          'catalogue.read',
          'contracts.read',
          'contracts.terminate',
          'contracts.write',
          'customers.archive',
          'customers.assign',
          'customers.identity',
          'customers.read',
          'customers.write',
          'documents.capture',
          'documents.download',
          'documents.read',
          'documents.remove',
          'documents.upload',
          'payments.read',
          'payments.record',
          'payments.reverse',
          'production.all',
          'production.read',
          'remittances.manage',
          'remittances.read',
          'renewals.assign',
          'renewals.read',
          'renewals.write',
          'reports.export',
          'reports.read',
          'scans.manage',
          'stock.manage',
          'stock.read',
          'system.health',
          'vehicles.archive',
          'vehicles.read',
          'vehicles.write',
        ],
      },
    });
  });
});

describe('first administrator setup', () => {
  const deps = () => ({ prisma: ctx.prisma, audit: createAuditService(ctx.prisma) });
  const input = { username: 'Directeur', displayName: 'Directeur agence', password: PASSWORD };

  it('creates the first administrator and audits it', async () => {
    const user = await createAdministrator(deps(), input);
    expect(user.username).toBe('directeur');
    const audit = await ctx.prisma.auditLog.findFirst({ where: { action: 'user.created' } });
    expect(audit.details).toEqual({ via: 'server_command', role: 'ADMIN', recovery: false });
  });

  it('refuses a second administrator unless in recovery mode', async () => {
    await createAdministrator(deps(), input);
    const second = { ...input, username: 'secours' };
    await expect(createAdministrator(deps(), second)).rejects.toMatchObject({
      code: 'ADMIN_EXISTS',
    });
    await expect(createAdministrator(deps(), second, { recovery: true })).resolves.toMatchObject({
      username: 'secours',
    });
  });

  it('refuses weak passwords and invalid usernames', async () => {
    await expect(
      createAdministrator(deps(), { ...input, password: 'azerty123456' }),
    ).rejects.toBeInstanceOf(SetupError);
    await expect(createAdministrator(deps(), { ...input, username: 'a b' })).rejects.toMatchObject({
      code: 'INVALID_USERNAME',
    });
  });
});
