import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { fileName } from '../../src/modules/documents/schemas.js';
import { createDocumentStore, matchesSignature } from '../../src/services/documentStore.js';

describe('file recognition', () => {
  const pdf = Buffer.from('%PDF-1.7\n');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it('recognises PDF, JPEG and PNG by their first bytes', () => {
    expect(matchesSignature(pdf, 'application/pdf')).toBe(true);
    expect(matchesSignature(jpeg, 'image/jpeg')).toBe(true);
    expect(matchesSignature(png, 'image/png')).toBe(true);
  });

  it('refuses a file whose content is not its announced type, or an unknown type', () => {
    expect(matchesSignature(pdf, 'image/png')).toBe(false);
    expect(matchesSignature(Buffer.from('<html>'), 'application/pdf')).toBe(false);
    expect(matchesSignature(pdf, 'text/html')).toBe(false);
    expect(matchesSignature(pdf, 'constructor')).toBe(false);
  });
});

describe('file name', () => {
  it('keeps the last part of the name, without control characters', () => {
    expect(fileName.parse(encodeURIComponent('C:\\Scans\\Quittance RMA.pdf'))).toBe(
      'Quittance RMA.pdf',
    );
    expect(fileName.parse(encodeURIComponent('../../etc/passwd'))).toBe('passwd');
    expect(fileName.parse(encodeURIComponent('note\u0000\u001f.pdf'))).toBe('note.pdf');
    expect(fileName.parse(encodeURIComponent('شهادة.pdf'))).toBe('شهادة.pdf');
  });

  it('refuses an empty, badly encoded or too long name', () => {
    for (const value of ['', encodeURIComponent('C:\\Scans\\'), '%E0%A4%A', 'a'.repeat(201)]) {
      expect(fileName.safeParse(value).success).toBe(false);
    }
  });
});

describe('document store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agency-store-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const store = createDocumentStore(dir);

  it('writes each file under a random name of the month, and reads it back', async () => {
    await store.ensureReady();
    const saved = await store.save(Buffer.from('%PDF-1.7\n'), new Date('2026-10-24T10:00:00Z'));
    expect(saved.storageKey).toMatch(/^2026\/10\/[0-9a-f-]{36}$/);
    expect(saved.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(join(dir, '2026', '10', saved.storageKey.split('/')[2]), 'utf8')).toBe(
      '%PDF-1.7\n',
    );
    const chunks = [];
    for await (const chunk of await store.open(saved.storageKey)) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('%PDF-1.7\n');
  });

  it('refuses a storage key it did not make', async () => {
    await expect(store.open('../../secret')).rejects.toThrow(/invalid storage key/);
    await expect(store.discard('2026/10/../../x')).rejects.toThrow(/invalid storage key/);
  });
});

describe('documents folder setting', () => {
  const valid = {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://agency:s3cret-value@127.0.0.1:55433/agency_dev',
    APP_ORIGIN: 'http://127.0.0.1:5173',
    TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
  };

  it('defaults to storage/documents, resolved to an absolute path', () => {
    const config = loadConfig(valid);
    expect(isAbsolute(config.DOCUMENTS_DIR)).toBe(true);
    expect(config.DOCUMENTS_DIR.replace(/\\/g, '/')).toMatch(/\/storage\/documents$/);
  });

  it('must be an absolute path in production', () => {
    const production = {
      ...valid,
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://agence.lan',
      TRUST_PROXY: '1',
    };
    expect(() => loadConfig({ ...production, DOCUMENTS_DIR: 'storage/documents' })).toThrow(
      /DOCUMENTS_DIR/,
    );
    expect(loadConfig({ ...production, DOCUMENTS_DIR: join(tmpdir(), 'docs') }).DOCUMENTS_DIR).toBe(
      join(tmpdir(), 'docs'),
    );
  });
});
