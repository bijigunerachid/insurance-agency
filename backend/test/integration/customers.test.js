import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateTotpSecret, timeStep, totpCode } from '../../src/modules/auth/totp.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
const runtime = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

beforeEach(() => ctx.reset());
afterAll(async () => {
  await runtime.end();
  await ctx.close();
});

const individual = (overrides = {}) => ({
  type: 'INDIVIDUAL',
  firstName: 'Karim',
  lastName: 'Alaoui',
  identityType: 'CIN',
  identityNumber: 'ab 123456',
  phone: '06 12 34 56 78',
  email: 'Karim.Alaoui@Example.ma',
  city: 'Casablanca',
  ...overrides,
});

async function signIn(username, role) {
  const secret = ['ADMIN', 'MANAGER'].includes(role) ? generateTotpSecret() : null;
  const user = await ctx.createUser({ username, role, totpSecret: secret });
  const client = ctx.client();
  await client.login(username);
  if (secret) {
    await client.post('/api/auth/totp/verify', {
      code: totpCode(secret, timeStep(ctx.clock.now())),
    });
  }
  return { client, user };
}

const auditFor = (action) =>
  ctx.prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

describe('creating customers', () => {
  it('normalises the data, numbers customers without gaps and assigns agents to their own', async () => {
    const { client, user } = await signIn('agent.a', 'AGENT');
    const res = await client.post('/api/customers', individual());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      ref: 'CLI-000001',
      displayName: 'Karim Alaoui',
      identityNumber: 'AB123456',
      phone: '+212612345678',
      email: 'karim.alaoui@example.ma',
      assignedUser: { id: user.id },
    });
    const second = await client.post('/api/customers', {
      type: 'BUSINESS',
      legalName: 'Transports Atlas SARL',
      ice: '001 234 567 000 089',
    });
    expect(second.body).toMatchObject({ ref: 'CLI-000002', ice: '001234567000089' });
  });

  it('gives unique, consecutive references when created at the same moment', async () => {
    const { client } = await signIn('manager.m', 'MANAGER');
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        client.post('/api/customers', {
          type: 'BUSINESS',
          legalName: `Société ${i}`,
        }),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(results.map((r) => r.body.ref).sort()).toEqual([
      'CLI-000001',
      'CLI-000002',
      'CLI-000003',
      'CLI-000004',
      'CLI-000005',
      'CLI-000006',
    ]);
  });

  it('explains invalid data field by field', async () => {
    const { client } = await signIn('agent.a', 'AGENT');
    const cases = [
      [{ lastName: '' }, 'lastName', 'REQUIRED'],
      [{ phone: '12345' }, 'phone', 'INVALID_PHONE'],
      [{ identityNumber: 'A1B2C3' }, 'identityNumber', 'INVALID_IDENTITY'],
      [{ identityType: null }, 'identityNumber', 'IDENTITY_INCOMPLETE'],
      [{ ice: '001234567000089' }, 'ice', 'NOT_FOR_INDIVIDUAL'],
    ];
    for (const [change, path, rule] of cases) {
      const res = await client.post('/api/customers', individual(change));
      expect(res.status, JSON.stringify(change)).toBe(400);
      expect(res.body.error.details).toContainEqual({ path, rule });
    }
    const business = await client.post('/api/customers', { type: 'BUSINESS', ice: '123' });
    expect(business.body.error.details.map((d) => d.path)).toEqual(
      expect.arrayContaining(['ice', 'legalName']),
    );
  });

  it('rejects fields the client does not own', async () => {
    const { client } = await signIn('agent.a', 'AGENT');
    for (const extra of [
      { ref: 'CLI-999999' },
      { createdById: crypto.randomUUID() },
      { archivedAt: null },
      { version: 1 },
    ]) {
      expect((await client.post('/api/customers', individual(extra))).status).toBe(400);
    }
  });

  it('lets only managers choose the responsible agent', async () => {
    const { client: agent } = await signIn('agent.a', 'AGENT');
    const { client: manager } = await signIn('manager.m', 'MANAGER');
    const other = await ctx.createUser({ username: 'agent.b' });

    const refused = await agent.post('/api/customers', individual({ assignedUserId: other.id }));
    expect(refused.status).toBe(403);

    const ok = await manager.post('/api/customers', individual({ assignedUserId: other.id }));
    expect(ok.body.assignedUser).toEqual({ id: other.id, displayName: 'Utilisateur agent.b' });

    const disabled = await ctx.createUser({ username: 'ancien', active: false });
    const invalid = await manager.post(
      '/api/customers',
      individual({ assignedUserId: disabled.id, identityNumber: 'CD1', phone: null }),
    );
    expect(invalid.body.error.code).toBe('INVALID_ASSIGNEE');
  });
});

describe('duplicates', () => {
  it('refuses a second customer with the same identity number, even when confirmed', async () => {
    const { client } = await signIn('agent.a', 'AGENT');
    await client.post('/api/customers', individual());
    const res = await client.post(
      '/api/customers',
      individual({ firstName: 'Autre', phone: null, confirmNotDuplicate: true }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_IDENTITY');
    expect(res.body.error.details.candidates[0]).toMatchObject({ ref: 'CLI-000001' });
  });

  it('warns about the same phone or the same name, and accepts an explicit confirmation', async () => {
    const { client } = await signIn('agent.a', 'AGENT');
    await client.post('/api/customers', individual());

    const samePhone = await client.post(
      '/api/customers',
      individual({ firstName: 'Salma', identityNumber: 'EF654321' }),
    );
    expect(samePhone.status).toBe(409);
    expect(samePhone.body.error.code).toBe('DUPLICATE_SUSPECTED');
    expect(samePhone.body.error.details.candidates).toEqual([
      expect.objectContaining({ ref: 'CLI-000001', matchedOn: 'phone' }),
    ]);

    // Accents and case do not hide a same-name customer.
    const sameName = await client.post(
      '/api/customers',
      individual({
        firstName: 'KARÎM',
        lastName: 'alaoui',
        identityNumber: 'EF654321',
        phone: null,
      }),
    );
    expect(sameName.body.error.details.candidates[0].matchedOn).toBe('name');

    const confirmed = await client.post(
      '/api/customers',
      individual({ firstName: 'Salma', identityNumber: 'EF654321', confirmNotDuplicate: true }),
    );
    expect(confirmed.status).toBe(201);
    const [, event] = await auditFor('customer.created');
    expect(event.details.duplicateWarningOverridden).toBe(true);
  });
});

describe('identity numbers', () => {
  async function customerOwnedBy(username) {
    const { client, user } = await signIn(username, 'AGENT');
    const res = await client.post('/api/customers', individual());
    return { owner: client, ownerUser: user, id: res.body.id };
  }

  it('are shown in full to the responsible agent and managers, masked to others', async () => {
    const { owner, id } = await customerOwnedBy('agent.a');
    const { client: other } = await signIn('agent.b', 'AGENT');
    const { client: manager } = await signIn('manager.m', 'MANAGER');
    const { client: auditor } = await signIn('auditeur.x', 'AUDITOR');

    expect((await owner.get(`/api/customers/${id}`)).body.identityNumber).toBe('AB123456');
    expect((await manager.get(`/api/customers/${id}`)).body.identityNumber).toBe('AB123456');
    for (const client of [other, auditor]) {
      const res = await client.get(`/api/customers/${id}`);
      expect(res.body).toMatchObject({ identityNumber: 'AB****56', identityMasked: true });
    }
  });

  it('can be revealed by another agent with a reason, which is audited', async () => {
    const { id } = await customerOwnedBy('agent.a');
    const { client: other } = await signIn('agent.b', 'AGENT');
    const { client: auditor } = await signIn('auditeur.x', 'AUDITOR');

    expect((await other.post(`/api/customers/${id}/reveal-identity`, { reason: 'x' })).status).toBe(
      400,
    );
    const res = await other.post(`/api/customers/${id}/reveal-identity`, {
      reason: 'Client au guichet pour un avenant',
    });
    expect(res.body).toEqual({ identityType: 'CIN', identityNumber: 'AB123456' });
    const [event] = await auditFor('customer.identity_revealed');
    expect(event.details).toEqual({ reason: 'Client au guichet pour un avenant' });

    expect(
      (await auditor.post(`/api/customers/${id}/reveal-identity`, { reason: 'Contrôle interne' }))
        .status,
    ).toBe(403);
  });

  it('cannot be changed by someone who may not see it', async () => {
    const { id } = await customerOwnedBy('agent.a');
    const { client: other } = await signIn('agent.b', 'AGENT');
    const res = await other.send('patch', `/api/customers/${id}`, {
      identityNumber: 'ZZ999999',
      identityType: 'CIN',
      version: 1,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('IDENTITY_HIDDEN');
  });

  it('never appear in list results', async () => {
    const { owner } = await customerOwnedBy('agent.a');
    const list = await owner.get('/api/customers');
    expect(list.body.items[0]).not.toHaveProperty('identityNumber');
    expect(JSON.stringify(list.body)).not.toContain('AB123456');
  });
});

describe('searching and reading', () => {
  it('finds customers by name without accents, by local phone format and by exact CIN', async () => {
    const { client } = await signIn('agent.a', 'AGENT');
    await client.post('/api/customers', individual({ lastName: 'Bennani-Smirès' }));
    await client.post('/api/customers', {
      type: 'BUSINESS',
      legalName: 'Hôtel Atlas',
      phone: '0522 11 22 33',
    });

    const names = async (q) =>
      (await client.get(`/api/customers?q=${encodeURIComponent(q)}`)).body.items.map(
        (c) => c.displayName,
      );
    expect(await names('smires')).toEqual(['Karim Bennani-Smirès']);
    expect(await names('HOTEL')).toEqual(['Hôtel Atlas']);
    expect(await names('0522112233')).toEqual(['Hôtel Atlas']);
    expect(await names('AB123456')).toEqual(['Karim Bennani-Smirès']);
    expect(await names('AB1234')).toEqual([]); // partial identity numbers find nothing
  });

  it('answers 404 for an unknown customer and 400 for a malformed id', async () => {
    const { client } = await signIn('agent.a', 'AGENT');
    expect((await client.get(`/api/customers/${crypto.randomUUID()}`)).status).toBe(404);
    expect((await client.get('/api/customers/1 OR 1=1')).status).toBe(400);
  });

  it('is open to auditors for reading only', async () => {
    const { client: agent } = await signIn('agent.a', 'AGENT');
    const created = await agent.post('/api/customers', individual());
    const { client: auditor } = await signIn('auditeur.x', 'AUDITOR');
    expect((await auditor.get(`/api/customers/${created.body.id}`)).status).toBe(200);
    expect(
      (await auditor.post('/api/customers', individual({ identityNumber: 'EF1' }))).status,
    ).toBe(403);
    expect(
      (
        await auditor.send('patch', `/api/customers/${created.body.id}`, {
          city: 'Rabat',
          version: 1,
        })
      ).status,
    ).toBe(403);
  });
});

describe('changing and archiving', () => {
  it('updates with a version check and audits field names, never values', async () => {
    const { client } = await signIn('agent.a', 'AGENT');
    const created = (await client.post('/api/customers', individual())).body;

    const ok = await client.send('patch', `/api/customers/${created.id}`, {
      phone: '0700000001',
      city: 'Rabat',
      version: created.version,
    });
    expect(ok.body).toMatchObject({ phone: '+212700000001', city: 'Rabat', version: 2 });
    const stale = await client.send('patch', `/api/customers/${created.id}`, {
      city: 'Fès',
      version: created.version,
    });
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');

    const [event] = await auditFor('customer.updated');
    expect(event.details.fields.sort()).toEqual(['city', 'phone']);
    expect(JSON.stringify(event.details)).not.toContain('Rabat');
    expect(JSON.stringify(event.details)).not.toContain('700000001');
  });

  it('archives with a reason (managers only), blocks edits, and restores', async () => {
    const { client: agent } = await signIn('agent.a', 'AGENT');
    const created = (await agent.post('/api/customers', individual())).body;
    const { client: manager } = await signIn('manager.m', 'MANAGER');

    expect(
      (await agent.post(`/api/customers/${created.id}/archive`, { reason: 'Doublon', version: 1 }))
        .status,
    ).toBe(403);
    const archived = await manager.post(`/api/customers/${created.id}/archive`, {
      reason: 'Client parti',
      version: 1,
    });
    expect(archived.body).toMatchObject({ archiveReason: 'Client parti', version: 2 });
    expect((await agent.get('/api/customers')).body.total).toBe(0);
    expect((await agent.get('/api/customers?archived=only')).body.total).toBe(1);

    const blocked = await agent.send('patch', `/api/customers/${created.id}`, {
      city: 'Rabat',
      version: 2,
    });
    expect(blocked.body.error.code).toBe('ARCHIVED');

    const restored = await manager.post(`/api/customers/${created.id}/restore`, { version: 2 });
    expect(restored.body.archivedAt).toBeNull();
  });
});

describe('database protections', () => {
  it('the application cannot delete customers', async () => {
    const { client } = await signIn('agent.a', 'AGENT');
    await client.post('/api/customers', individual());
    await expect(runtime.query('DELETE FROM customer')).rejects.toThrow(/permission denied/);
  });

  it('constraints refuse inconsistent rows even outside the application', async () => {
    const user = await ctx.createUser({ username: 'agent.a' });
    const insert = (columns) =>
      ctx.owner.query(
        `INSERT INTO customer (id, ref, type, "searchText", "createdById", "updatedAt", ${Object.keys(
          columns,
        )
          .map((c) => `"${c}"`)
          .join(', ')})
         VALUES (gen_random_uuid(), 'CLI-000777', $1, 'x', $2, now(), ${Object.keys(columns)
           .map((_, i) => `$${i + 3}`)
           .join(', ')})`,
        [
          columns.type ?? 'INDIVIDUAL',
          user.id,
          ...Object.values(columns).slice(columns.type ? 1 : 0),
        ],
      );
    await expect(insert({ firstName: 'A', lastName: 'B', legalName: 'Société' })).rejects.toThrow(
      /customer_type_fields/,
    );
    await expect(insert({ firstName: 'A', lastName: 'B', phone: '0612' })).rejects.toThrow(
      /customer_phone_format/,
    );
    await expect(insert({ firstName: 'A', lastName: 'B', archiveReason: 'x' })).rejects.toThrow(
      /customer_archive_fields/,
    );
  });
});
