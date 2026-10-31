import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { ConfigError } from '../../src/config/env.js';
import { memoryLogger, testConfig } from '../helpers.js';

// A synthetic image: the PNG signature then a few bytes (only the first bytes are checked).
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const dir = mkdtempSync(join(tmpdir(), 'agency-brand-'));
const file = (name, bytes) => {
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return path;
};
const app = (overrides) =>
  createApp({ config: testConfig(overrides), logger: memoryLogger().logger, prisma: {} });

describe('agency settings', () => {
  it('checks the ICE, the e-mail and the images at startup, naming the setting only', () => {
    expect(() => testConfig({ AGENCY_ICE: '12345' })).toThrow(/AGENCY_ICE/);
    expect(() => testConfig({ AGENCY_EMAIL: 'pas-un-courriel' })).toThrow(/AGENCY_EMAIL/);
    expect(() => testConfig({ AGENCY_LOGO_FILE: join(dir, 'absent.png') })).toThrow(
      /AGENCY_LOGO_FILE: file not found/,
    );
    // Named .png, but a script inside: refused by its content.
    const fake = file('fake.png', Buffer.from('<svg onload="alert(1)"/>'));
    expect(() => testConfig({ AGENCY_ICON_FILE: fake })).toThrow(
      /AGENCY_ICON_FILE: must be a PNG or JPEG image/,
    );
    const big = file('big.png', Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]));
    expect(() => testConfig({ AGENCY_LOGO_FILE: big })).toThrow(/larger than 1 MB/);
    let error;
    try {
      testConfig({ AGENCY_LOGO_FILE: fake });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).not.toContain('onload');

    const config = testConfig({ AGENCY_ICE: '000000000000042', AGENCY_EMAIL: 'agence@exemple.ma' });
    expect(config.AGENCY_ICE).toBe('000000000000042');
    expect(config.AGENCY_LOGO).toBeNull();
  });
});

describe('agency brand, before sign-in', () => {
  it('gives the name, the tagline and the logo, never the identifiers', async () => {
    const server = app({
      AGENCY_NAME: 'Agence Essai',
      AGENCY_TAGLINE: 'Agent général',
      AGENCY_ICE: '000000000000042',
      AGENCY_LOGO_FILE: file('logo.png', PNG),
    });
    const brand = await request(server).get('/api/agency/brand');
    expect(brand.status).toBe(200);
    expect(brand.body).toEqual({
      name: 'Agence Essai',
      tagline: 'Agent général',
      logo: true,
      icon: false,
    });

    const logo = await request(server).get('/api/agency/logo');
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(logo.headers['x-content-type-options']).toBe('nosniff');
    expect(logo.headers['cache-control']).toBe('public, max-age=3600');
    expect(Buffer.compare(logo.body, PNG)).toBe(0);
    expect((await request(server).get('/api/agency/icon')).status).toBe(404);
  });

  it('says nothing is set on a new installation', async () => {
    const server = app();
    expect((await request(server).get('/api/agency/brand')).body).toEqual({
      name: null,
      tagline: null,
      logo: false,
      icon: false,
    });
    expect((await request(server).get('/api/agency/logo')).status).toBe(404);
  });
});
