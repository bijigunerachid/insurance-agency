import { readdirSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { contractFixtures } from './fixtures.js';
import { createTestContext } from './support.js';

const ctx = createTestContext();
const runtime = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

beforeEach(() => ctx.reset());
afterAll(async () => {
  await runtime.end();
  await ctx.close();
});

const { signIn, prepareCatalogue, customerWithVehicles, contractBody } = contractFixtures(ctx);

/** Synthetic files: only their first bytes matter to the server. */
const pdf = (text = 'attestation') => Buffer.from(`%PDF-1.7\n% ${text}\n%%EOF\n`);
const png = () => Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
/** Files written to the test's documents folder, all months included. */
const filesOnDisk = () =>
  readdirSync(ctx.config.DOCUMENTS_DIR, { recursive: true, withFileTypes: true }).filter((e) =>
    e.isFile(),
  ).length;

async function setup() {
  const manager = await signIn('manager.a', 'MANAGER');
  const products = await prepareCatalogue(manager);
  const agent = await signIn('agent.a', 'AGENT');
  const { customer, car } = await customerWithVehicles(agent);
  const contract = (
    await agent.post('/api/contracts', contractBody(customer, products.RMA, [car.id]))
  ).body;
  const path = `/api/contracts/${contract.id}/documents`;
  return { manager, agent, contract, path };
}

describe('documents of the insurers attached to a contract', () => {
  it('keeps a scan, lists it and gives back the same file, audited', async () => {
    const { agent, contract, path } = await setup();
    const file = pdf();

    const created = await agent.upload(`${path}?type=ATTESTATION`, file, {
      name: 'C:\\Scans\\Attestation 14 P – Sara.pdf',
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      contractId: contract.id,
      type: 'ATTESTATION',
      // Only the name is kept, never the folder of the employee's computer.
      originalName: 'Attestation 14 P – Sara.pdf',
      mimeType: 'application/pdf',
      size: file.length,
      uploadedBy: { displayName: 'Utilisateur agent.a' },
      replaces: null,
      replacedBy: null,
      removal: null,
    });
    expect(filesOnDisk()).toBe(1);
    expect((await agent.get(path)).body.items.map((d) => d.id)).toEqual([created.body.id]);

    const opened = await agent.getFile(`/api/documents/${created.body.id}/file`);
    expect(opened.status).toBe(200);
    expect(opened.headers['content-type']).toBe('application/pdf');
    expect(opened.headers['content-disposition']).toBe(
      `inline; filename*=UTF-8''${encodeURIComponent('Attestation 14 P – Sara.pdf')}`,
    );
    expect(opened.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(opened.body, file)).toBe(0);
    expect(await ctx.auditActions()).toEqual(
      expect.arrayContaining(['document.uploaded', 'document.opened']),
    );

    // An auditor sees that the document exists, but neither opens nor adds one.
    const auditor = await signIn('auditeur', 'AUDITOR');
    expect((await auditor.get(path)).body.items).toHaveLength(1);
    expect((await auditor.get(`/api/documents/${created.body.id}/file`)).status).toBe(403);
    expect((await auditor.upload(`${path}?type=QUITTANCE`, pdf('autre'))).status).toBe(403);
  });

  it('accepts only PDF, JPEG and PNG files of 10 MB at most, checked by their content', async () => {
    const { agent, path } = await setup();
    const upload = (buffer, options, type = 'ATTESTATION') =>
      agent.upload(`${path}?type=${type}`, buffer, options);

    // A PDF announced as a picture, a text file, an empty file, a file over 10 MB.
    expect((await upload(pdf(), { type: 'image/png' })).body.error.code).toBe('UNSUPPORTED_FILE');
    expect((await upload(Buffer.from('bonjour'), { type: 'text/plain' })).body.error.code).toBe(
      'UNSUPPORTED_FILE',
    );
    expect((await upload(Buffer.alloc(0))).body.error.code).toBe('EMPTY_FILE');
    const big = Buffer.concat([pdf(), Buffer.alloc(10 * 1024 * 1024)]);
    expect((await upload(big)).status).toBe(413);
    // An unknown document type, a name that is not a name.
    expect((await upload(pdf(), {}, 'FACTURE')).status).toBe(400);
    expect((await upload(pdf(), { encodedName: '%E0%A4%A' })).body.error.details).toEqual([
      { path: '', rule: 'INVALID_FILE_NAME' },
    ]);
    expect(filesOnDisk()).toBe(0);

    expect(
      (await upload(png(), { type: 'image/png', name: 'quittance.png' }, 'QUITTANCE')).status,
    ).toBe(201);
    // The same file again on the same contract is refused, and nothing stays on disk.
    const again = await upload(png(), { type: 'image/png', name: 'copie.png' }, 'QUITTANCE');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('DUPLICATE_DOCUMENT');
    expect(filesOnDisk()).toBe(1);

    const unknown = await agent.upload(
      '/api/contracts/00000000-0000-4000-8000-000000000000/documents?type=ATTESTATION',
      pdf(),
    );
    expect(unknown.status).toBe(404);
    expect(filesOnDisk()).toBe(1);
  });

  it('replaces a scan by a clearer one of the same type, once', async () => {
    const { agent, path } = await setup();
    const first = (await agent.upload(`${path}?type=CONDITIONS_PARTICULIERES`, pdf('flou'))).body;
    const clearer = await agent.upload(
      `${path}?type=CONDITIONS_PARTICULIERES&replacesId=${first.id}`,
      pdf('net'),
    );
    expect(clearer.status).toBe(201);
    expect(clearer.body.replaces).toEqual({ id: first.id, originalName: 'scan.pdf' });
    const listed = (await agent.get(path)).body.items;
    expect(listed.find((d) => d.id === first.id).replacedBy.id).toBe(clearer.body.id);

    const twice = await agent.upload(
      `${path}?type=CONDITIONS_PARTICULIERES&replacesId=${first.id}`,
      pdf('encore'),
    );
    expect(twice.body.error.code).toBe('CANNOT_REPLACE');
    const otherType = await agent.upload(
      `${path}?type=QUITTANCE&replacesId=${clearer.body.id}`,
      pdf('quittance'),
    );
    expect(otherType.body.error.code).toBe('CANNOT_REPLACE');
    expect(filesOnDisk()).toBe(2);
  });

  it('lets management remove a document with a reason; it can no longer be opened', async () => {
    const { manager, agent, path } = await setup();
    const document = (await agent.upload(`${path}?type=NOTE_DE_COUVERTURE`, pdf())).body;
    const remove = (client, body) => client.post(`/api/documents/${document.id}/remove`, body);

    expect((await remove(agent, { reason: 'Mauvais contrat' })).status).toBe(403);
    expect((await remove(manager, { reason: '' })).status).toBe(400);
    const removed = (await remove(manager, { reason: 'Joint au mauvais contrat' })).body;
    expect(removed.removal).toMatchObject({
      reason: 'Joint au mauvais contrat',
      by: { displayName: 'Utilisateur manager.a' },
    });
    expect((await remove(manager, { reason: 'Encore une fois' })).body.error.code).toBe(
      'ALREADY_REMOVED',
    );
    expect((await agent.get(`/api/documents/${document.id}/file`)).status).toBe(410);
    // The file is kept, and the same scan can be attached again.
    expect(filesOnDisk()).toBe(1);
    expect((await agent.upload(`${path}?type=NOTE_DE_COUVERTURE`, pdf())).status).toBe(201);
    expect(await ctx.auditActions()).toContain('document.removed');
  });

  it('attaches the same file once when it is sent twice at the same moment', async () => {
    const { agent, path } = await setup();
    const results = await Promise.all([
      agent.upload(`${path}?type=ATTESTATION`, pdf()),
      agent.upload(`${path}?type=ATTESTATION`, pdf()),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(filesOnDisk()).toBe(1);
  });

  it('never changes or deletes a document row', async () => {
    const { agent, path } = await setup();
    await agent.upload(`${path}?type=ATTESTATION`, pdf());

    await expect(runtime.query(`UPDATE "document" SET "originalName" = 'x.pdf'`)).rejects.toThrow(
      /permission denied/,
    );
    await expect(runtime.query('DELETE FROM "document"')).rejects.toThrow(/permission denied/);
    await expect(ctx.owner.query(`UPDATE "document" SET "originalName" = 'x.pdf'`)).rejects.toThrow(
      /only removed, once/,
    );
    await expect(ctx.owner.query('DELETE FROM "document"')).rejects.toThrow(/never deleted/);
    await expect(
      ctx.owner.query(`UPDATE "document" SET "removedAt" = now(), "removeReason" = 'Test'`),
    ).rejects.toThrow(/document_removal/);
  });
});
